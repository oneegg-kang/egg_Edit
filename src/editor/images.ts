// 문서 안 이미지 처리. 브라우저/편집기를 모르는 순수 함수라 테스트할 수 있다.
//
// 저장할 때:  src = "vault://<저장 경로>"   (만료되지 않는 표시. 실제 주소가 아님)
// 열 때:      src = 잠깐 쓸 수 있는 내려받기 주소  (backend.fileUrl)

import type { VaultBackend } from '../data/types'

export const VAULT_SCHEME = 'vault://'
const IMAGE_URL_SECONDS = 60 * 60 * 24 * 7 // 화면에 띄워 둔 이미지 주소는 7일 동안 유효

interface PMNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  [k: string]: unknown
}

/** 문서 JSON 안의 모든 이미지 노드를 바꾼 새 JSON 을 돌려준다 */
function mapImages(doc: unknown, fn: (attrs: Record<string, unknown>) => Record<string, unknown>): unknown {
  const walk = (n: PMNode): PMNode => ({
    ...n,
    ...(n.type === 'image' && n.attrs ? { attrs: fn(n.attrs) } : {}),
    ...(n.content ? { content: n.content.map(walk) } : {}),
  })
  return doc && typeof doc === 'object' ? walk(doc as PMNode) : doc
}

/** 문서에 들어 있는 저장소 이미지 경로들 */
export function imagePaths(doc: unknown): string[] {
  const paths: string[] = []
  mapImages(doc, (a) => {
    if (typeof a.storagePath === 'string') paths.push(a.storagePath)
    return a
  })
  return paths
}

/** 저장 전에: 잠깐 쓰는 주소를 vault:// 표시로 바꾼다 */
export function docForSave(doc: unknown): unknown {
  return mapImages(doc, (a) => (typeof a.storagePath === 'string' ? { ...a, src: VAULT_SCHEME + a.storagePath } : a))
}

/** HTML 사본에서도 같은 처리 (data-storage-path 가 있는 img 의 src) */
export function htmlForSave(html: string): string {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    const path = /data-storage-path="([^"]+)"/.exec(tag)?.[1]
    return path ? tag.replace(/\ssrc="[^"]*"/, ` src="${VAULT_SCHEME}${path}"`) : tag
  })
}

/** 열 때: vault:// 표시를 실제로 볼 수 있는 주소로 바꾼다. 실패한 이미지는 빈 주소로 둔다. */
export async function docForDisplay(doc: unknown, backend: VaultBackend): Promise<unknown> {
  const paths = [...new Set(imagePaths(doc))]
  const urls = new Map<string, string>()
  await Promise.all(
    paths.map(async (p) => {
      try {
        urls.set(p, await backend.fileUrl(p, undefined, IMAGE_URL_SECONDS))
      } catch {
        /* 파일이 없으면 깨진 이미지로 보인다 */
      }
    }),
  )
  return mapImages(doc, (a) => (typeof a.storagePath === 'string' ? { ...a, src: urls.get(a.storagePath) ?? '' } : a))
}

export const isImageFile = (f: File) => f.type.startsWith('image/')

/** 문서에 넣을 이미지 파일의 저장 경로: <사용자>/<문서>/img-<무작위>.<확장자> */
export function docImagePath(userId: string, docId: string, file: File): string {
  const ext = /\.([A-Za-z0-9]{1,10})$/.exec(file.name)?.[1]?.toLowerCase() ?? file.type.split('/')[1]?.replace(/\W/g, '') ?? 'img'
  return `${userId}/${docId}/img-${crypto.randomUUID()}.${ext}`
}

/** 이미지를 올리고, 편집기에 넣을 속성을 돌려준다 */
export async function uploadDocImage(backend: VaultBackend, userId: string, docId: string, file: File) {
  const path = docImagePath(userId, docId, file)
  await backend.uploadFile(path, file, file.type || 'image/png')
  const src = await backend.fileUrl(path, undefined, IMAGE_URL_SECONDS)
  return { src, storagePath: path, alt: file.name }
}
