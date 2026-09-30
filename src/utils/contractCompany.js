// Dados da loja (vendedora) usados nos documentos: contrato, recibo de venda,
// termo de entrega e recibo de parcela. Ficam guardados no navegador, a partir
// do que foi preenchido na tela Contratos.

const COMPANY_STORAGE_KEY = 'domveiculos_contract_company'

export const EMPTY_COMPANY = { name: '', document: '', address: '', phone: '', email: '' }

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

// Para documentos gerados fora da tela Contratos: usa o que está guardado e,
// sem nome guardado, o nome da loja cadastrado no sistema.
export function companyForDocuments(fallbackName = '') {
  const stored = loadStoredCompany()
  return { ...stored, name: stored.name || fallbackName }
}
