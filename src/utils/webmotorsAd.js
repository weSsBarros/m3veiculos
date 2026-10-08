// Anúncio da Webmotors (seção 61): monta o anúncio de um carro no formato da
// API de estoque da Webmotors (SOAP, wsEstoqueRevendedorWebMotors), diz o que
// falta para publicar, liga a cor, o câmbio, o combustível e os opcionais às
// listas da Webmotors e monta e lê as mensagens SOAP. Só carros: as motos usam
// outro serviço da Webmotors, contratado à parte pela loja.
// Código puro, sem imports: o mesmo texto vai copiado dentro da Edge Function
// webmotors (o teste tests/webmotorsAd.test.js confere que a cópia é idêntica).
// Os códigos de retorno e de motivo da Webmotors ainda vão ser conferidos no
// ambiente de teste (o manual não traz a tabela em texto).

export const WM_NAMESPACE = 'www.webmotors.com.br/wsEstoqueRevendedorWebMotors'
export const WM_LOGIN_NAMESPACE = 'www.webmotors.com.br/wsLoginSistemaRevendedor'
export const WM_MAX_IMAGES = 20
export const WM_MAX_TEXT = 3000

function clean(value) {
  return String(value ?? '').trim()
}

// Minúsculo e sem acento (para procurar palavras nos destaques)
function plain(value) {
  return clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

// Maiúsculo, sem acento, só letras, números e espaço; "1,0" e "1.0" viram "1.0"
export function wmNormalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/(\d)[.,](\d)/g, '$1#$2')
    .replace(/[^A-Z0-9#]+/g, ' ')
    .replace(/#/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

// Placa em maiúsculas, sem hífen (antiga ABC1234 ou Mercosul ABC1D23)
export function wmPlate(plate) {
  const value = clean(plate).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value) ? value : ''
}

export function wmCnpj(value) {
  const digits = clean(value).replace(/\D/g, '')
  return digits.length === 14 ? digits : ''
}

function validYear(n) {
  return Number.isInteger(n) && n >= 1900 && n <= 2100
}

// Anos do anúncio: "2022/2023" → fabricação 2022 e modelo 2023; com um ano só,
// vale para os dois. null quando não dá para saber.
export function wmYears(car) {
  const text = clean(car.modelYear)
  const pair = text.match(/^(\d{4})\s*\/\s*(\d{4})$/)
  const single = text.match(/^(\d{4})$/)
  const year = Number(car.year)
  let fab = null
  let model = null
  if (pair) {
    fab = Number(pair[1])
    model = Number(pair[2])
  } else if (single) {
    model = Number(single[1])
    fab = validYear(year) && year <= model && year >= model - 1 ? year : model
  } else if (validYear(year)) {
    fab = year
    model = year
  }
  if (!validYear(fab) || !validYear(model) || model < fab || model > fab + 1) return null
  return { fab, model }
}

export function wmDoors(doors) {
  const n = Number(doors)
  return Number.isInteger(n) && n >= 2 && n <= 5 ? n : 0
}

export function wmTitle(car) {
  const text = [car.brand, car.model, car.version].map(clean).filter(Boolean).join(' ').replace(/\s+/g, ' ')
  return text.length >= 2 ? text : 'Veículo'
}

// Fotos: as do site (/uploads/carros/<nome>.webp) vão pela cópia em JPG, que o
// site gera na primeira vez (api/foto-jpg.php), como na OLX
export function wmImageUrl(url, siteUrl) {
  const site = clean(siteUrl).replace(/\/+$/, '')
  const value = clean(url)
  const local = /^\/uploads\/carros\/([A-Za-z0-9-]{8,64})\.(webp|jpg|jpeg|png)$/i.exec(value)
  if (local) {
    if (!/^https?:\/\//.test(site)) return null
    return local[2].toLowerCase() === 'webp' ? `${site}/uploads/carros/jpg/${local[1]}.jpg` : `${site}${value}`
  }
  if (/^https?:\/\/\S+\.(jpe?g|png)(\?\S*)?$/i.test(value)) return value
  return null
}

export function wmImages(car, siteUrl) {
  const out = []
  for (const url of car.images || []) {
    const image = wmImageUrl(url, siteUrl)
    if (image && !out.includes(image)) out.push(image)
    if (out.length === WM_MAX_IMAGES) break
  }
  return out
}

// Por que o carro não vai para a Webmotors (vazio = vai). As mesmas regras da
// OLX (decisão do Wesley): só os disponíveis, visíveis no site, fora do
// repasse e marcados "Publicar na Webmotors". Moto fica de fora.
export function wmOutReason(car) {
  if (car.category === 'moto') return 'Moto (a Webmotors usa outro serviço para motos)'
  if (car.webmotorsPublish === false) return 'Desmarcado para a Webmotors'
  if (car.entryType === 'repasse') return 'Repasse'
  if (car.status === 'vendido') return 'Vendido'
  if (car.status === 'reservado') return 'Reservado'
  if (car.status === 'manutencao') return 'Em manutenção'
  if (car.status !== 'disponivel') return 'Fora de venda'
  if (car.hidden) return 'Oculto do site'
  return ''
}

export function wmEligible(car) {
  return !wmOutReason(car)
}

export const WM_MISSING_LABELS = {
  catalogo: 'marca, modelo e versão da Webmotors',
  placa: 'placa',
  preco: 'preço',
  ano: 'ano de fabricação e ano modelo',
  portas: 'número de portas',
  foto: 'foto',
  cor: 'cor na lista da Webmotors',
  cambio: 'câmbio na lista da Webmotors',
  combustivel: 'combustível na lista da Webmotors',
  modalidade: 'modalidade do plano da Webmotors (em Portais)',
}

// -- Cor, câmbio e combustível --------------------------------------------------------
// A Webmotors tem listas próprias (ObterCores, ObterCambio, ObterCombustivel).
// O escolhido no cadastro (webmotors_catalog) vale; sem ele, o sistema usa o
// item da lista que combina com o texto do carro.

const round3 = (n) => Math.round(n * 1000) / 1000

function rank(options, scoreOf) {
  return (options || [])
    .map((o) => ({ ...o, score: round3(scoreOf(o.name)) }))
    .sort((a, b) => b.score - a.score || String(a.name).length - String(b.name).length || String(a.name).localeCompare(String(b.name)))
}

// A melhor da lista quando a nota passa do mínimo. No empate fica o nome mais
// curto, que é o mais geral ("Automática" antes de "Automática sequencial").
export function wmPick(ranked, min = 0.75) {
  const best = (ranked || [])[0]
  return best && best.score >= min ? { id: best.id, name: best.name } : null
}

const COLOR_STEMS = ['PRET', 'BRANC', 'PRAT', 'CINZ', 'GRAFIT', 'CHUMB', 'VERMELH', 'AZUL', 'VERDE', 'AMAREL', 'LARANJ', 'BEGE',
  'MARROM', 'DOURAD', 'VINHO', 'BORDO', 'ROX', 'ROSA', 'BRONZE', 'CHAMPA', 'MARFIM', 'PEROL', 'CREME', 'FUME', 'CARAMEL']

// Tons que, sem a cor exata na lista, entram na cor básica
const COLOR_BASE = { GRAFIT: 'CINZ', CHUMB: 'CINZ', FUME: 'CINZ', BORDO: 'VINHO', PEROL: 'BRANC', CHAMPA: 'BEGE', CREME: 'BEGE',
  MARFIM: 'BEGE', CARAMEL: 'MARROM' }

function colorStems(value) {
  return wmNormalize(value).split(' ').map((w) => COLOR_STEMS.find((s) => w.startsWith(s))).filter(Boolean)
}

export function wmRankColors(color, options) {
  const q = wmNormalize(color)
  const ours = colorStems(color)
  return rank(options, (name) => {
    const n = wmNormalize(name)
    if (!q || !n) return 0
    if (n === q) return 1
    const theirs = colorStems(name)
    if (!ours.length || !theirs.length) return 0
    if (theirs[0] === ours[0]) {
      // "Branco" para "Branco Pérola"; uma cor composta só se for a mesma
      if (!theirs.every((s) => ours.includes(s))) return 0.5
      return theirs.length === ours.length ? 0.95 : 0.9
    }
    return theirs.length === 1 && COLOR_BASE[ours[0]] === theirs[0] ? 0.8 : 0
  })
}

function gearKind(value) {
  const t = plain(value)
  if (!t) return ''
  if (/manual|mecanic/.test(t)) return 'manual'
  if (/semi/.test(t)) return 'semi'
  if (/automatizad/.test(t)) return 'automatizado'
  if (/cvt|continu/.test(t)) return 'cvt'
  if (/autom|tiptronic|dsg|sequencial|\bat\b/.test(t)) return 'automatico'
  return ''
}

export function wmRankGears(transmission, options) {
  const ours = gearKind(transmission)
  return rank(options, (name) => {
    const theirs = gearKind(name)
    if (!ours || !theirs) return 0
    if (theirs === ours) return 1
    // Sem "CVT" na lista, o CVT entra como automático
    return ours === 'cvt' && theirs === 'automatico' ? 0.8 : 0
  })
}

function fuelKind(value) {
  const t = plain(value)
  if (!t) return ''
  const gas = /gasolina/.test(t)
  const alc = /alcool|etanol/.test(t)
  const ele = /eletric/.test(t)
  const die = /diesel/.test(t)
  const gnv = /gnv|gas natural/.test(t)
  if (/hibrid/.test(t) || (ele && (gas || alc || die))) return 'hibrido'
  if (ele) return 'eletrico'
  if (/flex|bicombust/.test(t) || (gas && alc)) return gnv ? 'flex-gnv' : 'flex'
  if (die) return 'diesel'
  if (gnv) return gas ? 'gasolina-gnv' : alc ? 'alcool-gnv' : 'gnv'
  if (alc) return 'alcool'
  if (gas) return 'gasolina'
  return ''
}

export function wmRankFuels(fuel, options) {
  const ours = fuelKind(fuel)
  return rank(options, (name) => {
    const theirs = fuelKind(name)
    if (!ours || !theirs) return 0
    if (theirs === ours) return 1
    // "GNV" no cadastro: o kit vai com qualquer combustível de base
    return ours === 'gnv' && theirs.endsWith('-gnv') ? 0.8 : 0
  })
}

// lists: { cores, cambios, combustiveis } ([{ id, name }]); lista que não veio = não escolhe
export function wmResolve(car, lists = {}) {
  const cat = car.webmotorsCatalog || {}
  const chosen = (id, name) => (id ? { id, name: clean(name) } : null)
  return {
    color: chosen(cat.colorId, cat.colorName) || (lists.cores ? wmPick(wmRankColors(car.color, lists.cores)) : null),
    gear: chosen(cat.gearId, cat.gearName) || (lists.cambios ? wmPick(wmRankGears(car.transmission, lists.cambios)) : null),
    fuel: chosen(cat.fuelId, cat.fuelName) || (lists.combustiveis ? wmPick(wmRankFuels(car.fuel, lists.combustiveis)) : null),
  }
}

// O que falta no carro. ctx: { siteUrl, lists }. Sem as listas da Webmotors
// (ctx.lists vazio), a cor, o câmbio e o combustível ficam para a função
// conferir no envio.
export function wmMissing(car, ctx = {}) {
  const cat = car.webmotorsCatalog || {}
  const lists = ctx.lists || {}
  const missing = []
  if (!cat.brandId || !cat.modelId || !cat.versionId) missing.push('catalogo')
  if (!wmPlate(car.plate)) missing.push('placa')
  if (!(Number(car.price) > 0)) missing.push('preco')
  if (!wmYears(car)) missing.push('ano')
  if (!wmDoors(car.doors)) missing.push('portas')
  if (wmImages(car, ctx.siteUrl).length === 0) missing.push('foto')
  const resolved = wmResolve(car, lists)
  if (lists.cores && !resolved.color) missing.push('cor')
  if (lists.cambios && !resolved.gear) missing.push('cambio')
  if (lists.combustiveis && !resolved.fuel) missing.push('combustivel')
  return missing
}

// -- Opcionais ----------------------------------------------------------------------
// Palavras dos destaques do carro e o nome do opcional na lista da Webmotors

const FEATURES = [
  [/ar[ -]?condicionado|ar digital|climatiza/, /^AR CONDICIONADO|CLIMATIZ/],
  [/ar quente/, /AR QUENTE/],
  [/vidros? eletric/, /VIDROS? ELETRIC/],
  [/travas? eletric/, /TRAVAS? ELETRIC/],
  [/retrovisor(es)? eletric/, /RETROVISOR(ES)? ELETRIC/],
  [/air ?bags?/, /AIR ?BAG/],
  [/alarme/, /ALARME/],
  [/\babs\b/, /\bABS\b/],
  [/controle de tracao/, /CONTROLE DE TRACAO/],
  [/controle de estabilidade/, /ESTABILIDADE/],
  [/multimidia/, /MULTIMIDIA/],
  [/\bradio\b|\bsom\b/, /^RADIO|\bSOM\b/],
  [/android auto|carplay|car play/, /ANDROID|CAR ?PLAY/],
  [/bluetooth/, /BLUETOOTH/],
  [/\busb\b/, /USB/],
  [/\bgps\b|navegador/, /GPS|NAVEGADOR/],
  [/sensor(es)? de (re|estacionamento)\b/, /SENSOR(ES)? DE (ESTACIONAMENTO|RE)\b/],
  [/camera de re/, /CAMERA DE RE/],
  [/sensor de chuva/, /SENSOR DE CHUVA/],
  [/sensor crepuscular|farol automatico/, /CREPUSCULAR|FAROL AUTOMATICO/],
  [/couro/, /COURO/],
  [/computador de bordo/, /COMPUTADOR DE BORDO/],
  [/volante multifuncional|comandos? no volante/, /VOLANTE MULTIFUNCIONAL|COMANDOS? NO VOLANTE/],
  [/piloto automatico|controle (automatico )?de (velocidade|cruzeiro)|cruise/, /PILOTO AUTOMATICO|CONTROLE (AUTOMATICO )?DE VELOCIDADE|CRUZEIRO/],
  [/rodas? (de )?liga/, /RODAS? (DE )?LIGA/],
  [/teto solar|teto panoramico/, /TETO SOLAR|PANORAMIC/],
  [/4x4|tracao integral|\bawd\b|\b4wd\b/, /4X4|TRACAO INTEGRAL/],
  [/direcao eletro[- ]?hidraulica/, /ELETRO ?HIDRAULICA/],
  [/direcao eletrica/, /DIRECAO ELETRICA/],
  [/direcao hidraulica/, /^DIRECAO HIDRAULICA/],
  [/neblina|farol de milha/, /NEBLINA|MILHA/],
  [/partida (sem chave|por botao)|keyless|start[ -]?stop/, /PARTIDA|KEYLESS|START/],
  [/desembacador/, /DESEMBACADOR/],
  [/limpador traseiro/, /LIMPADOR TRASEIRO/],
  [/carregador (por )?inducao|carregamento sem fio|wireless/, /INDUCAO|SEM FIO|WIRELESS/],
  [/isofix/, /ISOFIX/],
]

// Códigos dos opcionais da lista da Webmotors que os destaques do carro citam
// (na ordem da lista, para o mesmo carro dar sempre o mesmo anúncio)
export function wmOptionals(car, options) {
  const list = options || []
  if (!list.length) return []
  const text = plain((car.highlights || []).join(' \n '))
  const ownNames = new Set((car.highlights || []).map(wmNormalize).filter(Boolean))
  const picked = new Set()
  for (const [ours, theirs] of FEATURES) {
    if (!ours.test(text)) continue
    const match = list
      .filter((o) => theirs.test(wmNormalize(o.name)))
      .sort((a, b) => wmNormalize(a.name).length - wmNormalize(b.name).length)[0]
    if (match) picked.add(String(match.id))
  }
  for (const o of list) if (ownNames.has(wmNormalize(o.name))) picked.add(String(o.id))
  return list.filter((o) => picked.has(String(o.id))).map((o) => o.id)
}

// -- Anúncio --------------------------------------------------------------------------

function thousands(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Texto do anúncio: a descrição do carro (ou um texto com os dados, se estiver
// vazia) e o texto padrão da loja no fim
export function wmObservation(car, settings = {}) {
  let text = clean(car.description)
  if (text.length < 2) {
    const facts = [
      clean(car.modelYear) ? `Ano ${clean(car.modelYear)}` : car.year ? `Ano ${car.year}` : '',
      car.km != null && car.km !== '' ? `${thousands(car.km)} km` : '',
      clean(car.transmission) ? `Câmbio ${clean(car.transmission).toLowerCase()}` : '',
      clean(car.fuel),
      clean(car.color) ? `Cor ${clean(car.color).toLowerCase()}` : '',
    ].filter(Boolean)
    const highlights = (car.highlights || []).map(clean).filter(Boolean)
    text = [wmTitle(car), facts.join(' · '), highlights.map((h) => `- ${h}`).join('\n')].filter(Boolean).join('\n\n')
  }
  const footer = clean(settings.footer)
  if (footer) text = `${text}\n\n${footer}`
  return text.slice(0, WM_MAX_TEXT)
}

function yesNo(value) {
  return value ? 'S' : 'N'
}

// Monta o anúncio (o "pAnuncio" de IncluirCarro e AlterarCarro, sem o
// CodigoAnuncio). ctx: { siteUrl, settings, modality: { code, type, name },
// lists: { cores, cambios, combustiveis, opcionais } }.
// Devolve { ad, photos, labels, missing }; ad = null quando falta dado.
export function buildWebmotorsAd(car, ctx = {}) {
  const lists = ctx.lists || {}
  const missing = wmMissing(car, ctx)
  const resolved = wmResolve(car, lists)
  for (const [key, value] of [['cor', resolved.color], ['cambio', resolved.gear], ['combustivel', resolved.fuel]]) {
    if (!value && !missing.includes(key)) missing.push(key)
  }
  if (!ctx.modality?.code) missing.push('modalidade')
  if (missing.length) return { ad: null, photos: [], labels: null, missing }

  const cat = car.webmotorsCatalog
  const years = wmYears(car)
  const text = plain((car.highlights || []).join(' \n '))
  const settings = ctx.settings || {}
  const price = Math.round(Number(car.price))
  const original = Math.round(Number(car.originalPrice) || 0)
  const optionals = wmOptionals(car, lists.opcionais)
  const ad = {
    CodigoModalidade: Number(ctx.modality.code),
    TipoAnuncio: ctx.modality.type === 'N' ? 'N' : 'U',
    CodigoMarca: Number(cat.brandId),
    CodigoModelo: Number(cat.modelId),
    CodigoVersao: Number(cat.versionId),
    AnoDoModelo: years.model,
    AnoFabricacao: years.fab,
    Km: Math.max(0, Math.round(Number(car.km) || 0)),
    Placa: wmPlate(car.plate),
    CodigoCambio: Number(resolved.gear.id),
    NrPortas: wmDoors(car.doors),
    CodigoCor: Number(resolved.color.id),
    CodigoCombustivel: Number(resolved.fuel.id),
    Blindado: yesNo(/blindad/.test(text)),
    AdaptadoDeficientesFisicos: yesNo(/adaptad[oa]s? (para )?(pcd|deficien)/.test(text)),
    UnicoDono: yesNo(plain(car.condition).includes('unico')),
    Alienado: 'N',
    IpvaPago: yesNo(/ipva (\d{4} )?(pago|quitado)/.test(text)),
    NaoAceitaTroca: yesNo(settings.exchange === 'nao'),
    RevisadoOficinaAgendaDoCarro: 'N',
    RevisoesEmConcessionaria: yesNo(/revis(ad[oa]s?|oes)( feitas)? (na|em|pela) concessionaria/.test(text)),
    GarantiaDeFabrica: yesNo(/garantia de fabrica|na garantia/.test(text)),
    Licenciado: yesNo(/licenciad/.test(text)),
    Leilao: 'N',
    // "De" (PrecoReal) e "por" (PrecoVenda): sem o preço antigo, os dois iguais
    PrecoReal: original > price ? original : price,
    PrecoVenda: price,
    Observacao: wmObservation(car, settings),
    Opcional: optionals,
  }
  const labels = {
    marca: clean(cat.brandName),
    modelo: clean(cat.modelName),
    versao: clean(cat.versionName),
    cor: resolved.color.name,
    cambio: resolved.gear.name,
    combustivel: resolved.fuel.name,
    opcionais: (lists.opcionais || []).filter((o) => optionals.includes(o.id)).map((o) => o.name),
    modalidade: clean(ctx.modality.name),
  }
  return { ad, photos: wmImages(car, ctx.siteUrl), labels, missing: [] }
}

// Linha do banco (cars) no formato do painel
export function wmCarFromRow(row) {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    version: row.version,
    year: row.year,
    modelYear: row.model_year,
    km: row.km,
    transmission: row.transmission,
    fuel: row.fuel,
    color: row.color,
    doors: row.doors,
    category: row.category,
    condition: row.condition,
    price: row.price,
    originalPrice: row.original_price,
    highlights: row.highlights || [],
    description: row.description || '',
    images: row.images || [],
    status: row.status,
    hidden: Boolean(row.hidden),
    plate: row.plate || '',
    entryType: row.entry_type || 'showroom',
    webmotorsPublish: row.webmotors_publish !== false,
    webmotorsCatalog: row.webmotors_catalog || {},
  }
}

// Versões do ano modelo do carro primeiro: só as que têm o ano, quando houver
export function wmVersionsForYear(options, year) {
  const list = options || []
  const y = Number(year)
  const withYear = list.filter((o) => Array.isArray(o.years) && o.years.includes(y))
  return withYear.length ? withYear : list
}

// -- SOAP ---------------------------------------------------------------------------

// Ordem dos campos do "Anuncio" no WSDL (o serviço .asmx lê na ordem)
const AD_FIELDS = ['CodigoModalidade', 'TipoAnuncio', 'CodigoMarca', 'CodigoModelo', 'CodigoVersao', 'AnoDoModelo', 'AnoFabricacao', 'Km',
  'Placa', 'CodigoCambio', 'NrPortas', 'CodigoCor', 'CodigoCombustivel', 'Blindado', 'AdaptadoDeficientesFisicos', 'UnicoDono', 'Alienado',
  'IpvaPago', 'NaoAceitaTroca', 'RevisadoOficinaAgendaDoCarro', 'RevisoesEmConcessionaria', 'GarantiaDeFabrica', 'Licenciado', 'Leilao',
  'PrecoReal', 'PrecoVenda', 'Observacao']

// O "pAnuncio" do envio: CodigoAnuncio 0 para incluir, o código para alterar
export function wmAnuncioParam(ad, code = 0) {
  const out = { CodigoAnuncio: code || 0 }
  for (const key of AD_FIELDS) {
    if (ad[key] !== undefined && ad[key] !== null && ad[key] !== '') out[key] = ad[key]
  }
  if (Array.isArray(ad.Opcional) && ad.Opcional.length) out.Opcional = { OpcionalWM: ad.Opcional.map((c) => ({ CodigoOpcional: c })) }
  return out
}

// Texto seguro no XML: tira caracteres de controle e escapa < > &
function xmlText(value) {
  let out = ''
  for (const ch of String(value)) {
    const c = ch.codePointAt(0)
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) continue
    out += ch
  }
  return out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xmlNode(name, value) {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.map((v) => xmlNode(name, v)).join('')
  if (typeof value === 'object') return `<${name}>${Object.entries(value).map(([k, v]) => xmlNode(k, v)).join('')}</${name}>`
  return `<${name}>${xmlText(value)}</${name}>`
}

// Envelope SOAP 1.1 de uma operação; params na ordem do WSDL. Lista vira
// elementos repetidos com o mesmo nome.
export function wmSoapEnvelope(namespace, operation, params = {}) {
  const body = Object.entries(params).map(([k, v]) => xmlNode(k, v)).join('')
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<soap:Body><${operation} xmlns="${namespace}">${body}</${operation}></soap:Body></soap:Envelope>`
}

const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeXml(text) {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, name) => {
    if (name[0] !== '#') return XML_ENTITIES[name] ?? whole
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

function xmlValue(node) {
  if (!node.kids.length) return node.text.trim()
  const out = {}
  for (const kid of node.kids) {
    const value = xmlValue(kid)
    if (!Object.prototype.hasOwnProperty.call(out, kid.name)) out[kid.name] = value
    else if (Array.isArray(out[kid.name])) out[kid.name].push(value)
    else out[kid.name] = [out[kid.name], value]
  }
  return out
}

// Lê o XML da resposta: cada elemento vira texto (sem filhos) ou objeto com os
// filhos pelo nome sem o prefixo; repetidos viram lista. Atributos são ignorados.
export function wmParseXml(xml) {
  const stack = [{ name: '', kids: [], text: '' }]
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g
  for (const m of String(xml || '').matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) top.text += m[1]
    else if (m[3]) {
      const name = m[3].replace(/^[^:]*:/, '')
      if (m[2]) {
        if (stack.length > 1) stack[stack.length - 2].kids.push(stack.pop())
      } else {
        const node = { name, kids: [], text: '' }
        if (/\/\s*$/.test(m[4])) top.kids.push(node)
        else stack.push(node)
      }
    } else if (m[5] !== undefined) top.text += decodeXml(m[5])
  }
  while (stack.length > 1) stack[stack.length - 2].kids.push(stack.pop())
  return xmlValue(stack[0])
}

// Resultado de uma operação: { fault, result } (result = o "<Operação>Result")
export function wmSoapResult(xml, operation) {
  const doc = wmParseXml(xml)
  const body = doc && typeof doc === 'object' ? doc.Envelope?.Body : null
  if (!body || typeof body !== 'object') return { fault: 'resposta inválida da Webmotors', result: null }
  if (body.Fault) {
    const f = body.Fault
    const text = typeof f === 'object' ? f.faultstring || f.Reason?.Text || f.faultcode || '' : f
    return { fault: clean(typeof text === 'object' ? JSON.stringify(text) : text) || 'erro da Webmotors', result: null }
  }
  const response = body[`${operation}Response`]
  const result = response && typeof response === 'object' ? response[`${operation}Result`] : undefined
  return { fault: null, result: result === undefined ? null : result }
}

// Itens de uma lista do resultado ({ MarcaWM: [...] } ou um só objeto)
export function wmList(value, key) {
  if (!value || typeof value !== 'object') return []
  const items = value[key]
  if (items === undefined || items === null || items === '') return []
  return [].concat(items).filter((i) => i && typeof i === 'object')
}

function wmNumber(value) {
  const text = clean(value)
  const n = Number(text)
  return text !== '' && Number.isFinite(n) ? n : null
}

const LIST_FIELDS = {
  marcas: ['MarcaWM', 'CodigoMarca', 'NomeMarca'],
  modelos: ['ModeloWM', 'CodigoModelo', 'NomeModelo'],
  versoes: ['Versao', 'CodigoVersao', 'NomeVersao'],
  cores: ['CorWM', 'CodigoCor', 'Descricao'],
  cambios: ['TipoCambioWM', 'CodigoCambio', 'Descricao'],
  combustiveis: ['CombustivelWM', 'CodigoCombustivel', 'Descricao'],
  opcionais: ['OpcionalWM', 'CodigoOpcional', 'Descricao'],
}

// Listas da Webmotors no formato das telas: [{ id, name }], em ordem
// alfabética; as versões trazem os anos modelo (years)
export function wmOptionsFrom(level, result) {
  if (level === 'modalidades') return wmModalities(result)
  const fields = LIST_FIELDS[level]
  if (!fields) return []
  const [item, idKey, nameKey] = fields
  return wmList(result, item)
    .map((o) => {
      const option = { id: wmNumber(o[idKey]), name: clean(o[nameKey]) }
      if (level === 'versoes') {
        option.years = wmList(o.AnoModelo, 'AnoModeloWM').map((y) => wmNumber(y.AnoModelo)).filter((y) => y !== null)
      }
      return option
    })
    .filter((o) => o.id !== null && o.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

// Modalidades do plano da loja (ObterModalidade), com as vagas: total e usadas
export function wmModalities(result) {
  return wmList(result, 'ModalidadeWM')
    .map((o) => ({
      code: wmNumber(o.CodigoModalidade),
      name: clean(o.Descricao),
      type: clean(o.TipoAnuncio).toUpperCase(),
      total: wmNumber(o.QuantidadeAnunciosTotal) ?? 0,
      used: wmNumber(o.QuantidadeAnuncios) ?? 0,
      photos: clean(o.PermiteFoto).toUpperCase() !== 'N',
    }))
    .filter((m) => m.code > 0)
}

// Plano cheio: a modalidade já tem todos os anúncios que cabem
export function wmModalityFull(modality) {
  return Boolean(modality) && modality.total > 0 && modality.used >= modality.total
}

// -- Códigos de retorno ---------------------------------------------------------------
// "500" = deu certo (é o que a Webmotors devolve nos testes da coleção oficial do
// Postman, no login, nos envios e em cada item das listas); outro código = recusa.
// Um código é o número sozinho (500, 401) ou o par "grupo|item" das tabelas do manual
// (43|22 = "Cor deve ser preenchida"); vários códigos vêm separados por ; , ou espaço.

export const WM_SUCCESS = '500'

function returnParts(code) {
  return clean(code)
    .replace(/[()]/g, ' ')
    .replace(/\s*\|\s*/g, '|')
    .split(/[^0-9A-Za-z_|-]+/)
    .map((c) => c.replace(/^\|+|\|+$/g, ''))
    .filter(Boolean)
}

export function wmReturnOk(code) {
  const parts = returnParts(code)
  return parts.length > 0 && parts.every((c) => c === WM_SUCCESS)
}

export function wmReturnCodes(code) {
  return returnParts(code).filter((c) => c !== WM_SUCCESS && !/^0+$/.test(c))
}

// Código de retorno de um resultado: o do próprio resultado ou, nas listas
// (MarcaWM, ModalidadeWM, Anuncios...), o do primeiro item
export function wmResultCode(result) {
  if (!result || typeof result !== 'object') return ''
  if (result.CodigoRetorno !== undefined) return clean(result.CodigoRetorno)
  for (const value of Object.values(result)) {
    const first = [].concat(value)[0]
    if (first && typeof first === 'object') {
      const code = wmResultCode(first)
      if (code) return code
    }
  }
  return ''
}

// Textos das tabelas de retorno do manual de integração (serviços de carros: login,
// manutenção do anúncio, exclusão e fotos). Código fora da tabela aparece pelo número.
const WM_RETURN_TEXTS = {
  400: 'falha inesperada na Webmotors (fale com o suporte técnico de lá)',
  401: 'o login da integração não vale mais (hash inválido)',
  402: 'a sessão com a Webmotors expirou',
  403: 'o usuário de integração não tem permissão para esta operação',
  31: 'o login da integração não vale mais (hash inválido)',
  32: 'falha inesperada na Webmotors (fale com o suporte técnico de lá)',
  '28|2': 'preço de venda inválido',
  '31|1': 'falta preencher um campo obrigatório',
  '21|9': 'foto com mais de 500 KB',
  '21|10': 'formato da foto inválido',
  '42|1': 'falta preencher um campo da foto',
  '42|2': 'fotos demais para o anúncio',
  '42|3': 'a modalidade do plano não aceita fotos',
  '42|4': 'a Webmotors não conseguiu gravar a foto',
  '43|7': 'falta o preço do carro',
  '43|8': 'falta o ano do modelo',
  '43|9': 'falta o ano de fabricação',
  '43|10': 'falta o câmbio',
  '43|11': 'falta a cor',
  '43|12': 'falta o número de portas',
  '43|13': 'falta a placa',
  '43|14': 'falta a quilometragem',
  '43|15': 'falta a marca',
  '43|16': 'falta o modelo',
  '43|17': 'falta a versão',
  '43|18': 'falta a quilometragem',
  '43|19': 'falta a placa',
  '43|20': 'falta o câmbio',
  '43|21': 'falta o número de portas',
  '43|22': 'falta a cor',
  '43|25': 'a loja está bloqueada na Webmotors',
  '43|30': 'falta o combustível',
  '43|32': 'acabaram as vagas da modalidade do plano',
  '43|33': 'acabaram as vagas do pacote de anúncios',
  '43|36': 'o anúncio não pode ser alterado (ou não é desta loja)',
  '43|37': 'ano do modelo inválido',
  '43|39': 'o anúncio não é desta loja na Webmotors',
  '43|40': 'anúncio inválido',
  '43|41': 'marca, modelo, versão e ano do modelo não combinam',
  '43|42': 'a cor não vale para esta versão',
  '43|43': 'opcionais inválidos',
  '43|44': 'combustível inválido',
  '43|45': 'câmbio inválido',
  '43|46': 'campo "adaptado para deficientes" inválido (S ou N)',
  '43|47': 'campo "alienado" inválido (S ou N)',
  '43|48': 'campo "blindado" inválido (S ou N)',
  '43|49': 'campo "IPVA pago" inválido (S ou N)',
  '43|50': 'campo "garantia de fábrica" inválido (S ou N)',
  '43|51': 'campo "licenciado" inválido (S ou N)',
  '43|52': 'campo "revisado" inválido (S ou N)',
  '43|53': 'campo "revisões na concessionária" inválido (S ou N)',
  '43|54': 'campo "único dono" inválido (S ou N)',
  '43|55': 'tipo do anúncio inválido (U ou N)',
  '43|56': 'a modalidade escolhida não vale para esta loja ou tipo de anúncio',
  '43|57': 'o tipo do anúncio não pode ser alterado',
  '43|58': 'falta o motivo da exclusão',
  '43|62': 'número de portas inválido',
  '43|63': 'combustível inválido',
  '43|64': 'cor inválida',
  '43|65': 'a descrição tem código HTML',
  '43|66': 'o preço está fora do praticado pelo mercado (tabelas Webmotors e FIPE)',
  '43|67': 'preço de revenda inválido',
  '43|68': 'quilometragem não permitida',
  '43|69': 'a foto não é deste anúncio',
  '43|70': 'falta a marca',
  '43|71': 'falta o modelo',
  '43|72': 'falta a versão',
  '43|73': 'falta a cor',
  '43|74': 'falta a placa',
  '43|75': 'falta o câmbio',
  '43|76': 'falta o número de portas',
  '43|77': 'falta o combustível',
  '43|78': 'falta o preço de venda',
  '43|79': 'um campo tem número inválido',
  '43|80': 'a loja está bloqueada na Webmotors',
  '43|82': 'neste anúncio só o preço pode ser alterado',
  '43|84': 'placa inválida',
  '43|85': 'ano de fabricação inválido',
  '43|97': 'a descrição passou de 1.500 caracteres',
  '43|102': 'preço de venda acima do permitido pela tabela FIPE',
  '43|104': 'o preço de revenda está fora do praticado pelo mercado',
  '43|105': 'preço de revenda acima do permitido pela tabela FIPE',
  '43|106': 'falta o código do anúncio',
  '43|107': 'a quilometragem só pode aumentar em relação à cadastrada',
  '43|112': 'ano de fabricação inválido',
}

export function wmReturnText(codes) {
  const list = [].concat(codes || []).map(clean).filter(Boolean)
  const known = list.filter((c) => WM_RETURN_TEXTS[c])
  const parts = [...new Set(known.map((c) => WM_RETURN_TEXTS[c]))]
  if (parts.length) parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1)
  const text = parts.length ? `${parts.join('; ')} (código ${known.join(', ')})` : ''
  const unknown = list.filter((c) => !WM_RETURN_TEXTS[c])
  const rest = unknown.length ? `a Webmotors recusou (código ${unknown.join(', ')})` : ''
  return [text, rest].filter(Boolean).join('; ') || 'a Webmotors recusou o pedido'
}
