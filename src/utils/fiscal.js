// Dados fiscais da loja e endereço em partes (seção 57), preparação da NF-e.
// Regras sem tela e sem banco (testadas em tests/fiscal.test.js).

// Regime tributário (CRT da NF-e). Quem confirma é o contador da loja.
export const CRT_OPTIONS = [
  { value: '1', label: 'Simples Nacional' },
  { value: '2', label: 'Simples Nacional (excesso de sublimite)' },
  { value: '3', label: 'Regime Normal (Lucro Presumido ou Real)' },
  { value: '4', label: 'MEI' },
]

export const ADDRESS_KEYS = ['zip', 'street', 'number', 'complement', 'district', 'city', 'city_code', 'state']

export const onlyDigits = (value) => String(value || '').replace(/\D/g, '')

export function formatCnpj(value) {
  const d = onlyDigits(value).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function formatCep(value) {
  const d = onlyDigits(value).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// CNPJ com os dígitos verificadores certos
export function isValidCnpj(value) {
  const d = onlyDigits(value)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const digit = (base) => {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = base.split('').reduce((acc, n, i) => acc + Number(n) * weights[i], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  const first = digit(d.slice(0, 12))
  const second = digit(d.slice(0, 12) + first)
  return d.endsWith(`${first}${second}`)
}

// Endereço numa linha: "Rua X, 10, Apto 2 - Bairro, Cidade/UF, CEP 65000-000"
export function formatAddress(parts = {}) {
  const p = parts || {}
  const street = [p.street, p.number || (p.street ? 's/n' : ''), p.complement].filter(Boolean).join(', ')
  const place = [street, p.district].filter(Boolean).join(' - ')
  const city = [p.city, p.state].filter(Boolean).join('/')
  const zip = onlyDigits(p.zip).length === 8 ? `CEP ${formatCep(p.zip)}` : ''
  return [place, city, zip].filter(Boolean).join(', ')
}

export function hasAddress(parts = {}) {
  return ADDRESS_KEYS.some((k) => String(parts?.[k] || '').trim() !== '')
}

// Só as chaves do endereço, sem espaços sobrando e sem vazios
export function cleanAddress(parts = {}) {
  const out = {}
  for (const k of ADDRESS_KEYS) {
    let v = String(parts?.[k] || '').trim()
    if (k === 'zip' || k === 'city_code') v = onlyDigits(v)
    if (k === 'state') v = v.toUpperCase()
    if (v) out[k] = v
  }
  return out
}

// Empresa (vendedora) dos documentos a partir dos dados fiscais; null se a
// loja ainda não preencheu razão social nem CNPJ
export function companyFromFiscal(fiscal = {}, fallbackName = '') {
  const f = fiscal || {}
  if (!f.legal_name && !f.cnpj) return null
  return {
    name: f.legal_name || fallbackName,
    document: f.cnpj ? formatCnpj(f.cnpj) : '',
    address: formatAddress(f),
    phone: f.phone || '',
    email: f.email || '',
    city: [f.city, f.state].filter(Boolean).join('/'),
  }
}

// O que falta para a loja emitir NF-e (lista de rótulos; vazia = completo)
export function fiscalMissing(fiscal = {}) {
  const f = fiscal || {}
  const checks = [
    ['legal_name', 'Razão social'],
    ['cnpj', 'CNPJ'],
    ['ie', 'Inscrição Estadual'],
    ['crt', 'Regime tributário'],
    ['zip', 'CEP'],
    ['street', 'Rua'],
    ['number', 'Número'],
    ['district', 'Bairro'],
    ['city', 'Cidade'],
    ['city_code', 'Código IBGE da cidade'],
    ['state', 'UF'],
  ]
  return checks.filter(([k]) => !String(f[k] || '').trim()).map(([, label]) => label)
}
