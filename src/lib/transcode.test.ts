import { describe, expect, it } from 'vitest'
import { planCompression, shouldCompress, TARGET_BYTES } from './transcode'

describe('동영상 변환 계획', () => {
  it('짧은 영상은 720p, 길수록 화질을 낮추고, 결과가 45MB 안에 들어간다', () => {
    const p1 = planCompression(60, 1920)!
    expect(p1).toMatchObject({ label: '720p', width: 1280, videoBps: 2_500_000 })
    const p5 = planCompression(5 * 60, 1920)!
    expect(p5.label).toBe('480p')
    const p10 = planCompression(10 * 60, 1920)!
    expect(p10.label).toBe('360p')
    for (const p of [p1, p5, p10]) expect(p.estimatedBytes).toBeLessThanOrEqual(TARGET_BYTES)
  })

  it('너무 긴 영상은 넣을 수 없다고 알려 준다', () => {
    expect(planCompression(30 * 60, 1920)).toBeNull()
    expect(planCompression(0, 1920)).toBeNull()
  })

  it('원본보다 크게 늘리지 않는다', () => {
    const p = planCompression(60, 640)!
    expect(p.width).toBe(640)
    expect(p.videoBps).toBeLessThan(2_500_000)
  })

  it('큰 파일이나 mov/mkv 는 변환, 작은 mp4 는 그대로', () => {
    expect(shouldCompress({ name: 'a.mp4', size: 5e6, type: 'video/mp4' })).toBe(false)
    expect(shouldCompress({ name: 'a.mp4', size: 80e6, type: 'video/mp4' })).toBe(true)
    expect(shouldCompress({ name: 'a.MOV', size: 5e6, type: 'video/quicktime' })).toBe(true)
  })
})
