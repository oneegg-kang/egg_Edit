import { useState, type FormEvent } from 'react'
import { searchYouTube, YOUTUBE_API_KEY, type YouTubeVideo } from '../data/youtube'
import { formatDuration } from '../data/music'

/**
 * 유튜브 검색 창. 결과마다 [▶ 재생] 과 [+ 저장] 버튼.
 * 음악 화면, 동영상 화면이 함께 쓴다 (저장 대상과 재생 방법은 부르는 쪽이 정한다).
 */
export function YouTubeSearch({
  saveLabel,
  savedUrls,
  onPlay,
  onSave,
  onClose,
}: {
  saveLabel: string
  savedUrls: Set<string>
  onPlay: (v: YouTubeVideo) => void
  onSave: (v: YouTubeVideo) => Promise<void>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [next, setNext] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState('')

  async function search(e?: FormEvent, more = false) {
    e?.preventDefault()
    const q = more ? lastQuery : query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      const r = await searchYouTube(q, { pageToken: more ? next : undefined })
      setVideos(more ? [...videos, ...r.videos] : r.videos)
      setNext(r.nextPageToken)
      setLastQuery(q)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function save(v: YouTubeVideo) {
    setSaving(v.id)
    try {
      await onSave(v)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  if (!YOUTUBE_API_KEY) {
    return (
      <div className="yt-panel">
        <div className="yt-head">
          <strong>🔍 유튜브 검색</strong>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="message">
          유튜브 검색을 쓰려면 YouTube API 키를 한 번 설정해야 해요. 설정 방법은 README 의 "유튜브 검색 켜기" 를 봐 주세요.
          그동안에도 유튜브 주소를 [🔗 링크 추가] 로 넣으면 재생할 수 있어요.
        </p>
      </div>
    )
  }

  return (
    <div className="yt-panel">
      <div className="yt-head">
        <strong>🔍 유튜브 검색</strong>
        <button className="icon-btn" onClick={onClose} aria-label="검색 닫기">
          ✕
        </button>
      </div>
      <form className="row" onSubmit={search}>
        <input className="grow" autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="노래 제목, 가수, 영상 이름" />
        <button type="submit" disabled={busy || !query.trim()}>
          검색
        </button>
      </form>
      {error && <p className="message">{error}</p>}
      {busy && !videos.length && <p className="muted">찾는 중…</p>}
      {videos.length > 0 && (
        <ul className="yt-results">
          {videos.map((v) => {
            const saved = savedUrls.has(v.url)
            return (
              <li key={v.id} className="yt-result">
                <button className="yt-thumb" onClick={() => onPlay(v)} aria-label={`${v.title} 재생`}>
                  <img src={v.thumbnail} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  {v.duration != null && <span className="badge-time">{formatDuration(v.duration)}</span>}
                  <span className="yt-play">▶</span>
                </button>
                <div className="yt-info">
                  <strong title={v.title}>{v.title}</strong>
                  <small className="muted">
                    {v.channel} · {new Date(v.publishedAt).getFullYear()}
                  </small>
                  <div className="row">
                    <button className="secondary small" onClick={() => onPlay(v)}>
                      ▶ 재생
                    </button>
                    <button className="small" onClick={() => save(v)} disabled={saved || saving === v.id}>
                      {saved ? '✓ 저장됨' : saving === v.id ? '저장 중…' : `+ ${saveLabel}`}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {next && videos.length > 0 && (
        <button className="secondary" onClick={() => search(undefined, true)} disabled={busy}>
          {busy ? '찾는 중…' : '더 보기'}
        </button>
      )}
    </div>
  )
}
