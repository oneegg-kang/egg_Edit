import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useVault } from '../data/VaultProvider'
import type { Item } from '../data/types'
import { CANVAS_PRESETS, canvasFromPhotos, createDrawing, filterImages, imageContent, imagesOf, type ImageFilter } from '../data/images'
import { deleteItems, formatBytes, formatWhen, uploadFileItem } from '../data/vault'
import { MAX_FILE_BYTES } from '../data/uploadTree'
import { docImagePath, isImageFile } from '../editor/images'
import { naturalSize } from '../lib/naturalSize'
import { useFileUrl } from '../lib/useFileUrl'
import { href } from '../lib/useHashRoute'
import { useShell } from './AppShell'
import { TakePhotoButton } from './CameraCapture'

const FILTERS: { id: ImageFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'drawing', label: '✏️ 그림' },
  { id: 'photo', label: '📷 사진' },
  { id: 'favorite', label: '♥ 즐겨찾기' },
]

export function ImagesPage() {
  const { backend, userId, items, loading, reload } = useVault()
  const { toggleSidebar } = useShell()
  const [filter, setFilter] = useState<ImageFilter>('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const editInput = useRef<HTMLInputElement>(null)

  const all = imagesOf(items)
  const images = filterImages(all, filter, query)

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
    const pics = files.filter(isImageFile)
    if (!pics.length) return setStatus('사진 파일(jpg, png, gif, webp 등)만 올릴 수 있어요.')
    run(async () => {
      const failed: string[] = []
      for (const [n, file] of pics.entries()) {
        setStatus(`올리는 중 (${n + 1}/${pics.length}) ${file.name}`)
        if (file.size > MAX_FILE_BYTES) {
          failed.push(`${file.name}: 50MB 보다 커서 건너뜀`)
          continue
        }
        try {
          await uploadFileItem(backend, userId, file, null, [], 'image', {
            title: file.name.replace(/\.[^.]+$/, ''),
            content: { source: 'photo' },
          })
        } catch (e) {
          failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const ok = pics.length - failed.length
      return failed.length ? `${ok}장 올림, ${failed.length}장 실패\n${failed.join('\n')}` : `${ok}장을 올렸습니다.`
    })
  }

  const newDrawing = (w: number, h: number) =>
    run(async () => {
      const item = await createDrawing(backend, w, h)
      setNewOpen(false)
      window.location.hash = href('images', item.id)
    })

  /** 사진(여러 장 가능)을 불러와서 바로 편집기로 */
  const editPhotos = (files: File[]) => {
    const pics = files.filter(isImageFile)
    if (!pics.length) return setStatus('사진 파일(jpg, png, gif, webp 등)을 골라 주세요.')
    run(async () => {
      const item = await createDrawing(backend, 1600, 900)
      const uploaded: { storagePath: string; width: number; height: number }[] = []
      for (const [n, file] of pics.entries()) {
        setStatus(`사진 준비 중 (${n + 1}/${pics.length}) ${file.name}`)
        const size = await naturalSize(file)
        const path = docImagePath(userId, item.id, file)
        await backend.uploadFile(path, file, file.type || 'image/jpeg')
        uploaded.push({ storagePath: path, ...size })
      }
      const canvas = canvasFromPhotos(uploaded)
      await backend.updateItem(item.id, {
        title: pics.length === 1 ? pics[0].name.replace(/\.[^.]+$/, '') : `사진 ${pics.length}장 편집`,
        content: { canvas, source: 'photo', width: canvas.width, height: canvas.height, attachments: uploaded.map((u) => u.storagePath) },
      })
      setNewOpen(false)
      window.location.hash = href('images', item.id)
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    upload([...e.dataTransfer.files])
  }

  return (
    <section
      className={`music images ${dragging ? 'dragging' : ''}`}
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
          <h2>🎨 이미지</h2>
          <small className="muted">
            {all.length}개 · 그림 {all.filter((i) => imageContent(i).source === 'drawing').length} · 사진{' '}
            {all.filter((i) => imageContent(i).source !== 'drawing').length}
          </small>
        </div>
        <button onClick={() => setNewOpen(!newOpen)} disabled={busy}>
          ✏️ 새로 만들기 / 편집
        </button>
        <TakePhotoButton onPhotos={upload} />
        <button className="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          ⬆ 사진 올리기
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            upload([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      {newOpen && (
        <div className="yt-panel">
          <div className="yt-head">
            <strong>새로 만들기</strong>
            <button className="icon-btn" onClick={() => setNewOpen(false)} aria-label="닫기">
              ✕
            </button>
          </div>
          <div className="start-photos">
            <button className="start-big" onClick={() => editInput.current?.click()} disabled={busy}>
              <span>🖼</span>
              <strong>사진 불러와서 편집</strong>
              <small>여러 장을 고르면 나란히 놓고 크기·각도를 편집해요</small>
            </button>
            <TakePhotoButton className="start-big" label="📷 찍어서 편집" onPhotos={editPhotos} disabled={busy} />
            <input
              ref={editInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                editPhotos([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </div>
          <small className="muted">또는 빈 캔버스에 그리기:</small>
          <div className="presets">
            {CANVAS_PRESETS.map((p) => (
              <button key={p.label} className="preset" onClick={() => newDrawing(p.width, p.height)} disabled={busy}>
                <span className="preset-box" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="music-filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
            {f.label}
          </button>
        ))}
        <input className="grow" type="search" placeholder="제목, 메모로 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {status && <p className="message" style={{ whiteSpace: 'pre-line' }}>{status}</p>}

      {loading ? (
        <p className="muted empty">불러오는 중…</p>
      ) : images.length === 0 ? (
        <p className="muted empty">
          {all.length ? '조건에 맞는 이미지가 없어요.' : '아직 이미지가 없어요.\n[✏️ 새 그림] 으로 그림을 그리거나, 사진을 여기로 끌어다 놓아 보세요.'}
        </p>
      ) : (
        <ul className="image-grid">
          {images.map((img, n) => (
            <ImageCard
              key={img.id}
              image={img}
              onView={() => setViewIndex(n)}
              onFavorite={() => run(async () => void (await backend.updateItem(img.id, { content: { ...img.content, favorite: !imageContent(img).favorite } })))}
              onRename={() => {
                const t = prompt('이름 바꾸기', img.title)?.trim()
                if (t && t !== img.title) run(async () => void (await backend.updateItem(img.id, { title: t })))
              }}
              onDownload={() => run(async () => window.location.assign(await backend.fileUrl(img.storage_path!, `${img.title}.${img.mime_type === 'image/png' ? 'png' : 'jpg'}`)))}
              onDelete={() => {
                if (!confirm(`'${img.title}' 을(를) 삭제할까요? 원본 사진과 편집한 그림이 모두 지워집니다.`)) return
                run(async () => {
                  await deleteItems(backend, [img])
                  return `'${img.title}' 을(를) 삭제했습니다.`
                })
              }}
            />
          ))}
        </ul>
      )}

      {viewIndex !== null && images[viewIndex] && (
        <ImageViewer images={images} index={viewIndex} onIndex={setViewIndex} onClose={() => setViewIndex(null)} />
      )}
    </section>
  )
}

function ImageCard({
  image,
  onView,
  onFavorite,
  onRename,
  onDownload,
  onDelete,
}: {
  image: Item
  onView: () => void
  onFavorite: () => void
  onRename: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const { backend } = useVault()
  const url = useFileUrl(backend, image.storage_path)
  const c = imageContent(image)
  const [menu, setMenu] = useState(false)
  const pick = (fn: () => void) => () => (setMenu(false), fn())
  return (
    <li className="image-card">
      <button className={`image-thumb ${c.source === 'drawing' ? 'whole' : ''}`} onClick={image.storage_path ? onView : () => (window.location.hash = href('images', image.id))} aria-label={`${image.title} 크게 보기`}>
        {url ? <img src={url} alt="" loading="lazy" /> : <span className="video-noimg">{c.source === 'drawing' ? '✏️' : '🖼'}</span>}
        {c.source === 'drawing' && <span className="badge-src draw">그림</span>}
      </button>
      <div className="video-info">
        <div className="grow">
          <strong title={image.title}>{image.title}</strong>
          <small className="muted">
            {[formatWhen(image.updated_at), c.width && c.height ? `${c.width}×${c.height}` : '', formatBytes(image.size_bytes)].filter(Boolean).join(' · ')}
          </small>
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
                <a role="menuitem" href={href('images', image.id)}>
                  ✏️ 편집
                </a>
                <button role="menuitem" onClick={pick(onRename)}>
                  ✎ 이름 바꾸기
                </button>
                {image.storage_path && (
                  <button role="menuitem" onClick={pick(onDownload)}>
                    ⬇ 내려받기
                  </button>
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

/** 화면 가득 보기. ← → 로 넘기기 */
function ImageViewer({ images, index, onIndex, onClose }: { images: Item[]; index: number; onIndex: (n: number) => void; onClose: () => void }) {
  const { backend } = useVault()
  const image = images[index]
  const url = useFileUrl(backend, image.storage_path)
  const go = (d: number) => onIndex((index + d + images.length) % images.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={image.title} onClick={onClose}>
      <div className="viewer-box" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-head">
          <strong>
            {image.title} <small>({index + 1}/{images.length})</small>
          </strong>
          <a className="secondary small" href={href('images', image.id)}>
            ✏️ 편집
          </a>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="viewer-image">
          {images.length > 1 && (
            <button className="viewer-nav prev" onClick={() => go(-1)} aria-label="이전 이미지">
              ‹
            </button>
          )}
          {url ? <img src={url} alt={image.title} /> : <p className="muted">불러오는 중…</p>}
          {images.length > 1 && (
            <button className="viewer-nav next" onClick={() => go(1)} aria-label="다음 이미지">
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
