import { CHECKLIST_STATUS_LABELS } from './saleChecklist.js'
import { generateContractPdf } from './contractPdf.js'
import { loadContractLogo } from './contractLogo.js'
import { companyForDocuments } from './contractCompany.js'
import { todayISO, slugify } from './carFormat.js'

// Termo de entrega do veículo: o comprador assina ao receber o carro,
// confirmando os itens do checklist. Depois de assinado, a loja anexa o termo
// na ficha do cliente (tipo "Termo de entrega").

function formatDateExtended(isoDate) {
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function vehicleDescription(car) {
  return (
    `${car.brand} ${car.model} ${car.version || ''}`.trim() +
    ` — Ano Fab./Modelo: ${car.modelYear || car.year || '—'}` +
    `, Cor: ${car.color || '—'}` +
    `, Km: ${car.km != null && car.km !== '' ? Number(car.km).toLocaleString('pt-BR') : '—'}` +
    `, Placa: ${car.plate ? car.plate.toUpperCase() : '—'}` +
    `, Chassi: ${car.chassis || '—'}` +
    `, Renavam: ${car.renavam || '—'}`
  )
}

export function buildDeliveryTermParagraphs({ company, buyer, car, checklist, saleDate, deliveryDate, transferResponsible, city }) {
  const paragraphs = []
  const buyerName = buyer?.name || '_______________________________________'
  const buyerDoc = buyer?.document || '____________________'

  paragraphs.push(
    `Pelo presente termo, ${company.name || 'a loja vendedora'}` +
      `${company.document ? `, inscrita no CNPJ sob o nº ${company.document}` : ''}` +
      `${company.address ? `, com sede em ${company.address}` : ''}` +
      `, doravante denominada VENDEDORA, entrega a ${buyerName}, portador(a) do CPF/CNPJ nº ${buyerDoc}` +
      `${buyer?.address ? `, residente e domiciliado(a) em ${buyer.address}` : ''}` +
      `, doravante denominado(a) COMPRADOR(A), o veículo abaixo descrito` +
      `${saleDate ? `, adquirido em ${formatDateExtended(saleDate)}` : ''}.`
  )

  paragraphs.push(`VEÍCULO\n${vehicleDescription(car)}.`)

  if (checklist.length > 0) {
    const lines = checklist.map((entry) => `• ${entry.item}: ${entry.status ? CHECKLIST_STATUS_LABELS[entry.status] : 'não conferido'}`)
    paragraphs.push(`ITENS CONFERIDOS NA ENTREGA\n${lines.join('\n')}`)
  }

  paragraphs.push(
    'DECLARAÇÃO\nO(A) COMPRADOR(A) declara ter recebido o veículo e os itens acima, tendo vistoriado o veículo e conferido o seu estado de conservação, a quilometragem e o funcionamento.'
  )

  paragraphs.push(
    'A partir da data e hora desta entrega, o(a) COMPRADOR(A) assume a responsabilidade pelo veículo, inclusive por multas, infrações de trânsito e demais encargos que vierem a ocorrer.'
  )

  if (transferResponsible !== 'loja') {
    paragraphs.push(
      'O(A) COMPRADOR(A) se compromete a realizar a transferência de propriedade do veículo para o seu nome junto ao órgão de trânsito no prazo legal de 30 (trinta) dias.'
    )
  }

  paragraphs.push(`${city || '______________________'}, ${formatDateExtended(deliveryDate)}. Horário da entrega: ____:____`)

  return paragraphs
}

export async function generateDeliveryTermPdf(params) {
  const logo = await loadContractLogo()
  const buyerSlug = slugify(params.buyer?.name || '') || 'comprador'
  await generateContractPdf({
    title: 'TERMO DE ENTREGA DE VEÍCULO',
    paragraphs: buildDeliveryTermParagraphs(params),
    signatures: [
      { role: 'VENDEDORA', name: params.company.name || '' },
      { role: 'COMPRADOR(A)', name: params.buyer?.name || '' },
    ],
    filename: `termo-de-entrega-${buyerSlug}.pdf`,
    logo,
    headingPrefixes: ['VEÍCULO', 'ITENS CONFERIDOS', 'DECLARAÇÃO'],
  })
}

// Atalho usado nas telas: dados da loja guardados (tela Contratos) e entrega hoje
export async function downloadDeliveryTerm({ car, customer, sale, checklist, companyName, city }) {
  await generateDeliveryTermPdf({
    company: companyForDocuments(companyName),
    buyer: customer || null,
    car,
    checklist,
    saleDate: sale?.saleDate || null,
    deliveryDate: todayISO(),
    transferResponsible: sale?.transferResponsible || 'comprador',
    city,
  })
}
