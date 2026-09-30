import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Handshake, Wallet } from 'lucide-react'
import { fetchContractsForCustomer } from '../lib/contractsApi.js'
import { fetchFinancings } from '../lib/financingApi.js'
import { formatCurrencyCents, formatDateBR } from '../utils/carFormat.js'
import { summarizeFinancing, FINANCING_STATUS_LABELS } from '../utils/financing.js'
import CustomerDocuments from './CustomerDocuments.jsx'
import GeneratedContractsList from './GeneratedContractsList.jsx'
import '../components/ConfirmDialog.css'

function carLabel(car) {
  return `${car.brand} ${car.model}${car.plate ? ` · ${car.plate.toUpperCase()}` : ''}`
}

function soldDate(car, sale) {
  if (sale?.saleDate) return sale.saleDate
  return car.soldAt ? car.soldAt.slice(0, 10) : null
}

const FINANCING_PILL = { em_dia: 'is-success', em_atraso: 'is-danger', quitado: 'is-info', cancelado: '' }

// Ficha do cliente: compras, contratos e documentos anexados, contratos
// gerados pelo sistema e, para quem tem acesso, os financiamentos com a loja.
// purchases: carros comprados por ele; salesByCar/sellersById: quem vendeu.
export default function CustomerFileDialog({
  customer,
  purchases,
  salesByCar,
  sellersById,
  isAdmin,
  isStaff,
  canSeeSaleValues,
  canManageCustomerFinance,
  onClose,
}) {
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
      </div>
    </div>
  )
}
