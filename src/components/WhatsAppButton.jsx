import { MessageCircle } from 'lucide-react'
import { whatsappLink } from '../utils/whatsapp.js'
import './WhatsAppButton.css'

export default function WhatsAppButton() {
  return (
    <a
      className="whatsapp-float"
      href={whatsappLink('Olá! Vim pelo site da M&3 Veículos e gostaria de saber mais sobre o estoque.')}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle size={26} strokeWidth={2.2} />
    </a>
  )
}
