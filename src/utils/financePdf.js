// Relatório financeiro da Plataforma (painel WB.Dev → Financeiro), no mesmo
// visual dos outros PDFs da WB.Dev (utils/platformPdf.js). Só para o dono do
// sistema: tem valores de cada cliente.

import { downloadBlob } from './downloadBlob.js'
import { newDoc, header, sectionTitle, footer, INK, MUTED, MARGIN } from './platformPdf.js'
import { money, dateBR } from './billing.js'
import { monthLabel } from './platform.js'
import { categoryLabel } from './finance.js'

const shortMonth = (month) => {
  const label = monthLabel(month)
  return `${label.slice(0, 3)}/${month.slice(2, 4)}`
}

// Caixas de valores em reais: [{ label, value, hint }], 2 por linha
function moneyBoxes(doc, items, startY) {
  const width = doc.internal.pageSize.getWidth()
  const gap = 14
  const boxW = (width - MARGIN * 2 - gap) / 2
  const boxH = 64
  items.forEach((item, i) => {
    const x = MARGIN + (i % 2) * (boxW + gap)
    const y = startY + Math.floor(i / 2) * (boxH + gap)
    doc.setDrawColor(221, 226, 233)
    doc.setFillColor(247, 248, 251)
    doc.roundedRect(x, y, boxW, boxH, 8, 8, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...MUTED)
    doc.text(item.label, x + 14, y + 19)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...INK)
    doc.text(item.value, x + 14, y + 41)
    if (item.hint) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
      doc.text(item.hint, x + 14, y + 56)
    }
  })
  doc.setTextColor(0, 0, 0)
  return startY + Math.ceil(items.length / 2) * (boxH + gap)
}

// Tabela com as colunas de valor alinhadas à direita
function moneyTable(doc, autoTable, startY, head, rows, rightCols, empty, foot = null) {
  autoTable(doc, {
    startY,
    head: [head],
    body: rows.length ? rows : [[{ content: empty, colSpan: head.length }]],
    foot: foot && rows.length ? [foot] : undefined,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8.5, cellPadding: 4.5 },
    headStyles: { fillColor: INK },
    footStyles: { fillColor: [235, 238, 244], textColor: INK, fontStyle: 'bold' },
    didParseCell: (data) => {
      if (rightCols.includes(data.column.index) && rows.length) data.cell.styles.halign = 'right'
    },
  })
  return doc.lastAutoTable.finalY
}

// Título da próxima seção: muda de página quando não sobra espaço
function nextSection(doc, title, y) {
  const height = doc.internal.pageSize.getHeight()
  let top = y + 26
  if (top > height - 120) {
    doc.addPage()
    top = 56
  }
  sectionTitle(doc, title, top)
  return top + 8
}

const dash = (v) => (v === null || v === undefined ? '—' : money(v))

// summary: financeSummary; ranking: clientRanking; forecastRows: forecast;
// expenses: despesas do período; clients: para o nome do cliente da despesa
export async function exportFinancePdf({ periodLabel, period, summary: s, ranking, forecastRows, expenses, clients }) {
  const { doc, autoTable } = await newDoc()
  header(doc, 'Relatório financeiro', `Período: ${periodLabel}`)

  const avgHint = s.avgIsPartial
    ? 'só o mês atual até agora'
    : `média de ${s.avgMonthsCount} ${s.avgMonthsCount === 1 ? 'mês completo' : 'meses completos'}`
  let y = moneyBoxes(
    doc,
    [
      { label: 'Recebido no período', value: money(s.received), hint: `${s.receivedCount} ${s.receivedCount === 1 ? 'pagamento' : 'pagamentos'}` },
      { label: 'Média de faturamento mensal', value: money(s.avgMonthly), hint: avgHint },
      { label: 'Despesas do período', value: money(s.costs) },
      { label: 'Lucro do período', value: money(s.profit), hint: s.margin !== null ? `margem de ${s.margin}%` : '' },
      {
        label: 'A receber agora',
        value: money(s.receivable.total),
        hint: `${money(s.receivable.overdue)} em atraso + ${money(s.receivable.dueThisMonth)} a vencer no mês`,
      },
      { label: 'Receita mensal prevista', value: money(s.mrr), hint: `${money(s.arr)} por ano · ${s.clientsCharged} clientes cobrados` },
    ],
    124
  )

  const elapsed = s.byMonth.filter((m) => m.received !== null)
  const sum = (key) => elapsed.reduce((t, m) => t + (m[key] || 0), 0)
  y = nextSection(doc, 'Mês a mês', y - 12)
  y = moneyTable(
    doc,
    autoTable,
    y,
    ['Mês', 'Previsto', 'Recebido', 'Despesas', 'Resultado'],
    s.byMonth
      .filter((m) => !s.firstMonth || m.month >= s.firstMonth)
      .map((m) => [monthLabel(m.month), money(m.expected), dash(m.received), dash(m.expenses), dash(m.result)]),
    [1, 2, 3, 4],
    'Sem meses no período.',
    ['Total até hoje', money(sum('expected')), money(sum('received')), money(sum('expenses')), money(sum('result'))]
  )

  // Só quem tem cobrança ou movimento; os outros vão numa linha embaixo
  const listed = ranking.filter((r) => r.price || r.totalPaid || r.openTotal || r.costs)
  const others = ranking.filter((r) => !listed.includes(r))
  y = nextSection(doc, 'Por cliente (desde o início)', y)
  y = moneyTable(
    doc,
    autoTable,
    y,
    ['Cliente', 'Mensalidade', 'Cliente desde', 'Total pago', 'Em aberto', 'Despesas', 'Sobra'],
    listed.map((r) => [
      r.name,
      r.price ? money(r.price) : '—',
      r.since ? shortMonth(r.since) : '—',
      money(r.totalPaid),
      r.openTotal ? money(r.openTotal) : '—',
      r.costs ? money(r.costs) : '—',
      money(r.net),
    ]),
    [1, 2, 3, 4, 5, 6],
    'Nenhum cliente com cobrança ou pagamento ainda.'
  )
  if (others.length) {
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    const note = doc.splitTextToSize(`Sem cobrança cadastrada: ${others.map((r) => r.name).join(', ')}.`, doc.internal.pageSize.getWidth() - MARGIN * 2)
    doc.text(note, MARGIN, y + 14)
    y += 14 + note.length * 10
  }

  y = nextSection(doc, 'Previsão (clientes e mensalidades de hoje)', y)
  y = moneyTable(
    doc,
    autoTable,
    y,
    ['Próximos meses', 'Receita prevista', 'Despesas (média)', 'Lucro previsto'],
    forecastRows.map((f) => [`${f.months} meses (${shortMonth(f.from)} a ${shortMonth(f.to)})`, money(f.revenue), money(f.costs), money(f.profit)]),
    [1, 2, 3],
    ''
  )

  y = nextSection(doc, 'Despesas do período', y)
  const nameOf = (id) => (id ? clients.find((c) => c.companyId === id)?.name || '' : '')
  moneyTable(
    doc,
    autoTable,
    y,
    ['Data', 'Descrição', 'Categoria', 'Cliente', 'Valor'],
    expenses.map((e) => [dateBR(e.spentOn), e.description, categoryLabel(e.category), nameOf(e.companyId), money(e.amount)]),
    [4],
    'Nenhuma despesa lançada no período.',
    ['', '', '', 'Total', money(expenses.reduce((t, e) => t + e.amount, 0))]
  )

  footer(doc, '"Recebido" conta pela data do pagamento. A previsão usa os clientes e as mensalidades de hoje.')
  downloadBlob(doc.output('blob'), `financeiro-${period.start}-a-${period.end}.pdf`)
}
