import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  WM_NAMESPACE, wmPlate, wmCnpj, wmYears, wmDoors, wmImageUrl, wmImages, wmOutReason, wmMissing, wmResolve, wmRankColors,
  wmRankGears, wmRankFuels, wmPick, wmOptionals, wmObservation, buildWebmotorsAd, wmCarFromRow, wmVersionsForYear, wmAnuncioParam,
  wmSoapEnvelope, wmParseXml, wmSoapResult, wmList, wmOptionsFrom, wmModalities, wmModalityFull, wmReturnOk, wmReturnCodes,
  wmReturnText, wmResultCode,
} from '../src/utils/webmotorsAd.js'

const SITE = 'https://loja.com.br'
// Listas no formato da Webmotors (nomes como os do portal; códigos inventados)
const LISTS = {
  cores: [
    { id: 30401, name: 'Amarelo' }, { id: 30402, name: 'Azul' }, { id: 30403, name: 'Branco' }, { id: 30404, name: 'Cinza' },
    { id: 30405, name: 'Prata' }, { id: 30406, name: 'Preto' }, { id: 30407, name: 'Vermelho' }, { id: 30408, name: 'Verde' },
    { id: 30409, name: 'Bege' }, { id: 30410, name: 'Vinho' },
  ],
  cambios: [
    { id: 23001, name: 'Manual' }, { id: 23003, name: 'Automática' }, { id: 23004, name: 'Automática Sequencial' },
    { id: 23005, name: 'Automatizada' }, { id: 23006, name: 'CVT' }, { id: 23007, name: 'Semi-Automática' },
  ],
  combustiveis: [
    { id: 21201, name: 'Gasolina e álcool' }, { id: 21202, name: 'Gasolina' }, { id: 21203, name: 'Álcool' }, { id: 21204, name: 'Diesel' },
    { id: 21205, name: 'Gasolina e elétrico' }, { id: 21206, name: 'Elétrico' }, { id: 21207, name: 'Gasolina e gás natural' },
    { id: 21208, name: 'Gasolina, álcool e gás natural' },
  ],
  opcionais: [
    { id: 1, name: 'Air bag' }, { id: 2, name: 'Air bag do motorista' }, { id: 3, name: 'Alarme' }, { id: 4, name: 'Ar condicionado' },
    { id: 5, name: 'Bancos de couro' }, { id: 6, name: 'Câmera de ré' }, { id: 7, name: 'Computador de bordo' },
    { id: 8, name: 'Direção hidráulica' }, { id: 9, name: 'Rodas de liga leve' }, { id: 10, name: 'Sensor de estacionamento' },
    { id: 11, name: 'Travas elétricas' }, { id: 12, name: 'Vidros elétricos' }, { id: 13, name: 'Controle automático de velocidade' },
    { id: 14, name: 'Teto solar' }, { id: 15, name: 'Isofix' },
  ],
}
const car = (over = {}) => ({
  id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  brand: 'Toyota',
  model: 'Corolla',
  version: 'XEi 2.0 Flex Aut.',
  year: 2022,
  modelYear: '2022/2023',
  km: 45000,
  transmission: 'Automático CVT',
  fuel: 'Flex',
  color: 'Prata',
  doors: 4,
  category: 'sedan',
  condition: 'Único dono',
  price: 139900,
  originalPrice: 145000,
  highlights: ['Ar-condicionado digital', 'Câmera de ré', 'Bancos de couro', 'Piloto automático', 'IPVA 2026 pago', 'Isofix'],
  description: 'Corolla impecável, revisado.',
  images: ['/uploads/carros/0123456789abcdef0123456789abcdef.webp', '/uploads/carros/fedcba9876543210fedcba9876543210.jpg'],
  status: 'disponivel',
  hidden: false,
  plate: 'abc-1d23',
  entryType: 'showroom',
  webmotorsPublish: true,
  webmotorsCatalog: { brandId: 26, brandName: 'TOYOTA', modelId: 730, modelName: 'COROLLA', versionId: 344515, versionName: '2.0 XEI 16V FLEX 4P AUTOMÁTICO' },
  ...over,
})
const modality = { code: 2943, type: 'U', name: 'Usados' }
const ctx = { siteUrl: SITE, settings: {}, modality, lists: LISTS }

test('webmotors: placa, CNPJ, anos e portas', () => {
  assert.equal(wmPlate('abc-1d23'), 'ABC1D23')
  assert.equal(wmPlate('AB12345'), '')
  assert.equal(wmCnpj('12.345.678/0001-90'), '12345678000190')
  assert.equal(wmCnpj('123'), '')
  assert.deepEqual(wmYears({ modelYear: '2022/2023' }), { fab: 2022, model: 2023 })
  assert.deepEqual(wmYears({ modelYear: '2023', year: 2022 }), { fab: 2022, model: 2023 })
  assert.deepEqual(wmYears({ modelYear: '2023', year: 2019 }), { fab: 2023, model: 2023 })
  assert.deepEqual(wmYears({ modelYear: '22/23', year: 2022 }), { fab: 2022, model: 2022 })
  assert.equal(wmYears({ modelYear: '2023/2021' }), null)
  assert.equal(wmYears({ modelYear: '', year: '' }), null)
  assert.equal(wmDoors(4), 4)
  assert.equal(wmDoors(0), 0)
  assert.equal(wmDoors('5'), 5)
})

test('webmotors: fotos em JPG, sem repetir e até 20', () => {
  assert.equal(wmImageUrl('/uploads/carros/0123456789abcdef0123456789abcdef.webp', `${SITE}/`), `${SITE}/uploads/carros/jpg/0123456789abcdef0123456789abcdef.jpg`)
  assert.equal(wmImageUrl('/uploads/carros/abc.webp', SITE), null)
  assert.equal(wmImageUrl('https://cdn.com/a.webp', SITE), null)
  assert.equal(wmImageUrl('https://cdn.com/a.jpg?x=1', SITE), 'https://cdn.com/a.jpg?x=1')
  const many = Array.from({ length: 25 }, (_, i) => `/uploads/carros/${String(i).padStart(8, '0')}.webp`)
  assert.equal(wmImages({ images: [...many, many[0]] }, SITE).length, 20)
  assert.equal(wmImages({ images: [many[0], many[0]] }, SITE).length, 1)
})

test('webmotors: quem vai e por que não vai', () => {
  assert.equal(wmOutReason(car()), '')
  assert.equal(wmOutReason(car({ category: 'moto' })), 'Moto (a Webmotors usa outro serviço para motos)')
  assert.equal(wmOutReason(car({ webmotorsPublish: false })), 'Desmarcado para a Webmotors')
  assert.equal(wmOutReason(car({ entryType: 'repasse' })), 'Repasse')
  assert.equal(wmOutReason(car({ status: 'vendido' })), 'Vendido')
  assert.equal(wmOutReason(car({ status: 'reservado' })), 'Reservado')
  assert.equal(wmOutReason(car({ status: 'manutencao' })), 'Em manutenção')
  assert.equal(wmOutReason(car({ hidden: true })), 'Oculto do site')
})

test('webmotors: o que falta (com e sem as listas da Webmotors)', () => {
  assert.deepEqual(wmMissing(car(), ctx), [])
  const bad = car({ webmotorsCatalog: {}, plate: '', price: null, modelYear: '', year: null, doors: 0, images: [], color: 'Furta-cor', transmission: '', fuel: '' })
  assert.deepEqual(wmMissing(bad, ctx), ['catalogo', 'placa', 'preco', 'ano', 'portas', 'foto', 'cor', 'cambio', 'combustivel'])
  // Sem as listas (estoque e início), cor, câmbio e combustível ficam para a função
  assert.deepEqual(wmMissing(bad, { siteUrl: SITE }), ['catalogo', 'placa', 'preco', 'ano', 'portas', 'foto'])
  // O escolhido no cadastro vale mesmo sem combinar com o texto
  const chosen = car({ color: 'Furta-cor', webmotorsCatalog: { ...car().webmotorsCatalog, colorId: 30410, colorName: 'Vinho' } })
  assert.deepEqual(wmResolve(chosen, LISTS).color, { id: 30410, name: 'Vinho' })
  assert.deepEqual(wmMissing(chosen, ctx), [])
})

test('webmotors: cor, câmbio e combustível pela lista da Webmotors', () => {
  const color = (c) => wmPick(wmRankColors(c, LISTS.cores))?.name || null
  assert.equal(color('Prata'), 'Prata')
  assert.equal(color('Branco Pérola'), 'Branco')
  assert.equal(color('Branca'), 'Branco')
  assert.equal(color('Preto Ninja'), 'Preto')
  assert.equal(color('Cinza Grafite'), 'Cinza')
  assert.equal(color('Grafite'), 'Cinza')
  assert.equal(color('Vermelho Tornado'), 'Vermelho')
  assert.equal(color('Bordô'), 'Vinho')
  assert.equal(color('Furta-cor'), null)
  assert.equal(color(''), null)
  const gear = (t) => wmPick(wmRankGears(t, LISTS.cambios))?.name || null
  assert.equal(gear('Manual'), 'Manual')
  assert.equal(gear('Automático'), 'Automática')
  assert.equal(gear('Automático 6 marchas'), 'Automática')
  assert.equal(gear('Automático CVT'), 'CVT')
  assert.equal(wmPick(wmRankGears('Automático CVT', LISTS.cambios.filter((o) => o.name !== 'CVT')))?.name, 'Automática')
  assert.equal(gear('Automatizado'), 'Automatizada')
  assert.equal(gear(''), null)
  const fuel = (f) => wmPick(wmRankFuels(f, LISTS.combustiveis))?.name || null
  assert.equal(fuel('Flex'), 'Gasolina e álcool')
  assert.equal(fuel('Gasolina'), 'Gasolina')
  assert.equal(fuel('Diesel'), 'Diesel')
  assert.equal(fuel('Híbrido'), 'Gasolina e elétrico')
  assert.equal(fuel('Elétrico'), 'Elétrico')
  assert.equal(fuel('GNV'), 'Gasolina e gás natural')
  assert.equal(fuel(''), null)
})

test('webmotors: opcionais pelos destaques', () => {
  assert.deepEqual(wmOptionals(car(), LISTS.opcionais), [4, 5, 6, 13, 15])
  // "6 airbags" pega o geral ("Air bag"), não o "do motorista"
  assert.deepEqual(wmOptionals(car({ highlights: ['6 airbags', 'Rodas de liga leve aro 17', 'Teto solar'] }), LISTS.opcionais), [1, 9, 14])
  // Destaque com o mesmo nome do opcional entra mesmo sem regra
  assert.deepEqual(wmOptionals(car({ highlights: ['Direção hidráulica', 'Alarme'] }), LISTS.opcionais), [3, 8])
  assert.deepEqual(wmOptionals(car(), []), [])
})

test('webmotors: texto do anúncio', () => {
  assert.equal(wmObservation(car(), { footer: ' Financiamos em até 60x. ' }), 'Corolla impecável, revisado.\n\nFinanciamos em até 60x.')
  const text = wmObservation(car({ description: '' }), {})
  assert.match(text, /^Toyota Corolla XEi 2\.0 Flex Aut\.\n\nAno 2022\/2023 · 45\.000 km · Câmbio automático cvt · Flex · Cor prata/)
  assert.match(text, /- Câmera de ré/)
  assert.equal(wmObservation(car({ description: 'x'.repeat(5000) })).length, 3000)
})

test('webmotors: anúncio completo', () => {
  const { ad, photos, labels, missing } = buildWebmotorsAd(car(), { ...ctx, settings: { exchange: 'nao', footer: 'Aceitamos cartão.' } })
  assert.deepEqual(missing, [])
  assert.deepEqual(ad, {
    CodigoModalidade: 2943,
    TipoAnuncio: 'U',
    CodigoMarca: 26,
    CodigoModelo: 730,
    CodigoVersao: 344515,
    AnoDoModelo: 2023,
    AnoFabricacao: 2022,
    Km: 45000,
    Placa: 'ABC1D23',
    CodigoCambio: 23006,
    NrPortas: 4,
    CodigoCor: 30405,
    CodigoCombustivel: 21201,
    Blindado: 'N',
    AdaptadoDeficientesFisicos: 'N',
    UnicoDono: 'S',
    Alienado: 'N',
    IpvaPago: 'S',
    NaoAceitaTroca: 'S',
    RevisadoOficinaAgendaDoCarro: 'N',
    RevisoesEmConcessionaria: 'N',
    GarantiaDeFabrica: 'N',
    Licenciado: 'N',
    Leilao: 'N',
    PrecoReal: 145000,
    PrecoVenda: 139900,
    Observacao: 'Corolla impecável, revisado.\n\nAceitamos cartão.',
    Opcional: [4, 5, 6, 13, 15],
  })
  assert.deepEqual(photos, [`${SITE}/uploads/carros/jpg/0123456789abcdef0123456789abcdef.jpg`, `${SITE}/uploads/carros/fedcba9876543210fedcba9876543210.jpg`])
  assert.equal(labels.cor, 'Prata')
  assert.equal(labels.cambio, 'CVT')
  assert.deepEqual(labels.opcionais, ['Ar condicionado', 'Bancos de couro', 'Câmera de ré', 'Controle automático de velocidade', 'Isofix'])
  // Sem preço antigo maior, "de" e "por" iguais; blindado, garantia, licenciado e revisões pelos destaques
  const other = buildWebmotorsAd(car({
    originalPrice: null, condition: 'Segundo dono',
    highlights: ['Blindado nível III', 'Na garantia de fábrica', 'Licenciado 2026', 'Revisões feitas na concessionária'],
  }), ctx).ad
  assert.equal(other.PrecoReal, 139900)
  assert.equal(other.UnicoDono, 'N')
  assert.deepEqual([other.Blindado, other.GarantiaDeFabrica, other.Licenciado, other.RevisoesEmConcessionaria, other.NaoAceitaTroca], ['S', 'S', 'S', 'S', 'N'])
})

test('webmotors: sem a modalidade ou as listas não monta', () => {
  assert.deepEqual(buildWebmotorsAd(car(), { ...ctx, modality: null }).missing, ['modalidade'])
  assert.deepEqual(buildWebmotorsAd(car(), { siteUrl: SITE, modality }).missing, ['cor', 'cambio', 'combustivel'])
  assert.equal(buildWebmotorsAd(car({ plate: '' }), ctx).ad, null)
})

test('webmotors: linha do banco e versões do ano', () => {
  const row = {
    id: 'c1', brand: 'Fiat', model: 'Argo', version: 'Drive', year: 2021, model_year: '2021/2022', km: 1, transmission: 'Manual',
    fuel: 'Flex', color: 'Branco', doors: 4, category: 'hatch', condition: '', price: 70000, original_price: 72000, highlights: null,
    description: null, images: null, status: 'disponivel', hidden: null, plate: null, entry_type: null, webmotors_publish: null,
    webmotors_catalog: null,
  }
  const c = wmCarFromRow(row)
  assert.equal(c.webmotorsPublish, true)
  assert.deepEqual(c.webmotorsCatalog, {})
  assert.equal(c.originalPrice, 72000)
  assert.equal(c.entryType, 'showroom')
  const versions = [{ id: 1, name: 'A', years: [2021, 2022] }, { id: 2, name: 'B', years: [2019] }, { id: 3, name: 'C', years: [] }]
  assert.deepEqual(wmVersionsForYear(versions, 2022).map((v) => v.id), [1])
  assert.deepEqual(wmVersionsForYear(versions, 2030).map((v) => v.id), [1, 2, 3])
})

test('webmotors: envelope SOAP na ordem do WSDL', () => {
  const { ad } = buildWebmotorsAd(car(), ctx)
  const param = wmAnuncioParam(ad, 0)
  assert.deepEqual(Object.keys(param).slice(0, 4), ['CodigoAnuncio', 'CodigoModalidade', 'TipoAnuncio', 'CodigoMarca'])
  assert.equal(Object.keys(param).at(-1), 'Opcional')
  assert.equal(wmAnuncioParam({ ...ad, Opcional: [] }, 77).Opcional, undefined)
  assert.equal(wmAnuncioParam(ad, 77).CodigoAnuncio, 77)
  const xml = wmSoapEnvelope(WM_NAMESPACE, 'AlterarCarro', { pHashAutenticacao: 'abc', pAnuncio: wmAnuncioParam({ ...ad, Observacao: 'Tem <b> & "aspas"\u0007' }, 77) })
  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?><soap:Envelope /)
  assert.match(xml, /<AlterarCarro xmlns="www\.webmotors\.com\.br\/wsEstoqueRevendedorWebMotors"><pHashAutenticacao>abc<\/pHashAutenticacao><pAnuncio><CodigoAnuncio>77<\/CodigoAnuncio>/)
  assert.match(xml, /<Observacao>Tem &lt;b&gt; &amp; "aspas"<\/Observacao>/)
  assert.match(xml, /<Opcional><OpcionalWM><CodigoOpcional>4<\/CodigoOpcional><\/OpcionalWM><OpcionalWM>/)
  // Lido de volta, dá o mesmo
  const back = wmParseXml(xml).Envelope.Body.AlterarCarro.pAnuncio
  assert.equal(back.CodigoAnuncio, '77')
  assert.equal(back.Placa, 'ABC1D23')
  assert.deepEqual(back.Opcional.OpcionalWM.map((o) => o.CodigoOpcional), ['4', '5', '6', '13', '15'])
})

const respond = (operation, inner) =>
  '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soap:Body>' +
  `<${operation}Response xmlns="www.webmotors.com.br/wsEstoqueRevendedorWebMotors"><${operation}Result>${inner}</${operation}Result></${operation}Response>` +
  '</soap:Body></soap:Envelope>'

test('webmotors: leitura das respostas (resultado, falha e listas)', () => {
  const ok = wmSoapResult(respond('IncluirCarro', '<CodigoAnuncio>123456</CodigoAnuncio><Placa>ABC1D23</Placa><CodigoRetorno>500</CodigoRetorno>'), 'IncluirCarro')
  assert.equal(ok.fault, null)
  assert.equal(ok.result.CodigoAnuncio, '123456')
  assert.equal(wmReturnOk(ok.result.CodigoRetorno), true)
  assert.equal(wmResultCode(ok.result), '500')
  const fault = wmSoapResult('<soap:Envelope xmlns:soap="x"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>Hash inválido &amp; vencido</faultstring></soap:Fault></soap:Body></soap:Envelope>', 'IncluirCarro')
  assert.deepEqual(fault, { fault: 'Hash inválido & vencido', result: null })
  assert.equal(wmSoapResult('<html>erro</html>', 'IncluirCarro').fault, 'resposta inválida da Webmotors')
  assert.equal(wmSoapResult(respond('ExcluirCarro', ''), 'ExcluirCarro').result, '')
  // CDATA, comentário, autofechado e entidade numérica
  const parsed = wmParseXml('<a><!-- x --><b><![CDATA[<1 & 2>]]></b><c/><d>&#233;&#x41;</d><d>2</d></a>')
  assert.deepEqual(parsed, { a: { b: '<1 & 2>', c: '', d: ['éA', '2'] } })

  const marcas = wmSoapResult(respond('ObterMarca', '<MarcaWM><CodigoMarca>26</CodigoMarca><NomeMarca>TOYOTA</NomeMarca></MarcaWM>' +
    '<MarcaWM><CodigoMarca>3</CodigoMarca><NomeMarca>AUDI</NomeMarca></MarcaWM><MarcaWM><CodigoMarca>x</CodigoMarca><NomeMarca>?</NomeMarca></MarcaWM>'), 'ObterMarca').result
  assert.deepEqual(wmOptionsFrom('marcas', marcas), [{ id: 3, name: 'AUDI' }, { id: 26, name: 'TOYOTA' }])
  const um = wmSoapResult(respond('ObterModelo', '<ModeloWM><CodigoMarca>26</CodigoMarca><CodigoModelo>730</CodigoModelo><NomeModelo>COROLLA</NomeModelo></ModeloWM>'), 'ObterModelo').result
  assert.deepEqual(wmOptionsFrom('modelos', um), [{ id: 730, name: 'COROLLA' }])
  const versoes = wmSoapResult(respond('ObterVersao', '<Versao><CodigoModelo>730</CodigoModelo><CodigoVersao>344515</CodigoVersao>' +
    '<NomeVersao>2.0 XEI 16V FLEX 4P AUTOMÁTICO</NomeVersao><AnoModelo><AnoModeloWM><AnoModelo>2022</AnoModelo></AnoModeloWM>' +
    '<AnoModeloWM><AnoModelo>2023</AnoModelo></AnoModeloWM></AnoModelo></Versao>'), 'ObterVersao').result
  assert.deepEqual(wmOptionsFrom('versoes', versoes), [{ id: 344515, name: '2.0 XEI 16V FLEX 4P AUTOMÁTICO', years: [2022, 2023] }])
  const cores = wmSoapResult(respond('ObterCores', '<CorWM><CodigoCor>30404</CodigoCor><Descricao>Prata</Descricao></CorWM>'), 'ObterCores').result
  assert.deepEqual(wmOptionsFrom('cores', cores), [{ id: 30404, name: 'Prata' }])
  assert.deepEqual(wmOptionsFrom('cambios', ''), [])
  assert.deepEqual(wmOptionsFrom('desconhecida', cores), [])
  assert.deepEqual(wmList({ X: { a: 1 } }, 'X'), [{ a: 1 }])
})

test('webmotors: modalidades e vagas do plano', () => {
  const result = wmSoapResult(respond('ObterModalidade', '<ModalidadeWM><CodigoModalidade>2943</CodigoModalidade><Descricao>Usados</Descricao>' +
    '<TipoAnuncio>U</TipoAnuncio><QuantidadeAnunciosTotal>30</QuantidadeAnunciosTotal><QuantidadeAnuncios>30</QuantidadeAnuncios>' +
    '<Prioridade>1</Prioridade><PermiteFoto>S</PermiteFoto></ModalidadeWM>'), 'ObterModalidade').result
  const list = wmModalities(result)
  assert.deepEqual(list, [{ code: 2943, name: 'Usados', type: 'U', total: 30, used: 30, photos: true }])
  assert.deepEqual(wmOptionsFrom('modalidades', result), list)
  assert.equal(wmModalityFull(list[0]), true)
  assert.equal(wmModalityFull({ ...list[0], used: 29 }), false)
  assert.equal(wmModalityFull({ ...list[0], total: 0 }), false)
  assert.equal(wmModalityFull(null), false)
})

test('webmotors: códigos de retorno', () => {
  // 500 = deu certo (testes da coleção oficial do Postman)
  assert.equal(wmReturnOk('500'), true)
  assert.equal(wmReturnOk(' 500 '), true)
  assert.equal(wmReturnOk('0'), false)
  assert.equal(wmReturnOk(''), false)
  assert.equal(wmReturnOk(undefined), false)
  assert.equal(wmReturnOk('22|78'), false)
  assert.equal(wmReturnOk('500|78'), false)
  assert.deepEqual(wmReturnCodes('22|78'), ['22', '78'])
  assert.deepEqual(wmReturnCodes('500|78'), ['78'])
  assert.deepEqual(wmReturnCodes('500'), [])
  assert.deepEqual(wmReturnCodes('0'), [])
  // Nas listas o código vem em cada item
  const lista = wmSoapResult(respond('ObterMarca', '<MarcaWM><CodigoMarca>26</CodigoMarca><NomeMarca>TOYOTA</NomeMarca>' +
    '<CodigoRetorno>500</CodigoRetorno></MarcaWM><MarcaWM><CodigoMarca>3</CodigoMarca><NomeMarca>AUDI</NomeMarca><CodigoRetorno>500</CodigoRetorno></MarcaWM>'), 'ObterMarca').result
  assert.equal(wmResultCode(lista), '500')
  const recusada = wmSoapResult(respond('ObterMarca', '<MarcaWM><CodigoMarca>0</CodigoMarca><CodigoRetorno>401</CodigoRetorno></MarcaWM>'), 'ObterMarca').result
  assert.equal(wmResultCode(recusada), '401')
  assert.deepEqual(wmOptionsFrom('marcas', recusada), [])
  const estoque = wmSoapResult(respond('ObterEstoqueAtualPaginado', '<TotalAnuncios>1</TotalAnuncios><Anuncios><Anuncio>' +
    '<CodigoAnuncio>9</CodigoAnuncio><CodigoRetorno>500</CodigoRetorno></Anuncio></Anuncios>'), 'ObterEstoqueAtualPaginado').result
  assert.equal(wmResultCode(estoque), '500')
  assert.equal(wmResultCode(''), '')
  assert.equal(wmResultCode({ TotalAnuncios: '0', Anuncios: '' }), '')
  assert.equal(wmReturnText(['22', '78']), 'a Webmotors recusou (código 22, 78)')
  assert.equal(wmReturnText([]), 'a Webmotors recusou o pedido')
})

test('webmotors: a cópia dentro da Edge Function é idêntica a src/utils/webmotorsAd.js', () => {
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const fn = read('../supabase/functions/webmotors/index.ts')
  const start = fn.indexOf('// <webmotorsAd.js>\n')
  const end = fn.indexOf('// </webmotorsAd.js>')
  assert.ok(start > -1 && end > start, 'marcadores // <webmotorsAd.js> e // </webmotorsAd.js> na função')
  assert.equal(fn.slice(start + '// <webmotorsAd.js>\n'.length, end), read('../src/utils/webmotorsAd.js'))
})
