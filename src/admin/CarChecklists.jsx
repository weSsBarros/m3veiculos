import { checklistSummary } from '../utils/saleChecklist.js'
import { INSPECTION_STATUSES, inspectionSummary } from '../utils/carChecklists.js'
import SaleChecklist from './SaleChecklist.jsx'

const INTAKE_LABELS = {
  ok: 'Veio',
  missing: 'Não veio',
  markRest: 'Marcar os demais como "veio"',
  empty: 'A loja ainda não tem itens nesta lista (edite em Estoque → Listas do cadastro).',
}

// Itens que vieram com o carro (mesmo formato do checklist de entrega)
export function IntakeChecklist({ value, onChange, disabled }) {
  const summary = checklistSummary(value)
  return (
    <details className="car-checklist-details">
      <summary>
        Itens que vieram com o carro
        <span>
          {summary.total - summary.pending ? `${summary.total - summary.pending} de ${summary.total} conferidos` : 'opcional'}
        </span>
      </summary>
      <SaleChecklist value={value} onChange={onChange} disabled={disabled} labels={INTAKE_LABELS} />
    </details>
  )
}

// Vistoria de entrada: cada item ok, atenção ou ruim, com observação
export function InspectionChecklist({ value, onChange, disabled }) {
  const summary = inspectionSummary(value)

  function setEntry(index, patch) {
    onChange(value.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }

  const counts = [
    summary.ok && `${summary.ok} ok`,
    summary.atencao && `${summary.atencao} atenção`,
    summary.ruim && `${summary.ruim} ruim`,
  ].filter(Boolean)

  return (
    <details className="car-checklist-details">
      <summary>
        Vistoria de entrada
        <span>{counts.length ? counts.join(' · ') : 'opcional'}</span>
      </summary>
      {value.length === 0 ? (
        <p className="sale-dialog-note">A loja ainda não tem itens de vistoria (edite em Estoque → Listas do cadastro).</p>
      ) : (
        <ul className="inspection-list">
          {value.map((entry, index) => (
            <li key={entry.item}>
              <span>{entry.item}</span>
              <div className="inspection-options" role="group" aria-label={entry.item}>
                {INSPECTION_STATUSES.map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    className={`is-${st.value}`}
                    aria-pressed={entry.status === st.value}
                    onClick={() => setEntry(index, { status: entry.status === st.value ? null : st.value })}
                    disabled={disabled}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              {(entry.status === 'atencao' || entry.status === 'ruim' || entry.note) && (
                <input
                  value={entry.note}
                  onChange={(e) => setEntry(index, { note: e.target.value })}
                  placeholder="O que precisa ser feito?"
                  disabled={disabled}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
