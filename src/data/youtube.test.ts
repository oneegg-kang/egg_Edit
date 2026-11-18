import { describe, expect, it } from 'vitest'
import { decodeEntities, parseIsoDuration, searchYouTube } from './youtube'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('유튜브 검색', () => {
  it('검색 결과와 길이를 합친다', async () => {
    const calls: string[] = []
    const fetcher = (async (url: string) => {
      calls.push(url)
      if (url.includes('/search?')) {
        return json(200, {
          nextPageToken: 'NEXT',
          items: [
            { id: { videoId: 'abc123DEF45' }, snippet: { title: 'IU &#39;밤편지&#39; MV', channelTitle: '이지금 &amp; Co', publishedAt: '2017-03-24T00:00:00Z', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abc123DEF45/mqdefault.jpg' } } } },
          ],
        })
      }
      return json(200, { items: [{ id: 'abc123DEF45', contentDetails: { duration: 'PT4M14S' } }] })
    }) as unknown as typeof fetch

    const r = await searchYouTube('밤편지', { apiKey: 'K', fetcher })
    expect(calls[0]).toContain('q=%EB%B0%A4%ED%8E%B8%EC%A7%80')
    expect(calls[0]).toContain('key=K')
    expect(r.nextPageToken).toBe('NEXT')
    expect(r.videos).toEqual([
      {
        id: 'abc123DEF45',
        title: "IU '밤편지' MV",
        channel: '이지금 & Co',
        publishedAt: '2017-03-24T00:00:00Z',
        thumbnail: 'https://i.ytimg.com/vi/abc123DEF45/mqdefault.jpg',
        duration: 254,
        url: 'https://www.youtube.com/watch?v=abc123DEF45',
      },
    ])
  })

  it('사용량 초과, 키 없음은 알아듣기 쉬운 말로', async () => {
    const quota = (async () => json(403, { error: { errors: [{ reason: 'quotaExceeded' }] } })) as unknown as typeof fetch
    await expect(searchYouTube('x', { apiKey: 'K', fetcher: quota })).rejects.toThrow('오늘 검색 사용량')
    await expect(searchYouTube('x', { apiKey: '' })).rejects.toThrow('설정되지 않았어요')
  })

  it('ISO 길이와 HTML 표기', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723)
    expect(parseIsoDuration('PT45S')).toBe(45)
    expect(parseIsoDuration('P1DT1S')).toBe(86401)
    expect(parseIsoDuration('엉터리')).toBeUndefined()
    expect(decodeEntities('A &quot;B&quot; &lt;C&gt; &#x41;')).toBe('A "B" <C> A')
  })
})
