import { supabase } from './supabaseClient.js'

// PIX gerado sem o "Já paguei" (seção 94). A loja registra quando copia o código ou a
// chave do PIX; a WB.Dev vê o que ficou sem aviso e confirma ou descarta.

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

// kind: 'creditos' (valor de um pacote) ou 'mensalidade' (só o admin, com os meses)
export async function registerPixCopy({ kind, amount, months = [] }) {
  return run(supabase.rpc('register_pix_copy', { p_kind: kind, p_amount: amount, p_months: months }))
}

function intentFromRow(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    kind: r.kind,
    amount: Number(r.amount) || 0,
    months: r.months || [],
    copies: Number(r.copies) || 1,
    status: r.status,
    createdByEmail: r.created_by_email || '',
    createdAt: r.created_at,
    lastCopiedAt: r.last_copied_at || r.created_at,
  }
}

// ------------------------------------------------------------------ plataforma
// Os que a loja não avisou (em aberto), do mais recente para o mais antigo
export async function fetchOpenPixIntents(kind) {
  const data = await run(
    supabase.from('pix_intents').select('*').eq('kind', kind).eq('status', 'aberto').order('last_copied_at', { ascending: false }).limit(100)
  )
  return (data || []).map(intentFromRow)
}

// Números do menu do painel WB.Dev: { creditos, mensalidade }
export async function countOpenPixIntents() {
  const data = await run(supabase.from('pix_intents').select('kind').eq('status', 'aberto'))
  const counts = { creditos: 0, mensalidade: 0 }
  for (const r of data || []) if (r.kind in counts) counts[r.kind] += 1
  return counts
}

// confirm = true: vira a compra (ou o pagamento dos meses) já confirmada, com a data do
// pagamento; false: descarta (não pagou)
export async function resolvePixIntent(id, confirm, paidOn = null) {
  return run(supabase.rpc('platform_resolve_pix_intent', { p_id: id, p_confirm: confirm, p_paid_on: paidOn }))
}
