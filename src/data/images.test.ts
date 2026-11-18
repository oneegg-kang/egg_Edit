import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createMemoryBackend } from './memoryBackend'
import { createBackup } from '../backup/backup'
import { deleteItems, uploadFileItem } from './vault'
import {
  canvasPaths,
  createDrawing,
  cropCanvas,
  filterImages,
  fitSize,
  flipCanvas,
  imagesOf,
  newCanvas,
  photoCanvas,
  rotateCanvas,
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
