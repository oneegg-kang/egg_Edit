import { useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useVault } from '../data/VaultProvider'
import type { Item } from '../data/types'
import {
  addMusicLink,
  filterMusic,
  formatDuration,
  guessTitleArtist,
  isAudioFile,
  isLinkTrack,
  musicContent,
  musicOf,
  parseMusicLink,
  type MusicFilter,
} from '../data/music'
import { deleteItems, folderPath, uploadFileItem } from '../data/vault'
import { MAX_FILE_BYTES } from '../data/uploadTree'
import { usePlayer } from '../player/Player'
import { useShell } from './AppShell'
import { YouTubeSearch } from './YouTubeSearch'
import { downloadFromUrl } from '../lib/platform'
const noteOf = (r: string | null | 'cancelled') => (r && r !== 'cancelled' ? r : undefined)

const FILTERS: { id: MusicFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'file', label: '🎧 파일' },
  { id: 'link', label: '🔗 링크' },
  { id: 'favorite', label: '♥ 즐겨찾기' },
]

/** 음악 파일의 길이(초)를 읽는다. 못 읽으면 undefined */
function readDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const a = new Audio()
    const url = URL.createObjectURL(file)
    const done = (v?: number) => (URL.revokeObjectURL(url), resolve(v))
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(isFinite(a.duration) ? Math.round(a.duration) : undefined)
    a.onerror = () => done()
    setTimeout(() => done(), 5000)
    a.src = url
  })
}

export function MusicPage() {
  const { backend, userId, items, folders, loading, reload } = useVault()
  const { toggleSidebar } = useShell()
  const player = usePlayer()
  const [filter, setFilter] = useState<MusicFilter>('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [linkFormOpen, setLinkFormOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const all = musicOf(items)
  const tracks = filterMusic(all, filter, query)

  async function run(task: () => Promise<string | void>) {
    setBusy(true)
    setStatus(null)
    try {
      const msg = await task()
      await reload()
      if (msg) setStatus(msg)
    } catch (e) {
      setStatus(`실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const upload = (files: File[]) => {
    const audio = files.filter(isAudioFile)
    const skipped = files.length - audio.length
    if (!audio.length) return setStatus(skipped ? '음악 파일(mp3, m4a, wav, flac 등)만 올릴 수 있어요.' : null)
    run(async () => {
      const failed: string[] = []
      for (const [n, file] of audio.entries()) {
        setStatus(`올리는 중 (${n + 1}/${audio.length}) ${file.name}`)
        if (file.size > MAX_FILE_BYTES) {
          failed.push(`${file.name}: 50MB 보다 커서 건너뜀`)
          continue
        }
        try {
          const { title, artist } = guessTitleArtist(file.name)
          const duration = await readDuration(file)
          await uploadFileItem(backend, userId, file, null, [], 'music', { title, content: { artist, duration } })
        } catch (e) {
          failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const ok = audio.length - failed.length
      const extra = skipped ? ` (음악이 아닌 파일 ${skipped}개 제외)` : ''
      return failed.length ? `${ok}곡 올림, ${failed.length}곡 실패${extra}\n${failed.join('\n')}` : `${ok}곡을 올렸습니다.${extra}`
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!busy) upload([...e.dataTransfer.files])
  }

  const toggleFavorite = (t: Item) =>
    run(async () => {
      await backend.updateItem(t.id, { content: { ...t.content, favorite: !musicContent(t).favorite } })
    })

  const remove = (t: Item) => {
    if (!confirm(`'${t.title}' 을(를) 삭제할까요?${t.storage_path ? ' 음악 파일도 함께 지워집니다.' : ''}`)) return
    if (player.current?.id === t.id) player.stop()
    run(async () => {
      await deleteItems(backend, [t])
      return `'${t.title}' 을(를) 삭제했습니다.`
    })
  }

  const download = (t: Item) =>
    run(async () => {
      return noteOf(await downloadFromUrl(await backend.fileUrl(t.storage_path!, t.title), t.title))
    })

  return (
    <section
      className={`music ${dragging ? 'dragging' : ''}`}
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
          <h2>🎵 음악</h2>
          <small className="muted">
            {all.length}곡 · 파일 {all.filter((t) => t.storage_path).length} · 링크 {all.filter(isLinkTrack).length}
          </small>
        </div>
        <button onClick={() => fileInput.current?.click()} disabled={busy}>
          ⬆ 음악 파일
        </button>
        <button className="secondary" onClick={() => setSearchOpen(!searchOpen)}>
          🔍 유튜브 검색
        </button>
        <button className="secondary" onClick={() => setLinkFormOpen(!linkFormOpen)} disabled={busy}>
          🔗 링크 추가
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus"
          multiple
          hidden
          onChange={(e) => {
            upload([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      {searchOpen && (
        <YouTubeSearch
          saveLabel="음악에 저장"
          savedUrls={new Set(all.map((t) => musicContent(t).url).filter((u): u is string => Boolean(u)))}
          onClose={() => setSearchOpen(false)}
          onPlay={(v) => player.playLink({ url: v.url, title: v.title, artist: v.channel })}
          onSave={async (v) => {
            const item = await addMusicLink(backend, { url: v.url, title: v.title, artist: v.channel })
            if (v.duration) await backend.updateItem(item.id, { content: { ...item.content, duration: v.duration } })
            await reload()
          }}
        />
      )}

      {linkFormOpen && (
        <LinkForm
          busy={busy}
          onCancel={() => setLinkFormOpen(false)}
          onSubmit={(input) =>
            run(async () => {
              await addMusicLink(backend, input)
              setLinkFormOpen(false)
              return `'${input.title || input.url}' 링크를 추가했습니다.`
            })
          }
        />
      )}

      <div className="music-filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
            {f.label}
          </button>
        ))}
        <input className="grow" type="search" placeholder="제목, 가수, 메모로 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {status && <p className="message" style={{ whiteSpace: 'pre-line' }}>{status}</p>}

      {loading ? (
        <p className="muted empty">불러오는 중…</p>
      ) : tracks.length === 0 ? (
        <p className="muted empty">
          {all.length
            ? '조건에 맞는 음악이 없어요.'
            : '아직 음악이 없어요.\n음악 파일을 여기로 끌어다 놓거나, 유튜브·스포티파이 등의 링크를 추가해 보세요.'}
        </p>
      ) : (
        <ul className="tracks">
          {tracks.map((t, n) => {
            const c = musicContent(t)
            const link = isLinkTrack(t) ? parseMusicLink(c.url ?? '') : null
            const isCurrent = player.current?.id === t.id
            const folder = folderPath(folders, t.folder_id).at(-1)
            if (editing === t.id) {
              return (
                <li key={t.id} className="track editing">
                  <EditForm
                    track={t}
                    onCancel={() => setEditing(null)}
                    onSave={(patch) =>
                      run(async () => {
                        await backend.updateItem(t.id, { title: patch.title, content: { ...t.content, artist: patch.artist, note: patch.note } })
                        setEditing(null)
                      })
                    }
                  />
                </li>
              )
            }
            return (
              <li key={t.id} className={`track ${isCurrent ? 'current' : ''}`}>
                <button
                  className="track-play"
                  onClick={() => (isCurrent ? player.toggle() : player.play(t.id, tracks.map((x) => x.id)))}
                  aria-label={isCurrent && player.playing ? `${t.title} 일시 정지` : `${t.title} 재생`}
                  style={link?.thumbnail ? { backgroundImage: `url(${link.thumbnail})` } : undefined}
                >
                  <span>{isCurrent && player.playing ? '⏸' : link && !link.embedUrl ? '↗' : '▶'}</span>
                </button>
                <div className="track-info">
                  <strong>{t.title}</strong>
                  <small className="muted">
                    {[c.artist, link ? link.label : '🎧 파일', formatDuration(c.duration), folder ? `📒 ${folder.name}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  {c.note && <small className="track-note">{c.note}</small>}
                </div>
                <span className="track-num muted">{n + 1}</span>
                <button
                  className={`icon-btn heart ${c.favorite ? 'on' : ''}`}
                  onClick={() => toggleFavorite(t)}
                  aria-label={c.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
                  aria-pressed={Boolean(c.favorite)}
                  disabled={busy}
                >
                  {c.favorite ? '♥' : '♡'}
                </button>
                <TrackMenu
                  track={t}
                  onEdit={() => setEditing(t.id)}
                  onDownload={() => download(t)}
                  onDelete={() => remove(t)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function TrackMenu({ track, onEdit, onDownload, onDelete }: { track: Item; onEdit: () => void; onDownload: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const pick = (fn: () => void) => () => (setOpen(false), fn())
  return (
    <div className="menu-wrap">
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="더 보기" aria-expanded={open}>
        ⋯
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            <button role="menuitem" onClick={pick(onEdit)}>
              ✎ 정보 고치기
            </button>
            {track.storage_path ? (
              <button role="menuitem" onClick={pick(onDownload)}>
                ⬇ 내려받기
              </button>
            ) : (
              <a role="menuitem" href={musicContent(track).url} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
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
  )
}

function LinkForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  onSubmit: (v: { url: string; title: string; artist: string; note: string }) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [note, setNote] = useState('')
  const info = url ? parseMusicLink(url) : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (info) onSubmit({ url, title, artist, note })
  }

  return (
    <form className="link-form" onSubmit={submit}>
      <label className="full">
        주소
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtu.be/…  또는 스포티파이, 사운드클라우드, 멜론 주소"
          required
        />
      </label>
      {url && (
        <small className={`link-hint ${info ? '' : 'bad'}`}>
          {!info
            ? '올바른 주소가 아니에요. https:// 로 시작하는 주소를 넣어 주세요.'
            : info.embedUrl
              ? `✓ ${info.label}: 앱 안에서 바로 재생할 수 있어요.`
              : `✓ ${info.label}: 누르면 새 탭에서 열려요.`}
        </small>
      )}
      <label>
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 밤편지" />
      </label>
      <label>
        가수
        <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="예: 아이유" />
      </label>
      <label className="full">
        메모
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="이 노래에 대한 메모 (선택)" />
      </label>
      <div className="row full">
        <button type="submit" disabled={busy || !info}>
          추가
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}

function EditForm({ track, onSave, onCancel }: { track: Item; onSave: (v: { title: string; artist: string; note: string }) => void; onCancel: () => void }) {
  const c = musicContent(track)
  const [title, setTitle] = useState(track.title)
  const [artist, setArtist] = useState(c.artist ?? '')
  const [note, setNote] = useState(c.note ?? '')
  return (
    <form
      className="link-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title: title.trim() || track.title, artist: artist.trim(), note: note.trim() })
      }}
    >
      <label>
        제목
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        가수
        <input value={artist} onChange={(e) => setArtist(e.target.value)} />
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
