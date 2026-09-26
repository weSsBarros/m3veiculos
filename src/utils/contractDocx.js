// Import dinâmico: docx só é carregado quando o admin gera um Word, pra não
// engordar o bundle do site público.

export async function generateContractDocx({ title, paragraphs, signatures, filename, logo }) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, ImageRun } = await import('docx')

  const children = []

  if (logo) {
    const logoWidth = 110
    const logoHeight = Math.round((logo.height / logo.width) * logoWidth)
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new ImageRun({
            type: logo.format === 'PNG' ? 'png' : 'jpg',
            data: logo.arrayBuffer,
            transformation: { width: logoWidth, height: logoHeight },
          }),
        ],
      })
    )
  }

  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  )

  for (const paragraph of paragraphs) {
    const parts = paragraph.split('\n')
    parts.forEach((part, i) => {
      const isClauseHeading = part.startsWith('CLÁUSULA')
      children.push(
        new Paragraph({
          children: [new TextRun({ text: part, bold: isClauseHeading })],
          spacing: { after: i === parts.length - 1 ? 200 : 80 },
        })
      )
    })
  }

  children.push(new Paragraph({ text: '', spacing: { after: 300 } }))

  for (const sig of signatures) {
    children.push(new Paragraph({ text: '_'.repeat(45), spacing: { after: 40 } }))
    children.push(new Paragraph({ text: `${sig.role} — ${sig.name}`, spacing: { after: 300 } }))
  }

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
