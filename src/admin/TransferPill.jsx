import { transferAlert, transferDueText, transferStatusLabel, isTransferOpen } from '../utils/transfer.js'

// Situação da transferência do veículo: vermelho = atrasada, amarelo = vence
// nos próximos dias, azul = em aberto no prazo, verde = concluída.
export default function TransferPill({ sale }) {
  if (!sale) return <span className="admin-pill">Venda sem registro</span>
  const alert = transferAlert(sale)
  let tone = ''
  if (sale.transferStatus === 'concluida') tone = 'is-success'
  else if (alert === 'atrasada') tone = 'is-danger'
  else if (alert === 'vence_logo') tone = 'is-warning'
  else if (isTransferOpen(sale)) tone = 'is-info'
  const due = transferDueText(sale)
  return (
    <span className={`admin-pill ${tone}`} title={due || undefined}>
      {transferStatusLabel(sale.transferStatus)}
      {due ? ` · ${due}` : ''}
    </span>
  )
}
