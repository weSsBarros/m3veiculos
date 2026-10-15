import { Link, NavLink } from 'react-router-dom'
import { MessageCircle, Phone, Mail, MapPin, Clock } from 'lucide-react'
import { whatsappLink } from '../utils/whatsapp.js'
import { hasRealPhone } from '../utils/whatsappRouter.js'
import SiteCredit from '../components/SiteCredit.jsx'
import { NAV } from './comum.js'
// Base dos três modelos: entra antes do CSS de cada um (que ajusta botões e cores por cima)
import './modelos.css'

// Peças de tela iguais nos três modelos (logo, menu do celular, contatos e o pé do
// rodapé). Os modelos vão para todas as lojas, e as mais antigas não têm o storeInfo.js
// nem o Logo.jsx: os dois entram só se existirem (import.meta.glob devolve {} quando o
// arquivo falta) e, sem eles, o modelo usa o nome da loja e o telefone do banco.

export const STORE_NAME = import.meta.env.VITE_STORE_NAME || ''

const storeInfoModule = Object.values(import.meta.glob('../utils/storeInfo.js', { eager: true }))[0]
const logoModule = Object.values(import.meta.glob('../components/Logo.jsx', { eager: true }))[0]

export const STORE = { address: [], ...(storeInfoModule?.STORE || {}) }
const StoreLogo = logoModule?.default || null

// (98) 98129-5577 a partir dos dígitos com o 55
export function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return d
}

// Mensagens do WhatsApp dos modelos (o número é o da vez: fixo ou rodízio, pelo whatsappRouter)
export const linkContato = () => whatsappLink('Olá! Vim pelo site e gostaria de falar com a loja.')
export const linkEstoque = () => whatsappLink('Olá! Vim pelo site e gostaria de saber quais carros estão disponíveis.')
export const linkVisita = () => whatsappLink('Olá! Vim pelo site e gostaria de combinar uma visita à loja.')

// Instagram no storeInfo.js: um perfil (texto) ou vários (lista), sem @
export function instagramProfiles() {
  const value = STORE.instagram
  return (Array.isArray(value) ? value : [value]).filter(Boolean)
}

export function InstagramIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

// Logo da loja com link para o início. tone: 'dark' (fundo claro) ou 'light' (fundo escuro);
// a loja de logo em imagem ignora o tone e pode pôr um fundo atrás dele (--m-logo-fundo).
export function LogoLink({ tone = 'dark', onClick }) {
  return (
    <Link to="/" className="m-logo" aria-label={`${STORE_NAME || 'Loja'}: página inicial`} onClick={onClick}>
      {StoreLogo ? <StoreLogo tone={tone} /> : <span className="m-logo-texto">{STORE_NAME}</span>}
    </Link>
  )
}

export function MenuCelular({ phone, onClose, id }) {
  return (
    <nav className="m-menu-celular" id={id} aria-label="Menu">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose}>
          {item.label}
        </NavLink>
      ))}
      <a className="m-btn m-btn-zap m-btn-bloco" href={linkContato()} target="_blank" rel="noreferrer" onClick={onClose}>
        <MessageCircle size={18} aria-hidden="true" /> Falar no WhatsApp
      </a>
      {hasRealPhone(phone) && (
        <a className="m-btn m-btn-linha m-btn-bloco" href={`tel:+${phone}`} onClick={onClose}>
          <Phone size={18} aria-hidden="true" /> Ligar: {formatPhone(phone)}
        </a>
      )}
    </nav>
  )
}

// Telefone, e-mail, endereço, horário e Instagram (o que a loja não tem não aparece)
export function ContatosLoja({ phone, className = '' }) {
  const profiles = instagramProfiles()
  return (
    <ul className={`m-contatos ${className}`}>
      {hasRealPhone(phone) && (
        <li>
          <Phone size={16} aria-hidden="true" />
          <a href={`tel:+${phone}`}>{formatPhone(phone)}</a>
        </li>
      )}
      {STORE.email && (
        <li>
          <Mail size={16} aria-hidden="true" />
          <a href={`mailto:${STORE.email}`}>{STORE.email}</a>
        </li>
      )}
      {STORE.address?.length > 0 && (
        <li>
          <MapPin size={16} aria-hidden="true" />
          <span>
            {STORE.address.map((line, i) => (
              <span key={line} className="m-contatos-linha">
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </span>
        </li>
      )}
      {STORE.hours && (
        <li>
          <Clock size={16} aria-hidden="true" />
          <span>{STORE.hours}</span>
        </li>
      )}
      {profiles.map((profile) => (
        <li key={profile}>
          <InstagramIcon size={16} />
          <a href={`https://www.instagram.com/${profile}/`} target="_blank" rel="noreferrer">
            @{profile}
          </a>
        </li>
      ))}
    </ul>
  )
}

// Direitos, CNPJ, crédito da WB.AUTO (obrigatório em todo site) e a nota da loja, se houver
export function RodapeBase() {
  return (
    <div className="m-rodape-base">
      <p>
        © {new Date().getFullYear()} {STORE_NAME}. Todos os direitos reservados.
        {STORE.cnpj && ` CNPJ: ${STORE.cnpj}`}
      </p>
      <SiteCredit storeName={STORE_NAME} />
      {STORE.footerNote && <p className="m-rodape-nota">{STORE.footerNote}</p>}
    </div>
  )
}
