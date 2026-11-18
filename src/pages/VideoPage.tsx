import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useVault } from '../data/VaultProvider'
import type { Item } from '../data/types'
import { filterMusic, formatDuration, isLinkTrack, parseMusicLink, type MusicFilter } from '../data/music'
import {
  addVideoLink,
  isMissingVideoKindError,
  isVideoFile,
  MISSING_VIDEO_KIND_HELP,
  uploadVideo,
  videoContent,
  videosOf,
} from '../data/video'
import { deleteItems, formatBytes } from '../data/vault'
import { MAX_FILE_BYTES } from '../data/uploadTree'
import { canTranscode, compressVideo, planCompression, readVideoMeta, shouldCompress } from '../lib/transcode'
import { useFileUrl } from '../lib/useFileUrl'
import { usePlayer } from '../player/Player'
import { useShell } from './AppShell'
import { YouTubeSearch } from './YouTubeSearch'

const FILTERS: { id: MusicFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'file', label: '🎞 내 동영상' },
  { id: 'link', label: '▶ 유튜브·링크' },
  { id: 'favorite', label: '♥ 즐겨찾기' },
]

interface Job {
  name: string
  stage: 'reading' | 'converting' | 'uploading' | 'done' | 'failed'
  progress?: number
  detail?: string
}

const STAGE_LABEL: Record<Job['stage'], string> = {
  reading: '살펴보는 중',
  converting: '작게 변환 중',
  uploading: '올리는 중',
  done: '완료',
  failed: '실패',
}

export function VideoPage() {
  const { backend, userId, items, loading, reload } = useVault()
  const { toggleSidebar } = useShell()
  const player = usePlayer()
  const [filter, setFilter] = useState<MusicFilter>('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [panel, setPanel] = useState<'none' | 'link' | 'youtube'>('none')
  const [viewing, setViewing] = useState<Item | { url: string; title: string } | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const all = videosOf(items)
  const videos = filterMusic(all, filter, query)
  const working = jobs.some((j) => j.stage !== 'done' && j.stage !== 'failed')
  const savedUrls = new Set(all.map((v) => videoContent(v).url).filter((u): u is string => Boolean(u)))

  // 변환/올리는 중에 창을 닫으려 하면 물어본다
  useEffect(() => {
    if (!working) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [working])

  const update = (i: number, patch: Partial<Job>) => setJobs((js) => js.map((j, n) => (n === i ? { ...j, ...patch } : j)))

  async function upload(files: File[]) {
    const picked = files.filter(isVideoFile)
    if (!picked.length) return setStatus('동영상 파일(mp4, mov, webm, mkv 등)만 올릴 수 있어요.')
    setStatus(null)
    const start = jobs.length
    setJobs((js) => [...js, ...picked.map((f) => ({ name: f.name, stage: 'reading' as const }))])

    for (const [n, original] of picked.entries()) {
      const i = start + n
      try {
        const meta = await readVideoMeta(original)
        let file = original
        let size = { width: meta.width, height: meta.height }

        if (shouldCompress(original) && canTranscode()) {
          const plan = planCompression(meta.duration ?? 0, meta.width ?? 1280)
          if (!plan) throw new Error(meta.duration ? `영상이 너무 길어요 (${formatDuration(meta.duration)}). 약 15분까지 넣을 수 있어요.` : '영상 길이를 알 수 없어요.')
          update(i, { stage: 'converting', progress: 0, detail: `${formatBytes(original.size)} → 약 ${formatBytes(plan.estimatedBytes)} (${plan.label})` })
          const converted = await compressVideo(original, plan, (p) => update(i, { progress: p }))
          // 원본이 이미 작고 잘 열리는 형식이면 더 작은 쪽을 쓴다
          const friendly = /\.(mp4|m4v|webm)$/i.test(original.name)
          if (!(friendly && converted.size >= original.size && original.size <= MAX_FILE_BYTES)) {
            file = converted
            if (meta.width && meta.height) size = { width: plan.width, height: Math.round((meta.height * plan.width) / meta.width) }
          }
        } else if (original.size > MAX_FILE_BYTES) {
          throw new Error('이 브라우저는 동영상 변환을 지원하지 않아요. 최신 Chrome, Edge, Safari 에서 올려 주세요.')
        }

        if (file.size > MAX_FILE_BYTES) throw new Error(`변환해도 ${formatBytes(file.size)} 라서 50MB 를 넘어요.`)
        update(i, { stage: 'uploading', progress: undefined, detail: formatBytes(file.size) })
        await uploadVideo(backend, userId, file, {
          title: original.name.replace(/\.[^.]+$/, ''),
          duration: meta.duration,
          ...size,
          originalSize: file === original ? undefined : original.size,
          thumbnail: meta.thumbnail,
        })
        const saved = file === original ? '' : ` · ${formatBytes(original.size)} → ${formatBytes(file.size)}`
        update(i, { stage: 'done', detail: `${formatBytes(file.size)}${saved}` })
      } catch (e) {
        update(i, { stage: 'failed', detail: isMissingVideoKindError(e) ? MISSING_VIDEO_KIND_HELP : e instanceof Error ? e.message : String(e) })
      }
    }
    await reload()
  }

  async function run(task: () => Promise<string | void>) {
    setStatus(null)
    try {
      const msg = await task()
      await reload()
      if (msg) setStatus(msg)
    } catch (e) {
      setStatus(isMissingVideoKindError(e) ? MISSING_VIDEO_KIND_HELP : `실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const open = (v: Item) => {
    if (isLinkTrack(v) && !parseMusicLink(videoContent(v).url ?? '')?.embedUrl) {
      window.open(videoContent(v).url, '_blank', 'noopener')
      return
    }
    if (player.playing) player.pause() // 음악은 잠시 멈춘다
    setViewing(v)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    upload([...e.dataTransfer.files])
  }

  return (
    <section
      className={`music videos ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <header className="music-head">
        <button className="icon-btn mobile-only" onClick={toggleSidebar} aria-label="메뉴 열기">
          ☰
        </button>
        <div className="grow">
          <h2>🎬 동영상</h2>
          <small className="muted">
            {all.length}개 · 내 동영상 {all.filter((v) => v.storage_path).length} · 링크 {all.filter(isLinkTrack).length}
          </small>
        </div>
        <button onClick={() => fileInput.current?.click()}>⬆ 동영상 올리기</button>
        <button className="secondary" onClick={() => setPanel(panel === 'youtube' ? 'none' : 'youtube')}>
          🔍 유튜브 검색
        </button>
        <button className="secondary" onClick={() => setPanel(panel === 'link' ? 'none' : 'link')}>
          🔗 링크 추가
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi"
          multiple
          hidden
          onChange={(e) => {
            upload([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      {panel === 'youtube' && (
        <YouTubeSearch
          saveLabel="동영상에 저장"
          savedUrls={savedUrls}
          onClose={() => setPanel('none')}
          onPlay={(v) => setViewing({ url: v.url, title: v.title })}
          onSave={async (v) => {
            await addVideoLink(backend, { url: v.url, title: v.title, artist: v.channel, duration: v.duration }).catch((e) => {
              throw new Error(isMissingVideoKindError(e) ? MISSING_VIDEO_KIND_HELP : String(e.message ?? e))
            })
            await reload()
          }}
        />
      )}

      {panel === 'link' && (
        <LinkPanel
          onCancel={() => setPanel('none')}
          onSubmit={(url, title) =>
            run(async () => {
              await addVideoLink(backend, { url, title })
              setPanel('none')
              return '링크를 추가했습니다.'
            })
          }
        />
      )}

      {jobs.length > 0 && (
        <div className="jobs">
          <div className="row">
            <strong className="grow">올리기 {working ? '진행 중… (창을 닫지 마세요)' : '끝'}</strong>
            {!working && (
              <button className="link" onClick={() => setJobs([])}>
                지우기
              </button>
            )}
          </div>
          {jobs.map((j, n) => (
            <div key={n} className={`job ${j.stage}`}>
              <span className="job-name">{j.name}</span>
              <span className="job-stage">
                {STAGE_LABEL[j.stage]}
                {j.stage === 'converting' && j.progress != null && ` ${Math.round(j.progress * 100)}%`}
              </span>
              {j.stage === 'converting' && <progress value={j.progress ?? 0} max={1} />}
              {j.detail && <small className="job-detail">{j.detail}</small>}
            </div>
          ))}
        </div>
      )}

      <div className="music-filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
            {f.label}
          </button>
        ))}
        <input className="grow" type="search" placeholder="제목, 채널, 메모로 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {status && <p className="message" style={{ whiteSpace: 'pre-line' }}>{status}</p>}

      {loading ? (
        <p className="muted empty">불러오는 중…</p>
      ) : videos.length === 0 ? (
        <p className="muted empty">
          {all.length
            ? '조건에 맞는 동영상이 없어요.'
            : '아직 동영상이 없어요.\n동영상 파일을 여기로 끌어다 놓거나 유튜브에서 검색해 저장해 보세요.\n큰 동영상은 올리기 전에 자동으로 작게 변환해요 (최대 50MB).'}
        </p>
      ) : (
        <ul className="video-grid">
          {videos.map((v) =>
            editing?.id === v.id ? (
              <li key={v.id} className="video-card editing">
                <EditVideo
                  video={v}
                  onCancel={() => setEditing(null)}
                  onSave={(title, note) =>
                    run(async () => {
                      await backend.updateItem(v.id, { title, content: { ...v.content, note } })
                      setEditing(null)
                    })
                  }
                />
              </li>
            ) : (
              <VideoCard
                key={v.id}
                video={v}
                onOpen={() => open(v)}
                onFavorite={() => run(async () => void (await backend.updateItem(v.id, { content: { ...v.content, favorite: !videoContent(v).favorite } })))}
                onEdit={() => setEditing(v)}
                onDownload={() => run(async () => window.location.assign(await backend.fileUrl(v.storage_path!, `${v.title}.mp4`)))}
                onDelete={() => {
                  if (!confirm(`'${v.title}' 을(를) 삭제할까요?${v.storage_path ? ' 동영상 파일도 함께 지워집니다.' : ''}`)) return
                  run(async () => {
                    await deleteItems(backend, [v])
                    return `'${v.title}' 을(를) 삭제했습니다.`
                  })
                }}
              />
            ),
          )}
        </ul>
      )}

      {viewing && <VideoViewer video={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}

function VideoCard({
  video,
  onOpen,
  onFavorite,
  onEdit,
  onDownload,
  onDelete,
}: {
  video: Item
  onOpen: () => void
  onFavorite: () => void
  onEdit: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const { backend } = useVault()
  const c = videoContent(video)
  const link = isLinkTrack(video) ? parseMusicLink(c.url ?? '') : null
  const thumb = useFileUrl(backend, c.thumbnail)
  const [menu, setMenu] = useState(false)
  const pick = (fn: () => void) => () => (setMenu(false), fn())
  const meta = link
    ? [c.artist, link.label].filter(Boolean).join(' · ')
    : [c.height ? `${c.height}p` : '', formatBytes(video.size_bytes), c.originalSize ? `원본 ${formatBytes(c.originalSize)}` : ''].filter(Boolean).join(' · ')

  return (
    <li className="video-card">
      <button className="video-thumb" onClick={onOpen} aria-label={`${video.title} 보기`}>
        {(link?.thumbnail ?? thumb) ? <img src={link?.thumbnail ?? thumb!} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="video-noimg">🎬</span>}
        {c.duration != null && <span className="badge-time">{formatDuration(c.duration)}</span>}
        {link && <span className="badge-src">{link.label}</span>}
        <span className="yt-play">{link && !link.embedUrl ? '↗' : '▶'}</span>
      </button>
      <div className="video-info">
        <div className="grow">
          <strong title={video.title}>{video.title}</strong>
          <small className="muted">{meta}</small>
          {c.note && <small className="track-note">{c.note}</small>}
        </div>
        <button className={`icon-btn heart ${c.favorite ? 'on' : ''}`} onClick={onFavorite} aria-label={c.favorite ? '즐겨찾기 해제' : '즐겨찾기'} aria-pressed={Boolean(c.favorite)}>
          {c.favorite ? '♥' : '♡'}
        </button>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="더 보기" aria-expanded={menu}>
            ⋯
          </button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="menu" role="menu">
                <button role="menuitem" onClick={pick(onEdit)}>
                  ✎ 정보 고치기
                </button>
                {video.storage_path ? (
                  <button role="menuitem" onClick={pick(onDownload)}>
                    ⬇ 내려받기
                  </button>
                ) : (
                  <a role="menuitem" href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}>
                    ↗ 원래 사이트에서 열기
                  </a>
                )}
                <button role="menuitem" className="danger" onClick={pick(onDelete)}>
                  🗑 삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

/** 화면 가득 동영상 보기. 내 동영상은 <video>, 유튜브 등은 재생 창 */
function VideoViewer({ video, onClose }: { video: Item | { url: string; title: string }; onClose: () => void }) {
  const { backend } = useVault()
  const item = 'id' in video ? video : null
  const url = item ? videoContent(item).url : (video as { url: string }).url
  const embed = url ? parseMusicLink(url)?.embedUrl : undefined
  const fileUrl = useFileUrl(backend, item?.storage_path)
  const poster = useFileUrl(backend, item ? videoContent(item).thumbnail : null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={video.title} onClick={onClose}>
      <div className="viewer-box" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-head">
          <strong>{video.title}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {item?.storage_path ? (
          fileUrl ? (
            <video className="viewer-media" src={fileUrl} poster={poster ?? undefined} controls autoPlay playsInline />
          ) : (
            <p className="muted">불러오는 중…</p>
          )
        ) : embed ? (
          <iframe className="viewer-media" src={embed} title={video.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        ) : (
          <p className="muted">이 링크는 앱 안에서 재생할 수 없어요.</p>
        )}
        {item && videoContent(item).note && <p className="viewer-note">{videoContent(item).note}</p>}
      </div>
    </div>
  )
}

function LinkPanel({ onSubmit, onCancel }: { onSubmit: (url: string, title: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const info = url ? parseMusicLink(url) : null
  return (
    <form
      className="link-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (info) onSubmit(url, title)
      }}
    >
      <label className="full">
        주소
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/… 같은 동영상 주소" required />
      </label>
      {url && (
        <small className={`link-hint ${info ? '' : 'bad'}`}>
          {!info ? 'https:// 로 시작하는 주소를 넣어 주세요.' : info.embedUrl ? `✓ ${info.label}: 앱 안에서 볼 수 있어요.` : `✓ ${info.label}: 누르면 새 탭에서 열려요.`}
        </small>
      )}
      <label className="full">
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 제주 여행 브이로그" />
      </label>
      <div className="row full">
        <button type="submit" disabled={!info}>
          추가
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}

function EditVideo({ video, onSave, onCancel }: { video: Item; onSave: (title: string, note: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(video.title)
  const [note, setNote] = useState(videoContent(video).note ?? '')
  return (
    <form
      className="link-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(title.trim() || video.title, note.trim())
      }}
    >
      <label className="full">
        제목
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="full">
        메모
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row full">
        <button type="submit">저장</button>
        <button type="button" className="secondary" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}
