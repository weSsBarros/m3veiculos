import { supabase, COMPANY_ID } from './supabaseClient.js'
import { cleanAddress, formatAddress, hasAddress } from '../utils/fiscal.js'

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    document: row.document || '',
    rg: row.rg || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    // Seção 57: endereço em partes (CEP, rua, número, bairro, cidade, IBGE, UF)
    addressParts: obj(row.address_parts),
    notes: row.notes || '',
    // Vendedor responsável (recebe os avisos de carro que combina)
    responsibleSellerId: row.responsible_seller_id || null,
    // Carro dele para a troca: { model, year, km, expectedValue }
    tradeIn: obj(row.trade_in),
    // Como pretende pagar: { method, downPayment, maxInstallment }
    paymentIntent: obj(row.payment_intent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Os campos de negociação só vão quando vieram no objeto: quem cadastra pelo
// seletor rápido (venda, contrato) não apaga o que já estava gravado.
function toRow(customer) {
  const row = {
    company_id: COMPANY_ID,
    name: customer.name,
    document: customer.document || '',
    rg: customer.rg || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    notes: customer.notes || '',
  }
  if (customer.responsibleSellerId !== undefined) row.responsible_seller_id = customer.responsibleSellerId || null
  if (customer.tradeIn !== undefined) row.trade_in = cleanObject(customer.tradeIn)
  if (customer.paymentIntent !== undefined) row.payment_intent = cleanObject(customer.paymentIntent)
  // Com o endereço em partes, o endereço completo (contratos) é montado dele
  if (customer.addressParts !== undefined) {
    row.address_parts = cleanAddress(customer.addressParts)
    if (hasAddress(row.address_parts)) row.address = formatAddress(row.address_parts)
  }
  return row
}

function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

// Tira campos vazios (o banco guarda só o que foi preenchido)
function cleanObject(value) {
  const out = {}
  for (const [key, v] of Object.entries(obj(value))) {
    if (v === '' || v == null) continue
    out[key] = typeof v === 'string' ? v.trim() : v
  }
  return out
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

export async function fetchAllCustomers() {
  requireSupabase()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('name', { ascending: true })
  if (error) throw error
  return data.map(fromRow)
}

export async function createCustomer(customer) {
  requireSupabase()
  const { data, error } = await supabase.from('customers').insert(toRow(customer)).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCustomer(id, customer) {
  requireSupabase()
  const { data, error } = await supabase.from('customers').update(toRow(customer)).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteCustomer(id) {
  requireSupabase()
  const { error } = await supabase.from('customers').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}
