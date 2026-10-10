import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { makeFipeSources, fipeQuery, FipeError, fipeCacheKey, fipeCacheFresh, checkFipeParams, fipeCandidatesForCrlv } from '../src/utils/fipeFontes.js'
import { makeApiBrasilProvider, makeMockProvider, vehicleFromAgregados, candidatesFromPlacaFipe, sanitizePlateResult, PlacaError } from '../src/utils/placaProvedor.js'
import { parseCrlvText, textFromPdfItems } from '../src/utils/crlvParser.js'

// fetch de mentira: responde pela URL; registra as chamadas
function fakeFetch(routes) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url, init })
    for (const [match, reply] of routes) {
      if (url.includes(match)) {
        const r = typeof reply === 'function' ? await reply(url, init) : reply
        if (r instanceof Error) throw r
        return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, json: async () => r.body }
      }
    }
    return { status: 404, ok: false, json: async () => ({}) }
  }
  fn.calls = calls
  return fn
}

test('FIPE: usa a BrasilAPI e devolve no formato comum', async () => {
  const fetch = fakeFetch([['brasilapi.com.br/api/fipe/marcas/v1/carros', { body: [{ nome: 'Toyota', valor: '56' }] }]])
  const r = await fipeQuery(makeFipeSources({ fetch }), 'marcas', { tipo: 'carros' })
  assert.deepEqual(r, { data: [{ code: '56', name: 'Toyota' }], source: 'brasilapi' })
  assert.equal(fetch.calls.length, 1)
})

test('FIPE: BrasilAPI fora do ar (ou erro com 200) -> fipe.api.br', async () => {
  const fetch = fakeFetch([
    ['brasilapi.com.br', { status: 200, body: { message: 'Fonte de dados FIPE temporariamente indisponível.', type: 'internal', name: 'InternalError' } }],
    ['parallelum.com.br/api/v2/cars/brands/56/models/5194/years/2023-5', {
      body: { price: 'R$ 124.399,00', brand: 'Toyota', model: 'Corolla XEi 2.0 Flex 16V Aut.', modelYear: 2023, fuel: 'Flex', codeFipe: '002111-3', referenceMonth: 'outubro de 2026' },
    }],
  ])
  const r = await fipeQuery(makeFipeSources({ fetch, token: 'tok' }), 'valor', { tipo: 'carros', marca: '56', modelo: '5194', ano: '2023-5' })
  assert.equal(r.source, 'fipe.api.br')
  assert.deepEqual(r.data, { code: '002111-3', brand: 'Toyota', model: 'Corolla XEi 2.0 Flex 16V Aut.', modelYear: 2023, fuel: 'Flex', value: 124399, reference: 'outubro de 2026', referenceKey: '2026-10' })
  // token gratuito vai no cabeçalho da fipe.api.br
  assert.equal(fetch.calls[1].init.headers['X-Subscription-Token'], 'tok')
})

test('FIPE: tempo esgotado na principal -> reserva; limite nas duas -> erro "limite"', async () => {
  const timeout = fakeFetch([
    ['brasilapi.com.br', new Error('abortado')],
    ['parallelum.com.br', { body: [{ code: '2023-5', name: '2023 Flex' }] }],
  ])
  const ok = await fipeQuery(makeFipeSources({ fetch: timeout }), 'anos', { tipo: 'carros', marca: '56', modelo: '5194' })
  assert.equal(ok.source, 'fipe.api.br')
  const limit = fakeFetch([['brasilapi.com.br', { status: 503, body: {} }], ['parallelum.com.br', { status: 429, body: {} }]])
  await assert.rejects(fipeQuery(makeFipeSources({ fetch: limit }), 'marcas', { tipo: 'motos' }), (err) => err instanceof FipeError && err.reason === 'limite')
  const down = fakeFetch([['brasilapi.com.br', { status: 500, body: {} }], ['parallelum.com.br', new Error('rede')]])
  await assert.rejects(fipeQuery(makeFipeSources({ fetch: down }), 'marcas', { tipo: 'carros' }), (err) => err.reason === 'fora')
})

test('FIPE: parâmetros conferidos antes de qualquer chamada', async () => {
  const fetch = fakeFetch([])
  assert.throws(() => checkFipeParams('marcas', { tipo: 'avioes' }), FipeError)
  assert.throws(() => checkFipeParams('modelos', { tipo: 'carros', marca: '56/../x' }), FipeError)
  assert.throws(() => checkFipeParams('valor', { tipo: 'carros', marca: '56', modelo: '5194', ano: '2023' }), FipeError)
  assert.throws(() => checkFipeParams('codigo', { tipo: 'carros', codigo: '0021113', ano: '2023-5' }), FipeError)
  await assert.rejects(fipeQuery(makeFipeSources({ fetch }), 'marcas', { tipo: 'x' }), (err) => err.reason === 'invalido')
  assert.equal(fetch.calls.length, 0)
})

test('FIPE: pelo código (atualizar o valor do carro salvo) acha o ano e o combustível', async () => {
  const fetch = fakeFetch([['brasilapi.com.br/api/fipe/preco/v1/002111-3', {
    body: [
      { valor: 'R$ 130.000,00', marca: 'Toyota', modelo: 'Corolla XEi', anoModelo: 2024, combustivel: 'Flex', codigoFipe: '002111-3', mesReferencia: 'outubro de 2026' },
      { valor: 'R$ 124.399,00', marca: 'Toyota', modelo: 'Corolla XEi', anoModelo: 2023, combustivel: 'Flex', codigoFipe: '002111-3', mesReferencia: 'outubro de 2026' },
    ],
  }]])
  const r = await fipeQuery(makeFipeSources({ fetch }), 'codigo', { tipo: 'carros', codigo: '002111-3', ano: '2023-5', combustivel: 'Flex' })
  assert.equal(r.data.value, 124399)
  assert.equal(r.data.modelYear, 2023)
})

test('FIPE: cache das listas por 30 dias e do valor até virar o mês de referência', () => {
  const now = new Date('2026-10-20T15:00:00Z')
  assert.equal(fipeCacheKey('modelos', { tipo: 'carros', marca: '56' }), 'modelos/carros/56')
  assert.equal(fipeCacheKey('valor', { tipo: 'carros', marca: '56', modelo: '5194', ano: '2023-5' }), 'valor/carros/56/5194/2023-5')
  assert.equal(fipeCacheFresh('marcas', { fetched_at: '2026-09-25T00:00:00Z' }, now), true)
  assert.equal(fipeCacheFresh('marcas', { fetched_at: '2026-09-15T00:00:00Z' }, now), false)
  assert.equal(fipeCacheFresh('valor', { fetched_at: '2026-10-02T00:00:00Z', reference: 'outubro de 2026' }, now), true)
  // Valor de setembro: só vale por um dia (a FIPE pode não ter publicado outubro ainda)
  assert.equal(fipeCacheFresh('valor', { fetched_at: '2026-10-20T03:00:00Z', reference: 'setembro de 2026' }, now), true)
  assert.equal(fipeCacheFresh('valor', { fetched_at: '2026-10-10T00:00:00Z', reference: 'setembro de 2026' }, now), false)
  assert.equal(fipeCacheFresh('valor', null, now), false)
})

// -- Placa (APIBrasil): só com respostas de mentira ---------------------------------

const AGREGADOS = {
  error: false, message: 'ok', status_code: 200,
  user: { first_name: 'Conta', email: 'conta@example.com', cellphone: '000' },
  data: {
    placa: 'ABC1D23', chassi: '9BRBDWHE5N0123456', marca: 'TOYOTA', modelo: 'COROLLA', versao: 'XEI 2.0 FLEX',
    ano_fabricacao: '2021', ano_modelo: '2022', cor: 'PRATA', combustivel: 'ALCOOL/GASOLINA', quantidade_portas: '4',
    transmissao_descricao: 'AUTOMATICA', especie: 'PASSAGEIRO', cidade: 'SAO LUIS', uf_jurisdicao: 'MA',
    documento_faturado: '00000000000', tipo_faturado: 'PF', uf_faturado: 'MA', numero_motor: 'M20AJ123',
  },
}
const PLACA_FIPE = {
  error: false,
  data: {
    resultados: [
      { codigoFipe: '002111-3', modelo: 'Corolla XEi 2.0 Flex 16V Aut.', marca: 'Toyota', anoModelo: 2022, combustivel: 'Flex', valor: 118500, mesReferencia: 'outubro de 2026', principal: false },
      { codigoFipe: '002110-5', modelo: 'Corolla GLi 2.0 Flex 16V Aut.', marca: 'Toyota', anoModelo: 2022, combustivel: 'Flex', valor: 110200, mesReferencia: 'outubro de 2026', principal: true },
    ],
  },
}

function apiBrasilFetch(replies) {
  return fakeFetch([['gateway.apibrasil.io', (url, init) => {
    const body = JSON.parse(init.body)
    const reply = replies[body.tipo]
    return typeof reply === 'function' ? reply(body) : reply
  }]])
}

test('placa: junta os dados do veículo e os candidatos FIPE, sem nada da conta ou do dono', async () => {
  const fetch = apiBrasilFetch({ 'agregados-propria': { body: AGREGADOS }, 'fipe-chassi': { body: PLACA_FIPE } })
  const provider = makeApiBrasilProvider({ fetch, token: 'tok-teste', homolog: true })
  const r = await provider.lookupByPlate('abc-1d23')
  assert.deepEqual(r.vehicle, {
    plate: 'ABC1D23', brand: 'Toyota', model: 'Corolla', version: 'XEI 2.0 FLEX', year: 2021, modelYear: '2021/2022', modelYearNumber: 2022,
    color: 'Prata', fuel: 'Flex', transmission: 'Automático', chassis: '9BRBDWHE5N0123456', doors: 4, category: '',
  })
  assert.equal(r.fipeCandidates[0].code, '002110-5')
  assert.equal(r.fipeCandidates[0].principal, true)
  const json = JSON.stringify(r)
  for (const forbidden of ['conta@example.com', 'documento', 'faturado', 'SAO LUIS', 'M20AJ123']) assert.ok(!json.includes(forbidden), forbidden)
  // token só no cabeçalho, nunca no corpo; homologação ligada
  assert.equal(fetch.calls[0].init.headers.Authorization, 'Bearer tok-teste')
  assert.equal(JSON.parse(fetch.calls[0].init.body).homolog, true)
  assert.ok(!fetch.calls[0].init.body.includes('tok-teste'))
})

test('placa: erro que vem com HTTP 200, saldo acabado (402) e placa inválida', async () => {
  const erro200 = apiBrasilFetch({ 'agregados-propria': { status: 200, body: { error: true, message: 'Placa não encontrada' } } })
  await assert.rejects(makeApiBrasilProvider({ fetch: erro200, token: 't' }).lookupByPlate('ABC1D23'),
    (err) => err instanceof PlacaError && err.code === 'recusado' && err.message.includes('Placa não encontrada'))
  assert.equal(erro200.calls.length, 1)
  const semSaldo = apiBrasilFetch({ 'agregados-propria': { status: 402, body: { error: true } } })
  await assert.rejects(makeApiBrasilProvider({ fetch: semSaldo, token: 't' }).lookupByPlate('ABC1D23'), (err) => err.code === 'saldo')
  assert.equal(semSaldo.calls.length, 1)
  const nada = fakeFetch([])
  await assert.rejects(makeApiBrasilProvider({ fetch: nada, token: 't' }).lookupByPlate('AB12'), (err) => err.code === 'placa')
  assert.equal(nada.calls.length, 0)
  assert.throws(() => makeApiBrasilProvider({ fetch: nada, token: '' }), PlacaError)
})

test('placa: falha de rede repete uma vez; sem candidatos FIPE, devolve só o veículo', async () => {
  let tries = 0
  const fetch = apiBrasilFetch({
    'agregados-propria': () => (++tries === 1 ? new Error('rede') : { body: AGREGADOS }),
    'fipe-chassi': { status: 200, body: { error: true, message: 'sem FIPE' } },
  })
  const r = await makeApiBrasilProvider({ fetch, token: 't' }).lookupByPlate('ABC1D23')
  assert.equal(tries, 2)
  assert.equal(r.vehicle.brand, 'Toyota')
  assert.deepEqual(r.fipeCandidates, [])
})

test('placa: mapeamentos e lista branca', async () => {
  assert.equal(vehicleFromAgregados({ chassi: '123', especie: 'PASSAGEIRO MOTOCICLETA' }).chassis, '')
  assert.equal(vehicleFromAgregados({ especie: 'MOTOCICLETA' }).category, 'moto')
  assert.deepEqual(candidatesFromPlacaFipe({ resultados: [{ codigoFipe: 'x' }] }), [])
  const clean = sanitizePlateResult({ vehicle: { brand: 'Fiat', owner: 'Fulano', cpf: '1' }, fipeCandidates: [{ code: '001004-9', historico: [1] }] })
  assert.deepEqual(clean, { vehicle: { brand: 'Fiat' }, fipeCandidates: [{ code: '001004-9' }] })
  const mock = makeMockProvider({ ABC1D23: { vehicle: { brand: 'Fiat' }, fipeCandidates: [] } })
  assert.equal((await mock.lookupByPlate('abc1d23')).vehicle.brand, 'Fiat')
  await assert.rejects(mock.lookupByPlate('XYZ9A99'), (err) => err.code === 'recusado')
})

// -- CRLV-e: texto do PDF e versões FIPE ---------------------------------------------

const item = (str, x, y, width = str.length * 5, size = 9) => ({ str, transform: [size, 0, 0, size, x, y], width })

test('PDF: itens de texto viram linhas (colunas com espaço, pedaços colados juntos)', () => {
  const page = [
    item('QWE4R56', 200, 680), item('00987654322', 40, 680),
    item('CODIGO RENAVAM', 40, 700), item('PLA', 200, 700, 15), item('CA', 215, 700.6, 10),
    item('', 300, 700), item('2026', 320, 680.2),
  ]
  assert.equal(textFromPdfItems([page, [item('CHASSI', 40, 700)]]), 'CODIGO RENAVAM PLACA\n00987654322 QWE4R56 2026\nCHASSI')
  assert.equal(textFromPdfItems([]), '')
  assert.equal(textFromPdfItems([[{ str: 'x' }]]), '')
})

function fakeQuery(lists) {
  const calls = []
  const fn = async (level, params) => {
    calls.push([level, params])
    const key = fipeCacheKey(level, params)
    if (!(key in lists)) throw new FipeError('não achei', 'invalido')
    return lists[key]
  }
  fn.calls = calls
  return fn
}
const crlv = (name) => parseCrlvText(fs.readFileSync(new URL(`./fixtures/crlv/${name}.txt`, import.meta.url), 'utf8'))

test('CRLV-e -> FIPE: vencedor claro quando o nome bate e o ano existe', async () => {
  const query = fakeQuery({
    'marcas/carros': [{ code: '21', name: 'Fiat' }, { code: '56', name: 'Toyota' }],
    'modelos/carros/56': [
      { code: '5194', name: 'Corolla XEi 2.0 Flex 16V Aut.' }, { code: '5193', name: 'Corolla GLi 2.0 Flex 16V Aut.' },
      { code: '9001', name: 'Hilux CD SRV 4x4 2.8 TDI Diesel Aut.' },
    ],
    'anos/carros/56/5194': [{ code: '2022-5', name: '2022 Flex' }, { code: '2021-5', name: '2021 Flex' }],
    'anos/carros/56/5193': [{ code: '2022-5', name: '2022 Flex' }],
  })
  const r = await fipeCandidatesForCrlv(crlv('linhas'), query)
  assert.deepEqual(r.brand, { code: '56', name: 'Toyota' })
  assert.equal(r.winner, '5194')
  assert.equal(r.candidates[0].year.code, '2022-5')
  assert.ok(!r.candidates.some((c) => c.code === '9001'))
})

test('CRLV-e -> FIPE: modelo sem o ano do documento sai; sem nenhum, mostra os parecidos sem vencedor', async () => {
  const lists = {
    'marcas/carros': [{ code: '21', name: 'Fiat' }],
    'modelos/carros/21': [{ code: '8001', name: 'ARGO DRIVE 1.3 8V Flex' }, { code: '8002', name: 'ARGO DRIVE 1.3 8V Flex Aut.' }],
    'anos/carros/21/8001': [{ code: '2020-1', name: '2020 Gasolina' }, { code: '2020-5', name: '2020 Flex' }],
    'anos/carros/21/8002': [{ code: '2021-5', name: '2021 Flex' }],
  }
  const r = await fipeCandidatesForCrlv(crlv('colunas'), fakeQuery(lists))
  assert.deepEqual(r.candidates.map((c) => [c.code, c.year.code]), [['8001', '2020-5']])
  delete lists['anos/carros/21/8001']
  const none = await fipeCandidatesForCrlv(crlv('colunas'), fakeQuery(lists))
  assert.equal(none.winner, null)
  assert.equal(none.candidates.length, 2)
  assert.ok(none.candidates.every((c) => c.year === null))
})

test('CRLV-e -> FIPE: moto procura em motos; marca desconhecida não chama mais nada', async () => {
  const query = fakeQuery({ 'marcas/motos': [{ code: '80', name: 'HONDA' }], 'modelos/motos/80': [] })
  const r = await fipeCandidatesForCrlv(crlv('moto'), query)
  assert.equal(r.tipo, 'motos')
  assert.deepEqual(r.brand, { code: '80', name: 'HONDA' })
  const unknown = fakeQuery({ 'marcas/carros': [{ code: '1', name: 'Acura' }] })
  const r2 = await fipeCandidatesForCrlv(crlv('linhas'), unknown)
  assert.equal(r2.brand, null)
  assert.equal(unknown.calls.length, 1)
})

test('veiculo-dados: a cópia dos módulos dentro da Edge Function é idêntica aos de src/utils', () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const fn = read('../supabase/functions/veiculo-dados/index.ts')
  for (const name of ['documentosVeiculo.js', 'fipeMatch.js', 'crlvParser.js', 'fipeFontes.js', 'placaProvedor.js']) {
    const open = `// <${name}>\n`
    const start = fn.indexOf(open)
    const end = fn.indexOf(`// </${name}>`)
    assert.ok(start > -1 && end > start, `marcadores de ${name} na função`)
    const expected = read(`../src/utils/${name}`).replace(/^import [^\n]* from '\.\/[^']+'\n/gm, '')
    assert.equal(fn.slice(start + open.length, end), expected, `${name}: rode node supabase/functions/veiculo-dados/atualizar-copia.mjs`)
  }
})
