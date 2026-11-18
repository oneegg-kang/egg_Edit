import type { ReactNode } from 'react'
import { VaultProvider, useVault } from '../data/VaultProvider'
import type { VaultBackend } from '../data/types'
import { href, useHashRoute } from '../lib/useHashRoute'
import { BackupPanel } from './BackupPanel'
import { FoldersPage } from './FoldersPage'
import { DocumentsPage } from './DocumentsPage'
import { AppShell, MobileBar } from './AppShell'
import { MusicPage } from './MusicPage'
import { VideoPage } from './VideoPage'
import { ImagesPage } from './ImagesPage'
import { ImageEditorPage } from './ImageEditor'
import { PlayerProvider } from '../player/Player'

const FEATURES = [
  { icon: '📝', title: '문서', desc: '글 작성, 수정, 삭제', link: href('docs'), stage: null },
  { icon: '🎨', title: '이미지', desc: '그림 그리기와 사진 편집', link: href('images'), stage: null },
  { icon: '📁', title: '폴더', desc: '중요한 파일 보관', link: href('folders'), stage: null },
  { icon: '🎵', title: '음악', desc: '음악 저장과 링크', link: href('music'), stage: null },
  { icon: '🎬', title: '동영상', desc: '동영상 올리기와 유튜브', link: href('videos'), stage: null },
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
  if (section === 'docs') return <DocumentsPage selectedId={id ?? null} />
  if (section === 'images') return id ? <ImageEditorPage id={id} /> : <div className="page"><ImagesPage /></div>
  if (section === 'videos') return <div className="page"><VideoPage /></div>
  if (section === 'music') return <div className="page"><MusicPage /></div>
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
      <PlayerProvider>
        <AppShell email={email} onSignOut={onSignOut}>
          <Routes />
        </AppShell>
      </PlayerProvider>
    </VaultProvider>
  )
}
