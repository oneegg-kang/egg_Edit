// 백업 / 복원
//
// 백업 파일은 평범한 ZIP 이다. 앱이나 Supabase 가 없어도 압축만 풀면 내용을 볼 수 있다.
//
//   egg-edit-backup-20261117-1530.zip
//   ├── README.txt          이 백업의 구조 설명 (사람이 읽는 용도)
//   ├── manifest.json       형식 이름/버전, 만든 시각, 개수
//   ├── data/folders.json   폴더 구조 전체
//   ├── data/items.json     문서·이미지·파일·음악 항목 전체 (글 내용, 링크 포함)
//   ├── files/<경로>        실제 파일들 (그림, 첨부 파일, 음악 파일)
//   └── documents/…         문서를 폴더 구조 그대로 HTML 로 (브라우저로 바로 열림)
//
// 복원할 때는 같은 계정이든, 새로 만든 Supabase 프로젝트든 상관없이 지금 로그인한 계정으로 옮겨 담는다.

import JSZip from 'jszip'
import type { Folder, Item, VaultBackend } from '../data/types'
import { docContent, docTitle, standaloneHtml } from '../data/documents'
import { folderPath, uniqueName } from '../data/vault'

export const BACKUP_FORMAT = 'egg-edit-backup'
export const BACKUP_VERSION = 1

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  counts: { folders: number; items: number; files: number }
  missing_files: string[]
}

export type ProgressFn = (message: string) => void

const README = `egg_Edit 백업 파일

이 ZIP 은 egg_Edit 에 저장한 모든 데이터를 담고 있습니다.
앱이 없어도 아래 파일들을 직접 열어 볼 수 있습니다.

  manifest.json      백업 형식(${BACKUP_FORMAT} v${BACKUP_VERSION}), 만든 시각, 항목 개수
  data/folders.json  폴더 목록. parent_id 로 상위 폴더를 가리킵니다 (null = 최상위).
  data/items.json    모든 항목. kind 가 document / image / file / music 중 하나입니다.
                     folder_id 로 들어 있는 폴더를, storage_path 로 실제 파일을 가리킵니다.
                     문서의 글 내용과 음악 링크는 content 안에 있습니다.
  files/             storage_path 와 같은 경로에 실제 파일이 들어 있습니다.
  documents/         문서를 앱에서와 같은 폴더 구조로 저장한 HTML 파일입니다.
                     더블클릭하면 브라우저로 바로 읽을 수 있습니다. (읽기용 사본)

복원: egg_Edit 앱의 [백업 복원] 에서 이 ZIP 을 선택하세요.
`

/** 모든 데이터를 ZIP 하나로 만든다. */
export async function createBackup(backend: VaultBackend, onProgress: ProgressFn = () => {}): Promise<Blob> {
  onProgress('폴더와 항목 목록을 가져오는 중…')
  const [folders, items] = await Promise.all([backend.listFolders(), backend.listItems()])

  const zip = new JSZip()
  const withFiles = items.filter((i) => i.storage_path)
  const missing: string[] = []

  for (const [n, item] of withFiles.entries()) {
    const path = item.storage_path!
    onProgress(`파일 내려받는 중 (${n + 1}/${withFiles.length}) ${item.title || path}`)
    try {
      zip.file(`files/${path}`, await backend.downloadFile(path))
    } catch {
      // 파일 하나가 없어도 나머지 백업은 계속한다. 빠진 목록은 manifest 에 남긴다.
      missing.push(path)
    }
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    counts: { folders: folders.length, items: items.length, files: withFiles.length - missing.length },
    missing_files: missing,
  }

  addReadableDocuments(zip, folders, items)
  zip.file('README.txt', README)
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('data/folders.json', JSON.stringify(folders, null, 2))
  zip.file('data/items.json', JSON.stringify(items, null, 2))

  onProgress('ZIP 파일로 묶는 중…')
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** 파일 이름에 쓸 수 없는 글자를 바꾼다. (Windows 기준이 가장 엄격하다) */
export const safeFileName = (name: string) =>
  name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 120) || '_'

/** 문서를 documents/<폴더 경로>/<제목>.html 로 넣는다. 복원에는 쓰지 않는 읽기용 사본이다. */
function addReadableDocuments(zip: JSZip, folders: Folder[], items: Item[]) {
  const taken = new Map<string, string[]>()
  for (const item of items) {
    if (item.kind !== 'document') continue
    const dir = ['documents', ...folderPath(folders, item.folder_id).map((f) => safeFileName(f.name))].join('/')
    const names = taken.get(dir) ?? []
    const name = uniqueName(`${safeFileName(docTitle(item))}.html`, names)
    names.push(name)
    taken.set(dir, names)
    zip.file(`${dir}/${name}`, standaloneHtml(docTitle(item), docContent(item).html ?? ''))
  }
}

export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
  return `egg-edit-backup-${stamp}.zip`
}

/** 상위 폴더가 먼저 오도록 정렬한다. (DB 의 parent_id 참조 때문에 부모부터 넣어야 한다) */
export function sortFoldersParentFirst(folders: Folder[]): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const result: Folder[] = []
  const done = new Set<string>()
  const visit = (f: Folder, trail: Set<string>) => {
    if (done.has(f.id)) return
    if (trail.has(f.id)) throw new Error(`폴더 구조에 순환이 있습니다: ${f.name}`)
    trail.add(f.id)
    const parent = f.parent_id ? byId.get(f.parent_id) : undefined
    if (parent) visit(parent, trail)
    done.add(f.id)
    result.push(f)
  }
  for (const f of folders) visit(f, new Set())
  return result
}

/** 다른 계정/프로젝트의 백업이라도 지금 사용자의 것으로 바꾼다. */
export function reassignOwner(path: string, oldUserId: string, newUserId: string): string {
  return path.startsWith(`${oldUserId}/`) ? `${newUserId}/${path.slice(oldUserId.length + 1)}` : path
}

/** ZIP 백업을 지금 로그인한 계정으로 복원한다. 같은 id 의 항목은 백업 내용으로 덮어쓴다. */
export async function restoreBackup(
  backend: VaultBackend,
  zipFile: Blob,
  currentUserId: string,
  onProgress: ProgressFn = () => {},
): Promise<BackupManifest> {
  onProgress('백업 파일을 여는 중…')
  const zip = await JSZip.loadAsync(zipFile)

  const readJson = async <T,>(name: string): Promise<T> => {
    const entry = zip.file(name)
    if (!entry) throw new Error(`백업 파일에 ${name} 이(가) 없습니다. egg_Edit 백업이 맞는지 확인하세요.`)
    return JSON.parse(await entry.async('string')) as T
  }

  const manifest = await readJson<BackupManifest>('manifest.json')
  if (manifest.format !== BACKUP_FORMAT) throw new Error('egg_Edit 백업 파일이 아닙니다.')
  if (manifest.version > BACKUP_VERSION) {
    throw new Error(`더 새로운 버전(v${manifest.version})의 앱에서 만든 백업입니다. 앱을 업데이트한 뒤 복원하세요.`)
  }

  const folders = await readJson<Folder[]>('data/folders.json')
  const items = await readJson<Item[]>('data/items.json')

  // 1) 파일 먼저 올린다. (항목이 가리킬 파일이 먼저 있어야 한다)
  const withFiles = items.filter((i) => i.storage_path)
  for (const [n, item] of withFiles.entries()) {
    const entry = zip.file(`files/${item.storage_path}`)
    if (!entry) continue
    onProgress(`파일 올리는 중 (${n + 1}/${withFiles.length}) ${item.title || item.storage_path}`)
    const newPath = reassignOwner(item.storage_path!, item.user_id, currentUserId)
    await backend.uploadFile(newPath, await entry.async('blob'), item.mime_type ?? undefined)
  }

  // 2) 폴더 (부모 먼저)
  onProgress(`폴더 ${folders.length}개 복원 중…`)
  await backend.upsertFolders(
    sortFoldersParentFirst(folders).map((f) => ({ ...f, user_id: currentUserId })),
  )

  // 3) 항목
  onProgress(`항목 ${items.length}개 복원 중…`)
  await backend.upsertItems(
    items.map((i) => ({
      ...i,
      user_id: currentUserId,
      storage_path: i.storage_path ? reassignOwner(i.storage_path, i.user_id, currentUserId) : null,
    })),
  )

  onProgress('복원 완료')
  return manifest
}
