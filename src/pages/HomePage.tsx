import { VaultProvider, useVault } from '../data/VaultProvider'
import type { VaultBackend } from '../data/types'
import { href, useHashRoute } from '../lib/useHashRoute'
import { BackupPanel } from './BackupPanel'
import { FoldersPage } from './FoldersPage'

const FEATURES = [
  { icon: '📝', title: '문서', desc: '글 작성, 수정, 삭제', link: null, stage: '2단계' },
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

function Routes() {
  const [section, id] = useHashRoute()
  if (section === 'folders') return <FoldersPage folderId={id ?? null} />
  return <Dashboard />
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
      <main className="page">
        <header className="topbar">
          <h1>
            <a href="#/">egg_Edit</a>
          </h1>
          <div className="row">
            <span className="muted">{email}</span>
            <button className="secondary" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        </header>
        <Routes />
      </main>
    </VaultProvider>
  )
}
