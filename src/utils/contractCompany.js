import { companyFromFiscal } from './fiscal.js'

// Dados da loja (vendedora) usados nos documentos: contrato, recibo de venda,
// termo de entrega e recibo de parcela. Vêm dos dados fiscais da loja
// (Configurações, seção 57); sem eles, do que foi preenchido na tela Contratos
// neste navegador.

const COMPANY_STORAGE_KEY = 'domveiculos_contract_company'

export const EMPTY_COMPANY = { name: '', document: '', address: '', phone: '', email: '', city: '' }

export function loadStoredCompany() {
  try {
    const raw = localStorage.getItem(COMPANY_STORAGE_KEY)
    return raw ? { ...EMPTY_COMPANY, ...JSON.parse(raw) } : EMPTY_COMPANY
  } catch {
    return EMPTY_COMPANY
  }
}

export function saveStoredCompany(company) {
  try {
    localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(company))
  } catch {
    // armazenamento indisponível: só não lembra os dados
  }
}

// Dados fiscais carregados com as configurações da loja (fetchCompanySettings)
let fiscalCache = { fiscal: {}, name: '' }

export function rememberCompanyFiscal(fiscal, name) {
  const value = fiscal && typeof fiscal === 'object' && !Array.isArray(fiscal) ? fiscal : {}
  fiscalCache = { fiscal: value, name: name ?? fiscalCache.name }
  return value
}

// Empresa padrão dos documentos: dados fiscais da loja; sem eles, o que está
// guardado no navegador e, sem nome guardado, o nome da loja no sistema.
export function companyForDocuments(fallbackName = '') {
  const fromFiscal = companyFromFiscal(fiscalCache.fiscal, fallbackName || fiscalCache.name)
  if (fromFiscal) return fromFiscal
  const stored = loadStoredCompany()
  return { ...stored, name: stored.name || fallbackName }
}
