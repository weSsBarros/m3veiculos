import { supabase, COMPANY_ID } from './supabaseClient.js'
import { DEFAULT_SALE_CHECKLIST } from '../utils/saleChecklist.js'
import { DEFAULT_INTAKE_CHECKLIST, DEFAULT_INSPECTION_CHECKLIST } from '../utils/carChecklists.js'
import { DEFAULT_BANKS } from '../utils/payment.js'
import { rememberCompanyFiscal } from '../utils/contractCompany.js'

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

// Configurações da loja usadas no pós-venda. select('*') de propósito: se a
// loja ainda não rodou a parte nova do schema.sql, as colunas novas só não
// vêm (e valem os padrões), sem quebrar o resto.
export async function fetchCompanySettings() {
  const defaults = {
    name: '',
    stockAlertDays: DEFAULT_STOCK_ALERT_DAYS,
    saleChecklist: DEFAULT_SALE_CHECKLIST,
    lateFeePercent: 2,
    lateInterestPercent: 1,
    bankList: DEFAULT_BANKS,
    intakeChecklist: DEFAULT_INTAKE_CHECKLIST,
    inspectionChecklist: DEFAULT_INSPECTION_CHECKLIST,
    fiscal: {},
  }
  if (!supabase) return defaults
  const { data, error } = await supabase.from('companies').select('*').eq('id', COMPANY_ID).maybeSingle()
  if (error || !data) return defaults
  return {
    name: data.name || '',
    stockAlertDays: data.stock_alert_days || DEFAULT_STOCK_ALERT_DAYS,
    saleChecklist: Array.isArray(data.sale_checklist) ? data.sale_checklist : DEFAULT_SALE_CHECKLIST,
    lateFeePercent: data.late_fee_percent != null ? Number(data.late_fee_percent) : 2,
    lateInterestPercent: data.late_interest_percent != null ? Number(data.late_interest_percent) : 1,
    bankList: Array.isArray(data.bank_list) ? data.bank_list : DEFAULT_BANKS,
    intakeChecklist: Array.isArray(data.intake_checklist) ? data.intake_checklist : DEFAULT_INTAKE_CHECKLIST,
    inspectionChecklist: Array.isArray(data.inspection_checklist) ? data.inspection_checklist : DEFAULT_INSPECTION_CHECKLIST,
    // Seção 57: razão social, CNPJ, IE, regime e endereço (os documentos usam)
    fiscal: rememberCompanyFiscal(data.fiscal, data.name),
  }
}

// Dados fiscais da loja (só o admin; o banco confere CNPJ, CEP, UF e IBGE)
export async function saveCompanyFiscal(fiscal) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.rpc('save_company_fiscal', { p: fiscal })
  if (error) throw error
  return rememberCompanyFiscal(data)
}

// Listas editáveis da loja (admin e gerente): bancos, itens que vêm com o
// carro e vistoria de entrada
const COMPANY_LISTS = {
  banks: 'bank_list',
  intake: 'intake_checklist',
  inspection: 'inspection_checklist',
  sale: 'sale_checklist',
}

export async function saveCompanyList(kind, items) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const column = COMPANY_LISTS[kind]
  if (!column) throw new Error('Lista desconhecida.')
  const { error } = await supabase.from('companies').update({ [column]: items }).eq('id', COMPANY_ID)
  if (error) throw error
}

// Itens do checklist de entrega (admin e gerente)
export async function saveSaleChecklist(items) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.from('companies').update({ sale_checklist: items }).eq('id', COMPANY_ID)
  if (error) throw error
}

// Padrão de multa e juros das parcelas (admin e gerente que vê valores)
export async function saveCustomerFinanceDefaults(lateFeePercent, lateInterestPercent) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { error } = await supabase.rpc('set_customer_finance_defaults', {
    p_late_fee: lateFeePercent,
    p_late_interest: lateInterestPercent,
  })
  if (error) throw error
}
