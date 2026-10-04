export function maskCPF(raw) {
  const digits = String(raw).replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function maskPhoneBR(raw) {
  const digits = String(raw).replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

// Data digitada como texto: DD/MM/AAAA
export function maskBirthDate(raw) {
  const digits = String(raw).replace(/\D/g, '').slice(0, 8)
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  let result = day
  if (month) result += '/' + month
  if (year) result += '/' + year
  return result
}

// Valor sem centavos com milhar automático: "119900" → "119.900". O que vier
// depois da vírgula é descartado (preço, gastos e km não têm centavos).
export function maskIntBR(raw, maxDigits = 9) {
  const intPart = String(raw ?? '').split(',')[0]
  const digits = intPart.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, maxDigits)
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// O que aparece enquanto digita: milhar automático e, se a pessoa digitar a
// vírgula, até 2 casas de centavos ("1250,9" → "1.250,9"). O ponto digitado é
// sempre ignorado: quem digita "80.000" à mão continua com 80 mil.
export function maskMoneyBR(raw, maxDigits = 9) {
  const str = String(raw ?? '')
  const comma = str.indexOf(',')
  const intText = maskIntBR(comma === -1 ? str : str.slice(0, comma), maxDigits)
  if (comma === -1) return intText
  const cents = str.slice(comma + 1).replace(/\D/g, '').slice(0, 2)
  return `${intText || '0'},${cents}`
}

// Valor vindo do banco ou do estado (número ou "1234.5") no formato dos campos:
// 1234.5 → "1.234,5". O que já está no formato brasileiro passa como está.
// Nos campos sem centavos a vírgula digitada continua aparecendo até sair do
// campo (senão "119.900,50" viraria "11.990.050").
export function toMaskedBR(value, cents) {
  if (value === null || value === undefined || value === '') return ''
  let str = typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : String(value)
  // "1234.5" (ponto decimal do JavaScript) nunca sai das máscaras, que só usam
  // ponto para separar milhar de 3 em 3
  if (/^\d+\.\d{1,2}$/.test(str)) str = cents ? str.replace('.', ',') : str.split('.')[0]
  return maskMoneyBR(str)
}

// Para o onChange de campos com máscara (CPF, telefone): aplica a máscara e
// devolve o cursor para o mesmo dígito, em vez de jogá-lo para o fim. Apagar
// em cima de um separador apaga o dígito antes dele (senão o separador volta e
// nada acontece). Uso: onChange={(e) => update('phone', maskKeepingCaret(e, maskPhoneBR))}
export function maskKeepingCaret(e, mask) {
  const input = e.target
  const raw = input.value
  const caret = input.selectionStart ?? raw.length
  const digits = (s) => s.replace(/\D/g, '')
  let source = raw
  let count = digits(raw.slice(0, caret)).length
  if (e.nativeEvent?.inputType === 'deleteContentBackward' && count > 0 && mask(raw).length > raw.length) {
    const all = digits(raw)
    source = all.slice(0, count - 1) + all.slice(count)
    count -= 1
  }
  const next = mask(source)
  if (caret < raw.length || source !== raw) {
    let pos = 0
    for (let seen = 0; pos < next.length && seen < count; pos++) if (/\d/.test(next[pos])) seen++
    // depois que o React gravar o valor novo (setTimeout também roda com a aba em segundo plano)
    setTimeout(() => {
      if (document.activeElement === input) input.setSelectionRange(pos, pos)
    }, 0)
  }
  return next
}
