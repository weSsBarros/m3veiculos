import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTemplate, buildDocumentXml, checkTemplate, tagText, tagLabel, blankLine } from '../src/utils/docxTemplateModel.js'

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>CONTRATO</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Nome: {cliente_</w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="22"/></w:rPr><w:t>nome}{^cliente_nome}____{/cliente_nome}</w:t></w:r></w:p>
<w:p><w:r><w:t>{#observacoes}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Obs: </w:t></w:r><w:r><w:t>{observacoes}</w:t></w:r></w:p>
<w:p><w:r><w:t>{/observacoes}</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Placa {carro_placa}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:drawing><wp:inline>LOGO</wp:inline></w:drawing></w:r><w:r><w:t>depois da imagem</w:t></w:r></w:p>
<w:p><w:hyperlink><w:r><w:t>link</w:t></w:r></w:hyperlink></w:p>
<w:sectPr/>
</w:body></w:document>`

const texts = (block) => block.segments.map((s) => (s.type === 'tag' ? tagText(s.tag) : s.type === 'object' ? `[${s.label}]` : s.text)).join('')

test('readTemplate: parágrafos, tabela, marcador partido em dois trechos e "se vazio, linha"', () => {
  const { blocks } = readTemplate(XML)
  assert.equal(blocks.length, 8)
  assert.equal(blocks[0].align, 'center')
  assert.deepEqual(blocks[0].segments.map((s) => [s.text, s.b]), [['CONTRATO', true]])
  const nome = blocks[1].segments
  assert.equal(nome.length, 2)
  assert.equal(nome[0].text, 'Nome: ')
  assert.deepEqual(nome[1].tag, { kind: 'field', name: 'cliente_nome', fallback: '____' })
  assert.deepEqual(blocks[2].segments[0].tag, { kind: 'open', name: 'observacoes' })
  assert.deepEqual(blocks[3].segments.map((s) => [s.type, s.b]), [['text', true], ['tag', false]])
  assert.equal(blocks[5].inTable, true)
  assert.equal(blocks[5].tableStart, true)
  assert.equal(texts(blocks[6]), '[imagem]depois da imagem')
  assert.equal(blocks[6].readonly, '')
  assert.match(blocks[7].readonly, /link/)
})

test('buildDocumentXml: sem mudança, o documento lido de novo é igual', () => {
  const model = readTemplate(XML)
  const again = readTemplate(buildDocumentXml(model, model.blocks))
  assert.deepEqual(again.blocks.map(texts), model.blocks.map(texts))
})

test('buildDocumentXml: parágrafo editado mantém a letra (fonte e tamanho) e o negrito vai na ordem do Word', () => {
  const model = readTemplate(XML)
  const blocks = model.blocks.map((b) => ({ ...b }))
  const s = blocks[1].segments[0].s
  blocks[1] = {
    ...blocks[1],
    changed: true,
    segments: [
      { type: 'text', text: 'Comprador: ', s, b: true, i: false, u: false },
      { type: 'tag', tag: { kind: 'field', name: 'cliente_nome', fallback: null }, s, b: false, i: false, u: false },
      { type: 'text', text: '\tCPF ', s, b: false, i: false, u: false },
      { type: 'tag', tag: { kind: 'field', name: 'cliente_cpf', fallback: blankLine('cliente_cpf') }, s, b: false, i: false, u: false },
    ],
  }
  const xml = buildDocumentXml(model, blocks)
  assert.match(xml, /<w:rPr><w:rFonts w:ascii="Arial"\/><w:b\/><w:bCs\/><w:sz w:val="22"\/><\/w:rPr><w:t xml:space="preserve">Comprador: <\/w:t>/)
  assert.match(xml, /<w:tab\/>/)
  assert.equal((xml.match(/xmlns:w=/g) || []).length, 1)
  assert.match(xml, /^<\?xml/)
  const again = readTemplate(xml)
  assert.equal(texts(again.blocks[1]), 'Comprador: {cliente_nome}\tCPF {cliente_cpf}{^cliente_cpf}______________________{/cliente_cpf}')
  assert.deepEqual(again.blocks[1].segments.map((x) => x.b), [true, false, false, false])
  assert.equal(texts(again.blocks[0]), 'CONTRATO')
})

test('buildDocumentXml: apaga, cria parágrafo novo e mantém a imagem de um parágrafo editado', () => {
  const model = readTemplate(XML)
  const blocks = model.blocks.map((b) => ({ ...b }))
  blocks[2].deleted = true
  blocks[4].deleted = true
  blocks.splice(4, 0, { key: 'n1', pPrFrom: 3, changed: true, segments: [{ type: 'text', text: 'Parágrafo novo', s: -1, b: false, i: false, u: false }] })
  blocks[7] = { ...blocks[7], changed: true, segments: [blocks[7].segments[0], { type: 'text', text: 'texto trocado', s: -1, b: false, i: false, u: false }] }
  const again = readTemplate(buildDocumentXml(model, blocks))
  assert.deepEqual(again.blocks.map(texts), [
    'CONTRATO',
    'Nome: {cliente_nome}{^cliente_nome}____{/cliente_nome}',
    'Obs: {observacoes}',
    'Parágrafo novo',
    'Placa {carro_placa}',
    '[imagem]texto trocado',
    'link',
  ])
  assert.match(buildDocumentXml(model, blocks), /<wp:inline>LOGO<\/wp:inline>/)
})

test('checkTemplate: bloco aberto sem fim, chave solta e marcador desconhecido', () => {
  const model = readTemplate(XML)
  assert.deepEqual(checkTemplate(model.blocks), { errors: [], unknown: [] })
  const semFim = model.blocks.map((b, i) => (i === 4 ? { ...b, deleted: true } : b))
  assert.match(checkTemplate(semFim).errors[0], /começa mas não termina/)
  const solta = model.blocks.map((b, i) => (i === 0 ? { ...b, segments: [{ type: 'text', text: 'Valor {preco', s: 0 }] } : b))
  assert.match(checkTemplate(solta).errors[0], /chave/)
  const errado = model.blocks.map((b, i) => (i === 0 ? { ...b, segments: [{ type: 'tag', tag: { kind: 'field', name: 'clienteNome' } }] } : b))
  assert.deepEqual(checkTemplate(errado).unknown, ['clienteNome'])
})

test('tagLabel: nome do campo, linha em branco e blocos', () => {
  assert.equal(tagLabel({ kind: 'field', name: 'cliente_nome', fallback: null }), 'Nome do cliente')
  assert.equal(tagLabel({ kind: 'field', name: 'cliente_nome', fallback: '____' }), 'Nome do cliente ou linha')
  assert.equal(tagLabel({ kind: 'field', name: 'cidade', fallback: 'São Luís - MA' }), 'Cidade/UF do contrato ou “São Luís - MA”')
  assert.equal(tagLabel({ kind: 'open', name: 'observacoes' }), 'Só se tiver: Observações adicionais')
  assert.equal(tagLabel({ kind: 'close', name: 'observacoes' }), 'Fim do bloco: Observações adicionais')
  assert.equal(tagText({ kind: 'field', name: 'cidade', fallback: 'São Luís - MA' }), '{cidade}{^cidade}São Luís - MA{/cidade}')
})
