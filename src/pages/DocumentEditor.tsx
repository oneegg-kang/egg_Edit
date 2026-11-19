import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { editorExtensions } from '../editor/extensions'
import { Toolbar } from '../editor/Toolbar'
import { docForDisplay, docForSave, htmlForSave, imagePaths, isImageFile, uploadDocImage } from '../editor/images'
import { useVault } from '../data/VaultProvider'
import type { Item } from '../data/types'
import { addTag, docContent, docTags, formatLastEdited, isNewerRemote, standaloneHtml, UNTITLED } from '../data/documents'
import { safeFileName } from '../backup/backup'
import { deleteItems, folderPath } from '../data/vault'
import { href } from '../lib/useHashRoute'
import { MobileBar, useShell } from './AppShell'
import { saveFile } from '../lib/platform'

const SAVE_DELAY_MS = 800

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
const SAVE_LABEL: Record<SaveState, string> = {
  saved: '저장됨',
  dirty: '수정 중…',
  saving: '저장 중…',
  error: '저장 실패 (다시 시도 중)',
}

export function DocumentEditorPage({ id }: { id: string }) {
  const { items, folders, loading } = useVault()
  const item = items.find((i) => i.id === id)
  if (!item) {
    return (
      <div className="page">
        <MobileBar title="문서" />
        <section className="card">
          <p className="muted">{loading ? '불러오는 중…' : '문서를 찾을 수 없습니다. 다른 기기에서 삭제되었을 수 있어요.'}</p>
          <a href={href('docs')}>문서 목록으로</a>
        </section>
      </div>
    )
  }
  // key: 다른 문서로 옮겨 가면 편집기를 새로 만든다
  return <DocumentEditor key={item.id} item={item} path={folderPath(folders, item.folder_id).map((f) => f.name)} />
}

function DocumentEditor({ item, path }: { item: Item; path: string[] }) {
  const { backend, reload, userId } = useVault()
  const { toggleSidebar, sidebarOpen } = useShell()
  const [title, setTitle] = useState(item.title)
  const [tags, setTags] = useState(docTags(item))
  const [tagDraft, setTagDraft] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [remoteChanged, setRemoteChanged] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const titleRef = useRef(item.title)
  const tagsRef = useRef(docTags(item))
  const knownUpdatedAt = useRef(item.updated_at) // 내가 마지막으로 저장/불러온 시각
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const attachmentsRef = useRef(new Set<string>([...(docContent(item).attachments ?? []), ...imagePaths(docContent(item).doc)]))
  const imageInput = useRef<HTMLInputElement>(null)
  const [imageStatus, setImageStatus] = useState<string | null>(null)

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    const editor = editorRef.current
    if (!editor || !dirty.current) return
    dirty.current = false
    setSaveState('saving')
    try {
      const saved = await backend.updateItem(item.id, {
        title: titleRef.current.trim(),
        content: {
          doc: docForSave(editor.getJSON()),
          html: htmlForSave(editor.getHTML()),
          text: editor.getText(),
          tags: tagsRef.current,
          // 한 번이라도 넣었던 이미지는 모두 기록 (되돌리기로 다시 살아날 수 있으므로). 문서를 지울 때 함께 지운다.
          attachments: [...attachmentsRef.current],
        },
      })
      knownUpdatedAt.current = saved.updated_at
      setSaveState(dirty.current ? 'dirty' : 'saved')
    } catch {
      dirty.current = true
      setSaveState('error')
      timer.current = setTimeout(save, 5000) // 네트워크가 끊겼을 수 있으니 잠시 뒤 다시
    }
  }, [backend, item.id])

  const markDirty = useCallback(() => {
    dirty.current = true
    setSaveState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(save, SAVE_DELAY_MS)
  }, [save])

  const editor = useEditor({
    extensions: editorExtensions(),
    content: '',
    editable: false, // 이미지 주소를 받아 내용을 넣은 뒤에 쓸 수 있게 한다
    onUpdate: markDirty,
    editorProps: {
      // 이미지를 붙여 넣거나(Ctrl+V) 끌어다 놓으면 저장소에 올리고 넣는다
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile)
        if (!files.length) return false
        insertImagesRef.current(files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter(isImageFile)
        if (moved || !files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        insertImagesRef.current(files, pos)
        return true
      },
    },
  })
  editorRef.current = editor

  // 처음 열 때: 문서 속 이미지의 볼 수 있는 주소를 받아서 내용을 넣는다
  useEffect(() => {
    if (!editor) return
    let cancelled = false
    docForDisplay(docContent(item).doc, backend).then((doc) => {
      if (cancelled || editor.isDestroyed) return
      editor.commands.setContent((doc as object | null) ?? '', { emitUpdate: false })
      editor.setEditable(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  async function insertImages(files: File[], pos?: number) {
    if (!editor) return
    const failed: string[] = []
    for (const [n, file] of files.entries()) {
      setImageStatus(`이미지 올리는 중 (${n + 1}/${files.length}) ${file.name}`)
      try {
        const attrs = await uploadDocImage(backend, userId, item.id, file)
        attachmentsRef.current.add(attrs.storagePath)
        const chain = editor.chain().focus()
        if (pos !== undefined) chain.setTextSelection(pos)
        // 이미지 아래에 빈 줄을 두고 커서를 거기로 (이미지가 선택된 채로 남아 다음 입력에 덮어써지지 않게)
        chain.insertContent([{ type: 'image', attrs }, { type: 'paragraph' }]).run()
        pos = undefined // 여러 장이면 이어서 넣는다
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setImageStatus(failed.length ? `이미지 ${failed.length}개 실패\n${failed.join('\n')}` : null)
    markDirty()
  }
  const insertImagesRef = useRef(insertImages)
  insertImagesRef.current = insertImages

  // 화면을 떠나거나 창을 닫을 때 저장하지 못한 것이 있으면 바로 저장
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        save()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      if (dirty.current) save()
    }
  }, [save])

  // 다른 기기에서 이 문서를 저장했을 때
  useEffect(() => {
    if (!isNewerRemote(item.updated_at, knownUpdatedAt.current)) return
    if (dirty.current) {
      setRemoteChanged(true) // 내가 쓰는 중이면 덮어쓰지 않고 알려만 준다
    } else {
      loadRemote()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.updated_at])

  async function loadRemote() {
    if (!editor) return
    const doc = await docForDisplay(docContent(item).doc, backend)
    editor.commands.setContent((doc as object | null) ?? '', { emitUpdate: false })
    for (const p of [...(docContent(item).attachments ?? []), ...imagePaths(docContent(item).doc)]) attachmentsRef.current.add(p)
    setTitle(item.title)
    titleRef.current = item.title
    setTags(docTags(item))
    tagsRef.current = docTags(item)
    knownUpdatedAt.current = item.updated_at
    dirty.current = false
    clearTimeout(timer.current)
    setSaveState('saved')
    setRemoteChanged(false)
  }

  function changeTags(next: string[]) {
    setTags(next)
    tagsRef.current = next
    markDirty()
  }

  function commitTagDraft() {
    if (tagDraft.trim()) changeTags(addTag(tags, tagDraft))
    setTagDraft('')
  }

  async function remove() {
    setMenuOpen(false)
    if (!confirm(`'${title.trim() || UNTITLED}' 문서를 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return
    dirty.current = false
    clearTimeout(timer.current)
    await deleteItems(backend, [item])
    window.location.hash = href('docs')
    reload()
  }

  async function downloadHtml() {
    setMenuOpen(false)
    if (!editor) return
    const name = title.trim() || UNTITLED
    const blob = new Blob([standaloneHtml(name, editor.getHTML())], { type: 'text/html' })
    const r = await saveFile(blob, `${safeFileName(name)}.html`).catch((e) => `저장 실패: ${e instanceof Error ? e.message : String(e)}`)
    if (r && r !== 'cancelled') setImageStatus(r)
  }

  return (
    <section className="note">
      <header className="note-top">
        <a className="icon-btn mobile-only" href={href('docs')} aria-label="문서 목록으로">
          ←
        </a>
        <button
          className="icon-btn desktop-only"
          onClick={toggleSidebar}
          title={sidebarOpen ? '메뉴와 목록 접기 (넓게 보기)' : '메뉴와 목록 펼치기'}
          aria-label={sidebarOpen ? '메뉴 접기' : '메뉴 펼치기'}
        >
          {sidebarOpen ? '⤢' : '☰'}
        </button>
        <span className="vsep" />
        <nav className="note-crumb" aria-label="위치">
          {item.folder_id ? (
            <a href={href('folders', item.folder_id)} title={path.join(' / ')}>
              📒 {path[path.length - 1]}
            </a>
          ) : (
            <a href={href('docs')}>📝 문서</a>
          )}
          <span className="crumb-sep">›</span>
          <span className="crumb-current">📄 {title.trim() || UNTITLED}</span>
        </nav>
        <span className={`save-state ${saveState}`}>{SAVE_LABEL[saveState]}</span>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="더 보기" aria-expanded={menuOpen}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
              <div className="menu" role="menu">
                {item.folder_id && (
                  <a role="menuitem" href={href('folders', item.folder_id)}>
                    📒 폴더 열기
                  </a>
                )}
                <button role="menuitem" onClick={downloadHtml}>
                  ⬇ HTML로 내려받기
                </button>
                <button role="menuitem" className="danger" onClick={remove}>
                  🗑 삭제
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="note-meta">{formatLastEdited(item.updated_at)}에 마지막으로 편집</div>

      {editor && <Toolbar editor={editor} onPickImages={() => imageInput.current?.click()} />}
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].filter(isImageFile)
          e.target.value = ''
          if (files.length) insertImages(files)
        }}
      />
      {imageStatus && <p className="message image-status">{imageStatus}</p>}

      <div className="note-scroll">
        <div className="note-paper">
          {remoteChanged && (
            <p className="message">
              다른 기기에서 이 문서가 수정되었어요. 지금 쓰는 내용을 저장하면 그쪽 내용을 덮어씁니다.{' '}
              <button className="link" onClick={loadRemote}>
                다른 기기 내용 불러오기
              </button>
            </p>
          )}
          <input
            className="note-title"
            value={title}
            placeholder={UNTITLED}
            aria-label="제목"
            onChange={(e) => {
              setTitle(e.target.value)
              titleRef.current = e.target.value
              markDirty()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (!editor) return
                editor.view.focus() // 바로 이어서 치는 글자가 본문으로 가도록 즉시 옮긴다
                editor.commands.focus('start')
              }
            }}
          />
          <EditorContent editor={editor} className="editor" />
        </div>
      </div>

      <footer className="note-tags">
        <span aria-hidden>🏷</span>
        {tags.map((t) => (
          <span key={t} className="tag">
            #{t}
            <button onClick={() => changeTags(tags.filter((x) => x !== t))} aria-label={`태그 ${t} 지우기`}>
              ×
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          value={tagDraft}
          placeholder="태그 추가"
          aria-label="태그 추가"
          onChange={(e) => {
            // 쉼표를 치면 바로 태그로
            if (e.target.value.endsWith(',')) {
              changeTags(addTag(tags, e.target.value.slice(0, -1)))
              setTagDraft('')
            } else setTagDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              commitTagDraft()
            } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
              changeTags(tags.slice(0, -1))
            }
          }}
          onBlur={commitTagDraft}
        />
      </footer>
    </section>
  )
}
