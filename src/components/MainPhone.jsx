import { useMainPhone, hasRealPhone } from '../utils/whatsappRouter.js'
import { formatWaPhone } from '../utils/whatsappRotation.js'

// Número principal da loja (Configurações → WhatsApp do site), formatado.
// Enquanto o banco não responde, ou se a loja ainda não tem número, mostra o
// texto de "fallback" (o número que já estava no site).
export default function MainPhone({ fallback = '' }) {
  const phone = useMainPhone()
  return hasRealPhone(phone) ? formatWaPhone(phone) : fallback
}
