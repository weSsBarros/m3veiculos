import { CONTRACT_TEMPLATE_TAGS } from './contractTemplateTags.js'

// Contrato padrão editado na tela Contratos → modelo novo (14/10/2026). O texto
// editado tem os dados deste contrato (nome do cliente, placa...); para virar
// modelo, cada valor conhecido volta a ser o marcador ({cliente_nome}). Valores
// curtos demais (menos de 3 letras) ficam como texto, para não trocar pedaços de
// outras palavras. Depois de salvo, o modelo abre no editor para conferir.

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// data: { tag: valor } (buildContractTemplateData). Do valor mais longo para o
// mais curto; valor repetido fica com o primeiro marcador da lista oficial (ex.:
// cidade da loja antes da cidade do contrato).
function replacements(data) {
  const seen = new Set()
  const list = []
  for (const { tag } of CONTRACT_TEMPLATE_TAGS) {
    const value = String(data?.[tag] ?? '').trim()
    if (value.length < 3 || /^_+$/.test(value) || seen.has(value)) continue
    seen.add(value)
    list.push({ tag, value, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(value)}(?![\\p{L}\\p{N}])`, 'gu') })
  }
  return list.sort((a, b) => b.value.length - a.value.length)
}

// Troca os valores por marcadores num texto. Cada troca vira um sinal provisório
// (caractere de uso privado) que nenhum outro valor casa; no fim, os marcadores.
export function valuesToTags(text, data) {
  const tags = []
  let out = String(text ?? '')
  for (const { tag, re } of replacements(data)) {
    out = out.replace(re, () => {
      tags.push(tag)
      return `\u0000${String.fromCharCode(0xe000 + tags.length - 1)}\u0000`
    })
  }
  return out.replace(/\u0000([-])\u0000/g, (_, ch) => `{${tags[ch.charCodeAt(0) - 0xe000]}}`)
}

// Parágrafos e assinaturas do contrato editado → modelo com marcadores
export function contractTextToTemplate({ paragraphs, signatures }, data) {
  return {
    paragraphs: (paragraphs || []).map((p) => valuesToTags(p, data)),
    signatures: (signatures || []).map((s) => ({ ...s, name: valuesToTags(s.name, data) })),
  }
}
