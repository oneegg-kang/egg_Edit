// 이미지 편집기의 사진 도구들: 사진 편집 막대, 사진 자르기 창, 사진 목록, 캔버스 메뉴

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useVault } from '../data/VaultProvider'
import {
  CANVAS_PRESETS,
  centerShape,
  displaySize,
  fitShapeToCanvas,
  flipShape,
  photoPercent,
  setDisplaySize,
  setPhotoPercent,
  setRotation,
  type CanvasDoc,
  type Shape,
} from '../data/images'
import { useFileUrl } from '../lib/useFileUrl'

// ── 사진 편집 막대 ───────────────────────────────────

/**
 * 사진을 고르면 나타나는 편집 막대.
 * onPreview: 막대를 끄는 동안 화면만 바꾼다 (되돌리기 기록 X)
 * onCommit : 확정 (되돌리기 기록 O, 저장)
 */
export function PhotoPanel({
  shape,
  doc,
  onPreview,
  onCommit,
  onCommitCurrent,
  onCrop,
}: {
  shape: Shape
  doc: CanvasDoc
  onPreview: (s: Shape) => void
  onCommit: (s: Shape) => void
  onCommitCurrent: () => void
  onCrop: () => void
}) {
  const [lock, setLock] = useState(true)
  const [tab, setTab] = useState<'size' | 'angle' | 'adjust'>('size') // 휴대폰에서는 한 줄씩
  const size = displaySize(shape)
  const percent = photoPercent(shape)
  const angle = Math.round(shape.rotation ?? 0)
  const f = shape.filters ?? {}
  const done = { onPointerUp: onCommitCurrent, onKeyUp: onCommitCurrent, onTouchEnd: onCommitCurrent }

  const setW = (w: number) => {
    if (!(w > 0)) return
    onCommit(setDisplaySize(shape, w, lock ? (w * size.height) / size.width : size.height))
  }
  const setH = (h: number) => {
    if (!(h > 0)) return
    onCommit(setDisplaySize(shape, lock ? (h * size.width) / size.height : size.width, h))
  }

  return (
    <div className={`photo-panel tab-${tab}`} role="group" aria-label="사진 편집">
      <div className="pp-tabs" role="tablist">
        {(
          [
            ['size', '📏 크기'],
            ['angle', '🔄 각도·뒤집기'],
            ['adjust', '✨ 보정·자르기'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`chip ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="pp-row" data-tab="size">
        <span className="pp-label">📏 크기</span>
        <input
          type="range"
          min={5}
          max={Math.max(200, percent)}
          step={1}
          value={percent}
          onChange={(e) => onPreview(setPhotoPercent(shape, Number(e.target.value)))}
          {...done}
          aria-label="크기 (원래 사진 대비 %)"
        />
        <NumberBox value={percent} suffix="%" min={1} max={1000} onCommit={(v) => onCommit(setPhotoPercent(shape, v))} label="크기 %" />
        <NumberBox value={Math.round(size.width)} suffix="" min={1} max={20000} onCommit={setW} label="가로 픽셀" />
        <button className={`tool lock ${lock ? 'on' : ''}`} onClick={() => setLock(!lock)} title={lock ? '비율 고정 (켜짐)' : '비율 고정 (꺼짐)'} aria-pressed={lock}>
          {lock ? '🔗' : '⛓️‍💥'}
        </button>
        <NumberBox value={Math.round(size.height)} suffix="" min={1} max={20000} onCommit={setH} label="세로 픽셀" />
        <button className="tool" onClick={() => onCommit(setPhotoPercent(shape, 100))} title="원래 사진 크기로">
          원래 크기
        </button>
        <button className="tool" onClick={() => onCommit(fitShapeToCanvas(shape, doc))} title="캔버스에 꼭 맞게">
          캔버스에 맞추기
        </button>
      </div>

      <div className="pp-row" data-tab="angle">
        <span className="pp-label">🔄 각도</span>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={angle}
          onChange={(e) => onPreview(setRotation(shape, Number(e.target.value)))}
          {...done}
          aria-label="각도 막대"
        />
        <NumberBox value={angle} suffix="°" min={-360} max={360} onCommit={(v) => onCommit(setRotation(shape, v))} label="각도 (도)" />
        <button className="tool" onClick={() => onCommit(setRotation(shape, angle - 90))} title="왼쪽으로 90°">
          ⟲ 90°
        </button>
        <button className="tool" onClick={() => onCommit(setRotation(shape, angle + 90))} title="오른쪽으로 90°">
          ⟳ 90°
        </button>
        <button className="tool" onClick={() => onCommit(setRotation(shape, 0))} title="반듯하게 (0°)">
          0°
        </button>
        <span className="sep" />
        <button className="tool" onClick={() => onCommit(flipShape(shape, 'h'))} title="좌우 뒤집기">
          ⇋ 좌우
        </button>
        <button className="tool" onClick={() => onCommit(flipShape(shape, 'v'))} title="상하 뒤집기">
          ⇵ 상하
        </button>
      </div>

      <div className="pp-row" data-tab="adjust">
        <span className="pp-label">✨ 보정</span>
        <label>
          밝기
          <input type="range" min={-0.5} max={0.5} step={0.05} value={f.brightness ?? 0} onChange={(e) => onPreview({ ...shape, filters: { ...f, brightness: Number(e.target.value) } })} {...done} />
        </label>
        <label>
          대비
          <input type="range" min={-50} max={50} step={5} value={f.contrast ?? 0} onChange={(e) => onPreview({ ...shape, filters: { ...f, contrast: Number(e.target.value) } })} {...done} />
        </label>
        <label>
          투명도
          <input type="range" min={0.1} max={1} step={0.05} value={shape.opacity ?? 1} onChange={(e) => onPreview({ ...shape, opacity: Number(e.target.value) })} {...done} />
        </label>
        <button className={`tool ${f.grayscale ? 'on' : ''}`} onClick={() => onCommit({ ...shape, filters: { ...f, grayscale: !f.grayscale } })} aria-pressed={Boolean(f.grayscale)}>
          흑백
        </button>
        <button className="tool" onClick={() => onCommit({ ...shape, filters: {}, opacity: 1 })} title="보정 없애기">
          보정 없애기
        </button>
        <span className="sep" />
        <button className="tool" onClick={() => onCommit(centerShape(shape, doc))} title="캔버스 가운데로">
          ⊕ 가운데로
        </button>
        <button className="tool" onClick={onCrop} title="사진에서 쓸 부분만 남기기">
          ✂ 사진 자르기
        </button>
      </div>
    </div>
  )
}

/** 숫자 칸: 다 쓰고 Enter 나 다른 곳을 누르면 적용 */
function NumberBox({ value, suffix, min, max, onCommit, label }: { value: number; suffix: string; min: number; max: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const apply = () => {
    const v = Number(text)
    if (Number.isFinite(v) && v >= min && v <= max && v !== value) onCommit(v)
    else setText(String(value))
  }
  return (
    <span className="num-box">
      <input
        inputMode="numeric"
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value.replace(/[^\d.-]/g, ''))}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      {suffix && <span>{suffix}</span>}
    </span>
  )
}

// ── 사진 자르기 창 ───────────────────────────────────

const RATIOS = [
  { label: '자유', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
]

type Rect = { x: number; y: number; width: number; height: number }

/** 사진 전체를 보여 주고, 남길 부분을 끌어서 고른다 (원래 사진 픽셀 기준으로 돌려준다) */
export function CropDialog({ shape, onApply, onClose }: { shape: Shape; onApply: (crop: Rect | null) => void; onClose: () => void }) {
  const { backend } = useVault()
  const url = useFileUrl(backend, shape.storagePath)
  const nw = shape.naturalWidth ?? 0
  const nh = shape.naturalHeight ?? 0
  const [natural, setNatural] = useState({ w: nw, h: nh })
  const [rect, setRect] = useState<Rect>(shape.crop ?? { x: 0, y: 0, width: nw, height: nh })
  const [ratio, setRatio] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: 'new' | 'move'; sx: number; sy: number; orig: Rect } | null>(null)

  // 화면 좌표 → 사진 픽셀
  const toNatural = (e: ReactPointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * natural.w, y: ((e.clientY - r.top) / r.height) * natural.h }
  }
  const clamp = (r: Rect): Rect => {
    const width = Math.min(Math.max(r.width, 1), natural.w)
    const height = Math.min(Math.max(r.height, 1), natural.h)
    return { width, height, x: Math.min(Math.max(r.x, 0), natural.w - width), y: Math.min(Math.max(r.y, 0), natural.h - height) }
  }

  const pickRatio = (k: number) => {
    setRatio(k)
    if (!k) return
    // 가운데에 그 비율로 가장 크게
    const w = Math.min(natural.w, natural.h * k)
    const h = w / k
    setRect({ x: (natural.w - w) / 2, y: (natural.h - h) / 2, width: w, height: h })
  }

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toNatural(e)
    const inside = p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height
    drag.current = { mode: inside ? 'move' : 'new', sx: p.x, sy: p.y, orig: rect }
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toNatural(e)
    if (d.mode === 'move') {
      setRect(clamp({ ...d.orig, x: d.orig.x + p.x - d.sx, y: d.orig.y + p.y - d.sy }))
    } else {
      let w = Math.abs(p.x - d.sx)
      let h = Math.abs(p.y - d.sy)
      if (ratio) h = w / ratio
      if (ratio && h > natural.h) {
        h = natural.h
        w = h * ratio
      }
      const x = p.x < d.sx ? d.sx - w : d.sx
      const y = p.y < d.sy ? d.sy - h : d.sy
      setRect(clamp({ x, y, width: w, height: h }))
    }
  }
  const onUp = () => (drag.current = null)

  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  const tooSmall = rect.width < 8 || rect.height < 8

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="사진 자르기" onClick={onClose}>
      <div className="viewer-box crop-box" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-head">
          <strong>✂ 사진 자르기 — 남길 부분을 끌어서 고르세요 (안쪽을 끌면 옮겨져요)</strong>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="crop-ratios">
          {RATIOS.map((r) => (
            <button key={r.label} className={`chip ${ratio === r.value ? 'on' : ''}`} onClick={() => pickRatio(r.value)}>
              {r.label}
            </button>
          ))}
          <span className="muted crop-size">
            {Math.round(rect.width)} × {Math.round(rect.height)}
          </span>
        </div>
        <div className="crop-stage">
          {url ? (
            <div ref={box} className="crop-img" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <img
                src={url}
                alt="자를 사진"
                draggable={false}
                onLoad={(e) => {
                  // 예전에 넣은 사진은 원래 크기 정보가 없을 수 있다
                  const img = e.currentTarget
                  if (!nw || !nh) {
                    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
                    setRect(shape.crop ?? { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight })
                  }
                }}
              />
              {natural.w > 0 && (
                <div
                  className="crop-sel"
                  style={{ left: pct(rect.x, natural.w), top: pct(rect.y, natural.h), width: pct(rect.width, natural.w), height: pct(rect.height, natural.h) }}
                />
              )}
            </div>
          ) : (
            <p className="muted">불러오는 중…</p>
          )}
        </div>
        <div className="camera-controls">
          <button className="secondary" onClick={() => onApply(null)}>
            자르기 없애기 (원래대로)
          </button>
          <button className="secondary" onClick={onClose}>
            취소
          </button>
          <button disabled={tooSmall || !natural.w} onClick={() => onApply({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) })}>
            ✓ 자르기
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 사진 목록 ────────────────────────────────────────

/** 캔버스에 넣은 사진들을 작게 보여 준다. 누르면 그 사진을 고른다 (겹쳐 있어도 쉽게). */
export function PhotoStrip({ photos, selectedId, onSelect }: { photos: Shape[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (!photos.length) return null
  return (
    <div className="photo-strip" role="listbox" aria-label="넣은 사진 목록">
      <span className="pp-label">🖼 사진 {photos.length}장</span>
      {[...photos].reverse().map((p, n) => (
        <StripThumb key={p.id} shape={p} index={photos.length - n} selected={p.id === selectedId} onSelect={() => onSelect(p.id)} />
      ))}
    </div>
  )
}

function StripThumb({ shape, index, selected, onSelect }: { shape: Shape; index: number; selected: boolean; onSelect: () => void }) {
  const { backend } = useVault()
  const url = useFileUrl(backend, shape.storagePath)
  return (
    <button role="option" aria-selected={selected} className={`strip-thumb ${selected ? 'on' : ''}`} onClick={onSelect} title={`사진 ${index} 고르기`}>
      {url && <img src={url} alt="" style={{ transform: `rotate(${shape.rotation ?? 0}deg) scale(${Math.sign(shape.scaleX ?? 1)}, ${Math.sign(shape.scaleY ?? 1)})` }} />}
      <span>{index}</span>
    </button>
  )
}

// ── 캔버스 메뉴 ──────────────────────────────────────

export function CanvasMenu({
  doc,
  hasPhotos,
  onFitContent,
  onArrange,
  onResize,
  onBackground,
}: {
  doc: CanvasDoc
  hasPhotos: boolean
  onFitContent: () => void
  onArrange: () => void
  onResize: (w: number, h: number) => void
  onBackground: (bg: string) => void
}) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null)
  const pick = (fn: () => void) => () => {
    setOpen(null)
    fn()
  }
  return (
    <>
      <button
        className={`tool labeled ${open ? 'on' : ''}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setOpen(open ? null : { x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 4 })
        }}
        title="캔버스 크기, 사진 배치"
      >
        📐 캔버스 ▾
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(null)} />
          <div className="menu pop" style={{ left: open.x, top: open.y }} role="menu">
            <small className="menu-note">
              지금 {doc.width} × {doc.height}
            </small>
            {hasPhotos && (
              <button role="menuitem" onClick={pick(onArrange)}>
                ▦ 사진 자동 배치 (격자로 정렬)
              </button>
            )}
            <button role="menuitem" onClick={pick(onFitContent)}>
              ⤧ 내용에 맞추기 (빈 곳 잘라 내기)
            </button>
            <small className="menu-note">크기 바꾸기 (내용은 가운데 그대로)</small>
            {CANVAS_PRESETS.map((p) => (
              <button key={p.label} role="menuitem" onClick={pick(() => onResize(p.width, p.height))}>
                {p.label}
              </button>
            ))}
            <button
              role="menuitem"
              onClick={pick(() => {
                const v = prompt('캔버스 크기 (가로×세로, 예: 2000×1500)', `${doc.width}×${doc.height}`)
                const m = v && /^\s*(\d{2,5})\s*[x×*, ]\s*(\d{2,5})\s*$/i.exec(v)
                if (m) onResize(Math.min(8000, Number(m[1])), Math.min(8000, Number(m[2])))
              })}
            >
              직접 입력…
            </button>
            <small className="menu-note">배경</small>
            <button role="menuitem" className={doc.background === '#ffffff' ? 'checked' : ''} onClick={pick(() => onBackground('#ffffff'))}>
              ⬜ 흰색
            </button>
            <button role="menuitem" className={doc.background === 'transparent' ? 'checked' : ''} onClick={pick(() => onBackground('transparent'))}>
              ▦ 투명 (PNG)
            </button>
          </div>
        </>
      )}
    </>
  )
}
