// Nota fiscal de serviço (NFS-e) da venda (seção 88, pedido do Wesley em
// 16/10/2026). O Emissor Nacional (nfse.gov.br) não abre dentro de outro site e
// pede o login gov.br: o painel abre o emissor noutra aba com os dados prontos
// para copiar e, depois, a loja guarda o número, a data e o PDF na venda.

export const NFSE_EMISSOR_URL = 'https://www.nfse.gov.br/EmissorNacional'

// O aviso "vendas sem nota" só conta as vendas a partir daqui (as antigas não
// viram pendência e os dados ficam como estão)
export const NFSE_SINCE = '2026-10-16'

export const NFSE_STATUSES = [
  { value: 'pendente', label: 'Sem nota', className: 'is-warning' },
  { value: 'emitida', label: 'Nota emitida', className: 'is-success' },
  { value: 'nao_precisa', label: 'Não precisa de nota', className: '' },
]

export function nfseStatusInfo(value) {
  return NFSE_STATUSES.find((s) => s.value === value) || NFSE_STATUSES[0]
}

export function needsInvoice(sale) {
  return Boolean(sale && (sale.nfseStatus || 'pendente') === 'pendente' && sale.saleDate && sale.saleDate >= NFSE_SINCE)
}

export function salesWithoutInvoice(sales) {
  return (sales || []).filter(needsInvoice)
}

const digits = (v) => String(v || '').replace(/\D/g, '')

// "Referente à venda do veículo Fiat Argo Drive 1.0, ano 2021/2022, placa ABC1D23, chassi ..."
export function nfseDescription(car) {
  if (!car) return ''
  const name = [car.brand, car.model, car.version].filter(Boolean).join(' ').trim()
  // O ano/modelo do cadastro já vem como "2021/2022"; só o ano do modelo, junta com a fabricação
  const modelYear = String(car.modelYear || '')
  const year = modelYear.includes('/') ? modelYear : car.year && modelYear ? `${car.year}/${modelYear}` : modelYear || car.year || ''
  const parts = [
    name ? `Referente à venda do veículo ${name}` : 'Referente à venda do veículo',
    year ? `ano ${year}` : '',
    car.plate ? `placa ${String(car.plate).toUpperCase()}` : '',
    car.chassis ? `chassi ${String(car.chassis).toUpperCase()}` : '',
    car.renavam ? `RENAVAM ${digits(car.renavam)}` : '',
  ].filter(Boolean)
  return `${parts.join(', ')}.`
}

// Valor no formato que o emissor aceita: "93000,00"
export function nfseAmount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toFixed(2).replace('.', ',')
}

// Campos para copiar no emissor, na ordem das telas (tomador, serviço). Campo
// vazio não aparece.
export function nfseFields({ car, sale, customer }) {
  const doc = digits(customer?.document)
  return [
    { key: 'documento', label: doc.length > 11 ? 'CNPJ do tomador' : 'CPF do tomador', value: doc },
    { key: 'nome', label: 'Nome do tomador', value: customer?.name || '' },
    { key: 'email', label: 'E-mail do tomador', value: customer?.email || '' },
    { key: 'cep', label: 'CEP do tomador', value: digits(customer?.addressParts?.cep) },
    { key: 'endereco', label: 'Endereço do tomador', value: customer?.address || '' },
    { key: 'valor', label: 'Valor do serviço', value: nfseAmount(sale?.salePrice) },
    { key: 'descricao', label: 'Descrição do serviço', value: nfseDescription(car) },
  ].filter((f) => f.value)
}
