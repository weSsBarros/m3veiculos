import { formatCurrencyCents } from './carFormat.js'

// Comissão por faixa de valor da venda (seção 82). Cada faixa vale "até" um valor
// (inclusive); a faixa sem "até" (upTo = null) vale para o que passar da maior.
// Ex.: até R$ 30.000 = R$ 300; até R$ 70.000 = R$ 500; acima = R$ 1.000.
// A mesma regra do banco (commission_band_amount), para a prévia na janela da venda.

// Faixas na ordem: as de "até" do menor para o maior e a "acima" no fim
export function sortBands(bands) {
  return [...(bands || [])].sort((a, b) => {
    if (a.upTo == null && b.upTo == null) return 0
    if (a.upTo == null) return 1
    if (b.upTo == null) return -1
    return a.upTo - b.upTo
  })
}

// Faixa em que o valor da venda cai (nenhuma = null)
export function bandFor(bands, price) {
  if (price == null || Number.isNaN(Number(price))) return null
  return sortBands(bands).find((band) => band.upTo == null || Number(price) <= band.upTo) || null
}

// Comissão de quem recebe "Pela faixa de valor" (sem faixa = 0)
export function bandCommission(bands, price) {
  return bandFor(bands, price)?.amount ?? 0
}

// Texto da faixa: "Até R$ 30.000,00", "De R$ 30.000,01 a R$ 70.000,00", "Acima de R$ 70.000,00"
export function bandRangeLabel(bands, band) {
  const sorted = sortBands(bands)
  const index = sorted.findIndex((b) => b === band || (band.id && b.id === band.id))
  const previous = index > 0 ? sorted[index - 1] : null
  if (band.upTo == null) return previous ? `Acima de ${formatCurrencyCents(previous.upTo)}` : 'Qualquer valor'
  if (!previous) return `Até ${formatCurrencyCents(band.upTo)}`
  return `De ${formatCurrencyCents(previous.upTo + 0.01)} a ${formatCurrencyCents(band.upTo)}`
}

// Problema para salvar a faixa (null = pode salvar)
export function bandProblem(bands, band) {
  const others = (bands || []).filter((b) => b.id !== band.id)
  if (band.amount == null || Number.isNaN(band.amount) || band.amount < 0) return 'Informe o valor da comissão da faixa.'
  if (band.upTo == null) {
    return others.some((b) => b.upTo == null) ? 'Já existe a faixa "acima". Edite a que já existe.' : null
  }
  if (Number.isNaN(band.upTo) || band.upTo <= 0) return 'Informe até que valor de venda vale a faixa.'
  if (others.some((b) => b.upTo === band.upTo)) return 'Já existe uma faixa até esse valor.'
  return null
}
