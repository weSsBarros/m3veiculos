import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, Presentation, FileDown, Sheet, Maximize2, ExternalLink, Globe } from 'lucide-react'
import { fetchPlatformOverview } from '../../lib/platformApi.js'
import { fetchClients } from '../../lib/clientsApi.js'
import { domainAlert, domainRegistrarLabel, domainPayerLabel, dateBR } from '../../utils/billing.js'
import { usePresentation, setPresentation, setPresentationNames } from './presentation.js'
import {
  storeHealth,
  platformTotals,
  featureUsage,
  FEATURES,
  COMPARE_COLUMNS,
  sortStores,
  lastUseText,
  HEALTH_LABELS,
  PLATFORM_PERIODS,
  platformRange,
} from '../../utils/platform.js'
import { exportReportExcel } from '../../utils/reports/export.js'
import { exportPlatformResultsPdf } from '../../utils/platformPdf.js'
import { Trend, HealthPill } from './PlatformParts.jsx'
import '../admin.css'

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-BR')
const LEVEL_ORDER = { red: 0, yellow: 1, green: 2 }

function resultItems(totals) {
  return [
    { label: 'Lojas usando o sistema', value: totals.stores, sub: `${totals.activeStores} com uso nos últimos 14 dias` },
    { label: 'Carros à venda nos sites', value: totals.available, sub: `${fmt(totals.inStock)} no estoque` },
    { label: 'Visitas nos sites', value: totals.visits, prev: totals.visitsPrev },
    { label: 'Pessoas que visitaram', value: totals.visitors, prev: totals.visitorsPrev },
    { label: 'Contatos pelo WhatsApp', value: totals.leads, prev: totals.leadsPrev },
    { label: 'Carros cadastrados', value: totals.added, prev: totals.addedPrev },
    { label: 'Carros vendidos', value: totals.sold, prev: totals.soldPrev },
    { label: 'Vendas com contato pelo site', value: totals.soldSite, prev: totals.soldSitePrev },
  ]
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const sinceText = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `no sistema desde ${MONTHS[d.getMonth()]}/${d.getFullYear()}`
}

// Modo apresentação: os resultados para mostrar a quem ainda não é cliente. Os
// totais e cada loja (com o nome, ou "Loja 1, 2..." se esconder os nomes), sem
// saúde, cobrança nem nada interno. "Tela cheia" esconde o menu.
function ShowcaseView({ stores, totals, period, setPeriod, periodLabel, loading, error }) {
  const { showNames } = usePresentation()
  const ref = useRef(null)
  const real = useMemo(
    () => [...stores].filter((s) => !s.isDemo).sort((a, b) => b.site.visits - a.site.visits || a.name.localeCompare(b.name)),
    [stores]
  )

  function fullScreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else ref.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="admin-page platform-page wbdev-showcase" ref={ref}>
      <div className="admin-page-head">
        <div>
          <span className="wbdev-showcase-brand">WB.Dev · sistema WB.AUTO</span>
          <h1>Resultados das lojas</h1>
          <p>
            {periodLabel} · {totals.stores} {totals.stores === 1 ? 'loja usa' : 'lojas usam'} o sistema. A setinha compara com o período anterior de
            mesmo tamanho.
          </p>
        </div>
        <div className="admin-row-actions wbdev-showcase-actions">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Período">
            {PLATFORM_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <label className="admin-checkbox wbdev-showcase-names">
            <input type="checkbox" checked={showNames} onChange={(e) => setPresentationNames(e.target.checked)} />
            Nomes das lojas
          </label>
          <button type="button" className="btn btn-outline" onClick={fullScreen}>
            <Maximize2 size={15} /> Tela cheia
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {loading && stores.length === 0 ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        <>
          <div className="platform-kpis wbdev-showcase-kpis">
            {resultItems(totals).map((item) => (
              <div key={item.label} className="platform-kpi">
                <span>{item.label}</span>
                <strong>{fmt(item.value)}</strong>
                {item.prev !== undefined ? <Trend prev={item.prev} value={item.value} /> : <small>{item.sub}</small>}
              </div>
            ))}
          </div>

          <h2 className="admin-section-title">Loja por loja</h2>
          <div className="wbdev-showcase-stores">
            {real.map((s, i) => (
              <div key={s.id} className="wbdev-showcase-store">
                <div className="wbdev-showcase-store-head">
                  <strong>{showNames ? s.name : `Loja ${i + 1}`}</strong>
                  <small>{sinceText(s.createdAt)}</small>
                  {showNames && s.siteUrl && (
                    <a href={s.siteUrl} target="_blank" rel="noreferrer" className="platform-site-link">
                      <Globe size={13} /> {s.siteUrl.replace(/^https?:\/\//, '')} <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <div className="platform-store-numbers">
                  <span>
                    <b>{fmt(s.site.visits)}</b> visitas no site
                  </span>
                  <span>
                    <b>{fmt(s.site.visitors)}</b> pessoas
                  </span>
                  <span>
                    <b>{fmt(s.leads.total)}</b> contatos no WhatsApp
                  </span>
                  <span>
                    <b>{fmt(s.stock.available)}</b> carros à venda
                  </span>
                  <span>
                    <b>{fmt(s.sales.sold)}</b> carros vendidos
                  </span>
                  <span>
                    <b>{fmt(s.sales.soldSite)}</b> vendas com contato pelo site
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="admin-form-hint">
            Números do período escolhido, contados pelo próprio sistema. Contatos pelo WhatsApp e vendas com contato pelo site contam a partir de
            01/10/2026.
          </p>
        </>
      )}
    </div>
  )
}

// Domínios dos clientes que vencem em até 60 dias (ou já venceram)
function DomainAlerts({ clients }) {
  const due = clients
    .map((c) => ({ client: c, alert: domainAlert(c.account) }))
    .filter((x) => x.alert)
    .sort((a, b) => String(a.client.account.domainExpiresOn).localeCompare(String(b.client.account.domainExpiresOn)))
  if (due.length === 0) return null
  return (
    <section className="admin-form-section wbdev-domains">
      <h2>Domínios para renovar</h2>
      <ul className="doc-list">
        {due.map(({ client: c, alert }) => (
          <li key={c.companyId}>
            <div className="doc-list-main">
              <strong>
                <Link to={`/wbdev/clientes/${c.slug}`}>{c.name}</Link>
                {c.account.domain ? ` · ${c.account.domain}` : ''}
              </strong>
              <span className="admin-table-sub">
                {[
                  `${alert} (${dateBR(c.account.domainExpiresOn)})`,
                  domainRegistrarLabel(c.account.domainRegistrar),
                  c.account.domainPaidBy ? `renovação: ${domainPayerLabel(c.account.domainPaidBy)}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function PlatformOverview() {
  const [period, setPeriod] = useState('30d')
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sort, setSort] = useState({ key: 'visits', dir: 'desc' })
  const [exporting, setExporting] = useState(false)
  const [clients, setClients] = useState([])
  const { presenting } = usePresentation()

  const range = useMemo(() => platformRange(period), [period])
  const periodLabel = PLATFORM_PERIODS.find((p) => p.value === period)?.label || ''

  async function load() {
    setLoading(true)
    setError('')
    try {
      setStores(await fetchPlatformOverview(range))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os números das lojas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end])

  // Domínios para renovar (fichas dos clientes); fora da apresentação
  useEffect(() => {
    if (presenting) return undefined
    let active = true
    fetchClients()
      .then((list) => active && setClients(list))
      .catch(() => active && setClients([]))
    return () => {
      active = false
    }
  }, [presenting])

  const totals = useMemo(() => platformTotals(stores), [stores])
  const withHealth = useMemo(
    () =>
      stores
        .map((s) => ({ store: s, health: storeHealth(s) }))
        .sort(
          (a, b) =>
            Number(a.store.isDemo) - Number(b.store.isDemo) ||
            LEVEL_ORDER[a.health.level] - LEVEL_ORDER[b.health.level] ||
            a.store.name.localeCompare(b.store.name)
        ),
    [stores]
  )
  const compared = useMemo(() => sortStores(stores, sort.key, sort.dir), [stores, sort])

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }))
  }

  async function downloadResults() {
    setExporting(true)
    try {
      await exportPlatformResultsPdf({ totals, range })
    } finally {
      setExporting(false)
    }
  }

  function exportComparison() {
    const report = {
      title: 'Comparação entre lojas',
      subtitle: `Período: ${range.start.split('-').reverse().join('/')} a ${range.end.split('-').reverse().join('/')}`,
      sections: [
        {
          title: 'Lojas',
          columns: [
            { key: 'name', label: 'Loja', type: 'text' },
            { key: 'health', label: 'Saúde', type: 'text' },
            ...COMPARE_COLUMNS.filter((c) => c.key !== 'lastUse').map((c) => ({ key: c.key, label: c.label, type: 'int' })),
            { key: 'lastUse', label: 'Último uso', type: 'text' },
          ],
          rows: compared.map((s) => ({
            name: s.isDemo ? `${s.name} (demonstração)` : s.name,
            health: HEALTH_LABELS[storeHealth(s).level],
            ...Object.fromEntries(COMPARE_COLUMNS.filter((c) => c.key !== 'lastUse').map((c) => [c.key, c.value(s)])),
            lastUse: lastUseText(s),
          })),
        },
      ],
    }
    exportReportExcel(report, { companyName: 'Plataforma' })
  }

  if (presenting) {
    return (
      <ShowcaseView
        stores={stores}
        totals={totals}
        period={period}
        setPeriod={setPeriod}
        periodLabel={periodLabel}
        loading={loading}
        error={error}
      />
    )
  }

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Visão geral</h1>
          <p>Todas as lojas que usam o sistema.</p>
        </div>
        <div className="admin-row-actions">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Período">
            {PLATFORM_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>


      {error && <p className="admin-error">{error}</p>}
      {loading && stores.length === 0 ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        <>
          <section className="platform-results">
            <div className="platform-results-head">
              <div>
                <h2>Resultados da plataforma</h2>
                <p>
                  {periodLabel}, somando {totals.stores} lojas. A loja de demonstração fica de fora. A setinha compara com o
                  período anterior de mesmo tamanho.
                </p>
              </div>
              <div className="platform-results-actions">
                <button type="button" className="btn btn-primary" onClick={() => setPresentation(true)}>
                  <Presentation size={16} /> Apresentar
                </button>
                <button type="button" className="btn btn-outline" onClick={downloadResults} disabled={exporting}>
                  <FileDown size={16} /> {exporting ? 'Gerando…' : 'Baixar PDF'}
                </button>
              </div>
            </div>
            <div className="platform-kpis">
              {resultItems(totals).map((item) => (
                <div key={item.label} className="platform-kpi">
                  <span>{item.label}</span>
                  <strong>{fmt(item.value)}</strong>
                  {item.prev !== undefined ? <Trend prev={item.prev} value={item.value} /> : <small>{item.sub}</small>}
                </div>
              ))}
            </div>
          </section>

          <DomainAlerts clients={clients} />

          <h2 className="admin-section-title">Saúde das lojas</h2>
          <div className="platform-store-grid">
            {withHealth.map(({ store: s, health }) => (
              <Link key={s.id} to={`/wbdev/${s.slug}`} className={`platform-store-card is-${health.level}`}>
                <div className="platform-store-top">
                  <strong>{s.name}</strong>
                  {s.isDemo ? <span className="platform-demo">demonstração</span> : <HealthPill level={health.level} />}
                </div>
                <div className="platform-store-numbers">
                  <span>
                    <b>{fmt(s.site.visits)}</b> visitas
                  </span>
                  <span>
                    <b>{fmt(s.leads.total)}</b> contatos
                  </span>
                  <span>
                    <b>{fmt(s.stock.available)}</b> à venda
                  </span>
                  <span>
                    <b>{fmt(s.sales.sold)}</b> vendidos
                  </span>
                </div>
                {health.reasons.length > 0 && (
                  <ul className="platform-reasons">
                    {health.reasons.slice(0, 3).map((r) => (
                      <li key={r.text} className={`is-${r.level}`}>
                        {r.text}
                      </li>
                    ))}
                    {health.reasons.length > 3 && <li className="is-more">+{health.reasons.length - 3} motivos</li>}
                  </ul>
                )}
                <span className="platform-store-foot">{lastUseText(s)}</span>
              </Link>
            ))}
          </div>

          <div className="platform-section-head">
            <h2 className="admin-section-title">Comparação entre lojas</h2>
            <button type="button" className="btn btn-outline" onClick={exportComparison} disabled={stores.length === 0}>
              <Sheet size={15} /> Excel
            </button>
          </div>
          <div className="admin-table-wrap platform-table-wrap">
            <table className="admin-table platform-table">
              <thead>
                <tr>
                  <th>Loja</th>
                  {COMPARE_COLUMNS.map((c) => (
                    <th key={c.key} className="is-num">
                      <button type="button" className="platform-sort" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        {sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compared.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/wbdev/${s.slug}`}>{s.name}</Link>
                      {s.isDemo && <span className="admin-table-sub">demonstração</span>}
                    </td>
                    {COMPARE_COLUMNS.map((c) => (
                      <td key={c.key} className="is-num">
                        {c.key === 'lastUse' ? lastUseText(s).replace('Último uso há ', '').replace('Usou o painel ', '') : fmt(c.value(s))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="admin-section-title">Uso das funções</h2>
          <p className="admin-form-hint">Quantidade total de cada registro na loja (entre parênteses, os do período). "—" = a loja ainda não usou.</p>
          <div className="admin-table-wrap platform-table-wrap">
            <table className="admin-table platform-table platform-usage">
              <thead>
                <tr>
                  <th>Loja</th>
                  {FEATURES.map((f) => (
                    <th key={f.key} className="is-num">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...stores]
                  .sort((a, b) => Number(a.isDemo) - Number(b.isDemo) || a.name.localeCompare(b.name))
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      {featureUsage(s).map((f) => (
                        <td key={f.key} className={`is-num ${f.used ? '' : 'is-unused'}`}>
                          {f.used ? (
                            <>
                              {fmt(f.total)}
                              {f.period > 0 && <small> ({fmt(f.period)})</small>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p className="admin-form-hint">
            Contatos pelo WhatsApp e vendas com contato pelo site contam a partir de 01/10/2026. "Vendas com contato pelo site":
            carro vendido que recebeu contato pelo WhatsApp do site antes da data da venda.
          </p>
        </>
      )}

    </div>
  )
}
