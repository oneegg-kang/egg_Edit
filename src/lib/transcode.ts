// 동영상을 브라우저 안에서 작은 MP4 로 변환(트랜스코딩)한다.
// 서버 없이 PC/휴대폰의 동영상 인코더(WebCodecs)를 쓰므로 빠르고, 동영상이 밖으로 나가지 않는다.
// 지원: Chrome, Edge, Safari 16.4+, Firefox 130+ (지원하지 않으면 원본을 그대로 올린다)


/** 변환 결과가 이 크기 안에 들어오도록 화질을 정한다 (저장소 한도 50MB 보다 조금 작게) */
export const TARGET_BYTES = 45 * 1024 * 1024
/** 이보다 작고 MP4/WebM 이면 변환하지 않는다 */
export const COMPRESS_OVER_BYTES = 15 * 1024 * 1024
const AUDIO_BPS = 96_000

const LADDER = [
  { width: 1280, minBps: 1_200_000, maxBps: 2_500_000, label: '720p' },
  { width: 854, minBps: 600_000, maxBps: 1_200_000, label: '480p' },
  { width: 640, minBps: 250_000, maxBps: 700_000, label: '360p' },
]

export interface CompressionPlan {
  width: number // 변환 후 가로 크기 (원본보다 크게 하지 않음)
  videoBps: number
  audioBps: number
  label: string
  estimatedBytes: number
}

/**
 * 길이와 원본 크기로 변환 방법을 정한다. 너무 길어서 50MB 안에 넣을 수 없으면 null.
 * 순수 함수라 테스트할 수 있다.
 */
export function planCompression(durationSec: number, sourceWidth: number): CompressionPlan | null {
  if (!(durationSec > 0)) return null
  const budgetBps = (TARGET_BYTES * 8) / durationSec - AUDIO_BPS
  const step = LADDER.find((s) => budgetBps >= s.minBps)
  if (!step) return null
  const width = Math.min(step.width, sourceWidth || step.width)
  // 원본이 작으면 그만큼 비트레이트도 줄인다
  const videoBps = Math.floor(Math.min(budgetBps, step.maxBps * Math.min(1, width / step.width)))
  return {
    width: width - (width % 2), // 인코더는 짝수 크기를 원한다
    videoBps,
    audioBps: AUDIO_BPS,
    label: step.label,
    estimatedBytes: Math.round(((videoBps + AUDIO_BPS) * durationSec) / 8),
  }
}

/** 변환해야 하는 파일인지: 크거나, 브라우저에서 잘 안 열리는 형식(mov, mkv, avi 등) */
export function shouldCompress(file: { name: string; size: number; type: string }): boolean {
  const friendly = /\.(mp4|m4v|webm)$/i.test(file.name) || /^video\/(mp4|webm)$/.test(file.type)
  return file.size > COMPRESS_OVER_BYTES || !friendly
}

export const canTranscode = () => typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'

/** 동영상을 계획대로 MP4 로 변환한다. onProgress 는 0~1 */
export async function compressVideo(file: File, plan: CompressionPlan, onProgress: (p: number) => void = () => {}): Promise<File> {
  // 변환 도구는 크기가 커서 실제로 변환할 때만 불러온다
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } = await import('mediabunny')
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() })
  const conversion = await Conversion.init({
    input,
    output,
    video: { width: plan.width, fit: 'contain', bitrate: plan.videoBps, forceTranscode: true, frameRate: 30 },
    audio: { bitrate: plan.audioBps, numberOfChannels: 2 },
    showWarnings: false,
  })
  if (!conversion.isValid) {
    const why = conversion.discardedTracks.map((t) => `${t.track.type}: ${t.reason}`).join(', ')
    throw new Error(`이 동영상은 변환할 수 없어요 (${why})`)
  }
  conversion.onProgress = (p) => onProgress(p)
  await conversion.execute()
  const buffer = output.target.buffer
  if (!buffer) throw new Error('변환 결과가 비어 있어요')
  const name = file.name.replace(/\.[^.]+$/, '') + '.mp4'
  return new File([buffer], name, { type: 'video/mp4' })
}

/** 동영상의 길이, 크기, 첫 장면 사진(미리 보기)을 읽는다. 못 읽은 값은 비워 둔다. */
export function readVideoMeta(file: File): Promise<{ duration?: number; width?: number; height?: number; thumbnail?: Blob }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const done = (v: { duration?: number; width?: number; height?: number; thumbnail?: Blob }) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(v)
    }
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      // 맨 앞은 검은 화면일 때가 많아서 조금 뒤 장면을 쓴다
      video.currentTime = Math.min(1, (video.duration || 0) * 0.1)
    }
    video.onseeked = () => {
      const meta = { duration: isFinite(video.duration) ? video.duration : undefined, width: video.videoWidth, height: video.videoHeight }
      try {
        const scale = Math.min(1, 480 / (video.videoWidth || 480))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round((video.videoWidth || 480) * scale)
        canvas.height = Math.round((video.videoHeight || 270) * scale)
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((b) => done({ ...meta, thumbnail: b ?? undefined }), 'image/jpeg', 0.8)
      } catch {
        done(meta)
      }
    }
    video.onerror = () => done({})
    setTimeout(() => done({}), 15000)
    video.src = url
  })
}
