import { buildContractTitle, buildContractParagraphs, buildContractSignatures } from './contractTemplate.js'
import { buildReceiptTitle, buildReceiptParagraphs, buildReceiptSignatures } from './receiptTemplate.js'
import { generateContractPdf } from './contractPdf.js'
import { generateContractDocx } from './contractDocx.js'
import { slugify } from './carFormat.js'

// Baixa de novo um contrato ou recibo já gerado (histórico em "contracts"),
// a partir do retrato dos dados guardado no momento da geração.
export async function downloadSavedContract(contract, format, logo) {
  const isReceipt = contract.documentType === 'recibo'
  const sale = {
    price: contract.salePrice,
    paymentMethod: contract.paymentMethod,
    paymentDetails: contract.paymentDetails,
    date: contract.saleDate,
    city: contract.saleCity,
    notes: contract.notes,
  }
  const parts = { company: contract.company, buyer: contract.buyer, vehicle: contract.vehicle, sale }
  const data = {
    title: isReceipt ? buildReceiptTitle() : buildContractTitle(),
    paragraphs: isReceipt ? buildReceiptParagraphs(parts) : buildContractParagraphs(parts),
    signatures: isReceipt ? buildReceiptSignatures(parts) : buildContractSignatures(parts),
    filename: `${isReceipt ? 'recibo' : 'contrato'}-${slugify(contract.buyer.name || '') || 'documento'}.${format}`,
    logo,
  }
  if (format === 'pdf') await generateContractPdf(data)
  else await generateContractDocx(data)
}
