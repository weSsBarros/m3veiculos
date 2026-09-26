import { formatCurrency } from './carFormat.js'

// Recibo de venda simples — comprovante interno emitido pela loja.
// Não é uma Nota Fiscal Eletrônica (NF-e); serve como documento de quitação
// para o comprador, no mesmo espírito do contrato de compra e venda.

function formatDateExtended(isoDate) {
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function buildReceiptTitle() {
  return 'RECIBO DE VENDA'
}

export function buildReceiptParagraphs({ company, buyer, vehicle, sale }) {
  const vehicleDescription =
    `${vehicle.brand} ${vehicle.model} ${vehicle.version}`.trim() +
    ` — Ano Fab./Modelo: ${vehicle.modelYear || vehicle.year}` +
    `, Cor: ${vehicle.color || '—'}` +
    `, Km: ${vehicle.km != null ? Number(vehicle.km).toLocaleString('pt-BR') : '—'}` +
    `, Placa: ${vehicle.plate || '—'}` +
    `, Chassi: ${vehicle.chassis || '—'}` +
    `, Renavam: ${vehicle.renavam || '—'}`

  const paragraphs = []

  paragraphs.push(
    `${company.name}, inscrita no CNPJ sob o nº ${company.document}` +
      `${company.address ? `, com sede em ${company.address}` : ''}` +
      `, declara ter recebido de ${buyer.name}, portador(a) do CPF/CNPJ nº ${buyer.document}` +
      `${buyer.address ? `, residente e domiciliado(a) em ${buyer.address}` : ''}` +
      `, a quantia de ${formatCurrency(sale.price)}, referente à venda do veículo abaixo descrito, dando a este plena, geral e irrevogável quitação, para nada mais reclamar a qualquer título.`
  )

  paragraphs.push(`Veículo objeto desta venda: ${vehicleDescription}.`)

  paragraphs.push(
    `Forma de pagamento: ${sale.paymentMethod || 'a combinar entre as partes'}.` +
      `${sale.paymentDetails ? ` ${sale.paymentDetails}` : ''}`
  )

  paragraphs.push(
    'Este recibo é um comprovante interno de venda emitido pela loja e não substitui a Nota Fiscal Eletrônica (NF-e), quando exigida por lei.'
  )

  paragraphs.push(`${sale.city || '—'}, ${formatDateExtended(sale.date)}.`)

  return paragraphs
}

export function buildReceiptSignatures({ company, buyer }) {
  return [
    { role: 'VENDEDORA', name: company.name },
    { role: 'COMPRADOR(A)', name: buyer.name },
  ]
}
