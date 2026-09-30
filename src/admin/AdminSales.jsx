import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCcw, Search, ListChecks, Eye, Handshake, XCircle } from 'lucide-react'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchSales, effectiveSaleDate } from '../lib/salesApi.js'
import { fetchReservations, closeReservation, reservationAlert } from '../lib/reservationsApi.js'
import { registerSaleFromDialog } from '../lib/saleFlow.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchContractsAdmin } from '../lib/contractsApi.js'
import { fetchCustomerDocuments } from '../lib/customerDocumentsApi.js'
import { fetchCompanySettings } from '../lib/companyApi.js'
import { formatCurrency, formatCurrencyCents, formatDateBR, matchesCarSearch } from '../utils/carFormat.js'
import { describePayment, DEFAULT_BANKS } from '../utils/payment.js'
import useConfirm from '../components/useConfirm.jsx'
import { periodRange, inRange } from '../utils/period.js'
import { DEFAULT_SALE_CHECKLIST, checklistSummary } from '../utils/saleChecklist.js'
import { isTransferOpen, transferAlert } from '../utils/transfer.js'
import { downloadDeliveryTerm } from '../utils/deliveryTerm.js'
import { useAuth } from '../context/AuthContext.jsx'
import PeriodFilter from './PeriodFilter.jsx'
import SaleDialog from './SaleDialog.jsx'
import SaleDetailsDialog from './SaleDetailsDialog.jsx'
import ChecklistSettingsDialog from './ChecklistSettingsDialog.jsx'
import TransferPill from './TransferPill.jsx'
import './admin.css'

const FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendentes', label: 'Transferência pendente' },
  { value: 'atrasadas', label: 'Transferência atrasada' },
  { value: 'concluidas', label: 'Transferência concluída' },
  { value: 'nao_informadas', label: 'Não informada' },
]

function matchesFilter(row, filter) {
  if (filter === 'pendentes') return isTransferOpen(row.sale)
  if (filter === 'atrasadas') return row.alert === 'atrasada'
  if (filter === 'concluidas') return row.sale?.transferStatus === 'concluida'
  if (filter === 'nao_informadas') return !row.sale || row.sale.transferStatus === 'nao_informada'
  return true
}

function DocsCount({ count }) {
  if (!count) return <span className="admin-muted-cell">—</span>
  return <span>{count} {count === 1 ? 'documento' : 'documentos'}</span>
}

function ChecklistCount({ sale }) {
  if (!sale || sale.checklist.length === 0) return null
  const { total, pending } = checklistSummary(sale.checklist)
  return (
    <span className={`admin-table-sub ${pending ? 'stock-days-stale' : ''}`}>
      Checklist {total - pending}/{total}
    </span>
  )
}

// Vendas: busca por comprador, carro ou placa para saber quando e por quem
// cada venda foi feita, com a transferência do veículo, o checklist de
// entrega, os contratos e documentos de cada venda e as reservas ativas.
// O vendedor vê só as vendas e reservas dele, sem editar.
export default function AdminSales() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin, isStaff, isSeller, canSeeSaleValues } = useAuth()
  // O vendedor vê os valores das vendas dele
  const showValues = canSeeSaleValues || isSeller
  const [searchParams, setSearchParams] = useSearchParams()
  const [cars, setCars] = useState([])
  const [sales, setSales] = useState([])
  const [sellers, setSellers] = useState([])
  const [customers, setCustomers] = useState([])
  const [contracts, setContracts] = useState([])
  const [docs, setDocs] = useState([])
  const [checklistItems, setChecklistItems] = useState(DEFAULT_SALE_CHECKLIST)
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(() => (FILTERS.some((f) => f.value === searchParams.get('filtro')) ? searchParams.get('filtro') : 'todas'))
  const [period, setPeriod] = useState('tudo')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [saleDialogCar, setSaleDialogCar] = useState(null)
  const [savingSale, setSavingSale] = useState(false)
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false)
  const [reservations, setReservations] = useState([])
  const [banks, setBanks] = useState(DEFAULT_BANKS)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, salesData, sellersData, customersData, contractsData, docsData, settings, reservationsData] = await Promise.all([
        fetchAllCarsAdmin(),
        fetchSales(),
        fetchSellers(),
        fetchAllCustomers(),
        fetchContractsAdmin(),
        // Se a parte nova do banco ainda não foi instalada, a tela funciona sem os anexos
        fetchCustomerDocuments().catch(() => []),
        fetchCompanySettings(),
        fetchReservations().catch(() => []),
      ])
      setCars(carsData)
      setSales(salesData)
      setSellers(sellersData)
      setCustomers(customersData)
      setContracts(contractsData)
      setDocs(docsData)
      setChecklistItems(settings.saleChecklist)
      setBanks(settings.bankList)
      setCompanyName(settings.name)
      setReservations(reservationsData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar as vendas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    const salesByCar = new Map(sales.map((s) => [s.carId, s]))
    const customersById = new Map(customers.map((c) => [c.id, c]))
    const sellersById = new Map(sellers.map((s) => [s.id, s]))
    const docsByCar = {}
    for (const c of contracts) if (c.carId) docsByCar[c.carId] = (docsByCar[c.carId] || 0) + 1
    for (const d of docs) if (d.carId) docsByCar[d.carId] = (docsByCar[d.carId] || 0) + 1
    return cars
      // O vendedor só enxerga a venda quando ela é dele
      .filter((car) => car.status === 'vendido' && (isStaff || salesByCar.has(car.id)))
      .map((car) => {
        const sale = salesByCar.get(car.id) || null
        const sellerName = sale
          ? sale.sellerId
            ? sellersById.get(sale.sellerId)?.name || 'Vendedor removido'
            : 'Venda direta (loja)'
          : 'Não registrado'
        return {
          car,
          sale,
          customer: car.customerId ? customersById.get(car.customerId) || null : null,
          sellerName,
          date: effectiveSaleDate(car, sale),
          price: sale ? sale.salePrice : car.price,
          alert: transferAlert(sale),
          docsCount: docsByCar[car.id] || 0,
        }
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [cars, sales, sellers, customers, contracts, docs, isStaff])

  const reservationRows = useMemo(() => {
    const carsById = new Map(cars.map((c) => [c.id, c]))
    const sellersById = new Map(sellers.map((s) => [s.id, s]))
    return reservations
      .filter((r) => r.status === 'ativa')
      .map((r) => ({
        reservation: r,
        car: carsById.get(r.carId) || null,
        sellerName: r.sellerId ? sellersById.get(r.sellerId)?.name || '—' : 'Loja',
        alert: reservationAlert(r),
      }))
      .filter((row) => row.car)
  }, [reservations, cars, sellers])

  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd])

  const periodRows = useMemo(() => rows.filter((r) => inRange(r.date, range)), [rows, range])

  const counts = useMemo(() => {
    const result = {}
    for (const f of FILTERS) result[f.value] = periodRows.filter((r) => matchesFilter(r, f.value)).length
    return result
  }, [periodRows])

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    // CPF só quando o texto digitado é um número (senão "KWD4C56" acharia CPFs com "456")
    const digits = /^[\d.\-/\s]+$/.test(query) ? query.replace(/\D/g, '') : ''
    return periodRows.filter((row) => {
      if (!matchesFilter(row, filter)) return false
      if (!query) return true
      const c = row.customer
      return (
        matchesCarSearch(row.car, query) ||
        (c && `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(query)) ||
        (c && digits.length >= 3 && c.document.replace(/\D/g, '').includes(digits)) ||
        row.sellerName.toLowerCase().includes(query)
      )
    })
  }, [periodRows, filter, search])

  function changeFilter(value) {
    setFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'todas') next.delete('filtro')
    else next.set('filtro', value)
    setSearchParams(next, { replace: true })
  }

  const detailCarId = searchParams.get('carro')
  const detailRow = detailCarId ? rows.find((r) => r.car.id === detailCarId) : null

  function openDetails(row) {
    const next = new URLSearchParams(searchParams)
    next.set('carro', row.car.id)
    setSearchParams(next)
  }

  function closeDetails() {
    const next = new URLSearchParams(searchParams)
    next.delete('carro')
    setSearchParams(next)
  }

  function applySale(saved) {
    setSales((prev) => [...prev.filter((s) => s.carId !== saved.carId), saved])
  }

  async function confirmSale(data) {
    const car = saleDialogCar
    const reservation = reservations.find((r) => r.carId === car.id && r.status === 'ativa') || null
    const { customerId, checklist, generateTerm } = data
    setSavingSale(true)
    let soldCar = car
    let saved
    try {
      const result = await registerSaleFromDialog(car, data, { reservation })
      soldCar = result.car
      saved = result.sale
      setCars((prev) => prev.map((c) => (c.id === car.id ? soldCar : c)))
      applySale(saved)
      if (reservation) setReservations((prev) => prev.filter((r) => r.id !== reservation.id))
      setSaleDialogCar(null)
      if (result.tradeInCarId) fetchAllCarsAdmin().then(setCars).catch(() => {})
    } catch (err) {
      alert('Não foi possível salvar a venda: ' + err.message)
      return
    } finally {
      setSavingSale(false)
    }
    if (generateTerm) {
      const customer = customers.find((c) => c.id === customerId) || null
      downloadDeliveryTerm({ car: soldCar, customer, sale: saved, checklist, companyName }).catch((err) =>
        alert('A venda foi salva, mas o termo de entrega não foi gerado: ' + err.message)
      )
    }
  }

  async function cancelReservation(row) {
    const { reservation, car } = row
    if (!(await confirm(`Cancelar a reserva de ${car.brand} ${car.model}${reservation.customerName ? ` para ${reservation.customerName}` : ''}? O carro volta a ficar disponível no site. O sinal recebido, se houver, precisa ser tratado com o cliente.`, {
      title: 'Cancelar reserva',
      confirmLabel: 'Cancelar reserva',
      cancelLabel: 'Manter',
    }))) return
    try {
      await closeReservation(reservation.id, 'cancelada')
      setReservations((prev) => prev.filter((r) => r.id !== reservation.id))
      setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, status: 'disponivel' } : c)))
    } catch (err) {
      alert('Não foi possível cancelar a reserva: ' + err.message)
    }
  }

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Vendas</h1>
          <p>Quem comprou, quando e por quem cada carro foi vendido, transferência, checklist e contratos</p>
        </div>
        <div className="admin-row-actions">
          <PeriodFilter
            period={period}
            onPeriodChange={setPeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
          {isStaff && (
            <button type="button" className="btn btn-outline" onClick={() => setChecklistDialogOpen(true)}>
              <ListChecks size={15} /> Itens do checklist
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {reservationRows.length > 0 && (
        <section className="admin-form-section">
          <h2>Reservas ativas ({reservationRows.length})</h2>
          <div className="admin-table-wrap admin-table-wrap-always">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Carro</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  {showValues && <th>Sinal</th>}
                  <th>Reservado até</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reservationRows.map((row) => (
                  <tr key={row.reservation.id}>
                    <td>
                      <strong>{row.car.brand} {row.car.model}</strong>
                      <span className="admin-table-sub">{row.car.version}{row.car.plate ? ` · ${row.car.plate.toUpperCase()}` : ''}</span>
                    </td>
                    <td>{row.reservation.customerName || '—'}</td>
                    <td>{row.sellerName}</td>
                    {showValues && <td>{row.reservation.depositAmount != null ? formatCurrencyCents(row.reservation.depositAmount) : '—'}</td>}
                    <td>
                      {row.reservation.reservedUntil ? formatDateBR(row.reservation.reservedUntil) : '—'}
                      {row.alert === 'vencida' && <span className="state-pill tone-danger">Vencida</span>}
                      {row.alert === 'vence_logo' && <span className="state-pill tone-warn">Vence logo</span>}
                    </td>
                    <td>
                      {isStaff && (
                        <div className="admin-action-group">
                          <button type="button" className="admin-action-btn" onClick={() => setSaleDialogCar(row.car)}>
                            <Handshake size={15} /> Converter em venda
                          </button>
                          <button type="button" className="admin-action-btn admin-action-danger" onClick={() => cancelReservation(row)}>
                            <XCircle size={15} /> Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="admin-search-bar">
        <label className="admin-search-input">
          <Search size={15} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por comprador, CPF, carro, placa ou vendedor…"
          />
        </label>
      </div>

      <div className="admin-chip-row" role="radiogroup" aria-label="Filtrar vendas">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            className={`admin-chip ${filter === f.value ? 'is-active' : ''} ${f.value === 'atrasadas' && counts.atrasadas ? 'is-danger' : ''}`}
            onClick={() => changeFilter(f.value)}
          >
            {f.label} ({counts[f.value]})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="admin-muted">Nenhum carro vendido ainda.</p>
      ) : visibleRows.length === 0 ? (
        <p className="admin-muted">Nenhuma venda encontrada.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vendido em</th>
                  <th>Carro</th>
                  <th>Comprador</th>
                  <th>Vendido por</th>
                  {showValues && <th>Valor</th>}
                  <th>Transferência</th>
                  <th>Documentos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.car.id}>
                    <td className="admin-nowrap">{row.date ? formatDateBR(row.date) : '—'}</td>
                    <td>
                      <strong>{row.car.brand} {row.car.model}</strong>
                      <span className="admin-table-sub">{row.car.version} · {row.car.modelYear}</span>
                      {row.car.plate && <span className="car-plate">{row.car.plate.toUpperCase()}</span>}
                    </td>
                    <td>
                      {row.customer ? (
                        <>
                          <strong>{row.customer.name}</strong>
                          <span className="admin-table-sub">{row.customer.phone || row.customer.document || ''}</span>
                        </>
                      ) : (
                        <span className="admin-muted-cell">Não vinculado</span>
                      )}
                    </td>
                    <td>
                      {row.sellerName}
                      {row.sale?.paymentMethod && <span className="admin-table-sub">{describePayment(row.sale)}</span>}
                    </td>
                    {showValues && <td className="admin-nowrap">{row.price != null ? formatCurrency(row.price) : '—'}</td>}
                    <td>
                      <TransferPill sale={row.sale} />
                      <ChecklistCount sale={row.sale} />
                    </td>
                    <td><DocsCount count={row.docsCount} /></td>
                    <td>
                      <button type="button" className="admin-action-btn" onClick={() => openDetails(row)}>
                        <Eye size={15} /> Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {visibleRows.map((row) => (
              <div className="admin-card" key={row.car.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{row.car.brand} {row.car.model}</strong>
                    <span className="admin-table-sub">
                      {row.car.version}
                      {row.car.plate && <> · <span className="car-plate">{row.car.plate.toUpperCase()}</span></>}
                    </span>
                    <span className="admin-card-meta">
                      {row.date ? formatDateBR(row.date) : '—'} · {row.sellerName}
                      {showValues && row.price != null ? ` · ${formatCurrency(row.price)}` : ''}
                    </span>
                    <span className="admin-card-meta">Comprador: {row.customer?.name || 'não vinculado'}</span>
                  </div>
                </div>
                <TransferPill sale={row.sale} />
                <div className="admin-card-actions">
                  <button type="button" onClick={() => openDetails(row)}>
                    <Eye size={14} /> Detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {detailRow && (
        <SaleDetailsDialog
          key={detailRow.car.id}
          row={detailRow}
          contracts={contracts.filter((c) => c.carId === detailRow.car.id)}
          checklistItems={checklistItems}
          companyName={companyName}
          isAdmin={isAdmin}
          canSeeSaleValues={showValues}
          canEdit={isStaff}
          onSaleUpdated={applySale}
          onEditSale={(car) => setSaleDialogCar(car)}
          onClose={closeDetails}
        />
      )}

      {saleDialogCar && (
        <SaleDialog
          car={saleDialogCar}
          sellers={sellers}
          customers={customers}
          onCustomerCreated={(created) => setCustomers((prev) => [...prev, created].sort((x, y) => x.name.localeCompare(y.name)))}
          showCommission={canSeeSaleValues}
          initialSale={sales.find((s) => s.carId === saleDialogCar.id)}
          checklistItems={checklistItems}
          banks={banks}
          saving={savingSale}
          onConfirm={confirmSale}
          onClose={() => setSaleDialogCar(null)}
        />
      )}

      {checklistDialogOpen && (
        <ChecklistSettingsDialog
          items={checklistItems}
          onSaved={(items) => {
            setChecklistItems(items)
            setChecklistDialogOpen(false)
          }}
          onClose={() => setChecklistDialogOpen(false)}
        />
      )}
      {confirmDialog}
    </div>
  )
}
