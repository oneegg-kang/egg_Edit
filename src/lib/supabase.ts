import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** .env 에 Supabase 접속 정보가 들어 있는지 */
export const isSupabaseConfigured = Boolean(url && anonKey)

/** 접속 정보가 없으면 null. 화면에서는 isSupabaseConfigured 로 먼저 확인한다. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null

export const STORAGE_BUCKET = 'vault'
