// Recibo de pagamento da mensalidade (painel WB.Dev), no mesmo visual dos PDFs
// da Plataforma (utils/platformPdf.js).

import { downloadBlob } from './downloadBlob.js'
import { slugify } from './carFormat.js'
import { money, monthName, dateBR } from './billing.js'
import { SUPPORT_DISPLAY } from './support.js'

const INK = [14, 17, 23]
const COBALT = [36, 70, 200]
const MUTED = [90, 100, 117]
const MARGIN = 48

// client: cliente do painel WB.Dev (lib/clientsApi.js); payment: pagamento
export async function buildPaymentReceipt({ client, payment }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const textWidth = width - MARGIN * 2

  doc.setFillColor(...INK)
  doc.rect(0, 0, width, 96, 'F')
  doc.setFillColor(...COBALT)
  doc.rect(0, 96, width, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('WB.Dev', MARGIN, 34)
  doc.setFontSize(20)
  doc.text('Recibo de pagamento', MARGIN, 62)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(200, 206, 220)
  const number = `R-${payment.referenceMonth.slice(0, 7).replace('-', '')}-${payment.id.slice(0, 6).toUpperCase()}`
  doc.text(`Nº ${number}`, MARGIN, 82)

  const payer = client.account.legalName || client.name
  const cnpj = client.account.cnpj ? `, CNPJ ${client.account.cnpj}` : ''
  const method = payment.method ? ` (${payment.method})` : ''
  const body =
    `Recebemos de ${payer}${cnpj} a importância de ${money(payment.amount)}, referente à mensalidade do sistema ` +
    `WB.AUTO (site e painel da ${client.name}) do mês de ${monthName(payment.referenceMonth)}, paga em ` +
    `${dateBR(payment.paidOn)}${method}.`

  doc.setTextColor(...INK)
  doc.setFontSize(12)
  doc.text(doc.splitTextToSize(body, textWidth), MARGIN, 150, { lineHeightFactor: 1.6 })

  let y = 270
  const rows = [
    ['Cliente', client.name],
    ['Mês de referência', monthName(payment.referenceMonth)],
    ['Valor', money(payment.amount)],
    ['Pago em', dateBR(payment.paidOn)],
  ]
  if (payment.method) rows.push(['Forma de pagamento', payment.method])
  if (payment.notes) rows.push(['Observação', payment.notes])
  doc.setDrawColor(221, 226, 233)
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(String(value), MARGIN + 150, y)
    doc.line(MARGIN, y + 8, width - MARGIN, y + 8)
    y += 26
  }

  y += 40
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`São Luís/MA, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.`, MARGIN, y)
  y += 60
  doc.line(MARGIN, y, MARGIN + 240, y)
  doc.setFont('helvetica', 'bold')
  doc.text('WB.Dev', MARGIN, y + 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  doc.text(`WhatsApp ${SUPPORT_DISPLAY}`, MARGIN, y + 30)

  doc.setFontSize(8)
  doc.text(`Gerado pelo painel WB.Dev em ${new Date().toLocaleString('pt-BR')}`, MARGIN, height - 24)

  return { blob: doc.output('blob'), filename: `recibo-${slugify(client.name)}-${payment.referenceMonth.slice(0, 7)}.pdf` }
}

export async function exportPaymentReceipt({ client, payment }) {
  const { blob, filename } = await buildPaymentReceipt({ client, payment })
  downloadBlob(blob, filename)
}

// O mesmo recibo em base64, para ir anexado no e-mail (Edge Function wbdev-email)
export async function paymentReceiptBase64({ client, payment }) {
  const { blob, filename } = await buildPaymentReceipt({ client, payment })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { base64: btoa(binary), filename }
}
