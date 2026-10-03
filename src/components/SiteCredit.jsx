import { creditLink, SUPPORT_DISPLAY } from '../utils/support.js'
import './SiteCredit.css'

// Crédito discreto no rodapé: quem fez o site e o sistema (abre o WhatsApp da WB.Dev)
export default function SiteCredit({ storeName }) {
  return (
    <p className="site-credit">
      <a href={creditLink(storeName)} target="_blank" rel="noreferrer">
        Site e sistema: <strong>WB.AUTO</strong> · {SUPPORT_DISPLAY}
      </a>
    </p>
  )
}
