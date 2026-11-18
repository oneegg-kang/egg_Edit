import type { ReactNode } from 'react'
import { VaultProvider, useVault } from '../data/VaultProvider'
import type { VaultBackend } from '../data/types'
import { href, useHashRoute } from '../lib/useHashRoute'
import { BackupPanel } from './BackupPanel'
import { FoldersPage } from './FoldersPage'
import { DocumentsPage } from './DocumentsPage'
import { DocumentEditorPage } from './DocumentEditor'
import { AppShell, MobileBar } from './AppShell'

const FEATURES = [
  { icon: '📝', title: '문서', desc: '글 작성, 수정, 삭제', link: href('docs'), stage: null },
  { icon: '🎨', title: '이미지', desc: '그림 그리기와 편집', link: null, stage: '4단계' },
  { icon: '📁', title: '폴더', desc: '중요한 파일 보관', link: href('folders'), stage: null },
  { icon: '🎵', title: '음악', desc: '음악 저장과 링크', link: null, stage: '3단계' },
]

function Dashboard() {
  const { backend, userId, reload } = useVault()
  return (
    <>
      <section className="grid">
        {FEATURES.map((f) => {
          const body = (
            <>
              <div className="icon">{f.icon}</div>
              <h2>{f.title}</h2>
              <p className="muted">{f.desc}</p>
              {f.stage && <span className="badge">{f.stage}에서 만들 예정</span>}
            </>
          )
          return f.link ? (
            <a key={f.title} className="card feature clickable" href={f.link}>
              {body}
            </a>
          ) : (
            <div key={f.title} className="card feature disabled">
              {body}
            </div>
          )
        })}
      </section>
      <BackupPanel backend={backend} userId={userId} onRestored={reload} />
    </>
  )
}

/** 편집 화면을 뺀 나머지 화면은 가운데 정렬된 페이지 안에 둔다 */
function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="page">
      <MobileBar title={title} />
      {children}
    </div>
  )
}

function Routes() {
  const [section, id] = useHashRoute()
  if (section === 'docs' && id) return <DocumentEditorPage id={id} />
  if (section === 'docs') return <Page title="문서"><DocumentsPage /></Page>
  if (section === 'folders') return <Page title="파일"><FoldersPage folderId={id ?? null} /></Page>
  return <Page title="egg_Edit"><Dashboard /></Page>
}

export function HomePage({
  backend,
  userId,
  email,
  onSignOut,
}: {
  backend: VaultBackend
  userId: string
  email: string
  onSignOut: () => void
}) {
  return (
    <VaultProvider backend={backend} userId={userId}>
      <AppShell email={email} onSignOut={onSignOut}>
        <Routes />
      </AppShell>
    </VaultProvider>
  )
}
