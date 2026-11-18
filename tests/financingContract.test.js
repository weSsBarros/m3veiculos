import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { annualRate, financingSnapshot, financingTags, financingClauseText, installmentLines, FINANCING_TAG_KEYS } from '../src/utils/financingContract.js'
import { buildContractTemplateData, CONTRACT_TEMPLATE_TAGS, CONTRACT_SAMPLE_DATA, CONTRACT_EMPTY_DATA } from '../src/utils/contractTemplateTags.js'
import { buildContractParagraphs } from '../src/utils/contractTemplate.js'
import { readTemplate, checkTemplate } from '../src/utils/docxTemplateModel.js'

const sp = (text) => text.replace(/ /g, ' ')

const FINANCING = {
  id: 'f1',
  downPayment: 20000,
  financedAmount: 120000,
  installmentsCount: 3,
  installmentAmount: 40000,
  interestRate: null,
  firstDueDate: '2026-12-10',
  lateFeePercent: 2,
  lateInterestPercent: 1,
  installments: [
    { number: 2, dueDate: '2027-01-10', amount: 40000, paidOn: null },
    { number: 1, dueDate: '2026-12-10', amount: 40000, paidOn: '2026-12-09' },
    { number: 3, dueDate: '2027-02-10', amount: 40000, paidOn: null },
  ],
}

test('contrato do financiamento: retrato com as parcelas em ordem (sem os pagamentos)', () => {
  const snap = financingSnapshot(FINANCING)
  assert.deepEqual(snap.installments.map((i) => i.number), [1, 2, 3])
  assert.deepEqual(Object.keys(snap.installments[0]), ['number', 'dueDate', 'amount'])
  assert.equal(snap.installmentsCount, 3)
  assert.equal(financingSnapshot(null), null)
})

test('contrato do financiamento: marcadores do modelo próprio', () => {
  const tags = financingTags(financingSnapshot(FINANCING))
  assert.equal(sp(tags.financiamento_entrada), 'R$ 20.000,00')
  assert.equal(sp(tags.financiamento_valor), 'R$ 120.000,00')
  assert.equal(tags.financiamento_parcelas, '3')
  assert.equal(sp(tags.financiamento_parcela_valor), 'R$ 40.000,00')
  assert.equal(tags.financiamento_juros_mes, '0')
  assert.equal(tags.financiamento_primeiro_vencimento, '10/12/2026')
  assert.equal(tags.financiamento_ultimo_vencimento, '10/02/2027')
  assert.equal(tags.financiamento_dia_vencimento, '10')
  assert.equal(sp(tags.financiamento_soma_parcelas), 'R$ 120.000,00')
  assert.equal(sp(tags.financiamento_total), 'R$ 140.000,00')
  assert.equal(tags.financiamento_multa, '2')
  assert.equal(tags.financiamento_juros_atraso, '1')
  assert.equal(sp(tags.financiamento_tabela), '1ª parcela: R$ 40.000,00, vence em 10/12/2026\n2ª parcela: R$ 40.000,00, vence em 10/01/2027\n3ª parcela: R$ 40.000,00, vence em 10/02/2027')
  // Sem financiamento: tudo vazio (o modelo mostra a linha em branco)
  assert.ok(Object.values(financingTags(null)).every((v) => v === ''))
  // Juros ao ano compostos
  assert.equal(annualRate(2), 26.82)
  assert.equal(financingTags(financingSnapshot({ ...FINANCING, interestRate: 1.99 })).financiamento_juros_mes, '1,99')
})

test('contrato do financiamento: todo marcador novo está na lista oficial, com exemplo', () => {
  const official = new Set(CONTRACT_TEMPLATE_TAGS.map((t) => t.tag))
  for (const key of FINANCING_TAG_KEYS) {
    assert.ok(official.has(key), key)
    assert.ok(Object.hasOwn(CONTRACT_SAMPLE_DATA, key), key)
    assert.equal(CONTRACT_EMPTY_DATA[key], '')
  }
  const data = buildContractTemplateData({ company: {}, buyer: {}, vehicle: {}, sale: { price: 1, financing: financingSnapshot(FINANCING) } })
  assert.equal(data.financiamento_parcelas, '3')
  assert.equal(buildContractTemplateData({ company: {}, buyer: {}, vehicle: {}, sale: { price: 1 } }).financiamento_parcelas, '')
})

test('contrato padrão: com financiamento da loja, a cláusula do preço traz as parcelas', () => {
  const parts = {
    company: { name: 'Loja', document: '1' },
    buyer: { name: 'Cliente', document: '2' },
    vehicle: { brand: 'Iveco', model: 'Daily', version: '' },
    sale: { price: 140000, paymentMethod: 'R$ 20.000,00 à vista; R$ 120.000,00 parcelados diretamente com a VENDEDORA em 3 parcelas', date: '2026-11-17', city: 'X' },
  }
  const plain = buildContractParagraphs(parts).find((p) => p.includes('DO PREÇO'))
  assert.match(plain, /compensação integral dos valores/)
  const financed = sp(buildContractParagraphs({ ...parts, sale: { ...parts.sale, financing: financingSnapshot(FINANCING) } }).find((p) => p.includes('DO PREÇO')))
  assert.doesNotMatch(financed, /compensação integral/)
  assert.match(financed, /O saldo de R\$ 120\.000,00 é pago diretamente à VENDEDORA em 3 parcelas mensais de R\$ 40\.000,00, vencendo a primeira em 10\/12\/2026/)
  assert.match(financed, /sem juros/)
  assert.match(financed, /total a prazo \(entrada \+ parcelas\): R\$ 140\.000,00/)
  assert.match(financed, /multa de 2% e juros de mora de 1% ao mês/)
  assert.match(financed, /\n1ª parcela: R\$ 40\.000,00, vence em 10\/12\/2026\n2ª parcela/)
  assert.match(sp(financingClauseText(financingSnapshot({ ...FINANCING, interestRate: 2 }))), /juros de 2% ao mês \(26,82% ao ano\)/)
  assert.equal(installmentLines(null).length, 0)
})

function renderLibrary(data) {
  const zip = new PizZip(fs.readFileSync(new URL('../public/modelos-contrato/venda-reserva-dominio.docx', import.meta.url)))
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
  doc.render(data)
  const xml = doc.getZip().file('word/document.xml').asText()
  return sp(xml.replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''))
}

test('modelo pronto de reserva de domínio: preenche as condições do financiamento da loja', () => {
  const zip = new PizZip(fs.readFileSync(new URL('../public/modelos-contrato/venda-reserva-dominio.docx', import.meta.url)))
  const { blocks } = readTemplate(zip.file('word/document.xml').asText())
  assert.deepEqual(checkTemplate(blocks), { errors: [], unknown: [] })

  const filled = renderLibrary(buildContractTemplateData({ company: { name: 'Loja' }, buyer: { name: 'Cliente' }, vehicle: {}, sale: { price: 140000, financing: financingSnapshot(FINANCING) } }))
  assert.match(filled, /b\) entrada: R\$ 20\.000,00, paga em/)
  assert.match(filled, /c\) valor financiado: R\$ 120\.000,00;/)
  assert.match(filled, /d\) parcelas: 3 mensais de R\$ 40\.000,00, com vencimento todo dia 10, a primeira em 10\/12\/2026;/)
  assert.match(filled, /e\) juros remuneratórios: 0% ao mês \(0% ao ano\)/)
  assert.match(filled, /f\) soma das parcelas: R\$ 120\.000,00; total a prazo \(entrada \+ parcelas\): R\$ 140\.000,00;/)
  assert.match(filled, /Parcelas e vencimentos:\n1ª parcela: R\$ 40\.000,00, vence em 10\/12\/2026\n2ª parcela/)
  assert.match(filled, /multa de 2% \(art\. 52/)
  assert.match(filled, /juros de mora de 1% ao mês/)

  const empty = renderLibrary(CONTRACT_EMPTY_DATA)
  assert.match(empty, /c\) valor financiado: R\$ ____________;/)
  assert.match(empty, /d\) parcelas: ____ mensais de R\$ ____________, com vencimento todo dia ____, a primeira em ____\/____\/______;/)
  assert.doesNotMatch(empty, /Parcelas e vencimentos/)
  assert.match(empty, /multa de 2% \(art\. 52/)
})
