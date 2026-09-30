import { formatCurrencyCents, formatDateBR, slugify } from './carFormat.js'
import { summarizeFinancing } from './financing.js'
import { generateContractPdf } from './contractPdf.js'
import { loadContractLogo } from './contractLogo.js'

// Recibo de pagamento de parcela do financiamento próprio da loja.

function formatDateExtended(isoDate) {
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function buildInstallmentReceiptParagraphs({ company, customer, financing, installment }) {
  const summary = summarizeFinancing(financing)
  const vehicle = `${financing.vehicleLabel || 'veículo'}${financing.vehiclePlate ? ` (placa ${financing.vehiclePlate.toUpperCase()})` : ''}`
  const paragraphs = []

  paragraphs.push(
    `${company.name || 'A loja'}` +
      `${company.document ? `, inscrita no CNPJ sob o nº ${company.document}` : ''}` +
      `, declara ter recebido de ${financing.customerName}` +
      `${customer?.document ? `, CPF/CNPJ nº ${customer.document}` : ''}` +
      `, a quantia de ${formatCurrencyCents(installment.paidAmount)}, referente ao pagamento da parcela ${installment.number} de ${financing.installmentsCount} do financiamento do ${vehicle}, com vencimento em ${formatDateBR(installment.dueDate)}.`
  )

  const lines = [`Valor da parcela: ${formatCurrencyCents(installment.amount)}`]
  if (installment.lateCharges) lines.push(`Multa e juros por atraso: ${formatCurrencyCents(installment.lateCharges)}`)
  const discount = installment.amount + (installment.lateCharges || 0) - installment.paidAmount
  if (discount >= 0.01) lines.push(`Desconto: ${formatCurrencyCents(discount)}`)
  lines.push(`Total recebido: ${formatCurrencyCents(installment.paidAmount)}`)
  lines.push(`Data do pagamento: ${formatDateBR(installment.paidOn)}`)
  if (installment.paymentMethod) lines.push(`Forma de pagamento: ${installment.paymentMethod}`)
  paragraphs.push(`PAGAMENTO\n${lines.join('\n')}`)

  const remaining = summary.count - summary.paidCount
  paragraphs.push(
    remaining > 0
      ? `SITUAÇÃO DO FINANCIAMENTO\n${summary.paidCount} de ${summary.count} parcelas pagas. Restam ${remaining} ${remaining === 1 ? 'parcela' : 'parcelas'}, totalizando ${formatCurrencyCents(summary.open)} (sem multa e juros).`
      : 'SITUAÇÃO DO FINANCIAMENTO\nCom este pagamento, todas as parcelas do financiamento estão quitadas.'
  )

  paragraphs.push(`Emitido em ${formatDateExtended(installment.paidOn)}.`)

  return paragraphs
}

export async function generateInstallmentReceiptPdf(params) {
  const logo = await loadContractLogo()
  const slug = slugify(params.financing.customerName || '') || 'cliente'
  await generateContractPdf({
    title: 'RECIBO DE PAGAMENTO DE PARCELA',
    paragraphs: buildInstallmentReceiptParagraphs(params),
    signatures: [{ role: 'RECEBEDOR', name: params.company.name || '' }],
    filename: `recibo-parcela-${params.installment.number}-${slug}.pdf`,
    logo,
    headingPrefixes: ['PAGAMENTO', 'SITUAÇÃO DO FINANCIAMENTO'],
  })
}
