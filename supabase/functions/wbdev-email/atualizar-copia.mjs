// Copia src/utils/pix.js para dentro do index.ts da função (entre os marcadores
// // <pix.js> e // </pix.js>). O teste tests/pix.test.js confere que é igual.
// Uso: node supabase/functions/wbdev-email/atualizar-copia.mjs
import fs from 'node:fs'

const src = new URL('../../../src/utils/pix.js', import.meta.url)
const fn = new URL('./index.ts', import.meta.url)
const code = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n')
const text = fs.readFileSync(fn, 'utf8').replace(/\r\n/g, '\n')
const start = text.indexOf('// <pix.js>\n')
const end = text.indexOf('// </pix.js>')
if (start === -1 || end === -1) throw new Error('Marcadores // <pix.js> e // </pix.js> não encontrados no index.ts')
const next = text.slice(0, start + '// <pix.js>\n'.length) + code.replace(/\n*$/, '\n') + text.slice(end)
fs.writeFileSync(fn, next)
console.log('Cópia do pix.js atualizada no index.ts')
