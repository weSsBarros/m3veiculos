const BASE_URL = 'https://parallelum.com.br/fipe/api/v1/carros'

async function fipeFetch(path) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`)
  } catch {
    throw new Error('Não foi possível conectar à tabela FIPE. Verifique sua internet.')
  }
  if (!res.ok) throw new Error('Falha ao consultar a tabela FIPE.')
  const data = await res.json()
  if (data && data.error) throw new Error(data.error)
  return data
}

export function fetchFipeBrands() {
  return fipeFetch('/marcas')
}

export function fetchFipeModels(brandCode) {
  return fipeFetch(`/marcas/${brandCode}/modelos`).then((data) => data.modelos)
}

export function fetchFipeYears(brandCode, modelCode) {
  return fipeFetch(`/marcas/${brandCode}/modelos/${modelCode}/anos`)
}

export function fetchFipeValue(brandCode, modelCode, yearCode) {
  return fipeFetch(`/marcas/${brandCode}/modelos/${modelCode}/anos/${yearCode}`)
}

// "R$ 139.191,00" -> 139191 (o sistema não trabalha com centavos)
export function parseFipeValue(valorStr) {
  const clean = String(valorStr).replace('R$', '').trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(clean)
  return Number.isFinite(num) ? Math.round(num) : null
}
