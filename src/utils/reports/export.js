// Exporta um relatório (utils/reports/build.js) em PDF ou Excel. As
// bibliotecas só são carregadas no clique, para não pesar o painel.
import { downloadBlob } from '../downloadBlob.js'
import { slugify } from '../carFormat.js'

const moneyFmt = (v) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }))
const dateFmt = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '')

function cellText(value, type) {
  if (value == null || value === '') return ''
  if (type === 'money') return typeof value === 'number' ? moneyFmt(value) : String(value)
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? dateFmt(value) : String(value)
  if (type === 'int') return typeof value === 'number' ? value.toLocaleString('pt-BR') : String(value)
  return String(value)
}

export function reportFileName(report, companyName, ext) {
  const date = new Date()
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `${slugify(`${report.title} ${companyName || ''}`) || 'relatorio'}-${stamp}.${ext}`
}

export async function exportReportPdf(report, { companyName = '' } = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const margin = 36
  doc.setFontSize(16)
  doc.text(`${report.title}${companyName ? ` — ${companyName}` : ''}`, margin, margin + 6)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(report.subtitle || '', margin, margin + 22)
  doc.setTextColor(0)
  let y = margin + 38

  for (const section of report.sections) {
    doc.setFontSize(12)
    doc.text(section.title, margin, y + 10)
    const head = [section.columns.map((c) => c.label)]
    const body = section.rows.length
      ? section.rows.map((row) => section.columns.map((c) => cellText(row[c.key], c.type)))
      : [[{ content: 'Nada no período.', colSpan: section.columns.length }]]
    const foot = section.totals ? [section.columns.map((c) => cellText(section.totals[c.key], c.type === 'date' ? 'text' : c.type))] : undefined
    autoTable(doc, {
      startY: y + 16,
      head,
      body,
      foot,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59] },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(section.columns.map((c, i) => [i, c.type === 'money' || c.type === 'int' ? { halign: 'right' } : {}])),
    })
    y = doc.lastAutoTable.finalY + 24
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage()
      y = margin
    }
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · página ${i} de ${pages}`, margin, doc.internal.pageSize.getHeight() - 16)
  }
  downloadBlob(doc.output('blob'), reportFileName(report, companyName, 'pdf'))
}

function excelCell(value, type) {
  if (value == null || value === '') return null
  if (type === 'money' && typeof value === 'number') return { value, type: Number, format: '#,##0.00' }
  if (type === 'int' && typeof value === 'number') return { value, type: Number }
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
    return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: 'dd/mm/yyyy' }
  }
  return { value: String(value), type: String }
}

// Nome de aba do Excel: até 31 caracteres, sem : \ / ? * [ ]
function sheetName(title, used) {
  let name = title.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Planilha'
  let i = 2
  while (used.has(name)) name = `${name.slice(0, 28)} ${i++}`
  used.add(name)
  return name
}

export async function exportReportExcel(report, { companyName = '' } = {}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const used = new Set()
  const sheets = report.sections.map((section) => {
    const header = section.columns.map((c) => ({ value: c.label, fontWeight: 'bold' }))
    const rows = section.rows.map((row) => section.columns.map((c) => excelCell(row[c.key], c.type)))
    const data = [header, ...rows]
    if (section.totals) {
      data.push(section.columns.map((c) => {
        const cell = excelCell(section.totals[c.key], c.type === 'date' ? 'text' : c.type)
        return cell ? { ...cell, fontWeight: 'bold' } : null
      }))
    }
    return {
      data,
      sheet: sheetName(section.title, used),
      columns: section.columns.map((c) => ({ width: c.type === 'text' ? 28 : 16 })),
      stickyRowsCount: 1,
    }
  })
  const blob = await writeXlsxFile(sheets).toBlob()
  downloadBlob(blob, reportFileName(report, companyName, 'xlsx'))
}
