import { Link } from 'react-router-dom'
import { formatCurrency } from '../utils/carFormat.js'
import { thumbUrl } from '../utils/carPhotos.js'
import { PORTAL_TONE_CLASS, portalSummary, portalFilters, portalMatchesFilter } from '../utils/portalStatus.js'

// Lista dos carros num portal (aba Portais): os números, o filtro e um cartão
// por carro com "Publicar", a situação, o catálogo do portal e as ações. Cada
// portal (OLX, Webmotors) passa o que muda: o nome, o campo "publicar", o
// catálogo e os botões.
// rows: [{ car, ad, state }]; busy: chave da ação em andamento (termina com o id do carro)
export default function PortalCarList({ name, rows, filter, onFilter, busy, isPublished, onTogglePublish, renderCatalog, renderActions }) {
  const summary = portalSummary(rows.map((r) => r.state))
  const visible = rows.filter((r) => portalMatchesFilter(r.state, filter))

  return (
    <section className="admin-car-group">
      <div className="portals-summary">
        <div><strong>{summary.publicados}</strong><span>na {name}</span></div>
        <div><strong>{summary.aguardando}</strong><span>aguardando</span></div>
        <div className={summary.problemas ? 'is-problem' : ''}><strong>{summary.problemas}</strong><span>com problema</span></div>
        <div><strong>{summary.prontos}</strong><span>prontos</span></div>
        <div><strong>{summary.fora}</strong><span>fora da {name}</span></div>
      </div>

      <div className="admin-segmented portals-filters" role="radiogroup" aria-label="Filtrar carros">
        {portalFilters(name).map((f) => (
          <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} className={filter === f.value ? 'is-active' : ''} onClick={() => onFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="admin-muted">{rows.length === 0 ? 'Nenhum carro em estoque.' : 'Nenhum carro neste filtro.'}</p>
      ) : (
        <ul className="portals-list">
          {visible.map(({ car, ad, state }) => {
            const rowBusy = Boolean(busy) && busy.endsWith(car.id)
            return (
              <li key={car.id} className={`portals-item ${rowBusy ? 'is-busy' : ''}`}>
                <div className="portals-item-main">
                  <div className="admin-thumb">{car.images[0] ? <img src={thumbUrl(car.images[0])} alt="" loading="lazy" /> : <span>Sem foto</span>}</div>
                  <div className="portals-item-title">
                    <Link to={`/admin/carros/${car.id}`}><strong>{car.brand} {car.model}</strong></Link>
                    <span className="admin-table-sub">
                      {car.version} · {car.modelYear}{car.plate ? ` · ${car.plate.toUpperCase()}` : ''}
                    </span>
                    <span className="admin-table-sub">{car.price != null ? formatCurrency(car.price) : 'Sem preço'}</span>
                  </div>
                  <label className="admin-checkbox portals-item-toggle">
                    <input type="checkbox" checked={isPublished(car)} onChange={() => onTogglePublish(car)} disabled={rowBusy} />
                    Publicar
                  </label>
                </div>

                {state && (
                  <div className="portals-item-state">
                    <span className={`admin-pill ${PORTAL_TONE_CLASS[state.tone]}`}>{state.label}</span>
                    {state.detail && <span className="portals-item-detail">{state.detail}</span>}
                  </div>
                )}

                {isPublished(car) && renderCatalog?.(car, rowBusy)}

                <div className="admin-row-actions portals-item-actions">{renderActions({ car, ad, state, rowBusy })}</div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
