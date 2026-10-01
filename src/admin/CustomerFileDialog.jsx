import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Handshake, Wallet, FolderOpen, Sparkles, MessageCircle } from 'lucide-react'
import { fetchContractsForCustomer } from '../lib/contractsApi.js'
import { fetchFinancings } from '../lib/financingApi.js'
import { formatCurrencyCents, formatDateBR } from '../utils/carFormat.js'
import { summarizeFinancing, FINANCING_STATUS_LABELS } from '../utils/financing.js'
import CustomerDocuments from './CustomerDocuments.jsx'
import GeneratedContractsList from './GeneratedContractsList.jsx'
import CustomerInterests from './CustomerInterests.jsx'
import CustomerContacts from './CustomerContacts.jsx'
import { paymentIntentLabel } from '../utils/customerInterests.js'
import '../components/ConfirmDialog.css'

function carLabel(car) {
  return `${car.brand} ${car.model}${car.plate ? ` · ${car.plate.toUpperCase()}` : ''}`
}

function soldDate(car, sale) {
  if (sale?.saleDate) return sale.saleDate
  return car.soldAt ? car.soldAt.slice(0, 10) : null
}

const FINANCING_PILL = { em_dia: 'is-success', em_atraso: 'is-danger', quitado: 'is-info', cancelado: '' }

const TABS = [
  { key: 'ficha', label: 'Ficha', icon: FolderOpen },
  { key: 'interesses', label: 'Interesses', icon: Sparkles },
  { key: 'atendimento', label: 'Atendimento', icon: MessageCircle },
]

const money = (v) => (v == null || v === '' ? '' : formatCurrencyCents(Number(v)))

// Ficha do cliente, em abas:
// - Ficha: negociação (responsável, troca, forma de pagamento), compras,
//   contratos e documentos e, para quem tem acesso, os financiamentos;
// - Interesses: carros de que ele gostou e o que ele procura;
// - Atendimento: "Chamar no WhatsApp", histórico e retornos.
// purchases: carros comprados por ele; salesByCar/sellersById: quem vendeu;
// cars: estoque inteiro; teamById: nomes da equipe; initialTab: aba inicial.
export default function CustomerFileDialog({
  customer,
  purchases,
  salesByCar,
  sellersById,
  cars = [],
  teamById = {},
  initialTab = 'ficha',
  isAdmin,
  isStaff,
  canSeeSaleValues,
  canManageCustomerFinance,
  onChanged,
  onClose,
}) {
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : 'ficha')
  // "Avisar no WhatsApp" nos interesses: abre o atendimento com o carro
  const [preset, setPreset] = useState(null)
  const [contracts, setContracts] = useState([])
  const [contractsLoading, setContractsLoading] = useState(true)
  const [financings, setFinancings] = useState([])

  useEffect(() => {
    let cancelled = false
    fetchContractsForCustomer(customer.id)
      .then((data) => !cancelled && setContracts(data))
      .catch(() => !cancelled && setContracts([]))
      .finally(() => !cancelled && setContractsLoading(false))
    if (canManageCustomerFinance) {
      fetchFinancings({ customerId: customer.id })
        .then((data) => !cancelled && setFinancings(data))
        .catch(() => !cancelled && setFinancings([]))
    }
    return () => {
      cancelled = true
    }
  }, [customer.id, canManageCustomerFinance])

  const carOptions = purchases.map((car) => ({ id: car.id, label: carLabel(car) }))
  const tradeIn = customer.tradeIn || {}
  const intent = customer.paymentIntent || {}
  const hasNegotiation = customer.responsibleSellerId || Object.keys(tradeIn).length || Object.keys(intent).length

  function notify(car, match) {
    setPreset({ car, match })
    setTab('atendimento')
  }

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog admin-dialog-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Ficha de ${customer.name}`}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <div>
          <h2>{customer.name}</h2>
          <p className="admin-table-sub">
            {[customer.document && `CPF ${customer.document}`, customer.phone, customer.email].filter(Boolean).join(' · ') || 'Sem documento ou contato cadastrado'}
          </p>
          {customer.address && <p className="admin-table-sub">{customer.address}</p>}
        </div>

        <div className="crm-tabs" role="tablist" aria-label="Seções da ficha">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === 'interesses' && <CustomerInterests customer={customer} cars={cars} onNotify={notify} onChanged={onChanged} />}

        {tab === 'atendimento' && (
          <CustomerContacts key={preset ? `${preset.car.id}-${preset.match?.id || ''}` : 'normal'} customer={customer} cars={cars} preset={preset} onChanged={onChanged} />
        )}

        {tab === 'ficha' && (
        <>
        <section className="admin-dialog-section">
          <h3>Negociação</h3>
          {!hasNegotiation ? (
            <p className="admin-muted">Sem vendedor responsável, carro para a troca ou forma de pagamento. Preencha em Editar.</p>
          ) : (
            <dl className="crm-facts">
              {customer.responsibleSellerId && (
                <>
                  <dt>Vendedor responsável</dt>
                  <dd>{teamById[customer.responsibleSellerId]?.name || 'Vendedor removido'}</dd>
                </>
              )}
              {Object.keys(tradeIn).length > 0 && (
                <>
                  <dt>Carro para a troca</dt>
                  <dd>
                    {[tradeIn.model, tradeIn.year, tradeIn.km && `${Number(tradeIn.km).toLocaleString('pt-BR')} km`, tradeIn.expectedValue && `espera ${money(tradeIn.expectedValue)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </>
              )}
              {Object.keys(intent).length > 0 && (
                <>
                  <dt>Como pretende pagar</dt>
                  <dd>
                    {[paymentIntentLabel(intent.method), intent.downPayment && `entrada de ${money(intent.downPayment)}`, intent.maxInstallment && `parcela de até ${money(intent.maxInstallment)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </>
              )}
            </dl>
          )}
        </section>

        <section className="admin-dialog-section">
          <h3>Compras</h3>
          {purchases.length === 0 ? (
            <p className="admin-muted">Nenhum carro vinculado a este cliente.</p>
          ) : (
            <ul className="doc-list">
              {purchases.map((car) => {
                const sale = salesByCar[car.id]
                const date = soldDate(car, sale)
                const sellerName = sale ? (sale.sellerId ? sellersById[sale.sellerId]?.name || 'Vendedor removido' : 'Venda direta') : ''
                return (
                  <li key={car.id}>
                    <div className="doc-list-main">
                      <strong>{car.brand} {car.model} {car.version}</strong>
                      <span className="admin-table-sub">
                        {[car.plate && car.plate.toUpperCase(), car.modelYear, date && `vendido em ${formatDateBR(date)}`, sellerName && `por ${sellerName}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    {isStaff && car.status === 'vendido' && (
                      <div className="doc-list-actions">
                        <Link to={`/admin/vendas?carro=${car.id}`} className="admin-action-btn">
                          <Handshake size={14} /> Detalhes da venda
                        </Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="admin-dialog-section">
          <h3>Contratos e documentos anexados</h3>
          <p className="admin-form-hint">
            Anexe quantos precisar: contrato de compra, termo de entrega, pós-venda, garantia etc. (PDF ou foto do documento assinado).
          </p>
          <CustomerDocuments customerId={customer.id} cars={carOptions} canDelete={isAdmin} />
        </section>

        <section className="admin-dialog-section">
          <h3>Contratos gerados pelo sistema</h3>
          {contractsLoading ? (
            <p className="admin-muted">Carregando…</p>
          ) : (
            <GeneratedContractsList contracts={contracts} showVehicle showValue={isStaff ? canSeeSaleValues : true} />
          )}
        </section>

        {canManageCustomerFinance && financings.length > 0 && (
          <section className="admin-dialog-section">
            <h3>Financiamentos com a loja</h3>
            <ul className="doc-list">
              {financings.map((f) => {
                const summary = summarizeFinancing(f)
                return (
                  <li key={f.id}>
                    <div className="doc-list-main">
                      <span className={`admin-pill ${FINANCING_PILL[summary.status]}`}>{FINANCING_STATUS_LABELS[summary.status]}</span>
                      <strong>{f.vehicleLabel || 'Financiamento'}</strong>
                      <span className="admin-table-sub">
                        {summary.paidCount}/{summary.count} parcelas pagas · saldo {formatCurrencyCents(summary.open)}
                        {summary.nextDue && summary.status !== 'cancelado' ? ` · próximo vencimento ${formatDateBR(summary.nextDue.dueDate)}` : ''}
                      </span>
                    </div>
                    <div className="doc-list-actions">
                      <Link to={`/admin/financeiro/clientes?financiamento=${f.id}`} className="admin-action-btn">
                        <Wallet size={14} /> Ver parcelas
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        </>
        )}
      </div>
    </div>
  )
}
