import { useEffect, useState } from 'react'
import { isApp } from '../lib/platform'

const RELEASES = 'https://github.com/oneegg-kang/egg_Edit/releases'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

/** 홈 화면의 "앱으로 쓰기" 안내. 이미 앱으로 실행 중이면 보이지 않는다. */
export function InstallPanel() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // 브라우저가 알아서 띄우지 않게 하고, 버튼을 눌렀을 때 띄운다
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isApp() || isStandalone()) return null

  return (
    <section className="card install">
      <h2>📲 앱으로 쓰기</h2>
      <p className="muted">브라우저 없이 바탕화면·홈 화면에서 바로 열 수 있어요. 어느 기기에서 쓰든 내용은 똑같이 동기화돼요.</p>
      <div className="install-grid">
        <div>
          <strong>이 기기에 바로 설치</strong>
          {installed ? (
            <p className="muted">✓ 설치했어요. 바탕화면이나 홈 화면의 egg_Edit 아이콘으로 여세요.</p>
          ) : prompt ? (
            <button
              onClick={async () => {
                await prompt.prompt()
                const r = await prompt.userChoice
                if (r.outcome === 'accepted') setInstalled(true)
                setPrompt(null)
              }}
            >
              ⬇ egg_Edit 설치
            </button>
          ) : isIos() ? (
            <ol className="install-steps">
              <li>
                Safari 아래쪽의 <b>공유 버튼(□↑)</b> 을 누르고
              </li>
              <li>
                <b>홈 화면에 추가</b> 를 누르세요.
              </li>
            </ol>
          ) : (
            <p className="muted">Chrome·Edge 주소창 오른쪽의 설치 아이콘(⊕)이나 메뉴의 "앱 설치" 를 누르세요.</p>
          )}
        </div>
        <div>
          <strong>설치 파일 내려받기</strong>
          <p className="muted">PC 앱(Windows, Mac, Linux)과 Android 앱(APK)</p>
          <a className="secondary small" href={RELEASES} target="_blank" rel="noopener noreferrer">
            내려받기 페이지 ↗
          </a>
        </div>
      </div>
    </section>
  )
}
