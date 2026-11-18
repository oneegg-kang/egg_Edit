// 문서(kind = 'document') 관련 도우미.
//
// 문서 내용은 items.content 에 세 가지 형태로 함께 저장한다.
//   doc  : 편집기(TipTap)용 JSON. 앱은 이것으로 다시 연다.
//   html : 같은 내용의 HTML. 앱 없이도 브라우저로 열 수 있다. (백업, 다른 앱으로 옮기기)
//   text : 글자만. 목록 미리 보기와 검색용.
//   tags : 태그 목록 (예: ["여행", "시"])

import type { Item, VaultBackend } from './types'

export interface DocumentContent {
  doc?: unknown
  html?: string
  text?: string
  tags?: string[]
}

export const UNTITLED = '제목 없음'

export const docContent = (item: Item): DocumentContent => item.content as DocumentContent

export const docTags = (item: Item): string[] => docContent(item).tags ?? []

/** 태그 정리: 앞뒤 공백과 # 을 빼고, 비었거나 이미 있는 것은 버린다 */
export function addTag(tags: string[], raw: string): string[] {
  const tag = raw.trim().replace(/^#+/, '').trim().slice(0, 40)
  return tag && !tags.includes(tag) ? [...tags, tag] : tags
}

/** "2026년 11월 18일 오후 3:20" */
export function formatLastEdited(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`
}

export const docTitle = (item: Item) => item.title.trim() || UNTITLED

export function docPreview(item: Item, length = 80): string {
  const text = (docContent(item).text ?? '').replace(/\s+/g, ' ').trim()
  return text.length > length ? text.slice(0, length) + '…' : text
}

export function createDocument(backend: VaultBackend, folderId: string | null, title = ''): Promise<Item> {
  return backend.createItem({ folder_id: folderId, kind: 'document', title, content: { doc: null, html: '', text: '' } })
}

export const documentsOf = (items: Item[]) =>
  items.filter((i) => i.kind === 'document').sort((a, b) => b.updated_at.localeCompare(a.updated_at))

/** 제목, 본문, 태그에서 찾는다. 띄어쓰기로 나눈 낱말이 모두 들어 있어야 한다. */
export function searchDocuments(docs: Item[], query: string): Item[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return docs
  return docs.filter((d) => {
    const hay = `${d.title} ${docContent(d).text ?? ''} ${docTags(d).map((t) => '#' + t).join(' ')}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** 다른 기기에서 저장된 것인지: 서버의 updated_at 이 내가 마지막으로 알던 것보다 새로우면 true */
export function isNewerRemote(remoteUpdatedAt: string, knownUpdatedAt: string | null): boolean {
  if (!knownUpdatedAt) return false
  return Date.parse(remoteUpdatedAt) > Date.parse(knownUpdatedAt)
}

/** 백업 등에 쓸, 앱 없이 열리는 완전한 HTML 문서 */
export function standaloneHtml(title: string, bodyHtml: string): string {
  const esc = title.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc}</title>
<style>body{max-width:760px;margin:40px auto;padding:0 16px;font-family:system-ui,sans-serif;line-height:1.7}
blockquote{border-left:4px solid #ddd;margin:0;padding-left:16px;color:#555}pre{background:#f4f4f4;padding:12px;overflow:auto}
ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:8px}mark{background:#fde68a}</style>
</head><body><h1>${esc}</h1>
${bodyHtml}
</body></html>
`
}
