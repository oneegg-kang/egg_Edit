import { useState } from 'react'
import { useVault } from '../data/VaultProvider'
import { createDocument, docPreview, docTitle, documentsOf, searchDocuments } from '../data/documents'
import { folderPath, formatWhen } from '../data/vault'
import { href } from '../lib/useHashRoute'
import { useShell } from './AppShell'

/** 모든 폴더의 문서를 최근 수정 순으로 보여 준다. */
export function DocumentsPage() {
  const { backend, items, folders, loading, reload } = useVault()
  const { search: query, setSearch: setQuery } = useShell()
  const [error, setError] = useState<string | null>(null)
  const docs = searchDocuments(documentsOf(items), query)

  async function newDoc() {
    try {
      const doc = await createDocument(backend, null)
      await reload()
      window.location.hash = href('docs', doc.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="card">
      <nav className="breadcrumb">📝 문서</nav>
      <div className="row">
        <button onClick={newDoc}>+ 새 문서</button>
        <input
          className="grow"
          type="search"
          placeholder="제목이나 내용으로 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && <p className="message">실패: {error}</p>}

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : docs.length === 0 ? (
        <p className="muted empty">{query ? '찾는 문서가 없어요.' : '아직 문서가 없어요. [+ 새 문서] 로 첫 글을 써 보세요.'}</p>
      ) : (
        <ul className="list">
          {docs.map((d) => {
            const where = folderPath(folders, d.folder_id).map((f) => f.name).join(' / ')
            return (
              <li key={d.id}>
                <a className="name doc-row" href={href('docs', d.id)}>
                  <strong>{docTitle(d)}</strong>
                  <small className="muted">
                    {formatWhen(d.updated_at)}
                    {where && ` · 📁 ${where}`}
                  </small>
                  {docPreview(d) && <span className="muted preview">{docPreview(d)}</span>}
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
