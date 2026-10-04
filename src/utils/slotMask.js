// Campos de data e mês digitados por posição (dd/mm/aaaa, mm/aaaa): cada dígito
// ocupa a sua casa. Digitar substitui o dígito da casa onde está o cursor (sem
// empurrar os outros) e apagar só esvazia a casa, então dá para trocar só o dia
// de uma data sem desmontar o mês e o ano. Usado por components/useSlotInput.js;
// testado em tests/slotMask.test.js.

// groups: tamanho de cada bloco (data = [2, 2, 4]); devolve a posição no texto de cada casa
export function slotPositions(groups) {
  const pos = []
  let at = 0
  groups.forEach((size, g) => {
    for (let i = 0; i < size; i++) pos.push(at++)
    if (g < groups.length - 1) at++ // a barra
  })
  return pos
}

export const emptySlots = (groups) => Array(groups.reduce((a, b) => a + b, 0)).fill('')

// Casas vazias aparecem como "_" no meio; as do fim somem (digitando do zero
// aparece "04/1" e não "04/1_/____")
export function slotsToText(slots, groups) {
  const last = slots.reduce((acc, s, i) => (s ? i : acc), -1)
  if (last < 0) return ''
  const pos = slotPositions(groups)
  let text = ''
  let i = 0
  groups.forEach((size, g) => {
    for (let k = 0; k < size; k++) text += slots[i++] || '_'
    if (g < groups.length - 1) text += '/'
  })
  return text.slice(0, pos[last] + 1)
}

// Texto colado ou preenchido pelo navegador: os dígitos em sequência
export function textToSlots(text, groups) {
  const digits = String(text || '').replace(/\D/g, '')
  return emptySlots(groups).map((_, i) => digits[i] || '')
}

// Uma edição no campo: type 'insert' (data = o que foi digitado), 'backward'
// (Backspace) ou 'forward' (Delete), com a seleção [start, end). Devolve as
// casas novas e onde o cursor fica.
export function editSlots(slots, groups, { start, end = start, type, data = '' }) {
  const pos = slotPositions(groups)
  const next = [...slots]
  const selected = end > start
  if (selected) pos.forEach((p, i) => { if (p >= start && p < end) next[i] = '' })
  let caret = start

  if (type === 'insert') {
    let i = pos.findIndex((p) => p >= start)
    for (const ch of String(data).replace(/\D/g, '')) {
      if (i < 0 || i >= next.length) break
      next[i] = ch
      i += 1
    }
    if (i < 0) caret = start
    else caret = i < next.length ? pos[i] : pos[next.length - 1] + 1
  } else if (type === 'backward' && !selected) {
    let i = -1
    pos.forEach((p, k) => { if (p < start) i = k })
    if (i >= 0) {
      next[i] = ''
      caret = pos[i]
    }
  } else if (type === 'forward' && !selected) {
    const i = pos.findIndex((p) => p >= start)
    if (i >= 0) {
      next[i] = ''
      caret = pos[i]
    }
  }
  return { slots: next, caret }
}
