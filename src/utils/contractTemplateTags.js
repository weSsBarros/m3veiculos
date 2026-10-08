import { formatCurrency } from './carFormat.js'

function formatDateExtended(isoDate) {
  if (!isoDate) return ''
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Lista fixa de marcadores que o sistema sabe preencher num modelo .docx
// enviado pela loja. Documentada na tela de "Modelos de contrato" pro admin
// copiar pro Word.
export const CONTRACT_TEMPLATE_TAGS = [
  { tag: 'loja_nome', label: 'Nome da loja' },
  { tag: 'loja_cnpj', label: 'CNPJ da loja' },
  { tag: 'loja_endereco', label: 'Endereço da loja' },
  { tag: 'loja_telefone', label: 'Telefone da loja' },
  { tag: 'loja_email', label: 'E-mail da loja' },
  { tag: 'loja_cidade', label: 'Cidade/UF da loja (foro)' },
  { tag: 'cliente_nome', label: 'Nome do cliente' },
  { tag: 'cliente_cpf', label: 'CPF do cliente' },
  { tag: 'cliente_rg', label: 'RG do cliente' },
  { tag: 'cliente_endereco', label: 'Endereço do cliente' },
  { tag: 'cliente_telefone', label: 'Telefone do cliente' },
  { tag: 'cliente_email', label: 'E-mail do cliente' },
  { tag: 'carro_marca', label: 'Marca do carro' },
  { tag: 'carro_modelo', label: 'Modelo do carro' },
  { tag: 'carro_versao', label: 'Versão do carro' },
  { tag: 'carro_ano', label: 'Ano/Modelo do carro' },
  { tag: 'carro_cor', label: 'Cor do carro' },
  { tag: 'carro_km', label: 'Quilometragem' },
  { tag: 'carro_placa', label: 'Placa' },
  { tag: 'carro_chassi', label: 'Chassi' },
  { tag: 'carro_renavam', label: 'Renavam' },
  { tag: 'preco', label: 'Preço de venda' },
  { tag: 'forma_pagamento', label: 'Forma de pagamento' },
  { tag: 'detalhes_pagamento', label: 'Detalhes do pagamento' },
  { tag: 'data_venda', label: 'Data da venda (por extenso)' },
  { tag: 'cidade', label: 'Cidade/UF do contrato' },
  { tag: 'observacoes', label: 'Observações adicionais' },
  // Entrada do veículo (cadastro do carro): o dono do carro e a entrada.
  // Nos modelos de entrada, os campos do cliente também trazem o dono.
  { tag: 'proprietario_nome', label: 'Dono do carro: nome (entrada)' },
  { tag: 'proprietario_cpf', label: 'Dono do carro: CPF/CNPJ (entrada)' },
  { tag: 'proprietario_rg', label: 'Dono do carro: RG (entrada)' },
  { tag: 'proprietario_endereco', label: 'Dono do carro: endereço (entrada)' },
  { tag: 'proprietario_telefone', label: 'Dono do carro: telefone (entrada)' },
  { tag: 'proprietario_email', label: 'Dono do carro: e-mail (entrada)' },
  { tag: 'tipo_entrada', label: 'Tipo de entrada (compra, consignação ou repasse)' },
  { tag: 'valor_entrada', label: 'Valor da entrada (compra ou valor do dono no consignado)' },
  { tag: 'data_entrada', label: 'Data de entrada (por extenso)' },
]

// Tags que só os modelos de entrada usam (ficam vazias no contrato de venda)
const ENTRY_TAG_KEYS = ['proprietario_nome', 'proprietario_cpf', 'proprietario_rg', 'proprietario_endereco', 'proprietario_telefone', 'proprietario_email', 'tipo_entrada', 'valor_entrada', 'data_entrada']
const ENTRY_TYPE_TEXT = { showroom: 'compra pela loja', consignado: 'consignação', repasse: 'repasse' }

// Dados fictícios da prévia do editor de modelos
export const CONTRACT_SAMPLE_DATA = {
  loja_nome: 'Loja Exemplo Veículos',
  loja_cnpj: '00.000.000/0001-00',
  loja_endereco: 'Av. Exemplo, 100, Centro',
  loja_telefone: '(98) 90000-0000',
  loja_email: 'contato@lojaexemplo.com.br',
  loja_cidade: 'São Luís/MA',
  cliente_nome: 'Maria Exemplo da Silva',
  cliente_cpf: '000.000.000-00',
  cliente_rg: '0000000',
  cliente_endereco: 'Rua Exemplo, 10, Bairro Exemplo',
  cliente_telefone: '(98) 90000-0001',
  cliente_email: 'maria@exemplo.com',
  carro_marca: 'Toyota',
  carro_modelo: 'Corolla',
  carro_versao: 'XEi 2.0',
  carro_ano: '2022/2023',
  carro_cor: 'Prata',
  carro_km: '45.000',
  carro_placa: 'ABC1D23',
  carro_chassi: '9BR000000P0000000',
  carro_renavam: '00000000000',
  preco: 'R$ 98.900,00',
  forma_pagamento: 'À vista',
  detalhes_pagamento: 'Entrada de R$ 20.000,00 + saldo financiado',
  data_venda: '5 de outubro de 2026',
  cidade: 'São Luís/MA',
  observacoes: 'Exemplo de observação.',
  proprietario_nome: 'João Exemplo Pereira',
  proprietario_cpf: '000.000.000-01',
  proprietario_rg: '0000001',
  proprietario_endereco: 'Rua Exemplo, 20, Bairro Exemplo',
  proprietario_telefone: '(98) 90000-0002',
  proprietario_email: 'joao@exemplo.com',
  tipo_entrada: 'consignação',
  valor_entrada: 'R$ 85.000,00',
  data_entrada: '5 de outubro de 2026',
}

// Prévia com tudo vazio: mostra as linhas em branco e o que some sem dado
export const CONTRACT_EMPTY_DATA = Object.fromEntries(CONTRACT_TEMPLATE_TAGS.map((t) => [t.tag, '']))

export function buildContractTemplateData({ company, buyer, vehicle, sale }) {
  return {
    loja_nome: company.name || '',
    loja_cnpj: company.document || '',
    loja_endereco: company.address || '',
    loja_telefone: company.phone || '',
    loja_email: company.email || '',
    // Foro: cidade dos dados fiscais; contrato salvo antes usa a cidade do contrato
    loja_cidade: company.city || sale.city || '',
    cliente_nome: buyer.name || '',
    cliente_cpf: buyer.document || '',
    cliente_rg: buyer.rg || '',
    cliente_endereco: buyer.address || '',
    cliente_telefone: buyer.phone || '',
    cliente_email: buyer.email || '',
    carro_marca: vehicle.brand || '',
    carro_modelo: vehicle.model || '',
    carro_versao: vehicle.version || '',
    carro_ano: vehicle.modelYear || vehicle.year || '',
    carro_cor: vehicle.color || '',
    carro_km: vehicle.km != null && vehicle.km !== '' ? Number(vehicle.km).toLocaleString('pt-BR') : '',
    carro_placa: vehicle.plate || '',
    carro_chassi: vehicle.chassis || '',
    carro_renavam: vehicle.renavam || '',
    // Carro sem preço (comum na entrada) fica com a linha em branco
    preco: sale.price != null && sale.price !== '' ? formatCurrency(Number(sale.price)) : '',
    forma_pagamento: sale.paymentMethod || '',
    detalhes_pagamento: sale.paymentDetails || '',
    data_venda: formatDateExtended(sale.date),
    cidade: sale.city || '',
    observacoes: sale.notes || '',
    ...Object.fromEntries(ENTRY_TAG_KEYS.map((key) => [key, ''])),
  }
}

// Contrato da entrada do veículo (cadastro do carro): o dono do carro entra
// como proprietário e também como cliente. entry: { type, value, date }.
export function buildEntryTemplateData({ company, owner, vehicle, entry }) {
  const person = owner || {}
  const ownerFields = {
    name: person.name || '',
    document: person.document || '',
    rg: person.rg || '',
    address: person.address || '',
    phone: person.phone || '',
    email: person.email || '',
  }
  const base = buildContractTemplateData({
    company,
    buyer: ownerFields,
    vehicle,
    sale: { price: vehicle.price, paymentMethod: '', paymentDetails: '', date: '', city: '', notes: '' },
  })
  return {
    ...base,
    preco: vehicle.price ? formatCurrency(vehicle.price) : '',
    proprietario_nome: ownerFields.name,
    proprietario_cpf: ownerFields.document,
    proprietario_rg: ownerFields.rg,
    proprietario_endereco: ownerFields.address,
    proprietario_telefone: ownerFields.phone,
    proprietario_email: ownerFields.email,
    tipo_entrada: ENTRY_TYPE_TEXT[entry.type] || '',
    valor_entrada: entry.value ? formatCurrency(entry.value) : '',
    data_entrada: formatDateExtended(entry.date),
  }
}
