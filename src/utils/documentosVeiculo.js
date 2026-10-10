// Placa, chassi e RENAVAM: normaliza o que a pessoa digitou (ou o que veio do
// CRLV-e) e confere o formato. No cadastro do carro um valor fora do padrão só
// gera aviso (decisão do Wesley, 09/10/2026): carros antigos não travam.
// Arquivo sem dependências: também vai copiado para a função veiculo-dados.

const PLATE_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/
// 17 caracteres, sem I, O e Q (não existem no chassi, para não confundir com 1 e 0)
const CHASSIS_RE = /^[A-HJ-NPR-Z0-9]{17}$/

// Placa só com letras e números, em maiúsculas: "abc-1d23" e "ABC1D23" batem
export function normalizePlate(plate) {
  return String(plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Placa antiga (ABC1234) ou Mercosul (ABC1D23)
export function isValidPlate(value) {
  return PLATE_RE.test(normalizePlate(value))
}

export function normalizeChassis(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isValidChassis(value) {
  return CHASSIS_RE.test(normalizeChassis(value))
}

// Só os números; o RENAVAM antigo, de 9 ou 10 dígitos, ganha zeros à esquerda
export function normalizeRenavam(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 9 || digits.length === 10 ? digits.padStart(11, '0') : digits
}

// Dígito verificador: pesos 3 2 9 8 7 6 5 4 3 2 nos 10 primeiros dígitos,
// soma × 10, resto da divisão por 11 (resto 10 vale 0)
export function isValidRenavam(value) {
  const digits = normalizeRenavam(value)
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((total, w, i) => total + w * Number(digits[i]), 0)
  const check = (sum * 10) % 11
  return (check === 10 ? 0 : check) === Number(digits[10])
}

// Avisos do cadastro (campo vazio não é aviso)
export function vehicleDocWarnings({ plate, chassis, renavam }) {
  const warnings = {}
  if (normalizePlate(plate) && !isValidPlate(plate)) {
    warnings.plate = 'Placa fora do padrão (ex.: ABC1234 ou ABC1D23).'
  }
  if (normalizeChassis(chassis) && !isValidChassis(chassis)) {
    warnings.chassis = 'O chassi tem 17 letras e números, sem I, O ou Q.'
  }
  if (String(renavam ?? '').replace(/\D/g, '') && !isValidRenavam(renavam)) {
    warnings.renavam = 'O RENAVAM tem 11 números e o último não confere com os outros.'
  }
  return warnings
}
