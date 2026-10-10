// Fotos dos carros.
//
// O painel reduz cada foto no navegador antes de enviar (até 1600 px, WebP) e
// cria uma miniatura (até 640 px), que fica na subpasta "thumbs":
// - no próprio site: /uploads/carros/<arquivo> e /uploads/carros/thumbs/<arquivo>
// - fotos que ainda estejam no Supabase Storage:
//   car-photos/<empresa>/p/<arquivo> e car-photos/<empresa>/p/thumbs/<arquivo>
// Fotos antigas (de antes da compressão) e links externos não têm miniatura:
// nesses casos as funções abaixo devolvem a própria foto.

const PHOTO_MAX_SIDE = 1600
const THUMB_MAX_SIDE = 640
const PHOTO_QUALITY = 0.8
const THUMB_QUALITY = 0.72

const WITH_THUMB = /^\/uploads\/carros\/[^/]+$|\/car-photos\/[^/]+\/p\/[^/]+$/

export function hasThumb(url) {
  return typeof url === 'string' && WITH_THUMB.test(url)
}

export function thumbUrl(url) {
  return hasThumb(url) ? url.replace(/\/([^/]+)$/, '/thumbs/$1') : url
}

// Fotos que saíram do cadastro: as que estiveram no formulário (gravadas antes
// ou enviadas agora) e não ficaram na lista salva. O painel apaga essas do
// site só depois de salvar o carro.
export function removedPhotos(seen, kept) {
  const keep = new Set(kept)
  return [...new Set(seen)].filter((url) => url && !keep.has(url))
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
// arquivo (ex.: HEIC no computador); quem chama avisa que o formato não é aceito.
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

// Foto do CRLV para a leitura pela IA (preenchimento automático do carro): JPEG de
// até 1600 px, que cabe no limite da função (4 MB) e continua legível. O HEIC do
// iPhone vira JPEG aqui; se o navegador não abrir a foto, ela vai como está e a
// função responde que o formato não serve.
const READ_MAX_SIDE = 1600

export async function documentPhotoForReading(file) {
  let source
  try {
    source = await loadImage(file)
  } catch {
    return file
  }
  try {
    const scale = Math.min(1, READ_MAX_SIDE / Math.max(source.width, source.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(source.width * scale))
    canvas.height = Math.max(1, Math.round(source.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas, 'image/jpeg', DOC_QUALITY)
    if (!blob) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'documento'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } finally {
    source.close?.()
  }
}

// Foto de documento do cliente (CNH, RG, comprovantes): JPEG de até 2000 px, que
// continua legível e abre em qualquer aparelho. PDF, arquivo pequeno ou foto que
// o navegador não consegue abrir (ex.: HEIC no computador) vão como estão.
const DOC_MAX_SIDE = 2000
const DOC_QUALITY = 0.85
const DOC_KEEP_BELOW = 1.5 * 1024 * 1024

export async function compressDocumentPhoto(file) {
  if (!file.type.startsWith('image/') || file.size <= DOC_KEEP_BELOW) return file
  let source
  try {
    source = await loadImage(file)
  } catch {
    return file
  }
  try {
    const width = source.width
    const height = source.height
    const scale = Math.min(1, DOC_MAX_SIDE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas, 'image/jpeg', DOC_QUALITY)
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'documento'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } finally {
    source.close?.()
  }
}
