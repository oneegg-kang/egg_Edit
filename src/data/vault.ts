// 여러 단계를 묶은 동작들. VaultBackend 만 사용하므로 서버가 바뀌어도 그대로 쓸 수 있다.

import type { Folder, Item, ItemKind, VaultBackend } from './types'

// ── 폴더 트리 계산 ────────────────────────────────────

export const childFolders = (folders: Folder[], parentId: string | null) =>
  folders.filter((f) => f.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name, 'ko'))

export const itemsIn = (items: Item[], folderId: string | null) =>
  items.filter((i) => i.folder_id === folderId).sort((a, b) => a.title.localeCompare(b.title, 'ko'))

/** 최상위부터 folderId 까지의 폴더 목록 (경로 표시용). */
export function folderPath(folders: Folder[], folderId: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const path: Folder[] = []
  const seen = new Set<string>()
  let cur = folderId ? byId.get(folderId) : undefined
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    path.unshift(cur)
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
  }
  return path
}

/** folderId 자신과 그 아래 모든 하위 폴더의 id. */
export function folderAndDescendants(folders: Folder[], folderId: string): string[] {
  const result = [folderId]
  for (let i = 0; i < result.length; i++) {
    for (const f of folders) if (f.parent_id === result[i] && !result.includes(f.id)) result.push(f.id)
  }
  return result
}

/** 폴더를 지우면 함께 지워질 것들 (확인 창에 보여 주기 위해). */
export function folderDeletionScope(folders: Folder[], items: Item[], folderId: string) {
  const folderIds = folderAndDescendants(folders, folderId)
  const set = new Set(folderIds)
  return { folderIds, items: items.filter((i) => i.folder_id && set.has(i.folder_id)) }
}

// ── 동작 ──────────────────────────────────────────────

/** 같은 폴더 안에 같은 이름이 있으면 "이름 (2)" 처럼 바꾼다. */
export function uniqueName(name: string, taken: string[]): string {
  if (!taken.includes(name)) return name
  const dot = name.lastIndexOf('.')
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`
    if (!taken.includes(candidate)) return candidate
  }
}

/**
 * 저장소 안 파일 경로. 한글 등 일부 글자는 Storage 경로에 쓸 수 없으므로
 * 원래 파일 이름은 항목의 title 에 두고, 경로에는 영문 확장자만 남긴다.
 */
export function storagePathFor(userId: string, itemId: string, fileName: string): string {
  const ext = /\.([A-Za-z0-9]{1,10})$/.exec(fileName)?.[1]?.toLowerCase()
  return `${userId}/${itemId}/file${ext ? '.' + ext : ''}`
}

/** 파일 하나를 올리고 항목을 만든다. 중간에 실패하면 올린 파일을 지운다. */
export async function uploadFileItem(
  backend: VaultBackend,
  userId: string,
  file: File,
  folderId: string | null,
  takenNames: string[],
  kind: ItemKind = 'file',
  extra: { title?: string; content?: Record<string, unknown> } = {},
): Promise<Item> {
  const id = crypto.randomUUID()
  const path = storagePathFor(userId, id, file.name)
  const contentType = file.type || 'application/octet-stream'
  await backend.uploadFile(path, file, contentType)
  try {
    return await backend.createItem({
      id,
      folder_id: folderId,
      kind,
      title: extra.title ?? uniqueName(file.name, takenNames),
      content: extra.content ?? {},
      storage_path: path,
      mime_type: contentType,
      size_bytes: file.size,
    })
  } catch (e) {
    await backend.deleteFiles([path]).catch(() => {})
    throw e
  }
}

/**
 * 항목이 Storage 에 가진 모든 파일: 본 파일(storage_path) + 딸린 파일(content.attachments, 예: 문서 속 이미지)
 */
export function filesOf(item: Item): string[] {
  const attachments = Array.isArray(item.content.attachments)
    ? item.content.attachments.filter((p): p is string => typeof p === 'string')
    : []
  return [...(item.storage_path ? [item.storage_path] : []), ...attachments]
}

/** 항목들과 그 파일(딸린 파일 포함)을 지운다. */
export async function deleteItems(backend: VaultBackend, items: Item[]) {
  await backend.deleteItems(items.map((i) => i.id))
  const paths = items.flatMap(filesOf)
  // 파일 삭제가 실패해도 목록에서는 이미 사라졌으므로 사용자에게는 성공. (남은 파일은 용량만 차지)
  await backend.deleteFiles(paths).catch(() => {})
}

/** 폴더와 그 안의 모든 하위 폴더, 항목, 파일을 지운다. */
export async function deleteFolderRecursive(backend: VaultBackend, folders: Folder[], items: Item[], folderId: string) {
  const scope = folderDeletionScope(folders, items, folderId)
  await deleteItems(backend, scope.items)
  await backend.deleteFolders([folderId]) // 하위 폴더는 DB 가 함께 지운다 (on delete cascade)
}

export function formatBytes(n: number | null): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`
}

/** 오늘이면 시각, 아니면 날짜 */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ko-KR', { year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', month: 'short', day: 'numeric' })
}
