import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createMemoryBackend } from './memoryBackend'
import { uploadFileItem } from './vault'
import { createBackup } from '../backup/backup'
import { addMusicLink, filterMusic, formatDuration, guessTitleArtist, isAudioFile, musicOf, parseMusicLink } from './music'

describe('음악 링크 알아보기', () => {
  it('YouTube 주소 여러 모양을 바로 재생 주소로 바꾼다', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      const info = parseMusicLink(u)!
      expect(info.provider).toBe('youtube')
      expect(info.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1')
      expect(info.thumbnail).toContain('dQw4w9WgXcQ')
    }
    expect(parseMusicLink('https://www.youtube.com/playlist?list=PL123')!.embedUrl).toContain('videoseries?list=PL123')
  })

  it('Spotify, SoundCloud, 멜론, 기타', () => {
    expect(parseMusicLink('https://open.spotify.com/intl-ko/track/4uLU6hMCjMI75M1A2tKUQC?si=x')!.embedUrl).toBe(
      'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
    )
    expect(parseMusicLink('https://soundcloud.com/artist/song')!.embedUrl).toContain('w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com')
    const melon = parseMusicLink('https://www.melon.com/song/detail.htm?songId=1')!
    expect(melon.provider).toBe('melon')
    expect(melon.embedUrl).toBeUndefined() // 새 탭으로 연다
    expect(parseMusicLink('https://example.com/a')!.provider).toBe('other')
    expect(parseMusicLink('그냥 글자')).toBeNull()
    expect(parseMusicLink('javascript:alert(1)')).toBeNull()
  })
})

describe('파일 이름과 시간', () => {
  it('"가수 - 제목" 을 나누고 트랙 번호를 뺀다', () => {
    expect(guessTitleArtist('01. 아이유 - 밤편지.mp3')).toEqual({ artist: '아이유', title: '밤편지' })
    expect(guessTitleArtist('그냥노래.m4a')).toEqual({ artist: '', title: '그냥노래' })
  })
  it('시간 표시', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(undefined)).toBe('')
  })
  it('음악 파일 알아보기', () => {
    expect(isAudioFile(new File([''], 'a.MP3'))).toBe(true)
    expect(isAudioFile(new File([''], 'x', { type: 'audio/ogg' }))).toBe(true)
    expect(isAudioFile(new File([''], 'a.png', { type: 'image/png' }))).toBe(false)
  })
})

describe('음악 목록', () => {
  it('링크와 파일을 넣고, 거르고, 백업에 목록 HTML 을 넣는다', async () => {
    const { backend } = createMemoryBackend('u1')
    await addMusicLink(backend, { url: 'https://youtu.be/dQw4w9WgXcQ', title: '좋은 노래', artist: '누군가' })
    const file = await uploadFileItem(backend, 'u1', new File(['ID3'], '밤편지.mp3', { type: 'audio/mpeg' }), null, [], 'music')
    await backend.updateItem(file.id, { content: { artist: '아이유', favorite: true, duration: 253 } })
    const tracks = musicOf(await backend.listItems())

    expect(tracks).toHaveLength(2)
    expect(filterMusic(tracks, 'link', '').map((t) => t.title)).toEqual(['좋은 노래'])
    expect(filterMusic(tracks, 'favorite', '').map((t) => t.title)).toEqual(['밤편지.mp3'])
    expect(filterMusic(tracks, 'all', '아이유')).toHaveLength(1)
    await expect(addMusicLink(backend, { url: 'nope', title: '' })).rejects.toThrow()

    const zip = await JSZip.loadAsync(await createBackup(backend))
    const html = await zip.file('music/음악 목록.html')!.async('string')
    expect(html).toContain('href="https://youtu.be/dQw4w9WgXcQ"')
    expect(html).toContain(`href="../files/${file.storage_path}"`)
    expect(html).toContain('4:13')
  })
})
