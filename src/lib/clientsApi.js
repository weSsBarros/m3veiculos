import { supabase, publicSupabase, COMPANY_ID } from './supabaseClient.js'
import { PLATE_PRICE_DEFAULT, DOC_PHOTO_PRICE_DEFAULT, PLATE_PACKAGES_DEFAULT, packagesText, parsePackages } from '../utils/plateCredits.js'
import { formatMoneyInput, parseMoneyBR } from '../utils/financing.js'

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
    // Seção 67: compra do domínio, anos, onde está registrado e quem paga
    domainRegisteredOn: a.domain_registered_on || null,
    domainYears: a.domain_years ? Number(a.domain_years) : null,
    domainRegistrar: a.domain_registrar || '',
    domainPaidBy: a.domain_paid_by || '',
    notes: a.notes || '',
    onboarding: a.onboarding && typeof a.onboarding === 'object' ? a.onboarding : {},
    implantationStartedOn: a.implantation_started_on || null,
    activatedOn: a.activated_on || null,
    remindersEnabled: a.reminders_enabled !== false,
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
    whatsapp: row.whatsapp || '',
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
  domainRegisteredOn: 'domain_registered_on',
  domainYears: 'domain_years',
  domainRegistrar: 'domain_registrar',
  domainPaidBy: 'domain_paid_by',
  notes: 'notes',
  onboarding: 'onboarding',
  activatedOn: 'activated_on',
  remindersEnabled: 'reminders_enabled',
}

// Grava só os campos informados
export async function updateClientAccount(companyId, fields) {
  const row = {}
  for (const [key, column] of Object.entries(ACCOUNT_COLUMNS)) {
    if (fields[key] === undefined) continue
    row[column] = fields[key] === '' && ['monthlyPrice', 'dueDay', 'billingStart', 'domainExpiresOn', 'domainRegisteredOn', 'domainYears', 'planId', 'activatedOn'].includes(key) ? null : fields[key]
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

// ------------------------------------- lembretes por e-mail (seção 45)
function reminderFromRow(r) {
  return {
    id: r.id,
    companyId: r.company_id,
    kind: r.kind,
    referenceMonth: r.reference_month,
    paymentId: r.payment_id,
    sentTo: r.sent_to || '',
    status: r.status,
    error: r.error || '',
    createdAt: r.created_at,
  }
}

export async function fetchReminderLog(companyId = null, limit = 30) {
  let query = supabase.from('client_reminders').select('*').order('created_at', { ascending: false }).limit(limit)
  if (companyId) query = query.eq('company_id', companyId)
  return (await run(query)).map(reminderFromRow)
}

// Para quem vão os e-mails: o responsável da ficha ou, sem ele, os admins da loja
export async function fetchReminderRecipients(companyId) {
  return (await run(supabase.rpc('client_reminder_recipients', { p_company: companyId }))) || []
}

// Lembretes que saem hoje (o que o envio diário vai mandar)
export async function fetchRemindersDue() {
  return (await run(supabase.rpc('billing_reminders_due'))) || []
}

async function invokeEmail(body) {
  const { data, error } = await supabase.functions.invoke('wbdev-email', { body })
  if (error) {
    let message = error.message
    try {
      const payload = await error.context?.json()
      if (payload?.error) message = payload.error
    } catch {
      // resposta sem corpo JSON
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const sendRemindersNow = () => invokeEmail({ action: 'lembretes' })
export const sendTestEmail = () => invokeEmail({ action: 'teste' })
export const sendReceiptEmail = ({ paymentId, pdfBase64, filename }) =>
  invokeEmail({ action: 'recibo', payment_id: paymentId, pdf_base64: pdfBase64, filename })

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
function claimFromRow(c) {
  return {
    id: c.id,
    companyId: c.company_id || null,
    months: Array.isArray(c.months) ? c.months : [],
    amount: Number(c.amount) || 0,
    paidOn: c.paid_on,
    receipt: c.receipt || null,
    note: c.note || '',
    status: c.status || 'pendente',
    response: c.response || '',
    createdByEmail: c.created_by_email || '',
    createdAt: c.created_at,
    reviewedAt: c.reviewed_at || null,
  }
}

// Painel da loja: situação, abas do plano, avisos, contrato de adesão e (admin)
// a mensalidade com os dados do PIX
export async function fetchMyAccount() {
  const data = await run(supabase.rpc('my_account'))
  const terms = data?.terms
  const payment = data?.payment
  const support = data?.support || {}
  return {
    status: data?.status || 'ativo',
    planName: data?.plan_name || '',
    // null = sem plano cadastrado (todas as abas liberadas)
    features: Array.isArray(data?.features) ? data.features : null,
    notices: (data?.notices || []).map((n) => ({ id: n.id, title: n.title, message: n.message || '', level: n.level || 'info' })),
    billing: data?.billing || null,
    // null = nenhuma versão publicada (nada a aceitar)
    terms: terms
      ? {
          version: terms.version,
          title: terms.title || '',
          accepted: Boolean(terms.accepted),
          body: terms.body || '',
          acceptance: terms.acceptance
            ? {
                version: terms.acceptance.version,
                acceptedAt: terms.acceptance.accepted_at,
                userName: terms.acceptance.user_name || '',
                userEmail: terms.acceptance.user_email || '',
              }
            : null,
        }
      : null,
    // Login da equipe WB.Dev (suporte) dentro da loja: não aceita os termos pelo cliente
    platformTeam: Boolean(data?.platform_team),
    payment: payment
      ? {
          pixKey: payment.pix_key || '',
          pixName: payment.pix_name || '',
          pixCity: payment.pix_city || '',
          bankName: payment.bank_name || '',
          bankAgency: payment.bank_agency || '',
          bankAccount: payment.bank_account || '',
          bankHolder: payment.bank_holder || '',
          bankDocument: payment.bank_document || '',
          claims: (payment.claims || []).map(claimFromRow),
        }
      : null,
    support: {
      phone: support.phone || '',
      email: support.email || '',
      hours: support.hours || '',
      unread: Number(support.unread) || 0,
    },
  }
}

// Contrato de adesão: o admin da loja aceita a versão publicada
export async function acceptPlatformTerms(version) {
  return run(supabase.rpc('accept_platform_terms', { p_version: version }))
}

// Comprovante do aceite (texto + registro). companyId só para a plataforma.
export async function fetchTermsReceipt(companyId = null) {
  return run(supabase.rpc('terms_receipt', companyId ? { p_company: companyId } : {}))
}

// "Já paguei": comprovante (opcional) no bucket privado payment-receipts
export async function uploadPaymentReceipt(file) {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
  const path = `${COMPANY_ID}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('payment-receipts').upload(path, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  return { path, name: file.name, type: file.type }
}

export async function paymentReceiptUrl(path) {
  const { data, error } = await supabase.storage.from('payment-receipts').createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}

export async function informPayment({ months, amount, paidOn, receipt = null, note = '' }) {
  return claimFromRow(await run(supabase.rpc('inform_payment', { p_months: months, p_amount: amount, p_paid_on: paidOn, p_receipt: receipt, p_note: note })))
}

// Pagamentos confirmados da própria loja (página Mensalidade)
export async function fetchMyPayments() {
  const data = await run(supabase.rpc('my_payments'))
  return (data || []).map((p) => ({ id: p.id, referenceMonth: p.reference_month, amount: Number(p.amount) || 0, paidOn: p.paid_on, method: p.method || '' }))
}

// Avisa a WB.Dev no WhatsApp (pagamento informado ou mensagem de chamado).
// Falhar aqui não atrapalha: o pagamento e o chamado já estão gravados.
export async function notifyWbdev(action, id) {
  try {
    const { data } = await supabase.functions.invoke('wbdev-email', { body: { action, id } })
    return Boolean(data?.notified)
  } catch {
    return false
  }
}

// ---------------------------------------------- plataforma: PIX, contrato e contatos
function settingsFromRow(s = {}) {
  return {
    pixKey: s.pix_key || '',
    pixName: s.pix_name || '',
    pixCity: s.pix_city || '',
    bankName: s.bank_name || '',
    bankAgency: s.bank_agency || '',
    bankAccount: s.bank_account || '',
    bankHolder: s.bank_holder || '',
    bankDocument: s.bank_document || '',
    notifyPhone: s.notify_phone || '',
    supportEmail: s.support_email || '',
    supportHours: s.support_hours || '',
    // Consulta por placa e foto do documento (seção 71): preços e pacotes de crédito
    platePrice: formatMoneyInput(s.plate_price != null ? Number(s.plate_price) : PLATE_PRICE_DEFAULT),
    docPhotoPrice: formatMoneyInput(s.doc_photo_price != null ? Number(s.doc_photo_price) : DOC_PHOTO_PRICE_DEFAULT),
    platePackages: packagesText(s.plate_packages || PLATE_PACKAGES_DEFAULT),
  }
}

export async function fetchPlatformSettings() {
  return settingsFromRow((await run(supabase.from('platform_settings').select('*').eq('id', 1).maybeSingle())) || {})
}

export async function savePlatformSettings(s) {
  const row = {
    pix_key: s.pixKey.trim(),
    pix_name: s.pixName.trim(),
    pix_city: s.pixCity.trim(),
    bank_name: s.bankName.trim(),
    bank_agency: s.bankAgency.trim(),
    bank_account: s.bankAccount.trim(),
    bank_holder: s.bankHolder.trim(),
    bank_document: s.bankDocument.trim(),
    notify_phone: s.notifyPhone.replace(/\D/g, ''),
    support_email: s.supportEmail.trim(),
    support_hours: s.supportHours.trim(),
  }
  // Preços e pacotes dos créditos: só grava se vieram certos (a tela confere)
  const platePrice = parseMoneyBR(s.platePrice)
  const docPhotoPrice = parseMoneyBR(s.docPhotoPrice)
  const platePackages = parsePackages(s.platePackages)
  if (platePrice > 0) row.plate_price = platePrice
  if (docPhotoPrice > 0) row.doc_photo_price = docPhotoPrice
  if (platePackages) row.plate_packages = platePackages
  return settingsFromRow(await run(supabase.from('platform_settings').update(row).eq('id', 1).select().single()))
}

export async function fetchPaymentClaims() {
  const data = await run(supabase.from('client_payment_claims').select('*').order('created_at', { ascending: false }).limit(100))
  return (data || []).map(claimFromRow)
}

// Pagamentos informados ainda não conferidos (número na aba Cobrança)
export async function countPendingClaims() {
  const { count, error } = await supabase.from('client_payment_claims').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
  if (error) throw error
  return count || 0
}

export async function reviewPaymentClaim(id, confirm, response = '') {
  return run(supabase.rpc('platform_review_payment_claim', { p_id: id, p_confirm: confirm, p_response: response }))
}

function termsFromRow(t) {
  return { id: t.id, version: t.version, title: t.title, body: t.body, status: t.status, publishedAt: t.published_at, updatedAt: t.updated_at }
}

export async function fetchPlatformTerms() {
  const data = await run(supabase.from('platform_terms').select('*').order('version', { ascending: false, nullsFirst: true }))
  return (data || []).map(termsFromRow)
}

export async function saveTermsDraft({ id = null, title, body }) {
  const query = id
    ? supabase.from('platform_terms').update({ title, body }).eq('id', id).eq('status', 'rascunho')
    : supabase.from('platform_terms').insert({ title, body, status: 'rascunho' })
  return termsFromRow(await run(query.select().single()))
}

export async function publishPlatformTerms() {
  return run(supabase.rpc('publish_platform_terms'))
}

export async function fetchTermsOverview() {
  const data = await run(supabase.rpc('platform_terms_overview'))
  return (data || []).map((c) => ({
    companyId: c.company_id,
    slug: c.slug,
    name: c.name,
    status: c.status || '',
    acceptance: c.acceptance
      ? { version: c.acceptance.version, acceptedAt: c.acceptance.accepted_at, userName: c.acceptance.user_name || '', userEmail: c.acceptance.user_email || '', ip: c.acceptance.ip || '' }
      : null,
  }))
}

function contactNoteFromRow(n) {
  return { id: n.id, companyId: n.company_id, channel: n.channel, note: n.note, contactedOn: n.contacted_on, createdAt: n.created_at }
}

export async function fetchContactNotes(companyId = null) {
  let query = supabase.from('client_contact_notes').select('*').order('contacted_on', { ascending: false }).order('created_at', { ascending: false })
  if (companyId) query = query.eq('company_id', companyId)
  return ((await run(query.limit(500))) || []).map(contactNoteFromRow)
}

export async function addContactNote({ companyId, channel, note, contactedOn }) {
  return contactNoteFromRow(
    await run(supabase.from('client_contact_notes').insert({ company_id: companyId, channel, note: note.trim(), contacted_on: contactedOn }).select().single())
  )
}

export async function deleteContactNote(id) {
  await run(supabase.from('client_contact_notes').delete().eq('id', id))
}

// Site e login: a loja deste site está bloqueada?
// Loja bloqueada: no login, o admin vê o que está em aberto e o PIX para pagar
// (o resto da equipe só fica sabendo que é com o admin). null = loja liberada.
export async function fetchSuspendedAccount(companyId = COMPANY_ID) {
  const data = await run(supabase.rpc('suspended_account', { p_company: companyId }))
  if (!data) return null
  return {
    admin: Boolean(data.admin),
    name: data.name || '',
    billing: data.billing || null,
    payment: data.admin
      ? {
          pixKey: data.pix_key || '',
          pixName: data.pix_name || '',
          pixCity: data.pix_city || '',
          bankName: data.bank_name || '',
          bankAgency: data.bank_agency || '',
          bankAccount: data.bank_account || '',
          bankHolder: data.bank_holder || '',
          bankDocument: data.bank_document || '',
        }
      : null,
  }
}

export async function fetchCompanyStatus(companyId = COMPANY_ID) {
  const { data, error } = await publicSupabase.rpc('company_status', { p_company: companyId })
  if (error) return { blocked: false, name: '' }
  return { blocked: Boolean(data?.blocked), name: data?.name || '' }
}
