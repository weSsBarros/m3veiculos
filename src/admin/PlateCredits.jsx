import { useEffect, useState } from 'react'
import { CheckCircle2, MessageCircle, Paperclip, Receipt, ScanSearch, Upload, X } from 'lucide-react'
import { fetchMyPlateCredits, requestPlateCredit } from '../lib/plateCreditsApi.js'
import { notifyWbdev, uploadPaymentReceipt } from '../lib/clientsApi.js'
import { COMPANY_ID } from '../lib/supabaseClient.js'
import { ledgerText, moneyBR, queriesText, readsText } from '../utils/plateCredits.js'
import { dateBR } from '../utils/billing.js'
import { pixPayload } from '../utils/pix.js'
import { todayISO } from '../utils/carFormat.js'
import { supportMessageLink } from '../utils/support.js'
import DateInputBR from '../components/DateInputBR.jsx'
import PixQr from './PixQr.jsx'
import '../components/ConfirmDialog.css'

const ORDER_STATUS = {
  pendente: { label: 'Aguardando a WB.Dev', className: 'is-warning' },
  confirmado: { label: 'Crédito liberado', className: 'is-success' },
  recusado: { label: 'Não confirmado', className: 'is-danger' },
}

// "Já paguei" dos créditos: data, comprovante (opcional) e observação
function PlateCreditDialog({ pack, storeName, onClose, onDone }) {
  const [paidOn, setPaidOn] = useState(todayISO())
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!paidOn) return setError('Informe a data do pagamento.')
    setSaving(true)
    setError('')
    try {
      const receipt = file ? await uploadPaymentReceipt(file) : null
      const order = await requestPlateCredit({ amount: pack.amount, paidOn, receipt, note: note.trim() })
      await notifyWbdev('credito_informado', order.id)
      setDone(true)
    } catch (err) {
      setError('Não foi possível informar a compra: ' + (err.message || 'tente de novo.'))
      setSaving(false)
    }
  }

  if (done) {
    const text =
      `Olá! Aqui é da ${storeName}. Comprei ${moneyBR(pack.amount)} de créditos (placa, documento e assinatura) ` +
      `(${queriesText(pack.queries)}) em ${dateBR(paidOn)} pelo PIX. Segue o comprovante.`
    return (
      <div className="confirm-dialog-overlay" onClick={onDone}>
        <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="confirm-dialog-close" onClick={onDone} aria-label="Fechar">
            <X size={18} />
          </button>
          <h2><CheckCircle2 size={20} /> Compra informada</h2>
          <p>A WB.Dev recebeu o aviso. Quando conferir o PIX, os {moneyBR(pack.amount)} entram no saldo da loja.</p>
          <p>Se quiser, mande também o comprovante pelo WhatsApp da WB.Dev:</p>
          <div className="confirm-dialog-actions">
            <button type="button" className="btn btn-outline" onClick={onDone}>Fechar</button>
            <a className="btn btn-primary" href={supportMessageLink(text)} target="_blank" rel="noreferrer" onClick={onDone}>
              <MessageCircle size={15} /> Mandar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog payment-claim-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Já paguei os créditos</h2>
        <p>
          Pacote de <strong>{moneyBR(pack.amount)}</strong> ({queriesText(pack.queries)}). Informe o pagamento para a WB.Dev conferir e liberar
          o crédito.
        </p>
        <label>
          Data do pagamento
          <DateInputBR required value={paidOn} onChange={setPaidOn} />
        </label>
        <label className="payment-claim-file">
          Comprovante (opcional)
          <span className="attachment-uploader-drop">
            {file ? <Paperclip size={16} /> : <Upload size={16} />}
            <span>{file ? file.name : 'Clique para anexar a foto ou o PDF do comprovante'}</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </span>
        </label>
        <label>
          Observação (opcional)
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ex: paguei pela conta da empresa" />
        </label>
        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Enviando…' : 'Informar pagamento'}
          </button>
        </div>
      </form>
    </div>
  )
}

// Página Mensalidade → créditos da consulta por placa (só o admin): saldo,
// pacotes com PIX, "Já paguei", compras informadas e extrato
export default function PlateCredits({ payment, storeName }) {
  const [credits, setCredits] = useState(null)
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [allLedger, setAllLedger] = useState(false)

  async function load() {
    try {
      const data = await fetchMyPlateCredits()
      setCredits(data)
      setError('')
      setChosen((prev) => (prev && data.packages.some((p) => p.amount === prev) ? prev : data.packages[1]?.amount ?? data.packages[0]?.amount ?? null))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os créditos.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Link "Comprar créditos" do cadastro do carro (/admin/mensalidade#creditos)
  useEffect(() => {
    if (credits && window.location.hash === '#creditos') document.getElementById('creditos')?.scrollIntoView({ block: 'start' })
  }, [credits])

  if (!credits) {
    return error ? <p className="admin-error">{error}</p> : null
  }

  const pack = credits.packages.find((p) => p.amount === chosen) || null
  const payload = payment?.pixKey && pack
    ? pixPayload({ key: payment.pixKey, name: payment.pixName, city: payment.pixCity, amount: pack.amount, txid: `WBC${COMPANY_ID.replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}` })
    : ''
  const pending = credits.orders.filter((o) => o.status === 'pendente')
  const reviewed = credits.orders.filter((o) => o.status !== 'pendente').slice(0, 6)
  const ledger = allLedger ? credits.ledger : credits.ledger.slice(0, 8)

  return (
    <section className="plate-credits" id="creditos">
      <h2 className="admin-section-title"><ScanSearch size={18} /> Créditos (placa, documento e assinatura)</h2>
      <p className="plate-credits-lead">
        Saldo: <strong>{moneyBR(credits.balance)}</strong> · dá para <strong>{queriesText(credits.queries)}</strong> de placa ou{' '}
        <strong>{readsText(credits.docReads)}</strong> de foto do documento
      </p>
      <p className="admin-form-hint plate-credits-hint">
        No cadastro do carro, a consulta por placa traz os dados do veículo e a versão FIPE. Cada placa consultada custa {moneyBR(credits.price)}.
        Placa não encontrada não é cobrada, e a mesma placa de novo em 30 dias também não. A foto do documento (lida pela IA) custa{' '}
        {moneyBR(credits.docPrice)} e só é cobrada quando o documento é lido.
      </p>
      <p className="admin-form-hint plate-credits-hint">
        Assinatura digital: {credits.signatureFreeMonthly > 0
          ? `${credits.signatureFreeMonthly} contratos por mês são grátis (${credits.signatureFreeLeft === 1 ? 'resta 1' : `restam ${credits.signatureFreeLeft}`} neste mês); depois, cada contrato enviado custa ${moneyBR(credits.signaturePrice)}.`
          : `cada contrato enviado custa ${moneyBR(credits.signaturePrice)}.`}{' '}
        Gerar e imprimir o contrato continua grátis, e cancelar um envio não devolve o crédito.
      </p>

      {error && <p className="admin-error">{error}</p>}
      {pending.map((o) => (
        <p className="admin-success" key={o.id}>
          <CheckCircle2 size={15} /> Você informou a compra de {moneyBR(o.amount)} em {dateBR(o.createdAt?.slice(0, 10))}. A WB.Dev está conferindo.
        </p>
      ))}

      <div className="billing-pay-main plate-credits-buy">
        <h3 className="plate-credits-title">Comprar créditos</h3>
        <div className="admin-chip-row plate-credits-packages" role="radiogroup" aria-label="Pacote de créditos">
          {credits.packages.map((p) => (
            <button
              key={p.amount}
              type="button"
              role="radio"
              aria-checked={chosen === p.amount}
              className={`admin-chip${chosen === p.amount ? ' is-active' : ''}`}
              onClick={() => setChosen(p.amount)}
            >
              {moneyBR(p.amount)} · {queriesText(p.queries)}
            </button>
          ))}
        </div>
        {payment?.pixKey ? (
          <>
            <PixQr payload={payload} pixKey={payment.pixKey} />
            <p className="admin-form-note">
              Pague o valor do pacote pelo PIX {payment.pixName ? `(${payment.pixName})` : ''} e clique em "Já paguei". O crédito entra quando a WB.Dev confirmar.
            </p>
          </>
        ) : (
          <p className="admin-muted">A WB.Dev ainda não cadastrou os dados do PIX. Fale com o suporte para comprar créditos.</p>
        )}
        <button type="button" className="btn btn-primary billing-paid-btn" onClick={() => setClaiming(true)} disabled={!pack}>
          <Receipt size={15} /> Já paguei
        </button>
      </div>

      {reviewed.length > 0 && (
        <>
          <h3 className="plate-credits-title">Compras informadas</h3>
          <div className="billing-list">
            {reviewed.map((o) => (
              <div className="billing-list-row" key={o.id}>
                <div>
                  <strong>{moneyBR(o.amount)}</strong>
                  <span className="admin-table-sub">Pago em {dateBR(o.paidOn)}</span>
                  {o.status === 'recusado' && o.response && <span className="admin-table-sub">Motivo: {o.response}</span>}
                </div>
                <span className={`admin-pill ${ORDER_STATUS[o.status]?.className || ''}`}>{ORDER_STATUS[o.status]?.label || o.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="plate-credits-title">Extrato</h3>
      {credits.ledger.length === 0 ? (
        <p className="plate-credits-empty">Nenhum movimento ainda.</p>
      ) : (
        <div className="billing-list">
          {ledger.map((l) => (
            <div className="billing-list-row" key={l.id}>
              <div>
                <strong>{ledgerText(l)}</strong>
                <span className="admin-table-sub">
                  {new Date(l.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  {(l.kind === 'consulta' || l.kind === 'documento') && l.userEmail ? ` · ${l.userEmail}` : ''}
                </span>
              </div>
              <strong className={l.amount < 0 ? 'plate-credits-out' : 'plate-credits-in'}>
                {l.amount < 0 ? '−' : '+'}{moneyBR(Math.abs(l.amount))}
              </strong>
            </div>
          ))}
          {credits.ledger.length > 8 && (
            <button type="button" className="admin-link-btn" onClick={() => setAllLedger((v) => !v)}>
              {allLedger ? 'Ver menos' : `Ver os ${credits.ledger.length} movimentos`}
            </button>
          )}
        </div>
      )}

      {claiming && pack && (
        <PlateCreditDialog
          pack={pack}
          storeName={storeName}
          onClose={() => setClaiming(false)}
          onDone={() => {
            setClaiming(false)
            load()
          }}
        />
      )}
    </section>
  )
}
