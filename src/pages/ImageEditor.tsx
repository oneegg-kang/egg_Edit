import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Arrow, Ellipse, Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import { useVault } from '../data/VaultProvider'
import type { Item } from '../data/types'
import {
  arrangePhotos,
  canvasPaths,
  cropCanvas,
  cropPhoto,
  fitCanvasToContent,
  layoutPhotos,
  resizeCanvas,
  flipCanvas,
  imageContent,
  photoCanvas,
  renderPath,
  rotateCanvas,
  type CanvasDoc,
  type Shape,
} from '../data/images'
import { deleteItems } from '../data/vault'
import { docImagePath, isImageFile } from '../editor/images'
import { TEXT_COLORS } from '../editor/extensions'
import { cachedFileUrl } from '../lib/useFileUrl'
import { naturalSize } from '../lib/naturalSize'
import { href } from '../lib/useHashRoute'
import { useShell } from './AppShell'
import { safeFileName } from '../backup/backup'
import { TakePhotoButton } from './CameraCapture'
import { CanvasMenu, CropDialog, PhotoPanel, PhotoStrip } from '../editor/PhotoTools'
import { saveFile } from '../lib/platform'

type Tool = 'select' | 'pen' | 'marker' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'crop'

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'select', icon: '↖', label: '고르기·옮기기' },
  { id: 'pen', icon: '✏️', label: '펜' },
  { id: 'marker', icon: '🖍', label: '형광펜' },
  { id: 'eraser', icon: '🧽', label: '지우개' },
  { id: 'line', icon: '╱', label: '직선' },
  { id: 'arrow', icon: '➚', label: '화살표' },
  { id: 'rect', icon: '▢', label: '네모' },
  { id: 'ellipse', icon: '◯', label: '동그라미' },
  { id: 'text', icon: 'T', label: '글자' },
  { id: 'crop', icon: '⛶', label: '캔버스 자르기' },
]

const COLORS = ['#ffffff', ...TEXT_COLORS.map((c) => c.value)]
const WIDTHS = [2, 4, 8, 16, 32]
const SAVE_DELAY_MS = 2000
const MAX_HISTORY = 100

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
const SAVE_LABEL: Record<SaveState, string> = { saved: '저장됨', dirty: '수정 중…', saving: '저장 중…', error: '저장 실패 (다시 시도 중)' }

const uid = () => Math.random().toString(36).slice(2, 10)

/** 사진을 처음 열 때 캔버스를 만들어 준다 */
export function ImageEditorPage({ id }: { id: string }) {
  const { items, loading, backend } = useVault()
  const item = items.find((i) => i.id === id)
  const [initial, setInitial] = useState<CanvasDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!item) return
    const c = imageContent(item)
    if (c.canvas) return setInitial(c.canvas)
    if (!item.storage_path) return setError('그림 정보가 없어요.')
    // 올린 사진: 사진 크기에 맞춘 캔버스
    cachedFileUrl(backend, item.storage_path)
      .then(
        (url) =>
          new Promise<CanvasDoc>((resolve, reject) => {
            const img = new window.Image()
            img.onload = () => resolve(photoCanvas(item.storage_path!, img.naturalWidth, img.naturalHeight))
            img.onerror = () => reject(new Error('사진을 불러올 수 없어요.'))
            img.src = url
          }),
      )
      .then(setInitial)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id])

  if (!item || error || !initial) {
    return (
      <section className="card">
        <p className="muted">{error ?? (loading || item ? '불러오는 중…' : '이미지를 찾을 수 없습니다. 다른 기기에서 삭제되었을 수 있어요.')}</p>
        <a href={href('images')}>이미지 목록으로</a>
      </section>
    )
  }
  return <ImageEditor key={item.id} item={item} initial={initial} />
}

function ImageEditor({ item, initial }: { item: Item; initial: CanvasDoc }) {
  const { backend, userId, reload } = useVault()
  const { toggleSidebar, sidebarOpen } = useShell()

  // ── 문서 상태 + 되돌리기 ──
  const [doc, setDoc] = useState<CanvasDoc>(initial)
  const history = useRef<CanvasDoc[]>([initial])
  const histIndex = useRef(0)
  const [, forceRender] = useState(0)
  const docRef = useRef(doc)
  docRef.current = doc

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#1f1f1f')
  const [width, setWidth] = useState(4)
  const [filled, setFilled] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<Shape | null>(null)
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [title, setTitle] = useState(item.title)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [zoom, setZoom] = useState(1)
  const [fitZoom, setFitZoom] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [cropping, setCropping] = useState<Shape | null>(null) // 사진 자르기 창

  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const uiLayerRef = useRef<Konva.Layer>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const pendingImages = useRef(new Set<string>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dirty = useRef(false)
  const titleRef = useRef(item.title)
  const itemRef = useRef(item)
  itemRef.current = item

  const selected = doc.shapes.find((s) => s.id === selectedId) ?? null

  // ── 저장: 편집 정보(JSON) + 완성 그림 파일 ──
  const save = useCallback(async () => {
    clearTimeout(saveTimer.current)
    if (!dirty.current) return
    if (pendingImages.current.size) {
      saveTimer.current = setTimeout(save, 500) // 사진을 다 불러온 뒤에
      return
    }
    dirty.current = false
    setSaveState('saving')
    const current = docRef.current
    const it = itemRef.current
    try {
      const stage = stageRef.current
      let rendered: { path: string; blob: Blob; mime: string } | null = null
      if (stage) {
        const hasPhoto = current.shapes.some((s) => s.type === 'image')
        const mime = hasPhoto && current.background !== 'transparent' ? 'image/jpeg' : 'image/png'
        try {
          uiLayerRef.current?.hide()
          const blob = (await stage.toBlob({ pixelRatio: 1 / stage.scaleX(), mimeType: mime, quality: 0.9 })) as Blob | null
          if (blob) rendered = { path: renderPath(userId, it.id, mime === 'image/png' ? 'png' : 'jpg'), blob, mime }
        } catch {
          // 브라우저가 그림 파일 만들기를 막아도(다른 곳의 사진 권한 문제) 편집 정보는 저장한다
          setNotice('완성 그림 파일을 만들지 못했어요. 편집 내용은 저장되었어요.')
        } finally {
          uiLayerRef.current?.show()
        }
      }
      const prev = it.storage_path
      if (rendered) await backend.uploadFile(rendered.path, rendered.blob, rendered.mime)
      // 원본 사진과 캔버스가 쓰는 파일은 모두 남겨 두고, 지난 렌더링 파일만 지운다
      const keep = new Set([...(imageContent(it).attachments ?? []), ...canvasPaths(current)])
      if (prev && !prev.includes('/render-')) keep.add(prev)
      if (rendered) keep.delete(rendered.path)
      const saved = await backend.updateItem(it.id, {
        title: titleRef.current.trim() || '제목 없음',
        ...(rendered ? { storage_path: rendered.path, mime_type: rendered.mime, size_bytes: rendered.blob.size } : {}),
        content: { ...it.content, canvas: current, width: current.width, height: current.height, attachments: [...keep] },
      })
      itemRef.current = saved
      if (rendered && prev && prev.includes('/render-') && prev !== rendered.path) backend.deleteFiles([prev]).catch(() => {})
      setSaveState(dirty.current ? 'dirty' : 'saved')
    } catch (e) {
      uiLayerRef.current?.show()
      dirty.current = true
      setSaveState('error')
      setNotice(`저장 실패: ${e instanceof Error ? e.message : String(e)}`)
      saveTimer.current = setTimeout(save, 5000)
    }
  }, [backend, userId])

  const scheduleSave = useCallback(() => {
    dirty.current = true
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, SAVE_DELAY_MS)
  }, [save])

  // 화면을 떠날 때 저장
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        save()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (dirty.current) save()
    }
  }, [save])

  const commit = useCallback(
    (next: CanvasDoc) => {
      history.current = [...history.current.slice(0, histIndex.current + 1), next].slice(-MAX_HISTORY)
      histIndex.current = history.current.length - 1
      setDoc(next)
      scheduleSave()
    },
    [scheduleSave],
  )
  const updateShape = (id: string, patch: Partial<Shape>) =>
    commit({ ...docRef.current, shapes: docRef.current.shapes.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

  const undo = useCallback(() => {
    if (histIndex.current === 0) return
    histIndex.current--
    setDoc(history.current[histIndex.current])
    setSelectedId(null)
    scheduleSave()
    forceRender((n) => n + 1)
  }, [scheduleSave])
  const redo = useCallback(() => {
    if (histIndex.current >= history.current.length - 1) return
    histIndex.current++
    setDoc(history.current[histIndex.current])
    scheduleSave()
    forceRender((n) => n + 1)
  }, [scheduleSave])
  const removeSelected = useCallback(() => {
    if (!selectedId) return
    commit({ ...docRef.current, shapes: docRef.current.shapes.filter((s) => s.id !== selectedId) })
    setSelectedId(null)
  }, [selectedId, commit])

  // 단축키: Ctrl+Z 되돌리기, Ctrl+Shift+Z / Ctrl+Y 다시, Delete 지우기, Esc 고르기 해제
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        removeSelected()
      } else if (e.key === 'Escape') {
        setSelectedId(null)
        setCrop(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, removeSelected])

  // ── 화면 크기에 맞추기 ──
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const fit = () => {
      const z = Math.min((el.clientWidth - 32) / doc.width, (el.clientHeight - 32) / doc.height, 1)
      setFitZoom(Math.max(0.05, z))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [doc.width, doc.height])
  useEffect(() => setZoom(fitZoom), [fitZoom])

  // 도구를 바꾸면 '누를 수 있는 도형' 이 바뀌므로 바로 다시 그린다 (안 그러면 첫 클릭이 안 먹힘)
  useEffect(() => {
    stageRef.current?.getLayers().forEach((l) => l.draw())
  }, [tool])

  // 고른 도형에 변형 손잡이 붙이기
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const node = selectedId && tool === 'select' ? stage.findOne('#' + selectedId) : null
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, tool, doc])

  // ── 그리기 ──
  const pos = () => stageRef.current!.getRelativePointerPosition()!

  const onDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const p = pos()
    if (tool === 'select') {
      if (e.target === e.target.getStage() || e.target.name() === 'background') setSelectedId(null)
      return
    }
    if (tool === 'text') {
      const text = prompt('넣을 글자')
      if (text?.trim()) {
        const shape: Shape = { id: uid(), type: 'text', x: p.x, y: p.y, text: text.trim(), fontSize: Math.max(16, width * 6), stroke: color }
        commit({ ...docRef.current, shapes: [...docRef.current.shapes, shape] })
      }
      return
    }
    start.current = p
    if (tool === 'crop') return setCrop({ x: p.x, y: p.y, width: 0, height: 0 })
    const base = { id: uid(), x: 0, y: 0, stroke: color, strokeWidth: width }
    if (tool === 'pen' || tool === 'eraser') setDrawing({ ...base, type: tool, points: [p.x, p.y, p.x + 0.01, p.y] })
    else if (tool === 'marker') setDrawing({ ...base, type: 'marker', strokeWidth: width * 3, opacity: 0.4, points: [p.x, p.y, p.x + 0.01, p.y] })
    else if (tool === 'line' || tool === 'arrow') setDrawing({ ...base, type: tool, points: [p.x, p.y, p.x, p.y] })
    else if (tool === 'rect') setDrawing({ ...base, type: 'rect', x: p.x, y: p.y, width: 0, height: 0, fill: filled ? color : null })
    else if (tool === 'ellipse') setDrawing({ ...base, type: 'ellipse', x: p.x, y: p.y, width: 0, height: 0, fill: filled ? color : null })
  }

  const onMove = () => {
    const s = start.current
    if (!s) return
    const p = pos()
    if (tool === 'crop') return setCrop({ x: s.x, y: s.y, width: p.x - s.x, height: p.y - s.y })
    if (!drawing) return
    if (drawing.type === 'pen' || drawing.type === 'marker' || drawing.type === 'eraser') {
      setDrawing({ ...drawing, points: [...drawing.points!, p.x, p.y] })
    } else if (drawing.type === 'line' || drawing.type === 'arrow') {
      setDrawing({ ...drawing, points: [s.x, s.y, p.x, p.y] })
    } else if (drawing.type === 'rect') {
      setDrawing({ ...drawing, x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) })
    } else if (drawing.type === 'ellipse') {
      // 동그라미는 가운데 기준으로 저장
      setDrawing({ ...drawing, x: (s.x + p.x) / 2, y: (s.y + p.y) / 2, width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) })
    }
  }

  const onUp = () => {
    start.current = null
    if (tool === 'crop') return
    if (!drawing) return
    const tooSmall =
      (drawing.type === 'rect' || drawing.type === 'ellipse') && (drawing.width! < 3 || drawing.height! < 3)
        ? true
        : (drawing.type === 'line' || drawing.type === 'arrow') &&
          Math.hypot(drawing.points![2] - drawing.points![0], drawing.points![3] - drawing.points![1]) < 3
    if (!tooSmall) commit({ ...docRef.current, shapes: [...docRef.current.shapes, drawing] })
    setDrawing(null)
  }

  const applyCrop = () => {
    if (!crop) return
    const next = cropCanvas(docRef.current, crop)
    setCrop(null)
    if (next !== docRef.current) commit(next)
    setTool('select')
  }

  // ── 사진 넣기 (여러 장이면 캔버스 안에 나란히) ──
  async function insertPhotos(files: File[]) {
    const pics = files.filter(isImageFile)
    if (!pics.length) return
    const added: Shape[] = []
    const failed: string[] = []
    for (const [n, file] of pics.entries()) {
      try {
        setNotice(`사진 올리는 중 (${n + 1}/${pics.length}) ${file.name}`)
        const size = await naturalSize(file)
        const path = docImagePath(userId, item.id, file)
        await backend.uploadFile(path, file, file.type || 'image/png')
        added.push({ id: uid(), type: 'image', x: 0, y: 0, width: size.width, height: size.height, naturalWidth: size.width, naturalHeight: size.height, storagePath: path })
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (added.length) {
      const d = docRef.current
      let placed: Shape[]
      if (added.length === 1) {
        // 한 장: 캔버스의 80% 안에 들어가게, 가운데
        const p = added[0]
        const k = Math.min(1, (d.width * 0.8) / p.width!, (d.height * 0.8) / p.height!)
        const w = p.width! * k
        const h = p.height! * k
        placed = [{ ...p, width: w, height: h, x: (d.width - w) / 2, y: (d.height - h) / 2 }]
      } else {
        // 여러 장: 캔버스 폭에 맞춰 격자로, 높이가 넘치면 전체를 줄여서 가운데
        const l = layoutPhotos(added.map((p) => ({ width: p.width!, height: p.height! })), { canvasWidth: d.width })
        const k = Math.min(1, d.height / l.height)
        const offY = (d.height - l.height * k) / 2
        const offX = (d.width - l.width * k) / 2
        placed = added.map((p, i) => {
          const bx = l.boxes[i]
          return { ...p, x: offX + bx.x * k, y: offY + bx.y * k, width: bx.width * k, height: bx.height * k }
        })
      }
      commit({ ...d, shapes: [...d.shapes, ...placed] })
      setTool('select')
      setSelectedId(placed[placed.length - 1].id)
    }
    setNotice(failed.length ? `사진 ${failed.length}장 넣기 실패\n${failed.join('\n')}` : added.length > 1 ? `사진 ${added.length}장을 나란히 넣었어요. 사진을 눌러 크기·각도를 바꿔 보세요.` : null)
  }

  // 사진 편집 막대: 끄는 중에는 화면만, 놓으면 확정
  const previewShape = (next: Shape) => setDoc((d) => ({ ...d, shapes: d.shapes.map((s) => (s.id === next.id ? next : s)) }))
  const commitShape = (next: Shape) => commit({ ...docRef.current, shapes: docRef.current.shapes.map((s) => (s.id === next.id ? next : s)) })

  // 고른 도형에 색/굵기 바로 적용
  const pickColor = (c: string) => {
    setColor(c)
    if (!selected) return
    if (selected.type === 'text') updateShape(selected.id, { stroke: c })
    else if (selected.type !== 'image' && selected.type !== 'eraser') updateShape(selected.id, { stroke: c, ...(selected.fill ? { fill: c } : {}) })
  }
  const pickWidth = (w: number) => {
    setWidth(w)
    if (!selected || selected.type === 'image') return
    if (selected.type === 'text') updateShape(selected.id, { fontSize: Math.max(16, w * 6) })
    else updateShape(selected.id, { strokeWidth: selected.type === 'marker' ? w * 3 : w })
  }
  const reorder = (dir: 'front' | 'back') => {
    if (!selected) return
    const rest = docRef.current.shapes.filter((s) => s.id !== selected.id)
    commit({ ...docRef.current, shapes: dir === 'front' ? [...rest, selected] : [selected, ...rest] })
  }

  async function remove() {
    setMenuOpen(false)
    if (!confirm(`'${title}' 을(를) 삭제할까요? 원본 사진과 편집한 그림이 모두 지워집니다.`)) return
    dirty.current = false
    clearTimeout(saveTimer.current)
    await deleteItems(backend, [itemRef.current])
    window.location.hash = href('images')
    reload()
  }

  async function download() {
    setMenuOpen(false)
    const stage = stageRef.current
    if (!stage) return
    uiLayerRef.current?.hide()
    try {
      const blob = (await stage.toBlob({ pixelRatio: 1 / stage.scaleX(), mimeType: 'image/png' })) as Blob
      const r = await saveFile(blob, `${safeFileName(title || '그림')}.png`)
      if (r && r !== 'cancelled') setNotice(r)
    } catch (e) {
      setNotice(`내려받기 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      uiLayerRef.current?.show()
    }
  }

  const photos = doc.shapes.filter((s) => s.type === 'image')
  const strokes = doc.shapes.filter((s) => s.type !== 'image')
  const canUndo = histIndex.current > 0
  const canRedo = histIndex.current < history.current.length - 1
  const selectable = tool === 'select'

  const nodeProps = (s: Shape) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    rotation: s.rotation ?? 0,
    scaleX: s.scaleX ?? 1,
    scaleY: s.scaleY ?? 1,
    opacity: s.opacity ?? 1,
    draggable: selectable && s.type !== 'eraser',
    listening: selectable && s.type !== 'eraser',
    onPointerDown: () => selectable && setSelectedId(s.id),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => updateShape(s.id, { x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target
      updateShape(s.id, { x: n.x(), y: n.y(), rotation: n.rotation(), scaleX: n.scaleX(), scaleY: n.scaleY() })
    },
    onDblClick: () => {
      if (s.type !== 'text') return
      const t = prompt('글자 고치기', s.text)
      if (t === null) return
      if (t.trim()) updateShape(s.id, { text: t })
      else commit({ ...docRef.current, shapes: docRef.current.shapes.filter((x) => x.id !== s.id) })
    },
  })

  const renderShape = (s: Shape) => {
    const p = nodeProps(s)
    switch (s.type) {
      case 'pen':
      case 'marker':
      case 'eraser':
        return (
          <Line
            key={s.id}
            {...p}
            points={s.points}
            stroke={s.type === 'eraser' ? '#000' : s.stroke}
            strokeWidth={s.type === 'eraser' ? (s.strokeWidth ?? 4) * 3 : s.strokeWidth}
            tension={0.4}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={Math.max(12, s.strokeWidth ?? 4)}
            globalCompositeOperation={s.type === 'eraser' ? 'destination-out' : 'source-over'}
          />
        )
      case 'line':
        return <Line key={s.id} {...p} points={s.points} stroke={s.stroke} strokeWidth={s.strokeWidth} lineCap="round" hitStrokeWidth={16} />
      case 'arrow':
        return (
          <Arrow
            key={s.id}
            {...p}
            points={s.points!}
            stroke={s.stroke}
            fill={s.stroke}
            strokeWidth={s.strokeWidth}
            pointerLength={(s.strokeWidth ?? 4) * 4}
            pointerWidth={(s.strokeWidth ?? 4) * 4}
            lineCap="round"
            hitStrokeWidth={16}
          />
        )
      case 'rect':
        return <Rect key={s.id} {...p} width={s.width} height={s.height} stroke={s.stroke} strokeWidth={s.strokeWidth} fill={s.fill ?? undefined} />
      case 'ellipse':
        return <Ellipse key={s.id} {...p} radiusX={(s.width ?? 0) / 2} radiusY={(s.height ?? 0) / 2} stroke={s.stroke} strokeWidth={s.strokeWidth} fill={s.fill ?? undefined} />
      case 'text':
        return <Text key={s.id} {...p} text={s.text} fontSize={s.fontSize} fill={s.stroke} fontFamily="system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" />
      case 'image':
        return <PhotoNode key={s.id} shape={s} props={p} pending={pendingImages.current} />
    }
  }

  return (
    <section className="note image-editor">
      <header className="note-top">
        <a className="icon-btn mobile-only" href={href('images')} aria-label="이미지 목록으로">
          ←
        </a>
        <button className="icon-btn desktop-only" onClick={toggleSidebar} title={sidebarOpen ? '메뉴 접기 (넓게 보기)' : '메뉴 펼치기'} aria-label="메뉴 접기/펼치기">
          {sidebarOpen ? '⤢' : '☰'}
        </button>
        <span className="vsep" />
        <a className="crumb-link desktop-only" href={href('images')}>
          🎨 이미지
        </a>
        <span className="crumb-sep desktop-only">›</span>
        <input
          className="image-title"
          value={title}
          aria-label="제목"
          onChange={(e) => {
            setTitle(e.target.value)
            titleRef.current = e.target.value
            scheduleSave()
          }}
        />
        <span className={`save-state ${saveState}`}>{SAVE_LABEL[saveState]}</span>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="더 보기" aria-expanded={menuOpen}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu" role="menu">
                <button role="menuitem" onClick={download}>
                  ⬇ PNG로 내려받기
                </button>
                <button role="menuitem" className="danger" onClick={remove}>
                  🗑 삭제
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="toolbar img-tools" role="toolbar" aria-label="그리기 도구">
        <button className="tool" onClick={undo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)" aria-label="되돌리기">
          ↶
        </button>
        <button className="tool" onClick={redo} disabled={!canRedo} title="다시 하기 (Ctrl+Y)" aria-label="다시 하기">
          ↷
        </button>
        <span className="sep" />
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool ${tool === t.id ? 'on' : ''}`}
            onClick={() => {
              setTool(t.id)
              setCrop(null)
              if (t.id !== 'select') setSelectedId(null)
            }}
            title={t.label}
            aria-label={t.label}
            aria-pressed={tool === t.id}
          >
            {t.icon}
          </button>
        ))}
        <span className="sep" />
        <button className="tool labeled accent" onClick={() => photoInput.current?.click()} title="사진 불러오기 (여러 장 가능)" aria-label="사진 불러오기">
          🖼 사진 불러오기
        </button>
        <TakePhotoButton className="tool labeled accent" label="📷 사진 찍기" onPhotos={insertPhotos} />
        <span className="sep" />
        <CanvasMenu
          doc={doc}
          hasPhotos={photos.length > 0}
          onArrange={() => commit(arrangePhotos(docRef.current))}
          onFitContent={() => commit(fitCanvasToContent(docRef.current))}
          onResize={(w, h) => commit(resizeCanvas(docRef.current, w, h))}
          onBackground={(bg) => commit({ ...docRef.current, background: bg })}
        />
        <button className="tool" onClick={() => commit(rotateCanvas(docRef.current))} title="캔버스 전체를 오른쪽으로 90° 돌리기" aria-label="캔버스 전체 90° 돌리기">
          ⟳
        </button>
        <button className="tool" onClick={() => commit(flipCanvas(docRef.current))} title="캔버스 전체 좌우 뒤집기" aria-label="캔버스 전체 좌우 뒤집기">
          ⇋
        </button>
        <span className="sep" />
        <button className="tool" onClick={() => setZoom((z) => Math.max(0.05, z / 1.25))} title="축소" aria-label="축소">
          −
        </button>
        <button className="tool zoom-label" onClick={() => setZoom(fitZoom)} title="화면에 맞추기" aria-label="화면에 맞추기">
          {Math.round(zoom * 100)}%
        </button>
        <button className="tool" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} title="확대" aria-label="확대">
          ＋
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            insertPhotos([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>

      <div className="toolbar img-props" role="toolbar" aria-label="색과 굵기">
        <div className="swatches inline" role="radiogroup" aria-label="색">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => pickColor(c)}
              aria-label={`색 ${c}`}
              aria-checked={color === c}
              role="radio"
            />
          ))}
          <label className="swatch custom" title="다른 색" style={{ background: color }}>
            <input type="color" value={color} onChange={(e) => pickColor(e.target.value)} aria-label="다른 색 고르기" />
          </label>
        </div>
        <span className="sep" />
        <div className="widths" role="radiogroup" aria-label="굵기">
          {WIDTHS.map((w) => (
            <button key={w} className={`tool width ${width === w ? 'on' : ''}`} onClick={() => pickWidth(w)} aria-label={`굵기 ${w}`} role="radio" aria-checked={width === w}>
              <span style={{ width: Math.min(22, w + 2), height: Math.min(22, w + 2) }} />
            </button>
          ))}
        </div>
        {(tool === 'rect' || tool === 'ellipse') && (
          <>
            <span className="sep" />
            <button className={`tool ${filled ? 'on' : ''}`} onClick={() => setFilled(!filled)} aria-pressed={filled}>
              {filled ? '■ 채우기' : '□ 테두리'}
            </button>
          </>
        )}
        {selected && tool === 'select' && (
          <>
            <span className="sep" />
            <button className="tool" onClick={() => reorder('front')} title="맨 앞으로">
              ⬆ 앞으로
            </button>
            <button className="tool" onClick={() => reorder('back')} title="맨 뒤로">
              ⬇ 뒤로
            </button>
            <button className="tool danger" onClick={removeSelected} title="지우기 (Delete)">
              🗑 지우기
            </button>
          </>
        )}
      </div>

      <PhotoStrip
        photos={photos}
        selectedId={selectedId}
        onSelect={(id) => {
          setTool('select')
          setSelectedId(id)
        }}
      />

      {selected?.type === 'image' && tool === 'select' && (
        <PhotoPanel
          shape={selected}
          doc={doc}
          onPreview={previewShape}
          onCommit={commitShape}
          onCommitCurrent={() => commit(docRef.current)}
          onCrop={() => setCropping(selected)}
        />
      )}

      {cropping && (
        <CropDialog
          shape={cropping}
          onClose={() => setCropping(null)}
          onApply={(c) => {
            const latest = docRef.current.shapes.find((x) => x.id === cropping.id)
            if (latest) commitShape(cropPhoto(latest, c))
            setCropping(null)
          }}
        />
      )}

      {tool === 'crop' && (
        <div className="toolbar img-adjust">
          <span className="table-bar-label">⛶ 남길 부분을 끌어서 고르세요</span>
          <button className="tool" onClick={applyCrop} disabled={!crop || Math.abs(crop.width) < 10 || Math.abs(crop.height) < 10}>
            ✓ 자르기
          </button>
          <button
            className="tool"
            onClick={() => {
              setCrop(null)
              setTool('select')
            }}
          >
            취소
          </button>
        </div>
      )}

      {notice && (
        <p className="message image-status">
          {notice}{' '}
          <button className="link" onClick={() => setNotice(null)}>
            닫기
          </button>
        </p>
      )}

      <div
        ref={areaRef}
        className={`canvas-area ${tool === 'select' ? '' : 'drawing'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          insertPhotos([...e.dataTransfer.files])
        }}
      >
        <div className="canvas-frame" style={{ width: doc.width * zoom, height: doc.height * zoom }}>
          <Stage
            ref={stageRef}
            width={doc.width * zoom}
            height={doc.height * zoom}
            scaleX={zoom}
            scaleY={zoom}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          >
            <Layer listening={selectable}>
              <Rect name="background" x={0} y={0} width={doc.width} height={doc.height} fill={doc.background === 'transparent' ? undefined : doc.background} />
              {photos.map(renderShape)}
            </Layer>
            <Layer>
              {strokes.map(renderShape)}
              {drawing && renderShape(drawing)}
            </Layer>
            <Layer ref={uiLayerRef}>
              <Transformer
                ref={trRef}
                rotateEnabled
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                rotationSnapTolerance={4}
                keepRatio={selected?.type === 'image' || selected?.type === 'text'}
                anchorSize={Math.max(8, 10 / zoom) * zoom}
                borderStroke="#e8a317"
                anchorStroke="#e8a317"
                boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox)}
              />
              {crop && (
                <>
                  <Rect x={0} y={0} width={doc.width} height={doc.height} fill="rgba(0,0,0,0.45)" listening={false} />
                  <Rect
                    x={Math.min(crop.x, crop.x + crop.width)}
                    y={Math.min(crop.y, crop.y + crop.height)}
                    width={Math.abs(crop.width)}
                    height={Math.abs(crop.height)}
                    fill="#000"
                    globalCompositeOperation="destination-out"
                    listening={false}
                  />
                  <Rect
                    x={Math.min(crop.x, crop.x + crop.width)}
                    y={Math.min(crop.y, crop.y + crop.height)}
                    width={Math.abs(crop.width)}
                    height={Math.abs(crop.height)}
                    stroke="#e8a317"
                    strokeWidth={2 / zoom}
                    dash={[8 / zoom, 6 / zoom]}
                    listening={false}
                  />
                </>
              )}
            </Layer>
          </Stage>
        </div>
      </div>
    </section>
  )
}

/** 저장소 사진을 불러와 그린다. 밝기·대비·흑백 보정을 적용한다. */
function PhotoNode({ shape, props, pending }: { shape: Shape; props: Record<string, unknown>; pending: Set<string> }) {
  const { backend } = useVault()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const ref = useRef<Konva.Image>(null)

  useEffect(() => {
    if (!shape.storagePath) return
    let alive = true
    pending.add(shape.id)
    cachedFileUrl(backend, shape.storagePath)
      .then((url) => {
        const el = new window.Image()
        el.crossOrigin = 'anonymous' // 그림 파일로 저장하려면 필요 (캔버스가 막히지 않게)
        el.onload = () => {
          pending.delete(shape.id)
          if (alive) setImg(el)
        }
        el.onerror = () => pending.delete(shape.id)
        el.src = url
      })
      .catch(() => pending.delete(shape.id))
    return () => {
      alive = false
      pending.delete(shape.id)
    }
  }, [backend, shape.storagePath, shape.id, pending])

  const f = shape.filters
  const filters = useMemo(() => {
    const list: typeof Konva.Filters.Brighten[] = []
    if (f?.brightness) list.push(Konva.Filters.Brighten)
    if (f?.contrast) list.push(Konva.Filters.Contrast)
    if (f?.grayscale) list.push(Konva.Filters.Grayscale)
    return list
  }, [f?.brightness, f?.contrast, f?.grayscale])

  // 보정은 그림을 미리 그려 둔(cache) 뒤에 적용된다
  useEffect(() => {
    const node = ref.current
    if (!node || !img) return
    if (filters.length) node.cache()
    else node.clearCache()
    node.getLayer()?.batchDraw()
  }, [img, filters, shape.width, shape.height, shape.crop])

  return (
    <KImage
      ref={ref}
      {...props}
      image={img ?? undefined}
      width={shape.width}
      height={shape.height}
      crop={shape.crop}
      filters={filters}
      brightness={f?.brightness ?? 0}
      contrast={f?.contrast ?? 0}
    />
  )
}
