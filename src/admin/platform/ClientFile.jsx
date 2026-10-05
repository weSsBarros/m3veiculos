import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileDown, MessageCircle, Trash2, Lock, Unlock, Ban, BarChart3, Play, Undo2 } from 'lucide-react'
import { fetchClients, fetchPayments, fetchPlans, updateClientAccount, addPayment, deletePayment } from '../../lib/clientsApi.js'
import {
  money,
  monthName,
  dateBR,
  situationText,
  chargeMessage,
  whatsappLink,
  domainAlert,
  onboardingStatus,
  implantationDays,
  firstDueDate,
} from '../../utils/billing.js'
import { exportPaymentReceipt } from '../../utils/clientPdf.js'
import { todayISO } from '../../utils/carFormat.js'
import useConfirm from '../../components/useConfirm.jsx'
import { StatusPill, BillingPill } from './ClientParts.jsx'
import PlatformTabs from './PlatformTabs.jsx'
import DateInputBR from '../../components/DateInputBR.jsx'
import MonthInputBR from '../../components/MonthInputBR.jsx'
import MonthSelectBR from '../../components/MonthSelectBR.jsx'
import { MoneyInput } from '../../components/NumberInputs.jsx'
import '../admin.css'

const SECTIONS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'cobranca', label: 'Cobrança' },
  { key: 'dados', label: 'Dados e implantação' },
  { key: 'acesso', label: 'Acesso' },
]

const METHODS = ['Pix', 'Transferência', 'Dinheiro', 'Cartão', 'Boleto', 'Outro']
const STATUS_LABEL = { implantacao: 'Em implantação', ativo: 'Ativo', bloqueado: 'Bloqueado', cancelado: 'Cancelado' }
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)
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

  async function load() {
    setError('')
    try {
      const [clients, planList] = await Promise.all([fetchClients(), fetchPlans()])
      const found = clients.find((c) => c.slug === slug)
      if (!found) throw new Error('Cliente não encontrado.')
      setClient(found)
      setPlans(planList)
      setPayments(await fetchPayments(found.companyId))
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
      await addPayment({
        companyId: client.companyId,
        referenceMonth: fromMonthInput(payForm.referenceMonth),
        amount,
        paidOn: payForm.paidOn,
        method: payForm.method,
        notes: payForm.notes,
      })
      setMsg(`Pagamento de ${monthName(fromMonthInput(payForm.referenceMonth))} registrado.`)
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível registrar o pagamento.')
    } finally {
      setSaving(false)
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
    save({ ...dataForm, domainExpiresOn: dataForm.domainExpiresOn || '' }, 'Dados salvos.')
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
      `Voltar ${client.name} para "Em implantação"? A cobrança para e, ao ativar de novo, os 30 dias recomeçam.`,
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
        <Link to="/admin/plataforma/clientes" className="platform-back">
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
  const chargeLink = whatsappLink(a.responsiblePhone, chargeMessage({ storeName: client.name, responsibleName: a.responsibleName, billing }))
  const planPrice = plans.find((p) => p.id === billingForm?.planId)?.monthlyPrice
  const implantation = implantationDays(a)
  const autoMonth = a.status === 'implantacao' || Boolean(a.activatedOn)
  const previewFirst = firstDueDate({ activatedOn: activationDate, dueDay: a.dueDay, billingStart: a.billingStart })

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <Link to="/admin/plataforma/clientes" className="platform-back">
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
        <Link to={`/admin/plataforma/${client.slug}`} className="btn btn-outline">
          <BarChart3 size={15} /> Números da loja
        </Link>
      </div>
      <PlatformTabs />

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
              {billing.due_day ? ` · vence dia ${billing.due_day}${billing.due_day_auto ? ' (automático)' : ''}` : a.status === 'implantacao' ? ' · vence 30 dias após ativar' : ''}
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
            {domain && <span className="is-warn">{domain}</span>}
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
                  <option value="">{autoMonth ? 'Automático (30 dias após ativar)' : 'Escolha o dia'}</option>
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
                Em implantação não há cobrança. Ao ativar, o 1º vencimento é 30 dias depois (se cair no dia 29, 30 ou 31, vence no
                dia 1 do mês seguinte), a não ser que você escolha o dia ou o mês acima.
              </p>
            ) : a.activatedOn ? (
              <p className="admin-form-note">
                Ativado em {dateBR(a.activatedOn)}: 1º vencimento em{' '}
                {dateBR(firstDueDate({ activatedOn: a.activatedOn, dueDay: a.dueDay, billingStart: a.billingStart }))}
                {a.dueDay ? ' (dia escolhido à mão)' : ' (automático, 30 dias depois)'}. Dia e mês em branco seguem a ativação.
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
                ['domain', 'Domínio'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input value={dataForm[key]} onChange={(e) => setDataForm((f) => ({ ...f, [key]: e.target.value }))} />
                </label>
              ))}
              <label>
                Vencimento do domínio
                <DateInputBR value={dataForm.domainExpiresOn} onChange={(v) => setDataForm((f) => ({ ...f, domainExpiresOn: v }))} />
              </label>
            </div>
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
                Data de ativação (dela contam os 30 dias)
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
