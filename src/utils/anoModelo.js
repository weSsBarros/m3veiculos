// Ano/Modelo num campo só (pedido do Wesley, 09/10/2026). Aceita "2025/2026",
// "25/26", "2025/26", "2025-2026", "2025.2026" (o "." e a "," do teclado de
// números do celular servem de separador) ou um ano só ("2026" = 2026/2026), e
// devolve sempre o padrão "2025/2026". O ano modelo é o da fabricação ou o
// seguinte. Ano com 2 dígitos: 20xx se não passar do ano que vem, senão 19xx.

const MIN_YEAR = 1950

export const ANO_MODELO_EXEMPLO = 'Ex.: 2025/2026 ou 25/26'

function fullYear(part, maxYear) {
  const n = Number(part)
  if (part.length === 4) return n
  return 2000 + n <= maxYear ? 2000 + n : 1900 + n
}

// { ok: true, year, modelYear } ou { ok: false, empty, error }
export function parseAnoModelo(text, today = new Date()) {
  const raw = String(text ?? '').trim()
  if (!raw) return { ok: false, empty: true, error: 'Informe o ano/modelo.' }
  const parts = raw.split(/\D+/).filter(Boolean)
  if (parts.length < 1 || parts.length > 2 || parts.some((p) => p.length !== 2 && p.length !== 4)) {
    return { ok: false, error: `Ano/modelo inválido. ${ANO_MODELO_EXEMPLO}.` }
  }
  const thisYear = today.getFullYear()
  const fab = fullYear(parts[0], thisYear + 1)
  let model = fab
  if (parts.length === 2) {
    if (parts[0].length === 4 && parts[1].length === 2) {
      // "2025/26": o modelo fica no mesmo século (ou no seguinte, em 1999/00)
      model = Math.floor(fab / 100) * 100 + Number(parts[1])
      if (model < fab) model += 100
    } else {
      model = fullYear(parts[1], thisYear + 1)
    }
  }
  if (fab < MIN_YEAR || fab > thisYear) {
    return { ok: false, error: `O ano de fabricação ${fab} não vale. ${ANO_MODELO_EXEMPLO}.` }
  }
  if (model !== fab && model !== fab + 1) {
    return { ok: false, error: 'O ano modelo é o mesmo da fabricação ou o seguinte (ex.: 2025/2026).' }
  }
  return { ok: true, year: fab, modelYear: `${fab}/${model}` }
}

// Texto para mostrar no campo a partir do que está gravado. Carro antigo com só
// o ano modelo no texto ("2023") e o ano de fabricação à parte (2022) vira
// "2022/2023"; o que não der para entender aparece como está.
export function anoModeloFromSaved(modelYearText, year, today = new Date()) {
  const text = String(modelYearText ?? '').trim()
  const fab = Number(year) || 0
  const parsed = parseAnoModelo(text, today)
  if (parsed.ok) {
    const onlyOneYear = text.split(/\D+/).filter(Boolean).length === 1
    if (onlyOneYear && fab && fab === parsed.year - 1) return `${fab}/${parsed.year}`
    return parsed.modelYear
  }
  if (!text && fab) return parseAnoModelo(String(fab), today).ok ? `${fab}/${fab}` : ''
  return text
}

// Enquanto digita: só números e separadores, no máximo "2025 / 2026"
export function cleanAnoModeloTyping(text) {
  return String(text ?? '').replace(/[^\d/.,\- ]/g, '').slice(0, 11)
}
