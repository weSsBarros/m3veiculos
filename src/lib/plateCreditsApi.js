import { supabase } from './supabaseClient.js'
import { creditsFromRow } from '../utils/plateCredits.js'

// Créditos da consulta por placa (seção 71). A loja: saldo, compra ("Já paguei")
// e extrato. A Plataforma: confere as compras, faz ajustes e vê o saldo das lojas.

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

// Saldo, preço e pacotes (equipe toda); pedidos e extrato (só o admin)
export async function fetchMyPlateCredits() {
  return creditsFromRow(await run(supabase.rpc('my_plate_credits')))
}

// "Já paguei" dos créditos: o pacote, a data e o comprovante (opcional)
export async function requestPlateCredit({ amount, paidOn, receipt = null, note = '' }) {
  return run(supabase.rpc('request_plate_credit', { p_amount: amount, p_paid_on: paidOn, p_receipt: receipt, p_note: note }))
}

// ------------------------------------------------------------------ plataforma
function orderFromRow(o) {
  return {
    id: o.id,
    companyId: o.company_id,
    amount: Number(o.amount) || 0,
    paidOn: o.paid_on,
    receipt: o.receipt || null,
    note: o.note || '',
    status: o.status || 'pendente',
    response: o.response || '',
    createdByEmail: o.created_by_email || '',
    createdAt: o.created_at,
  }
}

export async function fetchPlateCreditOrders() {
  const data = await run(supabase.from('plate_credit_orders').select('*').order('created_at', { ascending: false }).limit(100))
  return (data || []).map(orderFromRow)
}

// Compras de créditos ainda não conferidas (número na aba Cobrança)
export async function countPendingPlateOrders() {
  const { count, error } = await supabase.from('plate_credit_orders').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
  if (error) throw error
  return count || 0
}

export async function reviewPlateCredit(id, confirm, response = '') {
  return run(supabase.rpc('platform_review_plate_credit', { p_id: id, p_confirm: confirm, p_response: response }))
}

export async function adjustPlateCredit(companyId, amount, note) {
  return Number(await run(supabase.rpc('platform_adjust_plate_credit', { p_company: companyId, p_amount: amount, p_note: note }))) || 0
}

// Saldo de cada loja, consultas pagas e fotos lidas nos últimos 30 dias
export async function fetchPlatformPlateCredits() {
  const data = await run(supabase.rpc('platform_plate_credits'))
  return (data || []).map((r) => ({
    companyId: r.company_id,
    name: r.name,
    slug: r.slug,
    balance: Number(r.balance) || 0,
    queries30d: Number(r.queries_30d) || 0,
    docs30d: Number(r.docs_30d) || 0,
    signatures30d: Number(r.signatures_30d) || 0,
    spent30d: Number(r.spent_30d) || 0,
    boughtTotal: Number(r.bought_total) || 0,
    lastRechargeAt: r.last_recharge_at || null,
  }))
}
