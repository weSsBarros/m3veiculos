// Import dinâmico: jspdf só é carregado quando o admin gera um PDF, pra não
// engordar o bundle do site público.

export async function generateContractPdf({ title, paragraphs, signatures, filename }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const marginX = 20
  const marginTop = 20
  const marginBottom = 20
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const usableWidth = pageWidth - marginX * 2
  let y = marginTop

  function ensureSpace(needed) {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage()
      y = marginTop
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  const titleLines = doc.splitTextToSize(title, usableWidth)
  ensureSpace(titleLines.length * 6)
  doc.text(titleLines, pageWidth / 2, y, { align: 'center' })
  y += titleLines.length * 6 + 6

  doc.setFontSize(10.5)

  for (const paragraph of paragraphs) {
    const parts = paragraph.split('\n')
    for (const part of parts) {
      const isClauseHeading = part.startsWith('CLÁUSULA')
      doc.setFont('helvetica', isClauseHeading ? 'bold' : 'normal')
      const lines = doc.splitTextToSize(part, usableWidth)
      for (const line of lines) {
        ensureSpace(5.5)
        doc.text(line, marginX, y)
        y += 5.5
      }
    }
    y += 3.5
  }

  y += 12
  doc.setFont('helvetica', 'normal')
  for (const sig of signatures) {
    ensureSpace(18)
    doc.text('_'.repeat(45), marginX, y)
    y += 5
    doc.text(`${sig.role} — ${sig.name}`, marginX, y)
    y += 13
  }

  doc.save(filename)
}
