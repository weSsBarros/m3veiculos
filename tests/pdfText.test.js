import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pdfSafeText } from '../src/utils/pdfText.js'

test('texto do PDF: troca o que a fonte não tem e mantém acentos e símbolos do Windows-1252', () => {
  assert.equal(pdfSafeText('Configurações → Dados fiscais'), 'Configurações > Dados fiscais')
  assert.equal(pdfSafeText('§ 2º — “aceite” · R$ 1.000,00 – 10%'), '§ 2º — “aceite” · R$ 1.000,00 – 10%')
  assert.equal(pdfSafeText('ÁÉÍÓÚ ãõ ç ü\nlinha 2'), 'ÁÉÍÓÚ ãõ ç ü\nlinha 2')
  assert.equal(pdfSafeText('ok ✓ 🚗'), 'ok v ')
  assert.equal(pdfSafeText(null), '')
})
