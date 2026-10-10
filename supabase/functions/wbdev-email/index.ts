// @ts-nocheck — a cópia de src/utils/pix.js (no fim) é JavaScript
// Edge Function "wbdev-email" — avisos da WB.Dev (seções 45 e 65):
//   action "lembretes": manda os lembretes de mensalidade do dia (chamada pelo
//     agendamento diário com a chave de serviço, ou pelo dono da plataforma no
//     painel). A lista vem do banco (billing_reminders_due); cada envio fica em
//     client_reminders e o mesmo lembrete do mesmo mês não sai duas vezes. O
//     e-mail leva o PIX (chave e "copia e cola" com o valor) e o link da página
//     Mensalidade do painel da loja (QR code e o botão "Já paguei").
//   action "recibo": manda o recibo em PDF de um pagamento (o painel gera o PDF).
//   action "teste": manda um e-mail de teste para o próprio remetente.
//   action "pagamento_informado" (id do client_payment_claims), "credito_informado"
//     (id do plate_credit_orders, créditos da consulta por placa) e "chamado" (id da
//     support_messages): avisam o dono da plataforma no WhatsApp pelo CallMeBot
//     (segredo CALLMEBOT_APIKEY; número em platform_settings.notify_phone). Quem
//     chama é o painel da loja, com o login de quem informou ou escreveu; sem o
//     segredo, só não avisa. Não dependem da senha do Gmail.
// Os e-mails saem do Gmail da WB.Dev (porta 465; a 587 é bloqueada nas Edge
// Functions). A senha de app do Gmail fica no segredo GMAIL_APP_PASSWORD. Publicar
// com "Verify JWT" desligado: a função confere quem chama pelo banco.
import nodemailer from 'npm:nodemailer@6.9.16'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SENDER = 'wesleybarros.dev@gmail.com'
const SENDER_NAME = 'WB.Dev'
const SUPPORT = '(98) 98129-5577'
const SUPPORT_LINK = 'https://wa.me/5598981295577'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const dateBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const dayMonth = (iso) => dateBR(iso).slice(0, 5)
function monthName(iso) {
  const [y, m] = iso.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
  return `${name} de ${y}`
}
const monthShort = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Como pagar: chave e "copia e cola" com o valor
function payLines(item, pay) {
  const lines = []
  if (pay?.pix_key) {
    lines.push(`Para pagar por PIX: chave ${pay.pix_key}, valor ${money(item.amount)}.`)
    const code = pixPayload({ key: pay.pix_key, name: pay.pix_name, city: pay.pix_city, amount: item.amount, txid: pixTxid(item.name, item.month) })
    if (code) lines.push(`PIX copia e cola: ${code}`)
  }
  return lines
}

// Página Mensalidade do painel da loja (QR code e "Já paguei")
function payPage(item) {
  return item.site_url ? `${item.site_url.replace(/\/+$/, '')}/admin/mensalidade` : ''
}

// Texto de cada lembrete: assunto, parágrafos e o link da página Mensalidade
function reminderText(item, pay) {
  const hello = item.responsible_name ? `Olá, ${item.responsible_name}!` : `Olá, equipe da ${item.name}!`
  const what = `a mensalidade do sistema da ${item.name} (site e painel WB.AUTO) referente a ${monthName(item.month)}, no valor de ${money(item.amount)}`
  const page = payPage(item)
  const after = [
    ...payLines(item, pay),
    page ? `Pelo painel, em Mensalidade, estão o QR code e o botão "Já paguei" para avisar a WB.Dev: ${page}` : '',
  ].filter(Boolean)
  if (item.kind === 'antes_3' || item.kind === 'antes_5') {
    const d = item.days
    return {
      subject: `Sua mensalidade vence em ${d} ${d === 1 ? 'dia' : 'dias'} (${dayMonth(item.due)})`,
      lines: [hello, `Passando para lembrar que ${what} vence em ${dateBR(item.due)}.`, ...after, 'Se já pagou, pode desconsiderar este e-mail.'],
      page,
    }
  }
  if (item.kind === 'no_dia') {
    return {
      subject: 'Sua mensalidade vence hoje',
      lines: [hello, `Hoje (${dateBR(item.due)}) é o vencimento de ${what}.`, ...after, 'Se já pagou, pode desconsiderar este e-mail.'],
      page,
    }
  }
  const d = item.days
  return {
    subject: `Mensalidade em atraso há ${d} ${d === 1 ? 'dia' : 'dias'}`,
    lines: [
      hello,
      `Ainda não identificamos o pagamento de ${what}, que venceu em ${dateBR(item.due)}.`,
      ...after,
      'Para evitar a suspensão do acesso ao painel e ao site, regularize assim que puder. Se já pagou, avise pelo botão "Já paguei" do painel ou responda este e-mail com o comprovante.',
    ],
    page,
  }
}

function emailBody(lines, page = '') {
  const text = [...lines, '', `Dúvidas ou pagamento: WhatsApp ${SUPPORT}`, '', 'WB.Dev'].join('\n\n')
  const payButton = page
    ? `<p style="margin:22px 0 0"><a href="${escapeHtml(page)}" style="display:inline-block;background:#1c7f52;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Pagar pelo painel (PIX e "Já paguei")</a></p>`
    : ''
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#141a24">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dde2e9">
<div style="background:#0e1117;color:#ffffff;padding:18px 24px;font-weight:bold;font-size:16px;border-bottom:4px solid #2446c8">WB.Dev</div>
<div style="padding:24px;font-size:15px;line-height:1.6">
${lines.map((l) => `<p style="margin:0 0 14px;word-break:break-word">${escapeHtml(l)}</p>`).join('\n')}
${payButton}
<p style="margin:14px 0 0"><a href="${SUPPORT_LINK}" style="display:inline-block;background:#2446c8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Falar com a WB.Dev no WhatsApp</a></p>
<p style="margin:14px 0 0;font-size:13px;color:#5a6475">Dúvidas ou pagamento: WhatsApp ${SUPPORT}</p>
</div></div></body></html>`
  return { text, html }
}

// Aviso no WhatsApp do dono da plataforma (CallMeBot). false = não mandou.
async function whatsappToOwner(service, text) {
  const apikey = Deno.env.get('CALLMEBOT_APIKEY')
  if (!apikey) return false
  const { data: settings } = await service.from('platform_settings').select('notify_phone').eq('id', 1).maybeSingle()
  const phone = String(settings?.notify_phone || '').replace(/\D/g, '')
  if (!phone) return false
  try {
    const res = await fetch(
      `https://api.callmebot.com/whatsapp.php?phone=%2B${phone}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`
    )
    if (!res.ok) console.error('callmebot', res.status, (await res.text()).slice(0, 200))
    return res.ok
  } catch (err) {
    console.error('callmebot', String(err).slice(0, 200))
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const password = Deno.env.get('GMAIL_APP_PASSWORD')

  // Quem chama: o agendamento manda a chave de serviço no "apikey"; o painel manda
  // o login no "Authorization". O banco decide se pode.
  const apikey = req.headers.get('apikey') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller =
    apikey && apikey !== anonKey
      ? createClient(url, apikey, { auth: { persistSession: false } })
      : createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const service = createClient(url, serviceKey, { auth: { persistSession: false } })

  let body = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }

  // -- Avisos no WhatsApp do dono (sem Gmail) -------------------------------------
  if (body.action === 'pagamento_informado') {
    // Quem chama tem que enxergar o pagamento informado (admin da loja, pelo banco)
    const { data: claim } = await caller.from('client_payment_claims').select('id').eq('id', body.id || '').maybeSingle()
    if (!claim) return json({ error: 'Pagamento informado não encontrado' }, 404)
    const { data: row } = await service.from('client_payment_claims').select('*').eq('id', claim.id).single()
    if (row.notified_at) return json({ ok: true, notified: false })
    const { data: company } = await service.from('companies').select('name').eq('id', row.company_id).single()
    const months = (row.months || []).map(monthShort).join(', ')
    const text =
      `WB.AUTO: ${company?.name || 'Uma loja'} informou o pagamento da mensalidade (${months}): ${money(row.amount)}, ` +
      `pago em ${dateBR(row.paid_on)}${row.receipt ? ', com comprovante' : ''}. Confira em Plataforma > Cobrança.`
    const sent = await whatsappToOwner(service, text)
    if (sent) await service.from('client_payment_claims').update({ notified_at: new Date().toISOString() }).eq('id', row.id)
    return json({ ok: true, notified: sent })
  }

  if (body.action === 'credito_informado') {
    // Compra de créditos da consulta por placa (seção 71); o admin da loja enxerga o pedido
    const { data: order } = await caller.from('plate_credit_orders').select('id').eq('id', body.id || '').maybeSingle()
    if (!order) return json({ error: 'Compra de créditos não encontrada' }, 404)
    const { data: row } = await service.from('plate_credit_orders').select('*').eq('id', order.id).single()
    if (row.notified_at) return json({ ok: true, notified: false })
    const { data: company } = await service.from('companies').select('name').eq('id', row.company_id).single()
    const text =
      `WB.AUTO: ${company?.name || 'Uma loja'} informou a compra de créditos da consulta por placa: ${money(row.amount)}, ` +
      `pago em ${dateBR(row.paid_on)}${row.receipt ? ', com comprovante' : ''}. Confira em Plataforma > Cobrança.`
    const sent = await whatsappToOwner(service, text)
    if (sent) await service.from('plate_credit_orders').update({ notified_at: new Date().toISOString() }).eq('id', row.id)
    return json({ ok: true, notified: sent })
  }

  if (body.action === 'chamado') {
    const { data: message } = await caller.from('support_messages').select('id').eq('id', body.id || '').maybeSingle()
    if (!message) return json({ error: 'Mensagem não encontrada' }, 404)
    const { data: row } = await service.from('support_messages').select('*').eq('id', message.id).single()
    if (row.notified_at || row.author_kind !== 'loja') return json({ ok: true, notified: false })
    const { data: ticket } = await service.from('support_tickets').select('subject').eq('id', row.ticket_id).single()
    const { data: company } = await service.from('companies').select('name').eq('id', row.company_id).single()
    const { count } = await service.from('support_messages').select('id', { count: 'exact', head: true }).eq('ticket_id', row.ticket_id)
    const what = (count || 0) <= 1 ? 'abriu um chamado' : 'respondeu um chamado'
    const excerpt = String(row.body || '').replace(/\s+/g, ' ').slice(0, 200)
    const text = `WB.AUTO: ${row.author_name || 'Alguém'} (${company?.name || 'loja'}) ${what}: "${ticket?.subject || ''}". ${excerpt} — Plataforma > Suporte.`
    const sent = await whatsappToOwner(service, text)
    if (sent) await service.from('support_messages').update({ notified_at: new Date().toISOString() }).eq('id', row.id)
    return json({ ok: true, notified: sent })
  }

  // -- E-mails ----------------------------------------------------------------------
  if (!password) return json({ error: 'Falta a senha de app do Gmail (segredo GMAIL_APP_PASSWORD nas Edge Functions).' }, 500)
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SENDER, pass: password } })
  const from = `"${SENDER_NAME}" <${SENDER}>`

  if (body.action === 'lembretes') {
    const { data: items, error } = await caller.rpc('billing_reminders_due')
    if (error) return json({ error: 'Sem permissão para enviar os lembretes' }, 403)
    const { data: pay } = await service.from('platform_settings').select('pix_key, pix_name, pix_city').eq('id', 1).maybeSingle()
    const result = { enviados: 0, erros: 0, itens: [] }
    for (const item of items || []) {
      const to = (item.to || []).filter(Boolean)
      const { subject, lines, page } = reminderText(item, pay)
      let status = 'enviado'
      let errorText = ''
      if (!to.length) {
        status = 'erro'
        errorText = 'Sem e-mail para enviar (preencha o e-mail do responsável na ficha).'
      } else {
        try {
          await transport.sendMail({ from, to: to.join(', '), replyTo: SENDER, subject: `${subject} · ${item.name}`, ...emailBody(lines, page) })
        } catch (err) {
          status = 'erro'
          errorText = String(err?.message || err).slice(0, 300)
        }
      }
      await service.from('client_reminders').insert({
        company_id: item.company_id,
        kind: item.kind,
        reference_month: item.month,
        sent_to: to.join(', '),
        status,
        error: errorText,
      })
      if (status === 'enviado') result.enviados += 1
      else result.erros += 1
      result.itens.push(`${item.name}: ${item.kind} ${status}${errorText ? ` (${errorText})` : ''}`)
    }
    return json(result)
  }

  // Recibo e teste: só o dono da plataforma
  const { data: isPlatform } = await caller.rpc('is_platform_admin')
  if (isPlatform !== true) return json({ error: 'Acesso restrito à plataforma' }, 403)

  if (body.action === 'teste') {
    try {
      await transport.sendMail({
        from,
        to: SENDER,
        subject: 'Teste dos e-mails da WB.Dev',
        ...emailBody(['Olá!', 'Este é um e-mail de teste dos lembretes de mensalidade. Se chegou, o envio está funcionando.']),
      })
    } catch (err) {
      return json({ error: `Não foi possível enviar: ${String(err?.message || err).slice(0, 300)}` }, 502)
    }
    return json({ ok: true, to: SENDER })
  }

  if (body.action === 'recibo') {
    if (!body.payment_id || !body.pdf_base64) return json({ error: 'Faltam o pagamento ou o PDF' }, 400)
    const { data: payment } = await service.from('client_payments').select('*').eq('id', body.payment_id).single()
    if (!payment) return json({ error: 'Pagamento não encontrado' }, 404)
    const { data: company } = await service.from('companies').select('name').eq('id', payment.company_id).single()
    const { data: account } = await service.from('client_accounts').select('responsible_name').eq('company_id', payment.company_id).single()
    const { data: to } = await service.rpc('client_reminder_recipients', { p_company: payment.company_id })
    const list = (to || []).filter(Boolean)
    if (!list.length) return json({ error: 'Esse cliente não tem e-mail para receber (preencha o e-mail do responsável na ficha).' }, 400)
    const name = company?.name || 'sua loja'
    const hello = account?.responsible_name ? `Olá, ${account.responsible_name}!` : `Olá, equipe da ${name}!`
    const lines = [
      hello,
      `Recebemos o pagamento de ${money(payment.amount)} referente à mensalidade de ${monthName(payment.reference_month)} do sistema da ${name}, em ${dateBR(payment.paid_on)}. Obrigado!`,
      'O recibo segue em anexo.',
    ]
    let status = 'enviado'
    let errorText = ''
    try {
      await transport.sendMail({
        from,
        to: list.join(', '),
        replyTo: SENDER,
        subject: `Recibo de pagamento · ${monthName(payment.reference_month)} · ${name}`,
        ...emailBody(lines),
        attachments: [{ filename: body.filename || 'recibo.pdf', content: body.pdf_base64, encoding: 'base64', contentType: 'application/pdf' }],
      })
    } catch (err) {
      status = 'erro'
      errorText = String(err?.message || err).slice(0, 300)
    }
    await service.from('client_reminders').insert({
      company_id: payment.company_id,
      kind: 'recibo',
      reference_month: payment.reference_month,
      payment_id: payment.id,
      sent_to: list.join(', '),
      status,
      error: errorText,
    })
    if (status !== 'enviado') return json({ error: `Não foi possível enviar: ${errorText}` }, 502)
    return json({ ok: true, to: list })
  }

  return json({ error: 'Ação desconhecida' }, 400)
})

// -- Cópia de src/utils/pix.js (não editar aqui: rode atualizar-copia.mjs) -----------
// <pix.js>
// PIX da mensalidade (página Mensalidade do painel): o "copia e cola" no padrão
// BR Code do Banco Central (QR estático, EMV), com o valor e o código de
// conferência CRC16. Testado em tests/pix.test.js com o exemplo do manual do BCB.

function field(id, value) {
  const text = String(value)
  return `${id}${String(text.length).padStart(2, '0')}${text}`
}

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais
export function crc16(text) {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Sem acento e só os caracteres que o BR Code aceita
export function pixText(value, max) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/&@*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// Identificador do pagamento (txid): letras e números, até 25
export function pixTxid(storeSlug, month) {
  const store = String(storeSlug || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 15)
  const ym = String(month || '').replace(/[^0-9]/g, '').slice(0, 6)
  return `WB${store}${ym}`.slice(0, 25) || '***'
}

// Código "copia e cola". amount em reais (opcional); sem chave, nome ou cidade = ''
export function pixPayload({ key, name, city, amount = null, txid = '***' }) {
  const pixKey = String(key || '').trim()
  const merchant = pixText(name, 25)
  const place = pixText(city, 15)
  if (!pixKey || !merchant || !place) return ''
  const account = field('00', 'br.gov.bcb.pix') + field('01', pixKey)
  const value = amount != null && Number(amount) > 0 ? field('54', Number(amount).toFixed(2)) : ''
  const reference = /^[A-Za-z0-9]{1,25}$/.test(txid) ? txid : '***'
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    value +
    field('58', 'BR') +
    field('59', merchant) +
    field('60', place) +
    field('62', field('05', reference)) +
    '6304'
  return body + crc16(body)
}
// </pix.js>
