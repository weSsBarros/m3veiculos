import { supabase } from './supabaseClient.js'
import { slugify } from '../utils/carFormat.js'

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
    featured: row.featured || false,
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
    highlights: car.highlights || [],
    description: car.description || '',
    images: car.images || [],
    featured: car.featured || false,
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
    .select('*')
    .eq('status', 'disponivel')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchCarBySlug(slug) {
  requireSupabase()
  const { data, error } = await supabase.from('cars').select('*').eq('slug', slug).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function fetchSimilarCars(car, count = 4) {
  requireSupabase()
  const { data, error } = await supabase
    .from('cars')
    .select('*')
    .eq('status', 'disponivel')
    .eq('category', car.category)
    .neq('id', car.id)
    .limit(count)
  if (error) throw error
  if (data.length > 0) return data.map(fromRow)

  const fallback = await supabase
    .from('cars')
    .select('*')
    .eq('status', 'disponivel')
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
  const { data, error } = await supabase.from('cars').update({ status }).eq('id', id).select().single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCarFeatured(id, featured) {
  requireSupabase()
  const { data, error } = await supabase.from('cars').update({ featured }).eq('id', id).select().single()
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
