// Tema escuro do painel: gera src/admin/admin-dark.css a partir do admin.css e
// dos CSS dos componentes usados no painel.
//
// Toda declaração de cor (fundo, borda, texto, sombra) volta, na mesma ordem,
// com o prefixo html[data-admin-theme='escuro']: assim nenhuma regra perde a
// briga de prioridade que ganhava no tema claro. As cores fixas claras viram as
// escuras (branco → superfície escura, tons claros → tons escuros, texto escuro
// → claro); o que usa variável acompanha as variáveis escuras do topo.
//
// Uso: node scripts/tema-escuro.mjs (o teste tests/temaEscuro.test.js confere
// que o arquivo gerado está em dia com o admin.css).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DARK_SOURCES = [
  'src/admin/admin.css',
  'src/components/ConfirmDialog.css',
  'src/components/NumberInputs.css',
  'src/components/SetupNotice.css',
  'src/components/charts/charts.css',
]

export const DARK_OUTPUT = 'src/admin/admin-dark.css'

const ATTR = "html[data-admin-theme='escuro']"

// Documentos (página do editor de contrato, prévia do Word) continuam brancos
const KEEP_LIGHT = /\.tpl-doc\b|\.docx-wrapper|section\.docx/

const HEADER = `/* Tema escuro do painel. GERADO por scripts/tema-escuro.mjs a partir do admin.css e
   dos CSS dos componentes do painel: não editar à mão. Depois de mudar o admin.css,
   rode "node scripts/tema-escuro.mjs" (o teste tests/temaEscuro.test.js confere). */

${ATTR} {
  color-scheme: dark;
  --color-bg: #10141b;
  --color-bg-alt: #0b0e13;
  --color-surface: #161b23;
  --color-surface-2: #1c222c;
  --color-text: #e6eaf0;
  --color-text-muted: #9aa4b2;
  --color-border: #2b323e;
  --color-black: #2c3442;
  --color-black-soft: #343d4d;
  --color-primary-light: color-mix(in srgb, var(--color-primary) 24%, #161b23);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.3);
  --shadow-card-hover: 0 2px 4px rgba(0, 0, 0, 0.4), 0 18px 40px rgba(0, 0, 0, 0.45);
  --admin-surface: #161b23;
  --admin-surface-2: #1c222c;
  --admin-primary-text: color-mix(in srgb, var(--color-primary) 62%, #ffffff);
  --admin-danger-text: color-mix(in srgb, var(--color-danger) 65%, #ffffff);
  --admin-success-text: color-mix(in srgb, var(--color-success) 60%, #ffffff);
}

${ATTR} body {
  background: var(--color-bg-alt);
  color: var(--color-text);
}

/* Página de documento: as variáveis voltam às claras dentro dela */
${ATTR} .tpl-doc {
  color-scheme: light;
  --color-text: #1b1b1b;
  --color-text-muted: #5a6475;
  --color-border: #dde2e9;
  --color-bg-alt: #f3f5f8;
  --admin-surface: #ffffff;
  --admin-surface-2: #f7f8fa;
  --admin-primary-text: var(--color-primary);
}

/* Botões (vêm do index.css de cada loja) */
${ATTR} .btn-outline {
  background: transparent;
  color: var(--color-text);
  border-color: var(--color-border);
}

${ATTR} .btn-outline:hover {
  background: var(--admin-surface-2);
}

${ATTR} input::placeholder,
${ATTR} textarea::placeholder {
  color: #6f7a8a;
}
`

// -- Cores ----------------------------------------------------------------------------

function clamp01(n) {
  return Math.min(1, Math.max(0, n))
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function parseHex(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  const n = (i) => parseInt(h.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round2(n(6) / 255) : 1 }
}

function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function rgbToHsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h, s, l) {
  s = clamp01(s)
  l = clamp01(l)
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

function rgba(r, g, b, a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// Cor clara do tema claro → cor do tema escuro, conforme o uso (null = igual)
export function darkColor(c, kind) {
  const { r, g, b, a } = c
  const ink = r < 50 && g < 50 && b < 64
  const white = r > 244 && g > 244 && b > 244
  const y = luminance(c)
  const [h, s] = rgbToHsl(c)
  // Croma: cinza claro (quase branco) x tom claro de uma cor (verde, amarelo...)
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
  if (kind === 'shadow') {
    return ink || y < 0.1 ? rgba(0, 0, 0, Math.min(0.7, round2(a * 2.5))) : null
  }
  if (a < 0.35) {
    if (ink) return rgba(255, 255, 255, Math.min(0.14, round2(a + 0.02)))
    if (white) return null
    return rgba(r, g, b, Math.min(0.45, round2(a * 1.6)))
  }
  if (kind === 'text') {
    if (white || y > 0.55) return null
    return s < 0.15 ? hslToHex(h, s, 0.8) : hslToHex(h, Math.min(s, 0.8), 0.72)
  }
  if (kind === 'bg') {
    if (white) return a >= 0.99 ? 'var(--admin-surface)' : rgba(22, 27, 35, a)
    if (y > 0.55) return chroma < 0.05 ? 'var(--admin-surface-2)' : hslToHex(h, Math.min(s, 0.7) * 0.6, 0.18)
    return null
  }
  if (kind === 'border') {
    if (y > 0.45) return chroma < 0.05 ? 'var(--color-border)' : hslToHex(h, Math.min(s, 0.7) * 0.6, 0.32)
    return null
  }
  return null
}

const TEXT_PROPS = new Set(['color', 'fill', 'stroke', 'caret-color', '-webkit-text-fill-color', 'text-decoration-color', 'accent-color'])
const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow'])

// Bordas com cor (border-radius, border-width e border-style não têm cor)
const BORDER_PROP = /^(border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|column-rule(-color)?|scrollbar-color)$/

function kindOf(prop) {
  if (TEXT_PROPS.has(prop)) return 'text'
  if (SHADOW_PROPS.has(prop)) return 'shadow'
  if (prop === 'background' || prop === 'background-color' || prop === 'background-image') return 'bg'
  if (BORDER_PROP.test(prop)) return 'border'
  return null
}

// Texto com variável de cor da loja: troca pela versão do escuro. A tinta escura
// (--color-ink, --color-black...) não muda no escuro e sumiria no fundo escuro.
export const TEXT_VARS = {
  '--color-ink': '--color-text',
  '--color-ink-2': '--color-text',
  '--color-black': '--color-text',
  '--color-black-soft': '--color-text',
  '--color-primary': '--admin-primary-text',
  '--color-primary-dark': '--admin-primary-text',
  '--color-accent': '--admin-primary-text',
  '--color-accent-dark': '--admin-primary-text',
  '--color-danger': '--admin-danger-text',
  '--color-success': '--admin-success-text',
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g

function parseColor(text) {
  if (text.startsWith('#')) return parseHex(text)
  const [r, g, b, a = '1'] = text.replace(/rgba?\(|\)/g, '').split(',').map((x) => x.trim())
  return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) }
}

// Marcador (caractere de uso privado) para guardar var(...) e url(...) durante a troca
const MARK = String.fromCharCode(0xe000)
const MARK_RE = new RegExp(`${MARK}([0-9]+)${MARK}`, 'g')

// Troca as cores de um valor; var(--x, fallback) e url(...) ficam de fora
export function darkValue(prop, value) {
  const kind = kindOf(prop)
  if (!kind) return value
  const masked = []
  let out = value
    .replace(/var\(\s*--color-white\s*,[^)]*\)/g, kind === 'bg' ? 'var(--admin-surface)' : '$&')
    .replace(/url\((?:[^()"']|"[^"]*"|'[^']*')*\)/g, (m) => {
      // Ícones em SVG embutido: o traço cinza fica claro
      const lit = m.replace(/%23([0-9a-fA-F]{6})/g, (all, hex) => {
        const next = darkColor(parseHex(hex), 'text')
        return next ? `%23${next.slice(1)}` : all
      })
      masked.push(lit)
      return `${MARK}${masked.length - 1}${MARK}`
    })
    .replace(/var\((--[\w-]+)((?:,[^()]*(?:\([^()]*\))?[^()]*)?)\)/g, (m, name, rest) => {
      const swapped = kind === 'text' && TEXT_VARS[name] ? `var(${TEXT_VARS[name]}${rest})` : m
      masked.push(swapped)
      return `${MARK}${masked.length - 1}${MARK}`
    })
  out = out.replace(COLOR_RE, (m) => darkColor(parseColor(m), kind) || m)
  return out.replace(MARK_RE, (m, i) => masked[Number(i)])
}

// -- CSS ------------------------------------------------------------------------------

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@(import|charset)[^;]*;/g, '')
}

function matchBrace(css, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < css.length; i++) {
    const ch = css[i]
    if (quote) {
      if (ch === quote && css[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i
  }
  return css.length
}

function splitTop(text, sep) {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

function parseBlocks(css) {
  const out = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) break
    const prelude = css.slice(i, open).trim()
    const close = matchBrace(css, open)
    const inner = css.slice(open + 1, close)
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|container|layer)\b/.test(prelude)) out.push({ prelude, children: parseBlocks(inner) })
    } else {
      const decls = splitTop(inner, ';').map((d) => {
        const colon = d.indexOf(':')
        return colon === -1 ? null : [d.slice(0, colon).trim().toLowerCase(), d.slice(colon + 1).trim()]
      }).filter(Boolean)
      out.push({ selector: prelude, decls })
    }
    i = close + 1
  }
  return out
}

function prefixSelector(selector) {
  return splitTop(selector, ',')
    .map((s) => {
      if (s.startsWith(':root')) return `${ATTR}${s.slice(5)}`
      if (/^html\b/.test(s)) return `${ATTR}${s.slice(4)}`
      return `${ATTR} ${s}`
    })
    .join(',\n')
}

function renderBlocks(blocks, indent = '') {
  const parts = []
  for (const block of blocks) {
    if (block.children) {
      const inner = renderBlocks(block.children, `${indent}  `)
      if (inner) parts.push(`${indent}${block.prelude} {\n${inner}\n${indent}}`)
      continue
    }
    const keep = KEEP_LIGHT.test(block.selector)
    const decls = block.decls
      .filter(([prop]) => kindOf(prop))
      .map(([prop, value]) => `${indent}  ${prop}: ${keep ? value : darkValue(prop, value)};`)
    if (!decls.length) continue
    const selector = prefixSelector(block.selector).split('\n').map((l) => indent + l).join('\n')
    parts.push(`${selector} {\n${decls.join('\n')}\n${indent}}`)
  }
  return parts.join('\n\n')
}

// sources: [{ name, css }]
export function buildDarkCss(sources) {
  const body = sources
    .map(({ name, css }) => `/* ${name} */\n\n${renderBlocks(parseBlocks(stripComments(css)))}`)
    .join('\n\n')
  return `${HEADER}\n${body}\n`
}

export function readSources(root) {
  return DARK_SOURCES.map((name) => ({ name, css: fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n') }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const css = buildDarkCss(readSources(root))
  fs.writeFileSync(path.join(root, DARK_OUTPUT), css)
  console.log(`${DARK_OUTPUT} gerado (${css.length} caracteres)`)
}
