import { useEffect, useState } from 'react'

/**
 * 주소의 # 뒤 부분으로 화면을 나눈다. 예: #/folders/abc → ['folders', 'abc']
 * GitHub Pages 같은 정적 호스팅에서도 새로 고침/뒤로 가기가 잘 동작한다.
 */
export function useHashRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export const href = (...parts: string[]) => '#/' + parts.map(encodeURIComponent).join('/')
