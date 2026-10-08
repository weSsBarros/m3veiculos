// Copia src/utils/olxAd.js para dentro do index.ts da função, entre os
// marcadores // <olxAd.js> e // </olxAd.js> (a função é publicada pelo painel
// do Supabase, num arquivo só). Rodar depois de mudar o olxAd.js:
//   node supabase/functions/olx-oauth/atualizar-copia.mjs
import fs from 'node:fs'

const fnPath = new URL('./index.ts', import.meta.url)
const src = fs.readFileSync(new URL('../../../src/utils/olxAd.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const fn = fs.readFileSync(fnPath, 'utf8').replace(/\r\n/g, '\n')
const open = '// <olxAd.js>\n'
const close = '// </olxAd.js>'
const start = fn.indexOf(open)
const end = fn.indexOf(close)
if (start < 0 || end < start) throw new Error('Marcadores // <olxAd.js> e // </olxAd.js> não encontrados no index.ts')
fs.writeFileSync(fnPath, fn.slice(0, start + open.length) + src + fn.slice(end))
console.log('Cópia do olxAd.js atualizada no index.ts')
