import { Check, Minus, X } from 'lucide-react'
import { checklistSummary, checklistHas, checklistDelivered, nextChecklistStatus } from '../utils/saleChecklist.js'

const SALE_LABELS = {
  ok: 'Entregue',
  missing: 'Não possui',
  markRest: 'Marcar os demais como entregues',
  empty: 'A loja ainda não tem itens no checklist (edite em Vendas → Itens do checklist).',
}

// Duas opções por coluna ("Sim" / "Não"); clicar de novo desmarca
function YesNo({ label, value, onPick, disabled }) {
  return (
    <div className="sale-checklist-options" role="group" aria-label={label}>
      <span className="sale-checklist-col-label">{label}</span>
      <button type="button" className={value === true ? 'is-ok' : ''} aria-pressed={value === true} onClick={() => onPick(true)} disabled={disabled}>
        <Check size={13} /> Sim
      </button>
      <button type="button" className={value === false ? 'is-missing' : ''} aria-pressed={value === false} onClick={() => onPick(false)} disabled={disabled}>
        <X size={13} /> Não
      </button>
    </div>
  )
}

// Checklist de itens do carro.
// * Na venda (padrão): colunas "Possui" e "Entregue" (14/10/2026). A loja pode
//   ter o item e não entregar na hora (ex.: a chave reserva fica com a loja até
//   a quitação); "Não possui" desliga a entrega.
// * labels (ex.: itens que vieram com o carro no cadastro: "Veio" / "Não veio"):
//   duas opções por item, como antes.
export default function SaleChecklist({ value, onChange, disabled, labels }) {
  const summary = checklistSummary(value)
  const delivery = !labels
  const text = labels || SALE_LABELS

  function setStatus(index, status) {
    onChange(value.map((entry, i) => (i === index ? { ...entry, status: entry.status === status ? null : status } : entry)))
  }

  function pick(index, column, answer) {
    onChange(value.map((entry, i) => (i === index ? { ...entry, status: nextChecklistStatus(entry.status, column, answer) } : entry)))
  }

  function markRestDelivered() {
    onChange(value.map((entry) => (entry.status && entry.status !== 'possui' ? entry : { ...entry, status: 'ok' })))
  }

  if (value.length === 0) {
    return <p className="sale-dialog-note">{text.empty}</p>
  }

  return (
    <div className={`sale-checklist${delivery ? ' is-delivery' : ''}`}>
      <div className="sale-checklist-head">
        <span className={summary.pending ? 'is-pending' : 'is-done'}>
          {summary.total - summary.pending} de {summary.total} conferidos
          {delivery && summary.retained > 0 ? ` · ${summary.retained} com a loja` : ''}
        </span>
        {summary.pending > 0 && (
          <button type="button" onClick={markRestDelivered} disabled={disabled}>
            {text.markRest}
          </button>
        )}
      </div>
      <ul>
        {value.map((entry, index) => {
          const pending = !entry.status || entry.status === 'possui'
          if (delivery) {
            const has = checklistHas(entry.status)
            return (
              <li key={entry.item} className={`${pending ? 'is-pending' : ''}${entry.status === 'retido' ? ' is-retained' : ''}`}>
                <span className="sale-checklist-item">
                  {entry.item}
                  {entry.status === 'retido' && <span className="sale-checklist-retained">Fica com a loja</span>}
                </span>
                <YesNo label="Possui" value={has} onPick={(v) => pick(index, 'possui', v)} disabled={disabled} />
                <YesNo label="Entregue" value={checklistDelivered(entry.status)} onPick={(v) => pick(index, 'entregue', v)} disabled={disabled || has === false} />
              </li>
            )
          }
          return (
            <li key={entry.item} className={pending ? 'is-pending' : ''}>
              <span className="sale-checklist-item">{entry.item}</span>
              <div className="sale-checklist-options" role="group" aria-label={entry.item}>
                <button
                  type="button"
                  className={entry.status === 'ok' ? 'is-ok' : ''}
                  aria-pressed={entry.status === 'ok'}
                  onClick={() => setStatus(index, 'ok')}
                  disabled={disabled}
                >
                  <Check size={13} /> {text.ok}
                </button>
                <button
                  type="button"
                  className={entry.status === 'nao_possui' ? 'is-missing' : ''}
                  aria-pressed={entry.status === 'nao_possui'}
                  onClick={() => setStatus(index, 'nao_possui')}
                  disabled={disabled}
                >
                  <Minus size={13} /> {text.missing}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
