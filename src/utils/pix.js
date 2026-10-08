// PIX da mensalidade (página Mensalidade do painel): o "copia e cola" no padrão
// BR Code do Banco Central (QR estático, EMV), com o valor e o código de
// conferência CRC16. Testado em tests/pix.test.js com o exemplo do manual do BCB.

function field(id, value) {
  const text = String(value)
  return `${id}${String(text.length).padStart(2, '0')}${text}`
}

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais
export function crc16(text) {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Sem acento e só os caracteres que o BR Code aceita
export function pixText(value, max) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,\-/&@*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// Identificador do pagamento (txid): letras e números, até 25
export function pixTxid(storeSlug, month) {
  const store = String(storeSlug || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 15)
  const ym = String(month || '').replace(/[^0-9]/g, '').slice(0, 6)
  return `WB${store}${ym}`.slice(0, 25) || '***'
}

// Código "copia e cola". amount em reais (opcional); sem chave, nome ou cidade = ''
export function pixPayload({ key, name, city, amount = null, txid = '***' }) {
  const pixKey = String(key || '').trim()
  const merchant = pixText(name, 25)
  const place = pixText(city, 15)
  if (!pixKey || !merchant || !place) return ''
  const account = field('00', 'br.gov.bcb.pix') + field('01', pixKey)
  const value = amount != null && Number(amount) > 0 ? field('54', Number(amount).toFixed(2)) : ''
  const reference = /^[A-Za-z0-9]{1,25}$/.test(txid) ? txid : '***'
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    value +
    field('58', 'BR') +
    field('59', merchant) +
    field('60', place) +
    field('62', field('05', reference)) +
    '6304'
  return body + crc16(body)
}
