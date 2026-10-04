import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, Presentation, FileDown, Sheet, X } from 'lucide-react'
import { fetchPlatformOverview } from '../../lib/platformApi.js'
import PlatformTabs from './PlatformTabs.jsx'
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

// Tela cheia para mostrar a quem ainda não é cliente (sem nome de loja)
function PresentMode({ totals, periodLabel, onClose }) {
  useEffect(() => {
    const el = document.documentElement
    el.requestFullscreen?.().catch(() => {})
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [onClose])

  return (
    <div className="platform-present" role="dialog" aria-label="Resultados da plataforma">
      <button type="button" className="platform-present-close" onClick={onClose} aria-label="Fechar">
        <X size={22} />
      </button>
      <div className="platform-present-inner">
        <span className="platform-present-brand">WB.Dev</span>
        <h1>Resultados da plataforma</h1>
        <p>
          {periodLabel} · soma das {totals.stores} lojas que usam o sistema
        </p>
        <div className="platform-present-grid">
          {resultItems(totals).map((item) => (
            <div key={item.label} className="platform-present-kpi">
              <strong>{fmt(item.value)}</strong>
              <span>{item.label}</span>
              {item.prev !== undefined ? <Trend prev={item.prev} value={item.value} /> : <small>{item.sub}</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PlatformOverview() {
  const [period, setPeriod] = useState('30d')
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sort, setSort] = useState({ key: 'visits', dir: 'desc' })
  const [presenting, setPresenting] = useState(false)
  const [exporting, setExporting] = useState(false)

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

  return (
    <div className="admin-page platform-page">
      <div className="admin-page-head">
        <div>
          <h1>Plataforma</h1>
          <p>Painel WB.Dev: todas as lojas que usam o sistema. Só você vê esta aba.</p>
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

      <PlatformTabs />

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
                <button type="button" className="btn btn-primary" onClick={() => setPresenting(true)}>
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

          <h2 className="admin-section-title">Saúde das lojas</h2>
          <div className="platform-store-grid">
            {withHealth.map(({ store: s, health }) => (
              <Link key={s.id} to={`/admin/plataforma/${s.slug}`} className={`platform-store-card is-${health.level}`}>
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
                      <Link to={`/admin/plataforma/${s.slug}`}>{s.name}</Link>
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

      {presenting && <PresentMode totals={totals} periodLabel={periodLabel} onClose={() => setPresenting(false)} />}
    </div>
  )
}
