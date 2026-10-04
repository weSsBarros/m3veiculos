import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileDown, RefreshCcw } from 'lucide-react'
import { fetchStoreDetail } from '../../lib/platformApi.js'
import {
  storeHealth,
  featureUsage,
  lastUseText,
  PLATFORM_PERIODS,
  platformRange,
  reportRanges,
  monthLabel,
  recentMonths,
  daysSince,
  HEALTH_LABELS,
  STORE_HEALTH_LABELS,
} from '../../utils/platform.js'
import { exportStoreMonthlyPdf } from '../../utils/platformPdf.js'
import { entityLabel, actionLabel } from '../../lib/activityApi.js'
import BarChart from '../../components/charts/BarChart.jsx'
import HBarChart from '../../components/charts/HBarChart.jsx'
import { Trend, HealthPill } from './PlatformParts.jsx'
import '../admin.css'

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-BR')
const ROLE_LABELS = { admin: 'Admin', manager: 'Gerente', seller: 'Vendedor' }

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function sinceText(iso) {
  const days = daysSince(iso)
  if (days === null) return 'nunca entrou'
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

// Rótulos curtos nos gráficos de muitos dias: só alguns dias com legenda
function dailyBars(daily, key) {
  const step = daily.length > 45 ? 7 : daily.length > 15 ? 3 : 1
  return daily.map((d, i) => ({
    label: i % step === 0 ? d.day.slice(8, 10) + '/' + d.day.slice(5, 7) : '',
    value: d[key],
  }))
}

// Números de uma loja. Na Plataforma (platform), o dono do sistema vê qualquer
// loja; na aba Desempenho, o admin vê só a dele. loadStore(range) devolve a
// loja no formato de lib/platformApi.js; reloadKey recarrega quando muda.
export default function StoreReport({ loadStore, reloadKey = '', platform = false }) {
  const [period, setPeriod] = useState('30d')
  const [store, setStore] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const months = useMemo(() => recentMonths(12), [])
  // Padrão: o último mês fechado (o mês atual ainda está pela metade)
  const [month, setMonth] = useState(months[1])
  const [exporting, setExporting] = useState(false)

  const range = useMemo(() => platformRange(period), [period])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const found = await loadStore(range)
      setStore(found)
      setDetail(await fetchStoreDetail(found.id, range))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os números da loja.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, range.start, range.end])

  // Relatório do mês: números do mês escolhido, do mês anterior e os carros
  async function downloadMonthly() {
    if (!store) return
    setExporting(true)
    setError('')
    try {
      const { range: monthRangeNow, prevRange, previous, partialUntil } = reportRanges(month)
      const [current, before, monthDetail] = await Promise.all([
        loadStore(monthRangeNow),
        loadStore(prevRange),
        fetchStoreDetail(store.id, monthRangeNow),
      ])
      await exportStoreMonthlyPdf({ store: current, prev: before, detail: monthDetail, month, previous, partialUntil })
    } catch (err) {
      setError(err.message || 'Não foi possível gerar o relatório.')
    } finally {
      setExporting(false)
    }
  }

  const health = store ? storeHealth(store) : null
  const siteLink = store?.siteUrl && (
    <a href={store.siteUrl} target="_blank" rel="noreferrer" className="platform-site-link">
      {store.siteUrl.replace('https://', '')} <ExternalLink size={13} />
    </a>
  )

  return (
    <div className="admin-page platform-page">
      {platform && (
        <Link to="/admin/plataforma" className="platform-back">
          <ArrowLeft size={16} /> Todas as lojas
        </Link>
      )}
      <div className="admin-page-head">
        <div>
          {platform ? (
            <>
              <h1>
                {store?.name || 'Loja'} {store?.isDemo && <span className="platform-demo">demonstração</span>}
              </h1>
              {siteLink && <p>{siteLink}</p>}
            </>
          ) : (
            <>
              <h1>Desempenho</h1>
              <p>
                Como estão o site e o uso do painel{siteLink ? ' · ' : ''}
                {siteLink}
              </p>
            </>
          )}
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
      {loading && !store ? (
        <p className="admin-muted">Carregando…</p>
      ) : (
        store &&
        detail && (
          <>
            <div className={`platform-health-box is-${health.level}`}>
              <div>
                <HealthPill level={health.level} labels={platform ? HEALTH_LABELS : STORE_HEALTH_LABELS} />
                <span className="platform-health-when">{lastUseText(store)}</span>
              </div>
              {health.reasons.length > 0 ? (
                <ul className="platform-reasons">
                  {health.reasons.map((r) => (
                    <li key={r.text} className={`is-${r.level}`}>
                      {r.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">
                  {platform
                    ? 'Nenhum alerta: a loja está usando o sistema normalmente.'
                    : 'Nenhum alerta: o site e o painel estão sendo bem usados.'}
                </p>
              )}
            </div>

            <div className="platform-report-bar">
              <span>{platform ? 'Relatório mensal para o cliente (PDF, assinado WB.Dev):' : 'Relatório do mês (PDF):'}</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês do relatório">
                {months.map((m, i) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                    {i === 0 ? ' (até hoje)' : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary" onClick={downloadMonthly} disabled={exporting}>
                <FileDown size={16} /> {exporting ? 'Gerando…' : 'Baixar relatório'}
              </button>
            </div>

            <div className="platform-kpis">
              {[
                { label: 'Visitas no site', value: store.site.visits, prev: store.site.visitsPrev },
                { label: 'Pessoas', value: store.site.visitors, prev: store.site.visitorsPrev },
                { label: 'Visualizações de carros', value: store.site.views, prev: store.site.viewsPrev },
                { label: 'Contatos pelo WhatsApp', value: store.leads.total, prev: store.leads.prev },
                { label: 'Carros cadastrados', value: store.stock.added, prev: store.stock.addedPrev },
                { label: 'Carros vendidos', value: store.sales.sold, prev: store.sales.soldPrev },
                { label: 'Vendas com contato pelo site', value: store.sales.soldSite, prev: store.sales.soldSitePrev },
                { label: 'Atividades no painel', value: store.usage.activities, prev: store.usage.activitiesPrev },
              ].map((item) => (
                <div key={item.label} className="platform-kpi">
                  <span>{item.label}</span>
                  <strong>{fmt(item.value)}</strong>
                  <Trend prev={item.prev} value={item.value} />
                </div>
              ))}
            </div>

            <h2 className="admin-section-title">Estoque agora</h2>
            <div className="platform-chips">
              <span>
                <b>{fmt(store.stock.available)}</b> à venda no site
              </span>
              <span>
                <b>{fmt(store.stock.reserved)}</b> reservados
              </span>
              <span>
                <b>{fmt(store.stock.maintenance)}</b> em manutenção
              </span>
              <span>
                <b>{fmt(store.stock.hidden)}</b> ocultos
              </span>
              <span className={store.stock.noPhoto > 0 ? 'is-warn' : ''}>
                <b>{fmt(store.stock.noPhoto)}</b> à venda sem foto
              </span>
              <span className={store.stock.stale > 0 ? 'is-warn' : ''}>
                <b>{fmt(store.stock.stale)}</b> parados há mais de {store.stockAlertDays} dias
              </span>
              <span>
                WhatsApp do site: <b>{store.whatsappOk ? (store.whatsappMode === 'rodizio' ? 'rodízio' : 'número fixo') : 'sem número'}</b>
              </span>
            </div>

            <div className="charts-grid charts-grid-3">
              <div className="chart-card chart-card-wide">
                <h3>Visitas por dia</h3>
                <div className="platform-chart-scroll">
                  <div style={{ '--days': detail.daily.length }}>
                    <BarChart data={dailyBars(detail.daily, 'visits')} color="#7b61ff" formatValue={(v) => (v > 0 ? v : '—')} />
                  </div>
                </div>
              </div>
              <div className="chart-card">
                <h3>Carros mais vistos</h3>
                <HBarChart
                  data={detail.topViewed.map((t) => ({ label: t.car, value: t.count }))}
                  color="#7b61ff"
                  formatValue={(v) => `${fmt(v)} ${v === 1 ? 'visualização' : 'visualizações'}`}
                  emptyLabel="Nenhuma visualização no período."
                />
              </div>
              <div className="chart-card chart-card-wide">
                <h3>Contatos pelo WhatsApp por dia</h3>
                <div className="platform-chart-scroll">
                  <div style={{ '--days': detail.daily.length }}>
                    <BarChart data={dailyBars(detail.daily, 'leads')} color="#1fae55" formatValue={(v) => (v > 0 ? v : '—')} />
                  </div>
                </div>
              </div>
              <div className="chart-card">
                <h3>Carros com mais contatos</h3>
                <HBarChart
                  data={detail.topLeads.map((t) => ({ label: t.car, value: t.count }))}
                  color="#1fae55"
                  formatValue={(v) => `${fmt(v)} ${v === 1 ? 'contato' : 'contatos'}`}
                  emptyLabel="Nenhum contato no período."
                />
              </div>
            </div>

            <h2 className="admin-section-title">Equipe</h2>
            <p className="admin-form-hint">
              {fmt(store.usage.activeUsers)} {store.usage.activeUsers === 1 ? 'pessoa usou' : 'pessoas usaram'} o painel no período, em{' '}
              {fmt(store.usage.activeDays)} {store.usage.activeDays === 1 ? 'dia' : 'dias'} ({fmt(store.usage.logins)}{' '}
              {store.usage.logins === 1 ? 'entrada' : 'entradas'}).
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Papel</th>
                    <th>Último acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.team.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="admin-muted-cell">
                        Nenhum login ligado à loja ainda.
                      </td>
                    </tr>
                  ) : (
                    detail.team.map((p, i) => (
                      <tr key={`${p.name}-${i}`}>
                        <td>
                          {p.name}
                          {!p.active && <span className="admin-table-sub">desativado</span>}
                        </td>
                        <td>{ROLE_LABELS[p.role] || p.role}</td>
                        <td>{p.lastSignInAt ? `${formatDateTime(p.lastSignInAt)} (${sinceText(p.lastSignInAt)})` : 'nunca entrou'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="admin-section-title">Uso das funções</h2>
            <div className="platform-chips">
              {featureUsage(store).map((f) => (
                <span key={f.key} className={f.used ? 'is-used' : 'is-unused'}>
                  {f.label}: <b>{f.used ? fmt(f.total) : 'não usa'}</b>
                  {f.period > 0 && <small> (+{fmt(f.period)} no período)</small>}
                </span>
              ))}
              <span className={store.settingsCustomized ? 'is-used' : 'is-unused'}>
                Configurações do painel: <b>{store.settingsCustomized ? 'personalizadas' : 'padrão'}</b>
              </span>
            </div>

            <h2 className="admin-section-title">Últimas atividades</h2>
            <p className="admin-form-hint">
              {platform ? (
                'Sem dados de clientes nem valores: só o tipo da atividade (e o carro, quando é um carro).'
              ) : (
                <>
                  Resumo das últimas 40. O histórico completo, com os detalhes, fica em{' '}
                  <Link to="/admin/atividades">Atividades</Link>.
                </>
              )}
            </p>
            <ul className="platform-activity">
              {detail.activities.length === 0 && <li className="admin-muted">Nenhuma atividade ainda.</li>}
              {detail.activities.map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  <span className="platform-activity-when">{formatDateTime(a.at)}</span>
                  <span>
                    <b>{a.who}</b>
                    {a.role && a.who !== 'Admin' && <small> ({ROLE_LABELS[a.role] || a.role})</small>} ·{' '}
                    {a.entity === 'auth' ? 'entrou no painel' : `${actionLabel(a.action).toLowerCase()} ${entityLabel(a.entity).toLowerCase()}`}
                    {a.label && <em> — {a.label}</em>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </div>
  )
}
