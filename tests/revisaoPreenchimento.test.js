import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reviewRows, applyAutofill, brandFromFipe, brandFromDocument, modelYearText, fieldsFromFipe, fipeRecord, fipeIsOld, fipePriceNote, filterFipeModels } from '../src/utils/preenchimento.js'

test('marca do CRLV-e ou da placa: sigla vira a grafia do painel', () => {
  const known = ['Toyota', 'Volkswagen', 'Chevrolet', 'Fiat']
  assert.equal(brandFromDocument('VW', known), 'Volkswagen')
  assert.equal(brandFromDocument('Vw', known), 'Volkswagen')
  assert.equal(brandFromDocument('GM', known), 'Chevrolet')
  assert.equal(brandFromDocument('I/TOYOTA', known), 'Toyota')
  assert.equal(brandFromDocument('Fiat', known), 'Fiat')
  assert.equal(brandFromDocument('M.BENZ', known), 'Mercedes-Benz')
  assert.equal(brandFromDocument('MMC', known), 'Mitsubishi')
  assert.equal(brandFromDocument('CITROEN', known), 'Citroën')
  assert.equal(brandFromDocument('Marca Rara', known), 'Marca Rara')
  assert.equal(brandFromDocument('', known), '')
})

const NEW_CAR = { brand: '', model: '', version: '', year: '', modelYear: '', transmission: 'Manual', fuel: 'Flex', color: '', doors: 4, category: 'suv', plate: '', chassis: '', renavam: '' }

test('revisão: campo vazio (ou valor inicial do carro novo) vem marcado; diferente aparece desmarcado; igual não muda nada', () => {
  const car = { ...NEW_CAR, model: 'Corola', color: 'prata', plate: 'abc-1d23' }
  const found = { plate: 'ABC1D23', brand: 'Toyota', model: 'Corolla', year: 2021, modelYear: '2021/2022', fuel: 'Flex', color: 'Prata', renavam: '' }
  const rows = reviewRows(car, found, { defaults: NEW_CAR })
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
  assert.deepEqual(Object.keys(byKey), ['plate', 'brand', 'model', 'modelYear', 'fuel', 'color'])
  assert.equal(byKey.plate.status, 'igual')
  assert.equal(byKey.brand.status, 'novo')
  assert.equal(byKey.brand.checked, true)
  assert.equal(byKey.model.status, 'diferente')
  assert.equal(byKey.model.checked, false)
  assert.equal(byKey.model.current, 'Corola')
  assert.equal(byKey.modelYear.status, 'novo')
  assert.equal(byKey.fuel.status, 'igual')
  assert.equal(byKey.color.status, 'igual')
  // Editando um carro (sem valores iniciais), o ano diferente vira conflito; "21/22" é o mesmo que "2021/2022"
  assert.equal(reviewRows({ ...car, modelYear: '2026/2026' }, found).find((r) => r.key === 'modelYear').status, 'diferente')
  assert.equal(reviewRows({ ...car, modelYear: '21/22' }, found).find((r) => r.key === 'modelYear').status, 'igual')
})

test('revisão: aplica só o que foi marcado e devolve os campos preenchidos', () => {
  const car = { ...NEW_CAR, model: 'Corola' }
  const rows = reviewRows(car, { brand: 'Toyota', model: 'Corolla', year: '2021', renavam: '987654321', chassis: '9brbdwhe5n0123456' }, { defaults: NEW_CAR })
  const checked = new Set(rows.filter((r) => r.checked).map((r) => r.key))
  const { car: next, filled } = applyAutofill(car, rows, checked)
  assert.equal(next.brand, 'Toyota')
  assert.equal(next.model, 'Corola') // conflito desmarcado
  assert.equal(next.year, 2021) // só o ano de fabricação no documento: Ano/Modelo 2021/2021
  assert.equal(next.modelYear, '2021/2021')
  assert.equal(next.renavam, '00987654321')
  assert.equal(next.chassis, '9BRBDWHE5N0123456')
  assert.deepEqual(filled.sort(), ['brand', 'chassis', 'modelYear', 'renavam'])
  checked.add('model')
  assert.equal(applyAutofill(car, rows, checked).car.model, 'Corolla')
})

test('FIPE -> cadastro: marca com a grafia do painel, modelo, versão, câmbio e ano-modelo', () => {
  const known = ['Toyota', 'Volkswagen', 'Chevrolet']
  assert.equal(brandFromFipe('VW - VolksWagen', known), 'Volkswagen')
  assert.equal(brandFromFipe('GM - Chevrolet', known), 'Chevrolet')
  assert.equal(brandFromFipe('Kia Motors'), 'Kia')
  assert.equal(brandFromFipe('LAND ROVER'), 'Land Rover')
  assert.equal(brandFromFipe('Mercedes-Benz'), 'Mercedes-Benz')
  assert.equal(brandFromFipe('BMW'), 'BMW')
  assert.equal(modelYearText(2021, 2022), '2021/2022')
  assert.equal(modelYearText(2026, 2022), '2022')
  assert.equal(modelYearText(0, 32000), '')
  assert.deepEqual(fieldsFromFipe({ brand: 'Toyota', model: 'Corolla XEi 2.0 Flex 16V Aut.', modelYear: 2022, fuel: 'Flex' }, { fabYear: 2022, knownBrands: known }), {
    brand: 'Toyota', model: 'Corolla', version: 'XEi 2.0 Flex 16V Aut.', fuel: 'Flex', transmission: 'Automático', modelYear: '2022/2022',
  })
  const moto = fieldsFromFipe({ brand: 'HONDA', model: 'CG 160 FAN', modelYear: 2023, fuel: 'Gasolina' }, { tipo: 'motos' })
  assert.equal(moto.category, 'moto')
  assert.equal(moto.version, '160 FAN')
  assert.equal(moto.transmission, '')
})

test('FIPE guardada no carro, mês antigo e comparação com o preço', () => {
  const value = { code: '002111-3', brand: 'Toyota', model: 'Corolla XEi', modelYear: 2022, fuel: 'Flex', value: 118500, reference: 'setembro de 2026', referenceKey: '2026-09' }
  const rec = fipeRecord(value, { tipo: 'carros', brandCode: 56, modelCode: 5194, yearCode: '2022-5' }, '2026-10-09')
  assert.deepEqual(rec, {
    code: '002111-3', name: 'Corolla XEi', brand: 'Toyota', tipo: 'carros', brandCode: '56', modelCode: '5194', yearCode: '2022-5',
    modelYear: 2022, fuel: 'Flex', value: 118500, reference: 'setembro de 2026', referenceKey: '2026-09', checkedOn: '2026-10-09',
  })
  assert.equal(fipeIsOld(rec, new Date('2026-10-09T15:00:00Z')), true)
  assert.equal(fipeIsOld({ ...rec, referenceKey: '2026-10' }, new Date('2026-10-09T15:00:00Z')), false)
  assert.equal(fipeIsOld({}, new Date()), false)
  assert.equal(fipePriceNote(112575, 118500), 'Seu preço está 5% abaixo da FIPE.')
  assert.equal(fipePriceNote(130350, 118500), 'Seu preço está 10% acima da FIPE.')
  assert.equal(fipePriceNote(118500, 118500), 'Seu preço está igual à FIPE.')
  assert.equal(fipePriceNote('', 118500), '')
})

test('busca do modelo na FIPE: marca junto, sem hífen, sem acento e os que começam pela palavra primeiro', () => {
  const honda = [
    { code: '5211', name: 'Accord Sedan EX 2.0 16V 156cv Aut.' },
    { code: '9001', name: 'City Sedan EXL 1.5 Flex 16V Aut.' },
    { code: '7001', name: 'Civic Sedan EXL 2.0 Flex 16V Aut.4p' },
    { code: '7002', name: 'Civic Coupe Si 1.5 TB 16V 208cv Mec. 2p' },
    { code: '8001', name: 'HR-V EX 1.5 Flex Sensing 16V 5p Aut.' },
    { code: '8002', name: 'CR-V EXL 2.0 16V 4WD/2.0 Flex Aut.' },
  ]
  const names = (list) => list.map((m) => m.code)
  assert.deepEqual(names(filterFipeModels(honda, 'civic', 'Honda')), ['7001', '7002'])
  assert.deepEqual(names(filterFipeModels(honda, 'Honda Civic', 'Honda')), ['7001', '7002'])
  assert.deepEqual(names(filterFipeModels(honda, 'civic exl', 'Honda')), ['7001'])
  assert.deepEqual(names(filterFipeModels(honda, 'hrv', 'Honda')), ['8001'])
  assert.deepEqual(names(filterFipeModels(honda, 'HR-V', 'Honda')), ['8001'])
  assert.deepEqual(names(filterFipeModels(honda, 'crv', 'Honda')), ['8002'])
  assert.equal(filterFipeModels(honda, 'honda', 'Honda').length, honda.length)
  assert.equal(filterFipeModels(honda, '', 'Honda').length, honda.length)
  assert.deepEqual(filterFipeModels(honda, 'fiesta', 'Honda'), [])
  const ford = [
    { code: '1', name: 'EcoSport FREESTYLE 1.5 12V Flex 5p Mec.' },
    { code: '2', name: 'Fiesta 1.6 8V Flex Mec. 5p' },
    { code: '3', name: 'Ka 1.0 8V/1.0 8V ST Flex 3p' },
    { code: '4', name: 'Ranger XLT 3.2 20V 4x4 CD Diesel Aut.' },
  ]
  assert.deepEqual(names(filterFipeModels(ford, 'Ford Fiesta', 'Ford')), ['2'])
  assert.deepEqual(names(filterFipeModels(ford, 'eco sport', 'Ford')), ['1'])
  // "ka" aparece em outros nomes, mas os que começam por Ka vêm primeiro
  assert.equal(filterFipeModels(ford, 'ka', 'Ford')[0].code, '3')
  const vw = [{ code: '10', name: 'T-Cross Highline 1.4 TSI Flex Aut.' }, { code: '11', name: 'Gol 1.0 Flex 12V 5p' }]
  assert.deepEqual(names(filterFipeModels(vw, 'vw tcross', 'VW - VolksWagen')), ['10'])
  assert.deepEqual(names(filterFipeModels(vw, 'volkswagen gol', 'VW - VolksWagen')), ['11'])
})
