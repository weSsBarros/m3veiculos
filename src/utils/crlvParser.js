// Leitura do CRLV-e (texto já tirado do PDF pela função veiculo-dados): devolve
// só os dados do VEÍCULO. LGPD: nome e CPF/CNPJ do proprietário são apagados do
// texto antes de qualquer leitura e nunca saem daqui (nem o número do CRV e o
// código de segurança, que servem para transferir o carro).
// Lê pelos rótulos do documento, aguentando quebras de linha, espaços e a
// ordem embaralhada que a extração do PDF às vezes produz.
// Arquivo copiado para a função veiculo-dados (sem dependências fora dos utils).
import { normalizePlate, isValidPlate, normalizeChassis, isValidChassis, normalizeRenavam, isValidRenavam } from './documentosVeiculo.js'

// Rótulos do CRLV-e (sem acento, maiúsculos). Na busca, o mais longo ganha onde
// dois se sobrepõem ("PLACA ANTERIOR" não vira "PLACA").
const LABELS = [
  ['marca', ['MARCA / MODELO / VERSAO', 'MARCA/MODELO/VERSAO', 'MARCA / MODELO', 'MARCA/MODELO']],
  ['placaAnterior', ['PLACA ANTERIOR / UF', 'PLACA ANTERIOR/UF', 'PLACA ANTERIOR']],
  ['seguranca', ['CODIGO DE SEGURANCA DO CLA', 'CODIGO DE SEGURANCA CLA', 'CODIGO DE SEGURANCA']],
  ['renavam', ['CODIGO RENAVAM', 'COD. RENAVAM', 'RENAVAM']],
  ['crv', ['NUMERO DO CRV', 'NUMERO CRV']],
  ['anoFab', ['ANO FABRICACAO', 'ANO DE FABRICACAO', 'ANO FAB']],
  ['anoMod', ['ANO MODELO', 'ANO MOD']],
  ['especie', ['ESPECIE / TIPO', 'ESPECIE/TIPO', 'ESPECIE']],
  ['cor', ['COR PREDOMINANTE', 'COR']],
  ['combustivel', ['COMBUSTIVEL']],
  ['potencia', ['POTENCIA/CILINDRADA', 'POTENCIA / CILINDRADA', 'POTENCIA']],
  ['peso', ['PESO BRUTO TOTAL']],
  ['capacidade', ['CAPACIDADE']],
  ['lotacao', ['LOTACAO']],
  ['carroceria', ['CARROCERIA']],
  ['categoria', ['CATEGORIA']],
  ['exercicio', ['EXERCICIO']],
  ['motor', ['MOTOR']],
  ['eixos', ['EIXOS']],
  ['cmt', ['CMT']],
  ['cpf', ['CPF / CNPJ', 'CPF/CNPJ', 'CPF', 'CNPJ']],
  ['nome', ['NOME']],
  ['local', ['LOCAL']],
  ['data', ['DATA']],
  ['chassi', ['CHASSI']],
  ['placa', ['PLACA']],
  ['observacoes', ['OBSERVACOES DO VEICULO', 'OBSERVACOES']],
  ['mensagens', ['MENSAGENS SENATRAN', 'MENSAGENS']],
]

// Linha do valor apagada inteira: dados do proprietário
const OWNER_KEYS = ['nome', 'cpf']
// Apagados só quando o valor é um número sozinho na linha (no layout em colunas
// a linha traz outros dados; o número do CRV, de 12 dígitos, sai de qualquer jeito)
const NUMBER_KEYS = ['crv', 'seguranca']

const FUEL_RE = /\b(ALCOOL\s*\/\s*GASOLINA(?:\s*\/\s*(?:GNV|ELETRICO))*|GASOLINA\s*\/\s*ALCOOL(?:\s*\/\s*(?:GNV|ELETRICO))*|GASOLINA\s*\/\s*(?:GNV|ELETRICO)|ALCOOL\s*\/\s*GNV|DIESEL(?:\s*\/\s*ELETRICO)?|GASOLINA|ALCOOL|ETANOL|ELETRICO|FLEX)\b/
const COLORS = ['AMARELA', 'AMARELO', 'AZUL', 'BEGE', 'BRANCA', 'BRANCO', 'CINZA', 'DOURADA', 'DOURADO', 'GRENA', 'LARANJA', 'MARROM', 'PRATA', 'PRETA', 'PRETO', 'ROSA', 'ROXA', 'ROXO', 'VERDE', 'VERMELHA', 'VERMELHO', 'FANTASIA']
const COLOR_RE = new RegExp(`\\b(${COLORS.join('|')})\\b`)
const ESPECIE_RE = /\b(PASSAGEIRO|CARGA|MISTO|ESPECIAL|TRACAO|COLECAO|COMPETICAO)\b\s*\/?\s*(AUTOMOVEL|MOTOCICLETA|MOTONETA|CICLOMOTOR|CAMIONETA|CAMINHONETE|UTILITARIO|TRICICLO|QUADRICICLO|CAMINHAO|MICROONIBUS|ONIBUS|REBOQUE|SEMI-REBOQUE)?/
const MOTO_TYPES = ['MOTOCICLETA', 'MOTONETA', 'CICLOMOTOR']
const PLATE_IN_TEXT = /\b([A-Z]{3})\s?-?\s?([0-9][A-Z0-9][0-9]{2})\b/g
const CHASSIS_IN_TEXT = /\b(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]*[0-9])[A-HJ-NPR-Z0-9]{17}\b/
const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/g
// Palavras que aparecem com "/" e não são marca
const NOT_BRAND = /^(PASSAGEIRO|CARGA|MISTO|ESPECIAL|ALCOOL|GASOLINA|DIESEL|ETANOL|ELETRICO|CPF|CNPJ|ESPECIE|POTENCIA|PLACA|MARCA|ANO)\b/

function upperPlain(text) {
  return String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
}

// "PRATA" -> "Prata"; siglas e palavras com número ficam como vieram ("VW", "CG", "HR-V", "HB20")
function title(text) {
  return String(text || '').split(' ').map((w) => (w.length <= 3 || /[^A-Z]/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ')
}

// No layout em colunas, cor, combustível e espécie vêm colados depois do modelo
const AFTER_MODEL = new RegExp(`\\s+\\b(${[...COLORS, 'ALCOOL', 'GASOLINA', 'DIESEL', 'ETANOL', 'ELETRICO', 'FLEX', 'PASSAGEIRO', 'CARGA', 'MISTO', 'ESPECIAL', 'PARTICULAR', 'ALUGUEL', 'OFICIAL'].join('|')})\\b.*$`)

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/ /g, '\\s*')
}

// Posição de cada rótulo no texto
function findLabels(text) {
  const hits = []
  const taken = new Array(text.length).fill(false)
  const all = LABELS.flatMap(([key, names]) => names.map((name) => ({ key, name })))
    .sort((a, b) => b.name.length - a.name.length)
  for (const { key, name } of all) {
    const re = new RegExp(`(^|[^A-Z])(${escapeRe(name)})(?![A-Z])`, 'g')
    let m
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length
      const end = start + m[2].length
      if (taken.slice(start, end).some(Boolean)) continue
      for (let i = start; i < end; i++) taken[i] = true
      hits.push({ key, start, end })
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

// Texto entre cada rótulo e o próximo
function segments(text, hits) {
  const out = {}
  hits.forEach((h, i) => {
    const next = hits[i + 1]
    const value = text.slice(h.end, next ? next.start : text.length).replace(/^[\s:.-]+/, '').trim()
    if (!out[h.key]) out[h.key] = []
    out[h.key].push({ value })
  })
  return out
}

// LGPD: apaga do texto nome e CPF/CNPJ do proprietário, o número do CRV e o
// código de segurança, antes de procurar qualquer outro dado
function redact(text) {
  let out = text
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, ' ')
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' ')
    .replace(/[*X]{3}\.?\d{3}\.?\d{3}-?[*X]{2}/g, ' ')
    // 11 ou 14 dígitos logo depois de "CPF"/"CNPJ" (sem pontuação)
    .replace(/(CPF|CNPJ)([^0-9]{0,30})\b\d{11,14}\b/g, '$1$2 ')
    // número do CRV (12 dígitos; o RENAVAM tem 11)
    .replace(/\b\d{12}\b/g, ' ')
  const hits = findLabels(out)
  const chars = out.split('')
  hits.forEach((h, i) => {
    if (NUMBER_KEYS.includes(h.key)) {
      const next = hits[i + 1]
      const limit = next ? next.start : chars.length
      const rest = chars.slice(h.end, limit).join('')
      const m = rest.match(/^[\s:.-]*(\d{8,14})[ \t]*(?:\n|$)/)
      if (m) for (let k = h.end; k < h.end + m[0].length; k++) if (chars[k] !== '\n') chars[k] = ' '
      return
    }
    if (!OWNER_KEYS.includes(h.key)) return
    const next = hits[i + 1]
    const limit = next ? next.start : chars.length
    // O valor fica na mesma linha do rótulo ou na linha de baixo
    let pos = h.end
    while (pos < limit && chars[pos] !== '\n') pos++
    const sameLine = chars.slice(h.end, pos).join('').trim()
    let stop = pos
    if (!sameLine && pos < limit) {
      stop = pos + 1
      while (stop < limit && chars[stop] !== '\n') stop++
    }
    for (let k = h.end; k < Math.min(stop, limit); k++) if (chars[k] !== '\n') chars[k] = ' '
  })
  return chars.join('')
}

function firstMatch(re, text) {
  const m = String(text || '').match(re)
  return m ? m[0] : ''
}

function cleanLine(value) {
  return String(value || '').split('\n').map((l) => l.trim()).find(Boolean) || ''
}

function nearValue(value) {
  return String(value || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' ')
}

// "FIAT/ARGO DRIVE 1.3" (nacional) e "I/TOYOTA COROLLA XEI20FLEX" (importado:
// "I/", a marca e o modelo separados por espaço) -> marca, modelo e versão
export function splitCrlvBrandModel(raw) {
  const text = cleanLine(raw).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ')
  const imported = /^I\//.test(text)
  const rest = text.replace(/^I\//, '')
  const slash = rest.indexOf('/')
  const space = rest.indexOf(' ')
  const cut = slash > 0 ? slash : imported ? space : -1
  if (cut < 1) return null
  const brand = rest.slice(0, cut).trim()
  const modelText = rest.slice(cut + 1).replace(AFTER_MODEL, '').replace(/\/.*$/, '').trim()
  if (!brand || !modelText || NOT_BRAND.test(brand) || !/[A-Z]/.test(modelText)) return null
  const [model, ...version] = modelText.split(' ')
  return { imported, brand, modelText, model, version: version.join(' ') }
}

// Combustível do documento -> lista do painel (vazio quando não há equivalente)
export function fuelFromCrlv(raw) {
  const t = upperPlain(raw)
  if (!t) return ''
  if (t.includes('ELETRICO')) return /GASOLINA|ALCOOL|DIESEL|ETANOL/.test(t) ? 'Híbrido' : 'Elétrico'
  if ((t.includes('ALCOOL') || t.includes('ETANOL')) && t.includes('GASOLINA')) return 'Flex'
  if (t.includes('FLEX')) return 'Flex'
  if (t.includes('DIESEL')) return 'Diesel'
  if (t.includes('GNV')) return 'GNV'
  if (t.includes('GASOLINA')) return 'Gasolina'
  return ''
}

function pickBrandModel(seg, text) {
  for (const s of seg.marca || []) {
    const found = splitCrlvBrandModel(s.value)
    if (found) return found
  }
  // Layout em colunas: procura "MARCA/MODELO ..." no texto todo
  const re = /(?:^|\s)(I\s*\/\s*[A-Z][A-Z.-]{1,14}\s+[A-Z0-9][A-Z0-9 .,-]{1,40}|[A-Z][A-Z.-]{1,14}\s*\/\s*[A-Z0-9][A-Z0-9 .,-]{1,40})/g
  let m
  while ((m = re.exec(text))) {
    const found = splitCrlvBrandModel(m[1])
    if (found && !/^[A-Z]{3}[0-9]/.test(found.brand) && found.model.length > 1 && !/^[A-Z]{2}$/.test(found.modelText)) return found
  }
  return null
}

function plateFrom(text) {
  PLATE_IN_TEXT.lastIndex = 0
  const m = PLATE_IN_TEXT.exec(text)
  return m ? normalizePlate(m[1] + m[2]) : ''
}

function pickPlate(seg, text) {
  for (const s of seg.placa || []) {
    const plate = plateFrom(nearValue(s.value))
    if (plate) return plate
  }
  // Sem valor junto do rótulo: a primeira placa que não é a "placa anterior / UF"
  const anterior = new Set((seg.placaAnterior || []).map((s) => plateFrom(nearValue(s.value))).filter(Boolean))
  PLATE_IN_TEXT.lastIndex = 0
  let m
  while ((m = PLATE_IN_TEXT.exec(text))) {
    const plate = normalizePlate(m[1] + m[2])
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 5)
    if (!anterior.has(plate) && !/^\s*\/\s*[A-Z]{2}\b/.test(after)) return plate
  }
  return ''
}

function pickRenavam(seg, text) {
  for (const s of seg.renavam || []) {
    const numbers = nearValue(s.value).match(/\b\d{9,11}\b/g) || []
    const valid = numbers.find((n) => isValidRenavam(n))
    if (valid) return normalizeRenavam(valid)
    if (numbers[0]) return normalizeRenavam(numbers[0])
  }
  // Layout em colunas: o primeiro número de 11 dígitos com o dígito verificador certo
  return (text.match(/\b\d{11}\b/g) || []).find((n) => isValidRenavam(n)) || ''
}

function pickChassis(seg, text) {
  for (const s of seg.chassi || []) {
    const found = firstMatch(CHASSIS_IN_TEXT, nearValue(s.value))
    if (found) return normalizeChassis(found)
  }
  return normalizeChassis(firstMatch(CHASSIS_IN_TEXT, text))
}

function yearIn(list) {
  for (const s of list || []) {
    const y = (nearValue(s.value).match(/\b(19[5-9]\d|20[0-4]\d)\b/) || [])[0]
    if (y) return Number(y)
  }
  return 0
}

function pickYears(seg, text) {
  let fab = yearIn(seg.anoFab)
  let mod = yearIn(seg.anoMod)
  if (fab && mod && mod >= fab && mod - fab <= 1) return { fab, mod }
  const exercise = yearIn(seg.exercicio)
  // Colunas: dois anos seguidos (fabricação e modelo), que não sejam o exercício repetido
  const years = [...text.matchAll(YEAR_RE)].map((m) => Number(m[1]))
  for (let i = 0; i < years.length - 1; i++) {
    const a = years[i]
    const b = years[i + 1]
    if (b >= a && b - a <= 1 && !(a === exercise && b === exercise)) {
      if (!fab) fab = a
      if (!mod) mod = b
      break
    }
  }
  if (fab && mod && (mod < fab || mod - fab > 1)) return { fab, mod: 0 }
  return { fab, mod }
}

// Itens de texto do PDF (pdf.js: { str, transform, width }, uma lista por página)
// -> linhas de cima para baixo e da esquerda para a direita. Pedaços colados
// ("PLA" + "CA") viram uma palavra; colunas separadas ganham um espaço.
export function textFromPdfItems(pages) {
  const out = []
  for (const items of pages || []) {
    const rows = []
    for (const item of items || []) {
      const str = String(item?.str ?? '')
      if (!str.trim() || !Array.isArray(item.transform)) continue
      const [, , c, d, x, y] = item.transform.map(Number)
      const size = Math.hypot(c, d) || Number(item.height) || 10
      let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(r.size, size) * 0.4)
      if (!row) {
        row = { y, size, items: [] }
        rows.push(row)
      }
      row.items.push({ str, x, end: x + (Number(item.width) || 0), size })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      let line = ''
      let prevEnd = null
      for (const it of row.items) {
        if (prevEnd !== null && it.x - prevEnd > it.size * 0.15) line += ' '
        line += it.str
        prevEnd = it.end
      }
      out.push(line.replace(/\s+/g, ' ').trim())
    }
  }
  return out.filter(Boolean).join('\n')
}

// Texto do CRLV-e -> { ok, fields, invalid, missing, warnings, raw } ou { ok: false, error }
export function parseCrlvText(rawText) {
  const original = upperPlain(rawText).replace(/\r/g, '').replace(/[ \t]+/g, ' ')
  if (!original.replace(/\s+/g, '')) return { ok: false, error: 'sem_texto' }
  const text = redact(original)
  const hits = findLabels(text)
  const keys = new Set(hits.map((h) => h.key))
  const crlvKeys = ['renavam', 'chassi', 'marca', 'placa', 'anoFab', 'anoMod', 'combustivel']
  if (crlvKeys.filter((k) => keys.has(k)).length < 3) return { ok: false, error: 'nao_e_crlv' }
  const seg = segments(text, hits)

  const plate = pickPlate(seg, text)
  const renavam = pickRenavam(seg, text)
  const chassis = pickChassis(seg, text)
  const brandModel = pickBrandModel(seg, text)
  const { fab, mod } = pickYears(seg, text)
  const fuelRaw = firstMatch(FUEL_RE, (seg.combustivel || []).map((s) => nearValue(s.value)).join(' ')) || firstMatch(FUEL_RE, text)
  // Cor: junto do rótulo; no layout em colunas, a primeira cor do texto (nome do dono já foi apagado)
  const colorRaw = firstMatch(COLOR_RE, (seg.cor || []).map((s) => nearValue(s.value)).join(' ')) || firstMatch(COLOR_RE, text)
  const especieMatch = (seg.especie || []).map((s) => nearValue(s.value)).join(' ').match(ESPECIE_RE) || text.match(ESPECIE_RE)
  const especie = especieMatch ? especieMatch[0].replace(/\s*\/\s*/g, '/').trim() : ''
  return crlvResult({ plate, renavam, chassis, brandModel, fab, mod, fuelRaw, colorRaw, especie })
}

// Resultado comum à leitura do PDF e da foto: campos do cadastro, avisos e o que faltou
function crlvResult({ plate, renavam, chassis, brandModel, fab, mod, fuelRaw, colorRaw, especie }) {
  const fields = {}
  const invalid = []
  if (plate) {
    fields.plate = plate
    if (!isValidPlate(plate)) invalid.push('plate')
  }
  if (renavam) {
    fields.renavam = renavam
    if (!isValidRenavam(renavam)) invalid.push('renavam')
  }
  if (chassis) {
    fields.chassis = chassis
    if (!isValidChassis(chassis)) invalid.push('chassis')
  }
  if (brandModel) {
    fields.brand = title(brandModel.brand)
    fields.model = title(brandModel.model)
    if (brandModel.version) fields.version = brandModel.version
  }
  if (fab) fields.year = fab
  if (mod) {
    fields.modelYearNumber = mod
    fields.modelYear = fab ? `${fab}/${mod}` : String(mod)
  }
  const fuel = fuelFromCrlv(fuelRaw)
  if (fuel) fields.fuel = fuel
  if (colorRaw) fields.color = title(colorRaw)
  if (MOTO_TYPES.some((t) => especie.includes(t))) fields.category = 'moto'

  const warnings = []
  if (invalid.includes('renavam')) warnings.push('O RENAVAM lido não confere (dígito verificador). Confira no documento.')
  if (invalid.includes('plate')) warnings.push('A placa lida está fora do padrão. Confira no documento.')
  if (invalid.includes('chassis')) warnings.push('O chassi lido está fora do padrão. Confira no documento.')
  if (fuelRaw && !fuel) warnings.push(`O combustível "${title(fuelRaw)}" não tem opção no cadastro: escolha à mão.`)
  const missing = ['plate', 'renavam', 'chassis', 'brand', 'year', 'modelYear', 'color', 'fuel'].filter((k) => !fields[k])

  return {
    ok: true,
    fields,
    invalid,
    missing,
    warnings,
    raw: {
      brandModel: brandModel ? (brandModel.imported ? `I/${brandModel.brand} ${brandModel.modelText}` : `${brandModel.brand}/${brandModel.modelText}`) : '',
      brand: brandModel?.brand || '',
      modelText: brandModel?.modelText || '',
      fuel: fuelRaw ? title(fuelRaw) : '',
      color: colorRaw ? title(colorRaw) : '',
      especie: especie ? title(especie) : '',
    },
  }
}

// Dados da FOTO do CRLV-e lidos pela IA (função veiculo-dados, ação crlv_foto):
// as mesmas regras do PDF. ai = { e_documento_veiculo, placa, renavam, chassi,
// marca_modelo_versao, ano_fabricacao, ano_modelo, cor, combustivel, especie_tipo }.
// Nome e CPF/CNPJ do dono nem são pedidos à IA; qualquer outro campo é ignorado.
export function parseCrlvAiFields(ai, today = new Date()) {
  if (!ai || typeof ai !== 'object' || ai.e_documento_veiculo !== true) return { ok: false, error: 'nao_e_crlv' }
  const up = (v) => upperPlain(v).replace(/\s+/g, ' ').trim()
  const maxYear = today.getFullYear() + 1
  const year = (v) => {
    const n = Number(String(v ?? '').replace(/\D/g, ''))
    return n >= 1950 && n <= maxYear ? n : 0
  }
  const plate = plateFrom(up(ai.placa))
  const renavamDigits = up(ai.renavam).replace(/\D/g, '')
  const renavam = renavamDigits.length >= 9 && renavamDigits.length <= 11 ? normalizeRenavam(renavamDigits) : ''
  const chassis = normalizeChassis(firstMatch(CHASSIS_IN_TEXT, up(ai.chassi).replace(/[\s.-]/g, '')))
  const brandModel = splitCrlvBrandModel(up(ai.marca_modelo_versao))
  let fab = year(ai.ano_fabricacao)
  let mod = year(ai.ano_modelo)
  if (fab && mod && (mod < fab || mod - fab > 1)) mod = 0
  const fuelRaw = firstMatch(FUEL_RE, up(ai.combustivel)) || up(ai.combustivel)
  const colorRaw = firstMatch(COLOR_RE, up(ai.cor))
  const especieMatch = up(ai.especie_tipo).match(ESPECIE_RE)
  const especie = especieMatch ? especieMatch[0].replace(/\s*\/\s*/g, '/').trim() : ''
  const read = [plate, renavam, chassis, brandModel, fab].filter(Boolean).length
  if (read < 2) return { ok: false, error: 'ilegivel' }
  return crlvResult({ plate, renavam, chassis, brandModel, fab, mod, fuelRaw, colorRaw, especie })
}
