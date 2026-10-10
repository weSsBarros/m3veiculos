import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Dados da loja para o Google (api/pagina.php e títulos no navegador): nome,
// título e descrição do index.html; cidade, telefone, endereço e Instagram do
// src/utils/storeInfo.js (as lojas de visual original não têm: ficam só com o
// que o index.html diz). Campo vazio não sai; a cidade, sem nada no site, é São Luís.
async function storeSeo() {
  const root = process.cwd()
  const html = readFileSync(resolve(root, 'index.html'), 'utf8')
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
  const title = decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '')
  const description = decode((html.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [])[1] || '')
  const name = title.split('|')[0].trim()
  const infoPath = resolve(root, 'src/utils/storeInfo.js')
  const info = existsSync(infoPath) ? (await import(pathToFileURL(infoPath).href)).STORE || {} : {}
  const { storeCity, pageSeo } = await import(pathToFileURL(resolve(root, 'src/utils/seoPages.js')).href)
  const address = (info.address || []).filter(Boolean)
  // Sem cidade no site, São Luís (decisão do Wesley em 10/10/2026: as lojas são de São Luís)
  const city = storeCity(address, title, description) || 'São Luís'
  const phoneDigits = String(info.whatsappDisplay || info.phoneDisplay || '').replace(/\D/g, '')
  const instagram = [].concat(info.instagram || []).flatMap((i) => (typeof i === 'string' ? [i] : [i?.handle || i?.user || ''])).filter(Boolean)
  const image = ['og-image.jpg', 'icon-512.png'].find((f) => existsSync(resolve(root, 'public', f)))
  const store = { name, city, hasAddress: address.length > 0 }
  const pages = {}
  for (const path of ['/estoque', '/sobre', '/contato', '/financiamento', '/venda-seu-veiculo']) {
    const page = pageSeo(path, store)
    if (page) pages[path] = page
  }
  return {
    name,
    title,
    description,
    city,
    region: city ? 'MA' : '',
    phone: phoneDigits.length >= 10 ? `+55${phoneDigits}` : '',
    email: info.email || '',
    address,
    instagram: instagram.map((h) => `https://www.instagram.com/${h.replace(/^@/, '')}/`),
    image: image ? `/${image}` : '',
    pages,
  }
}

// Valor do PHP (texto, lista ou mapa) para o fotos-config.php
function phpValue(value) {
  if (Array.isArray(value)) return `[${value.map(phpValue).join(', ')}]`
  if (value && typeof value === 'object') {
    return `[${Object.entries(value).map(([k, v]) => `${phpValue(k)} => ${phpValue(v)}`).join(', ')}]`
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

// O api/fotos.php (fotos dos carros na Hostinger) não lê o .env: o build gera
// o api/fotos-config.php com o endereço do Supabase, a chave pública e a loja
// deste site — os mesmos valores que já vão no JavaScript do site. Também vão
// as páginas públicas (rotas do App.jsx) para o api/sitemap.php e os dados de
// SEO da loja para o api/pagina.php.
function photoApiConfig(env) {
  return {
    name: 'photo-api-config',
    apply: 'build',
    async generateBundle() {
      const values = {
        supabase_url: env.VITE_SUPABASE_URL,
        anon_key: env.VITE_SUPABASE_ANON_KEY,
        company_id: env.VITE_COMPANY_ID,
      }
      for (const [key, value] of Object.entries(values)) {
        if (!value || !/^[\w.:/-]+$/.test(value)) throw new Error(`api/fotos-config.php: ${key} ausente ou inválido no .env`)
      }
      const lines = Object.entries(values).map(([key, value]) => `  '${key}' => '${value}',`)
      const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
      const pages = [...new Set([...app.matchAll(/<Route\s+path="(\/[^"]*)"/g)].map((m) => m[1]))].filter(
        (p) => !p.startsWith('/admin') && !p.startsWith('/wbdev') && !p.includes(':') && !p.includes('*')
      )
      lines.push(`  'site_pages' => [${pages.map((p) => `'${p}'`).join(', ')}],`)
      lines.push(`  'seo' => ${phpValue(await storeSeo())},`)
      this.emitFile({
        type: 'asset',
        fileName: 'api/fotos-config.php',
        source: `<?php\n// Gerado no build (vite.config.js). Não editar.\nreturn [\n${lines.join('\n')}\n];\n`,
      })
    },
  }
}

// Nome, cidade, título e descrição da loja também no navegador (títulos das páginas)
function storeSeoDefine() {
  return {
    name: 'store-seo-define',
    async config() {
      const seo = await storeSeo()
      return {
        define: {
          'import.meta.env.VITE_STORE_NAME': JSON.stringify(seo.name),
          'import.meta.env.VITE_STORE_CITY': JSON.stringify(seo.city),
          'import.meta.env.VITE_STORE_TITLE': JSON.stringify(seo.title),
          'import.meta.env.VITE_STORE_DESCRIPTION': JSON.stringify(seo.description),
          'import.meta.env.VITE_STORE_HAS_ADDRESS': JSON.stringify(seo.address.length ? '1' : ''),
        },
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), storeSeoDefine(), photoApiConfig(loadEnv(mode, process.cwd(), 'VITE_'))],
}))
