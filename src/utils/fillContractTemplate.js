// Import dinâmico: pizzip/docxtemplater só carregam quando o admin gera um
// contrato a partir de um modelo próprio, pra não engordar o bundle do site
// público nem o fluxo padrão (que já funciona sem essas libs).

export async function fillContractTemplate(templateArrayBuffer, data, filename) {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
  ])

  const zip = new PizZip(templateArrayBuffer)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })

  try {
    doc.render(data)
  } catch (err) {
    const details = err.properties?.errors
      ?.map((e) => e.properties?.explanation)
      .filter(Boolean)
      .join('; ')
    throw new Error(details || 'Verifique se as tags do modelo estão escritas corretamente (ex: {cliente_nome}).')
  }

  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
