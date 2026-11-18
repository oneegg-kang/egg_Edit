import { useEffect, useState } from 'react'
import type { VaultBackend } from '../data/types'

// 저장소 파일의 잠깐 쓰는 주소를 받아 둔다. 같은 파일은 다시 묻지 않는다 (목록에 미리 보기 사진이 많을 때).
const LIFETIME = 60 * 60 * 6 // 6시간
const cache = new Map<string, { url: string; expires: number }>()

export async function cachedFileUrl(backend: VaultBackend, path: string): Promise<string> {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now() + 60_000) return hit.url
  const url = await backend.fileUrl(path, undefined, LIFETIME)
  cache.set(path, { url, expires: Date.now() + LIFETIME * 1000 })
  return url
}

export function useFileUrl(backend: VaultBackend, path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? (cache.get(path)?.url ?? null) : null))
  useEffect(() => {
    let alive = true
    if (!path) {
      setUrl(null)
      return
    }
    cachedFileUrl(backend, path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null))
    return () => {
      alive = false
    }
  }, [backend, path])
  return url
}
