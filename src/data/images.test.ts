import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createMemoryBackend } from './memoryBackend'
import { createBackup } from '../backup/backup'
import { deleteItems, uploadFileItem } from './vault'
import {
  arrangePhotos,
  canvasPaths,
  centerOf,
  createDrawing,
  cropCanvas,
  cropPhoto,
  displaySize,
  filterImages,
  fitCanvasToContent,
  fitShapeToCanvas,
  fitSize,
  flipCanvas,
  flipShape,
  imagesOf,
  layoutPhotos,
  newCanvas,
  photoCanvas,
  photoPercent,
  resizeCanvas,
  rotateCanvas,
  setDisplaySize,
  setPhotoPercent,
  setRotation,
  type Shape,
} from './images'

describe('캔버스', () => {
  it('큰 사진은 긴 변 2400 으로 줄인다', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 2400, height: 1800 })
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 })
    const doc = photoCanvas('u/i/file.jpg', 6000, 4000)
    expect(doc).toMatchObject({ width: 2400, height: 1600 })
    expect(canvasPaths(doc)).toEqual(['u/i/file.jpg'])
  })

  it('자르면 도형이 함께 옮겨지고, 너무 작게는 자르지 않는다', () => {
    const doc = { ...newCanvas(1000, 800), shapes: [{ id: 'a', type: 'rect' as const, x: 300, y: 200, width: 50, height: 50 }] }
    const c = cropCanvas(doc, { x: 600, y: 500, width: -400, height: -400 }) // 거꾸로 끌어도
    expect(c).toMatchObject({ width: 400, height: 400 })
    expect(c.shapes[0]).toMatchObject({ x: 100, y: 100 })
    expect(cropCanvas(doc, { x: 0, y: 0, width: 5, height: 5 })).toBe(doc)
    expect(cropCanvas(doc, { x: 900, y: 700, width: 500, height: 500 })).toMatchObject({ width: 100, height: 100 }) // 밖은 잘라 냄
  })

  it('90° 돌리기를 네 번 하면 제자리, 뒤집기를 두 번 하면 제자리', () => {
    const doc = { ...newCanvas(1000, 600), shapes: [{ id: 'a', type: 'pen' as const, x: 100, y: 50, points: [0, 0, 10, 10] }] }
    const r1 = rotateCanvas(doc)
    expect(r1).toMatchObject({ width: 600, height: 1000 })
    expect(r1.shapes[0]).toMatchObject({ x: 550, y: 100, rotation: 90 })
    const r4 = rotateCanvas(rotateCanvas(rotateCanvas(r1)))
    expect(r4.shapes[0]).toMatchObject({ x: 100, y: 50, rotation: 0 })
    const f2 = flipCanvas(flipCanvas(doc))
    expect(f2.shapes[0]).toMatchObject({ x: 100, scaleX: 1 })
  })
})

describe('이미지 목록', () => {
  it('그림과 사진을 나누어 거르고, 지우면 원본·편집본 파일을 모두 지우고, 백업에 모아 보기를 넣는다', async () => {
    const { backend, state } = createMemoryBackend('u1')
    const drawing = await createDrawing(backend, 1600, 900)
    const photo = await uploadFileItem(backend, 'u1', new File(['JPG'], '바다.jpg', { type: 'image/jpeg' }), null, [], 'image', {
      title: '바다',
      content: { source: 'photo' },
    })
    // 사진을 편집해서 렌더링 파일이 생긴 상태
    await backend.uploadFile('u1/x/render.png', new Blob(['PNG']))
    const edited = await backend.updateItem(photo.id, {
      storage_path: 'u1/x/render.png',
      content: { source: 'photo', favorite: true, attachments: [photo.storage_path!], canvas: photoCanvas(photo.storage_path!, 100, 100) },
    })
    const all = imagesOf(await backend.listItems())
    expect(filterImages(all, 'drawing', '').map((i) => i.id)).toEqual([drawing.id])
    expect(filterImages(all, 'photo', '').map((i) => i.id)).toEqual([photo.id])
    expect(filterImages(all, 'favorite', '바다')).toHaveLength(1)

    const zip = await JSZip.loadAsync(await createBackup(backend))
    expect(await zip.file('images/모아 보기.html')!.async('string')).toContain('src="../files/u1/x/render.png"')
    expect(zip.file(`files/${photo.storage_path}`)).toBeTruthy() // 원본도 백업

    await deleteItems(backend, [edited])
    expect(state.files.size).toBe(0)
  })
})


const photo = (over: Partial<Shape> = {}): Shape => ({
  id: 'p', type: 'image', x: 100, y: 100, width: 400, height: 300, naturalWidth: 800, naturalHeight: 600, ...over,
})
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('사진 크기·각도·뒤집기', () => {
  it('돌리고, 크기를 바꾸고, 뒤집어도 가운데는 제자리', () => {
    const p = photo()
    const c = centerOf(p)
    expect(c).toEqual({ x: 300, y: 250 })
    near(centerOf(setRotation(p, 37)), c)
    near(centerOf(setRotation(setRotation(p, 90), -45)), c)
    near(centerOf(setDisplaySize(setRotation(p, 30), 200, 150)), c)
    near(centerOf(flipShape(setRotation(p, 60), 'h')), c)
    near(centerOf(flipShape(p, 'v')), c)
    expect(setRotation(p, 270).rotation).toBe(-90) // -180~180 으로 정리
  })

  it('뒤집은 사진도 크기 바꾸기 후 뒤집힌 채로', () => {
    const f = setDisplaySize(flipShape(photo(), 'h'), 200, 150)
    expect(f.scaleX).toBe(-1)
    expect(displaySize(f)).toEqual({ width: 200, height: 150 })
  })

  it('% 는 원래 사진 크기 기준', () => {
    expect(photoPercent(photo())).toBe(50)
    expect(displaySize(setPhotoPercent(photo(), 100))).toEqual({ width: 800, height: 600 })
  })

  it('캔버스에 맞추면 비율 유지, 가운데, 각도 0', () => {
    const doc = { version: 1 as const, width: 1000, height: 1000, background: '#fff', shapes: [] }
    const f = fitShapeToCanvas(setRotation(photo(), 45), doc)
    expect(f.rotation).toBe(0)
    expect(displaySize(f).width).toBeCloseTo(1000)
    expect(displaySize(f).height).toBeCloseTo(750)
    near(centerOf(f), { x: 500, y: 500 })
  })

  it('자르면 남은 부분이 같은 선명도로 보이고, 자르기를 없애면 원래대로', () => {
    const p = photo() // 화면 400×300 = 원래 800×600 의 절반
    const c = cropPhoto(p, { x: 0, y: 0, width: 400, height: 600 }) // 왼쪽 절반만
    expect(displaySize(c)).toEqual({ width: 200, height: 300 })
    near(centerOf(c), centerOf(p))
    const back = cropPhoto(c, null)
    expect(displaySize(back)).toEqual({ width: 400, height: 300 })
    expect(back.crop).toBeUndefined()
  })
})

describe('배치와 캔버스 크기', () => {
  it('여러 장은 격자로, 칸을 넘지 않고 겹치지 않는다', () => {
    const l = layoutPhotos([{ width: 4000, height: 3000 }, { width: 3000, height: 4000 }, { width: 1000, height: 1000 }])
    expect(l.width).toBe(2400)
    expect(l.boxes).toHaveLength(3)
    for (const b of l.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(l.width + 1e-6)
      expect(b.y + b.height).toBeLessThanOrEqual(l.height + 1e-6)
    }
    expect(l.boxes[0].x + l.boxes[0].width).toBeLessThanOrEqual(l.boxes[1].x) // 같은 줄에서 겹치지 않음
    expect(layoutPhotos([{ width: 6000, height: 4000 }])).toMatchObject({ width: 2400, height: 1600 })
  })

  it('자동 배치는 각도를 0 으로 하고 사진이 아닌 것은 그대로', () => {
    const doc = {
      version: 1 as const, width: 1200, height: 800, background: '#fff',
      shapes: [photo({ id: 'a', rotation: 30 }), photo({ id: 'b', x: 0, y: 0 }), { id: 't', type: 'text' as const, x: 5, y: 5, text: 'hi' }],
    }
    const a = arrangePhotos(doc)
    expect(a.shapes.filter((s) => s.type === 'image').every((s) => s.rotation === 0)).toBe(true)
    expect(a.shapes.find((s) => s.id === 't')).toEqual(doc.shapes[2])
  })

  it('캔버스 크기 바꾸기는 내용을 가운데 기준으로 두고, 내용에 맞추기는 여백만 남긴다', () => {
    const doc = { version: 1 as const, width: 1000, height: 1000, background: '#fff', shapes: [photo()] }
    const r = resizeCanvas(doc, 1200, 800)
    expect(r.shapes[0]).toMatchObject({ x: 200, y: 0 })
    const f = fitCanvasToContent(doc, 10)
    expect(f).toMatchObject({ width: 420, height: 320 })
    expect(f.shapes[0]).toMatchObject({ x: 10, y: 10 })
  })
})

describe('배치할 때 작은 사진은 키우지 않는다', () => {
  it('칸보다 작은 사진은 원래 크기 그대로', () => {
    const l = layoutPhotos([{ width: 300, height: 200 }, { width: 3000, height: 2000 }])
    expect(l.boxes[0]).toMatchObject({ width: 300, height: 200 })
    expect(l.boxes[1].width).toBeLessThan(3000)
  })
})
