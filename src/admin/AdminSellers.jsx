import { useEffect, useMemo, useState } from 'react'
import { RefreshCcw, Pencil, KeyRound, UserX, UserCheck, ListChecks, UserPlus } from 'lucide-react'
import { fetchSellers, createSeller, updateSeller, resetSellerPassword, describeCommission, roleLabel, financeAccessLabel } from '../lib/sellersApi.js'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchSales } from '../lib/salesApi.js'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { formatCurrency, formatCurrencyCents, formatDateBR } from '../utils/carFormat.js'
import { periodRange, inRange } from '../utils/period.js'
import { maskPhoneBR } from '../utils/masks.js'
import PeriodFilter from './PeriodFilter.jsx'
import '../components/ConfirmDialog.css'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'

const EMPTY_FORM = {
  role: 'seller',
  name: '',
  email: '',
  phone: '',
  password: '',
  hasCommission: true,
  commissionType: 'percent',
  commissionValue: '',
  // Só para gerente: 'values' (vê valores das vendas) ou 'counts' (só quantidades)
  financeAccess: 'counts',
  active: true,
}

// Aceita "1,5", "1.5", "500", "1.000" e "1.000,50"
function parseCommission(value) {
  let str = String(value).trim()
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(str)) str = str.replace(/\./g, '')
  const n = Number(str)
  return str !== '' && Number.isFinite(n) ? n : NaN
}

export default function AdminSellers() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin, canSeeSaleValues } = useAuth()
  const [sellers, setSellers] = useState([])
  const [sales, setSales] = useState([])
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [period, setPeriod] = useState('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [resetFor, setResetFor] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [sellersData, salesData, carsData] = await Promise.all([fetchSellers(), fetchSales(), fetchAllCarsAdmin()])
      setSellers(sellersData)
      setSales(salesData)
      setCars(carsData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os vendedores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const range = periodRange(period, customStart, customEnd)

  const carsById = useMemo(() => {
    const map = {}
    for (const c of cars) map[c.id] = c
    return map
  }, [cars])

  const periodSales = useMemo(
    () => sales.filter((s) => inRange(s.saleDate, { start: range.start, end: range.end })),
    [sales, range.start, range.end]
  )

  const statsBySeller = useMemo(() => {
    const map = {}
    for (const s of periodSales) {
      if (!s.sellerId) continue
      if (!map[s.sellerId]) map[s.sellerId] = { count: 0, revenue: 0, commission: 0, lastSale: null }
      const st = map[s.sellerId]
      st.count += 1
      st.revenue += s.salePrice
      st.commission += s.commissionAmount
      if (!st.lastSale || s.saleDate > st.lastSale) st.lastSale = s.saleDate
    }
    return map
  }, [periodSales])

  const totals = Object.values(statsBySeller).reduce(
    (acc, st) => ({ count: acc.count + st.count, revenue: acc.revenue + st.revenue, commission: acc.commission + st.commission }),
    { count: 0, revenue: 0, commission: 0 }
  )

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function startEdit(seller) {
    setEditingId(seller.id)
    setFormError('')
    setFormSuccess('')
    const hasCommission = seller.commissionType !== 'none'
    setForm({
      role: seller.role,
      name: seller.name,
      email: seller.email,
      phone: seller.phone,
      password: '',
      hasCommission,
      commissionType: hasCommission ? seller.commissionType : 'percent',
      commissionValue: hasCommission ? String(seller.commissionValue).replace('.', ',') : '',
      financeAccess: seller.financeAccess,
      active: seller.active,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    const commissionType = form.hasCommission ? form.commissionType : 'none'
    const commissionValue = !form.hasCommission || form.commissionValue === '' ? 0 : parseCommission(form.commissionValue)
    if (Number.isNaN(commissionValue) || commissionValue < 0) {
      setFormError('Valor de comissão inválido.')
      return
    }
    if (form.hasCommission && commissionValue === 0) {
      setFormError('Informe o valor da comissão (ou desmarque "Recebe comissão").')
      return
    }
    if (commissionType === 'percent' && commissionValue > 100) {
      setFormError('A comissão em % não pode passar de 100.')
      return
    }
    if (!editingId && form.password.length < 6) {
      setFormError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        const saved = await updateSeller(editingId, { ...form, commissionType, commissionValue })
        setSellers((prev) => prev.map((s) => (s.id === editingId ? saved : s)))
        setFormSuccess(`${roleLabel(saved.role)} "${saved.name}" atualizado.`)
        cancelEdit()
      } else {
        const created = await createSeller({ ...form, commissionType, commissionValue })
        setSellers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        setFormSuccess(`${roleLabel(created.role)} "${created.name}" cadastrado. Já pode entrar no painel com o e-mail ${created.email}.`)
        setForm(EMPTY_FORM)
      }
    } catch (err) {
      setFormError(err.message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(seller) {
    const next = !seller.active
    const msg = next
      ? `Reativar "${seller.name}"? Ele volta a conseguir entrar no painel.`
      : `Desativar "${seller.name}"? Ele perde o acesso ao painel na hora. As vendas dele continuam registradas.`
    const label = next ? 'Reativar' : 'Desativar'
    if (!(await confirm(msg, { title: `${label} ${roleLabel(seller.role).toLowerCase()}`, confirmLabel: label }))) return
    try {
      const saved = await updateSeller(seller.id, { ...seller, active: next })
      setSellers((prev) => prev.map((s) => (s.id === seller.id ? saved : s)))
    } catch (err) {
      alert('Não foi possível atualizar: ' + err.message)
    }
  }

  async function submitResetPassword(e) {
    e.preventDefault()
    if (resetPassword.length < 6) {
      setResetError('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    setResetSaving(true)
    setResetError('')
    try {
      await resetSellerPassword(resetFor.id, resetPassword)
      setFormSuccess('Senha de ' + resetFor.name + ' redefinida. Passe a nova senha para a pessoa.')
      setResetFor(null)
    } catch (err) {
      setResetError(err.message || 'Não foi possível redefinir a senha.')
    } finally {
      setResetSaving(false)
    }
  }

  function openReset(seller) {
    setResetFor(seller)
    setResetPassword('')
    setResetError('')
  }

  const detailSeller = sellers.find((s) => s.id === detailId)
  const detailSales = periodSales.filter((s) => s.sellerId === detailId)

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Equipe</h1>
          <p>Vendedores e gerentes: acesso ao painel, vendas e comissões</p>
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
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Vendas da equipe (período)</span>
          <strong>{totals.count}</strong>
        </div>
        {canSeeSaleValues && (
          <div className="expense-summary-card">
            <span>Faturamento da equipe</span>
            <strong>{formatCurrency(totals.revenue)}</strong>
          </div>
        )}
        {canSeeSaleValues && (
          <div className="expense-summary-card">
            <span>Comissões a pagar</span>
            <strong>{formatCurrencyCents(totals.commission)}</strong>
          </div>
        )}
        <div className="expense-summary-card">
          <span>Pessoas ativas</span>
          <strong>{sellers.filter((s) => s.active).length}</strong>
        </div>
      </div>

      {isAdmin && (
      <form className="admin-form admin-form-section" onSubmit={handleSubmit}>
        <h2>{editingId ? `Editar ${roleLabel(form.role).toLowerCase()}` : 'Nova pessoa na equipe'}</h2>
        <div className="admin-form-grid admin-form-grid-3">
          <label>
            Cargo
            <select value={form.role} onChange={(e) => update('role', e.target.value)} disabled={Boolean(editingId)}>
              <option value="seller">Vendedor</option>
              <option value="manager">Gerente</option>
            </select>
          </label>
          <label>
            Nome
            <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Nome completo" />
          </label>
          <label>
            E-mail (login)
            <input
              type="email"
              required={!editingId}
              disabled={Boolean(editingId)}
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="nome@email.com"
            />
          </label>
          <label>
            Telefone
            <input value={form.phone} onChange={(e) => update('phone', maskPhoneBR(e.target.value))} placeholder="(00) 00000-0000" />
          </label>
          {!editingId && (
            <label>
              Senha de acesso
              <input
                type="text"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </label>
          )}
          <label className="admin-checkbox admin-commission-toggle">
            <input
              type="checkbox"
              checked={form.hasCommission}
              onChange={(e) => update('hasCommission', e.target.checked)}
            />
            Recebe comissão
          </label>
          {form.hasCommission && (
          <div className="admin-commission-field">
            <span className="admin-field-label">Tipo de comissão</span>
            <div className="admin-segmented" role="radiogroup" aria-label="Tipo de comissão">
              <button
                type="button"
                role="radio"
                aria-checked={form.commissionType === 'percent'}
                className={form.commissionType === 'percent' ? 'is-active' : ''}
                onClick={() => update('commissionType', 'percent')}
              >
                % da venda
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={form.commissionType === 'fixed'}
                className={form.commissionType === 'fixed' ? 'is-active' : ''}
                onClick={() => update('commissionType', 'fixed')}
              >
                Valor fixo (R$)
              </button>
            </div>
          </div>
          )}
          {form.hasCommission && (
          <label>
            {form.commissionType === 'percent' ? 'Comissão (%)' : 'Comissão por carro (R$)'}
            <input
              inputMode="decimal"
              value={form.commissionValue}
              onChange={(e) => update('commissionValue', e.target.value)}
              placeholder={form.commissionType === 'percent' ? 'Ex: 1,5' : 'Ex: 500'}
            />
          </label>
          )}
        </div>
        {form.role === 'manager' && (
          <div className="admin-finance-access">
            <span className="admin-field-label">O que o gerente vê das vendas</span>
            <div className="admin-segmented" role="radiogroup" aria-label="O que o gerente vê das vendas">
              <button
                type="button"
                role="radio"
                aria-checked={form.financeAccess === 'values'}
                className={form.financeAccess === 'values' ? 'is-active' : ''}
                onClick={() => update('financeAccess', 'values')}
              >
                Vendas com valores
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={form.financeAccess === 'counts'}
                className={form.financeAccess === 'counts' ? 'is-active' : ''}
                onClick={() => update('financeAccess', 'counts')}
              >
                Só quantidades
              </button>
            </div>
            <p className="admin-form-note">
              {form.financeAccess === 'values'
                ? 'Vê faturamento, valor de cada venda e comissões da equipe (Dashboard, Histórico e Equipe).'
                : 'Vê só números de carros: vendidos, em estoque e vendas por vendedor, sem valores em R$.'}{' '}
              Em qualquer opção, o gerente não vê preço de compra, gastos, custo total, margem, lucro nem o Financeiro. Ele cadastra
              carros e clientes, registra vendas e contratos, lança gastos e fornecedores (sem ver os já lançados), mas não exclui
              nada e não gerencia a equipe.
            </p>
          </div>
        )}
        {editingId && (
          <p className="admin-form-note">
            O e-mail de login e o cargo não mudam por aqui (o que o gerente vê das vendas pode ser trocado a qualquer momento). Mudar a comissão vale só para as próximas vendas — as já registradas mantêm a comissão da época.
          </p>
        )}
        {formError && <p className="admin-error">{formError}</p>}
        {formSuccess && <p className="admin-success">{formSuccess}</p>}
        <div className="admin-form-actions">
          {editingId && (
            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
              Cancelar edição
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {editingId ? null : <UserPlus size={15} />}
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : `Cadastrar ${roleLabel(form.role).toLowerCase()}`}
          </button>
        </div>
      </form>
      )}
      {!isAdmin && formSuccess && <p className="admin-success">{formSuccess}</p>}

      <h2 className="admin-section-title">Desempenho no período</h2>
      {sellers.length === 0 ? (
        <p className="admin-muted">Ninguém cadastrado na equipe ainda.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cargo</th>
                  {canSeeSaleValues && <th>Comissão</th>}
                  <th>Vendas</th>
                  {canSeeSaleValues && <th>Faturamento</th>}
                  {canSeeSaleValues && <th>Comissão a pagar</th>}
                  <th>Última venda</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => {
                  const st = statsBySeller[s.id] || { count: 0, revenue: 0, commission: 0, lastSale: null }
                  return (
                    <tr key={s.id} className={!s.active ? 'is-hidden-row' : ''}>
                      <td>
                        <strong>{s.name}</strong>
                        <span className="admin-table-sub">{s.email}{s.phone ? ` · ${s.phone}` : ''}</span>
                      </td>
                      <td>
                        <span className={`admin-role-pill role-${s.role}`}>{roleLabel(s.role)}</span>
                        {s.role === 'manager' && isAdmin && <span className="admin-table-sub">{financeAccessLabel(s.financeAccess)}</span>}
                      </td>
                      {canSeeSaleValues && <td>{describeCommission(s)}</td>}
                      <td>{st.count}</td>
                      {canSeeSaleValues && <td>{formatCurrency(st.revenue)}</td>}
                      {canSeeSaleValues && <td>{formatCurrencyCents(st.commission)}</td>}
                      <td>{st.lastSale ? formatDateBR(st.lastSale) : '—'}</td>
                      <td>
                        <span className={`admin-status-pill ${s.active ? 'is-on' : 'is-off'}`}>{s.active ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td>
                        <SellerActions
                          seller={s}
                          onDetail={() => setDetailId(detailId === s.id ? null : s.id)}
                          onEdit={() => startEdit(s)}
                          onReset={() => openReset(s)}
                          onToggle={() => toggleActive(s)}
                          detailOpen={detailId === s.id}
                          canManage={isAdmin}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {sellers.map((s) => {
              const st = statsBySeller[s.id] || { count: 0, revenue: 0, commission: 0, lastSale: null }
              return (
                <div className={`admin-card ${!s.active ? 'is-hidden-row' : ''}`} key={s.id}>
                  <div className="admin-card-top">
                    <div className="admin-card-title">
                      <strong>{s.name}</strong>
                      <span className="admin-table-sub">{s.email}</span>
                      <span className="admin-card-meta">
                        {roleLabel(s.role)}
                        {canSeeSaleValues ? ` · ${describeCommission(s)}` : ''}
                        {s.role === 'manager' && isAdmin ? ` · ${financeAccessLabel(s.financeAccess).toLowerCase()}` : ''}
                      </span>
                    </div>
                    <span className={`admin-status-pill ${s.active ? 'is-on' : 'is-off'}`}>{s.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  <div className="admin-card-stats">
                    <div>
                      <span>Vendas</span>
                      <strong>{st.count}</strong>
                    </div>
                    {canSeeSaleValues && (
                      <div>
                        <span>Faturamento</span>
                        <strong>{formatCurrency(st.revenue)}</strong>
                      </div>
                    )}
                    {canSeeSaleValues && (
                      <div>
                        <span>Comissão</span>
                        <strong>{formatCurrencyCents(st.commission)}</strong>
                      </div>
                    )}
                  </div>
                  <SellerActions
                    seller={s}
                    onDetail={() => setDetailId(detailId === s.id ? null : s.id)}
                    onEdit={() => startEdit(s)}
                    onReset={() => openReset(s)}
                    onToggle={() => toggleActive(s)}
                    detailOpen={detailId === s.id}
                    canManage={isAdmin}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}

      {detailSeller && (
        <section className="admin-form-section admin-seller-detail">
          <h2>Vendas de {detailSeller.name} no período</h2>
          {detailSales.length === 0 ? (
            <p className="admin-muted">Nenhuma venda no período selecionado.</p>
          ) : (
            <div className="admin-table-wrap admin-table-wrap-always">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Carro</th>
                    {canSeeSaleValues && <th>Valor da venda</th>}
                    {canSeeSaleValues && <th>Comissão</th>}
                  </tr>
                </thead>
                <tbody>
                  {detailSales.map((sale) => {
                    const car = carsById[sale.carId]
                    return (
                      <tr key={sale.id}>
                        <td>{formatDateBR(sale.saleDate)}</td>
                        <td>
                          <strong>{car ? `${car.brand} ${car.model}` : 'Carro removido'}</strong>
                          {car && <span className="admin-table-sub">{car.version} · {car.modelYear}</span>}
                        </td>
                        {canSeeSaleValues && <td>{formatCurrency(sale.salePrice)}</td>}
                        {canSeeSaleValues && (
                          <td>
                            {formatCurrencyCents(sale.commissionAmount)}
                            {sale.commissionType && (
                              <span className="admin-table-sub">
                                {sale.commissionType === 'percent' ? `${String(sale.commissionValue).replace('.', ',')}%` : 'valor fixo'}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {resetFor && (
        <div className="confirm-dialog-overlay" onClick={resetSaving ? undefined : () => setResetFor(null)}>
          <form className="confirm-dialog admin-form" onClick={(e) => e.stopPropagation()} onSubmit={submitResetPassword}>
            <h2>Nova senha</h2>
            <p>Defina a nova senha de acesso de {resetFor.name}.</p>
            <label>
              Nova senha
              <input
                type="text"
                autoFocus
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </label>
            {resetError && <p className="admin-error">{resetError}</p>}
            <div className="confirm-dialog-actions">
              <button type="submit" className="btn btn-primary btn-block" disabled={resetSaving}>
                {resetSaving ? 'Salvando…' : 'Salvar nova senha'}
              </button>
              <button type="button" className="btn btn-outline btn-block" onClick={() => setResetFor(null)} disabled={resetSaving}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
      {confirmDialog}
    </div>
  )
}

function SellerActions({ seller, onDetail, onEdit, onReset, onToggle, detailOpen, canManage }) {
  return (
    <div className="admin-action-group">
      <button type="button" className={`admin-action-btn ${detailOpen ? 'is-active' : ''}`} onClick={onDetail}>
        <ListChecks size={15} /> Vendas
      </button>
      {canManage && (
      <>
      <button type="button" className="admin-action-btn" onClick={onEdit}>
        <Pencil size={15} /> Editar
      </button>
      <button type="button" className="admin-action-btn" onClick={onReset}>
        <KeyRound size={15} /> Nova senha
      </button>
      <button type="button" className={`admin-action-btn ${seller.active ? 'admin-action-danger' : ''}`} onClick={onToggle}>
        {seller.active ? <UserX size={15} /> : <UserCheck size={15} />} {seller.active ? 'Desativar' : 'Reativar'}
      </button>
      </>
      )}
    </div>
  )
}
