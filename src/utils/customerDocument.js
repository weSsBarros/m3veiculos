// Documento do cliente: CPF (pessoa física) ou CNPJ (pessoa jurídica), no mesmo campo
// customers.document. O tipo sai do número: 14 números = CNPJ. Regras testadas em
// tests/customerDocument.test.js.
import { isValidCnpj, onlyDigits } from './fiscal.js'

export const PERSON_TYPES = [
  { value: 'pf', label: 'Pessoa física' },
  { value: 'pj', label: 'Pessoa jurídica' },
]

export function personTypeOf(document) {
  return onlyDigits(document).length > 11 ? 'pj' : 'pf'
}

// "CPF" ou "CNPJ", pelo número cadastrado
export function documentLabel(document) {
  return personTypeOf(document) === 'pj' ? 'CNPJ' : 'CPF'
}

// Confere o documento antes de salvar: '' = pode salvar. O CPF continua opcional; a
// pessoa jurídica precisa do CNPJ (é ele que diz que o cliente é empresa).
export function customerDocumentError(personType, document) {
  if (personType !== 'pj') return ''
  const digits = onlyDigits(document)
  if (!digits) return 'Informe o CNPJ da empresa.'
  if (digits.length !== 14) return 'O CNPJ precisa ter 14 números.'
  if (!isValidCnpj(digits)) return 'CNPJ inválido: confira os números.'
  return ''
}
