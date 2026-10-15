import { useMemo, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X, MessageCircle, ArrowRight, Phone, MapPin, Clock, Navigation } from 'lucide-react'
import { useCars } from '../context/CarsContext.jsx'
import { whatsappLinkForCar } from '../utils/whatsapp.js'
import { useMainPhone, hasRealPhone } from '../utils/whatsappRouter.js'
import { responsivePhoto } from '../utils/carPhotos.js'
import { formatCurrency, discountPercent } from '../utils/carFormat.js'
import { formatMileage } from '../utils/vehicleTypes.js'
import { NAV, priceText, transmissionShort, categoryCounts, photosFirst, mapsLink } from './comum.js'
import { STORE, LogoLink, MenuCelular, ContatosLoja, RodapeBase, formatPhone, linkContato, linkEstoque } from './partes.jsx'
import './bairro.css'

// Modelo 3, "Revenda de bairro": direto ao ponto. O preço vem pintado na foto, como no
// para-brisa do carro no pátio, e todo carro tem o botão de WhatsApp. Faixa de contato
// no topo e barra fixa de WhatsApp na página do carro (celular).

const LIMITE = 12

export function TopoBairro() {
  const [open, setOpen] = useState(false)
  const phone = useMainPhone()
  const close = () => setOpen(false)
  const endereco = (STORE.address || []).filter(Boolean)

  return (
    <>
      <div className="m-bai-faixa">
        <div className="m-container m-bai-faixa-linha">
          <ul>
            {hasRealPhone(phone) && (
              <li>
                <Phone size={14} aria-hidden="true" />
                <a href={`tel:+${phone}`}>{formatPhone(phone)}</a>
              </li>
            )}
            {endereco.length > 0 && (
              <li className="m-bai-faixa-endereco">
                <MapPin size={14} aria-hidden="true" />
                <span>{endereco.slice(0, 2).join(' · ')}</span>
              </li>
            )}
            {STORE.hours && (
              <li className="m-bai-faixa-horario">
                <Clock size={14} aria-hidden="true" />
                <span>{STORE.hours}</span>
              </li>
            )}
          </ul>
          <a href={linkContato()} target="_blank" rel="noreferrer" className="m-bai-faixa-zap">
            <MessageCircle size={14} aria-hidden="true" /> Chamar no WhatsApp
          </a>
        </div>
      </div>
      <header className="m-topo m-claro m-bai-topo">
        <div className="m-container m-bai-topo-linha">
          <LogoLink onClick={close} />
          <nav className="m-bai-nav" aria-label="Menu principal">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <a className="m-btn m-btn-zap m-bai-topo-zap" href={linkContato()} target="_blank" rel="noreferrer">
            <MessageCircle size={18} aria-hidden="true" /> <span>Chamar no WhatsApp</span>
          </a>
          <button
            type="button"
            className="m-burger"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="m-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {open && <MenuCelular id="m-menu" phone={phone} onClose={close} />}
      </header>
    </>
  )
}

// Cartão do pátio: foto com o preço pintado, nome, ano/km e o botão de WhatsApp do carro.
// O nome é o link (cobre o cartão); o WhatsApp fica por cima.
export function CartaoBairro({ car }) {
  const url = `/carro/${car.slug}`
  const nome = `${car.brand} ${car.model}`
  const off = car.price != null && discountPercent(car.price, car.originalPrice)
  const badge = car.badge && car.badge !== 'Disponível' ? car.badge : ''

  return (
    <article className="m-bai-card">
      <div className="m-bai-card-foto">
        {car.images?.[0] ? (
          <img {...responsivePhoto(car.images[0], '(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 300px')} alt="" loading="lazy" />
        ) : (
          <span className="m-bai-semfoto">Foto em breve</span>
        )}
        {(off || badge) && (
          <span className="m-bai-tags">
            {off && <span className="is-oferta">{off}% OFF</span>}
            {badge && <span>{badge}</span>}
          </span>
        )}
        <span className={`m-bai-preco${car.price == null ? ' is-consulte' : ''}`}>
          {car.price != null && car.originalPrice && <s>{formatCurrency(car.originalPrice)}</s>}
          {priceText(car)}
        </span>
      </div>
      <div className="m-bai-card-dados">
        <h3>
          <Link to={url} className="m-bai-card-link">
            {nome}
          </Link>
        </h3>
        <p className="m-bai-card-ficha">
          {[car.modelYear, formatMileage(car), transmissionShort(car.transmission)].filter(Boolean).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </p>
        {car.version && <p className="m-bai-card-versao">{car.version}</p>}
      </div>
      <a className="m-btn m-btn-zap m-bai-card-zap" href={whatsappLinkForCar(car)} target="_blank" rel="noreferrer" aria-label={`Chamar no WhatsApp sobre ${nome}`}>
        <MessageCircle size={17} aria-hidden="true" /> <span>WhatsApp</span>
      </a>
    </article>
  )
}

// Página do carro (celular): preço e WhatsApp sempre à mão, presos embaixo
export function BarraCarroBairro({ car }) {
  return (
    <div className="m-bai-barra">
      <div className="m-bai-barra-texto">
        <span>
          {car.brand} {car.model}
        </span>
        <strong>{priceText(car)}</strong>
      </div>
      <a className="m-btn m-btn-zap" href={whatsappLinkForCar(car)} target="_blank" rel="noreferrer">
        <MessageCircle size={18} aria-hidden="true" /> WhatsApp
      </a>
    </div>
  )
}

export function InicioBairro() {
  const { cars, loading, error } = useCars()
  const phone = useMainPhone()
  const categorias = useMemo(() => categoryCounts(cars), [cars])
  const lista = useMemo(() => photosFirst(cars).slice(0, LIMITE), [cars])
  const endereco = (STORE.address || []).filter(Boolean)
  const mapa = mapsLink(endereco)

  return (
    <>
      <section className="m-bai-chamada">
        <div className="m-container m-bai-chamada-grade">
          <div>
            <h1>Escolha o carro e chame no WhatsApp.</h1>
            <p>Cada carro tem o botão para falar com a loja sobre ele.</p>
          </div>
          {cars.length > 0 && (
            <p className="m-bai-placa">
              <strong>{cars.length}</strong>
              <span>{cars.length === 1 ? 'carro à venda' : 'carros à venda'}</span>
            </p>
          )}
        </div>
        {categorias.length > 1 && (
          <div className="m-container">
            <ul className="m-bai-categorias" aria-label="Categorias">
              {categorias.map((c) => (
                <li key={c.slug}>
                  <Link to={`/estoque?categoria=${c.slug}`}>
                    {c.label} <span>{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="m-bai-patio" aria-label="Carros à venda">
        <div className="m-container">
          {loading && <p className="m-bai-aviso">Carregando os carros…</p>}
          {!loading && error && <p className="m-bai-aviso">Não foi possível carregar os carros agora. Tente recarregar a página em instantes.</p>}
          {!loading && !error && cars.length === 0 && (
            <div className="m-bai-vazio">
              <p>Estamos atualizando o estoque do site. Chame no WhatsApp para saber quais carros estão disponíveis agora.</p>
              <a className="m-btn m-btn-zap" href={linkEstoque()} target="_blank" rel="noreferrer">
                <MessageCircle size={18} aria-hidden="true" /> Chamar no WhatsApp
              </a>
            </div>
          )}
          {lista.length > 0 && (
            <ul className="m-bai-grade">
              {lista.map((car) => (
                <li key={car.id}>
                  <CartaoBairro car={car} />
                </li>
              ))}
            </ul>
          )}
          {cars.length > lista.length && (
            <Link to="/estoque" className="m-btn m-btn-primario m-bai-mais">
              Ver os {cars.length} carros <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      <section className="m-bai-servicos" aria-label="Financiamento e troca">
        <div className="m-container m-bai-servicos-grade">
          <Link to="/financiamento" className="m-bai-faixa-servico is-cor">
            <strong>Financiamento</strong>
            <span>Simule a parcela e mande pelo WhatsApp.</span>
            <ArrowRight size={22} aria-hidden="true" />
          </Link>
          <Link to="/venda-seu-veiculo" className="m-bai-faixa-servico is-tinta">
            <strong>Seu carro na troca</strong>
            <span>Conte qual é o seu carro e receba a avaliação.</span>
            <ArrowRight size={22} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="m-bai-visite" aria-labelledby="m-bai-visite-titulo">
        <div className="m-container m-bai-visite-grade">
          <div>
            <h2 id="m-bai-visite-titulo">Fale com a gente</h2>
            <ContatosLoja phone={phone} className="m-bai-visite-contatos" />
          </div>
          <div className="m-bai-visite-acoes">
            <a className="m-btn m-btn-zap" href={linkContato()} target="_blank" rel="noreferrer">
              <MessageCircle size={18} aria-hidden="true" /> Chamar no WhatsApp
            </a>
            {hasRealPhone(phone) && (
              <a className="m-btn m-btn-linha" href={`tel:+${phone}`}>
                <Phone size={18} aria-hidden="true" /> Ligar
              </a>
            )}
            {mapa && (
              <a className="m-btn m-btn-linha" href={mapa} target="_blank" rel="noreferrer">
                <Navigation size={18} aria-hidden="true" /> Como chegar
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

export function RodapeBairro() {
  const phone = useMainPhone()
  return (
    <footer className="m-rodape m-bai-rodape">
      <div className="m-bai-rodape-faixa">
        <div className="m-container m-bai-rodape-faixa-linha">
          <p>Viu um carro? Chame a loja no WhatsApp.</p>
          <a className="m-btn m-btn-zap" href={linkContato()} target="_blank" rel="noreferrer">
            <MessageCircle size={18} aria-hidden="true" /> Chamar no WhatsApp
          </a>
        </div>
      </div>
      <div className="m-container m-bai-rodape-grade">
        <LogoLink tone="light" />
        <nav className="m-bai-rodape-nav" aria-label="Rodapé">
          {NAV.filter((item) => item.to !== '/').map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
        <ContatosLoja phone={phone} />
      </div>
      <div className="m-container">
        <RodapeBase />
      </div>
    </footer>
  )
}
