import { formatCurrency } from './carFormat.js'

// Minuta padrão de contrato particular de compra e venda de veículo usado.
// Aviso: é um modelo genérico de referência, não substitui análise jurídica —
// vale revisar com um advogado/contador antes de usar oficialmente.

function formatDateExtended(isoDate) {
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function buildContractTitle() {
  return 'CONTRATO PARTICULAR DE COMPRA E VENDA DE VEÍCULO AUTOMOTOR'
}

export function buildContractParagraphs({ company, buyer, vehicle, sale }) {
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
    `Pelo presente instrumento particular, de um lado ${company.name}, inscrita no CNPJ sob o nº ${company.document}` +
      `${company.address ? `, com sede em ${company.address}` : ''}` +
      `${company.phone ? `, telefone ${company.phone}` : ''}` +
      `${company.email ? `, e-mail ${company.email}` : ''}` +
      `, doravante denominada VENDEDORA; e de outro lado ${buyer.name}, portador(a) do CPF/CNPJ nº ${buyer.document}` +
      `${buyer.rg ? `, RG nº ${buyer.rg}` : ''}` +
      `${buyer.address ? `, residente e domiciliado(a) em ${buyer.address}` : ''}` +
      `${buyer.phone ? `, telefone ${buyer.phone}` : ''}` +
      `${buyer.email ? `, e-mail ${buyer.email}` : ''}` +
      `, doravante denominado(a) COMPRADOR(A), têm entre si justo e contratado o seguinte:`
  )

  paragraphs.push(`CLÁUSULA 1ª — DO OBJETO\nO presente contrato tem por objeto a compra e venda do veículo abaixo descrito: ${vehicleDescription}.`)

  paragraphs.push(
    `CLÁUSULA 2ª — DO PREÇO E FORMA DE PAGAMENTO\nO veículo é vendido pelo valor de ${formatCurrency(sale.price)}, a ser pago da seguinte forma: ${sale.paymentMethod || 'a combinar entre as partes'}.` +
      `${sale.paymentDetails ? ` ${sale.paymentDetails}` : ''}`
  )

  paragraphs.push(
    'CLÁUSULA 3ª — DA ENTREGA E TRANSFERÊNCIA\nA VENDEDORA entregará ao COMPRADOR o veículo acompanhado do Certificado de Registro de Veículo (CRV/DUT) devidamente assinado, para que o COMPRADOR promova a transferência de propriedade junto ao órgão de trânsito competente no prazo legal de 30 (trinta) dias, contado da data de assinatura deste contrato.'
  )

  paragraphs.push(
    `CLÁUSULA 4ª — DE DÉBITOS E MULTAS\nA VENDEDORA declara e se responsabiliza pela quitação de todos os débitos, tributos (IPVA, licenciamento), multas e infrações de trânsito incidentes sobre o veículo até a data de assinatura deste contrato (${formatDateExtended(sale.date)}). A partir da entrega, toda e qualquer responsabilidade por débitos, multas, infrações e demais encargos passa a ser exclusiva do COMPRADOR.`
  )

  paragraphs.push(
    'CLÁUSULA 5ª — DO ESTADO DO VEÍCULO\nO veículo é vendido no estado em que se encontra, tendo o COMPRADOR vistoriado e testado o bem previamente à assinatura deste contrato, declarando estar de acordo com suas condições mecânicas, elétricas e estéticas.'
  )

  paragraphs.push(
    'CLÁUSULA 6ª — DA GARANTIA\nAplicam-se as garantias legais previstas no Código de Defesa do Consumidor (Lei nº 8.078/1990) quanto a vícios ocultos não identificáveis na vistoria, ressalvado o desgaste natural de uso e peças de consumo.'
  )

  if (sale.notes) {
    paragraphs.push(`CLÁUSULA 7ª — OBSERVAÇÕES ADICIONAIS\n${sale.notes}`)
  }

  paragraphs.push(
    `CLÁUSULA ${sale.notes ? '8ª' : '7ª'} — DO FORO\nFica eleito o foro da comarca de ${sale.city || '—'}, com renúncia expressa a qualquer outro, por mais privilegiado que seja, para dirimir quaisquer dúvidas oriundas deste contrato.`
  )

  paragraphs.push(
    'E por estarem assim justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor, na presença das testemunhas abaixo.'
  )

  paragraphs.push(`${sale.city || '—'}, ${formatDateExtended(sale.date)}.`)

  return paragraphs
}

export function buildContractSignatures({ company, buyer }) {
  return [
    { role: 'VENDEDORA', name: company.name },
    { role: 'COMPRADOR(A)', name: buyer.name },
  ]
}
