// 여러 파일과 폴더를 구조 그대로 올린다. (PC 폴더를 통째로 끌어다 놓을 때)
// 브라우저(DOM)를 모르는 순수 로직이라 테스트할 수 있다. 끌어다 놓은 것을 읽는 부분은 lib/readDropped.ts.

import type { VaultBackend } from './types'
import { childFolders, itemsIn, uniqueName, uploadFileItem } from './vault'
import type { Folder, Item } from './types'

/** 올릴 것들. path 는 들어갈 폴더 이름들 (빈 배열 = 지금 보고 있는 폴더) */
export interface UploadPlan {
  dirs: string[][] // 빈 폴더도 만들기 위해 폴더 목록을 따로 둔다
  files: { path: string[]; file: File }[]
}

/** Supabase 무료 요금제의 파일 하나 최대 크기. 요금제를 바꾸면 여기만 고친다. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024

/** 운영체제가 몰래 만드는 파일은 올리지 않는다. */
const IGNORED = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.localized'])
export const isIgnoredName = (name: string) => IGNORED.has(name) || name.startsWith('._')

export function summarize(plan: UploadPlan) {
  const tooBig = plan.files.filter((f) => f.file.size > MAX_FILE_BYTES)
  const dirKeys = new Set(plan.dirs.map((d) => d.join('/')))
  for (const f of plan.files) for (let n = 1; n <= f.path.length; n++) dirKeys.add(f.path.slice(0, n).join('/'))
  return {
    folders: dirKeys.size,
    files: plan.files.length,
    bytes: plan.files.reduce((s, f) => s + f.file.size, 0),
    tooBig,
  }
}

export interface UploadResult {
  folders: number
  uploaded: number
  failed: { name: string; reason: string }[]
}

/**
 * 계획대로 폴더를 만들고 파일을 올린다.
 * - 끌어다 놓은 맨 위 폴더 이름이 이미 있으면 "이름 (2)" 로 새로 만든다. (기존 폴더에 섞이지 않게)
 * - 파일 하나가 실패해도 나머지는 계속 올린다.
 */
export async function uploadPlan(
  backend: VaultBackend,
  userId: string,
  plan: UploadPlan,
  parentId: string | null,
  existing: { folders: Folder[]; items: Item[] },
  onProgress: (done: number, total: number, name: string) => void = () => {},
): Promise<UploadResult> {
  const result: UploadResult = { folders: 0, uploaded: 0, failed: [] }
  const folderIds = new Map<string, string | null>([['', parentId]])
  // 폴더별로 이미 쓰인 이름 (새로 만든 폴더/파일도 계속 추가)
  const takenFolders = new Map<string | null, string[]>()
  const takenFiles = new Map<string | null, string[]>()
  const taken = (map: Map<string | null, string[]>, id: string | null, init: () => string[]) => {
    if (!map.has(id)) map.set(id, init())
    return map.get(id)!
  }

  async function ensureFolder(path: string[]): Promise<string | null> {
    const key = path.join('/')
    if (folderIds.has(key)) return folderIds.get(key)!
    const parent = await ensureFolder(path.slice(0, -1))
    const names = taken(takenFolders, parent, () => childFolders(existing.folders, parent).map((f) => f.name))
    const folder = await backend.createFolder(uniqueName(path[path.length - 1], names), parent)
    names.push(folder.name)
    folderIds.set(key, folder.id)
    result.folders++
    return folder.id
  }

  // 얕은 폴더부터 만든다
  const allDirs = [...plan.dirs, ...plan.files.map((f) => f.path)].sort((a, b) => a.length - b.length)
  for (const d of allDirs) if (d.length) await ensureFolder(d)

  for (const [n, { path, file }] of plan.files.entries()) {
    onProgress(n, plan.files.length, file.name)
    if (file.size > MAX_FILE_BYTES) {
      result.failed.push({ name: [...path, file.name].join('/'), reason: '50MB 보다 커서 건너뜀' })
      continue
    }
    try {
      const folderId = await ensureFolder(path)
      const names = taken(takenFiles, folderId, () => itemsIn(existing.items, folderId).map((i) => i.title))
      const item = await uploadFileItem(backend, userId, file, folderId, names)
      names.push(item.title)
      result.uploaded++
    } catch (e) {
      result.failed.push({ name: [...path, file.name].join('/'), reason: e instanceof Error ? e.message : String(e) })
    }
  }
  onProgress(plan.files.length, plan.files.length, '')
  return result
}
