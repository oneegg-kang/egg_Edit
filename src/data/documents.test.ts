import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createMemoryBackend } from './memoryBackend'
import { createDocument, docPreview, docTitle, documentsOf, isNewerRemote, searchDocuments, standaloneHtml } from './documents'
import { createBackup, safeFileName } from '../backup/backup'

describe('문서', () => {
  it('만들고, 찾고, 미리 보기를 만든다', async () => {
    const { backend } = createMemoryBackend()
    const a = await createDocument(backend, null, '장보기')
    await backend.updateItem(a.id, { content: { doc: {}, html: '<p>우유 계란</p>', text: '우유 계란' } })
    const b = await createDocument(backend, null)
    await backend.updateItem(b.id, { content: { doc: {}, html: '', text: '여행 계획 제주' } })
    const docs = documentsOf(await backend.listItems())

    expect(docs).toHaveLength(2)
    expect(searchDocuments(docs, '계란').map(docTitle)).toEqual(['장보기'])
    expect(searchDocuments(docs, '제주 여행').map(docTitle)).toEqual(['제목 없음'])
    expect(searchDocuments(docs, '없는말')).toEqual([])
    expect(docPreview(docs.find((d) => d.title === '장보기')!)).toBe('우유 계란')
  })

  it('다른 기기 저장 여부를 시각으로 판단한다', () => {
    expect(isNewerRemote('2026-11-18T10:00:01.000Z', '2026-11-18T10:00:00.000Z')).toBe(true)
    expect(isNewerRemote('2026-11-18T10:00:00+00:00', '2026-11-18T10:00:00.000Z')).toBe(false)
  })

  it('HTML 사본의 제목은 안전하게 바꾼다', () => {
    expect(standaloneHtml('<b>"a"</b>', '<p>x</p>')).toContain('<title>&lt;b&gt;&quot;a&quot;&lt;/b&gt;</title>')
  })

  it('백업 ZIP 에 문서를 폴더 구조대로 HTML 로 넣는다', async () => {
    const { backend } = createMemoryBackend()
    const folder = await backend.createFolder('일기', null)
    const d1 = await createDocument(backend, folder.id, '오늘: 맑음?')
    await backend.updateItem(d1.id, { content: { html: '<p>좋은 날</p>', text: '좋은 날' } })
    await createDocument(backend, folder.id, '오늘: 맑음?') // 같은 제목
    await createDocument(backend, null)

    const zip = await JSZip.loadAsync(await createBackup(backend))
    const names = Object.keys(zip.files).filter((n) => n.startsWith('documents/') && !n.endsWith('/')).sort()
    expect(names).toEqual(['documents/일기/오늘_ 맑음_ (2).html', 'documents/일기/오늘_ 맑음_.html', 'documents/제목 없음.html'])
    expect(await zip.file('documents/일기/오늘_ 맑음_.html')!.async('string')).toContain('<p>좋은 날</p>')
  })

  it('파일 이름에 못 쓰는 글자를 바꾼다', () => {
    expect(safeFileName('a/b\\c:d*e?.')).toBe('a_b_c_d_e_')
    expect(safeFileName('...')).toBe('_')
  })
})
