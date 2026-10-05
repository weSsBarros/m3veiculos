import { supabase, publicSupabase, COMPANY_ID } from './supabaseClient.js'

// Painel WB.Dev (seção 39 do schema.sql): clientes, planos, pagamentos e
// avisos. As tabelas só abrem para o dono da plataforma (platform_admins);
// as lojas usam só my_account() e company_status().

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

function accountFromRow(a = {}) {
  return {
    planId: a.plan_id || null,
    monthlyPrice: num(a.monthly_price),
    dueDay: a.due_day || null,
    billingStart: a.billing_start || null,
    status: a.status || 'ativo',
    blockedAt: a.blocked_at || null,
    blockReason: a.block_reason || '',
    legalName: a.legal_name || '',
    cnpj: a.cnpj || '',
    responsibleName: a.responsible_name || '',
    responsiblePhone: a.responsible_phone || '',
    responsibleEmail: a.responsible_email || '',
    domain: a.domain || '',
    domainExpiresOn: a.domain_expires_on || null,
    notes: a.notes || '',
    onboarding: a.onboarding && typeof a.onboarding === 'object' ? a.onboarding : {},
    implantationStartedOn: a.implantation_started_on || null,
    activatedOn: a.activated_on || null,
  }
}

function planFromRow(p) {
  return {
    id: p.id,
    name: p.name,
    monthlyPrice: num(p.monthly_price),
    features: Array.isArray(p.features) ? p.features : [],
    active: p.active !== false,
  }
}

function clientFromRow(row) {
  const checks = row.checks || {}
  return {
    companyId: row.company_id,
    slug: row.slug,
    name: row.name,
    siteUrl: row.site_url || '',
    account: accountFromRow(row.account),
    plan: row.plan ? planFromRow(row.plan) : null,
    billing: row.billing || { situation: 'sem_cobranca' },
    checks: {
      whatsappOk: Boolean(checks.whatsapp_ok),
      cars: Number(checks.cars) || 0,
      logins: Number(checks.logins) || 0,
      ownDomain: Boolean(checks.own_domain),
    },
  }
}

function paymentFromRow(p) {
  return {
    id: p.id,
    companyId: p.company_id,
    referenceMonth: p.reference_month,
    amount: Number(p.amount) || 0,
    paidOn: p.paid_on,
    method: p.method || '',
    notes: p.notes || '',
  }
}

function noticeFromRow(n) {
  return {
    id: n.id,
    companyId: n.company_id || null,
    title: n.title,
    message: n.message || '',
    level: n.level || 'info',
    audience: n.audience || 'equipe',
    startsOn: n.starts_on,
    endsOn: n.ends_on || null,
    createdAt: n.created_at,
  }
}

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

// ---------------------------------------------------------------- clientes
export async function fetchClients() {
  const data = await run(supabase.rpc('platform_clients'))
  return (data || []).map(clientFromRow)
}

const ACCOUNT_COLUMNS = {
  planId: 'plan_id',
  monthlyPrice: 'monthly_price',
  dueDay: 'due_day',
  billingStart: 'billing_start',
  status: 'status',
  blockReason: 'block_reason',
  legalName: 'legal_name',
  cnpj: 'cnpj',
  responsibleName: 'responsible_name',
  responsiblePhone: 'responsible_phone',
  responsibleEmail: 'responsible_email',
  domain: 'domain',
  domainExpiresOn: 'domain_expires_on',
  notes: 'notes',
  onboarding: 'onboarding',
  activatedOn: 'activated_on',
}

// Grava só os campos informados
export async function updateClientAccount(companyId, fields) {
  const row = {}
  for (const [key, column] of Object.entries(ACCOUNT_COLUMNS)) {
    if (fields[key] === undefined) continue
    row[column] = fields[key] === '' && ['monthlyPrice', 'dueDay', 'billingStart', 'domainExpiresOn', 'planId', 'activatedOn'].includes(key) ? null : fields[key]
  }
  const data = await run(supabase.from('client_accounts').update(row).eq('company_id', companyId).select().single())
  return accountFromRow(data)
}

// -------------------------------------------------------------- pagamentos
export async function fetchPayments(companyId = null) {
  let query = supabase.from('client_payments').select('*').order('reference_month', { ascending: false })
  if (companyId) query = query.eq('company_id', companyId)
  return (await run(query)).map(paymentFromRow)
}

export async function addPayment(payment) {
  const data = await run(
    supabase
      .from('client_payments')
      .insert({
        company_id: payment.companyId,
        reference_month: payment.referenceMonth,
        amount: payment.amount,
        paid_on: payment.paidOn,
        method: payment.method || '',
        notes: payment.notes || '',
      })
      .select()
      .single()
  ).catch((err) => {
    if (err.code === '23505') throw new Error('Esse mês já tem pagamento registrado.')
    throw err
  })
  return paymentFromRow(data)
}

export async function deletePayment(id) {
  await run(supabase.from('client_payments').delete().eq('id', id))
}

// ------------------------------------------------------------------ planos
export async function fetchPlans() {
  return (await run(supabase.from('plans').select('*').order('name'))).map(planFromRow)
}

export async function savePlan(plan) {
  const row = { name: plan.name.trim(), monthly_price: plan.monthlyPrice ?? null, features: plan.features, active: plan.active !== false }
  const query = plan.id ? supabase.from('plans').update(row).eq('id', plan.id) : supabase.from('plans').insert(row)
  const data = await run(query.select().single()).catch((err) => {
    if (err.code === '23505') throw new Error('Já existe um plano com esse nome.')
    throw err
  })
  return planFromRow(data)
}

export async function deletePlan(id) {
  await run(supabase.from('plans').delete().eq('id', id))
}

// ------------------------------------------------------------------ avisos
export async function fetchNotices() {
  return (await run(supabase.from('client_notices').select('*').order('created_at', { ascending: false }))).map(noticeFromRow)
}

export async function saveNotice(notice) {
  const row = {
    company_id: notice.companyId || null,
    title: notice.title.trim(),
    message: notice.message || '',
    level: notice.level,
    audience: notice.audience,
    starts_on: notice.startsOn,
    ends_on: notice.endsOn || null,
  }
  const query = notice.id ? supabase.from('client_notices').update(row).eq('id', notice.id) : supabase.from('client_notices').insert(row)
  return noticeFromRow(await run(query.select().single()))
}

export async function deleteNotice(id) {
  await run(supabase.from('client_notices').delete().eq('id', id))
}

// Botão "Novo cliente": cria a loja no sistema, já "Em implantação" (seção 43)
export async function createClient(client) {
  const data = await run(
    supabase.rpc('platform_create_client', {
      p_name: client.name.trim(),
      p_slug: client.slug.trim(),
      p_responsible_name: client.responsibleName || '',
      p_responsible_phone: client.responsiblePhone || '',
      p_responsible_email: client.responsibleEmail || '',
      p_plan_id: client.planId || null,
      p_monthly_price: client.monthlyPrice ?? null,
      p_due_day: client.dueDay || null,
    })
  ).catch((err) => {
    if (err.code === '23505') throw new Error('Já existe uma loja com esse endereço interno. Escolha outro.')
    throw err
  })
  return data
}

// ---------------------------------------- despesas da plataforma (seção 41)
function expenseFromRow(e) {
  return {
    id: e.id,
    spentOn: e.spent_on,
    description: e.description,
    category: e.category || 'outros',
    amount: Number(e.amount) || 0,
    companyId: e.company_id || null,
    notes: e.notes || '',
  }
}

export async function fetchExpenses() {
  const query = supabase.from('platform_expenses').select('*').order('spent_on', { ascending: false }).order('created_at', { ascending: false })
  return (await run(query)).map(expenseFromRow)
}

export async function saveExpense(expense) {
  const row = {
    spent_on: expense.spentOn,
    description: expense.description.trim(),
    category: expense.category,
    amount: expense.amount,
    company_id: expense.companyId || null,
    notes: expense.notes || '',
  }
  const query = expense.id ? supabase.from('platform_expenses').update(row).eq('id', expense.id) : supabase.from('platform_expenses').insert(row)
  return expenseFromRow(await run(query.select().single()))
}

export async function deleteExpense(id) {
  await run(supabase.from('platform_expenses').delete().eq('id', id))
}

// ------------------------------------------------------- lado das lojas
// Painel da loja: situação, abas do plano, avisos e (admin) a mensalidade
export async function fetchMyAccount() {
  const data = await run(supabase.rpc('my_account'))
  return {
    status: data?.status || 'ativo',
    planName: data?.plan_name || '',
    // null = sem plano cadastrado (todas as abas liberadas)
    features: Array.isArray(data?.features) ? data.features : null,
    notices: (data?.notices || []).map((n) => ({ id: n.id, title: n.title, message: n.message || '', level: n.level || 'info' })),
    billing: data?.billing || null,
  }
}

// Site e login: a loja deste site está bloqueada?
export async function fetchCompanyStatus(companyId = COMPANY_ID) {
  const { data, error } = await publicSupabase.rpc('company_status', { p_company: companyId })
  if (error) return { blocked: false, name: '' }
  return { blocked: Boolean(data?.blocked), name: data?.name || '' }
}
