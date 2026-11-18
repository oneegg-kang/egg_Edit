import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useVault } from '../data/VaultProvider'
import { childFolders, folderPath, uniqueName } from '../data/vault'
import { createDocument } from '../data/documents'
import type { Folder } from '../data/types'
import { href, useHashRoute } from '../lib/useHashRoute'

// ── 화면 틀 상태 (왼쪽 메뉴 열림, 문서 검색어) ─────────────

interface ShellState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebarOnMobile: () => void
  search: string
  setSearch: (q: string) => void
}

const ShellContext = createContext<ShellState | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useShell(): ShellState {
  const s = useContext(ShellContext)
  if (!s) throw new Error('useShell 은 AppShell 안에서만 쓸 수 있습니다.')
  return s
}

const isMobile = () => window.matchMedia('(max-width: 800px)').matches

/** 왼쪽 메뉴 + 오른쪽 내용. 휴대폰에서는 왼쪽 메뉴가 서랍처럼 열리고 닫힌다. */
export function AppShell({ email, onSignOut, children }: { email: string; onSignOut: () => void; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile())
  const [search, setSearch] = useState('')
  const route = useHashRoute()

  // 화면 폭이 휴대폰 ↔ PC 로 바뀌면 (창 크기 조절, 태블릿 회전) 메뉴를 그에 맞게
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 800px)')
    const onChange = () => setSidebarOpen(!mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // 휴대폰에서는 다른 화면으로 옮겨 가면 메뉴를 닫는다
  useEffect(() => {
    if (isMobile()) setSidebarOpen(false)
  }, [route.join('/')]) // eslint-disable-line react-hooks/exhaustive-deps

  const state: ShellState = {
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((o) => !o),
    closeSidebarOnMobile: () => isMobile() && setSidebarOpen(false),
    search,
    setSearch,
  }

  return (
    <ShellContext.Provider value={state}>
      <div className={`shell ${sidebarOpen ? 'side-open' : 'side-closed'}`}>
        <Sidebar email={email} onSignOut={onSignOut} />
        <div className="backdrop" onClick={() => setSidebarOpen(false)} />
        <div className="main">{children}</div>
      </div>
    </ShellContext.Provider>
  )
}

/** 편집 화면이 아닌 곳에서 휴대폰일 때 보이는 위쪽 막대 (메뉴 버튼) */
export function MobileBar({ title }: { title: string }) {
  const { toggleSidebar } = useShell()
  return (
    <div className="mobile-bar">
      <button className="icon-btn" onClick={toggleSidebar} aria-label="메뉴 열기">
        ☰
      </button>
      <strong>{title}</strong>
    </div>
  )
}

// ── 왼쪽 메뉴 ─────────────────────────────────────────

const NAV: { key: string; icon: string; label: string; soon?: string }[] = [
  { key: '', icon: '🏠', label: '홈' },
  { key: 'docs', icon: '📝', label: '문서' },
  { key: 'folders', icon: '📎', label: '파일' },
  { key: 'images', icon: '🎨', label: '이미지' },
  { key: 'music', icon: '🎵', label: '음악' },
  { key: 'videos', icon: '🎬', label: '동영상' },
]

function Sidebar({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { backend, folders, items, reload } = useVault()
  const { search, setSearch } = useShell()
  const [section, id] = useHashRoute()
  const [busy, setBusy] = useState(false)

  // 지금 보고 있는 폴더 (문서를 보고 있으면 그 문서가 들어 있는 폴더)
  const currentFolderId =
    section === 'folders' ? (id ?? null) : section === 'docs' && id ? (items.find((i) => i.id === id)?.folder_id ?? null) : null

  async function act(task: () => Promise<void>) {
    setBusy(true)
    try {
      await task()
    } catch (e) {
      alert(`실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const newDoc = () =>
    act(async () => {
      const doc = await createDocument(backend, currentFolderId)
      await reload()
      window.location.hash = href('docs', doc.id)
    })

  const newFolder = () => {
    const name = prompt('새 폴더 이름')?.trim()
    if (!name) return
    act(async () => {
      const f = await backend.createFolder(uniqueName(name, childFolders(folders, currentFolderId).map((x) => x.name)), currentFolderId)
      await reload()
      window.location.hash = href('folders', f.id)
    })
  }

  return (
    <aside className="sidebar" aria-label="메뉴">
      <div className="side-user">
        <span className="avatar" aria-hidden>
          {(email[0] ?? '?').toUpperCase()}
        </span>
        <span className="side-email" title={email}>
          <strong>egg_Edit</strong>
          <small>{email}</small>
        </span>
        <button className="link side-logout" onClick={onSignOut}>
          로그아웃
        </button>
      </div>

      <input
        className="side-search"
        type="search"
        placeholder="🔍 검색"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          // 문서 화면이 아니면 문서 화면으로 (문서 화면이면 가운데 목록이 바로 걸러진다)
          if (section !== 'docs') window.location.hash = href('docs')
        }}
      />

      <button className="side-primary" onClick={newDoc} disabled={busy}>
        📝 새 문서
      </button>
      <div className="side-pair">
        <button className="side-folder" onClick={newFolder} disabled={busy}>
          📁 새 폴더
        </button>
        <a className="side-backup" href="#/">
          💾 백업
        </a>
      </div>

      <nav className="side-nav">
        {NAV.map((n) =>
          n.soon ? (
            <span key={n.key} className="side-link disabled">
              {n.icon} {n.label} <span className="soon">{n.soon}</span>
            </span>
          ) : (
            <a key={n.key} className={`side-link ${section === n.key || (!section && !n.key) ? 'active' : ''}`} href={`#/${n.key}`}>
              {n.icon} {n.label}
            </a>
          ),
        )}
      </nav>

      <div className="side-tree">
        <a className={`side-link tree-root ${section === 'folders' && !id ? 'active' : ''}`} href={href('folders')}>
          🗂 내 폴더
        </a>
        <FolderTree folders={folders} parentId={null} currentId={currentFolderId} depth={0} />
      </div>
    </aside>
  )
}

function FolderTree({ folders, parentId, currentId, depth }: { folders: Folder[]; parentId: string | null; currentId: string | null; depth: number }) {
  const children = childFolders(folders, parentId)
  if (!children.length) return null
  return (
    <ul className="tree">
      {children.map((f) => (
        <TreeNode key={f.id} folder={f} folders={folders} currentId={currentId} depth={depth} />
      ))}
    </ul>
  )
}

function TreeNode({ folder, folders, currentId, depth }: { folder: Folder; folders: Folder[]; currentId: string | null; depth: number }) {
  const hasChildren = folders.some((f) => f.parent_id === folder.id)
  // 지금 보고 있는 폴더의 상위 폴더들은 자동으로 펼친다
  const isAncestor = currentId ? folderPath(folders, currentId).some((f) => f.id === folder.id && f.id !== currentId) : false
  const [open, setOpen] = useState(isAncestor)
  useEffect(() => {
    if (isAncestor) setOpen(true)
  }, [isAncestor])

  return (
    <li>
      <div className={`tree-row ${currentId === folder.id ? 'active' : ''}`} style={{ paddingLeft: 4 + depth * 14 }}>
        <button
          className={`twisty ${hasChildren ? '' : 'invisible'}`}
          onClick={() => setOpen(!open)}
          aria-label={open ? '접기' : '펼치기'}
          aria-expanded={open}
        >
          {open ? '⌄' : '›'}
        </button>
        <a href={href('folders', folder.id)} title={folder.name}>
          📒 {folder.name}
        </a>
      </div>
      {open && <FolderTree folders={folders} parentId={folder.id} currentId={currentId} depth={depth + 1} />}
    </li>
  )
}
