// Traduz os erros de envio que a própria pessoa consegue resolver (tipo de
// arquivo e tamanho — limites definidos nos buckets, seção 24 do schema.sql).
// Os demais erros seguem como vieram.
export function friendlyUploadError(err, fileName, { accepted, maxSize }) {
  const message = err?.message || ''
  if (/mime type/i.test(message)) {
    return new Error(`"${fileName}" não é um tipo de arquivo aceito. Envie ${accepted}.`)
  }
  if (/maximum allowed size|too large/i.test(message)) {
    return new Error(`"${fileName}" é grande demais (limite de ${maxSize}).`)
  }
  return err
}
