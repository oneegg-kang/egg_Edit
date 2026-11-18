// 유튜브 검색 (YouTube Data API v3).
//
// API 키는 빌드할 때 VITE_YOUTUBE_API_KEY 로 넣는다 (GitHub 저장소 Variables → YOUTUBE_API_KEY).
// 이 키는 브라우저에 그대로 보이므로, Google Cloud 에서 "HTTP 리퍼러" 를 내 사이트 주소로 제한해 두어야 한다.
// 하루 무료 사용량: 검색 1번 = 100 단위, 하루 10,000 단위 → 하루 약 100번 검색.

export const YOUTUBE_API_KEY = (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) ?? ''

export interface YouTubeVideo {
  id: string
  title: string
  channel: string
  thumbnail: string
  publishedAt: string
  duration?: number // 초
  url: string
}

export interface YouTubeSearchResult {
  videos: YouTubeVideo[]
  nextPageToken?: string
}

/** "PT1H2M3S" → 3723 */
export function parseIsoDuration(iso: string): number | undefined {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return undefined
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0))
  return d * 86400 + h * 3600 + min * 60 + s
}

/** API 가 주는 제목의 &#39; &amp; 같은 표기를 글자로 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const API = 'https://www.googleapis.com/youtube/v3'

interface SearchResponse {
  nextPageToken?: string
  items: { id: { videoId: string }; snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails: Record<string, { url: string }> } }[]
}
interface VideosResponse {
  items: { id: string; contentDetails: { duration: string } }[]
}

async function getJson<T>(url: string, fetcher: typeof fetch): Promise<T> {
  const res = await fetcher(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? res.status
    const msg =
      reason === 'quotaExceeded'
        ? '오늘 검색 사용량을 다 썼어요. 내일 다시 시도해 주세요.'
        : reason === 'keyInvalid' || reason === 'API_KEY_INVALID'
          ? 'YouTube API 키가 올바르지 않아요.'
          : reason === 'forbidden' || reason === 'ipRefererBlocked' || reason === 'PERMISSION_DENIED'
            ? 'YouTube API 키가 이 사이트에서 쓰도록 허용되지 않았어요. (Google Cloud 의 키 제한 설정 확인)'
            : `유튜브 검색 실패 (${reason})`
    throw new Error(msg)
  }
  return body as T
}

/** 동영상을 검색하고, 길이도 함께 가져온다. */
export async function searchYouTube(
  query: string,
  opts: { apiKey?: string; pageToken?: string; fetcher?: typeof fetch } = {},
): Promise<YouTubeSearchResult> {
  const key = opts.apiKey ?? YOUTUBE_API_KEY
  if (!key) throw new Error('YouTube API 키가 설정되지 않았어요.')
  const fetcher = opts.fetcher ?? fetch.bind(globalThis)
  const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '20', q: query, key, regionCode: 'KR', relevanceLanguage: 'ko' })
  if (opts.pageToken) params.set('pageToken', opts.pageToken)
  const search = await getJson<SearchResponse>(`${API}/search?${params}`, fetcher)

  const ids = search.items.map((i) => i.id.videoId).filter(Boolean)
  const durations = new Map<string, number | undefined>()
  if (ids.length) {
    try {
      const v = await getJson<VideosResponse>(`${API}/videos?${new URLSearchParams({ part: 'contentDetails', id: ids.join(','), key })}`, fetcher)
      for (const item of v.items) durations.set(item.id, parseIsoDuration(item.contentDetails.duration))
    } catch {
      /* 길이는 없어도 된다 */
    }
  }

  return {
    nextPageToken: search.nextPageToken,
    videos: search.items
      .filter((i) => i.id.videoId)
      .map((i) => ({
        id: i.id.videoId,
        title: decodeEntities(i.snippet.title),
        channel: decodeEntities(i.snippet.channelTitle),
        publishedAt: i.snippet.publishedAt,
        thumbnail: (i.snippet.thumbnails.medium ?? i.snippet.thumbnails.default ?? { url: '' }).url,
        duration: durations.get(i.id.videoId),
        url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
      })),
  }
}
