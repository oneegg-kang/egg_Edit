import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createMemoryBackend } from '../data/memoryBackend'
import { createDocument } from '../data/documents'
import { deleteItems } from '../data/vault'
import { createBackup, restoreBackup } from '../backup/backup'
import { docForDisplay, docForSave, docImagePath, htmlForSave, imagePaths, uploadDocImage } from './images'

const doc = (src: string) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '사진' }] },
    { type: 'image', attrs: { src, storagePath: 'u1/d1/img-a.png', alt: 'a' } },
    { type: 'image', attrs: { src: 'https://example.com/x.png', storagePath: null } }, // 바깥 이미지는 그대로
  ],
})

type Shown = { content: { attrs: { src: string } }[] }

describe('문서 속 이미지', () => {
  it('저장할 때는 vault:// 로, 열 때는 볼 수 있는 주소로 바꾼다', async () => {
    const saved = docForSave(doc('https://signed/temporary?token=abc')) as Shown
    expect(saved.content[1].attrs.src).toBe('vault://u1/d1/img-a.png')
    expect(saved.content[2].attrs.src).toBe('https://example.com/x.png')
    expect(imagePaths(saved)).toEqual(['u1/d1/img-a.png'])

    const { backend } = createMemoryBackend()
    const shown = (await docForDisplay(saved, backend)) as Shown
    expect(shown.content[1].attrs.src).toBe('memory://u1/d1/img-a.png')
  })

  it('HTML 사본의 이미지 주소도 바꾼다', () => {
    const html = '<p>x</p><img src="https://signed?t=1" data-storage-path="u1/d1/a.png" alt="a"><img src="https://e.com/b.png">'
    expect(htmlForSave(html)).toBe('<p>x</p><img src="vault://u1/d1/a.png" data-storage-path="u1/d1/a.png" alt="a"><img src="https://e.com/b.png">')
  })

  it('저장 경로는 사용자/문서 아래에 영문 확장자로', () => {
    expect(docImagePath('u1', 'd1', new File(['x'], '내 사진.JPG'))).toMatch(/^u1\/d1\/img-[0-9a-f-]+\.jpg$/)
    expect(docImagePath('u1', 'd1', new File(['x'], 'clipboard', { type: 'image/png' }))).toMatch(/\.png$/)
  })

  it('백업에 이미지 파일이 들어가고, 읽기용 HTML 은 ZIP 안 파일을 가리키며, 다른 계정으로 복원된다', async () => {
    const { backend } = createMemoryBackend('u1')
    const folder = await backend.createFolder('앨범', null)
    const d = await createDocument(backend, folder.id, '여행')
    const img = await uploadDocImage(backend, 'u1', d.id, new File(['PNG'], 'a.png', { type: 'image/png' }))
    const pmDoc = { type: 'doc', content: [{ type: 'image', attrs: img }] }
    await backend.updateItem(d.id, {
      content: {
        doc: docForSave(pmDoc),
        html: htmlForSave(`<img src="${img.src}" data-storage-path="${img.storagePath}">`),
        attachments: [img.storagePath],
      },
    })

    const blob = await createBackup(backend)
    const zip = await JSZip.loadAsync(blob)
    expect(await zip.file(`files/${img.storagePath}`)!.async('string')).toBe('PNG')
    const page = await zip.file('documents/앨범/여행.html')!.async('string')
    expect(page).toContain(`src="../../files/${img.storagePath}"`)

    const target = createMemoryBackend('u2')
    await restoreBackup(target.backend, blob, 'u2')
    const restored = target.state.items.get(d.id)!
    const newPath = img.storagePath.replace('u1/', 'u2/')
    expect(restored.content.attachments).toEqual([newPath])
    expect(imagePaths(restored.content.doc)).toEqual([newPath])
    expect(target.state.files.has(newPath)).toBe(true)
  })

  it('문서를 지우면 문서 속 이미지 파일도 지운다', async () => {
    const { backend, state } = createMemoryBackend('u1')
    const d = await createDocument(backend, null)
    const img = await uploadDocImage(backend, 'u1', d.id, new File(['x'], 'a.png'))
    const updated = await backend.updateItem(d.id, { content: { attachments: [img.storagePath] } })
    await deleteItems(backend, [updated])
    expect(state.files.size).toBe(0)
  })
})
