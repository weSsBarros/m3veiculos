import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// O api/fotos.php (fotos dos carros na Hostinger) não lê o .env: o build gera
// o api/fotos-config.php com o endereço do Supabase, a chave pública e a loja
// deste site — os mesmos valores que já vão no JavaScript do site. Também vão
// as páginas públicas (rotas do App.jsx) para o api/sitemap.php.
function photoApiConfig(env) {
  return {
    name: 'photo-api-config',
    apply: 'build',
    generateBundle() {
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
        (p) => !p.startsWith('/admin') && !p.includes(':') && !p.includes('*')
      )
      lines.push(`  'site_pages' => [${pages.map((p) => `'${p}'`).join(', ')}],`)
      this.emitFile({
        type: 'asset',
        fileName: 'api/fotos-config.php',
        source: `<?php\n// Gerado no build (vite.config.js). Não editar.\nreturn [\n${lines.join('\n')}\n];\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), photoApiConfig(loadEnv(mode, process.cwd(), 'VITE_'))],
}))
