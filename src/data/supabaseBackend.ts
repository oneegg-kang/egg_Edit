import type { SupabaseClient } from '@supabase/supabase-js'
import { STORAGE_BUCKET } from '../lib/supabase'
import type { Folder, Item, VaultBackend } from './types'

/** Supabase 로 VaultBackend 를 구현한다. Supabase 에 의존하는 코드는 가능한 한 여기에만 둔다. */
export function createSupabaseBackend(sb: SupabaseClient): VaultBackend {
  return {
    async listFolders() {
      const { data, error } = await sb.from('folders').select('*').order('created_at')
      if (error) throw error
      return data as Folder[]
    },

    async listItems() {
      const { data, error } = await sb.from('items').select('*').order('created_at')
      if (error) throw error
      return data as Item[]
    },

    async upsertFolders(folders) {
      if (folders.length === 0) return
      const { error } = await sb.from('folders').upsert(folders)
      if (error) throw error
    },

    async upsertItems(items) {
      if (items.length === 0) return
      const { error } = await sb.from('items').upsert(items)
      if (error) throw error
    },

    async downloadFile(path) {
      const { data, error } = await sb.storage.from(STORAGE_BUCKET).download(path)
      if (error) throw error
      return data
    },

    async uploadFile(path, data, contentType) {
      const { error } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(path, data, { upsert: true, contentType })
      if (error) throw error
    },
  }
}
