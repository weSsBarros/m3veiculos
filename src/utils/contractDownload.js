import { buildContractTitle, buildContractParagraphs, buildContractSignatures } from './contractTemplate.js'
import { buildReceiptTitle, buildReceiptParagraphs, buildReceiptSignatures } from './receiptTemplate.js'
import { generateContractPdf } from './contractPdf.js'
import { generateContractDocx } from './contractDocx.js'
import { slugify } from './carFormat.js'
import { buildContractTemplateData } from './contractTemplateTags.js'
import { fillContractTemplate, fillContractTemplateBlob } from './fillContractTemplate.js'
import { downloadContractTemplateFile } from '../lib/contractTemplatesApi.js'

// O retrato dos dados guardado no momento da geração (histórico em "contracts")
function savedParts(contract) {
  const sale = {
    price: contract.salePrice,
    paymentMethod: contract.paymentMethod,
    paymentDetails: contract.paymentDetails,
    date: contract.saleDate,
    city: contract.saleCity,
    notes: contract.notes,
  }
  return { company: contract.company, buyer: contract.buyer, vehicle: contract.vehicle, sale }
}

function baseName(contract) {
  const isReceipt = contract.documentType === 'recibo'
  return `${isReceipt ? 'recibo' : 'contrato'}-${slugify(contract.buyer.name || '') || 'documento'}`
}

function standardDocument(contract, parts, logo) {
  const isReceipt = contract.documentType === 'recibo'
  return {
    title: isReceipt ? buildReceiptTitle() : buildContractTitle(),
    paragraphs: isReceipt ? buildReceiptParagraphs(parts) : buildContractParagraphs(parts, { createdAt: contract.createdAt }),
    signatures: isReceipt ? buildReceiptSignatures(parts) : buildContractSignatures(parts),
    logo,
  }
}

async function templateFile(contract) {
  try {
    return await downloadContractTemplateFile(contract.templateFilePath)
  } catch {
    throw new Error('O modelo usado neste contrato foi excluído.')
  }
}

// Baixa de novo um contrato ou recibo já gerado. Contrato feito com modelo
// próprio sai de novo no mesmo modelo (e na mesma versão), em Word.
export async function downloadSavedContract(contract, format, logo) {
  const parts = savedParts(contract)
  if (contract.templateFilePath) {
    const file = await templateFile(contract)
    await fillContractTemplate(file, buildContractTemplateData(parts), `${baseName(contract)}.docx`)
    return
  }
  const data = { ...standardDocument(contract, parts, logo), filename: `${baseName(contract)}.${format}` }
  if (format === 'pdf') await generateContractPdf(data)
  else await generateContractDocx(data)
}

// O arquivo de um contrato já gerado, para mandar assinar: PDF no modelo do
// sistema, Word no modelo próprio. Devolve { blob, fileName }.
export async function buildSavedContractFile(contract, logo) {
  const parts = savedParts(contract)
  if (contract.templateFilePath) {
    const file = await templateFile(contract)
    return { blob: await fillContractTemplateBlob(file, buildContractTemplateData(parts)), fileName: `${baseName(contract)}.docx` }
  }
  const fileName = `${baseName(contract)}.pdf`
  const blob = await generateContractPdf({ ...standardDocument(contract, parts, logo), filename: fileName, asBlob: true })
  return { blob, fileName }
}

// Nome do documento na assinatura: tipo, carro e cliente
export function savedContractTitle(contract) {
  const kind = contract.documentType === 'recibo' ? 'Recibo de venda' : 'Contrato de compra e venda'
  const car = [contract.vehicle?.brand, contract.vehicle?.model].filter(Boolean).join(' ')
  return [kind, car, contract.buyer?.name].filter(Boolean).join(' · ')
}
