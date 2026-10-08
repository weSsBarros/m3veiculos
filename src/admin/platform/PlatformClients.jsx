import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RefreshCcw, ExternalLink, Plus } from 'lucide-react'
import { fetchClients, fetchPlans, createClient } from '../../lib/clientsApi.js'
import { fetchPlatformOverview } from '../../lib/platformApi.js'
import { platformRange, storeHealth, lastUseText } from '../../utils/platform.js'
import { money, domainAlert, implantationDays } from '../../utils/billing.js'
import { slugify } from '../../utils/carFormat.js'
import { parseMoneyBR } from '../../utils/financing.js'
import { maskPhoneBR, maskKeepingCaret } from '../../utils/masks.js'
import { MoneyInput } from '../../components/NumberInputs.jsx'
import { HealthPill } from './PlatformParts.jsx'
import { StatusPill, BillingPill } from './ClientParts.jsx'
import '../admin.css'

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'atrasados', label: 'Atrasados', test: (c) => c.billing.situation === 'atrasado' },
  { key: 'vencendo', label: 'Vencendo', test: (c) => ['vence_em_breve', 'vence_hoje'].includes(c.billing.situation) },
  { key: 'implantacao', label: 'Em implantação', test: (c) => c.account.status === 'implantacao' },
  { key: 'bloqueados', label: 'Bloqueados', test: (c) => ['bloqueado', 'cancelado'].includes(c.account.status) },
  { key: 'sem-cobranca', label: 'Sem cobrança', test: (c) => c.billing.situation === 'sem_cobranca' && c.account.status === 'ativo' },
]

const EMPTY_NEW = { name: '', slug: '', slugTouched: false, responsibleName: '', responsiblePhone: '', responsibleEmail: '', planId: '', monthlyPrice: '', dueDay: '' }
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

// Painel WB.Dev → Clientes: situação do serviço, mensalidade e saúde de cada loja
export default function PlatformClients() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [creating, setCreating] = useState(null)
  const [createError, setCreateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState([])
  const [stores, setStores] = useState([])
  const [filter, setFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, s, p] = await Promise.all([fetchClients(), fetchPlatformOverview(platformRange('30d')).catch(() => []), fetchPlans().catch(() => [])])
      setClients(c)
      setStores(s)
      setPlans(p)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const storeById = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s])), [stores])
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.test ? clients.filter(f.test).length : clients.length])),
    [clients]
  )
  const shown = clients.filter(FILTERS.find((f) => f.key === filter).test || (() => true))

  function updateNew(key, value) {
    setCreating((f) => {
      const next = { ...f, [key]: value }
      // o endereço interno acompanha o nome até a pessoa mexer nele
      if (key === 'name' && !f.slugTouched) next.slug = slugify(value)
      if (key === 'slug') next.slugTouched = true
      return next
    })
  }

  function openNew() {
    setCreating({ ...EMPTY_NEW, planId: plans.find((p) => p.name === 'Completo')?.id || plans[0]?.id || '' })
    setCreateError('')
  }

  async function submitNew(e) {
    e.preventDefault()
    if (creating.name.trim().length < 2) {
      setCreateError('Informe o nome da loja.')
      return
    }
    setSaving(true)
    setCreateError('')
    try {
      const created = await createClient({
        ...creating,
        monthlyPrice: creating.monthlyPrice ? parseMoneyBR(creating.monthlyPrice) : null,
        dueDay: creating.dueDay ? Number(creating.dueDay) : null,
      })
      navigate(`/wbdev/clientes/${created.slug}`)
    } catch (err) {
      setCreateError(err.message || 'Não foi possível cadastrar o cliente.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Clientes</h1>
          <p>Os clientes do sistema: serviço, mensalidade e como cada loja está usando.</p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-primary" onClick={openNew}>
            <Plus size={15} /> Novo cliente
          </button>
          <button type="button" className="btn btn-outline" onClick={load} aria-label="Atualizar">
            <RefreshCcw size={15} />
          </button>
        </div>
      </div>

      {creating && (
        <form className="admin-form admin-form-section" onSubmit={submitNew}>
          <h2>Novo cliente</h2>
          <p className="admin-form-hint">
            Entra "Em implantação", sem cobrança. Quando você ativar, a 1ª mensalidade vence no dia da ativação e depois todo
            mês nesse dia (ou no dia que escolher abaixo). O site e o painel da loja são montados depois e ligados a este cadastro.
          </p>
          <div className="admin-form-grid admin-form-grid-3">
            <label>
              Nome da loja
              <input value={creating.name} onChange={(e) => updateNew('name', e.target.value)} placeholder="Ex.: Auto Center Silva" autoFocus required />
            </label>
            <label>
              Endereço interno
              <input value={creating.slug} onChange={(e) => updateNew('slug', slugify(e.target.value))} placeholder="auto-center-silva" required />
            </label>
            <label>
              Responsável
              <input value={creating.responsibleName} onChange={(e) => updateNew('responsibleName', e.target.value)} />
            </label>
            <label>
              Telefone / WhatsApp do responsável
              <input
                inputMode="numeric"
                value={creating.responsiblePhone}
                onChange={(e) => updateNew('responsiblePhone', maskKeepingCaret(e, maskPhoneBR))}
                placeholder="(00) 00000-0000"
              />
            </label>
            <label>
              E-mail do responsável
              <input type="email" value={creating.responsibleEmail} onChange={(e) => updateNew('responsibleEmail', e.target.value)} />
            </label>
            <label>
              Plano
              <select value={creating.planId} onChange={(e) => updateNew('planId', e.target.value)}>
                {plans.length === 0 && <option value="">Completo (padrão)</option>}
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.monthlyPrice ? ` · ${money(p.monthlyPrice)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mensalidade
              <MoneyInput cents value={creating.monthlyPrice} onChange={(v) => updateNew('monthlyPrice', v)} placeholder="Em branco = valor do plano" />
            </label>
            <label>
              Dia do vencimento
              <select value={creating.dueDay} onChange={(e) => updateNew('dueDay', e.target.value)}>
                <option value="">Automático (dia da ativação)</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    Dia {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {createError && <p className="admin-error">{createError}</p>}
          <div className="admin-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setCreating(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Cadastrando…' : 'Cadastrar cliente'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="admin-error">{error}</p>}
      <div className="admin-chip-row" role="tablist" aria-label="Filtrar clientes">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            className={`admin-chip ${filter === f.key ? 'is-active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <b>{counts[f.key] || 0}</b>
          </button>
        ))}
      </div>

      {loading && clients.length === 0 ? (
        <p className="admin-muted">Carregando…</p>
      ) : shown.length === 0 ? (
        <p className="admin-muted">Nenhum cliente neste filtro.</p>
      ) : (
        <div className="client-grid">
          {shown.map((c) => {
            const store = storeById[c.companyId]
            const health = store ? storeHealth(store) : null
            const price = c.billing.price ?? c.account.monthlyPrice ?? c.plan?.monthlyPrice
            const domain = domainAlert(c.account)
            const implanting = c.account.status === 'implantacao' ? implantationDays(c.account) : null
            return (
              <Link key={c.companyId} to={`/wbdev/clientes/${c.slug}`} className="client-card">
                <div className="client-card-head">
                  <strong>{c.name}</strong>
                  <StatusPill status={c.account.status} />
                </div>
                <div className="client-card-pills">
                  <BillingPill billing={c.billing} />
                  {health && <HealthPill level={health.level} />}
                </div>
                <dl className="client-card-data">
                  <div>
                    <dt>Plano</dt>
                    <dd>{c.plan?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt>Mensalidade</dt>
                    <dd>{price ? money(price) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Vencimento</dt>
                    <dd>
                      {c.billing.due_day
                        ? `dia ${c.billing.due_day}${c.billing.due_day_auto ? ' (auto)' : ''}`
                        : c.account.status === 'implantacao'
                          ? 'após ativar'
                          : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Uso</dt>
                    <dd>{store ? lastUseText(store) : '—'}</dd>
                  </div>
                </dl>
                {implanting && (
                  <span className="client-card-note">
                    Em implantação há {implanting.days} {implanting.days === 1 ? 'dia' : 'dias'}
                  </span>
                )}
                {domain && <span className="client-card-warn">{domain}</span>}
                {c.siteUrl && (
                  <span className="client-card-site">
                    {c.siteUrl.replace('https://', '')} <ExternalLink size={12} />
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
