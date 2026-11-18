import { useEffect, useRef, useState } from 'react'
import { useVault } from '../data/VaultProvider'
import { createDocument, docPreview, docTags, docTitle, documentsOf, searchDocuments } from '../data/documents'
import { folderPath, formatWhen } from '../data/vault'
import { href } from '../lib/useHashRoute'
import { useShell } from './AppShell'
import { DocumentEditorPage } from './DocumentEditor'

/**
 * 문서 화면: 가운데에 문서 목록, 오른쪽에 고른 문서의 편집 화면.
 * 휴대폰에서는 둘 중 하나만 보인다 (문서를 고르면 편집 화면, ← 로 목록).
 */
export function DocumentsPage({ selectedId }: { selectedId: string | null }) {
  return (
    <div className={`docs-split ${selectedId ? 'has-selection' : ''}`}>
      <DocList selectedId={selectedId} />
      <div className="docs-detail">{selectedId ? <DocumentEditorPage id={selectedId} /> : <NothingSelected />}</div>
    </div>
  )
}

function useNewDocument() {
  const { backend, reload } = useVault()
  const [error, setError] = useState<string | null>(null)
  const create = async () => {
    try {
      const doc = await createDocument(backend, null)
      await reload()
      window.location.hash = href('docs', doc.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return { create, error }
}

function DocList({ selectedId }: { selectedId: string | null }) {
  const { items, folders, loading } = useVault()
  const { search: query, setSearch: setQuery, toggleSidebar } = useShell()
  const { create, error } = useNewDocument()
  const all = documentsOf(items)
  const docs = searchDocuments(all, query)
  const selectedRef = useRef<HTMLAnchorElement>(null)

  // 고른 문서가 목록에서 보이도록
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <section className="doc-list" aria-label="문서 목록">
      <header className="doc-list-head">
        <button className="icon-btn mobile-only" onClick={toggleSidebar} aria-label="메뉴 열기">
          ☰
        </button>
        <div className="grow">
          <h2>📝 문서</h2>
          <small className="muted">{query ? `${docs.length}개 찾음 / 전체 ${all.length}개` : `${all.length}개 문서`}</small>
        </div>
        <button className="icon-btn add" onClick={create} title="새 문서" aria-label="새 문서">
          ＋
        </button>
      </header>
      <input
        className="doc-list-search"
        type="search"
        placeholder="제목, 내용, #태그로 찾기"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="message">실패: {error}</p>}

      <div className="doc-list-scroll">
        {loading ? (
          <p className="muted empty">불러오는 중…</p>
        ) : docs.length === 0 ? (
          <p className="muted empty">{query ? '찾는 문서가 없어요.' : '아직 문서가 없어요.\n＋ 를 눌러 첫 글을 써 보세요.'}</p>
        ) : (
          <ul className="doc-cards">
            {docs.map((d) => {
              const folder = folderPath(folders, d.folder_id).at(-1)
              const selected = d.id === selectedId
              const tags = docTags(d)
              return (
                <li key={d.id}>
                  <a
                    ref={selected ? selectedRef : undefined}
                    className={`doc-card ${selected ? 'selected' : ''}`}
                    href={href('docs', d.id)}
                    aria-current={selected ? 'page' : undefined}
                  >
                    <strong className="doc-card-title">{docTitle(d)}</strong>
                    <span className="doc-card-preview">{docPreview(d, 120) || '내용 없음'}</span>
                    <span className="doc-card-meta">
                      {formatWhen(d.updated_at)}
                      {folder && <span> · 📒 {folder.name}</span>}
                      {tags.slice(0, 3).map((t) => (
                        <span key={t} className="mini-tag">
                          #{t}
                        </span>
                      ))}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function NothingSelected() {
  const { create } = useNewDocument()
  return (
    <section className="note note-empty">
      <div>
        <p style={{ fontSize: '3rem', margin: 0 }}>📝</p>
        <p>왼쪽 목록에서 문서를 고르거나</p>
        <button onClick={create}>＋ 새 문서 쓰기</button>
      </div>
    </section>
  )
}
