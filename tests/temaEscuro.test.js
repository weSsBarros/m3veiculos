import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildDarkCss, readSources, darkValue, DARK_OUTPUT } from '../scripts/tema-escuro.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('tema escuro: o admin-dark.css está em dia com o admin.css (rode node scripts/tema-escuro.mjs)', () => {
  const expected = buildDarkCss(readSources(ROOT))
  const current = fs.readFileSync(new URL(`../${DARK_OUTPUT}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(current, expected)
})

test('tema escuro: troca das cores claras', () => {
  // Fundo branco vira a superfície escura; texto branco (botões) continua
  assert.equal(darkValue('background', '#fff'), 'var(--admin-surface)')
  assert.equal(darkValue('background-color', '#ffffff'), 'var(--admin-surface)')
  assert.equal(darkValue('color', '#fff'), '#fff')
  // Texto com a cor da loja fica numa versão clara; fundo com a cor da loja continua
  assert.equal(darkValue('color', 'var(--color-primary)'), 'var(--admin-primary-text)')
  assert.equal(darkValue('background', 'var(--color-primary)'), 'var(--color-primary)')
  assert.equal(darkValue('color', 'var(--color-danger)'), 'var(--admin-danger-text)')
  // Sombras e tons da tinta escura
  assert.equal(darkValue('box-shadow', '0 4px 12px rgba(10, 14, 23, 0.12)'), '0 4px 12px rgba(0, 0, 0, 0.3)')
  assert.equal(darkValue('background', 'rgba(10, 14, 23, 0.08)'), 'rgba(255, 255, 255, 0.1)')
  // Tons claros de cor viram tons escuros da mesma cor; cinza claro vira a superfície 2
  assert.match(darkValue('background', '#e3f5ea'), /^#[0-9a-f]{6}$/)
  assert.equal(darkValue('background', '#eef1f5'), 'var(--admin-surface-2)')
  // Texto escuro fica claro; cores fortes (laranja) continuam
  assert.notEqual(darkValue('color', '#13743f'), '#13743f')
  assert.equal(darkValue('background', '#f5a623'), '#f5a623')
  // Fallback de variável e ícone SVG embutido
  assert.equal(darkValue('background', 'var(--color-white, #fff)'), 'var(--admin-surface)')
  assert.equal(darkValue('background', 'var(--color-bg-alt, #f7f8fa)'), 'var(--color-bg-alt, #f7f8fa)')
  assert.doesNotMatch(darkValue('background-image', 'url("data:image/svg+xml;utf8,<svg stroke=\'%23666666\'/>")'), /%23666666/)
  // O que não é cor fica como está
  assert.equal(darkValue('border-radius', '8px'), '8px')
})

test('tema escuro: texto só usa variáveis que o escuro redefine (a tinta escura sumiria no fundo escuro)', () => {
  const css = buildDarkCss(readSources(ROOT))
  const root = css.match(/html\[data-admin-theme='escuro'\] \{([\s\S]*?)\n\}/)[1]
  const defined = new Set([...root.matchAll(/(--[\w-]+):/g)].map((m) => m[1]))
  const loose = new Set()
  for (const m of css.matchAll(/\n\s*(?:color|fill|stroke|caret-color|-webkit-text-fill-color|text-decoration-color|accent-color): ([^;]+);/g)) {
    for (const v of m[1].matchAll(/var\((--[\w-]+)/g)) if (!defined.has(v[1])) loose.add(v[1])
  }
  assert.deepEqual([...loose], [])
  // Os números da Plataforma (cartões) usam a tinta da loja: no escuro, o texto claro
  assert.equal(darkValue('color', 'var(--color-ink)'), 'var(--color-text)')
  assert.equal(darkValue('background', 'var(--color-black)'), 'var(--color-black)')
})

test('tema escuro: a página de documento (editor de contrato) continua branca', () => {
  const css = buildDarkCss([{ name: 'teste', css: '.tpl-doc { background: #fff; color: #1b1b1b; } .card { background: #fff; }' }])
  assert.match(css, /\.tpl-doc \{\n {2}background: #fff;\n {2}color: #1b1b1b;/)
  assert.match(css, /\.card \{\n {2}background: var\(--admin-surface\);/)
})
