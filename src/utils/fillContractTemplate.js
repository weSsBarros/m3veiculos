// Import dinâmico: pizzip/docxtemplater só carregam quando o admin gera um
// contrato a partir de um modelo próprio, pra não engordar o bundle do site
// público nem o fluxo padrão (que já funciona sem essas libs).

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function loadLibs() {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
  ])
  return { PizZip, Docxtemplater }
}

// Preenche o modelo e devolve o .docx (Blob), sem baixar. Usado na prévia.
export async function fillContractTemplateBlob(templateArrayBuffer, data) {
  const { PizZip, Docxtemplater } = await loadLibs()
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

  return doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function fillContractTemplate(templateArrayBuffer, data, filename) {
  downloadBlob(await fillContractTemplateBlob(templateArrayBuffer, data), filename)
}

// Troca o word/document.xml de um .docx (editor de modelos)
export async function replaceDocumentXml(templateArrayBuffer, xml) {
  const { PizZip } = await loadLibs()
  const zip = new PizZip(templateArrayBuffer)
  zip.file('word/document.xml', xml)
  return zip.generate({ type: 'arraybuffer', mimeType: DOCX_MIME })
}

export async function readDocumentXml(templateArrayBuffer) {
  const { PizZip } = await loadLibs()
  const file = new PizZip(templateArrayBuffer).file('word/document.xml')
  if (!file) throw new Error('O arquivo não parece ser um .docx do Word.')
  return file.asText()
}
