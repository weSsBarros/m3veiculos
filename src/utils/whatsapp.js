import { formatCurrency, estimateInstallment } from './carFormat.js'

export const WHATSAPP_NUMBER = '5598981893675'

export function whatsappLink(message) {
  const text = encodeURIComponent(message)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
}

// Conversa com um cliente (telefone do cadastro). Sem DDI, assume Brasil (55).
// Devolve null se o telefone não tiver DDD + número.
export function whatsappLinkToPhone(phone, message) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  if (digits.length < 12) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
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
    `Preço: ${car.price != null ? formatCurrency(car.price) : 'Consulte o valor'}`,
    `${car.km.toLocaleString('pt-BR')} km · ${car.transmission} · ${car.color}`,
    '',
    carPageUrl(car),
  ].join('\n')
  return whatsappLink(message)
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
      `Data de nascimento: ${buyer.birthDate || '—'}`,
      `E-mail: ${buyer.email || '—'}`,
      `Número de contato: ${buyer.phone || '—'}`,
      `Tem CNH: ${buyer.hasCnh || '—'}`,
      `CPF: ${buyer.cpf || '—'}`,
      `Valor de entrada: ${buyer.downPayment ? `R$ ${buyer.downPayment}` : '—'}`
    )
  }

  return whatsappLink(lines.join('\n'))
}
