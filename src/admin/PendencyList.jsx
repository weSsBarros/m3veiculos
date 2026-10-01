import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellOff, X, Clock, Eye } from 'lucide-react'
import { fetchMyDismissals, dismissPendency, snoozePendency, lowerDismissal, restoreDismissals } from '../lib/storeSettingsApi.js'
import { isPendencyVisible, lowerDismissedCount } from '../utils/dashboardAlerts.js'
import { useAuth } from '../context/AuthContext.jsx'

const SNOOZE_HOURS = [6, 12, 24]

// Pendências com "Excluir aviso" (volta se surgir algo novo) e "Adiar" por
// 6, 12 ou 24 horas. Cada pessoa esconde as suas (tabela dashboard_dismissals).
// items: [{ key, count, icon, text, to, cta, danger }]; count 0 = sem pendência.
export default function PendencyList({ items, title = 'Pendências' }) {
  const { viewAs } = useAuth()
  const [dismissals, setDismissals] = useState(null)
  const [openKey, setOpenKey] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMyDismissals()
      .then(setDismissals)
      .catch(() => setDismissals({}))
  }, [])

  // Contagem caiu depois de excluir: guarda a menor, para o aviso voltar
  // assim que aparecer um item novo
  const signature = items.map((i) => `${i.key}:${i.count}`).join('|')
  useEffect(() => {
    if (!dismissals || viewAs) return
    const lowered = {}
    for (const item of items) {
      const lower = lowerDismissedCount(dismissals[item.key], item.count)
      if (lower != null) lowered[item.key] = lower
    }
    if (!Object.keys(lowered).length) return
    for (const [key, count] of Object.entries(lowered)) lowerDismissal(key, count).catch(() => {})
    setDismissals((prev) => {
      const next = { ...prev }
      for (const [key, count] of Object.entries(lowered)) next[key] = { ...next[key], dismissedCount: count }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, dismissals, viewAs])

  const active = items.filter((i) => i.count > 0)
  if (!active.length || !dismissals) return null
  // No "ver como" aparecem todas (as escondidas são do admin, não da pessoa)
  const visible = viewAs ? active : active.filter((i) => isPendencyVisible(dismissals[i.key], i.count))
  const hidden = active.filter((i) => !visible.includes(i))

  async function run(action, item, fields) {
    setError('')
    try {
      await action()
      setDismissals((prev) => ({ ...prev, [item.key]: fields }))
      setOpenKey(null)
    } catch (err) {
      setError('Não foi possível esconder o aviso: ' + err.message)
    }
  }

  async function restore() {
    setError('')
    try {
      const keys = hidden.map((i) => i.key)
      await restoreDismissals(keys)
      setDismissals((prev) => {
        const next = { ...prev }
        for (const key of keys) delete next[key]
        return next
      })
    } catch (err) {
      setError('Não foi possível mostrar os avisos: ' + err.message)
    }
  }

  return (
    <section className="admin-pendencies">
      <h2 className="admin-section-title">{title} ({visible.length})</h2>
      {error && <p className="admin-error">{error}</p>}
      {visible.length > 0 && (
        <div className="admin-alert-list">
          {visible.map((item) => {
            const Icon = item.icon
            const open = openKey === item.key
            return (
              <div key={item.key} className={`pendency-row ${open ? 'is-open' : ''}`}>
                <div className="pendency-main">
                  <Link to={item.to} className={`admin-alert-item ${item.danger ? 'is-danger' : 'is-warn'}`}>
                    <Icon size={18} />
                    <span>{item.text}</span>
                    <strong>{item.cta}</strong>
                  </Link>
                  {!viewAs && (
                    <button
                      type="button"
                      className="pendency-menu-btn"
                      onClick={() => setOpenKey(open ? null : item.key)}
                      aria-expanded={open}
                      aria-label="Excluir ou adiar este aviso"
                      title="Excluir ou adiar este aviso"
                    >
                      <BellOff size={16} />
                    </button>
                  )}
                </div>
                {open && (
                  <div className="pendency-actions">
                    <button
                      type="button"
                      className="admin-action-btn"
                      onClick={() => run(() => dismissPendency(item.key, item.count), item, { dismissedCount: item.count, snoozedUntil: null })}
                    >
                      <X size={14} /> Excluir aviso
                    </button>
                    <span className="pendency-actions-label">
                      <Clock size={14} /> Adiar:
                    </span>
                    {SNOOZE_HOURS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className="admin-action-btn"
                        onClick={() =>
                          run(() => snoozePendency(item.key, h), item, {
                            dismissedCount: null,
                            snoozedUntil: new Date(Date.now() + h * 3600 * 1000).toISOString(),
                          })
                        }
                      >
                        {h} horas
                      </button>
                    ))}
                    <span className="admin-form-hint">Excluído, o aviso volta sozinho se surgir algo novo.</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {visible.length === 0 && <p className="admin-muted">Todas as pendências estão escondidas por você.</p>}
      {hidden.length > 0 && (
        <p className="pendency-hidden">
          {hidden.length} {hidden.length === 1 ? 'aviso escondido' : 'avisos escondidos'} por você.{' '}
          <button type="button" className="admin-link-btn" onClick={restore}>
            <Eye size={14} /> Mostrar de novo
          </button>
        </p>
      )}
    </section>
  )
}
