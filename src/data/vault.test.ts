import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from './memoryBackend'
import {
  deleteFolderRecursive, folderAndDescendants, folderDeletionScope, folderPath,
  formatBytes, storagePathFor, uniqueName, uploadFileItem,
} from './vault'

describe('폴더 트리', () => {
  it('경로, 하위 폴더, 삭제 범위를 계산한다', async () => {
    const { backend } = createMemoryBackend()
    const a = await backend.createFolder('A', null)
    const b = await backend.createFolder('B', a.id)
    const c = await backend.createFolder('C', b.id)
    const other = await backend.createFolder('Other', null)
    await backend.createItem({ folder_id: c.id, kind: 'file', title: 'in-c' })
    await backend.createItem({ folder_id: other.id, kind: 'file', title: 'in-other' })
    const folders = await backend.listFolders()
    const items = await backend.listItems()

    expect(folderPath(folders, c.id).map((f) => f.name)).toEqual(['A', 'B', 'C'])
    expect(folderPath(folders, null)).toEqual([])
    expect(folderAndDescendants(folders, a.id).sort()).toEqual([a.id, b.id, c.id].sort())
    const scope = folderDeletionScope(folders, items, a.id)
    expect(scope.items.map((i) => i.title)).toEqual(['in-c'])
  })

  it('폴더를 지우면 하위 폴더, 항목, 파일이 모두 지워지고 다른 폴더는 그대로다', async () => {
    const { backend, state } = createMemoryBackend('u1')
    const a = await backend.createFolder('A', null)
    const b = await backend.createFolder('B', a.id)
    const keep = await backend.createFolder('Keep', null)
    const f1 = await uploadFileItem(backend, 'u1', new File(['x'], '사진.png', { type: 'image/png' }), b.id, [])
    const f2 = await uploadFileItem(backend, 'u1', new File(['y'], 'keep.txt'), keep.id, [])

    await deleteFolderRecursive(backend, await backend.listFolders(), await backend.listItems(), a.id)

    expect([...state.folders.keys()]).toEqual([keep.id])
    expect([...state.items.keys()]).toEqual([f2.id])
    expect(state.files.has(f1.storage_path!)).toBe(false)
    expect(state.files.has(f2.storage_path!)).toBe(true)
  })
})

describe('파일 올리기', () => {
  it('한글 파일 이름은 제목에만 두고 저장 경로는 영문으로 만든다', async () => {
    const { backend, state } = createMemoryBackend('u1')
    const item = await uploadFileItem(backend, 'u1', new File(['hello'], '내 문서.PDF', { type: 'application/pdf' }), null, [])
    expect(item.title).toBe('내 문서.PDF')
    expect(item.storage_path).toBe(`u1/${item.id}/file.pdf`)
    expect(item.size_bytes).toBe(5)
    expect(await state.files.get(item.storage_path!)?.text()).toBe('hello')
  })

  it('항목 만들기가 실패하면 올린 파일을 지운다', async () => {
    const { backend, state } = createMemoryBackend('u1')
    await expect(uploadFileItem(backend, 'u1', new File(['x'], 'a.txt'), 'no-such-folder', [])).rejects.toThrow()
    expect(state.files.size).toBe(0)
  })
})

describe('도우미', () => {
  it('겹치는 이름에 번호를 붙인다', () => {
    expect(uniqueName('a.txt', [])).toBe('a.txt')
    expect(uniqueName('a.txt', ['a.txt', 'a (2).txt'])).toBe('a (3).txt')
    expect(uniqueName('사진', ['사진'])).toBe('사진 (2)')
  })
  it('저장 경로', () => {
    expect(storagePathFor('u', 'i', 'noext')).toBe('u/i/file')
    expect(storagePathFor('u', 'i', '노래.한글')).toBe('u/i/file')
  })
  it('크기 표시', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB')
  })
})
