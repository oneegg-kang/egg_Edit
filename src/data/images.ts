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
