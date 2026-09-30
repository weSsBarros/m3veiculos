import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCcw, Pencil, Trash2, FolderOpen, Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  fetchExternalFinancings,
  createExternalFinancing,
  updateExternalFinancing,
  deleteExternalFinancing,
} from '../lib/externalFinancingApi.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { fetchCompanySettings } from '../lib/companyApi.js'
import { formatCurrencyCents, formatDateBR } from '../utils/carFormat.js'
import { EXTERNAL_STATUSES, externalStatusLabel, externalStatusTone } from '../utils/externalFinancing.js'
import { DEFAULT_BANKS } from '../utils/payment.js'
import { periodRange, inRange } from '../utils/period.js'
import PeriodFilter from './PeriodFilter.jsx'
import ExternalFinancingDialog from './ExternalFinancingDialog.jsx'
import useConfirm from '../components/useConfirm.jsx'
import './admin.css'

// Financiamentos externos: o cliente achou o carro fora da loja e só fez o
// financiamento por ela. O vendedor cadastra e vê os dele; admin e gerente
// veem todos (o gerente em "só quantidades" vê sem valores); excluir só o admin.
export default function AdminExternalFinance() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin, isStaff, isSeller, seller: me, canSeeSaleValues } = useAuth()
  // O vendedor vê os valores dos financiamentos dele
  const showValues = canSeeSaleValues || isSeller
  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [sellers, setSellers] = useState([])
  const [banks, setBanks] = useState(DEFAULT_BANKS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [sellerFilter, setSellerFilter] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('tudo')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [dialog, setDialog] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [itemsData, customersData, sellersData, settings] = await Promise.all([
        fetchExternalFinancings(),
        fetchAllCustomers(),
        fetchSellers().catch(() => []),
        fetchCompanySettings(),
      ])
      setItems(itemsData)
      setCustomers(customersData)
      setSellers(sellersData)
      setBanks(settings.bankList)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os financiamentos externos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sellersById = useMemo(() => Object.fromEntries(sellers.map((s) => [s.id, s])), [sellers])
  const range = periodRange(period, customStart, customEnd)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (statusFilter !== 'todos' && it.status !== statusFilter) return false
      if (sellerFilter && it.sellerId !== sellerFilter) return false
      if (!inRange(it.submittedOn, range)) return false
      if (q && !`${it.customerName} ${it.vehicleLabel} ${it.vehiclePlate} ${it.bank}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, statusFilter, sellerFilter, search, range])

  const totals = useMemo(() => {
    const paid = visible.filter((it) => it.status === 'pago')
    return {
      count: visible.length,
      open: visible.filter((it) => it.status === 'em_analise' || it.status === 'aprovado').length,
      paid: paid.length,
      financed: visible.reduce((sum, it) => sum + (it.financedAmount || 0), 0),
      storeReturn: paid.reduce((sum, it) => sum + (it.storeReturn || 0), 0),
      commission: paid.reduce((sum, it) => sum + it.commissionAmount, 0),
    }
  }, [visible])

  async function handleConfirm(data) {
    setSaving(true)
    try {
      if (dialog.item) {
        const saved = await updateExternalFinancing(dialog.item.id, data)
        setItems((prev) => prev.map((it) => (it.id === saved.id ? saved : it)))
      } else {
        const saved = await createExternalFinancing(data)
        setItems((prev) => [saved, ...prev])
      }
      setDialog(null)
    } catch (err) {
      alert('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    if (!(await confirm(`Excluir o financiamento externo de ${item.customerName}? Os documentos anexados continuam na ficha do cliente.`))) return
    try {
      await deleteExternalFinancing(item.id)
      setItems((prev) => prev.filter((it) => it.id !== item.id))
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  // O vendedor só edita os dele, antes de pago (regra também no banco)
  function canEdit(item) {
    return isStaff || (isSeller && item.status !== 'pago')
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Financiamentos externos</h1>
          <p>Clientes que acharam o carro fora da loja e fizeram só o financiamento com a loja</p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ item: null })}>
            <Plus size={15} /> Novo
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Financiamentos (período)</span>
          <strong>{totals.count}</strong>
        </div>
        <div className="expense-summary-card">
          <span>Em análise ou aprovados</span>
          <strong>{totals.open}</strong>
        </div>
        {showValues && (
          <div className="expense-summary-card">
            <span>Valor financiado</span>
            <strong>{formatCurrencyCents(totals.financed)}</strong>
          </div>
        )}
        {showValues && isStaff && (
          <div className="expense-summary-card">
            <span>Retorno recebido (pagos)</span>
            <strong>{formatCurrencyCents(totals.storeReturn)}</strong>
          </div>
        )}
        {showValues && (
          <div className="expense-summary-card">
            <span>Comissões (pagos)</span>
            <strong>{formatCurrencyCents(totals.commission)}</strong>
          </div>
        )}
      </div>

      <div className="admin-search-bar">
        <label className="admin-search-input">
          <Search size={15} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, carro, placa ou banco…" />
        </label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Situação">
          <option value="todos">Todas as situações</option>
          {EXTERNAL_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {isStaff && (
          <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} aria-label="Vendedor">
            <option value="">Todos os vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <PeriodFilter
          period={period}
          onPeriodChange={setPeriod}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />
      </div>

      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="admin-muted">{items.length === 0 ? 'Nenhum financiamento externo cadastrado ainda.' : 'Nenhum financiamento encontrado com esses filtros.'}</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Enviado em</th>
                  <th>Cliente</th>
                  <th>Carro</th>
                  <th>Banco</th>
                  {showValues && <th>Financiado</th>}
                  <th>Situação</th>
                  <th>Vendedor</th>
                  {showValues && <th>Comissão</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((it) => (
                  <tr key={it.id}>
                    <td>{formatDateBR(it.submittedOn)}</td>
                    <td><strong>{it.customerName}</strong></td>
                    <td>
                      {it.vehicleLabel}
                      <span className="admin-table-sub">
                        {[it.vehicleYear, it.vehiclePlate, it.vehicleSourceName && `${it.vehicleSource === 'loja' ? 'Loja' : 'Particular'}: ${it.vehicleSourceName}`].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td>{it.bank || '—'}</td>
                    {showValues && <td>{it.financedAmount != null ? formatCurrencyCents(it.financedAmount) : '—'}</td>}
                    <td>
                      <span className={`state-pill tone-${externalStatusTone(it.status)}`}>{externalStatusLabel(it.status)}</span>
                    </td>
                    <td>{it.sellerId ? sellersById[it.sellerId]?.name || '—' : 'Loja'}</td>
                    {showValues && (
                      <td>
                        {formatCurrencyCents(it.commissionAmount)}
                        {it.commissionPaidOn && <span className="admin-table-sub">paga em {formatDateBR(it.commissionPaidOn)}</span>}
                      </td>
                    )}
                    <td>
                      <RowButtons item={it} canEdit={canEdit(it)} isAdmin={isAdmin} onEdit={() => setDialog({ item: it })} onDelete={() => handleDelete(it)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {visible.map((it) => (
              <div className="admin-card" key={it.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{it.customerName}</strong>
                    <span className="admin-table-sub">{it.vehicleLabel}{it.vehiclePlate ? ` · ${it.vehiclePlate}` : ''}</span>
                    <span className="admin-card-meta">
                      {formatDateBR(it.submittedOn)} · {it.bank || 'banco não informado'} · {it.sellerId ? sellersById[it.sellerId]?.name || '—' : 'Loja'}
                    </span>
                  </div>
                  <span className={`state-pill tone-${externalStatusTone(it.status)}`}>{externalStatusLabel(it.status)}</span>
                </div>
                {showValues && (
                  <div className="admin-card-stats">
                    <div>
                      <span>Financiado</span>
                      <strong>{it.financedAmount != null ? formatCurrencyCents(it.financedAmount) : '—'}</strong>
                    </div>
                    <div>
                      <span>Comissão</span>
                      <strong>{formatCurrencyCents(it.commissionAmount)}</strong>
                    </div>
                  </div>
                )}
                <RowButtons item={it} canEdit={canEdit(it)} isAdmin={isAdmin} onEdit={() => setDialog({ item: it })} onDelete={() => handleDelete(it)} />
              </div>
            ))}
          </div>
        </>
      )}

      {dialog && (
        <ExternalFinancingDialog
          initial={dialog.item}
          customers={customers}
          onCustomerCreated={(created) => setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))}
          sellers={sellers}
          banks={banks}
          isStaff={isStaff}
          lockedSeller={isSeller ? me : null}
          showValues={showValues}
          saving={saving}
          onConfirm={handleConfirm}
          onClose={() => setDialog(null)}
        />
      )}
      {confirmDialog}
    </div>
  )
}

function RowButtons({ item, canEdit, isAdmin, onEdit, onDelete }) {
  return (
    <div className="admin-action-group">
      {canEdit && (
        <button type="button" className="admin-action-btn" onClick={onEdit}>
          <Pencil size={15} /> Editar
        </button>
      )}
      {item.customerId && (
        <Link to={`/admin/clientes?cliente=${item.customerId}`} className="admin-action-btn" title="Contratos e documentos do cliente">
          <FolderOpen size={15} /> Documentos
        </Link>
      )}
      {isAdmin && (
        <button type="button" className="admin-action-btn admin-action-danger" onClick={onDelete}>
          <Trash2 size={15} /> Excluir
        </button>
      )}
    </div>
  )
}
