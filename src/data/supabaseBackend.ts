import type { SupabaseClient } from '@supabase/supabase-js'
import { STORAGE_BUCKET } from '../lib/supabase'
import type { Folder, Item, VaultBackend } from './types'

/** Supabase 로 VaultBackend 를 구현한다. Supabase 에 의존하는 코드는 가능한 한 여기에만 둔다. */
export function createSupabaseBackend(sb: SupabaseClient): VaultBackend {
  const check = <T,>({ data, error }: { data: T; error: unknown }): T => {
    if (error) throw error
    return data
  }
  const bucket = () => sb.storage.from(STORAGE_BUCKET)

  return {
    async listFolders() {
      return check(await sb.from('folders').select('*').order('name')) as Folder[]
    },
    async createFolder(name, parentId) {
      return check(await sb.from('folders').insert({ name, parent_id: parentId }).select().single()) as Folder
    },
    async updateFolder(id, patch) {
      check(await sb.from('folders').update(patch).eq('id', id))
    },
    async deleteFolders(ids) {
      if (ids.length) check(await sb.from('folders').delete().in('id', ids))
    },

    async listItems() {
      return check(await sb.from('items').select('*').order('title')) as Item[]
    },
    async createItem(item) {
      return check(await sb.from('items').insert(item).select().single()) as Item
    },
    async updateItem(id, patch) {
      return check(await sb.from('items').update(patch).eq('id', id).select().single()) as Item
    },
    async deleteItems(ids) {
      if (ids.length) check(await sb.from('items').delete().in('id', ids))
    },

    async upsertFolders(folders) {
      if (folders.length) check(await sb.from('folders').upsert(folders))
    },
    async upsertItems(items) {
      if (items.length) check(await sb.from('items').upsert(items))
    },

    async uploadFile(path, data, contentType) {
      check(await bucket().upload(path, data, { upsert: true, contentType }))
    },
    async downloadFile(path) {
      return check(await bucket().download(path)) as Blob
    },
    async deleteFiles(paths) {
      if (paths.length) check(await bucket().remove(paths))
    },
    async fileUrl(path, downloadName, expiresInSeconds = 60 * 10) {
      const res = await bucket().createSignedUrl(path, expiresInSeconds, downloadName ? { download: downloadName } : undefined)
      return check(res)!.signedUrl
    },

    subscribe(onChange) {
      const channel = sb
        .channel(`vault-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'folders' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onChange)
        .subscribe()
      return () => void sb.removeChannel(channel)
    },
  }
}
