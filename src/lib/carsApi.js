import { supabase } from './supabaseClient.js'
import { slugify } from '../utils/carFormat.js'

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(car) {
  return {
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
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

// -- Leitura pública (visitantes do site) ------------------------------------

export async function fetchAvailableCars() {
  requireSupabase()
  const { data, error } = await supabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
    .eq('status', 'disponivel')
    .eq('hidden', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchCarBySlug(slug) {
  requireSupabase()
  const { data, error } = await supabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
    .eq('slug', slug)
    .eq('hidden', false)
    .neq('status', 'manutencao')
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function fetchSimilarCars(car, count = 4) {
  requireSupabase()
  const { data, error } = await supabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
    .eq('status', 'disponivel')
    .eq('hidden', false)
    .eq('category', car.category)
    .neq('id', car.id)
    .limit(count)
  if (error) throw error
  if (data.length > 0) return data.map(fromRow)

  const fallback = await supabase
    .from('cars')
    .select(PUBLIC_COLUMNS)
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
  const { data, error } = await supabase.from('cars').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchCarById(id) {
  requireSupabase()
  const { data, error } = await supabase.from('cars').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

async function uniqueSlug(base, ignoreId) {
  let slug = slugify(base) || 'carro'
  let attempt = 0
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`
    let query = supabase.from('cars').select('id').eq('slug', candidate)
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
    .from('cars')
    .insert({ ...toRow(car), slug })
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCar(id, car) {
  requireSupabase()
  const { data, error } = await supabase.from('cars').update(toRow(car)).eq('id', id).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCarStatus(id, status) {
  requireSupabase()
  const soldAt = status === 'vendido' ? new Date().toISOString() : null
  const { data, error } = await supabase.from('cars').update({ status, sold_at: soldAt }).eq('id', id).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCarFeatured(id, featured) {
  requireSupabase()
  const { data, error } = await supabase.from('cars').update({ featured }).eq('id', id).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCarHidden(id, hidden) {
  requireSupabase()
  const { data, error } = await supabase.from('cars').update({ hidden }).eq('id', id).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteCar(id) {
  requireSupabase()
  const { error } = await supabase.from('cars').delete().eq('id', id)
  if (error) throw error
}

// -- Fotos (Supabase Storage, bucket "car-photos") ----------------------------

export async function uploadCarImage(file) {
  requireSupabase()
  const ext = file.name.split('.').pop()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('car-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('car-photos').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteCarImage(url) {
  requireSupabase()
  const marker = '/car-photos/'
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const path = url.slice(idx + marker.length)
  await supabase.storage.from('car-photos').remove([path])
}

// -- Documentos do carro (Supabase Storage, bucket PRIVADO "car-documents") --
// Igual aos anexos de gastos: guardamos só o "path" no banco (coluna
// cars.documents) e geramos um link assinado temporário na hora de abrir.

export async function uploadCarDocument(carId, file) {
  requireSupabase()
  const ext = file.name.split('.').pop()
  const path = `${carId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('car-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
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
