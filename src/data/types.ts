// 앱 전체가 쓰는 데이터 형태.
// 이 파일은 Supabase 를 전혀 모른다. 서버를 바꿔도 이 타입은 그대로 둔다.

export type ItemKind = 'document' | 'image' | 'file' | 'music'

export interface Folder {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  created_at: string
  updated_at: string
}

export interface Item {
  id: string
  user_id: string
  folder_id: string | null
  kind: ItemKind
  title: string
  content: Record<string, unknown>
  storage_path: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
  updated_at: string
}

/**
 * 저장소(백엔드)가 지켜야 할 약속.
 * 지금은 Supabase 구현(supabaseBackend.ts) 하나뿐이지만,
 * 나중에 다른 서버로 옮길 때는 이 인터페이스만 새로 구현하면 화면 코드는 고칠 필요가 없다.
 */
export interface VaultBackend {
  listFolders(): Promise<Folder[]>
  listItems(): Promise<Item[]>
  /** 백업 복원용: id 가 같으면 덮어쓰고, 없으면 새로 만든다. */
  upsertFolders(folders: Folder[]): Promise<void>
  upsertItems(items: Item[]): Promise<void>

  downloadFile(path: string): Promise<Blob>
  uploadFile(path: string, data: Blob, contentType?: string): Promise<void>
}
