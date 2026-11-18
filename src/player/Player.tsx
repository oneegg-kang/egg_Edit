import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVault } from '../data/VaultProvider'
import type { Item } from '../data/types'
import { formatDuration, isLinkTrack, musicContent, parseMusicLink } from '../data/music'

// 음악 재생기. 화면 틀(AppShell) 안에 한 번만 있어서, 다른 화면으로 옮겨 가도 계속 재생된다.
//   파일 음악 → <audio> 로 재생 (이어 듣기, 반복, 섞기, 잠금 화면 조작)
//   링크 음악 → YouTube/Spotify/SoundCloud 는 재생 막대 위의 작은 창에서, 나머지는 새 탭으로

type Repeat = 'off' | 'all' | 'one'

interface PlayerState {
  current: Item | null
  playing: boolean
  /** id 의 곡을 재생한다. queueIds 를 주면 그 순서대로 이어서 재생한다. */
  play: (id: string, queueIds?: string[]) => void
  toggle: () => void
  next: () => void
  prev: () => void
  stop: () => void
}

const PlayerContext = createContext<PlayerState | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer(): PlayerState {
  const p = useContext(PlayerContext)
  if (!p) throw new Error('usePlayer 는 PlayerProvider 안에서만 쓸 수 있습니다.')
  return p
}

const URL_SECONDS = 60 * 60 * 6

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { backend, items } = useVault()
  const audio = useRef<HTMLAudioElement | null>(null)
  if (!audio.current && typeof Audio !== 'undefined') audio.current = new Audio()

  const [currentId, setCurrentId] = useState<string | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [repeat, setRepeat] = useState<Repeat>('off')
  const [shuffle, setShuffle] = useState(false)
  const [embedOpen, setEmbedOpen] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const current = items.find((i) => i.id === currentId) ?? null
  const embed = current && isLinkTrack(current) ? parseMusicLink(musicContent(current).url ?? '')?.embedUrl : undefined

  // 파일 곡만 이어 듣기 대상 (링크는 끝났는지 알 수 없으므로)
  const fileQueue = useMemo(
    () => queue.filter((id) => items.find((i) => i.id === id)?.storage_path),
    [queue, items],
  )

  const startFile = useCallback(
    async (track: Item) => {
      const a = audio.current
      if (!a || !track.storage_path) return
      setError(null)
      try {
        a.src = await backend.fileUrl(track.storage_path, undefined, URL_SECONDS)
        await a.play()
      } catch (e) {
        setPlaying(false)
        // 자동 재생이 막힌 경우(NotAllowedError)는 사용자가 ▶ 를 누르면 된다
        if (!(e instanceof DOMException && e.name === 'NotAllowedError')) {
          setError(`재생할 수 없어요: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    },
    [backend],
  )

  const play = useCallback(
    (id: string, queueIds?: string[]) => {
      const track = items.find((i) => i.id === id)
      if (!track) return
      if (queueIds) setQueue(queueIds)
      if (isLinkTrack(track)) {
        const info = parseMusicLink(musicContent(track).url ?? '')
        if (!info?.embedUrl) {
          // 앱 안에서 재생할 수 없는 곳(멜론 등)은 새 탭으로
          window.open(musicContent(track).url, '_blank', 'noopener')
          return
        }
        audio.current?.pause()
        setCurrentId(id)
        setEmbedOpen(true)
        setPlaying(true)
        return
      }
      setCurrentId(id)
      startFile(track)
    },
    [items, startFile],
  )

  const step = useCallback(
    (dir: 1 | -1, auto = false) => {
      if (!fileQueue.length) return
      if (auto && repeat === 'one' && current) return void startFile(current)
      let idx = currentId ? fileQueue.indexOf(currentId) : -1
      if (shuffle && fileQueue.length > 1) {
        let r = idx
        while (r === idx) r = Math.floor(Math.random() * fileQueue.length)
        idx = r
      } else {
        idx += dir
        if (idx >= fileQueue.length || idx < 0) {
          if (auto && repeat === 'off') return setPlaying(false)
          idx = (idx + fileQueue.length) % fileQueue.length
        }
      }
      play(fileQueue[idx])
    },
    [fileQueue, currentId, repeat, shuffle, current, startFile, play],
  )

  const next = useCallback(() => step(1), [step])
  const prev = useCallback(() => {
    // 3초 넘게 들었으면 처음부터, 아니면 이전 곡
    const a = audio.current
    if (a && a.currentTime > 3 && current?.storage_path) a.currentTime = 0
    else step(-1)
  }, [step, current])

  const toggle = useCallback(() => {
    const a = audio.current
    if (!current) return
    if (isLinkTrack(current)) return setEmbedOpen((o) => !o)
    if (!a) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }, [current])

  const stop = useCallback(() => {
    audio.current?.pause()
    setCurrentId(null)
    setPlaying(false)
  }, [])

  // <audio> 상태를 화면에 반영
  const stepRef = useRef(step)
  stepRef.current = step
  useEffect(() => {
    const a = audio.current
    if (!a) return
    const on = (ev: string, fn: () => void) => (a.addEventListener(ev, fn), () => a.removeEventListener(ev, fn))
    const offs = [
      on('play', () => setPlaying(true)),
      on('pause', () => setPlaying(false)),
      on('timeupdate', () => setTime(a.currentTime)),
      on('loadedmetadata', () => setDuration(a.duration)),
      on('ended', () => stepRef.current(1, true)),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // 길이를 모르는 곡은 처음 재생할 때 알게 된 길이를 저장해 둔다
  useEffect(() => {
    if (current?.storage_path && duration && !musicContent(current).duration && isFinite(duration)) {
      backend.updateItem(current.id, { content: { ...current.content, duration: Math.round(duration) } }).catch(() => {})
    }
  }, [duration]) // eslint-disable-line react-hooks/exhaustive-deps

  // 휴대폰 잠금 화면 / 이어폰 버튼으로 조작
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current?.storage_path) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: musicContent(current).artist ?? '',
      album: 'egg_Edit',
    })
    navigator.mediaSession.setActionHandler('play', () => audio.current?.play())
    navigator.mediaSession.setActionHandler('pause', () => audio.current?.pause())
    navigator.mediaSession.setActionHandler('nexttrack', () => stepRef.current(1))
    navigator.mediaSession.setActionHandler('previoustrack', () => stepRef.current(-1))
  }, [current])

  // 재생 중인 곡이 다른 기기에서 지워지면 멈춘다
  useEffect(() => {
    if (currentId && !current) stop()
  }, [currentId, current, stop])

  const state: PlayerState = { current, playing, play, toggle, next, prev, stop }
  const a = audio.current

  return (
    <PlayerContext.Provider value={state}>
      {children}
      {current && (
        <div className="player">
          {embed && (
            // 숨길 때도 없애지 않고 접기만 한다 (없애면 재생이 끊긴다)
            <iframe
              key={embed}
              className={`player-embed ${parseMusicLink(musicContent(current).url ?? '')?.provider} ${embedOpen ? '' : 'collapsed'}`}
              src={embed}
              title={`${current.title} 재생`}
              allow="autoplay; encrypted-media; clipboard-write; picture-in-picture; fullscreen"
            />
          )}
          <div className="player-bar">
            <div className="player-info">
              <strong>{current.title}</strong>
              <small>
                {musicContent(current).artist || (embed ? parseMusicLink(musicContent(current).url ?? '')?.label : '')}
                {error && <span className="player-error"> · {error}</span>}
              </small>
            </div>
            {current.storage_path ? (
              <>
                <div className="player-controls">
                  <button className={`icon-btn toggle ${shuffle ? 'on' : ''}`} onClick={() => setShuffle(!shuffle)} title="섞어 듣기" aria-pressed={shuffle}>
                    🔀
                  </button>
                  <button className="icon-btn" onClick={prev} title="이전 곡" aria-label="이전 곡">
                    ⏮
                  </button>
                  <button className="play-btn" onClick={toggle} aria-label={playing ? '일시 정지' : '재생'}>
                    {playing ? '⏸' : '▶'}
                  </button>
                  <button className="icon-btn" onClick={next} title="다음 곡" aria-label="다음 곡">
                    ⏭
                  </button>
                  <button
                    className={`icon-btn toggle ${repeat !== 'off' ? 'on' : ''}`}
                    onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
                    title={repeat === 'off' ? '반복 안 함' : repeat === 'all' ? '전체 반복' : '한 곡 반복'}
                    aria-label="반복"
                  >
                    {repeat === 'one' ? '🔂' : '🔁'}
                  </button>
                </div>
                <div className="player-seek">
                  <small>{formatDuration(time)}</small>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={1}
                    value={Math.min(time, duration || 0)}
                    onChange={(e) => a && (a.currentTime = Number(e.target.value))}
                    aria-label="재생 위치"
                  />
                  <small>{formatDuration(duration)}</small>
                </div>
              </>
            ) : (
              <div className="player-controls">
                <button className="secondary small" onClick={() => setEmbedOpen(!embedOpen)}>
                  {embedOpen ? '재생 창 숨기기' : '재생 창 보기'}
                </button>
                <a className="secondary small" href={musicContent(current).url} target="_blank" rel="noopener noreferrer">
                  새 탭에서 열기 ↗
                </a>
              </div>
            )}
            <button className="icon-btn player-close" onClick={stop} title="재생기 닫기" aria-label="재생기 닫기">
              ✕
            </button>
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  )
}
