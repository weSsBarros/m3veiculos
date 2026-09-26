import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Identifica a empresa deste site dentro do projeto Supabase compartilhado
// (multi-tenant: várias empresas/sites no mesmo projeto, isoladas por RLS).
export const COMPANY_ID = import.meta.env.VITE_COMPANY_ID

export const isSupabaseConfigured = Boolean(url && anonKey && COMPANY_ID)

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null

// A vitrine pública sempre consulta como visitante (anon), mesmo com alguém
// logado no painel no mesmo navegador: a leitura autenticada de "cars" é
// restrita ao admin, então um vendedor logado veria a vitrine vazia.
export const publicSupabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'public-anon' },
    })
  : null
