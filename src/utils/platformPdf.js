// PDFs da aba "Plataforma", assinados pela WB.Dev: o relatório mensal de uma
// loja (para mandar ao cliente) e os resultados somados da plataforma (para
// mostrar a quem ainda não é cliente). Só quantidades: nada de valores,
// nomes ou telefones de clientes.

import { downloadBlob } from './downloadBlob.js'
import { slugify } from './carFormat.js'
import { trend, monthLabel } from './platform.js'

export const INK = [14, 17, 23]
const COBALT = [36, 70, 200]
export const MUTED = [90, 100, 117]
export const MARGIN = 40

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-BR')
const fmtDate = (iso) => iso.split('-').reverse().join('/')

// compare: { vs: 'em relação a setembro', same: 'igual a setembro' }. Sem dado
// no período anterior (ex.: antes da contagem existir) não mostra comparação.
function trendText(prev, cur, compare) {
  const t = trend(prev, cur)
  if (t.pct === null) return null
  if (t.direction === 'same') return { text: compare.same, color: MUTED }
  const sign = t.pct > 0 ? '+' : ''
  return { text: `${sign}${t.pct}% ${compare.vs}`, color: t.pct > 0 ? [28, 127, 82] : [190, 51, 40] }
}

export async function newDoc() {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { doc: new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' }), autoTable }
}

export function header(doc, title, subtitle) {
  const width = doc.internal.pageSize.getWidth()
  doc.setFillColor(...INK)
  doc.rect(0, 0, width, 96, 'F')
  doc.setFillColor(...COBALT)
  doc.rect(0, 96, width, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('WB.Dev', MARGIN, 34)
  doc.setFontSize(20)
  doc.text(title, MARGIN, 62)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(200, 206, 220)
  doc.text(subtitle, MARGIN, 82)
  doc.setTextColor(0, 0, 0)
}

// Caixas de números: [{ label, value, prev, hint }], 2 por linha
function kpiBoxes(doc, items, startY, compare) {
  const width = doc.internal.pageSize.getWidth()
  const gap = 14
  const boxW = (width - MARGIN * 2 - gap) / 2
  const boxH = 74
  items.forEach((item, i) => {
    const x = MARGIN + (i % 2) * (boxW + gap)
    const y = startY + Math.floor(i / 2) * (boxH + gap)
    doc.setDrawColor(221, 226, 233)
    doc.setFillColor(247, 248, 251)
    doc.roundedRect(x, y, boxW, boxH, 8, 8, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...MUTED)
    doc.text(item.label, x + 14, y + 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(...INK)
    doc.text(fmt(item.value), x + 14, y + 46)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const t = item.prev !== undefined ? trendText(item.prev, item.value, compare) : null
    if (t) {
      doc.setTextColor(...t.color)
      doc.text(t.text, x + 14, y + 62)
    } else if (item.hint) {
      doc.setTextColor(...MUTED)
      doc.text(item.hint, x + 14, y + 62)
    }
  })
  doc.setTextColor(0, 0, 0)
  return startY + Math.ceil(items.length / 2) * (boxH + gap)
}

export function sectionTitle(doc, text, y) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(text, MARGIN, y)
  doc.setFont('helvetica', 'normal')
}

function table(doc, autoTable, startY, head, rows, empty) {
  autoTable(doc, {
    startY,
    head: [head],
    body: rows.length ? rows : [[{ content: empty, colSpan: head.length }]],
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: INK },
    columnStyles: { 1: { halign: 'right', cellWidth: 110 } },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index === 1) data.cell.styles.halign = 'right'
    },
  })
  return doc.lastAutoTable.finalY
}

export function footer(doc, note) {
  const pages = doc.getNumberOfPages()
  const height = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    if (note) doc.text(note, MARGIN, height - 34)
    doc.text(`Gerado pelo sistema WB.Dev em ${new Date().toLocaleString('pt-BR')} · página ${i} de ${pages}`, MARGIN, height - 20)
  }
}

// store/prev: lojas do mês e do mês anterior (lib/platformApi.js);
// detail: platform_store_detail do mês (carros mais vistos e com contatos)
// partialUntil: mês ainda aberto (vai até essa data e compara com os mesmos
// dias do mês anterior)
export async function exportStoreMonthlyPdf({ store, prev, detail, month, previous, partialUntil = null }) {
  const { doc, autoTable } = await newDoc()
  const prevName = monthLabel(previous).split(' de ')[0].toLowerCase()
  const compare = partialUntil
    ? { vs: `em relação aos mesmos dias de ${prevName}`, same: `igual aos mesmos dias de ${prevName}` }
    : { vs: `em relação a ${prevName}`, same: `igual a ${prevName}` }
  const period = partialUntil ? `${monthLabel(month)} (parcial, até ${fmtDate(partialUntil).slice(0, 5)})` : monthLabel(month)
  header(doc, 'Relatório mensal do site e do painel', `${store.name} · ${period}`)

  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(
    partialUntil ? 'Resultado do mês até agora, comparado com os mesmos dias do mês anterior.' : 'Resultado do mês, comparado com o mês anterior.',
    MARGIN,
    124
  )

  let y = kpiBoxes(
    doc,
    [
      { label: 'Visitas no site', value: store.site.visits, prev: prev?.site.visits ?? 0 },
      { label: 'Pessoas que visitaram', value: store.site.visitors, prev: prev?.site.visitors ?? 0 },
      { label: 'Visualizações de carros', value: store.site.views, prev: prev?.site.views ?? 0 },
      { label: 'Contatos pelo WhatsApp do site', value: store.leads.total, prev: prev?.leads.total ?? 0 },
      { label: 'Carros cadastrados', value: store.stock.added, prev: prev?.stock.added ?? 0 },
      { label: 'Carros vendidos', value: store.sales.sold, prev: prev?.sales.sold ?? 0 },
      { label: 'Vendas com contato pelo site antes', value: store.sales.soldSite, prev: prev?.sales.soldSite ?? 0 },
      { label: 'Carros à venda hoje', value: store.stock.available, hint: 'Disponíveis e visíveis no site' },
    ],
    140,
    compare
  )

  sectionTitle(doc, 'Carros mais vistos no site', y + 14)
  y = table(doc, autoTable, y + 22, ['Carro', 'Visualizações'], detail.topViewed.map((t) => [t.car, fmt(t.count)]), 'Nenhuma visualização no mês.')
  sectionTitle(doc, 'Carros com mais contatos pelo WhatsApp', y + 28)
  table(doc, autoTable, y + 36, ['Carro', 'Contatos'], detail.topLeads.map((t) => [t.car, fmt(t.count)]), 'Nenhum contato no mês.')

  footer(
    doc,
    '"Vendas com contato pelo site antes": carro vendido que recebeu contato pelo WhatsApp do site antes da data da venda.'
  )
  downloadBlob(doc.output('blob'), `relatorio-${slugify(store.name)}-${month}.pdf`)
}

// totals: platformTotals(); range: { start, end }; stores: quantas lojas somadas
export async function exportPlatformResultsPdf({ totals, range }) {
  const { doc, autoTable } = await newDoc()
  header(doc, 'Resultados da plataforma', `Período: ${fmtDate(range.start)} a ${fmtDate(range.end)}`)

  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(`Soma das ${totals.stores} lojas que usam o sistema, comparada com o período anterior de mesmo tamanho.`, MARGIN, 124)

  const y = kpiBoxes(
    doc,
    [
      { label: 'Lojas usando o sistema', value: totals.stores, hint: `${totals.activeStores} com uso nos últimos 14 dias` },
      { label: 'Carros à venda nos sites', value: totals.available, hint: `${fmt(totals.inStock)} no estoque das lojas` },
      { label: 'Visitas nos sites', value: totals.visits, prev: totals.visitsPrev },
      { label: 'Pessoas que visitaram', value: totals.visitors, prev: totals.visitorsPrev },
      { label: 'Contatos pelo WhatsApp dos sites', value: totals.leads, prev: totals.leadsPrev },
      { label: 'Carros cadastrados', value: totals.added, prev: totals.addedPrev },
      { label: 'Carros vendidos', value: totals.sold, prev: totals.soldPrev },
      { label: 'Vendas com contato pelo site antes', value: totals.soldSite, prev: totals.soldSitePrev },
    ],
    140,
    { vs: 'em relação ao período anterior', same: 'igual ao período anterior' }
  )

  sectionTitle(doc, 'O que o sistema faz pela loja', y + 14)
  table(
    doc,
    autoTable,
    y + 22,
    ['Recurso', 'Onde'],
    [
      ['Site próprio com estoque, fotos, ficha e preço de cada carro', 'Site'],
      ['WhatsApp do site com número fixo ou rodízio entre vendedores', 'Site'],
      ['Contagem de visitas, visualizações e contatos', 'Painel'],
      ['Estoque, gastos, vendas, reservas, contratos e financiamento', 'Painel'],
      ['Clientes, interesses e aviso de carro que combina', 'Painel'],
      ['Equipe com papéis (admin, gerente, vendedor) e histórico de atividades', 'Painel'],
    ],
    ''
  )

  footer(doc, 'Números somados de todas as lojas, sem identificar nenhuma. Contatos pelo WhatsApp contados desde 01/10/2026.')
  downloadBlob(doc.output('blob'), `resultados-plataforma-${range.start}-a-${range.end}.pdf`)
}
