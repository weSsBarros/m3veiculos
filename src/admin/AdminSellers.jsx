import { useEffect, useMemo, useState } from 'react'
import { RefreshCcw, Pencil, KeyRound, UserX, UserCheck, ListChecks, UserPlus, Trash2, HandCoins, ShieldCheck } from 'lucide-react'
import { fetchSellers, createSeller, updateSeller, resetSellerPassword, deleteSeller, describeCommission, roleLabel, financeAccessLabel, accessLabel, fetchAdminsOutsideTeam, addAdminToTeam } from '../lib/sellersApi.js'
import { fetchCustomRoles } from '../lib/customRolesApi.js'
import { tabsForRole } from '../utils/panelSettings.js'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchSales, markCommissionsPaid } from '../lib/salesApi.js'
import { fetchExternalFinancings } from '../lib/externalFinancingApi.js'
import { EXT_COMMISSION_TYPES, describeExternalCommission } from '../utils/externalFinancing.js'
import CommissionsDialog from './CommissionsDialog.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { formatCurrency, formatCurrencyCents, formatDateBR } from '../utils/carFormat.js'
import { periodRange, inRange } from '../utils/period.js'
import { maskPhoneBR, maskKeepingCaret } from '../utils/masks.js'
import PeriodFilter from './PeriodFilter.jsx'
import '../components/ConfirmDialog.css'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'

const EMPTY_FORM = {
  // Nível de acesso ('seller', 'manager' ou 'admin') e cargo personalizado (null = Vendedor/Gerente)
  role: 'seller',
  customRoleId: null,
  // Menu próprio da pessoa: null = segue o cargo
  panelTabs: null,
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
  // Comissão de financiamento externo
  extCommissionType: 'none',
  extCommissionValue: '',
}

// O que cada nível libera (texto da confirmação de troca de cargo)
const ACCESS_TEXT = {
  seller: 'vê só as próprias vendas, reservas e documentos de clientes',
  manager: 'vê todas as vendas e clientes da loja, menos custos',
  admin: 'vê e gerencia tudo da loja, inclusive custos, Financeiro, Equipe e Configurações',
}

// Valor do seletor de cargo: 'seller', 'manager', 'admin' ou 'custom:<id>'
const cargoValue = (role, customRoleId) => (customRoleId ? `custom:${customRoleId}` : role)

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
  const { isAdmin, canSeeSaleValues, user } = useAuth()
  const [sellers, setSellers] = useState([])
  const [customRoles, setCustomRoles] = useState([])
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
  const [externals, setExternals] = useState([])
  const [commissionsFor, setCommissionsFor] = useState(null)
  const [savingCommissions, setSavingCommissions] = useState(false)
  // Administradores da loja que não estão na Equipe (seção 69)
  const [outsideAdmins, setOutsideAdmins] = useState([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [sellersData, salesData, carsData, externalsData, rolesData, outsideData] = await Promise.all([
        fetchSellers(),
        fetchSales(),
        fetchAllCarsAdmin(),
        // Sem a tabela nova no banco, a Equipe abre normalmente
        fetchExternalFinancings().catch(() => []),
        fetchCustomRoles().catch(() => []),
        isAdmin ? fetchAdminsOutsideTeam().catch(() => []) : [],
      ])
      setSellers(sellersData)
      setOutsideAdmins(outsideData)
      setCustomRoles(rolesData)
      setExternals(externalsData)
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

  // Financiamento externo conta quando o banco paga a loja
  const periodExternals = useMemo(
    () => externals.filter((e) => e.status === 'pago' && inRange(e.paidOn || e.submittedOn, { start: range.start, end: range.end })),
    [externals, range.start, range.end]
  )

  const statsBySeller = useMemo(() => {
    const map = {}
    const ensure = (id) => (map[id] ||= { count: 0, revenue: 0, commission: 0, lastSale: null, externals: 0 })
    for (const s of periodSales) {
      if (!s.sellerId) continue
      const st = ensure(s.sellerId)
      st.count += 1
      st.revenue += s.salePrice
      st.commission += s.commissionAmount
      if (!st.lastSale || s.saleDate > st.lastSale) st.lastSale = s.saleDate
    }
    for (const e of periodExternals) {
      if (!e.sellerId) continue
      const st = ensure(e.sellerId)
      st.externals += 1
      st.commission += e.commissionAmount
    }
    return map
  }, [periodSales, periodExternals])

  // Comissões em aberto (qualquer data): vendas e financiamentos externos pagos
  const unpaidBySeller = useMemo(() => {
    const map = {}
    const ensure = (id) => (map[id] ||= { sales: [], externals: [], total: 0 })
    for (const s of sales) {
      if (!s.sellerId || !s.commissionAmount || s.commissionPaidOn) continue
      const u = ensure(s.sellerId)
      u.sales.push(s)
      u.total += s.commissionAmount
    }
    for (const e of externals) {
      if (!e.sellerId || e.status !== 'pago' || !e.commissionAmount || e.commissionPaidOn) continue
      const u = ensure(e.sellerId)
      u.externals.push(e)
      u.total += e.commissionAmount
    }
    return map
  }, [sales, externals])

  // Quem foi excluído só aparece se tiver vendas no período (para os números
  // da tabela baterem com os totais)
  const listed = sellers.filter((s) => !s.deletedAt || statsBySeller[s.id])

  const totals = Object.values(statsBySeller).reduce(
    (acc, st) => ({ count: acc.count + st.count, revenue: acc.revenue + st.revenue, commission: acc.commission + st.commission }),
    { count: 0, revenue: 0, commission: 0 }
  )

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const formCustomRole = customRoles.find((r) => r.id === form.customRoleId) || null

  // Troca de cargo no formulário: com cargo personalizado, o nível é o do
  // cargo; o menu próprio perde as abas que o novo nível não tem
  function changeCargo(value) {
    const custom = value.startsWith('custom:') ? customRoles.find((r) => r.id === value.slice(7)) : null
    const role = custom ? custom.baseRole : ['manager', 'admin'].includes(value) ? value : 'seller'
    const allowed = tabsForRole(role).map((t) => t.key)
    setForm((prev) => ({
      ...prev,
      role,
      customRoleId: custom ? custom.id : null,
      // O administrador vê o menu inteiro (sem menu próprio)
      panelTabs: role !== 'admin' && Array.isArray(prev.panelTabs) ? prev.panelTabs.filter((k) => allowed.includes(k)) : null,
    }))
  }

  function toggleMenuTab(key) {
    setForm((prev) => {
      const tabs = prev.panelTabs || []
      return { ...prev, panelTabs: tabs.includes(key) ? tabs.filter((k) => k !== key) : [...tabs, key] }
    })
  }

  // "Escolher as abas" começa com o que a pessoa vê hoje pelo cargo
  function setOwnMenu(own) {
    if (!own) {
      update('panelTabs', null)
      return
    }
    const options = tabsForRole(form.role).map((t) => t.key)
    update('panelTabs', formCustomRole ? formCustomRole.tabs.filter((k) => options.includes(k)) : options)
  }

  function startEdit(seller) {
    setEditingId(seller.id)
    setFormError('')
    setFormSuccess('')
    const hasCommission = seller.commissionType !== 'none'
    setForm({
      role: seller.role,
      customRoleId: seller.customRoleId,
      panelTabs: seller.panelTabs,
      name: seller.name,
      email: seller.email,
      phone: seller.phone,
      password: '',
      hasCommission,
      commissionType: hasCommission ? seller.commissionType : 'percent',
      commissionValue: hasCommission ? String(seller.commissionValue).replace('.', ',') : '',
      financeAccess: seller.financeAccess,
      active: seller.active,
      extCommissionType: seller.extCommissionType || 'none',
      extCommissionValue: seller.extCommissionType && seller.extCommissionType !== 'none' ? String(seller.extCommissionValue).replace('.', ',') : '',
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
    const extCommissionType = form.extCommissionType || 'none'
    const extCommissionValue = extCommissionType === 'none' || form.extCommissionValue === '' ? 0 : parseCommission(form.extCommissionValue)
    if (Number.isNaN(extCommissionValue) || extCommissionValue < 0) {
      setFormError('Valor da comissão de financiamento externo inválido.')
      return
    }
    if (extCommissionType !== 'none' && extCommissionValue === 0) {
      setFormError('Informe o valor da comissão de financiamento externo (ou escolha "Não recebe").')
      return
    }
    if (extCommissionType.startsWith('percent') && extCommissionValue > 100) {
      setFormError('A comissão de financiamento externo em % não pode passar de 100.')
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

    // Troca de cargo: confirma dizendo o que muda no acesso
    const before = editingId ? sellers.find((s) => s.id === editingId) : null
    if (before && cargoValue(before.role, before.customRoleId) !== cargoValue(form.role, form.customRoleId)) {
      const from = roleLabel(before.role, before.customRole)
      const to = roleLabel(form.role, formCustomRole)
      const access = before.role !== form.role ? ` Com ${accessLabel(form.role)}, ${ACCESS_TEXT[form.role]}.` : ''
      const ok = await confirm(`${before.name} passa de ${from} para ${to}.${access} A pessoa vê o menu novo ao recarregar o painel.`, {
        title: 'Mudar o cargo',
        confirmLabel: 'Mudar cargo',
      })
      if (!ok) return
    }

    setSaving(true)
    try {
      if (editingId) {
        const saved = await updateSeller(editingId, { ...form, commissionType, commissionValue, extCommissionType, extCommissionValue })
        setSellers((prev) => prev.map((s) => (s.id === editingId ? saved : s)))
        setFormSuccess(`${roleLabel(saved.role, saved.customRole)} "${saved.name}" atualizado.`)
        cancelEdit()
      } else {
        const created = await createSeller({ ...form, commissionType, commissionValue, extCommissionType, extCommissionValue })
        setSellers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        setFormSuccess(`${roleLabel(created.role, created.customRole)} "${created.name}" cadastrado. Já pode entrar no painel com o e-mail ${created.email}.`)
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
    // O administrador continua entrando no painel: desativar só tira da Equipe
    // (WhatsApp dos carros, rodízio e listas de vendedores)
    const msg = seller.role === 'admin'
      ? next
        ? `Reativar "${seller.name}" na Equipe? Ele volta a aparecer no WhatsApp dos carros, no rodízio e nas vendas.`
        : `Desativar "${seller.name}" na Equipe? Ele sai do WhatsApp dos carros, do rodízio e das listas de vendedores, mas continua administrador e entrando no painel. Para tirar o acesso, mude o cargo ou use Excluir.`
      : next
        ? `Reativar "${seller.name}"? Ele volta a conseguir entrar no painel.`
        : `Desativar "${seller.name}"? Ele perde o acesso ao painel na hora. As vendas dele continuam registradas.`
    const label = next ? 'Reativar' : 'Desativar'
    if (!(await confirm(msg, { title: `${label} ${roleLabel(seller.role, seller.customRole).toLowerCase()}`, confirmLabel: label }))) return
    try {
      const saved = await updateSeller(seller.id, { ...seller, active: next })
      setSellers((prev) => prev.map((s) => (s.id === seller.id ? saved : s)))
    } catch (err) {
      alert('Não foi possível atualizar: ' + err.message)
    }
  }

  async function handleDelete(seller) {
    const salesCount = sales.filter((s) => s.sellerId === seller.id).length
    const history = salesCount
      ? ` ${salesCount === 1 ? 'A venda dele continua' : `As ${salesCount} vendas dele continuam`} no histórico, com o nome e a comissão.`
      : ''
    const msg = `Excluir "${seller.name}"? O login dele é apagado e ele sai da equipe.${history} Não dá para desfazer. Se for só um afastamento, use Desativar.`
    if (!(await confirm(msg, { title: `Excluir ${roleLabel(seller.role, seller.customRole).toLowerCase()}`, confirmLabel: 'Excluir' }))) return
    try {
      const saved = await deleteSeller(seller.id)
      setSellers((prev) => prev.map((s) => (s.id === seller.id ? saved : s)))
      if (editingId === seller.id) cancelEdit()
      setFormSuccess(`${roleLabel(seller.role, seller.customRole)} "${seller.name}" excluído da equipe.`)
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
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

  // Põe um administrador (vinculado pelo SQL) na Equipe, com nome e telefone
  async function includeAdmin(userId, name, phone) {
    const added = await addAdminToTeam(userId, name.trim(), phone)
    setSellers((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)))
    setOutsideAdmins((prev) => prev.filter((a) => a.userId !== userId))
    setFormSuccess(
      `${added.name} entrou na Equipe como administrador. ${added.phone ? 'Já pode ser escolhido no WhatsApp do carro e no rodízio.' : 'Coloque o telefone dele (Editar) para aparecer no WhatsApp do carro.'}`
    )
  }

  function openReset(seller) {
    setResetFor(seller)
    setResetPassword('')
    setResetError('')
  }

  // Ninguém muda o próprio nível (o banco também confere)
  const editingSelf = Boolean(editingId) && sellers.find((s) => s.id === editingId)?.userId === user?.id

  const detailSeller = sellers.find((s) => s.id === detailId)
  const detailSales = periodSales.filter((s) => s.sellerId === detailId)

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Equipe</h1>
          <p>Vendedores, gerentes, administradores e cargos da loja: acesso ao painel, vendas e comissões</p>
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

      {isAdmin && outsideAdmins.length > 0 && <OutsideAdmins admins={outsideAdmins} onInclude={includeAdmin} />}

      {isAdmin && (
      <form className="admin-form admin-form-section" onSubmit={handleSubmit}>
        <h2>{editingId ? `Editar ${roleLabel(form.role, formCustomRole).toLowerCase()}` : 'Nova pessoa na equipe'}</h2>
        <div className="admin-form-grid admin-form-grid-3">
          <label>
            Cargo
            <select
              value={cargoValue(form.role, form.customRoleId)}
              onChange={(e) => changeCargo(e.target.value)}
              disabled={editingSelf}
              title={editingSelf ? 'Você não pode mudar o seu próprio nível' : undefined}
            >
              <option value="seller">Vendedor</option>
              <option value="manager">Gerente</option>
              <option value="admin">Administrador</option>
              {customRoles.length > 0 && (
                <optgroup label="Cargos da loja">
                  {customRoles.map((r) => (
                    <option key={r.id} value={`custom:${r.id}`}>
                      {r.name} ({accessLabel(r.baseRole)})
                    </option>
                  ))}
                </optgroup>
              )}
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
            <input value={form.phone} onChange={(e) => update('phone', maskKeepingCaret(e, maskPhoneBR))} placeholder="(00) 00000-0000" />
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
            {form.commissionType === 'percent' ? 'Comissão (%)' : 'Comissão por carro'}
            {form.commissionType === 'percent' ? (
              <input
                inputMode="decimal"
                value={form.commissionValue}
                onChange={(e) => update('commissionValue', e.target.value)}
                placeholder="Ex: 1,5"
              />
            ) : (
              <MoneyInput cents value={form.commissionValue} onChange={(v) => update('commissionValue', v)} placeholder="Ex: 500" />
            )}
          </label>
          )}
          <label>
            Comissão de financiamento externo
            <select value={form.extCommissionType} onChange={(e) => update('extCommissionType', e.target.value)}>
              {EXT_COMMISSION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          {form.extCommissionType !== 'none' && (
            <label>
              {form.extCommissionType === 'fixed' ? 'Valor por financiamento' : 'Percentual (%)'}
              {form.extCommissionType === 'fixed' ? (
                <MoneyInput cents value={form.extCommissionValue} onChange={(v) => update('extCommissionValue', v)} placeholder="Ex: 300" />
              ) : (
                <input
                  inputMode="decimal"
                  value={form.extCommissionValue}
                  onChange={(e) => update('extCommissionValue', e.target.value)}
                  placeholder="Ex: 1"
                />
              )}
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
        {form.role === 'admin' && (
          <p className="admin-form-note member-admin-note">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>
              O administrador vê e gerencia tudo da loja: custos, Financeiro, Equipe e Configurações. Ele pode criar, mudar e
              excluir outros administradores; a loja sempre fica com pelo menos um, e ninguém muda o próprio nível.
              {editingSelf && ' Este é o seu acesso: o cargo só pode ser mudado por outro administrador.'}
            </span>
          </p>
        )}
        {form.role !== 'admin' && (
        <div className="member-menu">
          <span className="admin-field-label">Menu desta pessoa</span>
          <div className="admin-segmented" role="radiogroup" aria-label="Menu desta pessoa">
            <button
              type="button"
              role="radio"
              aria-checked={!Array.isArray(form.panelTabs)}
              className={!Array.isArray(form.panelTabs) ? 'is-active' : ''}
              onClick={() => setOwnMenu(false)}
            >
              Seguir o cargo
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={Array.isArray(form.panelTabs)}
              className={Array.isArray(form.panelTabs) ? 'is-active' : ''}
              onClick={() => setOwnMenu(true)}
            >
              Escolher as abas
            </button>
          </div>
          {Array.isArray(form.panelTabs) ? (
            <div className="settings-checks">
              {tabsForRole(form.role).map((t) => (
                <label key={t.key} className="admin-checkbox">
                  <input type="checkbox" checked={form.panelTabs.includes(t.key)} onChange={() => toggleMenuTab(t.key)} />
                  {t.label}
                </label>
              ))}
            </div>
          ) : (
            <p className="admin-form-note">
              {formCustomRole
                ? `Vê as abas do cargo ${formCustomRole.name} (Configurações → Painel → Cargos da loja).`
                : `Vê as abas de ${form.role === 'manager' ? 'gerente' : 'vendedor'} marcadas em Configurações → Painel.`}
            </p>
          )}
        </div>
        )}
        {editingId && (
          <p className="admin-form-note">
            O e-mail de login não muda por aqui. Mudar a comissão vale só para as próximas vendas — as já registradas mantêm a comissão da época.
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
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : `Cadastrar ${roleLabel(form.role, formCustomRole).toLowerCase()}`}
          </button>
        </div>
      </form>
      )}
      {!isAdmin && formSuccess && <p className="admin-success">{formSuccess}</p>}

      <h2 className="admin-section-title">Desempenho no período</h2>
      {listed.length === 0 ? (
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
                  <th title="Financiamentos externos pagos no período">Financ. externos</th>
                  {canSeeSaleValues && <th>Faturamento</th>}
                  {canSeeSaleValues && <th>Comissão no período</th>}
                  {canSeeSaleValues && <th title="Comissões ainda não pagas, de qualquer data">Em aberto</th>}
                  <th>Última venda</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listed.map((s) => {
                  const st = statsBySeller[s.id] || { count: 0, revenue: 0, commission: 0, lastSale: null, externals: 0 }
                  const unpaid = unpaidBySeller[s.id]
                  return (
                    <tr key={s.id} className={!s.active ? 'is-hidden-row' : ''}>
                      <td>
                        <strong>{s.name}</strong>
                        <span className="admin-table-sub">{s.email}{s.phone ? ` · ${s.phone}` : ''}</span>
                      </td>
                      <td>
                        <span className={`admin-role-pill role-${s.role}`}>{roleLabel(s.role, s.customRole)}</span>
                        {s.customRole && <span className="admin-table-sub">{accessLabel(s.role)}</span>}
                        {s.role === 'manager' && isAdmin && <span className="admin-table-sub">{financeAccessLabel(s.financeAccess)}</span>}
                      </td>
                      {canSeeSaleValues && (
                        <td>
                          {describeCommission(s)}
                          {s.extCommissionType !== 'none' && (
                            <span className="admin-table-sub">Financ. externo: {describeExternalCommission(s.extCommissionType, s.extCommissionValue)}</span>
                          )}
                        </td>
                      )}
                      <td>{st.count}</td>
                      <td>{st.externals}</td>
                      {canSeeSaleValues && <td>{formatCurrency(st.revenue)}</td>}
                      {canSeeSaleValues && <td>{formatCurrencyCents(st.commission)}</td>}
                      {canSeeSaleValues && (
                        <td>
                          {unpaid ? formatCurrencyCents(unpaid.total) : '—'}
                          {unpaid && isAdmin && (
                            <button type="button" className="admin-link-btn" onClick={() => setCommissionsFor(s)}>
                              <HandCoins size={13} /> Marcar pagas
                            </button>
                          )}
                        </td>
                      )}
                      <td>{st.lastSale ? formatDateBR(st.lastSale) : '—'}</td>
                      <td>
                        <StatusPill seller={s} />
                      </td>
                      <td>
                        <SellerActions
                          seller={s}
                          onDetail={() => setDetailId(detailId === s.id ? null : s.id)}
                          onEdit={() => startEdit(s)}
                          onReset={() => openReset(s)}
                          onToggle={() => toggleActive(s)}
                          onDelete={() => handleDelete(s)}
                          detailOpen={detailId === s.id}
                          canManage={isAdmin}
                          isSelf={Boolean(s.userId) && s.userId === user?.id}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {listed.map((s) => {
              const st = statsBySeller[s.id] || { count: 0, revenue: 0, commission: 0, lastSale: null, externals: 0 }
              const unpaid = unpaidBySeller[s.id]
              return (
                <div className={`admin-card ${!s.active ? 'is-hidden-row' : ''}`} key={s.id}>
                  <div className="admin-card-top">
                    <div className="admin-card-title">
                      <strong>{s.name}</strong>
                      <span className="admin-table-sub">{s.email}</span>
                      <span className="admin-card-meta">
                        {roleLabel(s.role, s.customRole)}
                        {s.customRole ? ` (${accessLabel(s.role)})` : ''}
                        {canSeeSaleValues ? ` · ${describeCommission(s)}` : ''}
                        {s.role === 'manager' && isAdmin ? ` · ${financeAccessLabel(s.financeAccess).toLowerCase()}` : ''}
                      </span>
                    </div>
                    <StatusPill seller={s} />
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
                    {canSeeSaleValues && unpaid && (
                      <div>
                        <span>Em aberto</span>
                        <strong>{formatCurrencyCents(unpaid.total)}</strong>
                      </div>
                    )}
                  </div>
                  {canSeeSaleValues && unpaid && isAdmin && (
                    <button type="button" className="admin-link-btn" onClick={() => setCommissionsFor(s)}>
                      <HandCoins size={13} /> Marcar comissões como pagas
                    </button>
                  )}
                  <SellerActions
                    seller={s}
                    onDetail={() => setDetailId(detailId === s.id ? null : s.id)}
                    onEdit={() => startEdit(s)}
                    onReset={() => openReset(s)}
                    onToggle={() => toggleActive(s)}
                    onDelete={() => handleDelete(s)}
                    detailOpen={detailId === s.id}
                    canManage={isAdmin}
                    isSelf={Boolean(s.userId) && s.userId === user?.id}
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
      {commissionsFor && (
        <CommissionsDialog
          seller={commissionsFor}
          sales={unpaidBySeller[commissionsFor.id]?.sales || []}
          externals={unpaidBySeller[commissionsFor.id]?.externals || []}
          carsById={carsById}
          saving={savingCommissions}
          onClose={() => setCommissionsFor(null)}
          onConfirm={async ({ saleIds, externalIds, paidOn }) => {
            setSavingCommissions(true)
            try {
              await markCommissionsPaid({ saleIds, externalIds, paidOn })
              setSales((prev) => prev.map((x) => (saleIds.includes(x.id) ? { ...x, commissionPaidOn: paidOn } : x)))
              setExternals((prev) => prev.map((x) => (externalIds.includes(x.id) ? { ...x, commissionPaidOn: paidOn } : x)))
              setFormSuccess(`Comissões de ${commissionsFor.name} marcadas como pagas.`)
              setCommissionsFor(null)
            } catch (err) {
              alert('Não foi possível marcar as comissões: ' + err.message)
            } finally {
              setSavingCommissions(false)
            }
          }}
        />
      )}
      {confirmDialog}
    </div>
  )
}

function StatusPill({ seller }) {
  if (seller.deletedAt) return <span className="admin-status-pill is-off">Excluído</span>
  return <span className={`admin-status-pill ${seller.active ? 'is-on' : 'is-off'}`}>{seller.active ? 'Ativo' : 'Inativo'}</span>
}

function SellerActions({ seller, onDetail, onEdit, onReset, onToggle, onDelete, detailOpen, canManage, isSelf }) {
  return (
    <div className="admin-action-group">
      <button type="button" className={`admin-action-btn ${detailOpen ? 'is-active' : ''}`} onClick={onDetail}>
        <ListChecks size={15} /> Vendas
      </button>
      {canManage && !seller.deletedAt && (
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
      {!isSelf && (
      <button type="button" className="admin-action-btn admin-action-danger" onClick={onDelete}>
        <Trash2 size={15} /> Excluir
      </button>
      )}
      </>
      )}
    </div>
  )
}

// Administradores vinculados à loja (pelo SQL, por exemplo) que ainda não estão
// na Equipe: sem o cadastro aqui eles não aparecem no WhatsApp do carro, no
// rodízio nem nas vendas. Qualquer administrador inclui com nome e telefone.
function OutsideAdmins({ admins, onInclude }) {
  return (
    <section className="admin-form-section admins-outside" aria-labelledby="admins-outside-title">
      <h2 id="admins-outside-title">Administradores fora da Equipe</h2>
      <p className="admin-form-note">
        Estes logins são administradores da loja, mas ainda não estão na Equipe. Inclua com o nome e o telefone para que
        apareçam no WhatsApp do carro, no rodízio e nas vendas.
      </p>
      <ul className="admins-outside-list">
        {admins.map((a) => (
          <OutsideAdminRow key={a.userId} admin={a} onInclude={onInclude} />
        ))}
      </ul>
    </section>
  )
}

function OutsideAdminRow({ admin, onInclude }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Informe o nome.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onInclude(admin.userId, name, phone)
    } catch (err) {
      setError(err.message || 'Não foi possível incluir na Equipe.')
      setSaving(false)
    }
  }

  return (
    <li>
      <form className="admin-form admins-outside-row" onSubmit={submit}>
        <span className="admins-outside-email">
          <ShieldCheck size={15} aria-hidden="true" />
          <strong>{admin.email || 'Login sem e-mail'}</strong>
          {admin.me && <span className="admin-table-sub">(você)</span>}
        </span>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" required />
        </label>
        <label>
          Telefone (WhatsApp)
          <input value={phone} onChange={(e) => setPhone(maskKeepingCaret(e, maskPhoneBR))} placeholder="(00) 00000-0000" inputMode="tel" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <UserPlus size={15} /> {saving ? 'Incluindo…' : 'Incluir na equipe'}
        </button>
        {error && <p className="admin-error">{error}</p>}
      </form>
    </li>
  )
}
