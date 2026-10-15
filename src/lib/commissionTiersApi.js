import { supabase, COMPANY_ID } from './supabaseClient.js'

// Faixas de comissão da loja (seção 78): ex. "Carro grande" R$ 1.000 para SUV e
// picape. Toda a equipe lê (a janela da venda mostra a comissão); só o admin grava.

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount) || 0,
    categories: Array.isArray(row.categories) ? row.categories : [],
    position: Number(row.position) || 0,
    active: row.active !== false,
  }
}

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchCommissionTiers() {
  if (!supabase) return []
  const data = await run(supabase.from('commission_tiers').select('*').eq('company_id', COMPANY_ID).order('position').order('created_at'))
  return (data || []).map(fromRow)
}

export async function saveCommissionTier(tier) {
  const row = {
    name: tier.name.trim(),
    amount: tier.amount,
    categories: tier.categories || [],
    position: tier.position || 0,
    active: tier.active !== false,
  }
  const query = tier.id
    ? supabase.from('commission_tiers').update(row).eq('id', tier.id).eq('company_id', COMPANY_ID)
    : supabase.from('commission_tiers').insert({ ...row, company_id: COMPANY_ID })
  return fromRow(await run(query.select().single()))
}

export async function deleteCommissionTier(id) {
  await run(supabase.from('commission_tiers').delete().eq('id', id).eq('company_id', COMPANY_ID))
}

// Põe a faixa da categoria nos carros (não vendidos) que estão sem faixa
export async function applyCommissionTiers() {
  return Number(await run(supabase.rpc('commission_tiers_apply'))) || 0
}

// Comissão de quem recebe "Pela faixa do carro": o valor da faixa (sem faixa = 0)
export function tierCommission(tiers, tierId) {
  const tier = (tiers || []).find((t) => t.id === tierId)
  return tier ? tier.amount : 0
}

// Faixas de comissão por valor da venda (seção 82): "até" um valor (null = acima da
// maior) e a comissão. Toda a equipe lê; só o admin grava. Contas em utils/commissionBands.js.
function bandFromRow(row) {
  return {
    id: row.id,
    upTo: row.up_to == null ? null : Number(row.up_to),
    amount: Number(row.amount) || 0,
  }
}

export async function fetchCommissionBands() {
  if (!supabase) return []
  const data = await run(supabase.from('commission_price_bands').select('id, up_to, amount').eq('company_id', COMPANY_ID))
  return (data || []).map(bandFromRow)
}

export async function saveCommissionBand(band) {
  const row = { up_to: band.upTo, amount: band.amount }
  const query = band.id
    ? supabase.from('commission_price_bands').update(row).eq('id', band.id).eq('company_id', COMPANY_ID)
    : supabase.from('commission_price_bands').insert({ ...row, company_id: COMPANY_ID })
  return bandFromRow(await run(query.select('id, up_to, amount').single()))
}

export async function deleteCommissionBand(id) {
  await run(supabase.from('commission_price_bands').delete().eq('id', id).eq('company_id', COMPANY_ID))
}
