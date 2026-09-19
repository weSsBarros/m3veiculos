export const WHATSAPP_NUMBER = '5598981893675'

export function whatsappLink(message) {
  const text = encodeURIComponent(message)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
}

export function whatsappLinkForCar(car) {
  return whatsappLink(
    `Olá! Tenho interesse no ${car.brand} ${car.model} ${car.version} (${car.year}) que vi no site da M&3 Veículos.`
  )
}
