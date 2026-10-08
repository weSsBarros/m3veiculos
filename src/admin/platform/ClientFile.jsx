import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileDown, MessageCircle, Trash2, Lock, Unlock, Ban, BarChart3, Play, Undo2, Mail } from 'lucide-react'
import {
  fetchClients,
  fetchPayments,
  fetchPlans,
  updateClientAccount,
  addPayment,
  deletePayment,
  fetchReminderLog,
  fetchReminderRecipients,
  sendReceiptEmail,
  fetchContactNotes,
  fetchPlatformSettings,
  fetchPlatformTerms,
  fetchTermsReceipt,
} from '../../lib/clientsApi.js'
import {
  money,
  monthName,
  dateBR,
  situationText,
  chargeMessage,
  whatsappLink,
  domainAlert,
  domainExpiryFrom,
  domainRegistrarLabel,
  domainPayerLabel,
  DOMAIN_REGISTRARS,
  DOMAIN_PAYERS,
  DOMAIN_ALERT_DAYS,
  onboardingStatus,
  implantationDays,
  firstDueDate,
  reminderLabel,
} from '../../utils/billing.js'
import { exportPaymentReceipt, paymentReceiptBase64 } from '../../utils/clientPdf.js'
import { todayISO } from '../../utils/carFormat.js'
import useConfirm from '../../components/useConfirm.jsx'
import { StatusPill, BillingPill } from './ClientParts.jsx'
import { ContactNotes } from './PlatformContacts.jsx'
import { exportTermsReceiptPdf } from '../../utils/termsPdf.js'
import DateInputBR from '../../components/DateInputBR.jsx'
import MonthInputBR from '../../components/MonthInputBR.jsx'
import MonthSelectBR from '../../components/MonthSelectBR.jsx'
import { MoneyInput } from '../../components/NumberInputs.jsx'
import '../admin.css'

const SECTIONS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'cobranca', label: 'Cobrança' },
  { key: 'dados', label: 'Dados e implantação' },
  { key: 'atendimento', label: 'Atendimento e contrato' },
  { key: 'acesso', label: 'Acesso' },
]

const METHODS = ['Pix', 'Transferência', 'Dinheiro', 'Cartão', 'Boleto', 'Outro']
const STATUS_LABEL = { implantacao: 'Em implantação', ativo: 'Ativo', bloqueado: 'Bloqueado', cancelado: 'Cancelado' }
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const DOMAIN_YEARS = Array.from({ length: 10 }, (_, i) => i + 1)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const toMonthInput = (iso) => (iso ? iso.slice(0, 7) : '')
const fromMonthInput = (value) => (value ? `${value}-01` : '')
const priceInput = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
const parsePrice = (text) => {
  const s = String(text).trim()
  if (!s) return null
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

// Painel WB.Dev → ficha de um cliente: cobrança, dados, implantação e acesso
export default function ClientFile() {
  const { slug } = useParams()
  const { confirm, confirmDialog } = useConfirm()
  const [client, setClient] = useState(null)
  const [payments, setPayments] = useState([])
  const [plans, setPlans] = useState([])
  const [section, setSection] = useState('resumo')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [billingForm, setBillingForm] = useState(null)
  const [payForm, setPayForm] = useState(null)
  const [dataForm, setDataForm] = useState(null)
  const [blockReason, setBlockReason] = useState('')
  const [activationDate, setActivationDate] = useState(todayISO())
  const [recipients, setRecipients] = useState([])
  const [reminderLog, setReminderLog] = useState([])
  const [sendReceipt, setSendReceipt] = useState(true)
  const [mailing, setMailing] = useState('')
  // Atendimento e contrato: anotações, aceite do contrato de adesão e a chave PIX
  const [notes, setNotes] = useState([])
  const [termsInfo, setTermsInfo] = useState(null)
  const [pixKey, setPixKey] = useState('')

  async function load() {
    setError('')
    try {
      const [clients, planList] = await Promise.all([fetchClients(), fetchPlans()])
      const found = clients.find((c) => c.slug === slug)
      if (!found) throw new Error('Cliente não encontrado.')
      setClient(found)
      setPlans(planList)
      setPayments(await fetchPayments(found.companyId))
      fetchReminderRecipients(found.companyId).then(setRecipients).catch(() => setRecipients([]))
      fetchReminderLog(found.companyId, 20).then(setReminderLog).catch(() => setReminderLog([]))
      fetchContactNotes(found.companyId).then(setNotes).catch(() => setNotes([]))
      fetchPlatformSettings().then((s) => setPixKey(s.pixKey)).catch(() => setPixKey(''))
      Promise.all([fetchPlatformTerms(), fetchTermsReceipt(found.companyId)])
        .then(([list, receipt]) => setTermsInfo({ current: list.find((t) => t.status === 'publicada') || null, receipt }))
        .catch(() => setTermsInfo({ current: null, receipt: null }))
      const a = found.account
      setBillingForm({
        planId: a.planId || '',
        monthlyPrice: priceInput(a.monthlyPrice),
        dueDay: a.dueDay ? String(a.dueDay) : '',
        billingStart: toMonthInput(a.billingStart),
      })
      setActivationDate(a.activatedOn || todayISO())
      setDataForm({
        legalName: a.legalName,
        cnpj: a.cnpj,
        responsibleName: a.responsibleName,
        responsiblePhone: a.responsiblePhone,
        responsibleEmail: a.responsibleEmail,
        domain: a.domain,
        domainExpiresOn: a.domainExpiresOn || '',
        domainRegisteredOn: a.domainRegisteredOn || '',
        domainYears: a.domainYears ? String(a.domainYears) : '',
        domainRegistrar: a.domainRegistrar,
        domainPaidBy: a.domainPaidBy,
        notes: a.notes,
      })
      const firstOpen = found.billing.open?.[0] || found.billing.next
      setPayForm({
        referenceMonth: toMonthInput(firstOpen?.month) || toMonthInput(todayISO()),
        amount: priceInput(found.billing.price),
        paidOn: todayISO(),
        method: 'Pix',
        notes: '',
      })
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o cliente.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function save(fields, done) {
    setSaving(true)
    setError('')
    setMsg('')
    try {
      await updateClientAccount(client.companyId, fields)
      setMsg(done)
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  function saveBilling(e) {
    e.preventDefault()
    const price = parsePrice(billingForm.monthlyPrice)
    if (Number.isNaN(price)) {
      setError('Mensalidade inválida.')
      return
    }
    const day = billingForm.dueDay ? Number(billingForm.dueDay) : null
    if (day !== null && (day < 1 || day > 28)) {
      setError('O dia de vencimento vai de 1 a 28.')
      return
    }
    save(
      { planId: billingForm.planId || '', monthlyPrice: price, dueDay: day, billingStart: fromMonthInput(billingForm.billingStart) },
      'Cobrança salva.'
    )
  }

  async function savePayment(e) {
    e.preventDefault()
    const amount = parsePrice(payForm.amount)
    if (amount === null || Number.isNaN(amount)) {
      setError('Informe o valor pago.')
      return
    }
    if (!payForm.referenceMonth) {
      setError('Informe o mês de referência.')
      return
    }
    setSaving(true)
    setError('')
    setMsg('')
    try {
      const payment = await addPayment({
        companyId: client.companyId,
        referenceMonth: fromMonthInput(payForm.referenceMonth),
        amount,
        paidOn: payForm.paidOn,
        method: payForm.method,
        notes: payForm.notes,
      })
      let done = `Pagamento de ${monthName(payment.referenceMonth)} registrado.`
      if (sendReceipt && recipients.length) {
        try {
          const sent = await mailReceipt(payment)
          done += ` Recibo enviado para ${sent.join(', ')}.`
        } catch (err) {
          done += ` O recibo não saiu por e-mail: ${err.message}`
        }
      }
      setMsg(done)
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível registrar o pagamento.')
    } finally {
      setSaving(false)
    }
  }

  async function mailReceipt(payment) {
    const { base64, filename } = await paymentReceiptBase64({ client, payment })
    const result = await sendReceiptEmail({ paymentId: payment.id, pdfBase64: base64, filename })
    return result?.to || []
  }

  async function resendReceipt(payment) {
    setMailing(payment.id)
    setError('')
    setMsg('')
    try {
      const sent = await mailReceipt(payment)
      setMsg(`Recibo de ${monthName(payment.referenceMonth)} enviado para ${sent.join(', ')}.`)
      setReminderLog(await fetchReminderLog(client.companyId, 20))
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o recibo.')
    } finally {
      setMailing('')
    }
  }

  async function removePayment(p) {
    if (!(await confirm(`Excluir o pagamento de ${monthName(p.referenceMonth)} (${money(p.amount)})? O mês volta a ficar em aberto.`, { title: 'Excluir pagamento', confirmLabel: 'Excluir' }))) return
    try {
      await deletePayment(p.id)
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível excluir.')
    }
  }

  function saveData(e) {
    e.preventDefault()
    save(
      {
        ...dataForm,
        domainExpiresOn: dataForm.domainExpiresOn || '',
        domainRegisteredOn: dataForm.domainRegisteredOn || '',
        domainYears: dataForm.domainYears ? Number(dataForm.domainYears) : '',
      },
      'Dados salvos.'
    )
  }

  // Compra + anos: o vencimento é calculado (e dá para corrigir à mão depois)
  function updateDomainPurchase(field, value) {
    setDataForm((f) => {
      const next = { ...f, [field]: value }
      const expires = domainExpiryFrom(next.domainRegisteredOn, next.domainYears)
      return expires ? { ...next, domainExpiresOn: expires } : next
    })
  }

  function toggleOnboarding(key) {
    const marks = { ...client.account.onboarding, [key]: !client.account.onboarding[key] }
    save({ onboarding: marks }, '')
  }

  async function block() {
    const ok = await confirm(
      `Bloquear ${client.name}? A equipe não entra mais no painel e o site passa a mostrar a página de manutenção, até você liberar.`,
      { title: 'Bloquear cliente', confirmLabel: 'Bloquear' }
    )
    if (ok) save({ status: 'bloqueado', blockReason: blockReason.trim() }, `${client.name} bloqueado.`)
  }

  async function unblock() {
    const ok = await confirm(`Liberar ${client.name}? O painel e o site voltam ao normal na hora.`, { title: 'Liberar cliente', confirmLabel: 'Liberar' })
    // quem nunca foi ativado volta para a implantação
    const back = !client.account.activatedOn && client.account.implantationStartedOn ? 'implantacao' : 'ativo'
    if (ok) save({ status: back, blockReason: '' }, `${client.name} liberado.`)
  }

  async function cancelClient() {
    const ok = await confirm(
      `Cancelar ${client.name}? A cobrança para, a equipe perde o acesso ao painel e o site mostra a página de manutenção. Dá para reativar depois.`,
      { title: 'Cancelar cliente', confirmLabel: 'Cancelar cliente', cancelLabel: 'Voltar' }
    )
    if (ok) save({ status: 'cancelado' }, `${client.name} cancelado.`)
  }

  async function activate() {
    if (!activationDate) {
      setError('Informe a data de ativação (dd/mm/aaaa).')
      return
    }
    const first = firstDueDate({ activatedOn: activationDate, dueDay: client.account.dueDay, billingStart: client.account.billingStart })
    const ok = await confirm(
      `Ativar ${client.name} a partir de ${dateBR(activationDate)}? A cobrança começa: 1º vencimento em ${dateBR(first)}.`,
      { title: 'Ativar cliente', confirmLabel: 'Ativar' }
    )
    if (ok) save({ status: 'ativo', activatedOn: activationDate }, `${client.name} ativado. 1º vencimento em ${dateBR(first)}.`)
  }

  async function backToImplantation() {
    const ok = await confirm(
      `Voltar ${client.name} para "Em implantação"? A cobrança para e, ao ativar de novo, o vencimento passa a ser o dia da nova ativação.`,
      { title: 'Voltar para implantação', confirmLabel: 'Voltar para implantação', cancelLabel: 'Cancelar' }
    )
    if (ok) save({ status: 'implantacao' }, `${client.name} voltou para implantação.`)
  }

  function saveActivationDate() {
    if (!activationDate) {
      setError('Informe a data de ativação (dd/mm/aaaa).')
      return
    }
    save({ activatedOn: activationDate }, 'Data de ativação corrigida.')
  }

  if (!client) {
    return (
      <div className="admin-page platform-page">
        <Link to="/wbdev/clientes" className="platform-back">
          <ArrowLeft size={16} /> Clientes
        </Link>
        {error ? <p className="admin-error">{error}</p> : <p className="admin-muted">Carregando…</p>}
      </div>
    )
  }

  const a = client.account
  const billing = client.billing
  const onboarding = onboardingStatus(client)
  const done = onboarding.filter((i) => i.done).length
  const domain = domainAlert(a)
  const chargeLink = whatsappLink(a.responsiblePhone, chargeMessage({ storeName: client.name, responsibleName: a.responsibleName, billing, pixKey, siteUrl: client.siteUrl }))
  const planPrice = plans.find((p) => p.id === billingForm?.planId)?.monthlyPrice
  const implantation = implantationDays(a)
  const autoMonth = a.status === 'implantacao' || Boolean(a.activatedOn)
  const previewFirst = firstDueDate({ activatedOn: activationDate, dueDay: a.dueDay, billingStart: a.billingStart })

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <Link to="/wbdev/clientes" className="platform-back">
            <ArrowLeft size={16} /> Clientes
          </Link>
          <h1>
            {client.name} <StatusPill status={a.status} />
          </h1>
          {client.siteUrl && (
            <p>
              <a href={client.siteUrl} target="_blank" rel="noreferrer" className="platform-site-link">
                {client.siteUrl.replace('https://', '')} <ExternalLink size={13} />
              </a>
            </p>
          )}
        </div>
        <Link to={`/wbdev/${client.slug}`} className="btn btn-outline">
          <BarChart3 size={15} /> Números da loja
        </Link>
      </div>

      <nav className="client-sections" aria-label="Seções da ficha">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className={section === s.key ? 'is-active' : ''} onClick={() => setSection(s.key)}>
            {s.label}
          </button>
        ))}
      </nav>

      {error && <p className="admin-error">{error}</p>}
      {msg && <p className="admin-success">{msg}</p>}

      {section === 'resumo' && (
        <div className="client-summary">
          <div className="platform-kpi">
            <span>Situação</span>
            <strong>{STATUS_LABEL[a.status] || 'Ativo'}</strong>
            {a.status === 'bloqueado' && <small>desde {dateBR(a.blockedAt?.slice(0, 10))}{a.blockReason ? ` · ${a.blockReason}` : ''}</small>}
            {implantation && !implantation.done && (
              <small>
                há {plural(implantation.days, 'dia', 'dias')} (desde {dateBR(a.implantationStartedOn)})
              </small>
            )}
            {a.status === 'ativo' && a.activatedOn && (
              <small>
                desde {dateBR(a.activatedOn)}
                {implantation?.done ? ` · implantação levou ${plural(implantation.days, 'dia', 'dias')}` : ''}
              </small>
            )}
          </div>
          <div className="platform-kpi">
            <span>Mensalidade</span>
            <strong>{billing.price ? money(billing.price) : '—'}</strong>
            <small>
              {client.plan?.name ? `Plano ${client.plan.name}` : 'Sem plano'}
              {billing.due_day ? ` · vence dia ${billing.due_day}${billing.due_day_auto ? ' (automático)' : ''}` : a.status === 'implantacao' ? ' · vence no dia da ativação' : ''}
            </small>
          </div>
          <div className="platform-kpi">
            <span>Cobrança</span>
            <strong className="client-kpi-text">{situationText(billing)}</strong>
            {billing.open_total > 0 && <small>{money(billing.open_total)} em aberto</small>}
          </div>
          <div className="platform-kpi">
            <span>Implantação</span>
            <strong>
              {done}/{onboarding.length}
            </strong>
            <small>{done === onboarding.length ? 'tudo pronto' : 'itens em Dados e implantação'}</small>
          </div>
          <div className="platform-chips client-summary-chips">
            <span className={client.checks.whatsappOk ? 'is-used' : 'is-warn'}>WhatsApp do site: <b>{client.checks.whatsappOk ? 'configurado' : 'sem número'}</b></span>
            <span>
              <b>{client.checks.cars}</b> carros cadastrados
            </span>
            <span>
              <b>{client.checks.logins}</b> {client.checks.logins === 1 ? 'login' : 'logins'}
            </span>
            <span className={client.checks.ownDomain ? 'is-used' : 'is-warn'}>Domínio: <b>{client.checks.ownDomain ? 'próprio' : 'temporário'}</b></span>
            {a.domainExpiresOn && (
              <span className={domain ? 'is-warn' : ''}>
                {domain || `Domínio vence em ${dateBR(a.domainExpiresOn)}`}
                {[domainRegistrarLabel(a.domainRegistrar), a.domainPaidBy ? `renovação: ${domainPayerLabel(a.domainPaidBy)}` : '']
                  .filter(Boolean)
                  .map((t) => ` · ${t}`)
                  .join('')}
              </span>
            )}
          </div>
        </div>
      )}

      {section === 'cobranca' && billingForm && payForm && (
        <>
          <form className="admin-form admin-form-section" onSubmit={saveBilling}>
            <h2>Plano e mensalidade</h2>
            <div className="admin-form-grid admin-form-grid-3">
              <label>
                Plano
                <select value={billingForm.planId} onChange={(e) => setBillingForm((f) => ({ ...f, planId: e.target.value }))}>
                  <option value="">Sem plano (todas as abas)</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.monthlyPrice ? ` · ${money(p.monthlyPrice)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mensalidade
                <MoneyInput
                  cents
                  value={billingForm.monthlyPrice}
                  onChange={(v) => setBillingForm((f) => ({ ...f, monthlyPrice: v }))}
                  placeholder={planPrice ? `Do plano: ${priceInput(planPrice)}` : 'Ex: 199,90'}
                />
              </label>
              <label>
                Dia do vencimento
                <select value={billingForm.dueDay} onChange={(e) => setBillingForm((f) => ({ ...f, dueDay: e.target.value }))}>
                  <option value="">{autoMonth ? 'Automático (dia da ativação)' : 'Escolha o dia'}</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      Dia {d}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Primeiro mês cobrado
                <MonthSelectBR
                  value={billingForm.billingStart}
                  onChange={(v) => setBillingForm((f) => ({ ...f, billingStart: v }))}
                  emptyLabel={autoMonth ? 'Automático (mês do 1º vencimento)' : 'Escolha o mês'}
                />
              </label>
            </div>
            {a.status === 'implantacao' ? (
              <p className="admin-form-note">
                Em implantação não há cobrança. Ao ativar, a 1ª mensalidade vence no próprio dia da ativação e depois todo mês
                nesse dia (29 a 31: no último dia dos meses mais curtos), a não ser que você escolha o dia ou o mês acima.
              </p>
            ) : a.activatedOn ? (
              <p className="admin-form-note">
                Ativado em {dateBR(a.activatedOn)}: 1º vencimento em{' '}
                {dateBR(firstDueDate({ activatedOn: a.activatedOn, dueDay: a.dueDay, billingStart: a.billingStart }))}
                {a.dueDay ? ' (dia escolhido à mão)' : ' (automático, no dia da ativação)'}. Dia e mês em branco seguem a ativação.
              </p>
            ) : (
              <p className="admin-form-note">
                Sem valor, vencimento ou primeiro mês, a loja fica "sem cobrança" e não recebe aviso. Mensalidade em branco usa o valor do plano.
              </p>
            )}
            <div className="admin-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar cobrança'}
              </button>
            </div>
          </form>

          <div className="admin-form-section client-billing-box">
            <div className="client-billing-head">
              <div>
                <h2>Situação</h2>
                <BillingPill billing={billing} />
              </div>
              {chargeLink ? (
                <a href={chargeLink} target="_blank" rel="noreferrer" className="btn btn-outline">
                  <MessageCircle size={15} /> Cobrar no WhatsApp
                </a>
              ) : (
                <span className="admin-form-note">Cadastre o telefone do responsável em Dados para cobrar pelo WhatsApp.</span>
              )}
            </div>
            {billing.open?.length > 0 ? (
              <ul className="client-open">
                {billing.open.map((o) => (
                  <li key={o.month}>
                    <span>
                      <b>{monthName(o.month)}</b> · venceu em {dateBR(o.due)}
                    </span>
                    <span>{money(o.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              billing.next && (
                <p className="admin-muted">
                  Próximo vencimento: {monthName(billing.next.month)}, em {dateBR(billing.next.due)} ({money(billing.next.amount)}).
                </p>
              )
            )}
          </div>

          <form className="admin-form admin-form-section" onSubmit={savePayment}>
            <h2>Registrar pagamento</h2>
            <div className="admin-form-grid admin-form-grid-3">
              <label>
                Mês de referência
                <MonthInputBR value={payForm.referenceMonth} onChange={(v) => setPayForm((f) => ({ ...f, referenceMonth: v }))} />
              </label>
              <label>
                Valor pago
                <MoneyInput cents value={payForm.amount} onChange={(v) => setPayForm((f) => ({ ...f, amount: v }))} />
              </label>
              <label>
                Pago em
                <DateInputBR value={payForm.paidOn} onChange={(v) => setPayForm((f) => ({ ...f, paidOn: v }))} />
              </label>
              <label>
                Forma
                <select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
                  {METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Observação
                <input value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Opcional" />
              </label>
            </div>
            <label className="admin-checkbox">
              <input type="checkbox" checked={sendReceipt && recipients.length > 0} disabled={!recipients.length} onChange={(e) => setSendReceipt(e.target.checked)} />
              {recipients.length ? `Enviar o recibo por e-mail para ${recipients.join(', ')}` : 'Sem e-mail para mandar o recibo (preencha o e-mail do responsável em Dados)'}
            </label>
            <div className="admin-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Registrar pagamento'}
              </button>
            </div>
          </form>

          <h2 className="admin-section-title">Pagamentos</h2>
          {payments.length === 0 ? (
            <p className="admin-muted">Nenhum pagamento registrado ainda.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Valor</th>
                    <th>Pago em</th>
                    <th>Forma</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {monthName(p.referenceMonth)}
                        {p.notes && <span className="admin-table-sub">{p.notes}</span>}
                      </td>
                      <td>{money(p.amount)}</td>
                      <td>{dateBR(p.paidOn)}</td>
                      <td>{p.method || '—'}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" className="admin-action-btn" onClick={() => exportPaymentReceipt({ client, payment: p })}>
                            <FileDown size={14} /> Recibo
                          </button>
                          <button
                            type="button"
                            className="admin-action-btn"
                            onClick={() => resendReceipt(p)}
                            disabled={!recipients.length || mailing === p.id}
                            title={recipients.length ? `Mandar o recibo para ${recipients.join(', ')}` : 'Sem e-mail para mandar'}
                          >
                            <Mail size={14} /> {mailing === p.id ? 'Enviando…' : 'E-mail'}
                          </button>
                          <button type="button" className="admin-action-btn admin-action-danger" onClick={() => removePayment(p)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-form-section client-reminders">
            <h2>Lembretes por e-mail</h2>
            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={a.remindersEnabled}
                disabled={saving}
                onChange={() => save({ remindersEnabled: !a.remindersEnabled }, a.remindersEnabled ? 'Lembretes desligados para este cliente.' : 'Lembretes ligados.')}
              />
              Enviar os lembretes de mensalidade por e-mail (5 dias antes, no dia e com 1, 3 e 7 dias de atraso)
            </label>
            <p className="admin-form-note">
              {recipients.length
                ? `Vão para: ${recipients.join(', ')}${a.responsibleEmail ? ' (responsável da ficha)' : ' (admins da loja; para mandar a outra pessoa, preencha o e-mail do responsável em Dados)'}.`
                : 'Sem e-mail para enviar: preencha o e-mail do responsável em Dados.'}{' '}
              Saem sozinhos todo dia às 8h.
            </p>
            {reminderLog.length > 0 && (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Enviado em</th>
                      <th>E-mail</th>
                      <th>Mês</th>
                      <th>Para</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminderLog.map((r) => (
                      <tr key={r.id}>
                        <td>{new Date(r.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td>{reminderLabel(r.kind)}</td>
                        <td>{r.referenceMonth ? monthName(r.referenceMonth) : '—'}</td>
                        <td>{r.sentTo || '—'}</td>
                        <td>
                          {r.status === 'enviado' ? (
                            <span className="platform-health is-green">Enviado</span>
                          ) : (
                            <span className="platform-health is-red" title={r.error}>
                              Erro
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {section === 'dados' && dataForm && (
        <>
          <form className="admin-form admin-form-section" onSubmit={saveData}>
            <h2>Dados do cliente</h2>
            <div className="admin-form-grid admin-form-grid-3">
              {[
                ['legalName', 'Razão social'],
                ['cnpj', 'CNPJ'],
                ['responsibleName', 'Responsável'],
                ['responsiblePhone', 'Telefone / WhatsApp do responsável'],
                ['responsibleEmail', 'E-mail do responsável'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input value={dataForm[key]} onChange={(e) => setDataForm((f) => ({ ...f, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
            <fieldset className="customer-address client-domain">
              <legend>Domínio</legend>
              <div className="admin-form-grid admin-form-grid-3">
                <label>
                  Domínio
                  <input
                    value={dataForm.domain}
                    onChange={(e) => setDataForm((f) => ({ ...f, domain: e.target.value }))}
                    placeholder="Ex.: minhaloja.com.br"
                  />
                </label>
                <label>
                  Comprado em
                  <DateInputBR value={dataForm.domainRegisteredOn} onChange={(v) => updateDomainPurchase('domainRegisteredOn', v)} />
                </label>
                <label>
                  Por quanto tempo
                  <select value={dataForm.domainYears} onChange={(e) => updateDomainPurchase('domainYears', e.target.value)}>
                    <option value="">—</option>
                    {DOMAIN_YEARS.map((n) => (
                      <option key={n} value={n}>{plural(n, 'ano', 'anos')}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Vence em
                  <DateInputBR value={dataForm.domainExpiresOn} onChange={(v) => setDataForm((f) => ({ ...f, domainExpiresOn: v }))} />
                </label>
                <label>
                  Onde está registrado
                  <select value={dataForm.domainRegistrar} onChange={(e) => setDataForm((f) => ({ ...f, domainRegistrar: e.target.value }))}>
                    <option value="">—</option>
                    {DOMAIN_REGISTRARS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quem paga a renovação
                  <select value={dataForm.domainPaidBy} onChange={(e) => setDataForm((f) => ({ ...f, domainPaidBy: e.target.value }))}>
                    <option value="">—</option>
                    {DOMAIN_PAYERS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="admin-form-note">
                O vencimento é calculado pela data da compra e o período (dá para corrigir à mão). O aviso aparece {DOMAIN_ALERT_DAYS} dias antes,
                na lista de clientes, na ficha e na Visão geral.
              </p>
            </fieldset>
            <label>
              Observações
              <textarea rows={3} value={dataForm.notes} onChange={(e) => setDataForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            <div className="admin-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar dados'}
              </button>
            </div>
          </form>

          <div className="admin-form-section">
            <h2>Implantação</h2>
            <p className="admin-form-hint">
              {done} de {onboarding.length} itens prontos. Os marcados como "automático" o sistema confere sozinho.
            </p>
            <ul className="client-onboarding">
              {onboarding.map((item) => (
                <li key={item.key}>
                  <label className="admin-checkbox">
                    <input type="checkbox" checked={item.done} disabled={item.auto || saving} onChange={() => toggleOnboarding(item.key)} />
                    {item.label}
                    {item.auto && <small> (automático)</small>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {section === 'atendimento' && (
        <>
          <div className="admin-form-section">
            <h2>Contrato de adesão</h2>
            {!termsInfo ? (
              <p className="admin-muted">Carregando…</p>
            ) : !termsInfo.current ? (
              <p className="admin-muted">
                Nenhuma versão publicada ainda. <Link to="/wbdev/contrato">Revisar e publicar o contrato</Link>
              </p>
            ) : termsInfo.receipt ? (
              <div className="billing-list-row">
                <div>
                  <strong>
                    {Number(termsInfo.receipt.version) === termsInfo.current.version ? 'Aceitou a versão atual' : `Aceitou a versão ${termsInfo.receipt.version} (falta a ${termsInfo.current.version})`}
                  </strong>
                  <span className="admin-table-sub">
                    {new Date(termsInfo.receipt.accepted_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {termsInfo.receipt.user_name || termsInfo.receipt.user_email} · IP {termsInfo.receipt.ip || '—'}
                  </span>
                </div>
                <button type="button" className="btn btn-outline" onClick={() => exportTermsReceiptPdf(termsInfo.receipt)}>
                  <FileDown size={15} /> Comprovante (PDF)
                </button>
              </div>
            ) : (
              <p>Ainda não aceitou a versão {termsInfo.current.version}. O admin da loja aceita no próximo acesso ao painel.</p>
            )}
          </div>
          <div className="admin-form-section">
            <h2>Anotações de atendimento</h2>
            <ContactNotes
              companyId={client.companyId}
              notes={notes}
              onAdded={(n) => setNotes((prev) => [n, ...prev])}
              onDeleted={(id) => setNotes((prev) => prev.filter((x) => x.id !== id))}
            />
          </div>
        </>
      )}

      {section === 'acesso' && (
        <div className="admin-form-section client-access">
          <h2>Acesso ao sistema</h2>
          {a.status === 'implantacao' ? (
            <>
              <p>
                Em implantação{implantation ? ` há ${plural(implantation.days, 'dia', 'dias')} (desde ${dateBR(a.implantationStartedOn)})` : ''}: a
                equipe usa o painel e o site normalmente, sem cobrança.
              </p>
              <label className="client-access-reason">
                Data de ativação (a mensalidade vence nesse dia, todo mês)
                <DateInputBR value={activationDate} onChange={setActivationDate} />
              </label>
              {previewFirst && (
                <p className="admin-form-note">
                  1º vencimento: {dateBR(previewFirst)}
                  {a.dueDay ? ` (dia ${a.dueDay}, escolhido em Cobrança)` : ''}.
                  {!billing.price ? ' Defina a mensalidade em Cobrança para a cobrança começar.' : ''}
                </p>
              )}
              <div className="admin-row-actions">
                <button type="button" className="btn btn-primary" onClick={activate} disabled={saving}>
                  <Play size={15} /> Ativar cliente
                </button>
                <button type="button" className="btn btn-outline" onClick={cancelClient} disabled={saving}>
                  <Ban size={15} /> Cancelar cliente
                </button>
              </div>
            </>
          ) : a.status === 'ativo' ? (
            <>
              <p>
                A loja está ativa{a.activatedOn ? ` desde ${dateBR(a.activatedOn)}` : ''}: a equipe usa o painel e o site está no ar.
              </p>
              <label className="client-access-reason">
                Motivo do bloqueio (só você vê)
                <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ex.: mensalidade de setembro em atraso" />
              </label>
              <div className="admin-row-actions">
                <button type="button" className="btn btn-danger" onClick={block} disabled={saving}>
                  <Lock size={15} /> Bloquear
                </button>
                <button type="button" className="btn btn-outline" onClick={cancelClient} disabled={saving}>
                  <Ban size={15} /> Cancelar cliente
                </button>
                <button type="button" className="btn btn-outline" onClick={backToImplantation} disabled={saving}>
                  <Undo2 size={15} /> Voltar para implantação
                </button>
              </div>
              {a.activatedOn && (
                <div className="client-activation-fix">
                  <label className="client-access-reason">
                    Corrigir a data de ativação
                    <DateInputBR value={activationDate} onChange={setActivationDate} />
                  </label>
                  <button type="button" className="btn btn-outline" onClick={saveActivationDate} disabled={saving}>
                    Salvar data
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p>
                {a.status === 'bloqueado' ? 'Bloqueada' : 'Cancelada'} desde {dateBR(a.blockedAt?.slice(0, 10))}
                {a.blockReason ? ` · ${a.blockReason}` : ''}. A equipe não entra no painel e o site mostra a página de manutenção.
              </p>
              <div className="admin-row-actions">
                <button type="button" className="btn btn-primary" onClick={unblock} disabled={saving}>
                  <Unlock size={15} /> {a.status === 'cancelado' ? 'Reativar' : 'Liberar'}
                </button>
              </div>
            </>
          )}
          {client.siteUrl && (
            <p className="admin-form-note">
              <a href={`${client.siteUrl}/?manutencao=ver`} target="_blank" rel="noreferrer">
                Ver como fica o site bloqueado <ExternalLink size={12} />
              </a>{' '}
              (só mostra a página; não bloqueia nada).
            </p>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  )
}
