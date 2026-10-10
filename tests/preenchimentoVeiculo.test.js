import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizePlate, isValidPlate, isValidChassis, normalizeRenavam, isValidRenavam, vehicleDocWarnings } from '../src/utils/documentosVeiculo.js'
import {
  parseFipeValue, fipeReferenceKey, currentReferenceKey, fipeYearInfo, fuelFromFipe, transmissionFromFipeName,
  versionFromFipeName, fipeTokens, matchFipeBrand, rankFipeModels, clearWinner, pickFipeYear, fipeTypeForCategory,
} from '../src/utils/fipeMatch.js'
import { parseCrlvText, parseCrlvAiFields, splitCrlvBrandModel, fuelFromCrlv } from '../src/utils/crlvParser.js'

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/crlv/${name}`, import.meta.url), 'utf8')

test('placa: formato antigo e Mercosul, com ou sem hífen', () => {
  assert.equal(normalizePlate('abc-1d23'), 'ABC1D23')
  assert.equal(isValidPlate('ABC1234'), true)
  assert.equal(isValidPlate('abc-1d23'), true)
  assert.equal(isValidPlate('AB1234'), false)
  assert.equal(isValidPlate('ABCD123'), false)
  assert.equal(isValidPlate(''), false)
})

test('chassi: 17 caracteres, sem I, O ou Q', () => {
  assert.equal(isValidChassis('9BRBDWHE5N0123456'), true)
  assert.equal(isValidChassis('9brbdwhe5n0123456'), true)
  assert.equal(isValidChassis('9BRBDWHE5N012345'), false)
  assert.equal(isValidChassis('9BRBDWHE5N012345O'), false)
  assert.equal(isValidChassis('IBRBDWHE5N0123456'), false)
})

test('RENAVAM: 11 dígitos e dígito verificador (o de 9 dígitos ganha zeros)', () => {
  assert.equal(isValidRenavam('12345678900'), true)
  assert.equal(isValidRenavam('00987654322'), true)
  assert.equal(isValidRenavam('987654322'), true)
  assert.equal(normalizeRenavam('987654322'), '00987654322')
  assert.equal(isValidRenavam('12345678901'), false)
  assert.equal(isValidRenavam('11111111111'), false)
  assert.equal(isValidRenavam('1234'), false)
})

test('avisos do cadastro: só para o que está preenchido e fora do padrão', () => {
  assert.deepEqual(vehicleDocWarnings({ plate: '', chassis: '', renavam: '' }), {})
  assert.deepEqual(vehicleDocWarnings({ plate: 'ABC1D23', chassis: '9BRBDWHE5N0123456', renavam: '12345678900' }), {})
  const w = vehicleDocWarnings({ plate: 'AB12', chassis: '123', renavam: '12345678901' })
  assert.ok(w.plate && w.chassis && w.renavam)
})

test('FIPE: valor, mês de referência, ano e combustível', () => {
  assert.equal(parseFipeValue('R$ 176.046,00'), 176046)
  assert.equal(parseFipeValue(98765.4), 98765)
  assert.equal(parseFipeValue('—'), null)
  assert.equal(fipeReferenceKey('outubro de 2026'), '2026-10')
  assert.equal(fipeReferenceKey('março de 2027'), '2027-03')
  assert.equal(fipeReferenceKey(''), '')
  assert.equal(currentReferenceKey(new Date('2026-11-01T02:00:00Z')), '2026-10')
  assert.deepEqual(fipeYearInfo({ code: '2023-5', name: '2023 Flex' }), { code: '2023-5', modelYear: 2023, zeroKm: false, fuel: 'Flex', label: '2023 Flex' })
  assert.equal(fipeYearInfo({ code: '32000-5', name: '32000 Flex' }).label, 'Zero km Flex')
  assert.equal(fuelFromFipe('Flex'), 'Flex')
  assert.equal(fuelFromFipe('Gasolina'), 'Gasolina')
  assert.equal(fuelFromFipe('Híbrido'), 'Híbrido')
  assert.equal(fuelFromFipe('Álcool'), '')
  assert.equal(fipeTypeForCategory('moto'), 'motos')
  assert.equal(fipeTypeForCategory('sedan'), 'carros')
})

test('FIPE: câmbio e versão sugeridos pelo nome', () => {
  assert.equal(transmissionFromFipeName('Corolla XEi 2.0 Flex 16V Aut.'), 'Automático')
  assert.equal(transmissionFromFipeName('ONIX HATCH LT 1.0 12V Flex 5p Mec.'), 'Manual')
  assert.equal(transmissionFromFipeName('Kicks SL 1.6 16V Flex CVT'), 'Automático CVT')
  assert.equal(transmissionFromFipeName('Gol 1.0 Plus 8v 4p'), '')
  assert.equal(versionFromFipeName('Corolla XEi 2.0 Flex 16V Aut.', 'Corolla'), 'XEi 2.0 Flex 16V Aut.')
  assert.equal(versionFromFipeName('ARGO DRIVE 1.3 8V Flex', ''), 'DRIVE 1.3 8V Flex')
  assert.equal(versionFromFipeName('C-180 CGI Avant.', 'Classe C'), 'C-180 CGI Avant.')
})

test('FIPE: tokens do documento separam letras de números e acham a cilindrada', () => {
  assert.deepEqual(fipeTokens('COROLLA XEI20FLEX'), ['corolla', 'xei', '2.0', 'flex'])
  assert.deepEqual(fipeTokens('Corolla XEi 2.0 Flex 16V Aut.'), ['corolla', 'xei', '2.0', 'flex', '16v'])
})

const BRANDS = [
  { code: '56', name: 'Toyota' }, { code: '59', name: 'VW - VolksWagen' }, { code: '23', name: 'GM - Chevrolet' },
  { code: '21', name: 'Fiat' }, { code: '39', name: 'Mercedes-Benz' }, { code: '25', name: 'Honda' }, { code: '161', name: 'Caoa Chery' },
]

test('FIPE: marca do documento (com I/ de importado e siglas do DETRAN)', () => {
  assert.equal(matchFipeBrand('I/TOYOTA', BRANDS).code, '56')
  assert.equal(matchFipeBrand('VW', BRANDS).code, '59')
  assert.equal(matchFipeBrand('CHEV', BRANDS).code, '23')
  assert.equal(matchFipeBrand('GM', BRANDS).code, '23')
  assert.equal(matchFipeBrand('M.BENZ', BRANDS).code, '39')
  assert.equal(matchFipeBrand('CAOA CHERY', BRANDS).code, '161')
  assert.equal(matchFipeBrand('XYZ', BRANDS), null)
})

const TOYOTA = [
  { code: '5194', name: 'Corolla XEi 2.0 Flex 16V Aut.' },
  { code: '5193', name: 'Corolla XRS 2.0 Flex 16V Aut.' },
  { code: '5190', name: 'Corolla GLi 2.0 16V Flex Aut.' },
  { code: '9001', name: 'Corolla Cross XRX 1.8 16V Aut. (Híbrido)' },
  { code: '7001', name: 'Hilux SRV 2.8 4x4 TDI Diesel Aut.' },
]

test('FIPE: versão por semelhança, com vencedor claro só quando dá', () => {
  const ranked = rankFipeModels('COROLLA XEI20FLEX', TOYOTA)
  assert.equal(ranked[0].code, '5194')
  assert.equal(clearWinner(ranked)?.code, '5194')
  assert.ok(!ranked.some((m) => m.code === '7001'))
  // Dois candidatos quase iguais: a pessoa escolhe
  const argo = [{ code: '1', name: 'ARGO DRIVE 1.3 8V Flex' }, { code: '2', name: 'ARGO DRIVE 1.3 8V Flex Aut.' }]
  assert.equal(clearWinner(rankFipeModels('ARGO DRIVE 1.3', argo)), null)
  assert.equal(clearWinner([]), null)
})

test('FIPE: ano que combina com o ano-modelo e o combustível', () => {
  const years = [{ code: '2022-1', name: '2022 Gasolina' }, { code: '2022-5', name: '2022 Flex' }, { code: '2021-5', name: '2021 Flex' }]
  assert.equal(pickFipeYear(years, 2022, 'Flex').code, '2022-5')
  assert.equal(pickFipeYear(years, 2022).code, '2022-1')
  assert.equal(pickFipeYear(years, 2019), null)
})

// LGPD: nada do proprietário, do CRV ou do código de segurança sai da leitura
function assertNoOwnerData(result, forbidden) {
  const json = JSON.stringify(result)
  for (const text of forbidden) assert.ok(!json.includes(text), `vazou "${text}"`)
}

test('CRLV-e (rótulo e valor em linhas): dados do veículo e nada do dono', () => {
  const r = parseCrlvText(fixture('linhas.txt'))
  assert.equal(r.ok, true)
  assert.deepEqual(r.fields, {
    plate: 'ABC1D23', renavam: '12345678900', chassis: '9BRBDWHE5N0123456',
    brand: 'Toyota', model: 'Corolla', version: 'XEI20FLEX',
    year: 2021, modelYearNumber: 2022, modelYear: '2021/2022', fuel: 'Flex', color: 'Prata',
  })
  assert.deepEqual(r.invalid, [])
  assert.equal(r.raw.brandModel, 'I/TOYOTA COROLLA XEI20FLEX')
  assertNoOwnerData(r, ['FULANO', 'SILVA', '123.456.789', '12345678909', '123456789012', '98765432101', 'SAO LUIS'])
})

test('CRLV-e (layout em colunas): acha os valores longe dos rótulos e ignora o CPF', () => {
  const r = parseCrlvText(fixture('colunas.txt'))
  assert.equal(r.ok, true)
  assert.equal(r.fields.renavam, '00987654322')
  assert.equal(r.fields.plate, 'QWE4R56')
  assert.equal(r.fields.chassis, '9BD358A1NLYJ12345')
  assert.equal(r.fields.year, 2019)
  assert.equal(r.fields.modelYear, '2019/2020')
  assert.equal(r.fields.brand, 'Fiat')
  assert.equal(r.fields.model, 'Argo')
  assert.equal(r.fields.version, 'DRIVE 1.3')
  assert.equal(r.fields.color, 'Branca')
  assert.equal(r.fields.fuel, 'Flex')
  assertNoOwnerData(r, ['MARIA', 'SOUZA', '98765432100', '987654321098'])
})

test('CRLV-e de moto ("rótulo: valor" na mesma linha), dona pessoa jurídica', () => {
  const r = parseCrlvText(fixture('moto.txt'))
  assert.equal(r.ok, true)
  assert.equal(r.fields.plate, 'RST2E34')
  assert.equal(r.fields.renavam, '05551239876')
  assert.equal(r.fields.chassis, '9C2KC2210PR012345')
  assert.equal(r.fields.brand, 'Honda')
  assert.equal(r.fields.model, 'CG')
  assert.equal(r.fields.version, '160 FAN')
  assert.equal(r.fields.modelYear, '2023/2023')
  assert.equal(r.fields.category, 'moto')
  assert.equal(r.fields.color, 'Vermelha')
  assert.equal(r.fields.fuel, 'Gasolina')
  assertNoOwnerData(r, ['LOJA EXEMPLO', 'COMERCIO', '12.345.678', '12345678000195'])
})

test('CRLV-e: PDF sem texto, documento que não é CRLV-e e RENAVAM com dígito errado', () => {
  assert.deepEqual(parseCrlvText(''), { ok: false, error: 'sem_texto' })
  assert.deepEqual(parseCrlvText('   \n  '), { ok: false, error: 'sem_texto' })
  assert.deepEqual(parseCrlvText('NOTA FISCAL DE SERVICO\nVALOR TOTAL 100,00'), { ok: false, error: 'nao_e_crlv' })
  const r = parseCrlvText(fixture('linhas.txt').replace('12345678900', '12345678901'))
  assert.equal(r.fields.renavam, '12345678901')
  assert.deepEqual(r.invalid, ['renavam'])
  assert.ok(r.warnings.some((w) => w.includes('RENAVAM')))
})

test('CRLV-e: marca/modelo e combustível do documento', () => {
  assert.deepEqual(splitCrlvBrandModel('I/TOYOTA COROLLA XEI20FLEX'), { imported: true, brand: 'TOYOTA', modelText: 'COROLLA XEI20FLEX', model: 'COROLLA', version: 'XEI20FLEX' })
  assert.equal(splitCrlvBrandModel('VW / GOL 1.0L MC4').brand, 'VW')
  assert.equal(splitCrlvBrandModel('PASSAGEIRO/AUTOMOVEL'), null)
  assert.equal(splitCrlvBrandModel('ALCOOL/GASOLINA'), null)
  assert.equal(fuelFromCrlv('ALCOOL/GASOLINA'), 'Flex')
  assert.equal(fuelFromCrlv('GASOLINA/ELETRICO'), 'Híbrido')
  assert.equal(fuelFromCrlv('ELETRICO'), 'Elétrico')
  assert.equal(fuelFromCrlv('DIESEL'), 'Diesel')
  assert.equal(fuelFromCrlv('GASOLINA/GNV'), 'GNV')
  assert.equal(fuelFromCrlv('ALCOOL'), '')
})

// -- Foto do CRLV-e lida pela IA (ação crlv_foto): as mesmas regras do PDF --------------

const HOJE_FOTO = new Date('2026-10-09T12:00:00')
const FOTO = {
  e_documento_veiculo: true,
  placa: 'abc-1d23',
  renavam: '12345678900',
  chassi: '9BR BDWHE5 N0123456',
  marca_modelo_versao: 'TOYOTA/COROLLA XEI20FLEX',
  ano_fabricacao: '2021',
  ano_modelo: '2022',
  cor: 'PRATA',
  combustivel: 'ALCOOL/GASOLINA',
  especie_tipo: 'PASSAGEIRO AUTOMOVEL',
}

test('foto do CRLV-e: os campos lidos pela IA viram o cadastro, como no PDF', () => {
  const r = parseCrlvAiFields(FOTO, HOJE_FOTO)
  assert.equal(r.ok, true)
  assert.equal(r.fields.plate, 'ABC1D23')
  assert.equal(r.fields.renavam, '12345678900')
  assert.deepEqual(r.invalid, [])
  assert.equal(r.fields.chassis, '9BRBDWHE5N0123456')
  assert.equal(r.fields.brand, 'Toyota')
  assert.equal(r.fields.model, 'Corolla')
  assert.equal(r.fields.year, 2021)
  assert.equal(r.fields.modelYear, '2021/2022')
  assert.equal(r.fields.fuel, 'Flex')
  assert.equal(r.fields.color, 'Prata')
  assert.equal(r.fields.category, undefined)
  assert.equal(r.raw.brandModel, 'TOYOTA/COROLLA XEI20FLEX')
})

test('foto do CRLV-e: moto pela espécie, importado, ano modelo incoerente e RENAVAM conferido', () => {
  const moto = parseCrlvAiFields({ ...FOTO, marca_modelo_versao: 'HONDA/CG 160 FAN', especie_tipo: 'PASSAGEIRO/MOTOCICLETA' }, HOJE_FOTO)
  assert.equal(moto.fields.category, 'moto')
  assert.equal(moto.fields.brand, 'Honda')
  const importado = parseCrlvAiFields({ ...FOTO, marca_modelo_versao: 'I/BMW 320I M SPORT' }, HOJE_FOTO)
  assert.equal(importado.fields.brand, 'BMW')
  assert.equal(importado.fields.model, '320I')
  const anos = parseCrlvAiFields({ ...FOTO, ano_modelo: '2025' }, HOJE_FOTO)
  assert.equal(anos.fields.year, 2021)
  assert.equal(anos.fields.modelYear, undefined) // modelo 4 anos depois: fica para a pessoa conferir
  const renavam = parseCrlvAiFields({ ...FOTO, renavam: '12345678901' }, HOJE_FOTO)
  assert.ok(renavam.invalid.includes('renavam'))
})

test('foto do CRLV-e: foto que não é documento ou ilegível não preenche nada', () => {
  assert.deepEqual(parseCrlvAiFields({ ...FOTO, e_documento_veiculo: false }, HOJE_FOTO), { ok: false, error: 'nao_e_crlv' })
  assert.deepEqual(parseCrlvAiFields(null, HOJE_FOTO), { ok: false, error: 'nao_e_crlv' })
  const vazio = { e_documento_veiculo: true, placa: '', renavam: '', chassi: '', marca_modelo_versao: '', ano_fabricacao: '', ano_modelo: '', cor: 'PRATA', combustivel: '', especie_tipo: '' }
  assert.deepEqual(parseCrlvAiFields(vazio, HOJE_FOTO), { ok: false, error: 'ilegivel' })
  // Campos que a IA não deveria mandar (nome, CPF) são ignorados
  const r = parseCrlvAiFields({ ...FOTO, nome: 'FULANO DE TAL', cpf: '123.456.789-00' }, HOJE_FOTO)
  assert.equal(JSON.stringify(r).includes('FULANO'), false)
  assert.equal(JSON.stringify(r).includes('123.456.789'), false)
})
