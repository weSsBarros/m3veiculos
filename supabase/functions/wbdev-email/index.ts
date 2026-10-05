// Edge Function "wbdev-email" — e-mails da WB.Dev para os clientes (seção 45):
//   action "lembretes": manda os lembretes de mensalidade do dia (chamada pelo
//     agendamento diário com a chave de serviço, ou pelo dono da plataforma no
//     painel). A lista vem do banco (billing_reminders_due); cada envio fica em
//     client_reminders e o mesmo lembrete do mesmo mês não sai duas vezes.
//   action "recibo": manda o recibo em PDF de um pagamento (o painel gera o PDF).
//   action "teste": manda um e-mail de teste para o próprio remetente.
// Sai do Gmail da WB.Dev (porta 465; a 587 é bloqueada nas Edge Functions). A
// senha de app do Gmail fica no segredo GMAIL_APP_PASSWORD, cadastrado pelo
// Wesley em Edge Functions → Secrets. Publicar com "Verify JWT" desligado: a
// função confere quem chama pelo banco (chave de serviço ou dono da plataforma).
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const money = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const dateBR = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
const dayMonth = (iso: string) => dateBR(iso).slice(0, 5)
function monthName(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
  return `${name} de ${y}`
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

type Item = {
  company_id: string
  name: string
  responsible_name: string
  kind: string
  month: string
  due: string
  amount: number
  days: number
  to: string[]
}

// Texto de cada lembrete: assunto e parágrafos
function reminderText(item: Item) {
  const hello = item.responsible_name ? `Olá, ${item.responsible_name}!` : `Olá, equipe da ${item.name}!`
  const what = `a mensalidade do sistema da ${item.name} (site e painel WB.AUTO) referente a ${monthName(item.month)}, no valor de ${money(item.amount)}`
  if (item.kind === 'antes_5') {
    const d = item.days
    return {
      subject: `Sua mensalidade vence em ${d} ${d === 1 ? 'dia' : 'dias'} (${dayMonth(item.due)})`,
      lines: [hello, `Passando para lembrar que ${what} vence em ${dateBR(item.due)}.`, 'Se já pagou, pode desconsiderar este e-mail.'],
    }
  }
  if (item.kind === 'no_dia') {
    return {
      subject: 'Sua mensalidade vence hoje',
      lines: [hello, `Hoje (${dateBR(item.due)}) é o vencimento de ${what}.`, 'Se já pagou, pode desconsiderar este e-mail.'],
    }
  }
  const d = item.days
  return {
    subject: `Mensalidade em atraso há ${d} ${d === 1 ? 'dia' : 'dias'}`,
    lines: [
      hello,
      `Ainda não identificamos o pagamento de ${what}, que venceu em ${dateBR(item.due)}.`,
      'Para evitar a suspensão do acesso ao painel e ao site, regularize assim que puder. Se já pagou, responda este e-mail com o comprovante.',
    ],
  }
}

function emailBody(lines: string[]) {
  const text = [...lines, '', `Dúvidas ou pagamento: WhatsApp ${SUPPORT}`, '', 'WB.Dev'].join('\n\n')
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#141a24">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dde2e9">
<div style="background:#0e1117;color:#ffffff;padding:18px 24px;font-weight:bold;font-size:16px;border-bottom:4px solid #2446c8">WB.Dev</div>
<div style="padding:24px;font-size:15px;line-height:1.6">
${lines.map((l) => `<p style="margin:0 0 14px">${escapeHtml(l)}</p>`).join('\n')}
<p style="margin:22px 0 0"><a href="${SUPPORT_LINK}" style="display:inline-block;background:#2446c8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Falar com a WB.Dev no WhatsApp</a></p>
<p style="margin:14px 0 0;font-size:13px;color:#5a6475">Dúvidas ou pagamento: WhatsApp ${SUPPORT}</p>
</div></div></body></html>`
  return { text, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const password = Deno.env.get('GMAIL_APP_PASSWORD')

  // Quem chama: o agendamento manda a chave de serviço no "apikey"; o painel manda
  // o login do dono da plataforma no "Authorization". O banco decide se pode.
  const apikey = req.headers.get('apikey') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller =
    apikey && apikey !== anonKey
      ? createClient(url, apikey, { auth: { persistSession: false } })
      : createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const service = createClient(url, serviceKey, { auth: { persistSession: false } })

  let body: { action?: string; payment_id?: string; pdf_base64?: string; filename?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }

  if (!password) return json({ error: 'Falta a senha de app do Gmail (segredo GMAIL_APP_PASSWORD nas Edge Functions).' }, 500)
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: SENDER, pass: password } })
  const from = `"${SENDER_NAME}" <${SENDER}>`

  if (body.action === 'lembretes') {
    const { data: items, error } = await caller.rpc('billing_reminders_due')
    if (error) return json({ error: 'Sem permissão para enviar os lembretes' }, 403)
    const result = { enviados: 0, erros: 0, itens: [] as string[] }
    for (const item of (items || []) as Item[]) {
      const to = (item.to || []).filter(Boolean)
      const { subject, lines } = reminderText(item)
      let status = 'enviado'
      let errorText = ''
      if (!to.length) {
        status = 'erro'
        errorText = 'Sem e-mail para enviar (preencha o e-mail do responsável na ficha).'
      } else {
        try {
          await transport.sendMail({ from, to: to.join(', '), replyTo: SENDER, subject: `${subject} · ${item.name}`, ...emailBody(lines) })
        } catch (err) {
          status = 'erro'
          errorText = String((err as Error)?.message || err).slice(0, 300)
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
      return json({ error: `Não foi possível enviar: ${String((err as Error)?.message || err).slice(0, 300)}` }, 502)
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
    const list = ((to || []) as string[]).filter(Boolean)
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
      errorText = String((err as Error)?.message || err).slice(0, 300)
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
