import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { createSupabaseBackend } from '../data/supabaseBackend'
import { useAuth } from '../auth/AuthProvider'
import { BackupPanel } from './BackupPanel'

const FEATURES = [
  { icon: '📝', title: '문서', desc: '글 작성, 수정, 삭제', stage: '2단계' },
  { icon: '🎨', title: '이미지', desc: '그림 그리기와 편집', stage: '4단계' },
  { icon: '📁', title: '폴더', desc: '중요한 파일 보관', stage: '1단계' },
  { icon: '🎵', title: '음악', desc: '음악 저장과 링크', stage: '3단계' },
]

export function HomePage() {
  const { session } = useAuth()
  const backend = useMemo(() => createSupabaseBackend(supabase!), [])

  return (
    <main className="page">
      <header className="topbar">
        <h1>egg_Edit</h1>
        <div className="row">
          <span className="muted">{session?.user.email}</span>
          <button className="secondary" onClick={() => supabase!.auth.signOut()}>
            로그아웃
          </button>
        </div>
      </header>

      <section className="grid">
        {FEATURES.map((f) => (
          <div key={f.title} className="card feature">
            <div className="icon">{f.icon}</div>
            <h2>{f.title}</h2>
            <p className="muted">{f.desc}</p>
            <span className="badge">{f.stage}에서 만들 예정</span>
          </div>
        ))}
      </section>

      <BackupPanel backend={backend} userId={session!.user.id} />
    </main>
  )
}
