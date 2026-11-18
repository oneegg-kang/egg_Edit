// 음악(kind = 'music') 관련 도우미. 브라우저를 모르는 순수 함수라 테스트할 수 있다.
//
// 음악은 두 가지:
//   파일 : storage_path 에 음악 파일, content = { artist, note, duration, favorite }
//   링크 : storage_path 없음,         content = { url, artist, note, favorite }

import type { Item, VaultBackend } from './types'

export interface MusicContent {
  url?: string
  artist?: string
  note?: string
  duration?: number // 초
  favorite?: boolean
}

export const musicContent = (item: Item): MusicContent => item.content as MusicContent
export const isLinkTrack = (item: Item) => !item.storage_path && Boolean(musicContent(item).url)

export const musicOf = (items: Item[]) =>
  items.filter((i) => i.kind === 'music').sort((a, b) => b.created_at.localeCompare(a.created_at))

export type MusicFilter = 'all' | 'file' | 'link' | 'favorite'

export function filterMusic(tracks: Item[], filter: MusicFilter, query: string): Item[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return tracks.filter((t) => {
    const c = musicContent(t)
    if (filter === 'file' && !t.storage_path) return false
    if (filter === 'link' && t.storage_path) return false
    if (filter === 'favorite' && !c.favorite) return false
    const hay = `${t.title} ${c.artist ?? ''} ${c.note ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

// ── 링크 알아보기 ────────────────────────────────────

export type Provider = 'youtube' | 'spotify' | 'soundcloud' | 'melon' | 'apple' | 'other'

export interface LinkInfo {
  provider: Provider
  label: string
  /** 앱 안에서 바로 재생할 수 있는 주소 (없으면 새 탭으로 연다) */
  embedUrl?: string
  thumbnail?: string
}

const PROVIDER_LABEL: Record<Provider, string> = {
  youtube: 'YouTube',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  melon: '멜론',
  apple: 'Apple Music',
  other: '링크',
}

export function parseMusicLink(raw: string): LinkInfo | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!/^https?:$/.test(url.protocol)) return null
  const host = url.hostname.replace(/^(www|m)\./, '')
  const info = (provider: Provider, extra: Partial<LinkInfo> = {}): LinkInfo => ({ provider, label: PROVIDER_LABEL[provider], ...extra })

  // YouTube: watch?v=ID, youtu.be/ID, shorts/ID, music.youtube.com/watch?v=ID, embed/ID
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    const id =
      host === 'youtu.be'
        ? url.pathname.slice(1).split('/')[0]
        : (url.searchParams.get('v') ?? /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(url.pathname)?.[1])
    const list = url.searchParams.get('list')
    if (id && /^[\w-]{6,}$/.test(id)) {
      return info('youtube', {
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${list ? `&list=${list}` : ''}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      })
    }
    if (list) return info('youtube', { embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}` })
    return info('youtube')
  }
  // Spotify: open.spotify.com/(intl-ko/)track|album|playlist|episode/ID
  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|artist)\/(\w+)/.exec(url.pathname)
    return info('spotify', m ? { embedUrl: `https://open.spotify.com/embed/${m[1]}/${m[2]}` } : {})
  }
  if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
    return info('soundcloud', {
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&auto_play=true&visual=true`,
    })
  }
  if (host.endsWith('melon.com')) return info('melon')
  if (host === 'music.apple.com') {
    return info('apple', { embedUrl: `https://embed.music.apple.com${url.pathname}${url.search}` })
  }
  return info('other')
}

// ── 파일 이름, 시간 ───────────────────────────────────

/** "가수 - 제목.mp3" → { artist: '가수', title: '제목' }. 앞의 "01. " 같은 트랙 번호는 뺀다. */
export function guessTitleArtist(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/^\d{1,3}[.\s_-]+/, '').trim()
  const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(base)
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base || fileName }
}

export function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return ''
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|wma|webm)$/i
export const isAudioFile = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)

// ── 만들기 ───────────────────────────────────────────

export async function addMusicLink(
  backend: VaultBackend,
  input: { url: string; title: string; artist?: string; note?: string },
  folderId: string | null = null,
): Promise<Item> {
  const info = parseMusicLink(input.url)
  if (!info) throw new Error('올바른 주소(https://…)가 아닙니다.')
  return backend.createItem({
    folder_id: folderId,
    kind: 'music',
    title: input.title.trim() || info.label,
    content: { url: input.url.trim(), artist: input.artist?.trim() ?? '', note: input.note?.trim() ?? '' },
  })
}

// ── 백업용 읽기 사본 ───────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** 음악 목록을 앱 없이 열리는 HTML 로. 파일은 ZIP 안 files/ 를, 링크는 원래 주소를 가리킨다. */
export function musicListHtml(tracks: Item[], filesPrefix = '../files/', heading = '음악 목록', unit = '곡'): string {
  const rows = tracks
    .map((t) => {
      const c = musicContent(t)
      const href = t.storage_path ? filesPrefix + t.storage_path : (c.url ?? '')
      const kind = t.storage_path ? '파일' : (parseMusicLink(c.url ?? '')?.label ?? '링크')
      return `<tr><td>${c.favorite ? '♥' : ''}</td><td><a href="${esc(href)}">${esc(t.title)}</a></td><td>${esc(c.artist ?? '')}</td><td>${esc(kind)}</td><td>${esc(formatDuration(c.duration))}</td><td>${esc(c.note ?? '')}</td></tr>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 16px}table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}</style></head>
<body><h1>${heading} (${tracks.length}${unit})</h1>
<table><tr><th></th><th>제목</th><th>가수/채널</th><th>종류</th><th>길이</th><th>메모</th></tr>
${rows}
</table></body></html>
`
}
