// 동영상(kind = 'video') 관련 도우미.
//   파일 : storage_path 에 MP4 등, content = { duration, width, height, thumbnail(미리 보기 사진 경로), originalSize, note, favorite }
//   링크 : storage_path 없음,     content = { url, artist(채널), note, favorite, duration }
// 거르기/검색/링크 알아보기는 음악과 같은 방식을 쓴다 (music.ts).

import type { Item, VaultBackend } from './types'
import { parseMusicLink } from './music'
import { uploadFileItem } from './vault'

export interface VideoContent {
  url?: string
  artist?: string
  note?: string
  duration?: number
  favorite?: boolean
  width?: number
  height?: number
  thumbnail?: string // 미리 보기 사진의 저장 경로
  originalSize?: number // 변환 전 크기 (바이트)
  attachments?: string[]
}

export const videoContent = (item: Item): VideoContent => item.content as VideoContent

export const videosOf = (items: Item[]) =>
  items.filter((i) => i.kind === 'video').sort((a, b) => b.created_at.localeCompare(a.created_at))

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|3gp|mpeg|mpg|ts)$/i
export const isVideoFile = (f: File) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name)

export async function addVideoLink(
  backend: VaultBackend,
  input: { url: string; title: string; artist?: string; note?: string; duration?: number },
  folderId: string | null = null,
): Promise<Item> {
  const info = parseMusicLink(input.url)
  if (!info) throw new Error('올바른 주소(https://…)가 아닙니다.')
  return backend.createItem({
    folder_id: folderId,
    kind: 'video',
    title: input.title.trim() || info.label,
    content: { url: input.url.trim(), artist: input.artist?.trim() ?? '', note: input.note?.trim() ?? '', duration: input.duration },
  })
}

/** (변환을 마친) 동영상 파일과 미리 보기 사진을 올린다 */
export async function uploadVideo(
  backend: VaultBackend,
  userId: string,
  file: File,
  meta: { title: string; duration?: number; width?: number; height?: number; originalSize?: number; thumbnail?: Blob },
): Promise<Item> {
  const content: VideoContent = {
    duration: meta.duration ? Math.round(meta.duration) : undefined,
    width: meta.width,
    height: meta.height,
    originalSize: meta.originalSize,
  }
  const item = await uploadFileItem(backend, userId, file, null, [], 'video', { title: meta.title, content: { ...content } })
  if (!meta.thumbnail) return item
  try {
    const thumbPath = `${userId}/${item.id}/thumb.jpg`
    await backend.uploadFile(thumbPath, meta.thumbnail, 'image/jpeg')
    return await backend.updateItem(item.id, { content: { ...item.content, thumbnail: thumbPath, attachments: [thumbPath] } })
  } catch {
    return item // 미리 보기가 없어도 동영상은 쓸 수 있다
  }
}

/** 이전 버전의 데이터베이스(동영상 종류가 없는)에 올리려 할 때의 오류인지 */
export const isMissingVideoKindError = (e: unknown) =>
  String((e as { message?: string })?.message ?? e).includes('items_kind_check')

export const MISSING_VIDEO_KIND_HELP =
  '데이터베이스에 동영상 종류가 아직 없어요. Supabase SQL Editor 에서 supabase/migrations/0002_video.sql 을 실행해 주세요.'
