import { useEffect, useLayoutEffect, useRef } from 'react'
import { editSlots, slotsToText, textToSlots } from '../utils/slotMask.js'

const INSERT = new Set(['insertText', 'insertReplacementText'])
const BACKWARD = new Set(['deleteContentBackward', 'deleteWordBackward', 'deleteSoftLineBackward', 'deleteHardLineBackward', 'deleteByCut'])
const FORWARD = new Set(['deleteContentForward', 'deleteWordForward', 'deleteSoftLineForward', 'deleteHardLineForward'])

// Liga um <input> às casas de utils/slotMask.js: a edição é feita no
// beforeinput (antes de o navegador mexer no texto), então o cursor fica onde
// a pessoa está editando. Colar e preencher automático caem no onChange, que lê
// os dígitos em sequência. onSlots(novas) recebe cada mudança.
export default function useSlotInput(groups, slots, onSlots) {
  const ref = useRef(null)
  const latest = useRef({ slots, onSlots })
  const pendingCaret = useRef(null)
  const groupsKey = groups.join(',')

  useLayoutEffect(() => {
    latest.current = { slots, onSlots }
  })

  useEffect(() => {
    const input = ref.current
    if (!input) return undefined
    const sizes = groupsKey.split(',').map(Number)
    function handleBeforeInput(e) {
      const type = INSERT.has(e.inputType) ? 'insert' : BACKWARD.has(e.inputType) ? 'backward' : FORWARD.has(e.inputType) ? 'forward' : null
      if (!type || (type === 'insert' && e.data == null)) return
      e.preventDefault()
      if (type === 'insert' && !/\d/.test(e.data)) return
      const { slots: current, onSlots: emit } = latest.current
      const result = editSlots(current, sizes, {
        start: input.selectionStart ?? input.value.length,
        end: input.selectionEnd ?? input.value.length,
        type,
        data: e.data || '',
      })
      if (slotsToText(result.slots, sizes) === input.value) {
        // nada muda no texto (ex.: apagar uma casa já vazia): só anda o cursor
        input.setSelectionRange(result.caret, result.caret)
        return
      }
      pendingCaret.current = result.caret
      emit(result.slots)
    }
    input.addEventListener('beforeinput', handleBeforeInput)
    return () => input.removeEventListener('beforeinput', handleBeforeInput)
  }, [groupsKey])

  const text = slotsToText(slots, groups)

  useLayoutEffect(() => {
    const input = ref.current
    if (pendingCaret.current === null || !input || document.activeElement !== input) return
    const at = Math.min(pendingCaret.current, input.value.length)
    pendingCaret.current = null
    input.setSelectionRange(at, at)
  }, [text])

  function onChange(e) {
    onSlots(textToSlots(e.target.value, groups))
  }

  return { ref, value: text, onChange }
}
