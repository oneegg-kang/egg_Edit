import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from './memoryBackend'
import { MAX_FILE_BYTES, summarize, uploadPlan, type UploadPlan } from './uploadTree'
import { folderPath } from './vault'

const file = (name: string, body = 'x') => new File([body], name)

describe('폴더째 올리기', () => {
  it('폴더 구조를 그대로 만들고 파일을 제자리에 넣는다 (빈 폴더 포함)', async () => {
    const { backend, state } = createMemoryBackend('u1')
    const plan: UploadPlan = {
      dirs: [['사진'], ['사진', '2025'], ['사진', '빈 폴더']],
      files: [
        { path: ['사진'], file: file('표지.png') },
        { path: ['사진', '2025'], file: file('a.jpg') },
        { path: ['사진', '2025'], file: file('b.jpg') },
      ],
    }
    const r = await uploadPlan(backend, 'u1', plan, null, { folders: [], items: [] })

    expect(r).toEqual({ folders: 3, uploaded: 3, failed: [] })
    const folders = [...state.folders.values()]
    const items = [...state.items.values()]
    const where = (title: string) =>
      folderPath(folders, items.find((i) => i.title === title)!.folder_id).map((f) => f.name).join('/')
    expect(where('표지.png')).toBe('사진')
    expect(where('a.jpg')).toBe('사진/2025')
    expect(folders.some((f) => f.name === '빈 폴더')).toBe(true)
  })

  it('같은 이름의 폴더가 있으면 섞지 않고 "이름 (2)" 로 새로 만든다', async () => {
    const { backend } = createMemoryBackend('u1')
    const existing = await backend.createFolder('사진', null)
    await uploadPlan(backend, 'u1', { dirs: [['사진']], files: [{ path: ['사진'], file: file('a.jpg') }] }, null, {
      folders: [existing],
      items: [],
    })
    const names = (await backend.listFolders()).map((f) => f.name).sort()
    expect(names).toEqual(['사진', '사진 (2)'])
  })

  it('지금 보고 있는 폴더 안에 만든다', async () => {
    const { backend } = createMemoryBackend('u1')
    const here = await backend.createFolder('여기', null)
    await uploadPlan(backend, 'u1', { dirs: [['새']], files: [] }, here.id, { folders: [here], items: [] })
    const created = (await backend.listFolders()).find((f) => f.name === '새')!
    expect(created.parent_id).toBe(here.id)
  })

  it('너무 큰 파일은 건너뛰고 나머지는 올린다', async () => {
    const { backend } = createMemoryBackend('u1')
    const big = file('big.bin')
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 })
    const plan: UploadPlan = { dirs: [], files: [{ path: [], file: big }, { path: [], file: file('ok.txt') }] }
    expect(summarize(plan).tooBig).toHaveLength(1)
    const r = await uploadPlan(backend, 'u1', plan, null, { folders: [], items: [] })
    expect(r.uploaded).toBe(1)
    expect(r.failed.map((f) => f.name)).toEqual(['big.bin'])
  })

  it('개수 요약에 파일 경로로만 나오는 폴더도 센다', () => {
    const s = summarize({ dirs: [], files: [{ path: ['a', 'b'], file: file('x') }] })
    expect(s.folders).toBe(2)
    expect(s.files).toBe(1)
  })
})
