import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, ExternalLink } from 'lucide-react'
import { fetchClients } from '../../lib/clientsApi.js'
import { fetchPlatformOverview } from '../../lib/platformApi.js'
import { platformRange, storeHealth, lastUseText } from '../../utils/platform.js'
import { money, domainAlert } from '../../utils/billing.js'
import { HealthPill } from './PlatformParts.jsx'
import { StatusPill, BillingPill } from './ClientParts.jsx'
import PlatformTabs from './PlatformTabs.jsx'
import '../admin.css'

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'atrasados', label: 'Atrasados', test: (c) => c.billing.situation === 'atrasado' },
  { key: 'vencendo', label: 'Vencendo', test: (c) => ['vence_em_breve', 'vence_hoje'].includes(c.billing.situation) },
  { key: 'bloqueados', label: 'Bloqueados', test: (c) => c.account.status !== 'ativo' },
  { key: 'sem-cobranca', label: 'Sem cobrança', test: (c) => c.billing.situation === 'sem_cobranca' && c.account.status === 'ativo' },
]

// Painel WB.Dev → Clientes: situação do serviço, mensalidade e saúde de cada loja
export default function PlatformClients() {
  const [clients, setClients] = useState([])
  const [stores, setStores] = useState([])
  const [filter, setFilter] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [c, s] = await Promise.all([fetchClients(), fetchPlatformOverview(platformRange('30d')).catch(() => [])])
      setClients(c)
      setStores(s)
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

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Plataforma</h1>
          <p>Os clientes do sistema: serviço, mensalidade e como cada loja está usando.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>
      <PlatformTabs />

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
            return (
              <Link key={c.companyId} to={`/admin/plataforma/clientes/${c.slug}`} className="client-card">
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
                    <dd>{c.account.dueDay ? `dia ${c.account.dueDay}` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Uso</dt>
                    <dd>{store ? lastUseText(store) : '—'}</dd>
                  </div>
                </dl>
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
