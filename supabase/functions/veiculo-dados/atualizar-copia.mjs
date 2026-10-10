// Copia os módulos do painel para dentro do index.ts da função, entre os
// marcadores // <arquivo.js> e // </arquivo.js> (a função é publicada pelo
// painel do Supabase, num arquivo só). As linhas "import ... from './x.js'"
// saem, porque tudo fica no mesmo arquivo. Rodar depois de mudar algum deles:
//   node supabase/functions/veiculo-dados/atualizar-copia.mjs
import fs from 'node:fs'

const MODULES = ['documentosVeiculo.js', 'fipeMatch.js', 'crlvParser.js', 'fipeFontes.js', 'placaProvedor.js']
const fnPath = new URL('./index.ts', import.meta.url)
let fn = fs.readFileSync(fnPath, 'utf8').replace(/\r\n/g, '\n')
for (const name of MODULES) {
  const src = fs.readFileSync(new URL(`../../../src/utils/${name}`, import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/^import [^\n]* from '\.\/[^']+'\n/gm, '')
  const open = `// <${name}>\n`
  const close = `// </${name}>`
  const start = fn.indexOf(open)
  const end = fn.indexOf(close)
  if (start < 0 || end < start) throw new Error(`Marcadores // <${name}> e // </${name}> não encontrados no index.ts`)
  fn = fn.slice(0, start + open.length) + src + fn.slice(end)
}
fs.writeFileSync(fnPath, fn)
console.log('Cópia dos módulos atualizada no index.ts da veiculo-dados')
