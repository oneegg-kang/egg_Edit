import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Folder, Item, VaultBackend } from './types'

interface VaultState {
  backend: VaultBackend
  userId: string
  folders: Folder[]
  items: Item[]
  loading: boolean
  error: string | null
  /** 서버에서 다시 불러온다. 내가 바꾼 뒤에 부르면 화면이 바로 갱신된다. */
  reload: () => Promise<void>
}

const VaultContext = createContext<VaultState | null>(null)

/** 폴더와 항목 전체를 한 곳에서 불러오고, 다른 기기에서 바뀌면 자동으로 다시 불러온다. */
export function VaultProvider({ backend, userId, children }: { backend: VaultBackend; userId: string; children: ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [f, i] = await Promise.all([backend.listFolders(), backend.listItems()])
      setFolders(f)
      setItems(i)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [backend])

  useEffect(() => {
    reload()
    // 변경이 몰려 올 때 매번 다시 부르지 않도록 잠깐 모았다가 한 번만 부른다.
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = backend.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(reload, 300)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [backend, reload])

  const value = useMemo(
    () => ({ backend, userId, folders, items, loading, error, reload }),
    [backend, userId, folders, items, loading, error, reload],
  )
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVault(): VaultState {
  const v = useContext(VaultContext)
  if (!v) throw new Error('useVault 는 VaultProvider 안에서만 쓸 수 있습니다.')
  return v
}
