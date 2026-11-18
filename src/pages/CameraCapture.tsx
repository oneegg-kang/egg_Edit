import { useEffect, useRef, useState } from 'react'

/** "사진 2026-11-18 14-32-05.jpg" */
function photoFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `사진 ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}.jpg`
}

/** 손가락으로 쓰는 기기(폰, 태블릿)인지 */
const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches

/**
 * [📷 사진 찍기] 버튼.
 *   폰/태블릿: 기기의 카메라 앱을 바로 연다 (화질, 초점, 플래시를 그대로 쓸 수 있음)
 *   PC: 웹캠 화면을 앱 안에 띄운다
 * 찍은 사진은 onPhotos 로 넘긴다.
 */
export function TakePhotoButton({
  onPhotos,
  className = 'secondary',
  label = '📷 사진 찍기',
  disabled,
}: {
  onPhotos: (files: File[]) => void
  className?: string
  label?: string
  disabled?: boolean
}) {
  const nativeInput = useRef<HTMLInputElement>(null)
  const [webcamOpen, setWebcamOpen] = useState(false)

  return (
    <>
      <button
        className={className}
        disabled={disabled}
        title="카메라로 사진 찍기"
        aria-label="카메라로 사진 찍기"
        onClick={() => (isTouchDevice() ? nativeInput.current?.click() : setWebcamOpen(true))}
      >
        {label}
      </button>
      <input
        ref={nativeInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].map((f) =>
            // 카메라 앱이 주는 이름(image.jpg 등)은 알아보기 어려우므로 찍은 시각으로
            /^(image|IMG_?\d*|photo)\.\w+$/i.test(f.name) ? new File([f], photoFileName(new Date(f.lastModified || Date.now())), { type: f.type }) : f,
          )
          e.target.value = ''
          if (files.length) onPhotos(files)
        }}
      />
      {webcamOpen && <WebcamDialog onPhoto={(f) => onPhotos([f])} onClose={() => setWebcamOpen(false)} />}
    </>
  )
}

/** PC 웹캠으로 찍기. 찍기 → 확인(다시 찍기 / 쓰기) */
function WebcamDialog({ onPhoto, onClose }: { onPhoto: (f: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [cameraCount, setCameraCount] = useState(0)
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [taken, setTaken] = useState(0)
  const [flash, setFlash] = useState(false)

  // 카메라 켜기 (앞/뒤를 바꾸면 다시)
  useEffect(() => {
    let alive = true
    let current: MediaStream | null = null
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 카메라를 쓸 수 없어요. 최신 Chrome, Edge, Safari 를 써 주세요.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop())
        current = s
        setStream(s)
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (alive) setCameraCount(devices.filter((d) => d.kind === 'videoinput').length)
      })
      .catch((e: DOMException) => {
        if (!alive) return
        setError(
          e.name === 'NotAllowedError'
            ? '카메라 사용이 허용되지 않았어요. 주소창 왼쪽의 자물쇠(🔒) 아이콘에서 카메라를 "허용" 으로 바꾼 뒤 다시 눌러 주세요.'
            : e.name === 'NotFoundError' || e.name === 'OverconstrainedError'
              ? '이 기기에서 카메라를 찾지 못했어요.'
              : e.name === 'NotReadableError'
                ? '다른 프로그램(화상 회의 등)이 카메라를 쓰고 있어요. 그 프로그램을 닫고 다시 시도해 주세요.'
                : `카메라를 켤 수 없어요 (${e.name})`,
        )
      })
    return () => {
      alive = false
      current?.getTracks().forEach((t) => t.stop())
    }
  }, [facing])

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream
  }, [stream])

  // 닫을 때 정리
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if ((e.key === ' ' || e.key === 'Enter') && !shot && stream) {
        e.preventDefault()
        capture()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function capture() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0) // 화면은 거울처럼 보여도 사진은 실제 방향 그대로
    setFlash(true)
    setTimeout(() => setFlash(false), 150)
    canvas.toBlob(
      (blob) => {
        if (!blob) return setError('사진을 만들지 못했어요.')
        const file = new File([blob], photoFileName(), { type: 'image/jpeg' })
        setShot({ file, url: URL.createObjectURL(blob) })
      },
      'image/jpeg',
      0.92,
    )
  }

  function use(keepOpen: boolean) {
    if (!shot) return
    onPhoto(shot.file)
    setTaken((n) => n + 1)
    setShot(null)
    if (!keepOpen) onClose()
  }

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="사진 찍기" onClick={onClose}>
      <div className="viewer-box camera-box" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-head">
          <strong>📷 사진 찍기 {taken > 0 && <small>({taken}장 올리는 중/올림)</small>}</strong>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {error ? (
          <p className="message camera-error">{error}</p>
        ) : (
          <div className="camera-stage">
            {/* 카메라 화면은 계속 켜 두고(다음 사진을 바로 찍을 수 있게) 찍은 사진만 위에 보여 준다 */}
            <video ref={video} autoPlay playsInline muted className={facing === 'user' ? 'mirror' : ''} hidden={Boolean(shot)} />
            {shot && <img src={shot.url} alt="찍은 사진 미리 보기" />}
            {flash && <div className="camera-flash" />}
            {!stream && !shot && <p className="camera-wait">카메라를 켜는 중… (허용을 물어보면 "허용" 을 눌러 주세요)</p>}
          </div>
        )}

        <div className="camera-controls">
          {shot ? (
            <>
              <button className="secondary" onClick={() => setShot(null)}>
                ↺ 다시 찍기
              </button>
              <button className="secondary" onClick={() => use(true)}>
                올리고 계속 찍기
              </button>
              <button onClick={() => use(false)}>✓ 올리기</button>
            </>
          ) : (
            <>
              <span className="grow" />
              <button className="shutter" onClick={capture} disabled={!stream} aria-label="찍기 (스페이스바)" title="찍기 (스페이스바)" />
              <span className="grow camera-side">
                {cameraCount > 1 && (
                  <button className="secondary small" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>
                    🔄 카메라 바꾸기
                  </button>
                )}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
