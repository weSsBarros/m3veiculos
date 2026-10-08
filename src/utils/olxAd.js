// Anúncio da OLX (seção 59): monta o anúncio de um carro no formato da API de
// importação da OLX (autoupload), diz o que falta para publicar e sugere a
// marca, o modelo e a versão do catálogo da OLX. Documentação:
// developers.olx.com.br/anuncio/api (carros: categoria 2020; motos: 2060).
// Código puro, sem imports: o mesmo texto vai copiado dentro da Edge Function
// olx-oauth (o teste tests/olxAd.test.js confere que a cópia é idêntica).

export const OLX_CATEGORY_CAR = 2020
export const OLX_CATEGORY_MOTO = 2060
export const OLX_MAX_IMAGES = 20

function clean(value) {
  return String(value ?? '').trim()
}

// Minúsculo e sem acento (para procurar palavras nos destaques)
function plain(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Maiúsculo, sem acento, só letras, números e espaço; "1,0" e "1.0" viram "1.0"
export function olxNormalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/(\d)[.,](\d)/g, '$1#$2')
    .replace(/\+/g, ' PLUS ')
    .replace(/[^A-Z0-9#]+/g, ' ')
    .replace(/#/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

// O id do anúncio na OLX aceita até 19 letras e números: sai do id do carro
export function olxAdId(carId) {
  return clean(carId).replace(/[^A-Za-z0-9]/g, '').slice(0, 19)
}

// Placa em maiúsculas, sem hífen (antiga ABC1234 ou Mercosul ABC1D23)
export function olxPlate(plate) {
  const value = clean(plate).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value) ? value : ''
}

// Telefone com DDD, 10 ou 11 números, sem o 55 do Brasil
export function olxPhone(phone) {
  let digits = clean(phone).replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2)
  return digits.length === 10 || digits.length === 11 ? digits : ''
}

export function olxZip(zip) {
  const digits = clean(zip).replace(/\D/g, '')
  return digits.length === 8 ? digits : ''
}

// Telefone do anúncio: o WhatsApp da pessoa que atende o carro (ativa e com
// telefone) ou, sem ela, o número principal da loja. sellerPhones: { id: telefone }.
export function olxContactPhone(car, sellerPhones = {}, mainPhone = '') {
  const own = car.whatsappSellerId ? olxPhone(sellerPhones[car.whatsappSellerId]) : ''
  return own || olxPhone(mainPhone)
}

// Ano modelo ("2022/2023" → 2023). Antes de 1980 a OLX usa faixas de 5 anos.
export function olxYear(car) {
  const fromText = clean(car.modelYear).match(/(\d{4})\s*$/)
  const year = fromText ? Number(fromText[1]) : Number(car.year)
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return ''
  if (year >= 1980) return String(year)
  for (const start of [1975, 1970, 1965, 1960, 1955]) if (year >= start) return String(start)
  return '1950'
}

export function olxCategory(car) {
  return car.category === 'moto' ? OLX_CATEGORY_MOTO : OLX_CATEGORY_CAR
}

export function olxSubject(car) {
  const text = [car.brand, car.model, car.version].map(clean).filter(Boolean).join(' ').replace(/\s+/g, ' ')
  return (text.length >= 2 ? text : 'Veículo').slice(0, 90).trim()
}

function thousands(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// Descrição: a do carro (ou um texto com os dados, se estiver vazia) e o texto
// padrão da loja no fim
export function olxBody(car, settings = {}) {
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
    text = [olxSubject(car), facts.join(' · '), highlights.map((h) => `- ${h}`).join('\n')].filter(Boolean).join('\n\n')
  }
  const footer = clean(settings.footer)
  if (footer) text = `${text}\n\n${footer}`
  return text.slice(0, 6000)
}

// Fotos: as do site (/uploads/carros/<nome>.webp) vão pela cópia em JPG, que o
// site gera na primeira vez (api/foto-jpg.php), porque a OLX não aceita WebP
export function olxImageUrl(url, siteUrl) {
  const site = clean(siteUrl).replace(/\/+$/, '')
  const value = clean(url)
  const local = /^\/uploads\/carros\/([A-Za-z0-9-]{8,64})\.(webp|jpg|jpeg|png)$/i.exec(value)
  if (local) {
    if (!/^https?:\/\//.test(site)) return null
    return local[2].toLowerCase() === 'webp' ? `${site}/uploads/carros/jpg/${local[1]}.jpg` : `${site}${value}`
  }
  if (/^https?:\/\/\S+\.(jpe?g|png|gif)(\?\S*)?$/i.test(value)) return value
  return null
}

export function olxImages(car, siteUrl) {
  const out = []
  for (const url of car.images || []) {
    const image = olxImageUrl(url, siteUrl)
    if (image && !out.includes(image)) out.push(image)
    if (out.length === OLX_MAX_IMAGES) break
  }
  return out
}

// Por que o carro não vai para a OLX (vazio = vai). Só os disponíveis, visíveis
// no site, fora do repasse e marcados "Publicar na OLX" (decisão do Wesley).
export function olxOutReason(car) {
  if (car.olxPublish === false) return 'Desmarcado para a OLX'
  if (car.entryType === 'repasse') return 'Repasse'
  if (car.status === 'vendido') return 'Vendido'
  if (car.status === 'reservado') return 'Reservado'
  if (car.status === 'manutencao') return 'Em manutenção'
  if (car.status !== 'disponivel') return 'Fora de venda'
  if (car.hidden) return 'Oculto do site'
  return ''
}

export function olxEligible(car) {
  return !olxOutReason(car)
}

export const OLX_MISSING_LABELS = {
  placa: 'placa',
  catalogo: 'marca, modelo e versão da OLX',
  cilindrada: 'cilindrada da OLX',
  preco: 'preço',
  ano: 'ano',
  foto: 'foto',
  cep: 'CEP da loja (Configurações → Dados fiscais)',
  telefone: 'telefone (número principal da loja ou WhatsApp do carro)',
}

// ctx: { siteUrl, zip, phone (já escolhido por olxContactPhone), settings }
export function olxMissing(car, ctx = {}) {
  const moto = car.category === 'moto'
  const cat = car.olxCatalog || {}
  const missing = []
  if (!moto && !olxPlate(car.plate)) missing.push('placa')
  if (!cat.brandId || !cat.modelId || (!moto && !cat.versionId)) missing.push('catalogo')
  if (moto && !cat.ccId) missing.push('cilindrada')
  if (!(Number(car.price) > 0)) missing.push('preco')
  if (!olxYear(car)) missing.push('ano')
  if (olxImages(car, ctx.siteUrl).length === 0) missing.push('foto')
  if (!olxZip(ctx.zip)) missing.push('cep')
  if (!olxPhone(ctx.phone)) missing.push('telefone')
  return missing
}

// -- Parâmetros da OLX ------------------------------------------------------------

const CAR_FUEL = [['flex', '3'], ['gasolina', '1'], ['alcool', '2'], ['etanol', '2'], ['diesel', '5'], ['hibrido', '6'], ['eletrico', '7']]
const MOTO_FUEL = [['flex', '3'], ['gasolina', '1'], ['alcool', '2'], ['etanol', '2'], ['diesel', '4'], ['hibrido', '5'], ['eletrico', '6']]
const COLORS = [['pret', '1'], ['branc', '2'], ['prat', '3'], ['vermelh', '4'], ['cinz', '5'], ['grafit', '5'], ['chumb', '5'],
  ['azul', '6'], ['amarel', '7'], ['verde', '8'], ['laranj', '9']]
const CAR_TYPES = { suv: '5', sedan: '8', hatch: '9', picape: '3' }

const CAR_FEATURES = [
  ['1', /ar[ -]?condicionado|ar digital|ar automatico|climatiza/],
  ['3', /vidros? eletric/],
  ['4', /travas? eletric/],
  ['5', /air ?bags?/],
  ['6', /alarme/],
  ['7', /\bsom\b|multimidia|\bradio\b|android auto|carplay/],
  ['8', /sensor(es)? de (re|estacionamento)/],
  ['9', /camera de re/],
  ['10', /blindad/],
  ['11', /couro/],
  ['12', /computador de bordo/],
  ['13', /\busb\b/],
  ['14', /volante multifuncional/],
  ['15', /bluetooth/],
  ['16', /\bgps\b|navegador/],
  ['17', /piloto automatico|controle (automatico )?de (velocidade|cruzeiro)|cruise/],
  ['18', /rodas? (de )?liga/],
  ['19', /teto solar|teto panoramico/],
  ['20', /4x4|tracao integral|\bawd\b|\b4wd\b/],
]

const MOTO_FEATURES = [
  ['1', /\babs\b/],
  ['2', /computador de bordo|painel digital/],
  ['3', /escapamento esportivo|ponteira/],
  ['4', /\bbau\b|bauleto|alforge|bolsa/],
  ['5', /contra ?peso/],
  ['6', /alarme/],
  ['7', /amortecedor de direcao/],
  ['8', /neblina|farol de milha/],
  ['9', /\bgps\b|navegador/],
  ['10', /\bsom\b/],
]

function gearbox(transmission, moto) {
  const t = plain(transmission)
  if (!t) return ''
  if (t.includes('manual')) return '1'
  if (t.includes('semi')) return '3'
  if (!moto && t.includes('automatizad')) return '4'
  if (t.includes('autom') || t.includes('cvt')) return '2'
  return ''
}

function fuelCode(fuel, moto) {
  const f = plain(fuel)
  const found = (moto ? MOTO_FUEL : CAR_FUEL).find(([name]) => f.includes(name))
  return found ? found[1] : ''
}

function colorCode(color) {
  const c = plain(color)
  if (!c) return ''
  const found = COLORS.find(([name]) => c.includes(name))
  return found ? found[1] : '10'
}

function doorsCode(doors) {
  const n = Number(doors)
  if (n === 2) return '1'
  if (n === 3) return '3'
  if (n === 4 || n === 5) return '2'
  return ''
}

// Motor pelo texto da versão ("XEi 2.0 Flex" → 2.0)
function motorpower(version) {
  const m = clean(version).match(/(?:^|[^\d.,])(\d)[.,](\d)(?!\d)/)
  if (!m) return ''
  const value = Number(`${m[1]}.${m[2]}`)
  if (value >= 4) return '12'
  if (value >= 3) return '11'
  if (value >= 2) return '10'
  const codes = { '1': '1', '1.2': '2', '1.3': '3', '1.4': '4', '1.5': '5', '1.6': '6', '1.7': '7', '1.8': '8', '1.9': '9' }
  return codes[String(value)] || ''
}

function steering(text) {
  if (/direcao eletro[- ]?hidraulica/.test(text)) return '5'
  if (/direcao eletrica/.test(text)) return '2'
  if (/direcao hidraulica/.test(text)) return '1'
  if (/direcao mecanica/.test(text)) return '3'
  if (/direcao assistida/.test(text)) return '4'
  return ''
}

function ownerCode(condition) {
  const c = plain(condition)
  if (!c) return ''
  if (c.includes('unico')) return '1'
  if (c.includes('segundo') || c.includes('terceiro')) return '2'
  return ''
}

// Monta o anúncio (sem o access_token). Devolve { ad: null, missing } quando
// falta algum dado obrigatório.
export function buildOlxAd(car, ctx = {}) {
  const missing = olxMissing(car, ctx)
  if (missing.length) return { ad: null, missing }
  const moto = car.category === 'moto'
  const cat = car.olxCatalog
  const settings = ctx.settings || {}
  const text = plain((car.highlights || []).join(' \n '))

  const params = {
    vehicle_brand: String(cat.brandId),
    vehicle_model: String(cat.modelId),
  }
  if (cat.versionId) params.vehicle_version = String(cat.versionId)
  if (moto) params.cubiccms = String(cat.ccId)
  params.regdate = olxYear(car)
  params.mileage = Math.max(0, Math.round(Number(car.km) || 0))
  if (!moto) params.vehicle_tag = olxPlate(car.plate)

  const gear = gearbox(car.transmission, moto)
  if (gear) params.gearbox = gear
  // A moto exige o combustível; GNV no carro vira "kit GNV" (o código 4 saiu)
  const fuel = fuelCode(car.fuel, moto)
  if (fuel || moto) params.fuel = fuel || '1'
  if (!moto && plain(car.fuel).includes('gnv')) params.gnv_kit = '1'
  const color = colorCode(car.color)
  if (color) params.carcolor = color
  if (!moto) {
    const doors = doorsCode(car.doors)
    if (doors) params.doors = doors
    if (CAR_TYPES[car.category]) params.cartype = CAR_TYPES[car.category]
    const power = motorpower(car.version)
    if (power) params.motorpower = power
    const steer = steering(text)
    if (steer) params.car_steering = steer
  }
  const features = (moto ? MOTO_FEATURES : CAR_FEATURES).filter(([, re]) => re.test(text)).map(([code]) => code)
  if (features.length) params[moto ? 'moto_features' : 'car_features'] = features
  const owner = ownerCode(car.condition)
  if (owner) params.owner = owner
  if (settings.exchange === 'sim') params.exchange = '1'
  if (settings.exchange === 'nao') params.exchange = '2'
  if (!moto) {
    if (/chave reserva/.test(text)) params.extra_key = '1'
    if (/manual do proprietario|com manual|manual e chave/.test(text)) params.owner_manual = '1'
    if (/revis(ad[oa]s?|oes)( feitas)? (na|em|pela) concessionaria/.test(text)) params.dealership_review = '1'
    if (/garantia de fabrica|na garantia/.test(text)) params.warranty = '1'
  }

  const ad = {
    id: olxAdId(car.id),
    operation: 'insert',
    category: olxCategory(car),
    subject: olxSubject(car),
    body: olxBody(car, settings),
    phone: Number(olxPhone(ctx.phone)),
    type: 's',
    price: Math.round(Number(car.price)),
    zipcode: olxZip(ctx.zip),
    params,
    images: olxImages(car, ctx.siteUrl),
  }
  return { ad, missing: [] }
}

// Linha do banco (cars) no formato do painel
export function olxCarFromRow(row) {
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
    highlights: row.highlights || [],
    description: row.description || '',
    images: row.images || [],
    status: row.status,
    hidden: Boolean(row.hidden),
    plate: row.plate || '',
    entryType: row.entry_type || 'showroom',
    whatsappSellerId: row.whatsapp_seller_id || null,
    olxPublish: row.olx_publish !== false,
    olxCatalog: row.olx_catalog || {},
  }
}

// -- Mensagens da OLX ---------------------------------------------------------------

const OLX_ERRORS = {
  UNDEFINED_AD_ID: 'anúncio sem identificação',
  NO_IMAGE: 'anúncio sem fotos',
  NO_REGION: 'CEP inválido para a OLX',
  ERROR_FUEL_4_DEPRECATED: 'combustível inválido',
  ERROR_FINANCIAL_INVALID: 'situação financeira inválida',
  ERROR_CAR_FEATURE_2_INVALID: 'opcional inválido',
  ERROR_CAR_TYPE_1_OR_4_INVALID: 'tipo de carro inválido',
  ERROR_VEHICLE_TAG_INVALID: 'placa inválida',
  ERROR_VEHICLE_BRAND_INVALID: 'marca inválida no catálogo da OLX',
  ERROR_VEHICLE_MODEL_INVALID: 'modelo inválido no catálogo da OLX',
  ERROR_VEHICLE_VERSION_INVALID: 'versão inválida no catálogo da OLX',
  ERROR_VEHICLE_BRAND_MODEL_VERSION_INVALID: 'marca, modelo e versão não batem com o catálogo da OLX',
  INVALID_PLATE: 'a OLX não encontrou a placa (ou a consulta de placas estava fora do ar)',
  ERROR_IMAGE_TOO_SMALL: 'foto pequena demais',
  ERROR_DOWNLOADING_IMAGE: 'a OLX não conseguiu baixar as fotos',
  ERROR_UPLOADING_IMAGE: 'erro da OLX ao guardar as fotos',
  ERROR_VIDEOS_URL_INVALID: 'link de vídeo inválido',
  NOT_ENOUGH_AD_SLOTS: 'sem vaga no plano da OLX',
  REFUSED_SUSPECT_CATEGORY: 'recusado pela OLX: categoria suspeita',
  REFUSED_SUSPECT_REGION: 'recusado pela OLX: região suspeita',
  REFUSED_DENOUNCE: 'recusado pela OLX: denúncia',
  REFUSED_DENOUNCED: 'recusado pela OLX: denúncia',
  REFUSED_SUSPECT_AUTOS: 'recusado pela OLX: veículo suspeito',
  REFUSED_SUSPECT_DUPLICATES: 'recusado pela OLX: anúncio duplicado',
  REFUSED_SUSPECT_PRICE: 'recusado pela OLX: preço fora do esperado',
  REFUSED_SUSPECT_LINK_TAGS: 'recusado pela OLX: link ou contato na descrição',
  REFUSED_SUSPECT_CART: 'recusado pela OLX: telefone suspeito',
  REFUSED_SUSPECT_EMAIL: 'recusado pela OLX: e-mail suspeito',
  REFUSED_SUSPECT_IP: 'recusado pela OLX: acesso suspeito',
  REFUSED_SUSPECT_USER: 'recusado pela OLX: conta suspeita',
  REFUSED_SUSPECT_FRAUD: 'recusado pela OLX: suspeita de fraude',
  REFUSED_SUSPECT_ITEMS: 'recusado pela OLX: item proibido',
  AUTOS_FRAUD_MODEL: 'recusado pela OLX: suspeita de fraude',
  REFUSED_GENERIC: 'recusado pela OLX',
  GENERIC_REFUSED: 'recusado pela OLX',
}

export function olxErrorText(code) {
  const key = clean(code).toUpperCase()
  return OLX_ERRORS[key] || (key ? `erro da OLX (${key})` : 'erro da OLX')
}

// -- Sugestão do catálogo da OLX -----------------------------------------------------
// Calibrada com o catálogo real da OLX (06/10/2026): nomes de versão como
// "Pick-up LS 2.8 TDI 4X2 CS Dies. Mec.", "Pro4x CD 4X4 2.3 Bi-TB Die. AUT" ou
// "SW4 SRX 4X4 2.8 TDI 16V Dies. Aut." (a SW4 fica dentro do modelo Hilux).

const BRAND_ALIASES = {
  VW: 'VOLKSWAGEN',
  VOLKS: 'VOLKSWAGEN',
  GM: 'CHEVROLET',
  CHEVY: 'CHEVROLET',
  MERCEDES: 'MERCEDES BENZ',
  BENZ: 'MERCEDES BENZ',
  'CAOA CHERY': 'CHERY',
  CAOA: 'CHERY',
  'GREAT WALL': 'GWM',
  HARLEY: 'HARLEY DAVIDSON',
}

// Modelos que a OLX guarda dentro de outro (a versão diz qual é)
const MODEL_ALIASES = { SW4: 'HILUX', 'HILUX SW4': 'HILUX' }

// Grafias da OLX e do cadastro que querem dizer a mesma coisa
const VERSION_REWRITES = [
  [/\bGR[\s-]?S(PORT)?\b/g, ' GRS '],
  [/\bBI[\s-]?(TB|TURBO)\b/g, ' BITURBO '],
  [/\bT[\s-]?GDI\b/g, ' TURBO '],
  [/\bPRO[\s-]?4X\b/g, ' PRO4X '],
  [/\bCAB(INE|\.)?\s*SIMPLES\b/g, ' CS '],
  [/\bCAB(INE|\.)?\s*DUPLA\b/g, ' CD '],
  [/\bCAB(INE|\.)?\s*ESTENDIDA\b/g, ' CE '],
  [/\bF\.?\s?POWER\b/g, ' FLEX '],
  [/\bP(ICK)?[\s.-]?UP\b/g, ' '],
  [/\b\d+\s*LUGARES\b/g, ' '],
  [/\bPLUG[\s-]?IN\b/g, ' '],
]

const VERSION_SYNONYMS = {
  AUTOMATICO: 'AUT', AUTOMATICA: 'AUT', AUTOM: 'AUT', AUT: 'AUT', AT: 'AUT', CVT: 'AUT', TIPTRONIC: 'AUT',
  MANUAL: 'MEC', MT: 'MEC', MEC: 'MEC',
  TB: 'TURBO', TURBO: 'TURBO',
  TDI: ['TURBO', 'DIESEL'],
  DIES: 'DIESEL', DIE: 'DIESEL', DIESEL: 'DIESEL',
  FLEXFUEL: 'FLEX', FLEXPOWER: 'FLEX', TOTALFLEX: 'FLEX', FLEXONE: 'FLEX', FLEX: 'FLEX',
  HYBRID: 'HIBRIDO', HYBRIDO: 'HIBRIDO', HIBRIDO: 'HIBRIDO',
  AWD: '4X4', '4WD': '4X4', '4MOTION': '4X4',
}

// Válvulas, portas, cavalos e siglas de injeção não ajudam a escolher
const NOISE = [/^\d+V$/, /^\dP$/, /^\d+CV$/, /^(MPFI|EFI|INT|INTERC|INTERCOOLER)$/]

// Carroceria na versão não conta como palavra a mais, mas pesa contra quando
// contraria a categoria do cadastro (sedã x hatch)
const BODY_TOKENS = { SEDAN: 'sedan', HATCH: 'hatch' }

const FUEL_TOKENS = [['flex', 'FLEX'], ['diesel', 'DIESEL'], ['hibrido', 'HIBRIDO'], ['eletrico', 'ELETRICO']]

function tokens(value) {
  return olxNormalize(value).split(' ').filter(Boolean)
}

function contains(haystack, needle) {
  return needle !== '' && ` ${haystack} `.includes(` ${needle} `)
}

function versionTokens(value) {
  let text = clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  for (const [re, to] of VERSION_REWRITES) text = text.replace(re, to)
  const out = []
  for (const t of tokens(text)) {
    const mapped = VERSION_SYNONYMS[t] || (/^AT\d$/.test(t) ? 'AUT' : t)
    for (const m of [].concat(mapped)) if (!NOISE.some((re) => re.test(m)) && !out.includes(m)) out.push(m)
  }
  return out
}

// Igual ou abreviado ("ECOBO." = "ECOBOOST"), só em palavras sem número
function tokenIn(t, list) {
  if (list.includes(t)) return true
  if (t.length < 4 || /\d/.test(t)) return false
  return list.some((u) => u.length >= 4 && !/\d/.test(u) && (u.startsWith(t) || t.startsWith(u)))
}

// options: [{ id, name }]; devolve a lista ordenada com a nota (0 a 1)
export function olxRankBrands(brand, options) {
  const q = olxNormalize(brand)
  const alias = BRAND_ALIASES[q] || q
  return rank(options, (name) => {
    const n = olxNormalize(name)
    if (n === q || n === alias) return 1
    if (contains(n, alias) || contains(n, q)) return 0.9
    const optionAlias = BRAND_ALIASES[n]
    if (optionAlias && (optionAlias === q || optionAlias === alias)) return 0.9
    return 0
  })
}

export function olxRankModels(model, options) {
  const q = olxNormalize(model)
  const qt = tokens(model)
  const alias = MODEL_ALIASES[q] || ''
  return rank(options, (name) => {
    const n = olxNormalize(name)
    if (!n) return 0
    if (n === q) return 1
    if (alias && n === alias) return 0.95
    const nt = n.split(' ')
    // A OLX mais detalhada ("ONIX PLUS" para "Onix") ou a nossa ("Corolla Cross" para "COROLLA")
    if (contains(n, q) && nt[0] === qt[0]) return Math.max(0.6, 0.85 - 0.05 * (nt.length - qt.length))
    if (contains(q, n) && nt[0] === qt[0]) return 0.8
    const common = qt.filter((t) => nt.includes(t)).length
    return common ? 0.5 * (common / Math.max(qt.length, nt.length)) : 0
  })
}

function engineOf(list) {
  return list.find((t) => /^\d\.\d$/.test(t)) || ''
}

// Versão: palavras em comum com o cadastro (versão, câmbio, combustível e o que
// o nosso modelo tem a mais que o da OLX, como "Cross" ou "SW4"); o motor vale o
// dobro. Perde nota: motor diferente, palavras sobrando e a versão da OLX que
// começa com outro nome ("SW4…" numa Hilux, "SEL…" num Titanium).
// modelName: o modelo escolhido no catálogo da OLX.
export function olxRankVersions(car, options, modelName = '') {
  const skip = [...versionTokens(car.brand), ...versionTokens(modelName || car.model)]
  const ours = versionTokens(`${modelName ? car.model : ''} ${car.version}`).filter((t) => !skip.includes(t))
  const gear = gearbox(car.transmission, car.category === 'moto')
  if (gear === '1' && !ours.includes('MEC')) ours.push('MEC')
  if (gear === '2' && !ours.includes('AUT')) ours.push('AUT')
  const fuel = FUEL_TOKENS.find(([name]) => plain(car.fuel).includes(name))
  if (fuel && !ours.includes(fuel[1])) ours.push(fuel[1])
  const engine = engineOf(ours)
  const weight = (t) => (t === engine ? 2 : 1)
  const total = ours.reduce((sum, t) => sum + weight(t), 0)
  return rankDetailed(options, (name) => {
    const theirs = versionTokens(name).filter((t) => !skip.includes(t))
    if (!total || !theirs.length) return { score: 0, extras: 99, coverage: 0, key: '' }
    const matched = ours.filter((t) => tokenIn(t, theirs)).reduce((sum, t) => sum + weight(t), 0)
    const words = theirs.filter((u) => !BODY_TOKENS[u])
    const extras = words.filter((u) => !ours.some((t) => tokenIn(t, [u]))).length
    let score = matched / (total + 0.25 * extras)
    const theirEngine = engineOf(theirs)
    if (engine && theirEngine && theirEngine !== engine) score *= 0.4
    const body = ['sedan', 'hatch'].includes(car.category) ? car.category : ''
    if (body && theirs.some((u) => BODY_TOKENS[u] && BODY_TOKENS[u] !== body)) score *= 0.7
    const first = words[0]
    if (first && /[A-Z]/.test(first) && first.length >= 3 && !ours.some((t) => tokenIn(t, [first]))) score *= 0.8
    return { score, extras, coverage: matched / total, key: [...theirs].sort().join(' ') }
  })
}

// Cilindrada da moto: o número de "CG 160" ou "Fazer 250" que existir na lista
export function olxRankCc(car, options) {
  const numbers = `${clean(car.model)} ${clean(car.version)}`.match(/\b\d{2,4}\b/g) || []
  return rank(options, (name) => (numbers.includes(olxNormalize(name)) ? 1 : 0))
}

const round3 = (n) => Math.round(n * 1000) / 1000

function rank(options, scoreOf) {
  return rankDetailed(options, (name) => ({ score: scoreOf(name) }))
}

function rankDetailed(options, detailOf) {
  return (options || [])
    .map((o) => {
      const d = detailOf(o.name)
      return { ...d, id: o.id, name: o.name, score: round3(d.score) }
    })
    .sort((a, b) => b.score - a.score || (a.extras ?? 0) - (b.extras ?? 0)
      || String(a.name).length - String(b.name).length || String(a.name).localeCompare(String(b.name)))
}

// Escolhe sozinho só quando a combinação é clara: nota boa e distante da
// segunda; ou, nas versões, duas grafias da mesma versão ou a segunda com
// alguma coisa a mais que o cadastro não diz ("Iconic Plus" para "Iconic")
export function olxConfident(ranked, { min = 0.75, margin = 0.1 } = {}) {
  const [best, second] = ranked || []
  if (!best || best.score < min) return null
  if (!second || best.score - second.score >= margin - 1e-9) return best
  if (best.key && best.key === second.key) return best
  if (best.extras === 0 && second.extras > 0 && best.coverage >= second.coverage - 1e-9) return best
  return null
}
