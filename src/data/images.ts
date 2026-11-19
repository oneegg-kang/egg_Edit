// 이미지(kind = 'image') 관련 도우미. 브라우저를 모르는 순수 함수라 테스트할 수 있다.
//
// 이미지 항목 하나 = 완성된 그림 파일(storage_path, PNG/JPEG) + 다시 고칠 수 있는 편집 정보(content.canvas)
//   그림   : 빈 캔버스에서 시작
//   사진   : 올린 사진을 바닥에 깐 캔버스. 원본 사진은 attachments 에 남겨 두고 지우지 않는다.
// 편집 정보는 이 앱이 정한 단순한 JSON 이라 다른 프로그램으로 옮기기 쉽다.

import type { Item, VaultBackend } from './types'

export type ShapeType = 'pen' | 'marker' | 'eraser' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'image'

export interface Shape {
  id: string
  type: ShapeType
  x: number
  y: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  stroke?: string
  strokeWidth?: number
  fill?: string | null
  opacity?: number
  points?: number[] // pen/marker/eraser/line/arrow: x,y,x,y… (도형 기준 좌표)
  width?: number // rect/ellipse/image/text 상자 폭
  height?: number
  text?: string
  fontSize?: number
  storagePath?: string // image: 저장소 경로
  filters?: { brightness?: number; contrast?: number; grayscale?: boolean }
  naturalWidth?: number // image: 사진 원래 크기 (픽셀)
  naturalHeight?: number
  crop?: { x: number; y: number; width: number; height: number } // image: 원래 사진에서 쓸 부분 (픽셀)
}

export interface CanvasDoc {
  version: 1
  width: number
  height: number
  background: string // '#ffffff' 또는 'transparent'
  shapes: Shape[]
}

export interface ImageContent {
  canvas?: CanvasDoc
  favorite?: boolean
  note?: string
  width?: number
  height?: number
  source?: 'drawing' | 'photo'
  attachments?: string[]
}

export const imageContent = (item: Item): ImageContent => item.content as ImageContent

export const imagesOf = (items: Item[]) =>
  items.filter((i) => i.kind === 'image').sort((a, b) => b.updated_at.localeCompare(a.updated_at))

export type ImageFilter = 'all' | 'drawing' | 'photo' | 'favorite'

export function filterImages(images: Item[], filter: ImageFilter, query: string): Item[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return images.filter((i) => {
    const c = imageContent(i)
    if (filter === 'drawing' && c.source !== 'drawing') return false
    if (filter === 'photo' && c.source === 'drawing') return false
    if (filter === 'favorite' && !c.favorite) return false
    const hay = `${i.title} ${c.note ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export const CANVAS_PRESETS = [
  { label: '가로 (1600×900)', width: 1600, height: 900 },
  { label: '세로 (900×1600)', width: 900, height: 1600 },
  { label: '정사각형 (1200×1200)', width: 1200, height: 1200 },
  { label: 'A4 세로 (1240×1754)', width: 1240, height: 1754 },
]

/** 사진 편집 캔버스의 가장 긴 변 (너무 큰 사진은 줄여서 편집) */
export const MAX_EDIT_SIDE = 2400

export function newCanvas(width: number, height: number, background = '#ffffff'): CanvasDoc {
  return { version: 1, width: Math.round(width), height: Math.round(height), background, shapes: [] }
}

/** 사진 크기를 편집하기 좋은 크기로 (긴 변 MAX_EDIT_SIDE 이하, 비율 유지) */
export function fitSize(w: number, h: number, max = MAX_EDIT_SIDE): { width: number; height: number } {
  const s = Math.min(1, max / Math.max(w, h))
  return { width: Math.round(w * s), height: Math.round(h * s) }
}

/** 올린 사진을 바닥에 깐 캔버스 */
export function photoCanvas(storagePath: string, naturalWidth: number, naturalHeight: number): CanvasDoc {
  const { width, height } = fitSize(naturalWidth, naturalHeight)
  return { ...newCanvas(width, height), shapes: [{ id: 'base', type: 'image', x: 0, y: 0, width, height, storagePath }] }
}

/** 캔버스가 쓰는 저장소 파일들 */
export const canvasPaths = (doc: CanvasDoc | undefined): string[] =>
  (doc?.shapes ?? []).map((s) => s.storagePath).filter((p): p is string => Boolean(p))

/**
 * 캔버스를 사각형으로 자른다. 모든 도형을 그만큼 옮기고 캔버스 크기를 바꾼다.
 * (도형은 지우지 않으므로 잘린 바깥 부분은 보이지 않을 뿐 남는다 → 되돌리기 쉬움)
 */
export function cropCanvas(doc: CanvasDoc, rect: { x: number; y: number; width: number; height: number }): CanvasDoc {
  const x = Math.max(0, Math.round(Math.min(rect.x, rect.x + rect.width)))
  const y = Math.max(0, Math.round(Math.min(rect.y, rect.y + rect.height)))
  const right = Math.min(doc.width, Math.round(Math.max(rect.x, rect.x + rect.width)))
  const bottom = Math.min(doc.height, Math.round(Math.max(rect.y, rect.y + rect.height)))
  if (right - x < 10 || bottom - y < 10) return doc
  return { ...doc, width: right - x, height: bottom - y, shapes: doc.shapes.map((s) => ({ ...s, x: s.x - x, y: s.y - y })) }
}

/** 캔버스를 시계 방향으로 90° 돌린다 (모든 도형 포함) */
export function rotateCanvas(doc: CanvasDoc): CanvasDoc {
  return {
    ...doc,
    width: doc.height,
    height: doc.width,
    // (x, y) → (H - y, x), 도형 자체도 90° 회전
    shapes: doc.shapes.map((s) => ({ ...s, x: doc.height - s.y, y: s.x, rotation: ((s.rotation ?? 0) + 90) % 360 })),
  }
}

/** 캔버스를 좌우로 뒤집는다 */
export function flipCanvas(doc: CanvasDoc): CanvasDoc {
  return { ...doc, shapes: doc.shapes.map((s) => ({ ...s, x: doc.width - s.x, scaleX: -(s.scaleX ?? 1), rotation: -(s.rotation ?? 0) })) }
}

export async function createDrawing(backend: VaultBackend, width: number, height: number, folderId: string | null = null): Promise<Item> {
  return backend.createItem({
    folder_id: folderId,
    kind: 'image',
    title: '새 그림',
    content: { canvas: newCanvas(width, height), source: 'drawing', width, height },
  })
}

/**
 * 사진 여러 장으로 새 편집 캔버스를 만든다 (사진은 이미 올라가 있어야 함).
 * 한 장이면 사진 크기의 캔버스, 여러 장이면 격자로 배치한 캔버스.
 */
export function canvasFromPhotos(photos: { storagePath: string; width: number; height: number }[]): CanvasDoc {
  const l = layoutPhotos(photos)
  return {
    ...newCanvas(l.width, l.height),
    shapes: photos.map((p, i) => ({
      id: `photo-${i + 1}`,
      type: 'image' as const,
      ...l.boxes[i],
      naturalWidth: p.width,
      naturalHeight: p.height,
      storagePath: p.storagePath,
    })),
  }
}

/** 렌더링한 그림 파일의 저장 경로 (매번 새 이름 → 오래된 미리 보기가 남지 않게) */
export const renderPath = (userId: string, itemId: string, ext: 'png' | 'jpg') =>
  `${userId}/${itemId}/render-${Date.now().toString(36)}.${ext}`

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** 백업용: 앱 없이 열리는 이미지 모아 보기 */
export function galleryHtml(images: Item[], filesPrefix = '../files/'): string {
  const cards = images
    .filter((i) => i.storage_path)
    .map(
      (i) =>
        `<figure><a href="${esc(filesPrefix + i.storage_path)}"><img src="${esc(filesPrefix + i.storage_path)}" alt="" loading="lazy"></a><figcaption>${imageContent(i).favorite ? '♥ ' : ''}${esc(i.title)}</figcaption></figure>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>이미지</title>
<style>body{font-family:system-ui,sans-serif;margin:24px}main{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
figure{margin:0}img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#eee}figcaption{font-size:14px;margin-top:4px}</style></head>
<body><h1>이미지 (${images.length}개)</h1><main>
${cards}
</main></body></html>
`
}

// ── 사진 크기·각도·뒤집기 (가운데를 제자리에 두고 바꾼다) ─────────────
// 도형의 (x, y) 는 왼쪽 위 모서리이고, 돌리기·뒤집기는 그 점을 기준으로 일어난다.
// 그래서 사용자가 보기에 "제자리에서" 바뀌도록 (x, y) 를 함께 옮겨 준다.

const rad = (deg: number) => (deg * Math.PI) / 180
const rot = (vx: number, vy: number, deg: number) => {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: vx * c - vy * s, y: vx * s + vy * c }
}

/** 화면에 보이는 크기 (scale 포함, 항상 양수) */
export function displaySize(s: Shape): { width: number; height: number } {
  return { width: Math.abs((s.width ?? 0) * (s.scaleX ?? 1)), height: Math.abs((s.height ?? 0) * (s.scaleY ?? 1)) }
}

/** 사각형 도형(사진, 네모, 글자 상자)의 가운데 점 */
export function centerOf(s: Shape): { x: number; y: number } {
  const v = rot(((s.width ?? 0) * (s.scaleX ?? 1)) / 2, ((s.height ?? 0) * (s.scaleY ?? 1)) / 2, s.rotation ?? 0)
  return { x: s.x + v.x, y: s.y + v.y }
}

/** 가운데가 c 가 되도록 (x, y) 를 정한다 */
function placeCenter(s: Shape, c: { x: number; y: number }): Shape {
  const v = rot(((s.width ?? 0) * (s.scaleX ?? 1)) / 2, ((s.height ?? 0) * (s.scaleY ?? 1)) / 2, s.rotation ?? 0)
  return { ...s, x: c.x - v.x, y: c.y - v.y }
}

const norm = (deg: number) => {
  const d = ((deg % 360) + 540) % 360 - 180 // -180 ~ 180
  return Math.round(d * 10) / 10
}

/** 각도를 바꾼다 (가운데 기준) */
export function setRotation(s: Shape, deg: number): Shape {
  return placeCenter({ ...s, rotation: norm(deg) }, centerOf(s))
}

/** 보이는 크기를 바꾼다 (가운데 기준, 뒤집힘은 유지) */
export function setDisplaySize(s: Shape, width: number, height: number): Shape {
  const sx = Math.sign(s.scaleX ?? 1) || 1
  const sy = Math.sign(s.scaleY ?? 1) || 1
  return placeCenter({ ...s, width: Math.max(1, width), height: Math.max(1, height), scaleX: sx, scaleY: sy }, centerOf(s))
}

/** 좌우('h') 또는 상하('v') 로 뒤집는다 (가운데 기준) */
export function flipShape(s: Shape, dir: 'h' | 'v'): Shape {
  const next = dir === 'h' ? { ...s, scaleX: -(s.scaleX ?? 1) } : { ...s, scaleY: -(s.scaleY ?? 1) }
  return placeCenter(next, centerOf(s))
}

/** 원래 사진 크기 기준 몇 % 로 보이는지 */
export function photoPercent(s: Shape): number {
  const natural = s.crop?.width ?? s.naturalWidth
  return natural ? Math.round((displaySize(s).width / natural) * 100) : 100
}

/** 원래 사진 크기의 p% 로 (가운데 기준) */
export function setPhotoPercent(s: Shape, percent: number): Shape {
  const nw = s.crop?.width ?? s.naturalWidth ?? displaySize(s).width
  const nh = s.crop?.height ?? s.naturalHeight ?? displaySize(s).height
  return setDisplaySize(s, (nw * percent) / 100, (nh * percent) / 100)
}

/** 캔버스 안에 꼭 맞게 (비율 유지, 가운데로, 각도 0) */
export function fitShapeToCanvas(s: Shape, doc: CanvasDoc, margin = 0): Shape {
  const { width, height } = displaySize(s)
  const k = Math.min((doc.width - margin * 2) / width, (doc.height - margin * 2) / height)
  const fitted = setDisplaySize({ ...s, rotation: 0 }, width * k, height * k)
  return placeCenter(fitted, { x: doc.width / 2, y: doc.height / 2 })
}

/** 캔버스 가운데로 옮긴다 */
export const centerShape = (s: Shape, doc: CanvasDoc): Shape => placeCenter(s, { x: doc.width / 2, y: doc.height / 2 })

/**
 * 사진을 잘라 낸다. 같은 선명도(화면 크기 / 원래 픽셀)를 유지해서 남은 부분이 그대로 보이게 한다.
 * crop 이 null 이면 자르기를 없앤다.
 */
export function cropPhoto(s: Shape, crop: Shape['crop'] | null): Shape {
  const nw = s.naturalWidth ?? s.width ?? 1
  const nh = s.naturalHeight ?? s.height ?? 1
  const cur = s.crop ?? { x: 0, y: 0, width: nw, height: nh }
  const density = (s.width ?? cur.width) / cur.width // 원래 픽셀 1개가 화면에서 몇 칸인지
  const next = crop ?? { x: 0, y: 0, width: nw, height: nh }
  const shaped = { ...s, crop: crop ?? undefined }
  return placeCenter({ ...shaped, width: next.width * density, height: next.height * density }, centerOf(s))
}

/** 도형이 차지하는 범위 (돌린 것 포함). 글자는 크기를 몰라 글자 크기로 어림한다. */
export function shapeBounds(s: Shape): { x1: number; y1: number; x2: number; y2: number } {
  let pts: { x: number; y: number }[]
  if (s.points?.length) {
    pts = []
    for (let i = 0; i < s.points.length; i += 2) pts.push({ x: s.points[i] * (s.scaleX ?? 1), y: s.points[i + 1] * (s.scaleY ?? 1) })
  } else if (s.type === 'ellipse') {
    const w = ((s.width ?? 0) * (s.scaleX ?? 1)) / 2
    const h = ((s.height ?? 0) * (s.scaleY ?? 1)) / 2
    pts = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }]
  } else {
    const w = (s.width ?? (s.text ? s.text.length * (s.fontSize ?? 16) * 0.6 : 0)) * (s.scaleX ?? 1)
    const h = (s.height ?? (s.fontSize ?? 0) * 1.2) * (s.scaleY ?? 1)
    pts = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
  }
  const abs = pts.map((p) => {
    const r = rot(p.x, p.y, s.rotation ?? 0)
    return { x: s.x + r.x, y: s.y + r.y }
  })
  const pad = (s.strokeWidth ?? 0) / 2
  return {
    x1: Math.min(...abs.map((p) => p.x)) - pad,
    y1: Math.min(...abs.map((p) => p.y)) - pad,
    x2: Math.max(...abs.map((p) => p.x)) + pad,
    y2: Math.max(...abs.map((p) => p.y)) + pad,
  }
}

/** 캔버스 크기를 바꾼다. 내용은 가운데를 기준으로 그대로 둔다. */
export function resizeCanvas(doc: CanvasDoc, width: number, height: number): CanvasDoc {
  const dx = (width - doc.width) / 2
  const dy = (height - doc.height) / 2
  return { ...doc, width: Math.round(width), height: Math.round(height), shapes: doc.shapes.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })) }
}

/** 캔버스를 내용(지우개 제외)에 꼭 맞춘다 */
export function fitCanvasToContent(doc: CanvasDoc, padding = 20): CanvasDoc {
  const shapes = doc.shapes.filter((s) => s.type !== 'eraser')
  if (!shapes.length) return doc
  const b = shapes.map(shapeBounds)
  const x1 = Math.min(...b.map((v) => v.x1)) - padding
  const y1 = Math.min(...b.map((v) => v.y1)) - padding
  const x2 = Math.max(...b.map((v) => v.x2)) + padding
  const y2 = Math.max(...b.map((v) => v.y2)) + padding
  return {
    ...doc,
    width: Math.max(10, Math.round(x2 - x1)),
    height: Math.max(10, Math.round(y2 - y1)),
    shapes: doc.shapes.map((s) => ({ ...s, x: s.x - x1, y: s.y - y1 })),
  }
}

/**
 * 여러 장의 사진을 격자로 배치한다. 각 칸에 사진을 비율 그대로 넣는다 (원래 크기보다 키우지는 않음).
 * 한 장이면 사진 크기 그대로(긴 변 maxSide 이하).
 */
export function layoutPhotos(
  sizes: { width: number; height: number }[],
  opts: { canvasWidth?: number; gap?: number } = {},
): { width: number; height: number; boxes: { x: number; y: number; width: number; height: number }[] } {
  if (sizes.length === 0) return { width: 1600, height: 900, boxes: [] }
  if (sizes.length === 1) {
    const f = fitSize(sizes[0].width, sizes[0].height)
    return { ...f, boxes: [{ x: 0, y: 0, ...f }] }
  }
  const gap = opts.gap ?? 24
  const W = opts.canvasWidth ?? MAX_EDIT_SIDE
  const cols = Math.ceil(Math.sqrt(sizes.length))
  const rows = Math.ceil(sizes.length / cols)
  const cellW = (W - gap * (cols + 1)) / cols
  const avgAspect = sizes.reduce((a, s) => a + s.height / s.width, 0) / sizes.length
  const cellH = cellW * avgAspect
  const boxes = sizes.map((s, i) => {
    const k = Math.min(cellW / s.width, cellH / s.height, 1) // 원래보다 크게 늘리지 않는다 (흐려지지 않게)
    const w = s.width * k
    const h = s.height * k
    const cx = gap + (i % cols) * (cellW + gap)
    const cy = gap + Math.floor(i / cols) * (cellH + gap)
    return { x: cx + (cellW - w) / 2, y: cy + (cellH - h) / 2, width: w, height: h }
  })
  return { width: Math.round(W), height: Math.round(gap + rows * (cellH + gap)), boxes }
}

/** 캔버스의 사진들을 격자로 다시 배치한다 (캔버스 폭은 그대로, 높이는 맞춤). 다른 그림은 그대로. */
export function arrangePhotos(doc: CanvasDoc): CanvasDoc {
  const photos = doc.shapes.filter((s) => s.type === 'image')
  if (photos.length === 0) return doc
  const layout = layoutPhotos(
    photos.map((p) => displaySize(p)),
    { canvasWidth: doc.width },
  )
  const placed = new Map(
    photos.map((p, i) => {
      const b = layout.boxes[i]
      const sx = Math.sign(p.scaleX ?? 1) || 1
      const sy = Math.sign(p.scaleY ?? 1) || 1
      // 뒤집힌 사진은 원점이 반대편에 있으므로 그만큼 옮긴다
      return [p.id, { ...p, rotation: 0, width: b.width, height: b.height, scaleX: sx, scaleY: sy, x: sx < 0 ? b.x + b.width : b.x, y: sy < 0 ? b.y + b.height : b.y }]
    }),
  )
  const height = photos.length === 1 ? doc.height : layout.height
  return { ...doc, height, shapes: doc.shapes.map((s) => placed.get(s.id) ?? s) }
}
