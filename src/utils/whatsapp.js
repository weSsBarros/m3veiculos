import { formatCurrency, estimateInstallment } from './carFormat.js'

export const WHATSAPP_NUMBER = '5598981893675'

export function whatsappLink(message) {
  const text = encodeURIComponent(message)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
}

export function carPageUrl(car) {
  const base = import.meta.env.VITE_SITE_URL || window.location.origin
  return `${base}/carro/${car.slug}`
}

export function whatsappLinkForCar(car) {
  const message = [
    'Olá! Tenho interesse neste carro que vi no site da M&3 Veículos:',
    '',
    `${car.brand} ${car.model} ${car.version} (${car.modelYear})`,
    `Preço: ${formatCurrency(car.price)}`,
    `${car.km.toLocaleString('pt-BR')} km · ${car.transmission} · ${car.color}`,
    '',
    carPageUrl(car),
  ].join('\n')
  return whatsappLink(message)
}

function formatBirthDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR')
}

export function whatsappLinkForFinancing(car, buyer = {}) {
  const lines = [
    'Olá! Quero simular o financiamento deste carro:',
    '',
    `${car.brand} ${car.model} ${car.version} (${car.modelYear})`,
    `Preço: ${formatCurrency(car.price)} — ou em até 48x de ${estimateInstallment(car.price)}`,
    '',
    carPageUrl(car),
  ]

  if (buyer.fullName) {
    lines.push(
      '',
      'Meus dados para a simulação:',
      `Nome completo: ${buyer.fullName}`,
      `Data de nascimento: ${formatBirthDate(buyer.birthDate)}`,
      `E-mail: ${buyer.email || '—'}`,
      `Número de contato: ${buyer.phone || '—'}`,
      `Tem CNH: ${buyer.hasCnh || '—'}`,
      `CPF: ${buyer.cpf || '—'}`,
      `Valor de entrada: ${buyer.downPayment || '—'}`
    )
  }

  return whatsappLink(lines.join('\n'))
}
