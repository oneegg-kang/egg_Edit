import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Highlight from '@tiptap/extension-highlight'
import { useVault } from '../data/VaultProvider'
import type { Item } from '../data/types'
import { addTag, docContent, docTags, formatLastEdited, isNewerRemote, standaloneHtml, UNTITLED } from '../data/documents'
import { safeFileName } from '../backup/backup'
import { deleteItems, folderPath } from '../data/vault'
import { href } from '../lib/useHashRoute'
import { MobileBar, useShell } from './AppShell'

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
  const { backend, reload } = useVault()
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

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    const editor = editorRef.current
    if (!editor || !dirty.current) return
    dirty.current = false
    setSaveState('saving')
    try {
      const saved = await backend.updateItem(item.id, {
        title: titleRef.current.trim(),
        content: { doc: editor.getJSON(), html: editor.getHTML(), text: editor.getText(), tags: tagsRef.current },
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
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      Placeholder.configure({ placeholder: '여기에 글을 쓰세요…' }),
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: { checkboxLabel: (node, checked) => `할 일 ${checked ? '완료' : '미완료'}: ${node.textContent || '빈 항목'}` },
      }),
      Highlight,
    ],
    content: (docContent(item).doc as object | null) ?? '',
    onUpdate: markDirty,
  })
  editorRef.current = editor

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

  function loadRemote() {
    if (!editor) return
    editor.commands.setContent((docContent(item).doc as object | null) ?? '', { emitUpdate: false })
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

  function downloadHtml() {
    setMenuOpen(false)
    if (!editor) return
    const name = title.trim() || UNTITLED
    const blob = new Blob([standaloneHtml(name, editor.getHTML())], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeFileName(name)}.html`
    a.click()
    URL.revokeObjectURL(url)
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

      {editor && <Toolbar editor={editor} />}

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

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      code: e.isActive('codeBlock'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = prompt('링크 주소 (비우면 링크 해제)', prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '' || url.trim() === 'https://') c().extendMarkRange('link').unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  const B = ({ on, label, title, run, disabled }: { on?: boolean; label: string; title: string; run: () => void; disabled?: boolean }) => (
    <button
      type="button"
      className={`tool ${on ? 'on' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // 편집기 선택 영역을 잃지 않도록
      onClick={run}
    >
      {label}
    </button>
  )

  return (
    <div className="toolbar" role="toolbar" aria-label="서식">
      <B label="↶" title="되돌리기" run={() => c().undo().run()} disabled={!s.canUndo} />
      <B label="↷" title="다시 하기" run={() => c().redo().run()} disabled={!s.canRedo} />
      <span className="sep" />
      <B label="H1" title="큰 제목" on={s.h1} run={() => c().toggleHeading({ level: 1 }).run()} />
      <B label="H2" title="중간 제목" on={s.h2} run={() => c().toggleHeading({ level: 2 }).run()} />
      <B label="H3" title="작은 제목" on={s.h3} run={() => c().toggleHeading({ level: 3 }).run()} />
      <span className="sep" />
      <B label="B" title="굵게" on={s.bold} run={() => c().toggleBold().run()} />
      <B label="I" title="기울임" on={s.italic} run={() => c().toggleItalic().run()} />
      <B label="U" title="밑줄" on={s.underline} run={() => c().toggleUnderline().run()} />
      <B label="S" title="취소선" on={s.strike} run={() => c().toggleStrike().run()} />
      <B label="🖍" title="형광펜" on={s.highlight} run={() => c().toggleHighlight().run()} />
      <B label="🔗" title="링크" on={s.link} run={setLink} />
      <span className="sep" />
      <B label="•" title="글머리 목록" on={s.bullet} run={() => c().toggleBulletList().run()} />
      <B label="1." title="번호 목록" on={s.ordered} run={() => c().toggleOrderedList().run()} />
      <B label="☑" title="체크리스트" on={s.task} run={() => c().toggleTaskList().run()} />
      <B label="❝" title="인용" on={s.quote} run={() => c().toggleBlockquote().run()} />
      <B label="</>" title="코드" on={s.code} run={() => c().toggleCodeBlock().run()} />
      <B label="―" title="구분선" run={() => c().setHorizontalRule().run()} />
    </div>
  )
}
