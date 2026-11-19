import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installExternalLinkHandler, isApp } from './lib/platform'

// 앱(PC/휴대폰) 안에서는 바깥 링크를 기본 브라우저로 연다
installExternalLinkHandler()

// 웹에서는 앱 화면을 저장해 두어 빨리 열리고 '앱으로 설치' 를 할 수 있게 (PC/휴대폰 앱은 필요 없음)
if ('serviceWorker' in navigator && import.meta.env.PROD && !isApp()) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
