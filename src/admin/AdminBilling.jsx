import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Download, FileSignature, QrCode, RefreshCcw, Receipt } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchMyPayments, fetchTermsReceipt } from '../lib/clientsApi.js'
import { fetchCompanySettings } from '../lib/companyApi.js'
import { COMPANY_ID } from '../lib/supabaseClient.js'
import { money, dateBR, monthName, monthsText, payableMonths } from '../utils/billing.js'
import { pixPayload, pixTxid } from '../utils/pix.js'
import { exportTermsReceiptPdf } from '../utils/termsPdf.js'
import PixQr from './PixQr.jsx'
import PaymentClaimDialog from './PaymentClaimDialog.jsx'
import PlateCredits from './PlateCredits.jsx'
import './admin.css'

const CLAIM_STATUS = {
  pendente: { label: 'Aguardando a confirmação da WB.Dev', className: 'is-warning' },
  confirmado: { label: 'Confirmado', className: 'is-success' },
  recusado: { label: 'Não confirmado', className: 'is-danger' },
}

function situationLabel(billing) {
  const s = billing?.situation
  if (s === 'atrasado') {
    const n = Number(billing.days_late) || 0
    return { text: `Em atraso há ${n} ${n === 1 ? 'dia' : 'dias'}`, className: 'is-danger' }
  }
  if (s === 'vence_hoje') return { text: 'Vence hoje', className: 'is-warning' }
  if (s === 'vence_em_breve') return { text: `Vence em ${dateBR(billing.next?.due)}`, className: 'is-warning' }
  if (s === 'em_dia') return { text: 'Em dia', className: 'is-success' }
  if (s === 'implantacao') return { text: 'Em implantação (sem cobrança)', className: '' }
  return { text: 'Sem cobrança', className: '' }
}

// Mensalidade do sistema (só o admin da loja): situação, PIX com QR code, dados
// bancários, "Já paguei", pagamentos e o contrato de adesão aceito
export default function AdminBilling() {
  const { account, refreshAccount } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [payments, setPayments] = useState([])
  const [storeName, setStoreName] = useState('a loja')
  const [chosen, setChosen] = useState(null)
  const [claiming, setClaiming] = useState(searchParams.get('pago') === '1')
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  async function load() {
    setError('')
    refreshAccount()
    fetchMyPayments().then(setPayments).catch((err) => setError(err.message || 'Não foi possível carregar os pagamentos.'))
  }

  useEffect(() => {
    load()
    fetchCompanySettings().then((s) => s?.name && setStoreName(s.name)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const billing = account?.billing
  const payment = account?.payment
  const options = useMemo(() => payableMonths(billing), [billing])
  // Marcados para pagar: os atrasados; sem atraso, o próximo
  const selected = chosen || new Set(options.some((o) => o.late) ? options.filter((o) => o.late).map((o) => o.month) : options.slice(0, 1).map((o) => o.month))
  const selectedOptions = options.filter((o) => selected.has(o.month))
  const total = selectedOptions.reduce((s, o) => s + o.amount, 0)
  const pendingClaim = (payment?.claims || []).find((c) => c.status === 'pendente')
  const payload = payment?.pixKey
    ? pixPayload({ key: payment.pixKey, name: payment.pixName, city: payment.pixCity, amount: total || null, txid: pixTxid(COMPANY_ID.slice(0, 8), selectedOptions[0]?.month || '') })
    : ''
  const situation = situationLabel(billing)

  function toggle(month) {
    const next = new Set(selected)
    if (next.has(month)) next.delete(month)
    else next.add(month)
    setChosen(next)
  }

  function closeClaim() {
    setClaiming(false)
    if (searchParams.get('pago')) {
      const next = new URLSearchParams(searchParams)
      next.delete('pago')
      setSearchParams(next, { replace: true })
    }
  }

  async function downloadTerms() {
    setDownloading(true)
    try {
      const receipt = await fetchTermsReceipt()
      if (!receipt) throw new Error('Nenhum aceite registrado.')
      await exportTermsReceiptPdf(receipt)
    } catch (err) {
      alert('Não foi possível gerar o comprovante: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  if (!account) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Mensalidade</h1>
          <p>
            Sistema WB.AUTO (site e painel){account.planName ? ` · plano ${account.planName}` : ''}
            {billing?.price ? ` · ${money(billing.price)} por mês` : ''}
            {billing?.due_day ? ` · vence todo dia ${billing.due_day}` : ''}
          </p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="billing-status">
        <span className={`admin-pill ${situation.className}`}>{situation.text}</span>
        {billing?.open?.length > 0 && (
          <span>
            {billing.open.length === 1 ? 'Mês em aberto' : 'Meses em aberto'}: {monthsText(billing.open.map((o) => o.month))} · total {money(billing.open_total)}
          </span>
        )}
        {billing?.next && <span>Próxima: {monthName(billing.next.month)}, vence em {dateBR(billing.next.due)}</span>}
      </div>

      {pendingClaim && (
        <p className="admin-success">
          <CheckCircle2 size={15} /> Você informou o pagamento de {monthsText(pendingClaim.months)} ({money(pendingClaim.amount)}). A WB.Dev está conferindo.
        </p>
      )}

      {options.length > 0 && (
        <section className="billing-pay">
          <div className="billing-pay-main">
            <h2 className="admin-section-title"><QrCode size={18} /> Pagar com PIX</h2>
            <div className="billing-pay-months">
              {options.map((o) => (
                <label key={o.month} className="admin-checkbox">
                  <input type="checkbox" checked={selected.has(o.month)} onChange={() => toggle(o.month)} />
                  <span>
                    {monthName(o.month)} · {money(o.amount)} · {o.late ? <strong className="expense-margin-negative">venceu em {dateBR(o.due)}</strong> : `vence em ${dateBR(o.due)}`}
                  </span>
                </label>
              ))}
            </div>
            <p className="billing-pay-total">
              Total: <strong>{money(total)}</strong>
            </p>
            {payment?.pixKey ? (
              <>
                <PixQr payload={total > 0 ? payload : ''} pixKey={payment.pixKey} />
                <p className="admin-form-note">
                  Abra o app do seu banco, escolha PIX → ler QR code ou "copia e cola". Confira o nome {payment.pixName ? `(${payment.pixName})` : ''} e o valor antes de pagar.
                </p>
              </>
            ) : (
              <p className="admin-muted">A WB.Dev ainda não cadastrou os dados do PIX. Fale com o suporte para pagar.</p>
            )}
            <button type="button" className="btn btn-primary billing-paid-btn" onClick={() => setClaiming(true)}>
              <Receipt size={15} /> Já paguei
            </button>
          </div>

          {(payment?.bankName || payment?.bankAccount) && (
            <div className="billing-bank">
              <h3>Transferência bancária</h3>
              <dl>
                {payment.bankName && (<><dt>Banco</dt><dd>{payment.bankName}</dd></>)}
                {payment.bankAgency && (<><dt>Agência</dt><dd>{payment.bankAgency}</dd></>)}
                {payment.bankAccount && (<><dt>Conta</dt><dd>{payment.bankAccount}</dd></>)}
                {payment.bankHolder && (<><dt>Titular</dt><dd>{payment.bankHolder}</dd></>)}
                {payment.bankDocument && (<><dt>CPF/CNPJ</dt><dd>{payment.bankDocument}</dd></>)}
              </dl>
            </div>
          )}
        </section>
      )}

      {(payment?.claims || []).length > 0 && (
        <>
          <h2 className="admin-section-title">Pagamentos informados</h2>
          <div className="billing-list">
            {payment.claims.map((c) => (
              <div className="billing-list-row" key={c.id}>
                <div>
                  <strong>{monthsText(c.months)} · {money(c.amount)}</strong>
                  <span className="admin-table-sub">Pago em {dateBR(c.paidOn)} · informado em {dateBR(c.createdAt?.slice(0, 10))}</span>
                  {c.status === 'recusado' && c.response && <span className="admin-table-sub">Motivo: {c.response}</span>}
                </div>
                <span className={`admin-pill ${CLAIM_STATUS[c.status]?.className || ''}`}>{CLAIM_STATUS[c.status]?.label || c.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="admin-section-title">Pagamentos confirmados</h2>
      {payments.length === 0 ? (
        <p className="admin-muted">Nenhum pagamento registrado ainda.</p>
      ) : (
        <div className="billing-list">
          {payments.map((p) => (
            <div className="billing-list-row" key={p.id}>
              <div>
                <strong>{monthName(p.referenceMonth)}</strong>
                <span className="admin-table-sub">Pago em {dateBR(p.paidOn)}{p.method ? ` · ${p.method}` : ''}</span>
              </div>
              <strong>{money(p.amount)}</strong>
            </div>
          ))}
        </div>
      )}

      <PlateCredits payment={payment} storeName={storeName} />

      {account.terms?.acceptance && (
        <>
          <h2 className="admin-section-title"><FileSignature size={18} /> Contrato de adesão</h2>
          <div className="billing-list-row">
            <div>
              <strong>{account.terms.title || 'Contrato de adesão'} · versão {account.terms.acceptance.version}</strong>
              <span className="admin-table-sub">
                Aceito em {new Date(account.terms.acceptance.acceptedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} por{' '}
                {account.terms.acceptance.userName || account.terms.acceptance.userEmail}
              </span>
            </div>
            <button type="button" className="btn btn-outline" onClick={downloadTerms} disabled={downloading}>
              <Download size={15} /> {downloading ? 'Gerando…' : 'Baixar (PDF)'}
            </button>
          </div>
        </>
      )}

      {claiming && options.length > 0 && (
        <PaymentClaimDialog
          options={options}
          preselected={[...selected]}
          storeName={storeName}
          onClose={closeClaim}
          onDone={() => {
            closeClaim()
            load()
          }}
        />
      )}
    </div>
  )
}
