// A fonte padrão dos PDFs (Helvetica do jsPDF) só tem os caracteres do
// Windows-1252. Um caractere fora dele (uma seta, por exemplo) faz a linha sair
// espaçada e cortada: aqui ele vira um equivalente, ou sai do texto.

const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const SWAP = { '→': '>', '⇒': '>', '➔': '>', '←': '<', '≥': '>=', '≤': '<=', '✓': 'v', '✔': 'v', '−': '-', '\t': '  ' }

export function pdfSafeText(text) {
  let out = ''
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0)
    if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch
    else if (SWAP[ch]) out += SWAP[ch]
  }
  return out
}
