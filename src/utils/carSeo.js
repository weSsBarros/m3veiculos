import { useEffect } from 'react'

// Página do carro no Google: resumo na <meta name="description"> e dados
// estruturados (schema.org Car + oferta) para a busca mostrar preço, km e foto.
// O Google lê a página já montada pelo React, então basta pôr no <head>.

function absolute(origin, url) {
  return url && url.startsWith('/') ? origin + url : url
}

// "Ano/Modelo" já vem como texto ("2022/2023"); sem ele, o ano de fabricação
function yearLabel(car) {
  return String(car.modelYear || car.year || '').trim()
}

function modelYearNumber(car) {
  const parts = String(car.modelYear || '').split('/').map((p) => p.trim()).filter(Boolean)
  return parts[parts.length - 1] || String(car.year || '')
}

export function carTitle(car) {
  return [car.brand, car.model, car.version, yearLabel(car)].filter(Boolean).join(' ')
}

export function carSummary(car, storeName) {
  const km = car.km != null && car.km !== '' ? `${Number(car.km).toLocaleString('pt-BR')} km` : ''
  const price = car.price ? `R$ ${Number(car.price).toLocaleString('pt-BR')}` : 'consulte o valor'
  const facts = [km, car.transmission, car.fuel, car.color].filter(Boolean).join(', ')
  return `${carTitle(car)}${facts ? ` — ${facts}` : ''}, por ${price}${storeName ? ` na ${storeName}` : ''}.`
}

export function carJsonLd(car, { storeName, origin }) {
  const url = `${origin}/carro/${car.slug}`
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: carTitle(car),
    url,
    brand: { '@type': 'Brand', name: car.brand },
    model: car.model,
    itemCondition: 'https://schema.org/UsedCondition',
    image: (car.images || []).slice(0, 10).map((u) => absolute(origin, u)),
    description: (car.description || '').trim() || carSummary(car, storeName),
  }
  if (car.modelYear || car.year) data.vehicleModelDate = modelYearNumber(car)
  if (car.year) data.productionDate = String(car.year)
  if (car.km != null && car.km !== '') data.mileageFromOdometer = { '@type': 'QuantitativeValue', value: Number(car.km), unitCode: 'KMT' }
  if (car.color) data.color = car.color
  if (car.transmission) data.vehicleTransmission = car.transmission
  if (car.fuel) data.fuelType = car.fuel
  if (car.doors) data.numberOfDoors = Number(car.doors)
  if (car.price) {
    data.offers = {
      '@type': 'Offer',
      price: Number(car.price),
      priceCurrency: 'BRL',
      url,
      availability: car.status === 'disponivel' ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability',
      seller: { '@type': 'AutoDealer', name: storeName || undefined },
    }
  }
  return data
}

// Usar na página do carro: useCarSeo(car, 'Nome da loja')
export function useCarSeo(car, storeName) {
  useEffect(() => {
    if (!car) return
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(carJsonLd(car, { storeName, origin: window.location.origin }))
    document.head.appendChild(script)
    const meta = document.querySelector('meta[name="description"]')
    const previous = meta?.getAttribute('content')
    meta?.setAttribute('content', carSummary(car, storeName))
    return () => {
      script.remove()
      if (meta && previous != null) meta.setAttribute('content', previous)
    }
  }, [car, storeName])
}
