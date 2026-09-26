// Carrega a logomarca da loja (public/logo.jpg) já em base64/ArrayBuffer, pra
// usar no timbrado do contrato em PDF e Word. Se não conseguir carregar (ex:
// arquivo removido), o contrato é gerado normalmente, só sem a logo no topo.

const LOGO_PATH = '/logo.jpg'

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function loadContractLogo() {
  try {
    const res = await fetch(LOGO_PATH)
    if (!res.ok) return null
    const blob = await res.blob()
    const [dataUrl, arrayBuffer, bitmap] = await Promise.all([
      blobToDataUrl(blob),
      blob.arrayBuffer(),
      createImageBitmap(blob),
    ])
    const format = blob.type.includes('png') ? 'PNG' : 'JPEG'
    return { dataUrl, arrayBuffer, format, width: bitmap.width, height: bitmap.height }
  } catch {
    return null
  }
}
