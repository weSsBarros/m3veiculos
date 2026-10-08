import { createClient } from '@supabase/supabase-js'
import { assertCanWrite } from './viewScope.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Identifica a empresa deste site dentro do projeto Supabase compartilhado
// (multi-tenant: várias empresas/sites no mesmo projeto, isoladas por RLS).
export const COMPANY_ID = import.meta.env.VITE_COMPANY_ID

export const isSupabaseConfigured = Boolean(url && anonKey && COMPANY_ID)

// Funções do banco que só leem (as demais gravam algo)
const READ_ONLY_RPCS = new Set([
  'billing_reminders_due',
  'client_reminder_recipients',
  'current_company_id', 'site_visit_totals', 'car_view_totals', 'team_directory', 'store_contact',
  'is_platform_admin', 'platform_overview', 'platform_store_detail', 'store_performance',
  'platform_clients', 'my_account', 'company_status',
  'my_payments', 'terms_receipt', 'platform_terms_overview', 'suspended_account',
])

// "Ver como" (lib/viewScope.js): enquanto o admin simula outra pessoa, toda
// gravação é recusada antes de sair do navegador — tabelas, funções do
// banco, arquivos e a Edge Function da Equipe.
function blockWritesWhileSimulating(client) {
  const from = client.from.bind(client)
  client.from = (table) => {
    const builder = from(table)
    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      const original = builder[method].bind(builder)
      builder[method] = (...args) => {
        assertCanWrite()
        return original(...args)
      }
    }
    return builder
  }

  const rpc = client.rpc.bind(client)
  client.rpc = (fn, ...args) => {
    if (!READ_ONLY_RPCS.has(fn)) assertCanWrite()
    return rpc(fn, ...args)
  }

  const storageFrom = client.storage.from.bind(client.storage)
  client.storage.from = (bucket) => {
    const api = storageFrom(bucket)
    for (const method of ['upload', 'update', 'remove', 'move', 'copy']) {
      const original = api[method].bind(api)
      api[method] = (...args) => {
        assertCanWrite()
        return original(...args)
      }
    }
    return api
  }

  // "functions" é um getter que cria um cliente novo a cada acesso
  const functionsGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'functions')?.get
  if (functionsGetter) {
    Object.defineProperty(client, 'functions', {
      configurable: true,
      get() {
        const functions = functionsGetter.call(client)
        const invoke = functions.invoke.bind(functions)
        functions.invoke = (...args) => {
          assertCanWrite()
          return invoke(...args)
        }
        return functions
      },
    })
  }
  return client
}

export const supabase = isSupabaseConfigured ? blockWritesWhileSimulating(createClient(url, anonKey)) : null

// A vitrine pública sempre consulta como visitante (anon), mesmo com alguém
// logado no painel no mesmo navegador: a leitura autenticada de "cars" é
// restrita ao admin, então um vendedor logado veria a vitrine vazia.
export const publicSupabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'public-anon' },
    })
  : null
