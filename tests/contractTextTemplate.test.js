import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valuesToTags, contractTextToTemplate } from '../src/utils/contractTextTemplate.js'

const data = {
  loja_nome: 'WB AUTO DEMONSTRACAO LTDA',
  loja_cidade: 'São Luís/MA',
  cidade: 'São Luís/MA',
  cliente_nome: 'Maria da Silva',
  cliente_cpf: '123.456.789-09',
  carro_marca: 'Toyota',
  carro_modelo: 'Corolla',
  carro_placa: 'ABC1D23',
  carro_cor: 'Prata',
  preco: 'R$ 98.900,00',
  carro_km: '45.000',
  cliente_rg: '',
  carro_ano: '22',
}

test('contrato editado vira modelo: os dados do contrato voltam a ser marcadores', () => {
  const text = 'Maria da Silva, CPF 123.456.789-09, compra o Toyota Corolla prata/Prata, placa ABC1D23, por R$ 98.900,00, em São Luís/MA.'
  assert.equal(
    valuesToTags(text, data),
    '{cliente_nome}, CPF {cliente_cpf}, compra o {carro_marca} {carro_modelo} prata/{carro_cor}, placa {carro_placa}, por {preco}, em {loja_cidade}.'
  )
})

test('contrato editado vira modelo: não troca pedaço de palavra nem valor curto ou vazio', () => {
  // "Prata" dentro de "Prataria" fica; "22" (2 letras) fica; RG vazio não troca nada
  assert.equal(valuesToTags('Prataria do ano 22, km 45.000.', data), 'Prataria do ano 22, km {carro_km}.')
  // Texto que o lojista escreveu sem dado nenhum fica igual
  assert.equal(valuesToTags('Cláusula extra combinada entre as partes.', data), 'Cláusula extra combinada entre as partes.')
})

test('contrato editado vira modelo: assinaturas também', () => {
  const out = contractTextToTemplate(
    { paragraphs: ['A VENDEDORA WB AUTO DEMONSTRACAO LTDA'], signatures: [{ role: 'COMPRADOR(A)', name: 'Maria da Silva' }] },
    data
  )
  assert.deepEqual(out, { paragraphs: ['A VENDEDORA {loja_nome}'], signatures: [{ role: 'COMPRADOR(A)', name: '{cliente_nome}' }] })
})
