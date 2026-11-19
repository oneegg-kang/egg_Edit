// 앱이 어디서 실행 중인지(웹 / PC 앱 / 휴대폰 앱)에 따라 달라지는 동작을 한곳에 모은다.
//   - 파일 저장 (백업 ZIP, 내려받기, HTML/PNG 내보내기)
//   - 바깥 링크 열기 (유튜브, 멜론 등)
// 화면 코드는 이 함수들만 쓰면 되고, 실행 환경을 신경 쓰지 않아도 된다.
// PC/휴대폰 전용 도구는 그 환경에서만 불러온다 (웹에서는 내려받지 않음).

/** PC 앱 (Tauri: Windows, Mac, Linux) */
export const isDesktopApp = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** 휴대폰 앱 (Capacitor: Android) */
export const isMobileApp = () =>
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())

export const isApp = () => isDesktopApp() || isMobileApp()

/** 웹 주소 (앱 안에서는 주소가 tauri://… 같은 것이라, 인증 메일 등에는 웹 주소를 쓴다) */
export const WEB_URL = 'https://oneegg-kang.github.io/egg_Edit/'

/** 가입 인증 메일의 링크가 돌아올 주소 */
export function authRedirectUrl(): string {
  if (isApp()) return WEB_URL
  return window.location.origin + import.meta.env.BASE_URL
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * 파일을 저장한다.
 *   웹      : 브라우저 내려받기
 *   PC 앱   : "다른 이름으로 저장" 창
 *   휴대폰 앱: 기기의 Documents 폴더에 저장하고 공유 창(드라이브, 메일, 카톡 등으로 보내기)을 띄운다
 * 돌려주는 값: 사용자에게 보여 줄 안내 (없으면 null). 사용자가 취소하면 'cancelled'.
 */
export async function saveFile(blob: Blob, fileName: string): Promise<string | null | 'cancelled'> {
  if (isDesktopApp()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({ defaultPath: fileName, title: '저장할 곳 고르기' })
    if (!path) return 'cancelled'
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return `저장했어요: ${path}`
  }
  if (isMobileApp()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const safe = fileName.replace(/[\\/:*?"<>|]/g, '_')
    const res = await Filesystem.writeFile({ path: `egg_Edit/${safe}`, data: await blobToBase64(blob), directory: Directory.Documents, recursive: true })
    try {
      await Share.share({ title: safe, files: [res.uri], dialogTitle: '어디에 보관할까요?' })
    } catch {
      /* 공유 창을 닫아도 파일은 이미 저장되어 있다 */
    }
    return `휴대폰의 Documents/egg_Edit 폴더에 저장했어요: ${safe}`
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return null
}

/**
 * 저장소 파일의 내려받기 주소로 파일을 저장한다.
 * 웹에서는 주소로 바로 이동(서버가 "내려받기" 로 보냄), 앱에서는 받아서 saveFile.
 */
export async function downloadFromUrl(url: string, fileName: string): Promise<string | null | 'cancelled'> {
  if (!isApp()) {
    window.location.assign(url)
    return null
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`내려받기 실패 (${res.status})`)
  return saveFile(await res.blob(), fileName)
}

/** 바깥 사이트를 연다 (웹: 새 탭, PC 앱: 기본 브라우저, 휴대폰 앱: 앱 안 브라우저) */
export async function openExternal(url: string): Promise<void> {
  if (isDesktopApp()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else if (isMobileApp()) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

/**
 * 앱 안에서는 <a target="_blank"> 를 눌러도 새 창이 열리지 않으므로, 그런 링크를 가로채서 openExternal 로 연다.
 * 시작할 때 한 번 부른다.
 */
export function installExternalLinkHandler(): void {
  if (!isApp()) return
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const external = a.target === '_blank' || (/^https?:/.test(a.href) && new URL(a.href).origin !== window.location.origin)
      if (!external || a.hasAttribute('download')) return
      e.preventDefault()
      openExternal(a.href)
    },
    true,
  )
}
