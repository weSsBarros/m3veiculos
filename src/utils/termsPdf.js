// Comprovante do aceite do contrato de adesão (página Mensalidade da loja e
// ficha do cliente na Plataforma): o texto aceito e o registro do aceite.

import { downloadBlob } from './downloadBlob.js'
import { slugify } from './carFormat.js'
import { newDoc, header, footer, MARGIN, MUTED, INK } from './platformPdf.js'
import { pdfSafeText } from './pdfText.js'

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'medium' }) : '—'

export async function exportTermsReceiptPdf(receipt) {
  const { doc } = await newDoc()
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const textWidth = width - MARGIN * 2
  header(doc, pdfSafeText(receipt.title || 'Contrato de adesão'), pdfSafeText(`${receipt.company || 'Loja'} · versão ${receipt.version} · comprovante do aceite`))

  // Registro do aceite
  let y = 128
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text('Registro do aceite eletrônico', MARGIN, y)
  y += 18
  const rows = [
    ['Loja', [receipt.company, receipt.legal_name].filter(Boolean).join(' · ')],
    ['CNPJ da loja', receipt.cnpj || '—'],
    ['Versão aceita', `${receipt.version} (publicada em ${dateTime(receipt.published_at)})`],
    ['Aceito em', dateTime(receipt.accepted_at)],
    ['Por', [receipt.user_name, receipt.user_email].filter(Boolean).join(' · ') || '—'],
    ['Endereço IP', receipt.ip || '—'],
    ['Navegador', receipt.user_agent || '—'],
    ['Impressão digital do texto (SHA-256)', receipt.body_sha256 || '—'],
  ]
  doc.setFontSize(9.5)
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MUTED)
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    const lines = doc.splitTextToSize(pdfSafeText(value), textWidth - 170)
    doc.text(lines, MARGIN + 170, y)
    y += Math.max(14, lines.length * 12)
  }

  // Texto aceito
  y += 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Texto aceito', MARGIN, y)
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const lines = doc.splitTextToSize(pdfSafeText(receipt.body || ''), textWidth)
  for (const line of lines) {
    if (y > height - 60) {
      doc.addPage()
      y = MARGIN + 10
    }
    doc.text(line, MARGIN, y)
    y += 12.5
  }

  footer(doc, 'Aceite eletrônico registrado no painel WB.AUTO (art. 10, § 2º, da MP 2.200-2/2001 e Lei 14.063/2020).')
  const name = `contrato-de-adesao-v${receipt.version}-${slugify(receipt.company || 'loja')}.pdf`
  downloadBlob(doc.output('blob'), name)
}
