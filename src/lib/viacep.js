// Busca do CEP no ViaCEP (gratuito, sem chave). Devolve as partes do endereço
// no formato de address_parts, ou null se o CEP não existe ou a busca falhou.
export async function lookupCep(cep) {
  const digits = String(cep || '').replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data || data.erro) return null
    return {
      zip: digits,
      street: data.logradouro || '',
      district: data.bairro || '',
      city: data.localidade || '',
      city_code: data.ibge || '',
      state: data.uf || '',
    }
  } catch {
    return null
  }
}
