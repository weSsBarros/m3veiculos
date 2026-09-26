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
]

export function buildContractTemplateData({ company, buyer, vehicle, sale }) {
  return {
    loja_nome: company.name || '',
    loja_cnpj: company.document || '',
    loja_endereco: company.address || '',
    loja_telefone: company.phone || '',
    loja_email: company.email || '',
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
    preco: formatCurrency(sale.price),
    forma_pagamento: sale.paymentMethod || '',
    detalhes_pagamento: sale.paymentDetails || '',
    data_venda: formatDateExtended(sale.date),
    cidade: sale.city || '',
    observacoes: sale.notes || '',
  }
}
