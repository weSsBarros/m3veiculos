// Edge Function "assinaturas" — contratos assinados digitalmente pela
// Autentique (seção 53). Ações do painel (login da pessoa no Authorization):
//   enviar: manda o arquivo gerado no painel (PDF ou Word) com os assinantes;
//   atualizar: consulta a Autentique e grava a situação (até 10 por vez);
//   reenviar: manda de novo o e-mail para quem ainda não assinou;
//   cancelar: ninguém assinou = apaga; alguém já assinou = encerra o prazo;
//   baixar: devolve o PDF assinado.
// Aviso da Autentique (webhook, cabeçalho x-autentique-signature conferido com o
// segredo AUTENTIQUE_WEBHOOK_SECRET): atualiza o documento do evento na hora.
// Quando todos assinam, o PDF assinado vai para a ficha do cliente
// (customer_documents). A conta da Autentique é uma só, da WB.Dev: o token fica
// no segredo AUTENTIQUE_TOKEN, cadastrado pelo Wesley. A loja de demonstração
// (companies.is_demo) manda em modo de teste (sem custo e sem validade).
// Créditos (seção 75): cada envio usa a franquia do mês da loja (5 grátis) ou
// desconta o preço (R$ 1,00) do saldo de créditos; cancelar não devolve, só o
// envio que falhou aqui. Sem franquia e sem saldo: 402.
// Publicar com "Verify JWT" desligado (o webhook não tem login); as ações do
// painel conferem o login pelo banco (can_edit_stock e a RLS das tabelas).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { decodeBase64, encodeBase64 } from 'jsr:@std/encoding@1/base64'

const API = 'https://api.autentique.com.br/v2/graphql'
const MAX_FILE = 5 * 1024 * 1024
const MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const ROLES = ['cliente', 'dono', 'loja', 'testemunha']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

class UserError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type Signer = {
  role: string
  name: string
  email: string
  public_id?: string | null
  viewed_at?: string | null
  signed_at?: string | null
  rejected_at?: string | null
  reason?: string | null
}

type Row = {
  id: string
  company_id: string
  kind: string
  contract_id: string | null
  car_id: string | null
  customer_id: string | null
  title: string
  file_name: string
  external_id: string | null
  sandbox: boolean
  status: string
  signers: Signer[]
  signed_document_id: string | null
  sent_by: string | null
  finished_at: string | null
  checked_at: string | null
}

// -- Autentique ------------------------------------------------------------------

const ERRORS: Record<string, string> = {
  unauthorized: 'O token da Autentique não vale mais (segredo AUTENTIQUE_TOKEN).',
  unavailable_credits: 'Acabaram os documentos do plano da Autentique da WB.Dev. Fale com a WB.Dev.',
  must_be_a_valid_email_address: 'Algum e-mail de assinante não é válido.',
  document_not_found: 'O documento não foi encontrado na Autentique.',
  too_many_resent_emails: 'O e-mail já foi reenviado há pouco. Tente de novo mais tarde.',
}

function errorText(errors: Array<Record<string, unknown>>) {
  const codes: string[] = []
  for (const e of errors) {
    codes.push(String(e.message || ''))
    const validation = (e.extensions as { validation?: Record<string, string[]> } | undefined)?.validation
    if (validation) for (const list of Object.values(validation)) codes.push(...list)
  }
  const known = codes.find((c) => ERRORS[c])
  return known ? ERRORS[known] : `A Autentique recusou: ${codes.filter(Boolean).join('; ') || 'erro desconhecido'}`
}

async function readGql(res: Response) {
  if (res.status === 429) throw new UserError('A Autentique pediu para esperar um pouco. Tente de novo em 1 minuto.', 503)
  const text = await res.text()
  let body: { data?: Record<string, unknown>; errors?: Array<Record<string, unknown>> }
  try {
    body = JSON.parse(text)
  } catch {
    throw new UserError(`A Autentique não respondeu como esperado (${res.status}).`, 502)
  }
  if (body.errors?.length) throw new UserError(errorText(body.errors), 502)
  return body.data || {}
}

function gql(token: string, query: string, variables?: Record<string, unknown>) {
  return fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  }).then(readGql)
}

const safeId = (id: string) => {
  if (!/^[A-Za-z0-9-]{8,120}$/.test(id)) throw new UserError('Documento inválido.')
  return id
}

type RemoteSignature = {
  public_id: string
  email: string | null
  viewed?: { created_at: string } | null
  signed?: { created_at: string } | null
  rejected?: { created_at: string; reason?: string | null } | null
}
type RemoteDocument = { id: string; files?: { signed?: string | null } | null; signatures?: RemoteSignature[] }

async function fetchDocument(token: string, id: string): Promise<RemoteDocument | null> {
  try {
    const data = await gql(token, `query { document(id: "${safeId(id)}") {
      id files { signed }
      signatures { public_id email viewed { created_at } signed { created_at } rejected { created_at reason } }
    } }`)
    return (data.document as RemoteDocument) || null
  } catch (err) {
    if (err instanceof UserError && (err.message === ERRORS.document_not_found || /not.?found/i.test(err.message))) return null
    throw err
  }
}

async function downloadSigned(token: string, url: string) {
  // O link do PDF assinado é do painel da Autentique: tenta com o token e, se
  // não der, sem ele (alguns links já vêm assinados)
  for (const headers of [{ Authorization: `Bearer ${token}` }, {}]) {
    const res = await fetch(url, { headers, redirect: 'follow' })
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF') return bytes
    }
  }
  return null
}

// -- Situação ---------------------------------------------------------------------

function mergeSigners(signers: Signer[], remote: RemoteSignature[]) {
  return signers.map((s) => {
    const sig = remote.find((r) => (s.public_id && r.public_id === s.public_id) || (r.email && r.email.toLowerCase() === s.email))
    if (!sig) return s
    return {
      ...s,
      public_id: sig.public_id,
      viewed_at: sig.viewed?.created_at ?? s.viewed_at ?? null,
      signed_at: sig.signed?.created_at ?? null,
      rejected_at: sig.rejected?.created_at ?? null,
      reason: sig.rejected?.reason ?? null,
    }
  })
}

function statusOf(signers: Signer[]) {
  if (signers.some((s) => s.rejected_at)) return 'recusado'
  if (signers.length > 0 && signers.every((s) => s.signed_at)) return 'assinado'
  return 'enviado'
}

const fortalezaDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' })

function slug(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'documento'
}

// Guarda o PDF assinado na ficha do cliente (uma vez só)
async function saveSignedCopy(service: SupabaseClient, token: string, row: Row, doc: RemoteDocument, finishedAt: string) {
  if (row.signed_document_id || !row.customer_id || !doc.files?.signed) return null
  const bytes = await downloadSigned(token, doc.files.signed)
  if (!bytes) return null
  const path = `${row.company_id}/${row.customer_id}/${crypto.randomUUID()}.pdf`
  const { error: upError } = await service.storage
    .from('customer-documents')
    .upload(path, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false })
  if (upError) return null
  const { data, error } = await service
    .from('customer_documents')
    .insert({
      company_id: row.company_id,
      customer_id: row.customer_id,
      car_id: row.car_id,
      doc_type: row.kind === 'entrada' ? 'entrada' : 'compra',
      title: `${row.title} (assinado digitalmente)`.slice(0, 200),
      signed_on: fortalezaDate(finishedAt),
      notes: row.sandbox ? 'Assinado pela Autentique, em modo de teste (sem validade).' : 'Assinado pela Autentique.',
      file_path: path,
      file_name: `${slug(row.title)}-assinado.pdf`,
      file_type: 'application/pdf',
      created_by: row.sent_by,
    })
    .select('id')
    .single()
  if (error) {
    await service.storage.from('customer-documents').remove([path])
    return null
  }
  return data.id as string
}

async function sync(service: SupabaseClient, token: string, row: Row): Promise<Row> {
  if (!row.external_id || row.status === 'cancelado') return row
  const needsCopy = row.status === 'assinado' && !row.signed_document_id && !!row.customer_id
  if (row.status !== 'enviado' && !needsCopy) return row

  const doc = await fetchDocument(token, row.external_id)
  const patch: Partial<Row> = { checked_at: new Date().toISOString() }
  if (!doc) {
    // Apagado na Autentique (ou documento de teste que já expirou)
    if (row.status === 'enviado') patch.status = 'cancelado'
  } else {
    const signers = mergeSigners(row.signers || [], doc.signatures || [])
    const status = statusOf(signers)
    patch.signers = signers
    patch.status = status
    if (status === 'assinado') {
      const finishedAt = signers.map((s) => s.signed_at as string).sort().pop() as string
      patch.finished_at = row.finished_at || finishedAt
      const copyId = await saveSignedCopy(service, token, row, doc, patch.finished_at)
      if (copyId) patch.signed_document_id = copyId
    }
  }
  const { data, error } = await service.from('signature_requests').update(patch).eq('id', row.id).select('*').single()
  if (error) throw new UserError('Não foi possível gravar a situação da assinatura.', 500)
  return data as Row
}

// -- Envio ------------------------------------------------------------------------

type SendBody = {
  kind?: string
  contractId?: string
  carId?: string
  title?: string
  fileName?: string
  fileBase64?: string
  signers?: Array<{ role?: string; name?: string; email?: string }>
}

function cleanSigners(input: SendBody['signers'], kind: string): Signer[] {
  const list = (input || []).map((s) => ({
    role: String(s.role || ''),
    name: String(s.name || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    email: String(s.email || '').trim().toLowerCase(),
  }))
  if (list.length < 2 || list.length > 5) throw new UserError('Informe de 2 a 5 assinantes.')
  const party = kind === 'entrada' ? 'dono' : 'cliente'
  for (const s of list) {
    if (!ROLES.includes(s.role)) throw new UserError('Papel de assinante inválido.')
    if (!s.name) throw new UserError('Falta o nome de um assinante.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) throw new UserError(`O e-mail de ${s.name} não é válido.`)
  }
  if (!list.some((s) => s.role === party)) throw new UserError(kind === 'entrada' ? 'Falta o dono do carro.' : 'Falta o cliente.')
  if (!list.some((s) => s.role === 'loja')) throw new UserError('Falta quem assina pela loja.')
  if (list.filter((s) => s.role === 'testemunha').length > 2) throw new UserError('No máximo 2 testemunhas.')
  if (new Set(list.map((s) => s.email)).size !== list.length) throw new UserError('Cada assinante precisa de um e-mail diferente.')
  return list.map((s) => ({ ...s, public_id: null, viewed_at: null, signed_at: null, rejected_at: null, reason: null }))
}

async function send(caller: SupabaseClient, service: SupabaseClient, token: string, userId: string, companyId: string, body: SendBody) {
  const kind = body.kind === 'entrada' ? 'entrada' : 'venda'
  const title = String(body.title || '').trim().slice(0, 180)
  if (!title) throw new UserError('Falta o nome do documento.')
  const ext = String(body.fileName || '').split('.').pop()?.toLowerCase() || ''
  const mime = MIMES[ext]
  if (!mime) throw new UserError('O arquivo tem que ser PDF ou Word (.docx).')
  let bytes: Uint8Array
  try {
    bytes = decodeBase64(String(body.fileBase64 || ''))
  } catch {
    throw new UserError('Arquivo inválido.')
  }
  if (bytes.length === 0) throw new UserError('Arquivo vazio.')
  if (bytes.length > MAX_FILE) throw new UserError('O arquivo passa de 5 MB.')
  const signers = cleanSigners(body.signers, kind)

  // De onde vem: o contrato (venda) ou o carro (entrada). A RLS confere se a
  // pessoa pode ver o contrato ou o carro.
  let contractId: string | null = null
  let carId: string | null = null
  let customerId: string | null = null
  if (kind === 'venda') {
    const { data: contract } = await caller.from('contracts').select('id, car_id, customer_id').eq('id', body.contractId || '').maybeSingle()
    if (!contract) throw new UserError('Contrato não encontrado.', 404)
    contractId = contract.id
    carId = contract.car_id
    customerId = contract.customer_id
  } else {
    const { data: car } = await caller.from('staff_cars').select('id, owner_customer_id').eq('id', body.carId || '').maybeSingle()
    if (!car) throw new UserError('Carro não encontrado.', 404)
    carId = car.id
    customerId = car.owner_customer_id
  }

  // O mesmo documento aguardando assinatura não sai duas vezes (cada envio custa)
  let pending = service.from('signature_requests').select('id').eq('company_id', companyId).eq('status', 'enviado')
  pending = kind === 'venda' ? pending.eq('contract_id', contractId) : pending.eq('car_id', carId).eq('kind', 'entrada').eq('title', title)
  const { data: open } = await pending.limit(1)
  if (open?.length) throw new UserError('Este documento já está aguardando assinatura. Cancele o envio anterior para mandar de novo.', 409)

  // Créditos (seção 75): usa a franquia do mês ou reserva o preço antes de mandar.
  // Cancelar depois não devolve; só o envio que falhou aqui é devolvido.
  const { data: hold, error: holdError } = await service.rpc('signature_credit_hold', { p_company: companyId, p_user: userId })
  if (holdError) {
    if (String(holdError.message || '').includes('SALDO_INSUFICIENTE')) {
      throw new UserError('Sem crédito para enviar: os envios grátis do mês acabaram. O administrador da loja compra créditos na página Mensalidade.', 402)
    }
    throw new UserError('Não foi possível conferir os créditos agora. Tente de novo em instantes.', 503)
  }
  const ledgerId = hold?.ledger_id ? Number(hold.ledger_id) : null
  const release = () => (ledgerId ? service.rpc('plate_credit_release', { p_id: ledgerId }).then(() => {}, () => {}) : Promise.resolve())

  const { data: company } = await service.from('companies').select('name, is_demo').eq('id', companyId).single()
  const sandbox = !!company?.is_demo

  const query = `mutation ($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(${sandbox ? 'sandbox: true, ' : ''}document: $document, signers: $signers, file: $file) {
      id signatures { public_id email }
    }
  }`
  const document = {
    name: title,
    message: `${company?.name || 'A loja'} enviou este documento para você assinar eletronicamente.`,
    refusable: true,
    locale: { country: 'BR', language: 'pt-BR', timezone: 'America/Sao_Paulo', date_format: 'DD_MM_YYYY' },
  }
  const remoteSigners = signers.map((s) => ({ email: s.email, action: s.role === 'testemunha' ? 'SIGN_AS_A_WITNESS' : 'SIGN' }))
  const form = new FormData()
  form.append('operations', JSON.stringify({ query, variables: { document, signers: remoteSigners, file: null } }))
  form.append('map', JSON.stringify({ file: ['variables.file'] }))
  form.append('file', new Blob([bytes], { type: mime }), `${slug(title)}.${ext}`)
  let data: Record<string, unknown>
  try {
    data = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }).then(readGql)
  } catch (err) {
    await release()
    throw err
  }
  const created = data.createDocument as RemoteDocument | undefined
  if (!created?.id) {
    await release()
    throw new UserError('A Autentique não devolveu o documento criado.', 502)
  }

  const { data: row, error } = await service
    .from('signature_requests')
    .insert({
      company_id: companyId,
      kind,
      contract_id: contractId,
      car_id: carId,
      customer_id: customerId,
      title,
      file_name: String(body.fileName || '').slice(0, 200),
      provider: 'autentique',
      external_id: created.id,
      sandbox,
      status: 'enviado',
      signers: mergeSigners(signers, created.signatures || []),
      sent_by: userId,
      checked_at: new Date().toISOString(),
      charge_ledger_id: ledgerId,
    })
    .select('*')
    .single()
  if (error) {
    // Sem o registro, o documento ficaria perdido na Autentique
    await gql(token, `mutation { deleteDocument(id: "${safeId(created.id)}") }`).catch(() => {})
    await release()
    throw new UserError('Não foi possível guardar o envio. Nada foi mandado aos assinantes.', 500)
  }
  const credits = {
    charged: hold?.charged === true,
    price: Number(hold?.price) || 0,
    freeLeft: Number(hold?.free_left) || 0,
    balance: Number(hold?.balance) || 0,
  }
  return { row: row as Row, credits }
}

// -- Webhook ----------------------------------------------------------------------

async function hmacHex(secret: string, payload: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function webhook(req: Request, service: SupabaseClient, token: string) {
  const secret = Deno.env.get('AUTENTIQUE_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'Webhook sem o segredo AUTENTIQUE_WEBHOOK_SECRET' }, 503)
  const raw = await req.text()
  const header = (req.headers.get('x-autentique-signature') || '').trim().toLowerCase()
  if (!sameText(await hmacHex(secret, raw), header)) return json({ error: 'Assinatura do webhook inválida' }, 401)
  let payload: { event?: { type?: string; data?: { object?: Record<string, unknown> } } }
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }
  const type = String(payload.event?.type || '')
  const obj = payload.event?.data?.object || {}
  const docRef = obj.document as { id?: string } | string | undefined
  const docId = type.startsWith('document.')
    ? (obj.id as string)
    : typeof docRef === 'object' ? docRef?.id : (docRef ?? (obj.document_id as string | undefined))
  if (!docId) return json({ ok: true, ignorado: true })
  const { data: row } = await service.from('signature_requests').select('*').eq('provider', 'autentique').eq('external_id', String(docId)).maybeSingle()
  if (!row) return json({ ok: true, ignorado: true })
  await sync(service, token, row as Row)
  return json({ ok: true })
}

// -- Entrada ----------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = Deno.env.get('AUTENTIQUE_TOKEN')
  const service = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    if (req.headers.has('x-autentique-signature')) {
      if (!token) return json({ error: 'Falta o segredo AUTENTIQUE_TOKEN' }, 503)
      return await webhook(req, service, token)
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    })
    const { data: userData } = await caller.auth.getUser()
    const { data: canEdit } = await caller.rpc('can_edit_stock')
    const { data: companyId } = await caller.rpc('current_company_id')
    if (!userData?.user || canEdit !== true || !companyId) return json({ error: 'Acesso restrito à equipe da loja' }, 403)
    if (!token) return json({ error: 'A assinatura digital ainda não foi configurada (falta o segredo AUTENTIQUE_TOKEN).' }, 503)

    let body: SendBody & { action?: string; id?: string; ids?: string[]; force?: boolean } = {}
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Corpo inválido' }, 400)
    }

    // Envio que a pessoa pode ver (a RLS decide: equipe de gestão ou quem mandou)
    async function visible(ids: string[]) {
      const { data } = await caller.from('signature_requests').select('*').in('id', ids)
      return (data || []) as Row[]
    }
    async function one(id: string | undefined) {
      const [row] = await visible([String(id || '')])
      if (!row) throw new UserError('Envio não encontrado.', 404)
      return row
    }

    switch (body.action) {
      case 'enviar': {
        const { row, credits } = await send(caller, service, token, userData.user.id, companyId as string, body)
        return json({ request: row, credits })
      }
      case 'atualizar': {
        const ids = (body.ids || []).map(String).slice(0, 10)
        const rows = await visible(ids)
        const result: Row[] = []
        for (const row of rows) {
          // Consultado há menos de 20 s: devolve o que já tem (limite de pedidos da Autentique)
          const fresh = row.checked_at && Date.now() - new Date(row.checked_at).getTime() < 20000
          result.push(fresh && !body.force ? row : await sync(service, token, row))
        }
        return json({ requests: result })
      }
      case 'reenviar': {
        const row = await one(body.id)
        if (row.status !== 'enviado') throw new UserError('Só dá para reenviar o que ainda aguarda assinatura.')
        const ids = (row.signers || []).filter((s) => !s.signed_at && s.public_id).map((s) => s.public_id as string)
        if (ids.length === 0) throw new UserError('Não há ninguém aguardando para reenviar.')
        await gql(token, `mutation { resendSignatures(public_ids: [${ids.map((i) => `"${safeId(i)}"`).join(', ')}]) }`)
        return json({ ok: true })
      }
      case 'cancelar': {
        const row = await one(body.id)
        if (row.status !== 'enviado') throw new UserError('Só dá para cancelar o que ainda aguarda assinatura.')
        const doc = row.external_id ? await fetchDocument(token, row.external_id) : null
        if (doc) {
          const anySigned = (doc.signatures || []).some((s) => s.signed)
          if (anySigned) {
            const now = new Date().toISOString()
            await gql(token, `mutation { updateDocument(id: "${safeId(row.external_id as string)}", document: { deadline_at: "${now}" }) { id } }`)
          } else {
            await gql(token, `mutation { deleteDocument(id: "${safeId(row.external_id as string)}") }`)
          }
        }
        const { data, error } = await service
          .from('signature_requests')
          .update({ status: 'cancelado', checked_at: new Date().toISOString() })
          .eq('id', row.id)
          .select('*')
          .single()
        if (error) throw new UserError('Não foi possível gravar o cancelamento.', 500)
        return json({ request: data })
      }
      case 'baixar': {
        const row = await one(body.id)
        if (row.status !== 'assinado' || !row.external_id) throw new UserError('O documento ainda não foi assinado por todos.')
        const doc = await fetchDocument(token, row.external_id)
        const bytes = doc?.files?.signed ? await downloadSigned(token, doc.files.signed) : null
        if (!bytes) throw new UserError('A Autentique ainda está preparando o PDF assinado. Tente de novo em alguns minutos.', 503)
        return json({ fileName: `${slug(row.title)}-assinado.pdf`, base64: encodeBase64(bytes) })
      }
      default:
        return json({ error: 'Ação desconhecida' }, 400)
    }
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status)
    console.error(err)
    return json({ error: 'Erro inesperado na assinatura digital.' }, 500)
  }
})
