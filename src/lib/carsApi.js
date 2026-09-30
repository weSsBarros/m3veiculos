import { supabase, publicSupabase, COMPANY_ID } from './supabaseClient.js'
import { scopeCars, assertCanWrite } from './viewScope.js'
import { slugify } from '../utils/carFormat.js'
import { compressCarPhoto, hasThumb, thumbUrl } from '../utils/carPhotos.js'
import { friendlyUploadError } from './storageErrors.js'

// Colunas visíveis para o site público (chave "anon"). "purchase_price" e
// "purchase_date" (custo de aquisição) ficam de fora — são bloqueadas a nível
// de coluna no banco (ver supabase/schema.sql), então um `select('*')` aqui
// causaria erro de permissão. Mantenha esta lista em sincronia com o schema.
const PUBLIC_COLUMNS =
  'id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images, featured, created_at, updated_at'

function fromRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    brand: row.brand,
    model: row.model,
    version: row.version,
    year: row.year,
    modelYear: row.model_year,
    km: row.km,
    transmission: row.transmission,
    fuel: row.fuel,
    color: row.color,
    doors: row.doors,
    category: row.category,
    condition: row.condition,
    price: row.price,
    originalPrice: row.original_price,
    badge: row.badge,
    status: row.status,
    highlights: row.highlights || [],
    description: row.description || '',
    images: row.images || [],
    purchasePrice: row.purchase_price ?? null,
    purchaseDate: row.purchase_date ?? null,
    featured: row.featured || false,
    hidden: row.hidden || false,
    soldAt: row.sold_at ?? null,
    plate: row.plate || '',
    chassis: row.chassis || '',
    renavam: row.renavam || '',
    documents: row.documents || [],
    customerId: row.customer_id || null,
    stockAlertDays: row.stock_alert_days ?? null,
    // Controle interno (não vão para o site): observações, itens que vieram
    // com o carro e vistoria de entrada
    internalNotes: row.internal_notes || '',
    intakeItems: Array.isArray(row.intake_items) ? row.intake_items : [],
    inspection: Array.isArray(row.inspection) ? row.inspection : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// O admin lê e grava a tabela "cars" direto. Gerente e vendedor usam a view
// "staff_cars", que não tem o custo de aquisição (purchase_price e
// purchase_date) — o gerente informa o custo só ao cadastrar, via
// setCarPurchase; o vendedor não informa custo.
// O AuthContext define o papel assim que o login é carregado.
let staffTable = 'cars'

let canSetPurchase = true

export function setCarsAccess(role) {
  staffTable = role === 'admin' ? 'cars' : 'staff_cars'
  canSetPurchase = role === 'admin' || role === 'manager'
}

function toRow(car) {
  const row = {
    slug: car.slug,
    brand: car.brand,
    model: car.model,
    version: car.version,
    year: car.year,
    model_year: car.modelYear,
    km: car.km,
    transmission: car.transmission,
    fuel: car.fuel,
    color: car.color,
    doors: car.doors,
    category: car.category,
    condition: car.condition,
    price: car.price,
    original_price: car.originalPrice || null,
    badge: car.badge,
    status: car.status,
    sold_at: car.soldAt || null,
    highlights: car.highlights || [],
    description: car.description || '',
    images: car.images || [],
    purchase_price: car.purchasePrice || null,
    purchase_date: car.purchaseDate || null,
    featured: car.featured || false,
    hidden: car.hidden || false,
    plate: car.plate || null,
    chassis: car.chassis || null,
    renavam: car.renavam || null,
    documents: car.documents || [],
    customer_id: car.customerId || null,
    stock_alert_days: car.stockAlertDays || null,
    internal_notes: car.internalNotes || '',
    intake_items: car.intakeItems || [],
    inspection: car.inspection || [],
  }
  if (staffTable !== 'cars') {
    delete row.purchase_price
    delete row.purchase_date
  }
  return row
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

// -- Leitura pública (visitantes do site) ------------------------------------

export async function fetchAvailableCars() {
  requireSupabase()
  const { data, error } = await publicSupabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
    .eq('company_id', COMPANY_ID)
    .in('status', ['disponivel', 'manutencao'])
    .eq('hidden', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchCarBySlug(slug) {
  requireSupabase()
  const { data, error } = await publicSupabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
    .eq('company_id', COMPANY_ID)
    .eq('slug', slug)
    .eq('hidden', false)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function fetchSimilarCars(car, count = 4) {
  requireSupabase()
  const { data, error } = await publicSupabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
    .eq('company_id', COMPANY_ID)
    .eq('status', 'disponivel')
    .eq('hidden', false)
    .eq('category', car.category)
    .neq('id', car.id)
    .limit(count)
  if (error) throw error
  if (data.length > 0) return data.map(fromRow)

  const fallback = await publicSupabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
    .eq('company_id', COMPANY_ID)
    .eq('status', 'disponivel')
    .eq('hidden', false)
    .neq('id', car.id)
    .limit(count)
  if (fallback.error) throw fallback.error
  return fallback.data.map(fromRow)
}

// -- Administração (painel /admin, requer login) -----------------------------

export async function fetchAllCarsAdmin() {
  requireSupabase()
  const { data, error } = await supabase
    .from(staffTable)
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: false })
  if (error) throw error
  return scopeCars(data.map(fromRow))
}

// Estoque visto pelo vendedor: o mesmo da equipe (view "staff_cars", sem
// custo de compra). Mantido com este nome porque várias telas já usam.
export async function fetchSellerCars() {
  return fetchAllCarsAdmin()
}

export async function fetchCarById(id) {
  requireSupabase()
  const { data, error } = await supabase.from(staffTable).select('*').eq('id', id).eq('company_id', COMPANY_ID).maybeSingle()
  if (error) throw error
  return data ? scopeCars([fromRow(data)])[0] : null
}

async function uniqueSlug(base, ignoreId) {
  let slug = slugify(base) || 'carro'
  let attempt = 0
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`
    let query = supabase.from(staffTable).select('id').eq('company_id', COMPANY_ID).eq('slug', candidate)
    if (ignoreId) query = query.neq('id', ignoreId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) return candidate
    attempt += 1
  }
}

export async function createCar(car) {
  requireSupabase()
  const baseSlug = `${car.brand}-${car.model}-${car.version}-${car.year}`
  const slug = await uniqueSlug(baseSlug)
  const { data, error } = await supabase
    .from(staffTable)
    .insert({ ...toRow(car), slug, company_id: COMPANY_ID })
    .select()
    .single()
  if (error) throw error
  // Gerente: o custo de aquisição vai pela função do banco (a view não tem
  // essas colunas). O vendedor não informa custo (a tela nem mostra o campo).
  if (staffTable !== 'cars' && canSetPurchase && (car.purchasePrice || car.purchaseDate)) {
    await setCarPurchase(data.id, car.purchasePrice, car.purchaseDate)
  }
  return fromRow(data)
}

export async function updateCar(id, car) {
  requireSupabase()
  const { data, error } = await supabase.from(staffTable).update(toRow(car)).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return fromRow(data)
}

async function patchCar(id, patch) {
  const { data, error } = await supabase.from(staffTable).update(patch).eq('id', id).eq('company_id', COMPANY_ID).select().single()
  if (error) throw error
  return fromRow(data)
}

// Opções: hidden (boolean), saleDate (yyyy-mm-dd, informada na janela de
// venda), customerId (cliente comprador; null tira o vínculo).
export async function updateCarStatus(id, status, { hidden, saleDate, customerId } = {}) {
  requireSupabase()
  let soldAt = null
  if (status === 'vendido') {
    soldAt = saleDate ? new Date(`${saleDate}T12:00:00`).toISOString() : new Date().toISOString()
  }
  const patch = { status, sold_at: soldAt }
  if (hidden !== undefined) patch.hidden = hidden
  if (customerId !== undefined) patch.customer_id = customerId || null
  return patchCar(id, patch)
}

export async function updateCarCustomer(id, customerId) {
  requireSupabase()
  return patchCar(id, { customer_id: customerId || null })
}

export async function updateCarDocuments(id, documents) {
  requireSupabase()
  return patchCar(id, { documents })
}

export async function updateCarFeatured(id, featured) {
  requireSupabase()
  return patchCar(id, { featured })
}

export async function updateCarHidden(id, hidden) {
  requireSupabase()
  return patchCar(id, { hidden })
}

// Custo de aquisição. O admin pode sempre; o gerente só quando ainda está em
// branco (a regra fica no banco, na função set_car_purchase).
export async function setCarPurchase(id, purchasePrice, purchaseDate) {
  requireSupabase()
  const { error } = await supabase.rpc('set_car_purchase', {
    p_car_id: id,
    p_price: purchasePrice || null,
    p_date: purchaseDate || null,
  })
  if (error) throw error
}

// Carro recebido na troca: entra no estoque "em manutenção" e oculto do site,
// com custo de compra = valor da troca. Devolve o id do carro novo.
export async function registerTradeIn(tradeIn) {
  requireSupabase()
  const { data, error } = await supabase.rpc('register_trade_in', {
    p: {
      brand: tradeIn.brand,
      model: tradeIn.model,
      version: tradeIn.version || '',
      year: tradeIn.year,
      model_year: tradeIn.modelYear || '',
      km: tradeIn.km ?? '',
      color: tradeIn.color || '',
      plate: tradeIn.plate || '',
      value: tradeIn.value ?? '',
      date: tradeIn.date || '',
      notes: tradeIn.notes || '',
    },
  })
  if (error) throw error
  return data
}

export async function deleteCar(id) {
  requireSupabase()
  const { error } = await supabase.from('cars').delete().eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

// -- Fotos (no próprio site da loja, pasta /uploads/carros) --------------------

// A foto é comprimida no navegador (ver utils/carPhotos.js) e vai, junto com a
// miniatura, para o api/fotos.php do site (Hostinger), que confere com o
// Supabase se o login é de admin ou gerente desta loja. O banco guarda só o
// endereço sem o domínio (/uploads/carros/<nome>), então trocar o domínio do
// site não quebra as fotos. Fotos que ainda estejam no Supabase Storage
// (bucket "car-photos") continuam aparecendo e podem ser removidas.
const PHOTO_API = '/api/fotos.php'
const SITE_PHOTO = /^\/uploads\/carros\//

async function callPhotoApi(form) {
  assertCanWrite()
  if (import.meta.env.DEV) {
    throw new Error('O envio de fotos só funciona no site publicado (o api/fotos.php roda na Hostinger).')
  }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sua sessão expirou. Entre de novo no painel.')
  let res
  try {
    res = await fetch(PHOTO_API, { method: 'POST', headers: { 'X-Auth-Token': token }, body: form })
  } catch {
    throw new Error('Sem conexão com o site. Confira a internet e tente de novo.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok || !body) throw new Error(body?.error || `O site recusou o envio (erro ${res.status}).`)
  return body
}

export async function uploadCarImage(file) {
  requireSupabase()

  let compressed
  try {
    compressed = await compressCarPhoto(file)
  } catch {
    // O navegador não abre o arquivo (ex.: HEIC no computador, ou algo que
    // não é imagem). Mesmo que subisse, a maioria dos visitantes não veria a foto.
    throw new Error(
      `"${file.name}" está num formato que o navegador não consegue abrir (por exemplo, HEIC). ` +
        'Envie as fotos em JPG, PNG ou WebP. No iPhone: Ajustes › Câmera › Formatos › "Mais compatível".'
    )
  }

  const form = new FormData()
  form.append('action', 'upload')
  form.append('photo', compressed.photo, `foto.${compressed.ext}`)
  form.append('thumb', compressed.thumb, `miniatura.${compressed.ext}`)
  try {
    const { url } = await callPhotoApi(form)
    return url
  } catch (err) {
    throw new Error(`"${file.name}": ${err.message}`)
  }
}

export async function deleteCarImage(url) {
  requireSupabase()
  if (SITE_PHOTO.test(url)) {
    const form = new FormData()
    form.append('action', 'delete')
    form.append('url', url)
    await callPhotoApi(form)
    return
  }
  // Foto que ainda está no Supabase Storage
  const marker = '/car-photos/'
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const paths = [url.slice(idx + marker.length)]
  if (hasThumb(url)) {
    const thumb = thumbUrl(url)
    paths.push(thumb.slice(thumb.indexOf(marker) + marker.length))
  }
  await supabase.storage.from('car-photos').remove(paths)
}

// -- Documentos do carro (Supabase Storage, bucket PRIVADO "car-documents") --
// Igual aos anexos de gastos: guardamos só o "path" no banco (coluna
// cars.documents) e geramos um link assinado temporário na hora de abrir.

export async function uploadCarDocument(carId, file) {
  requireSupabase()
  const ext = file.name.split('.').pop()
  const path = `${COMPANY_ID}/${carId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('car-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw friendlyUploadError(error, file.name, { accepted: 'PDF ou imagem (JPG, PNG)', maxSize: '20 MB' })
  return { path, name: file.name, type: file.type }
}

export async function deleteCarDocument(path) {
  requireSupabase()
  await supabase.storage.from('car-documents').remove([path])
}

export async function getCarDocumentSignedUrl(path) {
  requireSupabase()
  const { data, error } = await supabase.storage.from('car-documents').createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}
