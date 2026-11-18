import type { Folder, Item, VaultBackend } from './types'

/**
 * 메모리에만 저장하는 VaultBackend. 테스트용이며, 서버 없이 화면을 시험해 볼 때도 쓸 수 있다.
 * 실제 DB 와 같은 규칙(부모 폴더 존재, 폴더 삭제 시 하위 폴더 삭제 / 항목은 최상위로)을 흉내 낸다.
 */
export function createMemoryBackend(
  userId = 'me',
  seed: { folders?: Folder[]; items?: Item[]; files?: Record<string, Blob | string> } = {},
) {
  const folders = new Map((seed.folders ?? []).map((f) => [f.id, f]))
  const items = new Map((seed.items ?? []).map((i) => [i.id, i]))
  const files = new Map(
    Object.entries(seed.files ?? {}).map(([k, v]) => [k, typeof v === 'string' ? new Blob([v]) : v]),
  )
  const listeners = new Set<() => void>()
  const now = () => new Date().toISOString()
  const changed = () => listeners.forEach((l) => l())

  const assertParent = (parentId: string | null) => {
    if (parentId && !folders.has(parentId)) throw new Error(`parent folder ${parentId} missing`)
  }
  const removeFolderCascade = (id: string) => {
    folders.delete(id)
    for (const f of [...folders.values()]) if (f.parent_id === id) removeFolderCascade(f.id)
    for (const i of items.values()) if (i.folder_id === id) items.set(i.id, { ...i, folder_id: null })
  }

  const backend: VaultBackend = {
    listFolders: async () => [...folders.values()],
    createFolder: async (name, parentId) => {
      assertParent(parentId)
      const f: Folder = { id: crypto.randomUUID(), user_id: userId, parent_id: parentId, name, created_at: now(), updated_at: now() }
      folders.set(f.id, f)
      changed()
      return f
    },
    updateFolder: async (id, patch) => {
      const f = folders.get(id)
      if (!f) throw new Error('folder not found')
      if (patch.parent_id !== undefined) assertParent(patch.parent_id)
      folders.set(id, { ...f, ...patch, updated_at: now() })
      changed()
    },
    deleteFolders: async (ids) => {
      ids.forEach(removeFolderCascade)
      changed()
    },

    listItems: async () => [...items.values()],
    createItem: async (n) => {
      if (n.folder_id) assertParent(n.folder_id)
      const i: Item = {
        id: n.id ?? crypto.randomUUID(), user_id: userId, folder_id: n.folder_id, kind: n.kind, title: n.title,
        content: n.content ?? {}, storage_path: n.storage_path ?? null, mime_type: n.mime_type ?? null,
        size_bytes: n.size_bytes ?? null, created_at: now(), updated_at: now(),
      }
      items.set(i.id, i)
      changed()
      return i
    },
    updateItem: async (id, patch) => {
      const i = items.get(id)
      if (!i) throw new Error('item not found')
      const updated = { ...i, ...patch, updated_at: now() }
      items.set(id, updated)
      changed()
      return updated
    },
    deleteItems: async (ids) => {
      ids.forEach((id) => items.delete(id))
      changed()
    },

    upsertFolders: async (fs) => {
      for (const f of fs) {
        assertParent(f.parent_id)
        folders.set(f.id, f)
      }
    },
    upsertItems: async (is) => is.forEach((i) => items.set(i.id, i)),

    uploadFile: async (p, d) => void files.set(p, d),
    downloadFile: async (p) => {
      const b = files.get(p)
      if (!b) throw new Error('not found')
      return b
    },
    deleteFiles: async (ps) => ps.forEach((p) => files.delete(p)),
    // 브라우저(데모 화면)에서는 실제로 보이는 blob 주소를, 테스트에서는 알아보기 쉬운 가짜 주소를
    fileUrl: async (p) => {
      const blob = files.get(p)
      return typeof window !== 'undefined' && blob ? URL.createObjectURL(blob) : `memory://${p}`
    },

    subscribe: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }

  return { backend, state: { folders, items, files } }
}
