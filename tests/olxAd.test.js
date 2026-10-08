import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  olxAdId, olxPlate, olxPhone, olxZip, olxYear, olxContactPhone, olxImageUrl, olxImages, olxOutReason, olxMissing,
  buildOlxAd, olxBody, olxCarFromRow, olxErrorText, olxNormalize, olxRankBrands, olxRankModels, olxRankVersions,
  olxRankCc, olxConfident,
} from '../src/utils/olxAd.js'

const SITE = 'https://loja.com.br'
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
  highlights: ['Ar-condicionado digital', 'Câmera de ré', 'Bancos de couro', 'Direção elétrica', 'Chave reserva'],
  description: 'Corolla impecável, revisado.',
  images: ['/uploads/carros/0123456789abcdef0123456789abcdef.webp', '/uploads/carros/fedcba9876543210fedcba9876543210.jpg'],
  status: 'disponivel',
  hidden: false,
  plate: 'abc-1d23',
  entryType: 'showroom',
  olxPublish: true,
  olxCatalog: { brandId: 51, brandName: 'TOYOTA', modelId: 12, modelName: 'COROLLA', versionId: 345, versionName: 'COROLLA XEI 2.0' },
  ...over,
})
const ctx = { siteUrl: SITE, zip: '65.077-357', phone: '(98) 98129-5577', settings: {} }

test('olx: id do anúncio, placa, telefone, CEP e ano', () => {
  assert.equal(olxAdId('0f8fad5b-d9cb-469f-a165-70867728950e'), '0f8fad5bd9cb469fa16')
  assert.equal(olxAdId('0f8fad5b-d9cb-469f-a165-70867728950e').length, 19)
  assert.equal(olxPlate('abc-1d23'), 'ABC1D23')
  assert.equal(olxPlate('ABC 1234'), 'ABC1234')
  assert.equal(olxPlate('AB12345'), '')
  assert.equal(olxPhone('+55 (98) 98129-5577'), '98981295577')
  assert.equal(olxPhone('5598981295577'), '98981295577')
  assert.equal(olxPhone('3232-1111'), '')
  assert.equal(olxZip('65077-357'), '65077357')
  assert.equal(olxZip('6507'), '')
  assert.equal(olxYear({ modelYear: '2022/2023', year: 2022 }), '2023')
  assert.equal(olxYear({ modelYear: '22/23', year: 2022 }), '2022')
  assert.equal(olxYear({ modelYear: '1978', year: 1978 }), '1975')
  assert.equal(olxYear({ modelYear: '', year: 1949 }), '1950')
  assert.equal(olxYear({ modelYear: '', year: '' }), '')
})

test('olx: telefone do carro (pessoa ativa com telefone) ou o principal', () => {
  const phones = { s1: '(98) 99911-3000' }
  assert.equal(olxContactPhone({ whatsappSellerId: 's1' }, phones, '5598981295577'), '98999113000')
  assert.equal(olxContactPhone({ whatsappSellerId: 's2' }, phones, '5598981295577'), '98981295577')
  assert.equal(olxContactPhone({ whatsappSellerId: null }, phones, ''), '')
})

test('olx: fotos do site vão em JPG (a OLX não aceita WebP), até 20 e sem repetir', () => {
  assert.equal(olxImageUrl('/uploads/carros/0123456789abcdef0123456789abcdef.webp', `${SITE}/`),
    `${SITE}/uploads/carros/jpg/0123456789abcdef0123456789abcdef.jpg`)
  assert.equal(olxImageUrl('/uploads/carros/fedcba9876543210fedcba9876543210.jpg', SITE), `${SITE}/uploads/carros/fedcba9876543210fedcba9876543210.jpg`)
  assert.equal(olxImageUrl('/uploads/carros/0123456789abcdef0123456789abcdef.webp', ''), null)
  assert.equal(olxImageUrl('https://x.com/foto.webp', SITE), null)
  assert.equal(olxImageUrl('https://x.com/foto.png', SITE), 'https://x.com/foto.png')
  const many = Array.from({ length: 25 }, (_, i) => `/uploads/carros/${String(i).padStart(32, 'a')}.webp`)
  assert.equal(olxImages({ images: [...many, many[0]] }, SITE).length, 20)
  assert.equal(olxImages({ images: [many[0], many[0]] }, SITE).length, 1)
})

test('olx: só disponível, visível, fora do repasse e marcado vai para a OLX', () => {
  assert.equal(olxOutReason(car()), '')
  assert.equal(olxOutReason(car({ status: 'vendido' })), 'Vendido')
  assert.equal(olxOutReason(car({ status: 'reservado' })), 'Reservado')
  assert.equal(olxOutReason(car({ status: 'manutencao' })), 'Em manutenção')
  assert.equal(olxOutReason(car({ hidden: true })), 'Oculto do site')
  assert.equal(olxOutReason(car({ entryType: 'repasse' })), 'Repasse')
  assert.equal(olxOutReason(car({ olxPublish: false })), 'Desmarcado para a OLX')
})

test('olx: o que falta para publicar', () => {
  assert.deepEqual(olxMissing(car(), ctx), [])
  assert.deepEqual(
    olxMissing(car({ plate: '', olxCatalog: { brandId: 1, modelId: 2 }, price: null, images: [] }), { siteUrl: SITE, zip: '', phone: '' }),
    ['placa', 'catalogo', 'preco', 'foto', 'cep', 'telefone'])
  // Moto: sem placa e sem versão obrigatória, mas com cilindrada
  const moto = car({ category: 'moto', doors: 0, plate: '', olxCatalog: { brandId: 7, modelId: 6 } })
  assert.deepEqual(olxMissing(moto, ctx), ['cilindrada'])
  assert.deepEqual(olxMissing({ ...moto, olxCatalog: { brandId: 7, modelId: 6, ccId: 3 } }, ctx), [])
})

test('olx: anúncio de carro no formato da API', () => {
  const { ad, missing } = buildOlxAd(car(), { ...ctx, settings: { exchange: 'sim', footer: 'Aceitamos troca e financiamos.' } })
  assert.deepEqual(missing, [])
  assert.equal(ad.id, '0f8fad5bd9cb469fa16')
  assert.equal(ad.operation, 'insert')
  assert.equal(ad.category, 2020)
  assert.equal(ad.subject, 'Toyota Corolla XEi 2.0 Flex Aut.')
  assert.equal(ad.body, 'Corolla impecável, revisado.\n\nAceitamos troca e financiamos.')
  assert.equal(ad.phone, 98981295577)
  assert.equal(ad.type, 's')
  assert.equal(ad.price, 139900)
  assert.equal(ad.zipcode, '65077357')
  assert.deepEqual(ad.images, [
    `${SITE}/uploads/carros/jpg/0123456789abcdef0123456789abcdef.jpg`,
    `${SITE}/uploads/carros/fedcba9876543210fedcba9876543210.jpg`,
  ])
  assert.deepEqual(ad.params, {
    vehicle_brand: '51',
    vehicle_model: '12',
    vehicle_version: '345',
    regdate: '2023',
    mileage: 45000,
    vehicle_tag: 'ABC1D23',
    gearbox: '2',
    fuel: '3',
    carcolor: '3',
    doors: '2',
    cartype: '8',
    motorpower: '10',
    car_steering: '2',
    car_features: ['1', '9', '11'],
    owner: '1',
    exchange: '1',
    extra_key: '1',
  })
  assert.equal(buildOlxAd(car({ plate: '' }), ctx).ad, null)
})

test('olx: mapeamentos de câmbio, combustível, cor, portas e motor', () => {
  const params = (over) => buildOlxAd(car(over), ctx).ad.params
  assert.equal(params({ transmission: 'Manual' }).gearbox, '1')
  assert.equal(params({ transmission: 'Automatizado' }).gearbox, '4')
  assert.equal(params({ fuel: 'Diesel' }).fuel, '5')
  assert.equal(params({ fuel: 'Elétrico' }).fuel, '7')
  const gnv = params({ fuel: 'GNV' })
  assert.equal(gnv.fuel, undefined)
  assert.equal(gnv.gnv_kit, '1')
  assert.equal(params({ color: 'Branca' }).carcolor, '2')
  assert.equal(params({ color: 'Cinza grafite' }).carcolor, '5')
  assert.equal(params({ color: 'Vinho' }).carcolor, '10')
  assert.equal(params({ doors: 2 }).doors, '1')
  assert.equal(params({ doors: 5 }).doors, '2')
  assert.equal(params({ version: 'LT 1.0 Turbo' }).motorpower, '1')
  assert.equal(params({ version: 'Sport 1.6' }).motorpower, '6')
  assert.equal(params({ version: 'Limited 3.5 V6' }).motorpower, '11')
  assert.equal(params({ version: 'Comfortline TSI' }).motorpower, undefined)
  assert.equal(params({ condition: 'Segundo dono' }).owner, '2')
  assert.equal(params({ category: 'picape' }).cartype, '3')
})

test('olx: anúncio de moto (categoria 2060, cilindrada e combustível obrigatório)', () => {
  const moto = car({
    brand: 'Honda', model: 'CG 160', version: 'Titan', category: 'moto', doors: 0, plate: '', fuel: 'Flex',
    transmission: 'Manual', highlights: ['Freio ABS', 'Bauleto'],
    olxCatalog: { brandId: 7, modelId: 6, ccId: 7 },
  })
  const { ad } = buildOlxAd(moto, ctx)
  assert.equal(ad.category, 2060)
  assert.equal(ad.params.cubiccms, '7')
  assert.equal(ad.params.vehicle_version, undefined)
  assert.equal(ad.params.vehicle_tag, undefined)
  assert.equal(ad.params.fuel, '3')
  assert.equal(ad.params.doors, undefined)
  assert.deepEqual(ad.params.moto_features, ['1', '4'])
  assert.equal(buildOlxAd({ ...moto, fuel: 'Diesel' }, ctx).ad.params.fuel, '4')
})

test('olx: descrição vazia vira um texto com os dados', () => {
  const body = olxBody(car({ description: '' }), {})
  assert.match(body, /^Toyota Corolla XEi 2\.0 Flex Aut\.\n\nAno 2022\/2023 · 45\.000 km · Câmbio automático cvt · Flex · Cor prata/)
  assert.match(body, /- Câmera de ré/)
  assert.equal(olxBody(car({ description: 'x'.repeat(7000) }), {}).length, 6000)
})

test('olx: linha do banco no formato do painel', () => {
  const row = { id: 'a', brand: 'Fiat', model: 'Argo', version: 'Drive 1.0', year: 2021, model_year: '2021/2022', km: 1, transmission: 'Manual',
    fuel: 'Flex', color: 'Branco', doors: 4, category: 'hatch', condition: 'Único dono', price: 70000, highlights: null, description: null,
    images: null, status: 'disponivel', hidden: false, plate: null, entry_type: null, whatsapp_seller_id: null, olx_publish: true, olx_catalog: null }
  const c = olxCarFromRow(row)
  assert.equal(c.modelYear, '2021/2022')
  assert.deepEqual(c.olxCatalog, {})
  assert.equal(c.entryType, 'showroom')
  assert.deepEqual(c.images, [])
})

test('olx: mensagens de erro em português', () => {
  assert.equal(olxErrorText('INVALID_PLATE'), 'a OLX não encontrou a placa (ou a consulta de placas estava fora do ar)')
  assert.equal(olxErrorText('refused_suspect_price'), 'recusado pela OLX: preço fora do esperado')
  assert.equal(olxErrorText('NOVO_CODIGO'), 'erro da OLX (NOVO_CODIGO)')
})

test('olx: sugestão de marca, modelo, versão e cilindrada', () => {
  assert.equal(olxNormalize(' Citroën C4 Cactus 1,6 '), 'CITROEN C4 CACTUS 1.6')
  const brands = [{ id: 6, name: 'AUDI' }, { id: 60, name: 'VW - VOLKSWAGEN' }, { id: 23, name: 'GM - CHEVROLET' }, { id: 51, name: 'TOYOTA' }]
  assert.equal(olxConfident(olxRankBrands('Toyota', brands)).id, 51)
  assert.equal(olxConfident(olxRankBrands('Volkswagen', brands)).id, 60)
  assert.equal(olxConfident(olxRankBrands('VW', brands)).id, 60)
  assert.equal(olxConfident(olxRankBrands('Chevrolet', brands)).id, 23)
  assert.equal(olxConfident(olxRankBrands('Kia', brands)), null)

  const models = [{ id: 1, name: 'ONIX' }, { id: 2, name: 'ONIX PLUS' }, { id: 3, name: 'PRISMA' }]
  assert.equal(olxConfident(olxRankModels('Onix', models)).id, 1)
  assert.equal(olxConfident(olxRankModels('Onix Plus', models)).id, 2)

  const versions = [
    { id: 1, name: 'COROLLA XEI 2.0 16V FLEX AUT.' },
    { id: 2, name: 'COROLLA GLI 1.8 16V FLEX AUT.' },
    { id: 3, name: 'COROLLA XEI 1.8 16V FLEX MEC.' },
    { id: 4, name: 'COROLLA ALTIS 2.0 FLEX AUT.' },
  ]
  const ranked = olxRankVersions(car(), versions)
  assert.equal(ranked[0].id, 1)
  assert.equal(olxConfident(ranked).id, 1)
  // Versão vaga: pede para escolher
  assert.equal(olxConfident(olxRankVersions(car({ version: 'Flex' }), versions)), null)

  const cc = [{ id: 2, name: '125' }, { id: 7, name: '150' }, { id: 3, name: '250' }]
  assert.equal(olxConfident(olxRankCc({ model: 'Fazer', version: '250 ABS' }, cc)).id, 3)
  assert.equal(olxConfident(olxRankCc({ model: 'CG 160', version: 'Titan' }, cc)), null)
})

// Nomes reais do catálogo da OLX (consultado em 06/10/2026)
const opts = (names) => names.map((name, i) => ({ id: i + 1, name }))
const pickVersion = (over, names, modelName) => olxConfident(olxRankVersions(car(over), opts(names), modelName))?.name || null

test('olx: sugestão com o catálogo real — marca e modelo', () => {
  // A OLX tem "Volkswagen" e "VW" (esta só com o Bugre): o nome exato vence
  const brands = [{ id: 75, name: 'Volkswagen' }, { id: 124, name: 'VW' }, { id: 73, name: 'Toyota' }, { id: 29, name: 'Chevrolet' }]
  assert.equal(olxConfident(olxRankBrands('Volkswagen', brands)).id, 75)
  const toyota = opts(['Camry', 'Corolla', 'Etios', 'Hilux', 'RAV4', 'Yaris'])
  // Corolla Cross e SW4 ficam dentro de Corolla e Hilux
  assert.equal(olxConfident(olxRankModels('Corolla Cross', toyota)).name, 'Corolla')
  assert.equal(olxConfident(olxRankModels('SW4', toyota)).name, 'Hilux')
  assert.equal(olxConfident(olxRankModels('Onix Plus', opts(['Onix', 'Montana', 'S10', 'SS10']))).name, 'Onix')
  // "KA+" é outro modelo (o sedã)
  assert.equal(olxConfident(olxRankModels('Ka', opts(['EcoSport', 'KA', 'KA+', 'Ranger']))).name, 'KA')
})

test('olx: sugestão com o catálogo real — versões', () => {
  const corolla = ['XEI 2.0 Flex 16V Aut.', '2.0 XEI 16V Flex 4P Automatico', 'Cross XRX 1.8 16V Aut.(híbrido)', 'Cross XRX 2.0 16V Flex Aut.',
    'XEI 1.8/1.8 Flex 16V Aut.', 'Fielder SW 1.8/1.8 XEI Flex Aut.']
  // Duas grafias da mesma versão: escolhe a mais curta
  assert.equal(pickVersion({ version: 'XEi 2.0 Flex CVT' }, corolla, 'Corolla'), 'XEI 2.0 Flex 16V Aut.')
  assert.equal(pickVersion({ model: 'Corolla Cross', version: 'XRX Hybrid 1.8 CVT', fuel: 'Híbrido' }, corolla, 'Corolla'),
    'Cross XRX 1.8 16V Aut.(híbrido)')

  const hilux = ['CD Gr-s 4X4 2.8 TDI Dies. Aut.', 'CD SRX 4X4 2.8 TDI 16V Diesel Aut.', 'SW4 GRS 2.8 TB 4X4 Diesel Aut.',
    'SW4 SRX 4X4 2.8 TDI 16V Dies. Aut.', 'SW4 SRX Diamo. 4X4 2.8 TB DIE AUT', 'SW4 SRX Plat. 4X4 2.8 TB Die. Aut.']
  const diesel = { brand: 'Toyota', fuel: 'Diesel', transmission: 'Automático 6 marchas' }
  assert.equal(pickVersion({ ...diesel, model: 'Hilux', version: 'GR-Sport 2.8 Turbo Diesel 4x4 AT' }, hilux, 'Hilux'), 'CD Gr-s 4X4 2.8 TDI Dies. Aut.')
  assert.equal(pickVersion({ ...diesel, model: 'SW4', version: 'SRX 2.8 Turbo Diesel 4x4 AT 7 lugares' }, hilux, 'Hilux'),
    'SW4 SRX 4X4 2.8 TDI 16V Dies. Aut.')

  const s10 = ['Pick-up LS 2.8 TDI 4X2 CS Dies. Mec.', 'Pick-up LS 2.8 TDI 4X4 CS Diesel', 'Pick-up LT 2.8 TDI 4X2 CD Diesel', 'Blazer DTI 2.8 4X2 Turbo Diesel']
  assert.equal(pickVersion({ brand: 'Chevrolet', model: 'S10', version: 'LS 2.8 Turbo Diesel Cabine Simples', transmission: 'Manual', fuel: 'Diesel' }, s10, 'S10'),
    'Pick-up LS 2.8 TDI 4X2 CS Dies. Mec.')

  const frontier = ['LE CD 4X4 2.3 Bi-TB Diesel Aut.', 'Pro4x CD 4X4 2.3 Bi-TB Die. AUT', 'SE CD 4X4 2.3 Bi-TB Diesel Aut.', 'S CD 4X4 2.3 TB Diesel Mec.']
  assert.equal(pickVersion({ brand: 'Nissan', model: 'Frontier', version: 'PRO-4X 2.3 Biturbo Diesel 4x4 AT', transmission: 'Automático', fuel: 'Diesel' },
    frontier, 'Frontier'), 'Pro4x CD 4X4 2.3 Bi-TB Die. AUT')

  // Abreviação da OLX ("Ecobo.") e outra versão no começo ("SEL")
  assert.equal(pickVersion({ brand: 'Ford', model: 'Territory', version: 'Titanium 1.5 EcoBoost', transmission: 'Automático', fuel: 'Gasolina' },
    ['SEL 1.5 Gtdi Ecoboost AUT', 'Titanium 1.5 Gtdi Ecobo. AUT'], 'Territory'), 'Titanium 1.5 Gtdi Ecobo. AUT')
  // A segunda tem algo a mais que o cadastro não diz
  assert.equal(pickVersion({ brand: 'Toyota', model: 'RAV4', version: 'SX Hybrid 2.5 AWD', fuel: 'Híbrido' },
    ['2.5 SX 4X4 Hybrid Aut.', '2.5 SX Connect 4X4 Hybrid AUT'], 'RAV4'), '2.5 SX 4X4 Hybrid Aut.')
  assert.equal(pickVersion({ brand: 'Renault', model: 'Duster', version: 'Iconic 1.3 Turbo CVT' },
    ['Iconic 1.3 TB 16V Flex Aut.', 'Iconic Plus 1.3 TB 16V Flex Aut.'], 'Duster'), 'Iconic 1.3 TB 16V Flex Aut.')
  // O combustível do cadastro desempata
  assert.equal(pickVersion({ brand: 'Fiat', model: 'Cronos', version: 'Drive 1.3', transmission: 'Manual' },
    ['Drive 1.3 8V Flex', 'Drive 1.3 S-Design'], 'Cronos'), 'Drive 1.3 8V Flex')
  assert.equal(pickVersion({ brand: 'Jeep', model: 'Commander', version: 'Limited 1.3 T270 AT6 7 lugares', transmission: 'Automático 6 marchas' },
    ['Limited T270 1.3 TB Aut.', 'Limited T270 1.3 TB Flex AUT'], 'Commander'), 'Limited T270 1.3 TB Flex AUT')
  // "Sedan" no começo é carroceria, não outro modelo; o hatch contraria o sedã
  assert.equal(pickVersion({ brand: 'Chevrolet', model: 'Onix Plus', version: 'Premier 1.0 Turbo AT', transmission: 'Automático 6 marchas', category: 'sedan' },
    ['Hatch Premier 1.0 12V TB Flex Aut. 4P', 'Plus Premier 2', 'Plus Premier Midnight 1.0 12V TB Flex Aut. 4P', 'Sedan Plus Premier 1.0 12V TB Flex Aut. 4P'], 'Onix'),
  'Sedan Plus Premier 1.0 12V TB Flex Aut. 4P')
  // "T-GDI" é turbo
  assert.equal(pickVersion({ brand: 'Hyundai', model: 'HB20', version: 'Platinum Plus 1.0 T-GDI AT', transmission: 'Automático 6 marchas', category: 'hatch' },
    ['Platinum Plus 1.0 TB Flex 12V AUT', 'Platinum 1.0 TB Flex 12V AUT'], 'HB20'), 'Platinum Plus 1.0 TB Flex 12V AUT')
  // Sem a versão no catálogo (a OLX não tem a Wildtrak 3.2): pede para escolher
  assert.equal(pickVersion({ brand: 'Ford', model: 'Ranger', version: 'Wildtrak 3.2 Turbo Diesel 4x4 AT', fuel: 'Diesel' },
    ['XLS 3.2 20V 4X4 CD Diesel Aut.', 'XLT 3.2 20V 4X4 CD Diesel Aut.', 'Limited 3.2 20V 4X4 CD Aut. Dies.', 'Storm 3.2 20V 4X4 CD Diesel AUT'], 'Ranger'), null)
})

test('olx: a cópia dentro da Edge Function é idêntica a src/utils/olxAd.js', () => {
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const fn = read('../supabase/functions/olx-oauth/index.ts')
  const start = fn.indexOf('// <olxAd.js>\n')
  const end = fn.indexOf('// </olxAd.js>')
  assert.ok(start > -1 && end > start, 'marcadores // <olxAd.js> e // </olxAd.js> na função')
  assert.equal(fn.slice(start + '// <olxAd.js>\n'.length, end), read('../src/utils/olxAd.js'))
})
