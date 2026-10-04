// Escolher um mês numa lista, sem digitar (ex.: "Primeiro mês cobrado" na ficha
// do cliente). Mostra de `ahead` meses à frente até `back` meses atrás, do mais
// novo para o mais antigo; um valor salvo fora dessa faixa também aparece.
// Recebe/emite "aaaa-mm" ('' = nenhum).

const pad = (n) => String(n).padStart(2, '0')

function shiftMonth(base, n) {
  const d = new Date(base.getFullYear(), base.getMonth() + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function label(month) {
  const [y, m] = month.split('-').map(Number)
  const name = new Date(y, m - 1, 15).toLocaleDateString('pt-BR', { month: 'long' })
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`
}

export default function MonthSelectBR({ value, onChange, id, required, back = 24, ahead = 12, emptyLabel = 'Escolha o mês' }) {
  const today = new Date()
  const current = shiftMonth(today, 0)
  const months = []
  for (let n = ahead; n >= -back; n -= 1) months.push(shiftMonth(today, n))
  if (value && !months.includes(value)) months.push(value)
  months.sort((a, b) => b.localeCompare(a))

  return (
    <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{emptyLabel}</option>
      {months.map((m) => (
        <option key={m} value={m}>
          {label(m)}
          {m === current ? ' (este mês)' : ''}
        </option>
      ))}
    </select>
  )
}
