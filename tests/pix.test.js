import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc16, pixPayload, pixText, pixTxid } from '../src/utils/pix.js'

test('pix: o exemplo de BR Code estático do manual do Banco Central', () => {
  const code = pixPayload({ key: '123e4567-e12b-12d1-a456-426655440000', name: 'Fulano de Tal', city: 'BRASILIA' })
  assert.equal(
    code,
    '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D'
  )
})

test('pix: valor, txid, CRC e textos sem acento', () => {
  const code = pixPayload({ key: 'chave@exemplo.com', name: 'João da Conceição', city: 'São Luís', amount: 150, txid: 'WBLOJA202610' })
  assert.match(code, /5406150\.00/)
  assert.match(code, /5917Joao da Conceicao/)
  assert.match(code, /6008Sao Luis/)
  assert.match(code, /62160512WBLOJA202610/)
  // O CRC fecha o código e confere com o resto
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)))
  assert.equal(pixText('Nome muito comprido para o campo do PIX', 25).length, 25)
  assert.equal(pixTxid('lap-seminovos', '2026-10'), 'WBLAPSEMINOVOS202610')
  assert.equal(pixTxid('', ''), 'WB')
})

test('pix: sem chave, nome ou cidade não monta o código; valor zero fica de fora', () => {
  assert.equal(pixPayload({ key: '', name: 'X', city: 'Y' }), '')
  assert.equal(pixPayload({ key: 'k', name: '', city: 'Y' }), '')
  assert.doesNotMatch(pixPayload({ key: 'k', name: 'X', city: 'Y', amount: 0 }), /54\d\d/)
  // txid inválido vira ***
  assert.match(pixPayload({ key: 'k', name: 'X', city: 'Y', txid: 'com espaço' }), /0503\*\*\*/)
})

test('pix: a cópia dentro da Edge Function wbdev-email é idêntica a src/utils/pix.js', async () => {
  const fs = await import('node:fs')
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const fn = read('../supabase/functions/wbdev-email/index.ts')
  const start = fn.indexOf('// <pix.js>\n')
  const end = fn.indexOf('// </pix.js>')
  assert.ok(start > -1 && end > start, 'marcadores // <pix.js> e // </pix.js> na função')
  assert.equal(fn.slice(start + '// <pix.js>\n'.length, end), read('../src/utils/pix.js').replace(/\n*$/, '\n'))
})
