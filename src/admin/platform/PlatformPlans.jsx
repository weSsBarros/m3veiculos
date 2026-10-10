import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { fetchPlans, savePlan, deletePlan, fetchClients } from '../../lib/clientsApi.js'
import { money } from '../../utils/billing.js'
import { PANEL_TABS } from '../../utils/panelSettings.js'
import useConfirm from '../../components/useConfirm.jsx'
import { MoneyInput } from '../../components/NumberInputs.jsx'
import '../admin.css'

const EMPTY = { id: null, name: '', monthlyPrice: '', features: PANEL_TABS.map((t) => t.key), active: true }
const priceInput = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
// Abas do plano (features pode ter chaves que não são abas)
const tabCount = (features) => features.filter((k) => PANEL_TABS.some((t) => t.key === k)).length

// Painel WB.Dev → Planos: nome, valor e as abas que o plano libera no painel
// da loja (as que ficam de fora somem do menu de todos, inclusive do admin)
export default function PlatformPlans() {
  const { confirm, confirmDialog } = useConfirm()
  const [plans, setPlans] = useState([])
  const [clients, setClients] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [p, c] = await Promise.all([fetchPlans(), fetchClients()])
      setPlans(p)
      setClients(c)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os planos.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const usersOf = (id) => clients.filter((c) => c.account.planId === id)

  async function submit(e) {
    e.preventDefault()
    const text = String(form.monthlyPrice).trim()
    const price = text ? Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text) : null
    if (!form.name.trim() || (price !== null && (!Number.isFinite(price) || price < 0))) {
      setError('Confira o nome e o valor do plano.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await savePlan({ ...form, monthlyPrice: price })
      setForm(null)
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o plano.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(plan) {
    const users = usersOf(plan.id)
    const ok = await confirm(
      users.length > 0
        ? `${users.map((c) => c.name).join(', ')} ${users.length === 1 ? 'fica' : 'ficam'} sem plano (com todas as abas liberadas) até você escolher outro.`
        : 'Nenhuma loja usa este plano.',
      { title: `Excluir o plano "${plan.name}"`, confirmLabel: 'Excluir' }
    )
    if (!ok) return
    try {
      await deletePlan(plan.id)
      await load()
    } catch (err) {
      setError(err.message || 'Não foi possível excluir.')
    }
  }

  function toggleFeature(key) {
    setForm((f) => ({ ...f, features: f.features.includes(key) ? f.features.filter((k) => k !== key) : [...f.features, key] }))
  }

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Planos</h1>
          <p>Planos do sistema: valor e as abas que cada plano libera no painel da loja.</p>
        </div>
        {!form && (
          <button type="button" className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}>
            <Plus size={15} /> Novo plano
          </button>
        )}
      </div>
      {error && <p className="admin-error">{error}</p>}

      {form && (
        <form className="admin-form admin-form-section" onSubmit={submit}>
          <h2>{form.id ? 'Editar plano' : 'Novo plano'}</h2>
          <div className="admin-form-grid admin-form-grid-3">
            <label>
              Nome
              <input value={form.name} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Básico" />
            </label>
            <label>
              Valor mensal
              <MoneyInput cents value={form.monthlyPrice} onChange={(v) => setForm((f) => ({ ...f, monthlyPrice: v }))} placeholder="Ex: 199,90" />
            </label>
          </div>
          <div>
            <span className="admin-field-label">Abas liberadas</span>
            <div className="settings-checks">
              {PANEL_TABS.map((t) => (
                <label key={t.key} className="admin-checkbox">
                  <input type="checkbox" checked={form.features.includes(t.key)} onChange={() => toggleFeature(t.key)} />
                  {t.label}
                </label>
              ))}
            </div>
            <p className="admin-form-note">O início do painel e as Configurações sempre aparecem. As abas fora do plano somem para todos da loja, inclusive o admin.</p>
          </div>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar plano'}
            </button>
          </div>
        </form>
      )}

      <ul className="client-notices">
        {plans.map((p) => {
          const users = usersOf(p.id)
          return (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <span className="admin-table-sub">
                  {p.monthlyPrice ? money(p.monthlyPrice) : 'sem valor'} · {users.length === 1 ? '1 loja' : `${users.length} lojas`} ·{' '}
                  {tabCount(p.features) === PANEL_TABS.length ? 'todas as abas' : `${tabCount(p.features)} de ${PANEL_TABS.length} abas`}                </span>
                {tabCount(p.features) < PANEL_TABS.length && (
                  <p>Fora do plano: {PANEL_TABS.filter((t) => !p.features.includes(t.key)).map((t) => t.label).join(', ')}</p>
                )}
              </div>
              <div className="admin-row-actions">
                <button type="button" className="admin-action-btn" onClick={() => setForm({ ...p, monthlyPrice: priceInput(p.monthlyPrice) })}>
                  <Pencil size={14} /> Editar
                </button>
                <button type="button" className="admin-action-btn admin-action-danger" onClick={() => remove(p)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {confirmDialog}
    </div>
  )
}
