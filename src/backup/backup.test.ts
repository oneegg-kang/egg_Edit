import { describe, expect, it } from 'vitest'
import { createBackup, restoreBackup, reassignOwner, sortFoldersParentFirst } from './backup'
import type { Folder, Item, VaultBackend } from '../data/types'

/** 테스트용 메모리 저장소 (실제 Supabase 대신) */
function memoryBackend(folders: Folder[] = [], items: Item[] = [], files: Record<string, string> = {}) {
  const state = {
    folders: new Map(folders.map((f) => [f.id, f])),
    items: new Map(items.map((i) => [i.id, i])),
    files: new Map(Object.entries(files).map(([k, v]) => [k, new Blob([v])])),
  }
  const backend: VaultBackend = {
    listFolders: async () => [...state.folders.values()],
    listItems: async () => [...state.items.values()],
    upsertFolders: async (fs) => {
      for (const f of fs) {
        if (f.parent_id && !state.folders.has(f.parent_id)) throw new Error('parent missing')
        state.folders.set(f.id, f)
      }
    },
    upsertItems: async (is) => is.forEach((i) => state.items.set(i.id, i)),
    downloadFile: async (p) => {
      const b = state.files.get(p)
      if (!b) throw new Error('not found')
      return b
    },
    uploadFile: async (p, d) => void state.files.set(p, d),
  }
  return { backend, state }
}

const now = '2026-11-17T00:00:00.000Z'
const folder = (id: string, parent_id: string | null, user_id = 'old'): Folder => ({
  id, parent_id, user_id, name: id, created_at: now, updated_at: now,
})

describe('backup', () => {
  it('백업한 내용을 다른 계정으로 그대로 복원한다', async () => {
    // 자식 폴더가 부모보다 먼저 나오도록 일부러 순서를 뒤섞는다
    const src = memoryBackend(
      [folder('child', 'root'), folder('root', null)],
      [
        { id: 'doc1', user_id: 'old', folder_id: 'child', kind: 'document', title: '일기',
          content: { doc: { text: '안녕' } }, storage_path: null, mime_type: null, size_bytes: null,
          created_at: now, updated_at: now },
        { id: 'song1', user_id: 'old', folder_id: 'root', kind: 'music', title: '노래',
          content: {}, storage_path: 'old/song1/a.mp3', mime_type: 'audio/mpeg', size_bytes: 3,
          created_at: now, updated_at: now },
      ],
      { 'old/song1/a.mp3': 'mp3' },
    )

    const zip = await createBackup(src.backend)
    const dst = memoryBackend()
    const manifest = await restoreBackup(dst.backend, zip, 'new')

    expect(manifest.counts).toEqual({ folders: 2, items: 2, files: 1 })
    expect([...dst.state.folders.values()].every((f) => f.user_id === 'new')).toBe(true)
    expect(dst.state.items.get('doc1')?.content).toEqual({ doc: { text: '안녕' } })
    expect(dst.state.items.get('song1')?.storage_path).toBe('new/song1/a.mp3')
    expect(await dst.state.files.get('new/song1/a.mp3')?.text()).toBe('mp3')
  })

  it('없는 파일이 있어도 백업은 끝까지 하고 목록에 남긴다', async () => {
    const src = memoryBackend([], [
      { id: 'f1', user_id: 'old', folder_id: null, kind: 'file', title: 'x', content: {},
        storage_path: 'old/f1/x.pdf', mime_type: null, size_bytes: null, created_at: now, updated_at: now },
    ])
    const zip = await createBackup(src.backend)
    const manifest = await restoreBackup(memoryBackend().backend, zip, 'new')
    expect(manifest.missing_files).toEqual(['old/f1/x.pdf'])
  })

  it('egg_Edit 백업이 아닌 ZIP 은 거부한다', async () => {
    await expect(restoreBackup(memoryBackend().backend, new Blob(['nope']), 'new')).rejects.toThrow()
  })
})

describe('helpers', () => {
  it('부모 폴더를 먼저 정렬한다', () => {
    const order = sortFoldersParentFirst([folder('c', 'b'), folder('b', 'a'), folder('a', null)]).map((f) => f.id)
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('순환 폴더 구조를 잡아낸다', () => {
    expect(() => sortFoldersParentFirst([folder('a', 'b'), folder('b', 'a')])).toThrow()
  })

  it('파일 경로의 소유자를 바꾼다', () => {
    expect(reassignOwner('old/x/y.png', 'old', 'new')).toBe('new/x/y.png')
    expect(reassignOwner('other/x.png', 'old', 'new')).toBe('other/x.png')
  })
})
