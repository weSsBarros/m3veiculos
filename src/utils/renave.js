// RENAVE (seção 55): a loja registra a entrada e a saída de cada carro no
// RENAVE, pela integradora contratada. Enquanto a integração não fica pronta,
// a equipe marca no cadastro do carro e o painel avisa o que falta.

export const RENAVE_STATUSES = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'registrado', label: 'Registrada' },
  { value: 'dispensado', label: 'Não precisa' },
]

// Fim do prazo da Resolução Contran 1.026/2026: carro vendido antes disso
// (ou sem data de venda) não vira pendência
export const RENAVE_SINCE = '2026-09-28'

function soldBeforeRenave(car) {
  return car.status === 'vendido' && (!car.soldAt || String(car.soldAt).slice(0, 10) < RENAVE_SINCE)
}

// Entrada pendente: carro ainda não registrado (nem dispensado)
export function renaveEntryPending(car) {
  return (car.renaveEntryStatus || 'pendente') === 'pendente' && !soldBeforeRenave(car)
}

// Saída pendente: só depois de vendido
export function renaveExitPending(car) {
  return car.status === 'vendido' && (car.renaveExitStatus || 'pendente') === 'pendente' && !soldBeforeRenave(car)
}

export function renavePending(car) {
  return renaveEntryPending(car) || renaveExitPending(car)
}

// Contagens para as pendências do início
export function renaveGaps(cars) {
  return {
    entry: cars.filter(renaveEntryPending).length,
    exit: cars.filter(renaveExitPending).length,
  }
}

// Texto curto do que falta no carro ('' = nada)
export function renavePendingLabel(car) {
  const entry = renaveEntryPending(car)
  const exit = renaveExitPending(car)
  if (entry && exit) return 'RENAVE: entrada e saída'
  if (entry) return 'RENAVE: entrada'
  if (exit) return 'RENAVE: saída'
  return ''
}
