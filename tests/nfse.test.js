import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsInvoice, salesWithoutInvoice, nfseDescription, nfseAmount, nfseFields, nfseStatusInfo, NFSE_SINCE } from '../src/utils/nfse.js'

test('NFS-e: só as vendas a partir de 16/10/2026, sem nota e sem "Não precisa", viram pendência', () => {
  assert.equal(NFSE_SINCE, '2026-10-16')
  assert.equal(needsInvoice({ saleDate: '2026-10-16', nfseStatus: 'pendente' }), true)
  // Venda gravada antes da coluna existir no painel
  assert.equal(needsInvoice({ saleDate: '2026-10-20' }), true)
  assert.equal(needsInvoice({ saleDate: '2026-10-15', nfseStatus: 'pendente' }), false)
  assert.equal(needsInvoice({ saleDate: '2026-10-20', nfseStatus: 'emitida' }), false)
  assert.equal(needsInvoice({ saleDate: '2026-10-20', nfseStatus: 'nao_precisa' }), false)
  assert.equal(needsInvoice(null), false)
  const sales = [
    { saleDate: '2026-10-17', nfseStatus: 'pendente' },
    { saleDate: '2026-10-01', nfseStatus: 'pendente' },
    { saleDate: '2026-10-18', nfseStatus: 'emitida' },
  ]
  assert.equal(salesWithoutInvoice(sales).length, 1)
  assert.equal(nfseStatusInfo('emitida').label, 'Nota emitida')
  assert.equal(nfseStatusInfo('qualquer').value, 'pendente')
})

test('NFS-e: descrição com os dados do veículo e valor com vírgula', () => {
  const car = { brand: 'Fiat', model: 'Argo', version: 'Drive 1.0', year: 2021, modelYear: 2022, plate: 'abc1d23', chassis: '9bd358a4nmyl12345', renavam: '0123.456789-0' }
  assert.equal(
    nfseDescription(car),
    'Referente à venda do veículo Fiat Argo Drive 1.0, ano 2021/2022, placa ABC1D23, chassi 9BD358A4NMYL12345, RENAVAM 01234567890.'
  )
  // Ano/modelo do cadastro já junto ("2021/2022"): não repete o ano
  assert.equal(
    nfseDescription({ brand: 'Toyota', model: 'Corolla', version: 'XEi', year: 2021, modelYear: '2021/2022', plate: 'TST1A21' }),
    'Referente à venda do veículo Toyota Corolla XEi, ano 2021/2022, placa TST1A21.'
  )
  assert.equal(nfseDescription({ brand: 'VW', model: 'Gol', version: '' }), 'Referente à venda do veículo VW Gol.')
  assert.equal(nfseDescription(null), '')
  assert.equal(nfseAmount(93000), '93000,00')
  assert.equal(nfseAmount(1234.5), '1234,50')
  assert.equal(nfseAmount(0), '')
  assert.equal(nfseAmount(null), '')
})

test('NFS-e: campos para copiar (CPF ou CNPJ, sem os vazios)', () => {
  const car = { brand: 'Fiat', model: 'Argo', version: '', plate: '' }
  const cpf = nfseFields({ car, sale: { salePrice: 50000 }, customer: { name: 'Carla', document: '123.456.789-09', email: '', addressParts: { cep: '65000-000' } } })
  assert.deepEqual(cpf.map((f) => f.key), ['documento', 'nome', 'cep', 'valor', 'descricao'])
  assert.equal(cpf[0].label, 'CPF do tomador')
  assert.equal(cpf[0].value, '12345678909')
  assert.equal(cpf[2].value, '65000000')
  const cnpj = nfseFields({ car, sale: { salePrice: null }, customer: { name: 'Empresa', document: '11.222.333/0001-81' } })
  assert.equal(cnpj[0].label, 'CNPJ do tomador')
  // Sem valor (gerente que não vê valores): o campo some
  assert.equal(cnpj.some((f) => f.key === 'valor'), false)
  // Sem cliente: só a descrição
  assert.deepEqual(nfseFields({ car, sale: { salePrice: 1 }, customer: null }).map((f) => f.key), ['valor', 'descricao'])
})
