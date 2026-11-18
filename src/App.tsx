import { useMemo } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { createMemoryBackend } from './data/memoryBackend'
import { createSupabaseBackend } from './data/supabaseBackend'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

function SetupNeeded() {
  return (
    <main className="center">
      <div className="card">
        <h1>설정이 필요해요</h1>
        <p>Supabase 접속 정보가 없습니다.</p>
        <ol>
          <li>
            프로젝트 폴더의 <code>.env.example</code> 을 복사해 <code>.env</code> 를 만드세요.
          </li>
          <li>Supabase 프로젝트의 URL 과 anon key 를 채워 넣으세요.</li>
          <li>개발 서버를 다시 시작하세요.</li>
        </ol>
        <p className="muted">자세한 방법은 README.md 를 보세요.</p>
      </div>
    </main>
  )
}

function SignedIn() {
  const { session } = useAuth()
  const backend = useMemo(() => createSupabaseBackend(supabase!), [])
  return (
    <HomePage
      backend={backend}
      userId={session!.user.id}
      email={session!.user.email ?? ''}
      onSignOut={() => supabase!.auth.signOut()}
    />
  )
}

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <main className="center muted">불러오는 중…</main>
  return session ? <SignedIn /> : <LoginPage />
}

/** 개발 서버에서 주소 끝에 ?demo 를 붙이면 서버 없이 메모리 데이터로 화면을 시험할 수 있다. */
function Demo() {
  const backend = useMemo(() => createMemoryBackend('demo').backend, [])
  return <HomePage backend={backend} userId="demo" email="demo (메모리 저장)" onSignOut={() => location.assign('?')} />
}

export default function App() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) return <Demo />
  if (!isSupabaseConfigured) return <SetupNeeded />
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
