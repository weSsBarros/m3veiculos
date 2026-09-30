import { Check, Minus } from 'lucide-react'
import { checklistSummary } from '../utils/saleChecklist.js'

const SALE_LABELS = {
  ok: 'Entregue',
  missing: 'Não possui',
  markRest: 'Marcar os demais como entregues',
  empty: 'A loja ainda não tem itens no checklist (edite em Vendas → Itens do checklist).',
}

// Checklist de itens do carro conferidos na venda. Cada item fica "Entregue",
// "Não possui" (o carro não tem) ou sem marcar; clicar de novo desmarca.
// labels: outros textos para o mesmo formato (ex.: itens que vieram com o
// carro no cadastro: "Veio" / "Não veio").
export default function SaleChecklist({ value, onChange, disabled, labels = SALE_LABELS }) {
  const summary = checklistSummary(value)

  function setStatus(index, status) {
    onChange(value.map((entry, i) => (i === index ? { ...entry, status: entry.status === status ? null : status } : entry)))
  }

  function markRestDelivered() {
    onChange(value.map((entry) => (entry.status ? entry : { ...entry, status: 'ok' })))
  }

  if (value.length === 0) {
    return <p className="sale-dialog-note">{labels.empty}</p>
  }

  return (
    <div className="sale-checklist">
      <div className="sale-checklist-head">
        <span className={summary.pending ? 'is-pending' : 'is-done'}>
          {summary.total - summary.pending} de {summary.total} conferidos
        </span>
        {summary.pending > 0 && (
          <button type="button" onClick={markRestDelivered} disabled={disabled}>
            {labels.markRest}
          </button>
        )}
      </div>
      <ul>
        {value.map((entry, index) => (
          <li key={entry.item} className={entry.status ? '' : 'is-pending'}>
            <span className="sale-checklist-item">{entry.item}</span>
            <div className="sale-checklist-options" role="group" aria-label={entry.item}>
              <button
                type="button"
                className={entry.status === 'ok' ? 'is-ok' : ''}
                aria-pressed={entry.status === 'ok'}
                onClick={() => setStatus(index, 'ok')}
                disabled={disabled}
              >
                <Check size={13} /> {labels.ok}
              </button>
              <button
                type="button"
                className={entry.status === 'nao_possui' ? 'is-missing' : ''}
                aria-pressed={entry.status === 'nao_possui'}
                onClick={() => setStatus(index, 'nao_possui')}
                disabled={disabled}
              >
                <Minus size={13} /> {labels.missing}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
