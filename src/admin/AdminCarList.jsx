import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, RefreshCcw, Receipt, Star, Eye, EyeOff, Search, Handshake, LayoutGrid, List, ExternalLink, BellRing, Bookmark, ListChecks } from 'lucide-react'
import { fetchAllCarsAdmin, updateCarStatus, updateCarFeatured, updateCarHidden, deleteCar } from '../lib/carsApi.js'
import { registerSaleFromDialog } from '../lib/saleFlow.js'
import { fetchReservations, reserveCar, closeReservation } from '../lib/reservationsApi.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchCarViewTotals, formatViews } from '../lib/statsApi.js'
import { thumbUrl } from '../utils/carPhotos.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { fetchSales, deleteSaleForCar } from '../lib/salesApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { formatCurrency, CATEGORIES, daysInStock, isStockStale, stockAlertThreshold, matchesCarSearch, formatDateBR } from '../utils/carFormat.js'
import { DEFAULT_BANKS } from '../utils/payment.js'
import { applyStockAlertToAll, fetchCompanySettings, DEFAULT_STOCK_ALERT_DAYS } from '../lib/companyApi.js'
import { DEFAULT_SALE_CHECKLIST } from '../utils/saleChecklist.js'
import { downloadDeliveryTerm } from '../utils/deliveryTerm.js'
import { useAuth } from '../context/AuthContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import SaleDialog from './SaleDialog.jsx'
import ReserveDialog from './ReserveDialog.jsx'
import ChecklistSettingsDialog from './ChecklistSettingsDialog.jsx'
import StatusMenu from './StatusMenu.jsx'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'

// Botões de ação com ícone + nome, iguais na tabela (desktop) e nos cards (celular)
function RowActions({ car, busy, canDelete, canSeeCosts, canEditSales, onToggleFeatured, onToggleHidden, onDelete, onEditSale }) {
  return (
    <div className="admin-action-group">
      {car.status === 'vendido' && canEditSales && (
        <button type="button" className="admin-action-btn" onClick={() => onEditSale(car)} disabled={busy}>
          <Handshake size={15} /> Venda
        </button>
      )}
      <button
        type="button"
        className={`admin-action-btn ${car.featured ? 'is-featured' : ''}`}
        onClick={() => onToggleFeatured(car)}
        disabled={busy}
        title={car.featured ? 'Remover dos destaques da página inicial' : 'Mostrar nos destaques da página inicial'}
      >
        <Star size={15} fill={car.featured ? 'currentColor' : 'none'} /> {car.featured ? 'Destaque' : 'Destacar'}
      </button>
      <button
        type="button"
        className={`admin-action-btn ${car.hidden ? 'is-hidden-toggle' : ''}`}
        onClick={() => onToggleHidden(car)}
        disabled={busy}
        title={car.hidden ? 'Voltar a mostrar no site' : 'Esconder do site'}
      >
        {car.hidden ? <EyeOff size={15} /> : <Eye size={15} />} {car.hidden ? 'Mostrar' : 'Ocultar'}
      </button>
      <Link to={`/admin/carros/${car.id}/gastos`} className="admin-action-btn">
        <Receipt size={15} /> {canSeeCosts ? 'Gastos' : 'Lançar gasto'}
      </Link>
      <Link to={`/admin/carros/${car.id}`} className="admin-action-btn">
        <Pencil size={15} /> Editar
      </Link>
      {car.hidden ? (
        <span className="admin-action-btn is-disabled" title="Carro oculto no site: o anúncio não está publicado">
          <ExternalLink size={15} /> Anúncio
        </span>
      ) : (
        <a href={`/carro/${car.slug}`} target="_blank" rel="noreferrer" className="admin-action-btn" title="Abrir o anúncio no site">
          <ExternalLink size={15} /> Anúncio
        </a>
      )}
      {canDelete && (
        <button type="button" className="admin-action-btn admin-action-danger" onClick={() => onDelete(car)} disabled={busy}>
          <Trash2 size={15} /> Excluir
        </button>
      )}
    </div>
  )
}

const VIEW_KEY = 'admin_stock_view'

const SELLER_LOCK = 'Só o administrador ou o gerente mudam o status de um carro vendido ou reservado'

function statusLock(car, canEditSales) {
  return !canEditSales && (car.status === 'vendido' || car.status === 'reservado') ? SELLER_LOCK : ''
}

// "Reservado para Fulano até 10/10"
function ReservationLine({ reservation, className }) {
  if (!reservation) return null
  return (
    <span className={className}>
      <Bookmark size={12} /> Reservado{reservation.customerName ? ` para ${reservation.customerName}` : ''}
      {reservation.reservedUntil ? ` até ${formatDateBR(reservation.reservedUntil)}` : ''}
    </span>
  )
}

function soldLabel(sale, sellerName, canEditSales) {
  if (sale) return `Vendedor: ${sellerName || 'venda direta'}`
  // O vendedor só enxerga as vendas dele: nas dos outros não mostra nada
  return canEditSales ? 'Vendedor: não registrado' : ''
}

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'tabela' ? 'tabela' : 'cards'
  } catch {
    return 'cards'
  }
}

function StockCard({ row, busy, alertDefault, canDelete, canSeeCosts, canSeeSaleValues, canEditSales, onChangeStatus, onToggleFeatured, onToggleHidden, onDelete, onEditSale }) {
  const { car, totalCost, margin, sale, sellerName, views, reservation } = row
  const days = daysInStock(car)
  const stale = isStockStale(car, alertDefault)
  const hasCost = Boolean(car.purchasePrice)
  const marginClass = hasCost && margin != null ? (margin < 0 ? 'is-negative' : 'is-positive') : ''
  const showSale = Boolean(sale) && canSeeSaleValues

  return (
    <article className={`stock-card ${car.hidden ? 'is-hidden-row' : ''} ${busy ? 'is-busy' : ''}`}>
      <div className="stock-card-photo">
        {car.images[0] ? <img src={thumbUrl(car.images[0])} alt="" loading="lazy" /> : <span>Sem foto</span>}
        <div className="stock-card-badges">
          {car.featured && <span className="stock-card-badge is-featured"><Star size={12} fill="currentColor" /> Destaque</span>}
          {car.hidden && <span className="stock-card-badge is-hidden"><EyeOff size={12} /> Oculto no site</span>}
        </div>
        <span
          className={`stock-card-days ${stale ? 'is-stale' : ''}`}
          title={car.status === 'vendido' ? undefined : `Aviso em vermelho a partir de ${stockAlertThreshold(car, alertDefault)} dias`}
        >
          {car.status === 'vendido' ? 'Vendido' : `${days} ${days === 1 ? 'dia' : 'dias'} em estoque`}
        </span>
      </div>

      <div className="stock-card-body">
        <div className="stock-card-title">
          <strong>{car.brand} {car.model}</strong>
          <span>{car.version} · {car.modelYear}</span>
          <span><span className="admin-table-capitalize">{car.category}</span> · {car.km.toLocaleString('pt-BR')} km</span>
          {car.plate && <span className="car-plate">{car.plate.toUpperCase()}</span>}
          <span className="stock-card-views" title="Visualizações da página do carro no site (desde que o contador foi ativado)">
            <Eye size={13} /> {formatViews(views)}
          </span>
        </div>

        <div className="stock-card-price">
          <span>{showSale ? 'Valor da venda' : 'Preço'}</span>
          <strong>{showSale ? formatCurrency(sale.salePrice) : car.price != null ? formatCurrency(car.price) : 'Consulte o valor'}</strong>
        </div>

        {canSeeCosts && (
          <div className="stock-card-stats">
            <div>
              <span>Custo total</span>
              <strong>{hasCost ? formatCurrency(totalCost) : '—'}</strong>
            </div>
            <div className={marginClass}>
              <span>Margem</span>
              <strong>{hasCost && margin != null ? formatCurrency(margin) : '—'}</strong>
            </div>
          </div>
        )}

        {car.status === 'vendido' && soldLabel(sale, sellerName, canEditSales) && (
          <span className="stock-card-seller">{soldLabel(sale, sellerName, canEditSales)}</span>
        )}
        <ReservationLine reservation={reservation} className="stock-card-seller" />

        <StatusMenu
          value={car.status}
          onChange={(next) => onChangeStatus(car, next)}
          disabled={busy}
          lockedReason={statusLock(car, canEditSales)}
        />

        <RowActions
          car={car}
          busy={busy}
          canDelete={canDelete}
          canSeeCosts={canSeeCosts}
          canEditSales={canEditSales}
          onToggleFeatured={onToggleFeatured}
          onToggleHidden={onToggleHidden}
          onDelete={onDelete}
          onEditSale={onEditSale}
        />
      </div>
    </article>
  )
}

function CarGroup({ title, rows, busyId, view, alertDefault, canDelete, canSeeCosts, canSeeSaleValues, canEditSales, onChangeStatus, onToggleFeatured, onToggleHidden, onDelete, onEditSale, emptyLabel }) {
  if (rows.length === 0) {
    return (
      <section className="admin-car-group">
        <h2 className="admin-section-title">{title} (0)</h2>
        <p className="admin-muted">{emptyLabel}</p>
      </section>
    )
  }

  if (view === 'cards') {
    return (
      <section className="admin-car-group">
        <h2 className="admin-section-title">{title} ({rows.length})</h2>
        <div className="stock-card-grid">
          {rows.map((row) => (
            <StockCard
              key={row.car.id}
              row={row}
              busy={busyId === row.car.id}
              alertDefault={alertDefault}
              canDelete={canDelete}
              canSeeCosts={canSeeCosts}
              canSeeSaleValues={canSeeSaleValues}
              canEditSales={canEditSales}
              onChangeStatus={onChangeStatus}
              onToggleFeatured={onToggleFeatured}
              onToggleHidden={onToggleHidden}
              onDelete={onDelete}
              onEditSale={onEditSale}
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="admin-car-group">
      <h2 className="admin-section-title">{title} ({rows.length})</h2>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Carro</th>
              <th>Km</th>
              <th>Estoque</th>
              <th title="Visualizações da página do carro no site">Visualizações</th>
              <th>Preço</th>
              {canSeeCosts && <th>Custo total</th>}
              {canSeeCosts && <th>Margem</th>}
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ car, totalCost, margin, sale, sellerName, views, reservation }) => (
              <tr key={car.id} className={`${busyId === car.id ? 'is-busy' : ''} ${car.hidden ? 'is-hidden-row' : ''}`}>
                <td>
                  <div className="admin-thumb">
                    {car.images[0] ? <img src={thumbUrl(car.images[0])} alt="" loading="lazy" /> : <span>Sem foto</span>}
                  </div>
                </td>
                <td>
                  <strong>{car.brand} {car.model}</strong>
                  <span className="admin-table-sub">
                    {car.version} · {car.modelYear} · <span className="admin-table-capitalize">{car.category}</span>
                  </span>
                  {car.plate && <span className="car-plate">{car.plate.toUpperCase()}</span>}
                  {car.hidden && <span className="admin-hidden-badge">Oculto</span>}
                  {car.status === 'vendido' && soldLabel(sale, sellerName, canEditSales) && (
                    <span className="admin-table-sub">{soldLabel(sale, sellerName, canEditSales)}</span>
                  )}
                  <ReservationLine reservation={reservation} className="admin-table-sub" />
                </td>
                <td>{car.km.toLocaleString('pt-BR')} km</td>
                <td className={isStockStale(car, alertDefault) ? 'stock-days-stale' : ''}>
                  {daysInStock(car)} {daysInStock(car) === 1 ? 'dia' : 'dias'}
                </td>
                <td>{views.toLocaleString('pt-BR')}</td>
                <td>
                  {sale && canSeeSaleValues ? formatCurrency(sale.salePrice) : car.price != null ? formatCurrency(car.price) : 'Consulte o valor'}
                  {sale && canSeeSaleValues && <span className="admin-table-sub">valor da venda</span>}
                </td>
                {canSeeCosts && <td>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</td>}
                {canSeeCosts && (
                  <td className={car.purchasePrice && margin != null ? (margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive') : ''}>
                    {car.purchasePrice && margin != null ? formatCurrency(margin) : '—'}
                  </td>
                )}
                <td>
                  <StatusMenu
                    value={car.status}
                    onChange={(next) => onChangeStatus(car, next)}
                    disabled={busyId === car.id}
                    lockedReason={statusLock(car, canEditSales)}
                  />
                </td>
                <td>
                  <RowActions
                    car={car}
                    busy={busyId === car.id}
                    canDelete={canDelete}
                    canSeeCosts={canSeeCosts}
                    canEditSales={canEditSales}
                    onToggleFeatured={onToggleFeatured}
                    onToggleHidden={onToggleHidden}
                    onDelete={onDelete}
                    onEditSale={onEditSale}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-card-list">
        {rows.map(({ car, totalCost, margin, sale, sellerName, views, reservation }) => (
          <div className={`admin-card ${car.hidden ? 'is-hidden-row' : ''}`} key={car.id}>
            <div className="admin-card-top">
              <div className="admin-thumb admin-card-thumb">
                {car.images[0] ? <img src={thumbUrl(car.images[0])} alt="" loading="lazy" /> : <span>Sem foto</span>}
              </div>
              <div className="admin-card-title">
                <strong>{car.brand} {car.model}</strong>
                <span className="admin-table-sub">
                  {car.version} · {car.modelYear}
                  {car.plate && <> · <span className="car-plate">{car.plate.toUpperCase()}</span></>}
                </span>
                <span className="admin-card-meta">
                  <span className="admin-table-capitalize">{car.category}</span> · {car.km.toLocaleString('pt-BR')} km ·{' '}
                  <span className={isStockStale(car, alertDefault) ? 'stock-days-stale' : ''}>
                    {daysInStock(car)} {daysInStock(car) === 1 ? 'dia' : 'dias'} em estoque
                  </span>{' '}
                  · {formatViews(views)}
                </span>
                {car.hidden && <span className="admin-hidden-badge">Oculto</span>}
                {car.status === 'vendido' && soldLabel(sale, sellerName, canEditSales) && (
                  <span className="admin-card-meta">{soldLabel(sale, sellerName, canEditSales)}</span>
                )}
                <ReservationLine reservation={reservation} className="admin-card-meta" />
              </div>
              <StatusMenu
                value={car.status}
                onChange={(next) => onChangeStatus(car, next)}
                disabled={busyId === car.id}
                lockedReason={statusLock(car, canEditSales)}
              />
            </div>

            <div className="admin-card-stats">
              <div>
                <span>{sale && canSeeSaleValues ? 'Valor da venda' : 'Preço'}</span>
                <strong>{sale && canSeeSaleValues ? formatCurrency(sale.salePrice) : car.price != null ? formatCurrency(car.price) : 'Consulte o valor'}</strong>
              </div>
              {canSeeCosts && (
                <div>
                  <span>Custo total</span>
                  <strong>{car.purchasePrice ? formatCurrency(totalCost) : '—'}</strong>
                </div>
              )}
              {canSeeCosts && (
                <div className={car.purchasePrice && margin != null ? (margin < 0 ? 'expense-margin-negative' : 'expense-margin-positive') : ''}>
                  <span>Margem</span>
                  <strong>{car.purchasePrice && margin != null ? formatCurrency(margin) : '—'}</strong>
                </div>
              )}
            </div>

            <RowActions
              car={car}
              busy={busyId === car.id}
              canDelete={canDelete}
              canSeeCosts={canSeeCosts}
              canEditSales={canEditSales}
              onToggleFeatured={onToggleFeatured}
              onToggleHidden={onToggleHidden}
              onDelete={onDelete}
              onEditSale={onEditSale}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function AdminCarList() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin, isStaff, isSeller, seller, canSeeCosts, canSeeSaleValues } = useAuth()
  // Vendas e reservas: admin e gerente editam e desfazem; o vendedor só registra no nome dele
  const canEditSales = isStaff
  const [alertDefault, setAlertDefault] = useState(DEFAULT_STOCK_ALERT_DAYS)
  const [minDays, setMinDays] = useState('')
  const [onlyAlert, setOnlyAlert] = useState(false)
  const [alertDialogOpen, setAlertDialogOpen] = useState(false)
  const [alertDays, setAlertDays] = useState('')
  const [alertSaving, setAlertSaving] = useState(false)
  const [alertError, setAlertError] = useState('')
  const [cars, setCars] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [statusDialog, setStatusDialog] = useState(null)
  const [sales, setSales] = useState([])
  const [sellers, setSellers] = useState([])
  const [customers, setCustomers] = useState([])
  const [carViews, setCarViews] = useState({})
  const [saleDialog, setSaleDialog] = useState(null)
  const [savingSale, setSavingSale] = useState(false)
  const [view, setView] = useState(readView)
  const [checklistItems, setChecklistItems] = useState(DEFAULT_SALE_CHECKLIST)
  const [banks, setBanks] = useState(DEFAULT_BANKS)
  const [companyName, setCompanyName] = useState('')
  const [reservations, setReservations] = useState([])
  const [reserveDialog, setReserveDialog] = useState(null)
  const [savingReserve, setSavingReserve] = useState(false)
  // Listas da loja usadas no cadastro e na venda (admin e gerente editam)
  const [lists, setLists] = useState({ intake: [], inspection: [] })
  const [listsChooser, setListsChooser] = useState(false)
  const [listDialog, setListDialog] = useState(null)

  function changeView(next) {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // armazenamento indisponível: só não lembra a escolha
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, expensesData, salesData, sellersData, settings, customersData, reservationsData] = await Promise.all([
        fetchAllCarsAdmin(),
        // Gastos só entram na conta do admin (o gerente não lê gastos)
        canSeeCosts ? fetchAllExpensesAdmin() : Promise.resolve([]),
        fetchSales(),
        fetchSellers(),
        fetchCompanySettings(),
        fetchAllCustomers(),
        // Reservas: se a loja ainda não tem a tabela, o estoque abre normalmente
        fetchReservations().catch(() => []),
      ])
      setAlertDefault(settings.stockAlertDays)
      setChecklistItems(settings.saleChecklist)
      setBanks(settings.bankList)
      setLists({ intake: settings.intakeChecklist, inspection: settings.inspectionChecklist })
      setReservations(reservationsData)
      setCompanyName(settings.name)
      setCars(carsData)
      setExpenses(expensesData)
      setSales(salesData)
      setSellers(sellersData)
      setCustomers(customersData)
      // Visualizações: se falhar, o estoque aparece normalmente (com 0)
      fetchCarViewTotals().then(setCarViews).catch(() => setCarViews({}))
    } catch (err) {
      setError(err.message || 'Erro ao carregar os carros.')
    } finally {
      setLoading(false)
    }
  }

  const expensesByCar = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.carId] = (map[e.carId] || 0) + e.amount
    return map
  }, [expenses])

  const salesByCar = useMemo(() => {
    const map = {}
    for (const sale of sales) map[sale.carId] = sale
    return map
  }, [sales])

  const sellersById = useMemo(() => {
    const map = {}
    for (const s of sellers) map[s.id] = s
    return map
  }, [sellers])

  const reservationsByCar = useMemo(() => {
    const map = {}
    for (const r of reservations) if (r.status === 'ativa') map[r.carId] = r
    return map
  }, [reservations])

  const rows = useMemo(
    () =>
      cars.map((car) => {
        const sale = salesByCar[car.id] || null
        const totalCost = (car.purchasePrice || 0) + (expensesByCar[car.id] || 0)
        // Vendido com venda registrada: margem real sobre o valor negociado
        const revenue = sale ? sale.salePrice : car.price
        const margin = revenue != null ? revenue - totalCost : null
        const sellerName = sale?.sellerId ? sellersById[sale.sellerId]?.name || '' : ''
        const views = carViews[car.id]?.views || 0
        const reservation = car.status === 'reservado' ? reservationsByCar[car.id] || null : null
        return { car, totalCost, margin, sale, sellerName, views, reservation }
      }),
    [cars, expensesByCar, salesByCar, sellersById, carViews, reservationsByCar]
  )

  const minDaysValue = Number.parseInt(minDays, 10)
  const hasMinDays = Number.isFinite(minDaysValue) && minDaysValue > 0

  const filteredRows = useMemo(() => {
    return rows.filter(({ car }) => {
      const matchesQuery = matchesCarSearch(car, search)
      const matchesCategory = categoryFilter === 'todas' || car.category === categoryFilter
      // Filtros de tempo em estoque só fazem sentido para carros não vendidos
      const matchesDays = !hasMinDays || (car.status !== 'vendido' && daysInStock(car) > minDaysValue)
      const matchesAlert = !onlyAlert || isStockStale(car, alertDefault)
      return matchesQuery && matchesCategory && matchesDays && matchesAlert
    })
  }, [rows, search, categoryFilter, hasMinDays, minDaysValue, onlyAlert, alertDefault])

  const staleCount = rows.filter(({ car }) => isStockStale(car, alertDefault)).length

  const availableRows = filteredRows.filter((r) => r.car.status === 'disponivel')
  const maintenanceRows = filteredRows.filter((r) => r.car.status === 'manutencao')
  const reservedRows = filteredRows.filter((r) => r.car.status === 'reservado')
  const soldRows = filteredRows.filter((r) => r.car.status === 'vendido')
  const isFiltering = search.trim() !== '' || categoryFilter !== 'todas' || hasMinDays || onlyAlert

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function applyStatusChange(car, nextStatus, hidden) {
    setBusyId(car.id)
    try {
      // Saiu de "vendido": o carro deixa de ter cliente comprador
      const leavingSold = car.status === 'vendido' && nextStatus !== 'vendido'
      const updated = await updateCarStatus(car.id, nextStatus, { hidden, customerId: leavingSold ? null : undefined })
      setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
      // Saiu de "vendido": a venda registrada deixa de valer
      if (car.status === 'vendido' && nextStatus !== 'vendido' && salesByCar[car.id]) {
        await deleteSaleForCar(car.id)
        setSales((prev) => prev.filter((s) => s.carId !== car.id))
      }
    } catch (err) {
      alert('Não foi possível atualizar o status: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmSale(data) {
    const { car } = saleDialog
    const reservation = reservationsByCar[car.id] || null
    setSavingSale(true)
    let result
    try {
      result = await registerSaleFromDialog(car, data, {
        reservation,
        insertOnly: !canEditSales && !salesByCar[car.id],
      })
      setSales((prev) => [...prev.filter((s) => s.carId !== car.id), result.sale])
      setCars((prev) => prev.map((c) => (c.id === car.id ? result.car : c)))
      if (reservation) setReservations((prev) => prev.filter((r) => r.id !== reservation.id))
      setSaleDialog(null)
    } catch (err) {
      alert('Não foi possível registrar a venda: ' + err.message)
      if (data.tradeIn) fetchAllCarsAdmin().then(setCars).catch(() => {})
      return
    } finally {
      setSavingSale(false)
    }
    // O carro da troca aparece no estoque
    if (result.tradeInCarId) fetchAllCarsAdmin().then(setCars).catch(() => {})
    const { customerId, checklist, generateTerm } = data
    const soldCar = result.car
    const saved = result.sale
    if (generateTerm) {
      const customer = customers.find((c) => c.id === customerId) || null
      downloadDeliveryTerm({ car: soldCar, customer, sale: saved, checklist, companyName }).catch((err) =>
        alert('A venda foi registrada, mas o termo de entrega não foi gerado: ' + err.message)
      )
    }
  }

  async function changeStatus(car, nextStatus) {
    if (nextStatus === car.status) return

    if (nextStatus === 'vendido') {
      setSaleDialog({ car })
      return
    }

    if (nextStatus === 'reservado') {
      if (car.status === 'vendido') {
        await confirm('Um carro vendido não pode ser reservado. Desfaça a venda antes (só o administrador).', {
          title: 'Carro vendido',
          confirmLabel: 'Entendi',
        })
        return
      }
      setReserveDialog({ car })
      return
    }

    // Saindo de "reservado" (admin e gerente): a reserva é cancelada
    if (car.status === 'reservado') {
      const reservation = reservationsByCar[car.id]
      if (!(await confirm(`Cancelar a reserva${reservation?.customerName ? ` de ${reservation.customerName}` : ''} e mudar o status? O sinal recebido, se houver, precisa ser tratado com o cliente.`, {
        title: 'Cancelar reserva',
        confirmLabel: 'Cancelar reserva',
        cancelLabel: 'Manter reservado',
      }))) return
      setBusyId(car.id)
      try {
        if (reservation) {
          await closeReservation(reservation.id, 'cancelada')
          setReservations((prev) => prev.filter((r) => r.id !== reservation.id))
        } else {
          await updateCarStatus(car.id, 'disponivel')
        }
        setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, status: 'disponivel' } : c)))
      } catch (err) {
        alert('Não foi possível cancelar a reserva: ' + err.message)
        setBusyId(null)
        return
      }
      setBusyId(null)
      if (nextStatus === 'disponivel') return
      car = { ...car, status: 'disponivel' }
    }

    if (car.status === 'vendido' && salesByCar[car.id] && !isAdmin) {
      await confirm('Esse carro tem uma venda registrada. Só o administrador pode desfazer uma venda.', {
        title: 'Venda registrada',
        confirmLabel: 'Entendi',
      })
      return
    }

    if (car.status === 'vendido' && salesByCar[car.id]
      && !(await confirm('Esse carro tem uma venda registrada (vendedor, valor e comissão). Ao mudar o status, o registro da venda será apagado. Continuar?'))) {
      return
    }

    if (nextStatus === 'manutencao') {
      setStatusDialog({ car, nextStatus })
      return
    }

    // Se o carro tinha sido ocultado durante a manutenção, volta a ficar
    // visível automaticamente ao sair da manutenção (senão fica "disponível"
    // no painel mas invisível no site, sem o admin perceber).
    if (nextStatus === 'disponivel' && car.status === 'manutencao' && car.hidden) {
      await applyStatusChange(car, nextStatus, false)
      alert('Esse carro estava oculto do site (ocultado durante a manutenção). Ele foi marcado como visível novamente.')
      return
    }

    await applyStatusChange(car, nextStatus)
  }

  async function confirmReserve(data) {
    const { car } = reserveDialog
    setSavingReserve(true)
    try {
      await reserveCar(data)
      const [carsData, reservationsData] = await Promise.all([fetchAllCarsAdmin(), fetchReservations()])
      setCars(carsData)
      setReservations(reservationsData)
      setReserveDialog(null)
    } catch (err) {
      alert(`Não foi possível reservar ${car.brand} ${car.model}: ` + err.message)
    } finally {
      setSavingReserve(false)
    }
  }

  async function toggleFeatured(car) {
    setBusyId(car.id)
    try {
      await updateCarFeatured(car.id, !car.featured)
      setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, featured: !c.featured } : c)))
    } catch (err) {
      alert('Não foi possível atualizar o destaque: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function toggleHidden(car) {
    setBusyId(car.id)
    try {
      await updateCarHidden(car.id, !car.hidden)
      setCars((prev) => prev.map((c) => (c.id === car.id ? { ...c, hidden: !c.hidden } : c)))
    } catch (err) {
      alert('Não foi possível atualizar a visibilidade: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  function openAlertDialog() {
    setAlertDays(String(alertDefault))
    setAlertError('')
    setAlertDialogOpen(true)
  }

  async function submitAlertToAll(e) {
    e.preventDefault()
    const days = Number.parseInt(alertDays, 10)
    if (!Number.isFinite(days) || days < 1) {
      setAlertError('Informe um número de dias maior que zero.')
      return
    }
    setAlertSaving(true)
    setAlertError('')
    try {
      await applyStockAlertToAll(days)
      setAlertDefault(days)
      setCars((prev) => prev.map((c) => ({ ...c, stockAlertDays: days })))
      setAlertDialogOpen(false)
    } catch (err) {
      setAlertError(err.message || 'Não foi possível aplicar o aviso.')
    } finally {
      setAlertSaving(false)
    }
  }

  async function handleDelete(car) {
    if (!(await confirm(`Excluir "${car.brand} ${car.model}"? Essa ação não pode ser desfeita.`))) return
    setBusyId(car.id)
    try {
      await deleteCar(car.id)
      setCars((prev) => prev.filter((c) => c.id !== car.id))
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Estoque</h1>
          <p>{cars.length} {cars.length === 1 ? 'carro cadastrado' : 'carros cadastrados'}</p>
        </div>
        <div className="admin-row-actions">
          {isStaff && (
            <button type="button" className="btn btn-outline" onClick={openAlertDialog}>
              <BellRing size={15} /> Aviso de estoque
            </button>
          )}
          {isStaff && (
            <button type="button" className="btn btn-outline" onClick={() => setListsChooser(true)}>
              <ListChecks size={15} /> Listas do cadastro
            </button>
          )}
          <div className="admin-segmented admin-view-toggle" role="radiogroup" aria-label="Modo de visualização">
            <button
              type="button"
              role="radio"
              aria-checked={view === 'cards'}
              className={view === 'cards' ? 'is-active' : ''}
              onClick={() => changeView('cards')}
            >
              <LayoutGrid size={15} /> Cards
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={view === 'tabela'}
              className={view === 'tabela' ? 'is-active' : ''}
              onClick={() => changeView('tabela')}
            >
              <List size={15} /> Tabela
            </button>
          </div>
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {!loading && cars.length > 0 && (
        <div className="admin-search-bar">
          <label className="admin-search-input">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por placa, marca, modelo ou versão…"
            />
          </label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="todas">Todas as categorias</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
          <label className="admin-days-filter">
            Há mais de
            <input
              type="text"
              inputMode="numeric"
              value={minDays}
              onChange={(e) => setMinDays(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0"
              aria-label="Mais de quantos dias em estoque"
            />
            dias em estoque
          </label>
          <button
            type="button"
            className={`admin-alert-chip ${onlyAlert ? 'is-active' : ''}`}
            onClick={() => setOnlyAlert((v) => !v)}
            aria-pressed={onlyAlert}
          >
            <BellRing size={14} /> Em alerta ({staleCount})
          </button>
          {(hasMinDays || onlyAlert) && (
            <button type="button" className="admin-clear-filter" onClick={() => { setMinDays(''); setOnlyAlert(false) }}>
              Limpar filtro de dias
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : cars.length === 0 ? (
        <div className="admin-empty">
          <p>Nenhum carro cadastrado ainda.</p>
          <Link to="/admin/carros/novo" className="btn btn-primary">Cadastrar primeiro carro</Link>
        </div>
      ) : isFiltering && filteredRows.length === 0 ? (
        <p className="admin-muted">Nenhum carro encontrado para essa busca.</p>
      ) : (
        <>
          <CarGroup
            title="Disponíveis"
            rows={availableRows}
            busyId={busyId}
            view={view}
            alertDefault={alertDefault}
            canDelete={isAdmin}
            canSeeCosts={canSeeCosts}
            canSeeSaleValues={canSeeSaleValues}
            canEditSales={canEditSales}
            onChangeStatus={changeStatus}
            onToggleFeatured={toggleFeatured}
            onToggleHidden={toggleHidden}
            onDelete={handleDelete}
            onEditSale={(car) => setSaleDialog({ car })}
            emptyLabel="Nenhum carro disponível no momento."
          />
          <CarGroup
            title="Em Manutenção"
            rows={maintenanceRows}
            busyId={busyId}
            view={view}
            alertDefault={alertDefault}
            canDelete={isAdmin}
            canSeeCosts={canSeeCosts}
            canSeeSaleValues={canSeeSaleValues}
            canEditSales={canEditSales}
            onChangeStatus={changeStatus}
            onToggleFeatured={toggleFeatured}
            onToggleHidden={toggleHidden}
            onDelete={handleDelete}
            onEditSale={(car) => setSaleDialog({ car })}
            emptyLabel="Nenhum carro em manutenção."
          />
          <CarGroup
            title="Reservados"
            rows={reservedRows}
            busyId={busyId}
            view={view}
            alertDefault={alertDefault}
            canDelete={isAdmin}
            canSeeCosts={canSeeCosts}
            canSeeSaleValues={canSeeSaleValues}
            canEditSales={canEditSales}
            onChangeStatus={changeStatus}
            onToggleFeatured={toggleFeatured}
            onToggleHidden={toggleHidden}
            onDelete={handleDelete}
            onEditSale={(car) => setSaleDialog({ car })}
            emptyLabel="Nenhum carro reservado."
          />
          <CarGroup
            title="Vendidos"
            rows={soldRows}
            busyId={busyId}
            view={view}
            alertDefault={alertDefault}
            canDelete={isAdmin}
            canSeeCosts={canSeeCosts}
            canSeeSaleValues={canSeeSaleValues}
            canEditSales={canEditSales}
            onChangeStatus={changeStatus}
            onToggleFeatured={toggleFeatured}
            onToggleHidden={toggleHidden}
            onDelete={handleDelete}
            onEditSale={(car) => setSaleDialog({ car })}
            emptyLabel="Nenhum carro vendido ainda."
          />
        </>
      )}

      {alertDialogOpen && (
        <div className="confirm-dialog-overlay" onClick={alertSaving ? undefined : () => setAlertDialogOpen(false)}>
          <form className="confirm-dialog admin-form sale-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submitAlertToAll}>
            <h2>Aviso de dias em estoque</h2>
            <p>
              O tempo em estoque fica em vermelho quando o carro passa desse prazo. Para mudar só um carro, use o campo
              "Aviso de estoque" em Editar.
            </p>
            <label>
              Avisar em vermelho a partir de (dias)
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={alertDays}
                onChange={(e) => setAlertDays(e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
            </label>
            <span className="sale-dialog-note">
              Aplica a todos os {cars.length} carros (substitui prazos individuais) e vira o padrão dos carros novos.
            </span>
            {alertError && <p className="admin-error">{alertError}</p>}
            <div className="confirm-dialog-actions">
              <button type="submit" className="btn btn-primary btn-block" disabled={alertSaving}>
                {alertSaving ? 'Aplicando…' : 'Aplicar a todos os carros'}
              </button>
              <button type="button" className="btn btn-outline btn-block" onClick={() => setAlertDialogOpen(false)} disabled={alertSaving}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {saleDialog && (
        <SaleDialog
          car={saleDialog.car}
          sellers={sellers}
          customers={customers}
          onCustomerCreated={(created) => setCustomers((prev) => [...prev, created].sort((x, y) => x.name.localeCompare(y.name)))}
          showCommission={canSeeSaleValues}
          initialSale={salesByCar[saleDialog.car.id]}
          checklistItems={checklistItems}
          banks={banks}
          lockedSeller={isSeller ? seller : null}
          saving={savingSale}
          onConfirm={confirmSale}
          onClose={() => setSaleDialog(null)}
        />
      )}

      {reserveDialog && (
        <ReserveDialog
          car={reserveDialog.car}
          sellers={sellers}
          customers={customers}
          onCustomerCreated={(created) => setCustomers((prev) => [...prev, created].sort((x, y) => x.name.localeCompare(y.name)))}
          lockedSeller={isSeller ? seller : null}
          saving={savingReserve}
          onConfirm={confirmReserve}
          onClose={() => setReserveDialog(null)}
        />
      )}

      {listsChooser && (
        <ConfirmDialog
          title="Listas do cadastro"
          message="Qual lista você quer editar? Elas aparecem no cadastro do carro, na venda, no contrato e no financiamento externo."
          onClose={() => setListsChooser(false)}
          options={[
            { label: 'Itens que vêm com o carro', variant: 'primary', onClick: () => { setListsChooser(false); setListDialog('intake') } },
            { label: 'Vistoria de entrada', onClick: () => { setListsChooser(false); setListDialog('inspection') } },
            { label: 'Bancos', onClick: () => { setListsChooser(false); setListDialog('banks') } },
          ]}
        />
      )}

      {listDialog && (
        <ChecklistSettingsDialog
          kind={listDialog}
          items={listDialog === 'banks' ? banks : lists[listDialog]}
          onSaved={(items) => {
            if (listDialog === 'banks') setBanks(items)
            else setLists((prev) => ({ ...prev, [listDialog]: items }))
            setListDialog(null)
          }}
          onClose={() => setListDialog(null)}
        />
      )}

      {statusDialog && (
        <ConfirmDialog
          title="Carro em manutenção"
          message="Quer manter esse carro visível no site (aparece normalmente como 'Disponível', sem indicar a manutenção pro cliente) ou ocultar até ele ficar pronto de novo?"
          onClose={() => setStatusDialog(null)}
          options={[
            {
              label: 'Manter visível no site',
              variant: 'primary',
              onClick: () => {
                const { car, nextStatus } = statusDialog
                setStatusDialog(null)
                applyStatusChange(car, nextStatus, false)
              },
            },
            {
              label: 'Ocultar até ficar pronto',
              onClick: () => {
                const { car, nextStatus } = statusDialog
                setStatusDialog(null)
                applyStatusChange(car, nextStatus, true)
              },
            },
          ]}
        />
      )}
      {confirmDialog}
    </div>
  )
}
