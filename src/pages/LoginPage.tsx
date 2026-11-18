import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            // 인증 메일의 링크를 누르면 지금 열려 있는 앱 주소로 돌아온다.
            // (Supabase 의 Authentication → URL Configuration → Redirect URLs 에 이 주소가 등록되어 있어야 한다)
            options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
          })
    setBusy(false)
    if (error) setMessage(error.message)
    else if (mode === 'signup') setMessage('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.')
  }

  return (
    <main className="center">
      <form className="card" onSubmit={submit}>
        <h1>egg_Edit</h1>
        <p className="muted">나만의 Playground</p>
        <label>
          이메일
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        <button type="submit" disabled={busy}>
          {mode === 'signin' ? '로그인' : '가입하기'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? '처음이신가요? 가입하기' : '이미 계정이 있나요? 로그인'}
        </button>
        {message && <p className="message">{message}</p>}
      </form>
    </main>
  )
}
