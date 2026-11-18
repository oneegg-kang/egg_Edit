import { useRef, useState, type DragEvent } from 'react'
import { useVault } from '../data/VaultProvider'
import type { Folder, Item } from '../data/types'
import {
  childFolders,
  deleteFolderRecursive,
  deleteItems,
  folderDeletionScope,
  folderPath,
  formatBytes,
  itemsIn,
  uniqueName,
  uploadFileItem,
} from '../data/vault'
import { href } from '../lib/useHashRoute'

const KIND_ICON: Record<Item['kind'], string> = { document: '📝', image: '🎨', file: '📄', music: '🎵' }

export function FoldersPage({ folderId }: { folderId: string | null }) {
  const { backend, userId, folders, items, loading, error, reload } = useVault()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const current = folderId ? folders.find((f) => f.id === folderId) : null
  const subfolders = childFolders(folders, folderId)
  const files = itemsIn(items, folderId)
  const path = folderPath(folders, folderId)

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

  const askName = (message: string, initial = '') => {
    const name = prompt(message, initial)?.trim()
    return name ? name : null
  }

  const newFolder = () => {
    const name = askName('새 폴더 이름')
    if (!name) return
    run(async () => {
      await backend.createFolder(uniqueName(name, subfolders.map((f) => f.name)), folderId)
    })
  }

  const renameFolder = (f: Folder) => {
    const name = askName('폴더 이름 바꾸기', f.name)
    if (!name || name === f.name) return
    const siblings = childFolders(folders, f.parent_id).filter((s) => s.id !== f.id).map((s) => s.name)
    run(() => backend.updateFolder(f.id, { name: uniqueName(name, siblings) }))
  }

  const removeFolder = (f: Folder) => {
    const scope = folderDeletionScope(folders, items, f.id)
    const extra = [
      scope.folderIds.length > 1 ? `하위 폴더 ${scope.folderIds.length - 1}개` : '',
      scope.items.length ? `항목 ${scope.items.length}개` : '',
    ].filter(Boolean)
    const detail = extra.length ? `\n안에 있는 ${extra.join(', ')}도 함께 삭제됩니다.` : ''
    if (!confirm(`'${f.name}' 폴더를 삭제할까요?${detail}\n삭제하면 되돌릴 수 없습니다.`)) return
    run(async () => {
      await deleteFolderRecursive(backend, folders, items, f.id)
      return `'${f.name}' 폴더를 삭제했습니다.`
    })
  }

  const upload = (list: FileList | File[]) => {
    const picked = [...list]
    if (!picked.length) return
    run(async () => {
      const taken = files.map((i) => i.title)
      const failed: string[] = []
      for (const [n, file] of picked.entries()) {
        setStatus(`올리는 중 (${n + 1}/${picked.length}) ${file.name}`)
        try {
          const item = await uploadFileItem(backend, userId, file, folderId, taken)
          taken.push(item.title)
        } catch (e) {
          failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const ok = picked.length - failed.length
      return failed.length ? `${ok}개 올림, ${failed.length}개 실패\n${failed.join('\n')}` : `${ok}개 파일을 올렸습니다.`
    })
  }

  const download = (item: Item) =>
    run(async () => {
      const url = await backend.fileUrl(item.storage_path!, item.title)
      window.location.assign(url)
    })

  const renameItem = (item: Item) => {
    const name = askName('이름 바꾸기', item.title)
    if (!name || name === item.title) return
    const siblings = files.filter((i) => i.id !== item.id).map((i) => i.title)
    run(() => backend.updateItem(item.id, { title: uniqueName(name, siblings) }))
  }

  const removeItem = (item: Item) => {
    if (!confirm(`'${item.title}' 을(를) 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return
    run(async () => {
      await deleteItems(backend, [item])
      return `'${item.title}' 을(를) 삭제했습니다.`
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    upload(e.dataTransfer.files)
  }

  if (folderId && !current && !loading) {
    return (
      <section className="card">
        <p>폴더를 찾을 수 없습니다. 다른 기기에서 삭제되었을 수 있어요.</p>
        <a href={href('folders')}>최상위 폴더로</a>
      </section>
    )
  }

  return (
    <section
      className={`card dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <nav className="breadcrumb">
        <a href={href('folders')}>📁 내 폴더</a>
        {path.map((f) => (
          <span key={f.id}>
            {' / '}
            <a href={href('folders', f.id)}>{f.name}</a>
          </span>
        ))}
      </nav>

      <div className="row">
        <button onClick={newFolder} disabled={busy}>
          + 새 폴더
        </button>
        <button className="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          ⬆ 파일 올리기
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) upload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {status && <p className="message" style={{ whiteSpace: 'pre-line' }}>{status}</p>}
      {error && <p className="message">불러오기 실패: {error}</p>}

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : subfolders.length === 0 && files.length === 0 ? (
        <p className="muted empty">비어 있어요. 새 폴더를 만들거나 파일을 여기로 끌어다 놓으세요.</p>
      ) : (
        <ul className="list">
          {subfolders.map((f) => (
            <li key={f.id}>
              <a className="name" href={href('folders', f.id)}>
                📁 {f.name}
              </a>
              <span className="actions">
                <button className="link" onClick={() => renameFolder(f)} disabled={busy}>
                  이름 변경
                </button>
                <button className="link danger" onClick={() => removeFolder(f)} disabled={busy}>
                  삭제
                </button>
              </span>
            </li>
          ))}
          {files.map((i) => (
            <li key={i.id}>
              <span className="name">
                {KIND_ICON[i.kind]} {i.title}
                <small className="muted"> {formatBytes(i.size_bytes)}</small>
              </span>
              <span className="actions">
                {i.storage_path && (
                  <button className="link" onClick={() => download(i)} disabled={busy}>
                    내려받기
                  </button>
                )}
                <button className="link" onClick={() => renameItem(i)} disabled={busy}>
                  이름 변경
                </button>
                <button className="link danger" onClick={() => removeItem(i)} disabled={busy}>
                  삭제
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
