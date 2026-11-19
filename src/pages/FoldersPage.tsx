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
} from '../data/vault'
import { summarize, uploadPlan, type UploadPlan } from '../data/uploadTree'
import { createDocument, docTitle } from '../data/documents'
import { readDataTransfer, readDirectoryInput } from '../lib/readDropped'
import { href } from '../lib/useHashRoute'
import { downloadFromUrl } from '../lib/platform'

const KIND_ICON: Record<Item['kind'], string> = { document: '📝', image: '🎨', file: '📄', music: '🎵', video: '🎬' }

export function FoldersPage({ folderId }: { folderId: string | null }) {
  const { backend, userId, folders, items, loading, error, reload } = useVault()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

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

  const upload = (plan: UploadPlan) => {
    const sum = summarize(plan)
    if (sum.files === 0 && sum.folders === 0) return
    // 폴더가 섞여 있거나 양이 많으면 먼저 확인한다
    if (sum.folders > 0 || sum.files > 20) {
      const lines = [
        `폴더 ${sum.folders}개, 파일 ${sum.files}개 (${formatBytes(sum.bytes)})를 올릴까요?`,
        sum.tooBig.length ? `50MB 보다 큰 파일 ${sum.tooBig.length}개는 건너뜁니다.` : '',
      ].filter(Boolean)
      if (!confirm(lines.join('\n'))) return
    }
    run(async () => {
      const r = await uploadPlan(backend, userId, plan, folderId, { folders, items }, (done, total, name) =>
        setStatus(name ? `올리는 중 (${done + 1}/${total}) ${name}` : '마무리하는 중…'),
      )
      const parts = [r.folders ? `폴더 ${r.folders}개` : '', `파일 ${r.uploaded}개`].filter(Boolean)
      const head = `${parts.join(', ')}를 올렸습니다.`
      if (!r.failed.length) return head
      const shown = r.failed.slice(0, 10).map((f) => `• ${f.name}: ${f.reason}`)
      if (r.failed.length > 10) shown.push(`… 외 ${r.failed.length - 10}개`)
      return `${head}\n실패 ${r.failed.length}개:\n${shown.join('\n')}`
    })
  }

  const newDocument = () =>
    run(async () => {
      const doc = await createDocument(backend, folderId)
      window.location.hash = href('docs', doc.id)
    })

  const download = (item: Item) =>
    run(async () => {
      const url = await backend.fileUrl(item.storage_path!, item.title)
      const r = await downloadFromUrl(url, item.title)
      return r && r !== 'cancelled' ? r : undefined
    })

  const renameItem = (item: Item) => {
    const name = askName('이름 바꾸기', item.title)
    if (!name || name === item.title) return
    const siblings = files.filter((i) => i.id !== item.id).map((i) => i.title)
    run(async () => {
      await backend.updateItem(item.id, { title: uniqueName(name, siblings) })
    })
  }

  const removeItem = (item: Item) => {
    const name = item.kind === 'document' ? docTitle(item) : item.title
    if (!confirm(`'${name}' 을(를) 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return
    run(async () => {
      await deleteItems(backend, [item])
      return `'${name}' 을(를) 삭제했습니다.`
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    // readDataTransfer 는 await 전에 불러야 한다 (이벤트가 끝나면 내용이 사라짐)
    readDataTransfer(e.dataTransfer)
      .then(upload)
      .catch((err) => setStatus(`읽기 실패: ${err instanceof Error ? err.message : String(err)}`))
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
      onDragLeave={(e) => {
        // 안쪽 요소로 옮겨 갈 때는 무시 (테두리 깜빡임 방지)
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
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
        <button className="secondary" onClick={newDocument} disabled={busy}>
          + 새 문서
        </button>
        <button className="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
          ⬆ 파일 올리기
        </button>
        <button className="secondary" onClick={() => folderInput.current?.click()} disabled={busy}>
          ⬆ 폴더 올리기
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) upload({ dirs: [], files: [...e.target.files].map((file) => ({ path: [], file })) })
            e.target.value = ''
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          // 폴더를 통째로 고르는 기능 (PC 브라우저)
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(e) => {
            if (e.target.files) upload(readDirectoryInput(e.target.files))
            e.target.value = ''
          }}
        />
      </div>

      {status && <p className="message" style={{ whiteSpace: 'pre-line' }}>{status}</p>}
      {error && <p className="message">불러오기 실패: {error}</p>}

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : subfolders.length === 0 && files.length === 0 ? (
        <p className="muted empty">비어 있어요. 새 폴더를 만들거나, PC의 파일이나 폴더를 여기로 끌어다 놓으세요.</p>
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
              {i.kind === 'document' ? (
                <a className="name" href={href('docs', i.id)}>
                  {KIND_ICON[i.kind]} {docTitle(i)}
                </a>
              ) : i.kind === 'image' ? (
                <a className="name" href={href('images', i.id)}>
                  {KIND_ICON[i.kind]} {i.title}
                  <small className="muted"> {formatBytes(i.size_bytes)}</small>
                </a>
              ) : (
                <span className="name">
                  {KIND_ICON[i.kind]} {i.title}
                  <small className="muted"> {formatBytes(i.size_bytes)}</small>
                </span>
              )}
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
