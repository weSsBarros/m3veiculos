import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { formatCurrency } from '../src/utils/carFormat.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function loadEnv() {
  const path = join(root, '.env')
  const env = {}
  if (!existsSync(path)) return env
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
const SITE_URL = (env.VITE_SITE_URL || '').replace(/\/$/, '')

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('[prerender-og] Supabase não configurado (.env vazio) — pulando geração de previews por carro.')
  process.exit(0)
}

if (!SITE_URL) {
  console.log('[prerender-og] VITE_SITE_URL não definida no .env — pulando geração de previews por carro.')
  process.exit(0)
}

const distIndexPath = join(root, 'dist', 'index.html')
if (!existsSync(distIndexPath)) {
  console.error('[prerender-og] dist/index.html não encontrado — rode "vite build" antes deste script.')
  process.exit(1)
}

const template = readFileSync(distIndexPath, 'utf-8')
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const { data: cars, error } = await supabase
  .from('cars')
  .select('slug, brand, model, version, model_year, km, transmission, price, images')
  .eq('status', 'disponivel')

if (error) {
  console.error('[prerender-og] Falha ao buscar carros no Supabase:', error.message)
  process.exit(1)
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function withMeta(html, { title, description, image, url }) {
  let out = html
  out = out.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`)
  out = out.replace(/<meta name="description" content=".*?"\s*\/>/s, `<meta name="description" content="${escapeHtml(description)}" />`)
  out = out.replace(/<meta property="og:title" content=".*?"\s*\/>/s, `<meta property="og:title" content="${escapeHtml(title)}" />`)
  out = out.replace(/<meta property="og:description" content=".*?"\s*\/>/s, `<meta property="og:description" content="${escapeHtml(description)}" />`)
  out = out.replace(/<meta property="og:image" content=".*?"\s*\/>/s, `<meta property="og:image" content="${escapeHtml(image)}" />`)
  out = out.replace(/<meta property="og:url" content=".*?"\s*\/>/s, `<meta property="og:url" content="${escapeHtml(url)}" />`)
  return out
}

let count = 0
for (const row of cars || []) {
  if (!row.slug) continue
  const title = `${row.brand} ${row.model} ${row.version} — ${formatCurrency(row.price)} | M&3 Veículos`
  const description = `${row.model_year} · ${Number(row.km).toLocaleString('pt-BR')} km · ${row.transmission}. Confira esse e outros veículos na M&3 Veículos.`
  const image = row.images?.[0] || `${SITE_URL}/logo.jpg`
  const url = `${SITE_URL}/carro/${row.slug}`

  const html = withMeta(template, { title, description, image, url })
  const outDir = join(root, 'dist', 'carro', row.slug)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
  count += 1
}

console.log(`[prerender-og] ${count} página(s) de carro pré-renderizadas com preview próprio.`)
