// Edição de modelo de contrato (.docx) no painel: lê os parágrafos do
// word/document.xml, separa o texto, os marcadores ({cliente_nome}...) e o que
// não dá para editar aqui (imagens, campos do Word), e monta de volta só os
// parágrafos que mudaram. O resto do arquivo (logo, cabeçalho, tabelas, estilos)
// fica igual. Usado por ContractTemplateEditor.jsx; testado em
// tests/docxTemplateModel.test.js.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { CONTRACT_TEMPLATE_TAGS } from './contractTemplateTags.js'

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const TAG_LABELS = Object.fromEntries(CONTRACT_TEMPLATE_TAGS.map((t) => [t.tag, t.label]))

export function isKnownTag(name) {
  return Object.hasOwn(TAG_LABELS, name)
}

// Grupos da lista "Inserir marcador"
const ENTRY_TAG = /^(proprietario_|tipo_entrada|valor_entrada|data_entrada)/

export const TAG_GROUPS = [
  { label: 'Loja', tags: CONTRACT_TEMPLATE_TAGS.filter((t) => t.tag.startsWith('loja_')) },
  { label: 'Cliente', tags: CONTRACT_TEMPLATE_TAGS.filter((t) => t.tag.startsWith('cliente_')) },
  { label: 'Carro', tags: CONTRACT_TEMPLATE_TAGS.filter((t) => t.tag.startsWith('carro_')) },
  { label: 'Venda', tags: CONTRACT_TEMPLATE_TAGS.filter((t) => !/^(loja|cliente|carro)_/.test(t.tag) && !ENTRY_TAG.test(t.tag)) },
  { label: 'Entrada', tags: CONTRACT_TEMPLATE_TAGS.filter((t) => ENTRY_TAG.test(t.tag)) },
]

// Tamanho da linha em branco de cada campo (o padrão dos modelos já cadastrados)
const BLANK_SIZES = {
  cliente_nome: 40, cliente_endereco: 44, loja_endereco: 44, loja_nome: 40, proprietario_nome: 40, proprietario_endereco: 44,
  proprietario_cpf: 22, proprietario_rg: 18, proprietario_telefone: 18,
  cliente_cpf: 22, cliente_rg: 18, cliente_telefone: 18, loja_telefone: 18, loja_cnpj: 22, loja_cidade: 22,
  carro_placa: 12, carro_chassi: 24, carro_renavam: 18, carro_ano: 14, carro_cor: 16, carro_km: 12,
}

export function blankLine(name) {
  return '_'.repeat(BLANK_SIZES[name] || 24)
}

// Texto que vai no Word para cada marcador
export function tagText(tag) {
  const n = tag.name
  if (tag.kind === 'open') return `{#${n}}`
  if (tag.kind === 'inverse') return `{^${n}}`
  if (tag.kind === 'close') return `{/${n}}`
  if (tag.fallback) return `{${n}}{^${n}}${tag.fallback}{/${n}}`
  return `{${n}}`
}

// Nome do marcador como aparece no editor
export function tagLabel(tag) {
  const base = TAG_LABELS[tag.name] || `${tag.name} (desconhecido)`
  if (tag.kind === 'open') return `Só se tiver: ${base}`
  if (tag.kind === 'inverse') return `Se não tiver: ${base}`
  if (tag.kind === 'close') return `Fim do bloco: ${base}`
  if (tag.fallback) return `${base} ou ${/^_+$/.test(tag.fallback.trim()) ? 'linha' : `“${tag.fallback}”`}`
  return base
}

const TAG_RE = /\{([#^/]?)([^{}]*)\}/g
const TAG_KIND = { '': 'field', '#': 'open', '^': 'inverse', '/': 'close' }

function isW(node, name) {
  return node && node.nodeType === 1 && node.namespaceURI === W_NS && node.localName === name
}

function elements(node) {
  const out = []
  for (let n = node.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n)
  return out
}

function childW(node, name) {
  return elements(node).find((n) => isW(n, name)) || null
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'text/xml')
}

function isOn(el) {
  if (!el) return false
  const val = el.getAttribute('w:val')
  if (isW(el, 'u')) return val !== 'none'
  return !['0', 'false', 'off'].includes(val)
}

function flagsOf(rPr) {
  if (!rPr) return { b: false, i: false, u: false }
  return { b: isOn(childW(rPr, 'b')), i: isOn(childW(rPr, 'i')), u: isOn(childW(rPr, 'u')) }
}

// Parágrafos do corpo na ordem do documento (os das tabelas também). A mesma
// ordem é usada para ler e para gravar, por isso o índice identifica o parágrafo.
function listParagraphs(doc) {
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0]
  const out = []
  const walk = (container, inTable, locked) => {
    for (const child of elements(container)) {
      if (isW(child, 'p')) out.push({ el: child, inTable, locked, tableStart: false })
      else if (isW(child, 'tbl')) {
        const start = out.length
        for (const tr of elements(child).filter((n) => isW(n, 'tr'))) {
          for (const tc of elements(tr).filter((n) => isW(n, 'tc'))) walk(tc, true, locked)
        }
        if (out.length > start) out[start].tableStart = true
      } else if (isW(child, 'sdt')) {
        const content = childW(child, 'sdtContent')
        if (content) walk(content, inTable, true)
      }
    }
  }
  if (body) walk(body, false, false)
  return out
}

const SKIP_IN_PARAGRAPH = new Set(['pPr', 'proofErr', 'bookmarkStart', 'bookmarkEnd', 'permStart', 'permEnd'])
const LOCK_IN_RUN = new Set(['fldChar', 'instrText', 'delText', 'ruby'])
const OBJECT_LABELS = { drawing: 'imagem', pict: 'imagem', AlternateContent: 'imagem', object: 'objeto', sym: 'símbolo' }

// Percorre um parágrafo: texto, objetos (imagem, quebra de página) e o que
// trava a edição (link, campo do Word, revisão).
function scanParagraph(p, handlers) {
  const { onText, onObject, onLock } = handlers
  for (const child of elements(p)) {
    const name = child.localName
    if (SKIP_IN_PARAGRAPH.has(name)) continue
    if (!isW(child, 'r')) {
      // Link, campo ou revisão: o texto aparece, mas o parágrafo fica só para ver
      onLock('link, campo ou revisão do Word')
      scanParagraph(child, handlers)
      continue
    }
    const rPr = childW(child, 'rPr')
    for (const rc of elements(child)) {
      const n = rc.localName
      if (n === 'rPr' || n === 'lastRenderedPageBreak' || n === 'softHyphen') continue
      if (n === 't') onText(rc.textContent, rPr)
      else if (n === 'tab' || n === 'ptab') onText('\t', rPr)
      else if (n === 'noBreakHyphen') onText('-', rPr)
      else if (n === 'br' || n === 'cr') {
        const type = rc.getAttribute('w:type')
        if (type === 'page' || type === 'column') onObject(rc, rPr, 'quebra de página')
        else onText('\n', rPr)
      } else if (LOCK_IN_RUN.has(n)) onLock('campo do Word')
      else onObject(rc, rPr, OBJECT_LABELS[n] || 'objeto')
    }
  }
}

function alignOf(p) {
  const jc = childW(childW(p, 'pPr') || p, 'jc')
  const val = jc ? jc.getAttribute('w:val') : ''
  if (val === 'center') return 'center'
  if (val === 'right' || val === 'end') return 'right'
  if (val === 'both' || val === 'distribute') return 'justify'
  return ''
}

function pushSegment(out, seg) {
  const prev = out[out.length - 1]
  if (seg.type === 'text') {
    if (!seg.text) return
    if (prev && prev.type === 'text' && prev.s === seg.s && prev.b === seg.b && prev.i === seg.i && prev.u === seg.u) {
      prev.text += seg.text
      return
    }
  }
  out.push(seg)
}

// Texto corrido (com o estilo de cada trecho) → texto e marcadores. O padrão
// {x}{^x}____{/x} ("se vazio, linha") vira um marcador só, com fallback.
function tokenizeText(pieces, styles, out) {
  let text = ''
  const marks = []
  for (const pc of pieces) {
    marks.push({ start: text.length, s: pc.s })
    text += pc.text
  }
  const styleAt = (pos) => {
    let s = marks[0].s
    for (const m of marks) {
      if (m.start <= pos) s = m.s
      else break
    }
    return s
  }
  const withFlags = (s) => ({ s, b: styles[s]?.b || false, i: styles[s]?.i || false, u: styles[s]?.u || false })
  const emitText = (from, to) => {
    for (let pos = from; pos < to; ) {
      const s = styleAt(pos)
      let end = pos + 1
      while (end < to && styleAt(end) === s) end += 1
      pushSegment(out, { type: 'text', text: text.slice(pos, end), ...withFlags(s) })
      pos = end
    }
  }
  const matches = [...text.matchAll(TAG_RE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    kind: TAG_KIND[m[1]],
    name: m[2].trim(),
  }))
  let pos = 0
  for (let k = 0; k < matches.length; k++) {
    const [a, b, c] = [matches[k], matches[k + 1], matches[k + 2]]
    let tag
    let end
    if (a.kind === 'field' && b && c && b.kind === 'inverse' && c.kind === 'close' && b.name === a.name && c.name === a.name && b.start === a.end) {
      tag = { kind: 'field', name: a.name, fallback: text.slice(b.end, c.start) || null }
      end = c.end
      k += 2
    } else {
      tag = a.kind === 'field' ? { kind: 'field', name: a.name, fallback: null } : { kind: a.kind, name: a.name }
      end = a.end
    }
    emitText(pos, a.start)
    out.push({ type: 'tag', tag, ...withFlags(styleAt(a.start)) })
    pos = end
  }
  emitText(pos, text.length)
}

// Lê o word/document.xml: estilos de letra usados e um bloco por parágrafo
export function readTemplate(xml) {
  const doc = parseXml(xml)
  const serializer = new XMLSerializer()
  const styles = []
  const styleKeys = new Map()
  const styleIndex = (rPr) => {
    const key = rPr ? serializer.serializeToString(rPr) : ''
    if (!styleKeys.has(key)) {
      styles.push({ rPr, ...flagsOf(rPr) })
      styleKeys.set(key, styles.length - 1)
    }
    return styleKeys.get(key)
  }

  const blocks = listParagraphs(doc).map((info, index) => {
    const segments = []
    let pieces = []
    let lock = info.locked ? 'controle de conteúdo do Word' : ''
    let objects = 0
    const weight = new Map()
    const flush = () => {
      if (pieces.length) tokenizeText(pieces, styles, segments)
      pieces = []
    }
    scanParagraph(info.el, {
      onText(text, rPr) {
        const s = styleIndex(rPr)
        weight.set(s, (weight.get(s) || 0) + text.length)
        pieces.push({ text, s })
      },
      onObject(_node, _rPr, label) {
        flush()
        segments.push({ type: 'object', obj: { p: index, n: objects }, label })
        objects += 1
      },
      onLock(reason) {
        lock = lock || reason
      },
    })
    flush()
    const firstRun = elements(info.el).find((n) => isW(n, 'r'))
    let base = firstRun ? styleIndex(childW(firstRun, 'rPr')) : -1
    let best = 0
    for (const [s, n] of weight) {
      if (n > best) {
        best = n
        base = s
      }
    }
    return {
      key: `b${index}`,
      index,
      inTable: info.inTable,
      tableStart: info.tableStart,
      readonly: lock,
      align: alignOf(info.el),
      base,
      segments,
    }
  })
  return { xml, styles, blocks }
}

const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow',
  'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz',
  'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
  'specVanish', 'oMath']

// Liga/desliga um item do <w:rPr> respeitando a ordem que o Word exige
function setRPrItem(doc, rPr, name, on, attrs = {}) {
  for (const el of elements(rPr).filter((n) => isW(n, name))) rPr.removeChild(el)
  if (!on) return
  const item = doc.createElementNS(W_NS, `w:${name}`)
  for (const [k, v] of Object.entries(attrs)) item.setAttribute(k, v)
  const order = RPR_ORDER.indexOf(name)
  const before = elements(rPr).find((n) => RPR_ORDER.indexOf(n.localName) > order)
  rPr.insertBefore(item, before || null)
}

function runProps(doc, model, seg) {
  const style = model.styles[seg.s]
  const rPr = style?.rPr ? doc.importNode(style.rPr, true) : doc.createElementNS(W_NS, 'w:rPr')
  const own = style || { b: false, i: false, u: false }
  if (Boolean(seg.b) !== own.b) {
    setRPrItem(doc, rPr, 'b', seg.b)
    setRPrItem(doc, rPr, 'bCs', seg.b)
  }
  if (Boolean(seg.i) !== own.i) {
    setRPrItem(doc, rPr, 'i', seg.i)
    setRPrItem(doc, rPr, 'iCs', seg.i)
  }
  if (Boolean(seg.u) !== own.u) setRPrItem(doc, rPr, 'u', seg.u, { 'w:val': 'single' })
  return elements(rPr).length ? rPr : null
}

function textRun(doc, rPr, part) {
  const r = doc.createElementNS(W_NS, 'w:r')
  if (rPr) r.appendChild(rPr.cloneNode(true))
  if (part === '\t') r.appendChild(doc.createElementNS(W_NS, 'w:tab'))
  else if (part === '\n') r.appendChild(doc.createElementNS(W_NS, 'w:br'))
  else {
    const t = doc.createElementNS(W_NS, 'w:t')
    t.setAttribute('xml:space', 'preserve')
    t.appendChild(doc.createTextNode(part))
    r.appendChild(t)
  }
  return r
}

function buildParagraph(doc, model, block, pPrSource, objects) {
  const p = doc.createElementNS(W_NS, 'w:p')
  const pPr = pPrSource ? childW(pPrSource, 'pPr') : null
  if (pPr) p.appendChild(pPr.cloneNode(true))
  for (const seg of block.segments) {
    if (seg.type === 'object') {
      const found = objects[seg.obj.p]?.[seg.obj.n]
      if (!found) continue
      const r = doc.createElementNS(W_NS, 'w:r')
      if (found.rPr) r.appendChild(found.rPr.cloneNode(true))
      r.appendChild(found.node.cloneNode(true))
      p.appendChild(r)
      continue
    }
    const rPr = runProps(doc, model, seg)
    const text = seg.type === 'tag' ? tagText(seg.tag) : seg.text
    for (const part of text.split(/(\t|\n)/)) if (part) p.appendChild(textRun(doc, rPr, part))
  }
  return p
}

// Monta o word/document.xml com os blocos editados. Parágrafo sem mudança fica
// exatamente como estava; blocos novos (sem index) entram depois do anterior.
export function buildDocumentXml(model, blocks) {
  const doc = parseXml(model.xml)
  const list = listParagraphs(doc)
  const objects = list.map((info) => {
    const found = []
    scanParagraph(info.el, {
      onText() {},
      onObject(node, rPr) {
        found.push({ node, rPr })
      },
      onLock() {},
    })
    return found
  })
  const remove = []
  let last = null
  for (const block of blocks) {
    if (block.index != null) {
      const el = list[block.index].el
      last = el
      if (block.deleted) remove.push(el)
      else if (block.changed) {
        const p = buildParagraph(doc, model, block, el, objects)
        el.parentNode.replaceChild(p, el)
        last = p
      }
    } else if (!block.deleted) {
      const source = block.pPrFrom != null ? list[block.pPrFrom].el : last
      const p = buildParagraph(doc, model, block, source, objects)
      if (last) last.parentNode.insertBefore(p, last.nextSibling)
      else {
        const body = doc.getElementsByTagNameNS(W_NS, 'body')[0]
        body.insertBefore(p, body.firstChild)
      }
      last = p
    }
  }
  for (const el of remove) el.parentNode.removeChild(el)
  return new XMLSerializer().serializeToString(doc)
}

// Confere o modelo antes de salvar: blocos "só se tiver" abertos/fechados,
// chave solta no texto e marcadores que o sistema não conhece.
export function checkTemplate(blocks) {
  const errors = []
  const unknown = new Set()
  const stack = []
  for (const block of blocks) {
    if (block.deleted) continue
    for (const seg of block.segments) {
      if (seg.type === 'text' && /[{}]/.test(seg.text)) {
        errors.push(`Tem uma chave “{” ou “}” solta no texto: “${seg.text.trim().slice(0, 40)}”. Apague e use “Inserir marcador”.`)
      }
      if (seg.type !== 'tag') continue
      const { kind, name } = seg.tag
      if (!isKnownTag(name)) unknown.add(name)
      if (kind === 'open' || kind === 'inverse') stack.push(seg.tag)
      else if (kind === 'close') {
        const top = stack.pop()
        if (!top) errors.push(`“${tagLabel(seg.tag)}” aparece sem o começo do bloco.`)
        else if (top.name !== name) errors.push(`O bloco “${tagLabel(top)}” termina com “${tagLabel(seg.tag)}”, que é de outro campo.`)
      }
    }
  }
  for (const tag of stack) errors.push(`O bloco “${tagLabel(tag)}” começa mas não termina.`)
  return { errors, unknown: [...unknown] }
}

export function segmentsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
