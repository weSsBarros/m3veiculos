import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCcw, Search, PlusCircle, Percent, Eye, X } from 'lucide-react'
import { fetchFinancings } from '../lib/financingApi.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchSales } from '../lib/salesApi.js'
import { fetchCompanySettings, saveCustomerFinanceDefaults } from '../lib/companyApi.js'
import { formatCurrencyCents, formatDateBR, normalizePlate, todayISO } from '../utils/carFormat.js'
import { FINANCING_STATUS_LABELS, parsePercentBR, summarizeFinancing } from '../utils/financing.js'
import { useAuth } from '../context/AuthContext.jsx'
import FinanceTabs from './FinanceTabs.jsx'
import FinancingFormDialog from './FinancingFormDialog.jsx'
import FinancingDetailsDialog from './FinancingDetailsDialog.jsx'
import './admin.css'

const FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'em_atraso', label: 'Em atraso' },
  { value: 'em_dia', label: 'Em dia' },
  { value: 'quitado', label: 'Quitados' },
  { value: 'cancelado', label: 'Cancelados' },
]

const STATUS_PILL = { em_dia: 'is-success', em_atraso: 'is-danger', quitado: 'is-info', cancelado: '' }

// Padrão da loja para multa e juros das parcelas novas
function LateFeeSettingsDialog({ settings, onSaved, onClose }) {
  const [fee, setFee] = useState(String(settings.lateFeePercent).replace('.', ','))
  const [interest, setInterest] = useState(String(settings.lateInterestPercent).replace('.', ','))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const feeValue = parsePercentBR(fee)
    const interestValue = parsePercentBR(interest)
    if (feeValue == null || interestValue == null || feeValue < 0 || feeValue > 100 || interestValue < 0 || interestValue > 100) {
      setError('Informe percentuais entre 0 e 100.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveCustomerFinanceDefaults(feeValue, interestValue)
      onSaved({ lateFeePercent: feeValue, lateInterestPercent: interestValue })
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="confirm-dialog-overlay" onClick={saving ? undefined : onClose}>
      <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar" disabled={saving}>
          <X size={18} />
        </button>
        <h2>Multa e juros por atraso</h2>
        <p>Padrão da loja para os próximos financiamentos. Cada financiamento guarda as taxas com que foi feito (dá para mudar em Editar).</p>
        <label>
          Multa (%), cobrada uma vez
          <input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} autoFocus />
        </label>
        <label>
          Juros (% ao mês), proporcionais aos dias de atraso
          <input inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} />
        </label>
        <span className="sale-dialog-note">Na venda ao consumidor, o Código de Defesa do Consumidor limita a multa a 2%.</span>
        {error && <p className="admin-error">{error}</p>}
        <div className="confirm-dialog-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar padrão'}
          </button>
          <button type="button" className="btn btn-outline btn-block" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

// Financeiro dos clientes: financiamentos feitos direto com a loja (carnê),
// com parcelas, pagamentos, atrasos e saldo devedor de cada cliente.
export default function AdminCustomerFinance() {
  const { isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [financings, setFinancings] = useState([])
  const [customers, setCustomers] = useState([])
  const [cars, setCars] = useState([])
  const [sales, setSales] = useState([])
  const [settings, setSettings] = useState({ name: '', lateFeePercent: 2, lateInterestPercent: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(() => (FILTERS.some((f) => f.value === searchParams.get('filtro')) ? searchParams.get('filtro') : 'todos'))
  const [formOpen, setFormOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [financingsData, customersData, carsData, salesData, settingsData] = await Promise.all([
        fetchFinancings(),
        fetchAllCustomers(),
        fetchAllCarsAdmin(),
        fetchSales(),
        fetchCompanySettings(),
      ])
      setFinancings(financingsData)
      setCustomers(customersData)
      setCars(carsData)
      setSales(salesData)
      setSettings(settingsData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar o financeiro dos clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = todayISO()
  const customersById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])
  const salesByCar = useMemo(() => Object.fromEntries(sales.map((s) => [s.carId, s])), [sales])
  const soldCars = useMemo(
    () => cars.filter((c) => c.status === 'vendido').sort((a, b) => (b.soldAt || '').localeCompare(a.soldAt || '')),
    [cars]
  )

  const rows = useMemo(
    () => financings.map((financing) => ({ financing, summary: summarizeFinancing(financing, today) })),
    [financings, today]
  )

  const financedCarIds = useMemo(
    () => new Set(financings.filter((f) => f.carId && f.status === 'ativo').map((f) => f.carId)),
    [financings]
  )

  const totals = useMemo(() => {
    const monthPrefix = today.slice(0, 7)
    let open = 0
    let overdueCount = 0
    let overdueAmount = 0
    let receivedThisMonth = 0
    let active = 0
    for (const { financing, summary } of rows) {
      for (const inst of financing.installments) {
        if (inst.paidOn && inst.paidOn.startsWith(monthPrefix)) receivedThisMonth += inst.paidAmount || 0
      }
      if (summary.status === 'cancelado') continue
      open += summary.open
      overdueCount += summary.overdueCount
      overdueAmount += summary.overdueAmount
      if (summary.status === 'em_dia' || summary.status === 'em_atraso') active += 1
    }
    return { open, overdueCount, overdueAmount, receivedThisMonth, active }
  }, [rows, today])

  const counts = useMemo(() => {
    const result = { todos: rows.length }
    for (const f of FILTERS) if (f.value !== 'todos') result[f.value] = rows.filter((r) => r.summary.status === f.value).length
    return result
  }, [rows])

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const plateQuery = normalizePlate(query)
    return rows.filter(({ financing, summary }) => {
      if (filter !== 'todos' && summary.status !== filter) return false
      if (!query) return true
      const customer = financing.customerId ? customersById.get(financing.customerId) : null
      return (
        `${financing.customerName} ${financing.vehicleLabel} ${customer?.document || ''} ${customer?.phone || ''}`.toLowerCase().includes(query) ||
        (plateQuery.length >= 2 && normalizePlate(financing.vehiclePlate).includes(plateQuery))
      )
    })
  }, [rows, filter, search, customersById])

  function changeFilter(value) {
    setFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'todos') next.delete('filtro')
    else next.set('filtro', value)
    setSearchParams(next, { replace: true })
  }

  const detailId = searchParams.get('financiamento')
  const detail = detailId ? financings.find((f) => f.id === detailId) : null

  function openDetail(financing) {
    const next = new URLSearchParams(searchParams)
    next.set('financiamento', financing.id)
    setSearchParams(next)
  }

  function closeDetail() {
    const next = new URLSearchParams(searchParams)
    next.delete('financiamento')
    setSearchParams(next)
  }

  function applyFinancing(updated) {
    setFinancings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }

  if (loading) {
    return (
      <div className="admin-page">
        <FinanceTabs />
        <p className="admin-muted">Carregando…</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <FinanceTabs />
      <div className="admin-page-head">
        <div>
          <h1>Financeiro dos clientes</h1>
          <p>Clientes que financiaram direto com a loja: parcelas, pagamentos, atrasos e saldo devedor</p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <PlusCircle size={15} /> Novo financiamento
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setSettingsOpen(true)}>
            <Percent size={15} /> Multa e juros
          </button>
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>A receber (saldo em aberto)</span>
          <strong>{formatCurrencyCents(totals.open)}</strong>
        </div>
        <div className="expense-summary-card is-positive">
          <span>Recebido este mês</span>
          <strong>{formatCurrencyCents(totals.receivedThisMonth)}</strong>
        </div>
        <div className={`expense-summary-card ${totals.overdueCount ? 'is-negative' : ''}`}>
          <span>
            {totals.overdueCount} {totals.overdueCount === 1 ? 'parcela em atraso' : 'parcelas em atraso'} (com multa e juros)
          </span>
          <strong>{formatCurrencyCents(totals.overdueAmount)}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Financiamentos ativos</span>
          <strong>{totals.active}</strong>
        </div>
      </div>

      {financings.length > 0 && (
        <>
          <div className="admin-search-bar">
            <label className="admin-search-input">
              <Search size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente, CPF, telefone, veículo ou placa…"
              />
            </label>
          </div>
          <div className="admin-chip-row" role="radiogroup" aria-label="Filtrar financiamentos">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                className={`admin-chip ${filter === f.value ? 'is-active' : ''} ${f.value === 'em_atraso' && counts.em_atraso ? 'is-danger' : ''}`}
                onClick={() => changeFilter(f.value)}
              >
                {f.label} ({counts[f.value]})
              </button>
            ))}
          </div>
        </>
      )}

      {financings.length === 0 ? (
        <div className="admin-empty">
          <p>Nenhum financiamento cadastrado. Quando um cliente comprar parcelado direto com a loja, cadastre aqui para acompanhar as parcelas.</p>
          <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <PlusCircle size={15} /> Novo financiamento
          </button>
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="admin-muted">Nenhum financiamento encontrado.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Veículo</th>
                  <th>Financiado</th>
                  <th>Parcelas</th>
                  <th>Pago</th>
                  <th>Saldo</th>
                  <th>Próximo vencimento</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ financing, summary }) => (
                  <tr key={financing.id}>
                    <td className="admin-nowrap">
                      <strong>{financing.customerName}</strong>
                      <span className="admin-table-sub">{customersById.get(financing.customerId)?.phone || ''}</span>
                    </td>
                    <td>
                      <div>{financing.vehicleLabel || '—'}</div>
                      {financing.vehiclePlate && <span className="car-plate">{financing.vehiclePlate.toUpperCase()}</span>}
                    </td>
                    <td className="admin-nowrap">{formatCurrencyCents(financing.financedAmount)}</td>
                    <td className="admin-nowrap">
                      {summary.paidCount}/{summary.count} pagas
                      <span className="admin-table-sub">{financing.installmentsCount}x {formatCurrencyCents(financing.installmentAmount)}</span>
                    </td>
                    <td className="admin-nowrap">{formatCurrencyCents(summary.paid)}</td>
                    <td className="admin-nowrap">{formatCurrencyCents(summary.open)}</td>
                    <td className={`admin-nowrap ${summary.nextDue && summary.nextDue.dueDate < today && summary.status !== 'cancelado' ? 'expense-margin-negative' : ''}`}>
                      {summary.nextDue && summary.status !== 'cancelado' ? formatDateBR(summary.nextDue.dueDate) : '—'}
                    </td>
                    <td>
                      <span className={`admin-pill ${STATUS_PILL[summary.status]}`}>{FINANCING_STATUS_LABELS[summary.status]}</span>
                      {summary.overdueCount > 0 && summary.status !== 'cancelado' && (
                        <span className="admin-table-sub">
                          {summary.overdueCount} em atraso · {formatCurrencyCents(summary.overdueAmount)}
                        </span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="admin-action-btn" onClick={() => openDetail(financing)}>
                        <Eye size={15} /> Parcelas
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {visibleRows.map(({ financing, summary }) => (
              <div className="admin-card" key={financing.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{financing.customerName}</strong>
                    <span className="admin-table-sub">
                      {financing.vehicleLabel}
                      {financing.vehiclePlate ? ` · ${financing.vehiclePlate.toUpperCase()}` : ''}
                    </span>
                  </div>
                  <span className={`admin-pill ${STATUS_PILL[summary.status]}`}>{FINANCING_STATUS_LABELS[summary.status]}</span>
                </div>
                <div className="admin-card-stats">
                  <div>
                    <span>Parcelas</span>
                    <strong>{summary.paidCount}/{summary.count}</strong>
                  </div>
                  <div>
                    <span>Saldo</span>
                    <strong>{formatCurrencyCents(summary.open)}</strong>
                  </div>
                  <div>
                    <span>Próximo venc.</span>
                    <strong>{summary.nextDue && summary.status !== 'cancelado' ? formatDateBR(summary.nextDue.dueDate) : '—'}</strong>
                  </div>
                </div>
                <div className="admin-card-actions">
                  <button type="button" onClick={() => openDetail(financing)}>
                    <Eye size={14} /> Parcelas
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {formOpen && (
        <FinancingFormDialog
          soldCars={soldCars}
          salesByCar={salesByCar}
          financedCarIds={financedCarIds}
          customers={customers}
          onCustomerCreated={(created) => setCustomers((prev) => [...prev, created].sort((x, y) => x.name.localeCompare(y.name)))}
          defaults={settings}
          onCreated={(created) => {
            setFinancings((prev) => [created, ...prev])
            setFormOpen(false)
            openDetail(created)
          }}
          onClose={() => setFormOpen(false)}
        />
      )}

      {detail && (
        <FinancingDetailsDialog
          financing={detail}
          customer={detail.customerId ? customersById.get(detail.customerId) : null}
          companyName={settings.name}
          isAdmin={isAdmin}
          onChanged={applyFinancing}
          onDeleted={(id) => {
            setFinancings((prev) => prev.filter((f) => f.id !== id))
            closeDetail()
          }}
          onClose={closeDetail}
        />
      )}

      {settingsOpen && (
        <LateFeeSettingsDialog
          settings={settings}
          onSaved={(values) => {
            setSettings((prev) => ({ ...prev, ...values }))
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
