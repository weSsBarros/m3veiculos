import { supabase } from './supabaseClient.js'

// Descrição do anúncio e legenda para redes sociais escritas pela IA (Edge
// Function "gerar-textos"). Vai só o que é do anúncio: nada de custo, dono ou
// observações internas.
export async function generateCarTexts(car) {
  const store = (document.title.split('|')[0] || '').trim()
  const payload = {
    brand: car.brand,
    model: car.model,
    version: car.version,
    year: car.year,
    modelYear: car.modelYear,
    km: car.km,
    transmission: car.transmission,
    fuel: car.fuel,
    color: car.color,
    doors: car.doors,
    category: car.category,
    condition: car.condition,
    highlights: car.highlights,
    intakeItems: car.intakeItems,
    price: car.price || null,
  }
  const { data, error } = await supabase.functions.invoke('gerar-textos', { body: { car: payload, store } })
  if (error) {
    let message = error.message
    try {
      const body = await error.context?.json()
      if (body?.error) message = body.error
    } catch {
      // resposta sem corpo JSON
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
