// Fotos dos carros.
//
// Desde a compressão, o painel reduz cada foto no navegador antes de enviar
// (até 1600 px, WebP) e cria uma miniatura (até 640 px). Elas ficam em
// car-photos/<empresa>/p/<arquivo> e car-photos/<empresa>/p/thumbs/<arquivo>.
// Fotos antigas (enviadas antes disso) e links externos não têm miniatura:
// nesses casos as funções abaixo devolvem a própria foto.

const PHOTO_MAX_SIDE = 1600
const THUMB_MAX_SIDE = 640
const PHOTO_QUALITY = 0.8
const THUMB_QUALITY = 0.72

const WITH_THUMB = /\/car-photos\/[^/]+\/p\/[^/]+$/

export function hasThumb(url) {
  return typeof url === 'string' && WITH_THUMB.test(url)
}

export function thumbUrl(url) {
  return hasThumb(url) ? url.replace(/\/p\/([^/]+)$/, '/p/thumbs/$1') : url
}

// Atributos de <img>: o navegador escolhe a miniatura ou a foto grande
// conforme o tamanho em que a imagem aparece na tela.
export function responsivePhoto(url, sizes) {
  if (!hasThumb(url)) return { src: url }
  return { src: url, srcSet: `${thumbUrl(url)} ${THUMB_MAX_SIDE}w, ${url} ${PHOTO_MAX_SIDE}w`, sizes }
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // alguns navegadores não aceitam a opção: tenta pelo <img>
    }
  }
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = objectUrl
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function encode(source, maxSide, quality) {
  const width = source.width
  const height = source.height
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  let blob = await canvasToBlob(canvas, 'image/webp', quality)
  // Navegadores sem WebP devolvem outro formato: usa JPEG
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  if (!blob) throw new Error('Não foi possível processar a imagem.')
  return blob
}

// { photo, thumb, ext } — lança erro se o navegador não conseguir abrir o
// arquivo (ex.: HEIC no computador); quem chama envia o original nesse caso.
export async function compressCarPhoto(file) {
  const source = await loadImage(file)
  try {
    const photo = await encode(source, PHOTO_MAX_SIDE, PHOTO_QUALITY)
    const thumb = await encode(source, THUMB_MAX_SIDE, THUMB_QUALITY)
    // Os dois saem do mesmo codificador, então têm o mesmo formato
    const ext = photo.type === 'image/webp' ? 'webp' : 'jpg'
    return { photo, thumb, ext }
  } finally {
    source.close?.()
  }
}
