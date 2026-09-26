import { supabase, COMPANY_ID } from './supabaseClient.js'

export const DEFAULT_STOCK_ALERT_DAYS = 60

// Prazo padrão da loja para o aviso vermelho de "muito tempo em estoque"
export async function fetchStockAlertDefault() {
  if (!supabase) return DEFAULT_STOCK_ALERT_DAYS
  const { data, error } = await supabase.from('companies').select('stock_alert_days').eq('id', COMPANY_ID).maybeSingle()
  if (error || !data) return DEFAULT_STOCK_ALERT_DAYS
  return data.stock_alert_days || DEFAULT_STOCK_ALERT_DAYS
}

// Define o padrão da loja e sobrescreve o prazo de todos os carros
export async function applyStockAlertToAll(days) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.rpc('apply_stock_alert_to_all', { p_days: days })
  if (error) throw error
  return data
}
