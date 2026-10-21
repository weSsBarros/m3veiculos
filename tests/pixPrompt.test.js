import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armPixPrompt, readPixPrompt, clearPixPrompt, cameBack, askOnOpen, PIX_PROMPT_TTL_MS, PIX_AWAY_MIN_MS } from '../src/utils/pixPrompt.js'

function memory() {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    size: () => data.size,
  }
}

test('PIX copiado: guarda e lê de volta por tipo', () => {
  const s = memory()
  armPixPrompt(s, { kind: 'creditos', amount: 20 }, 1000)
  armPixPrompt(s, { kind: 'mensalidade', amount: 300, months: ['2026-10-01', '2026-11-01'] }, 2000)
  assert.deepEqual(readPixPrompt(s, 'creditos', 5000), { kind: 'creditos', amount: 20, months: [], at: 1000 })
  assert.deepEqual(readPixPrompt(s, 'mensalidade', 5000).months, ['2026-10-01', '2026-11-01'])
  clearPixPrompt(s, 'creditos')
  assert.equal(readPixPrompt(s, 'creditos', 5000), null)
  assert.notEqual(readPixPrompt(s, 'mensalidade', 5000), null)
})

test('PIX copiado: some depois de 2 horas e não guarda valor vazio', () => {
  const s = memory()
  armPixPrompt(s, { kind: 'creditos', amount: 40 }, 0)
  assert.notEqual(readPixPrompt(s, 'creditos', PIX_PROMPT_TTL_MS - 1), null)
  assert.equal(readPixPrompt(s, 'creditos', PIX_PROMPT_TTL_MS), null)
  assert.equal(s.size(), 0)
  assert.equal(armPixPrompt(s, { kind: 'creditos', amount: 0 }, 0), null)
  assert.equal(armPixPrompt(s, { kind: '', amount: 20 }, 0), null)
  assert.equal(s.size(), 0)
})

test('PIX copiado: texto estragado ou de outro tipo é ignorado e apagado', () => {
  const s = memory()
  s.setItem('pix_pergunta:creditos', '{nada')
  assert.equal(readPixPrompt(s, 'creditos', 10), null)
  s.setItem('pix_pergunta:creditos', JSON.stringify({ kind: 'mensalidade', amount: 20, at: 1 }))
  assert.equal(readPixPrompt(s, 'creditos', 10), null)
  // Relógio voltou (data no futuro)
  s.setItem('pix_pergunta:creditos', JSON.stringify({ kind: 'creditos', amount: 20, at: 50 }))
  assert.equal(readPixPrompt(s, 'creditos', 10), null)
  assert.equal(s.size(), 0)
})

test('PIX copiado: navegador sem armazenamento não quebra', () => {
  const broken = {
    getItem: () => {
      throw new Error('bloqueado')
    },
    setItem: () => {
      throw new Error('bloqueado')
    },
    removeItem: () => {
      throw new Error('bloqueado')
    },
  }
  assert.equal(armPixPrompt(broken, { kind: 'creditos', amount: 20 }, 1).amount, 20)
  assert.equal(readPixPrompt(broken, 'creditos', 2), null)
  assert.doesNotThrow(() => clearPixPrompt(broken, 'creditos'))
  assert.equal(readPixPrompt(null, 'creditos', 2), null)
})

test('volta do banco: só conta saída de pelo menos 2 segundos', () => {
  assert.equal(cameBack(null, 10_000), false)
  assert.equal(cameBack(10_000, 10_000 + PIX_AWAY_MIN_MS - 1), false)
  assert.equal(cameBack(10_000, 10_000 + PIX_AWAY_MIN_MS), true)
})

test('página aberta de novo depois de copiar: pergunta ao abrir; copiado na mesma página, não', () => {
  assert.equal(askOnOpen({ at: 1000 }, 5000), true)
  assert.equal(askOnOpen({ at: 6000 }, 5000), false)
  assert.equal(askOnOpen(null, 5000), false)
})
