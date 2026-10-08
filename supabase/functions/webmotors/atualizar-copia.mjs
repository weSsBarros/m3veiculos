// Copia src/utils/webmotorsAd.js para dentro do index.ts da função, entre os
// marcadores // <webmotorsAd.js> e // </webmotorsAd.js> (a função é publicada
// pelo painel do Supabase, num arquivo só). Rodar depois de mudar o webmotorsAd.js:
//   node supabase/functions/webmotors/atualizar-copia.mjs
import fs from 'node:fs'

const fnPath = new URL('./index.ts', import.meta.url)
const src = fs.readFileSync(new URL('../../../src/utils/webmotorsAd.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const fn = fs.readFileSync(fnPath, 'utf8').replace(/\r\n/g, '\n')
const open = '// <webmotorsAd.js>\n'
const close = '// </webmotorsAd.js>'
const start = fn.indexOf(open)
const end = fn.indexOf(close)
if (start < 0 || end < start) throw new Error('Marcadores // <webmotorsAd.js> e // </webmotorsAd.js> não encontrados no index.ts')
fs.writeFileSync(fnPath, fn.slice(0, start + open.length) + src + fn.slice(end))
console.log('Cópia do webmotorsAd.js atualizada no index.ts')
