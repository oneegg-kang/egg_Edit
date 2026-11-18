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

/** 새 항목을 만들 때 넘기는 값. id, user_id, 시각은 저장소가 채운다. */
export type NewItem = Pick<Item, 'folder_id' | 'kind' | 'title'> &
  Partial<Pick<Item, 'content' | 'storage_path' | 'mime_type' | 'size_bytes'>>

export type ItemPatch = Partial<Pick<Item, 'folder_id' | 'title' | 'content' | 'storage_path' | 'mime_type' | 'size_bytes'>>

/**
 * 저장소(백엔드)가 지켜야 할 약속.
 * 지금은 Supabase 구현(supabaseBackend.ts) 하나뿐이지만,
 * 나중에 다른 서버로 옮길 때는 이 인터페이스만 새로 구현하면 화면 코드는 고칠 필요가 없다.
 * 여러 단계를 묶는 동작(파일 올리기, 폴더 통째로 지우기 등)은 vault.ts 에 있다.
 */
export interface VaultBackend {
  // 폴더
  listFolders(): Promise<Folder[]>
  createFolder(name: string, parentId: string | null): Promise<Folder>
  updateFolder(id: string, patch: Partial<Pick<Folder, 'name' | 'parent_id'>>): Promise<void>
  deleteFolders(ids: string[]): Promise<void>

  // 항목
  listItems(): Promise<Item[]>
  createItem(item: NewItem & { id?: string }): Promise<Item>
  /** 바꾼 뒤의 항목을 돌려준다 (updated_at 으로 다른 기기 수정 여부를 알 수 있도록) */
  updateItem(id: string, patch: ItemPatch): Promise<Item>
  deleteItems(ids: string[]): Promise<void>

  // 백업 복원용: id 가 같으면 덮어쓰고, 없으면 새로 만든다.
  upsertFolders(folders: Folder[]): Promise<void>
  upsertItems(items: Item[]): Promise<void>

  // 파일
  uploadFile(path: string, data: Blob, contentType?: string): Promise<void>
  downloadFile(path: string): Promise<Blob>
  deleteFiles(paths: string[]): Promise<void>
  /** 잠깐 동안 쓸 수 있는 내려받기 주소. downloadName 을 주면 그 이름으로 저장된다. (기본 10분 유효) */
  fileUrl(path: string, downloadName?: string, expiresInSeconds?: number): Promise<string>

  /** 다른 기기에서 데이터가 바뀌면 onChange 를 부른다. 돌려받은 함수로 구독을 끝낸다. */
  subscribe(onChange: () => void): () => void
}
