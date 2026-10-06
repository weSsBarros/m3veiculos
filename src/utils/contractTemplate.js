import { formatCurrency } from './carFormat.js'

// Minuta padrão de contrato particular de compra e venda de veículo usado.
// Aviso: é um modelo genérico de referência, não substitui análise jurídica —
// vale revisar com um advogado/contador antes de usar oficialmente.
//
// Versão 2 (06/10/2026): ATPV-e e Renave no lugar do CRV/DUT, comunicação de
// venda (art. 134 do CTB), indicação de condutor, garantia legal do CDC no lugar
// do "no estado em que se encontra", dados pessoais (LGPD) e foro com a ressalva
// do consumidor (art. 101, I, do CDC). Contrato salvo antes sai de novo na
// versão 1, com o mesmo texto que foi assinado.
export const CONTRACT_V2_SINCE = '2026-10-06T03:00:00Z'

function versionFor(createdAt) {
  return createdAt && new Date(createdAt) < new Date(CONTRACT_V2_SINCE) ? 1 : 2
}

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

function buildContractParagraphsV1({ company, buyer, vehicle, sale }) {
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

function vehicleText(vehicle) {
  return (
    `${vehicle.brand} ${vehicle.model} ${vehicle.version}`.trim() +
    ` — Ano Fab./Modelo: ${vehicle.modelYear || vehicle.year || '—'}` +
    `, Cor: ${vehicle.color || '—'}` +
    `, Km: ${vehicle.km != null && vehicle.km !== '' ? Number(vehicle.km).toLocaleString('pt-BR') : '—'}` +
    `, Placa: ${vehicle.plate || '—'}` +
    `, Chassi: ${vehicle.chassis || '—'}` +
    `, Renavam: ${vehicle.renavam || '—'}`
  )
}

function buildContractParagraphsV2({ company, buyer, vehicle, sale }) {
  const date = formatDateExtended(sale.date)
  const forum = company.city || sale.city || '—'
  const paragraphs = []
  let n = 0
  const clause = (title, text) => {
    n += 1
    paragraphs.push(`CLÁUSULA ${n}ª — ${title}\n${text}`)
  }

  paragraphs.push(
    `Pelo presente instrumento particular, de um lado ${company.name}, inscrita no CNPJ sob o nº ${company.document}` +
      `${company.address ? `, com sede em ${company.address}` : ''}` +
      `${company.phone ? `, telefone ${company.phone}` : ''}` +
      `${company.email ? `, e-mail ${company.email}` : ''}` +
      `, doravante denominada VENDEDORA; e de outro lado ${buyer.name}, inscrito(a) no CPF/CNPJ sob o nº ${buyer.document}` +
      `${buyer.rg ? `, RG nº ${buyer.rg}` : ''}` +
      `${buyer.address ? `, residente e domiciliado(a) em ${buyer.address}` : ''}` +
      `${buyer.phone ? `, telefone ${buyer.phone}` : ''}` +
      `${buyer.email ? `, e-mail ${buyer.email}` : ''}` +
      `, doravante denominado(a) COMPRADOR(A), têm entre si justo e contratado o seguinte:`
  )

  clause('DO OBJETO', `O presente contrato tem por objeto a compra e venda do veículo abaixo descrito, com a quilometragem conferida pelo COMPRADOR na entrega: ${vehicleText(vehicle)}.`)

  clause(
    'DO PREÇO E DA FORMA DE PAGAMENTO',
    `O veículo é vendido pelo valor de ${formatCurrency(sale.price)}, pago da seguinte forma: ${sale.paymentMethod || 'a combinar entre as partes'}.` +
      `${sale.paymentDetails ? ` ${sale.paymentDetails}` : ''}` +
      ' A entrega do veículo e dos documentos de transferência fica condicionada à compensação integral dos valores.'
  )

  clause(
    'DA VISTORIA E DO ESTADO DO VEÍCULO',
    'O COMPRADOR declara que examinou o veículo e teve a oportunidade de testá-lo e de submetê-lo a profissional de sua confiança antes desta compra, que foi informado sobre o seu estado de conservação, compatível com o ano e a quilometragem, e que as avarias aparentes lhe foram apresentadas e consideradas no preço.'
  )

  clause(
    'DOS DÉBITOS, DAS MULTAS E DAS RESPONSABILIDADES',
    `São de responsabilidade da VENDEDORA os débitos (IPVA, licenciamento e taxas) e as multas por infrações cometidas até a data da entrega${date ? ` (${date})` : ''}. A partir da entrega, o COMPRADOR responde por todos os débitos, multas, pontuações, danos e responsabilidades decorrentes do uso, da posse e da propriedade do veículo, ainda que a transferência não tenha sido concluída, obrigando-se a assinar a indicação de condutor e a reembolsar à VENDEDORA o que ela vier a pagar referente a esse período.`
  )

  clause(
    'DA TRANSFERÊNCIA',
    'A VENDEDORA entregará a Autorização para Transferência de Propriedade do Veículo (ATPV-e) ou o documento exigido pelo Detran e registrará a saída do veículo de seu estoque no Registro Nacional de Veículos em Estoque (Renave), quando aplicável. O COMPRADOR deve concluir a transferência para o seu nome em até 30 (trinta) dias (art. 123, § 1º, do Código de Trânsito Brasileiro), arcando com as taxas e a vistoria. Não feita a transferência no prazo, a VENDEDORA poderá comunicar a venda ao Detran (art. 134 do Código de Trânsito Brasileiro), e o COMPRADOR responderá pelas multas e demais consequências do atraso.'
  )

  clause(
    'DA GARANTIA',
    'O veículo tem a garantia legal de 90 (noventa) dias para vícios não informados ao COMPRADOR, contados da entrega (art. 26, II, do Código de Defesa do Consumidor), além da garantia contratual que a VENDEDORA conceder por termo escrito. Não constituem vício o desgaste natural compatível com o ano e a quilometragem nem os danos causados por mau uso, acidente ou falta de manutenção. Constatado um vício, o COMPRADOR deve comunicá-lo à VENDEDORA e apresentar o veículo para o reparo, que será feito em até 30 (trinta) dias (art. 18, § 1º, do Código de Defesa do Consumidor).'
  )

  if (sale.notes) clause('DAS OBSERVAÇÕES ADICIONAIS', sale.notes)

  clause(
    'DOS DADOS PESSOAIS',
    'As partes autorizam o tratamento dos dados pessoais deste contrato para a sua execução, para o cumprimento de obrigações legais e regulatórias (Detran, Senatran/Renave, Receita Federal e instituições financeiras envolvidas) e para o exercício regular de direitos, nos termos da Lei nº 13.709/2018 (LGPD).'
  )

  clause(
    'DO FORO',
    `Fica eleito o foro da comarca de ${forum} para dirimir as questões deste contrato, ressalvado ao COMPRADOR, quando consumidor, o direito de propor ação no foro do seu domicílio (art. 101, I, do Código de Defesa do Consumidor).`
  )

  paragraphs.push(
    'E por estarem assim justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor, na presença das testemunhas abaixo.'
  )
  paragraphs.push(`${sale.city || '—'}, ${date}.`)
  return paragraphs
}

// createdAt: contrato já salvo (sai na versão em que foi feito); sem ele, a atual
export function buildContractParagraphs(parts, { createdAt } = {}) {
  return versionFor(createdAt) === 1 ? buildContractParagraphsV1(parts) : buildContractParagraphsV2(parts)
}
