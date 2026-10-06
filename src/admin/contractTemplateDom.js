// Editor de modelo de contrato: converte os trechos de um parágrafo
// (docxTemplateModel.js) em HTML editável e o HTML de volta em trechos.
// Cada trecho de texto fica num <span data-s> com o estilo de letra do Word;
// marcadores e imagens são "chips" que não se editam por dentro.
import { tagLabel, isKnownTag } from '../utils/docxTemplateModel.js'

const ZWSP = '​'

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

export function flagsCss({ b, i, u }) {
  return `font-weight:${b ? 700 : 400};font-style:${i ? 'italic' : 'normal'};text-decoration:${u ? 'underline' : 'none'}`
}

export function chipClass(tag) {
  return `tpl-chip tpl-chip-${tag.kind}${isKnownTag(tag.name) ? '' : ' is-unknown'}`
}

export function chipHtml(tag) {
  const data = escapeHtml(JSON.stringify(tag))
  return `<span class="${chipClass(tag)}" contenteditable="false" data-kind="tag" data-tag="${data}">${escapeHtml(tagLabel(tag))}</span>`
}

export function segmentsToHtml(segments) {
  return segments
    .map((seg) => {
      if (seg.type === 'object') {
        return `<span contenteditable="false" class="tpl-obj" data-kind="obj" data-obj="${seg.obj.p}:${seg.obj.n}" data-label="${escapeHtml(seg.label)}">${escapeHtml(seg.label)}</span>`
      }
      const open = `<span data-s="${seg.s}" style="${flagsCss(seg)}">`
      if (seg.type === 'tag') return `${open}${chipHtml(seg.tag)}</span>`
      const inner = seg.text
        .split(/(\t|\n)/)
        .map((part) => (part === '\n' ? '<br>' : part === '\t' ? '<span contenteditable="false" class="tpl-tab" data-kind="tab"></span>' : escapeHtml(part)))
        .join('')
      return `${open}${inner}</span>`
    })
    .join('')
    // Quebra de linha no fim só aparece com um <br> a mais (o editor tira um ao ler)
    .concat(segments.at(-1)?.type === 'text' && segments.at(-1).text.endsWith('\n') ? '<br>' : '')
}

function derive(ctx, el) {
  const next = { ...ctx }
  const s = el.getAttribute('data-s')
  if (s != null && s !== '') next.s = Number(s)
  const tag = el.tagName
  if (tag === 'B' || tag === 'STRONG') next.b = true
  if (tag === 'I' || tag === 'EM') next.i = true
  if (tag === 'U') next.u = true
  const st = el.style
  if (st) {
    if (st.fontWeight) next.b = st.fontWeight === 'bold' || st.fontWeight === 'bolder' || Number(st.fontWeight) >= 600
    if (st.fontStyle) next.i = st.fontStyle === 'italic' || st.fontStyle === 'oblique'
    const deco = st.textDecorationLine || st.textDecoration
    if (deco) next.u = deco.includes('underline')
  }
  return next
}

// HTML editado → trechos. base: estilo do parágrafo para texto digitado fora dos spans.
export function domToSegments(root, base) {
  const out = []
  const push = (seg) => {
    if (seg.type === 'text') {
      seg.text = seg.text.replaceAll(ZWSP, '')
      if (!seg.text) return
      const prev = out[out.length - 1]
      if (prev && prev.type === 'text' && prev.s === seg.s && prev.b === seg.b && prev.i === seg.i && prev.u === seg.u) {
        prev.text += seg.text
        return
      }
    }
    out.push(seg)
  }
  const flags = (ctx) => ({ s: ctx.s, b: Boolean(ctx.b), i: Boolean(ctx.i), u: Boolean(ctx.u) })
  const walk = (node, ctx) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        push({ type: 'text', text: n.nodeValue, ...flags(ctx) })
        continue
      }
      if (n.nodeType !== 1) continue
      const kind = n.getAttribute('data-kind')
      if (kind === 'tag') {
        push({ type: 'tag', tag: JSON.parse(n.getAttribute('data-tag')), ...flags(ctx) })
        continue
      }
      if (kind === 'obj') {
        const [p, k] = n.getAttribute('data-obj').split(':').map(Number)
        push({ type: 'object', obj: { p, n: k }, label: n.getAttribute('data-label') || 'objeto' })
        continue
      }
      if (kind === 'tab') {
        push({ type: 'text', text: '\t', ...flags(ctx) })
        continue
      }
      if (n.tagName === 'BR') {
        push({ type: 'text', text: '\n', ...flags(ctx) })
        continue
      }
      // Bloco criado pelo navegador (div/p) = quebra de linha antes
      if ((n.tagName === 'DIV' || n.tagName === 'P') && out.length) push({ type: 'text', text: '\n', ...flags(ctx) })
      walk(n, derive(ctx, n))
    }
  }
  walk(root, { s: base?.s ?? -1, b: base?.b || false, i: base?.i || false, u: base?.u || false })
  // O navegador deixa um <br> sobrando no fim de um parágrafo editável
  const last = out[out.length - 1]
  if (last && last.type === 'text' && last.text.endsWith('\n')) {
    last.text = last.text.slice(0, -1)
    if (!last.text) out.pop()
  }
  return out
}

// Coloca um nó onde está o cursor (ou no fim do parágrafo) e o cursor depois dele
export function insertAtCaret(root, node, savedRange) {
  const sel = window.getSelection()
  // Cursor de agora; se o foco saiu do parágrafo, o último cursor guardado
  let range = sel.rangeCount && root.contains(sel.getRangeAt(0).startContainer) ? sel.getRangeAt(0) : null
  if (!range && savedRange && root.contains(savedRange.startContainer)) range = savedRange
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
  }
  range.deleteContents()
  const after = document.createTextNode(ZWSP)
  range.insertNode(after)
  range.insertNode(node)
  const caret = document.createRange()
  caret.setStart(after, 1)
  caret.collapse(true)
  sel.removeAllRanges()
  sel.addRange(caret)
  return caret
}

// Enter: corta o parágrafo no cursor e devolve o que ficou depois (num div solto)
export function splitAtCaret(root) {
  const sel = window.getSelection()
  if (!sel.rangeCount || !root.contains(sel.getRangeAt(0).startContainer)) return null
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const tail = document.createRange()
  tail.setStart(range.startContainer, range.startOffset)
  tail.setEnd(root, root.childNodes.length)
  const holder = document.createElement('div')
  holder.appendChild(tail.extractContents())
  return holder
}

export function isEmptyEditor(root) {
  return !root.textContent.replaceAll(ZWSP, '') && !root.querySelector('[data-kind]')
}

// Cursor no ponto clicado (ao abrir um parágrafo para editar), no começo ou no fim
export function placeCaret(root, point, atStart = false) {
  const sel = window.getSelection()
  let range = null
  if (point && document.caretRangeFromPoint) range = document.caretRangeFromPoint(point.x, point.y)
  else if (point && document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(point.x, point.y)
    if (pos) {
      range = document.createRange()
      range.setStart(pos.offsetNode, pos.offset)
    }
  }
  if (!range || !root.contains(range.startContainer)) {
    range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(atStart)
  } else range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}
