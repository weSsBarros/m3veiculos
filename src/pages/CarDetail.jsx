import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShieldCheck, Wrench, FileCheck2, UserCheck, ChevronRight, MessageCircle, Repeat } from 'lucide-react'
import { fetchCarBySlug, fetchSimilarCars } from '../lib/carsApi.js'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { formatCurrency, estimateInstallment, discountPercent } from '../utils/carFormat.js'
import { whatsappLinkForCar } from '../utils/whatsapp.js'
import CarCarousel from '../components/CarCarousel.jsx'
import SetupNotice from '../components/SetupNotice.jsx'
import './CarDetail.css'

const HIGHLIGHT_ICONS = {
  'Revisado na concessionária': Wrench,
  'Revisado': Wrench,
  'Revisada': Wrench,
  'Único dono': UserCheck,
  'Segundo dono': UserCheck,
  'Laudo cautelar aprovado': FileCheck2,
  'IPVA pago': ShieldCheck,
  'IPVA 2026 pago': ShieldCheck,
  'Garantia de fábrica': ShieldCheck,
}

export default function CarDetail() {
  const { slug } = useParams()
  const [car, setCar] = useState(null)
  const [similar, setSimilar] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeImage, setActiveImage] = useState(0)
  const [specsOpen, setSpecsOpen] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setActiveImage(0)

    fetchCarBySlug(slug).then(async (found) => {
      if (cancelled) return
      setCar(found)
      if (found) {
        const similarCars = await fetchSimilarCars(found)
        if (!cancelled) setSimilar(similarCars)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (!isSupabaseConfigured) return <SetupNotice />

  if (loading) {
    return (
      <div className="container car-not-found">
        <p>Carregando…</p>
      </div>
    )
  }

  if (!car) {
    return (
      <div className="container car-not-found">
        <h1>Carro não encontrado</h1>
        <p>Esse anúncio pode ter sido vendido ou removido do estoque.</p>
        <Link to="/estoque" className="btn btn-primary">Ver estoque completo</Link>
      </div>
    )
  }

  const isSold = car.status === 'vendido'
  const off = !isSold && discountPercent(car.price, car.originalPrice)

  const specs = [
    ['Marca', car.brand],
    ['Modelo', car.model],
    ['Versão', car.version],
    ['Ano/Modelo', car.modelYear],
    ['Quilometragem', `${car.km.toLocaleString('pt-BR')} km`],
    ['Câmbio', car.transmission],
    ['Combustível', car.fuel],
    ['Cor', car.color],
    ['Portas', car.doors],
    ['Condição', car.condition],
  ]

  return (
    <div className="car-detail">
      <div className="container">
        <nav className="breadcrumb">
          <Link to="/">Início</Link>
          <ChevronRight size={13} />
          <Link to="/estoque">Estoque</Link>
          <ChevronRight size={13} />
          <span>{car.brand} {car.model}</span>
        </nav>

        <div className="car-detail-grid">
          <div className="car-gallery">
            <div className="car-gallery-main">
              {isSold && <span className="pill pill-dark car-gallery-badge">Vendido</span>}
              {off && <span className="pill pill-danger car-gallery-badge">{off}% OFF</span>}
              {car.images[activeImage] && (
                <img src={car.images[activeImage]} alt={`${car.brand} ${car.model}`} />
              )}
            </div>
            {car.images.length > 1 && (
              <div className="car-gallery-thumbs">
                {car.images.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    className={i === activeImage ? 'is-active' : ''}
                    onClick={() => setActiveImage(i)}
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="car-info">
            <span className={`pill ${isSold ? 'pill-dark' : 'pill-outline'} car-info-stock`}>
              {isSold ? 'Vendido' : car.badge}
            </span>
            <h1>{car.brand} {car.model} <span>{car.version}</span></h1>
            <p className="car-info-quick">
              {car.modelYear} · {car.km.toLocaleString('pt-BR')} km · {car.transmission} · {car.fuel}
            </p>

            <div className="car-price-block">
              {car.originalPrice && <span className="price-old">De {formatCurrency(car.originalPrice)}</span>}
              <span className="price-main">{formatCurrency(car.price)}</span>
              {!isSold && (
                <span className="price-installment">ou em até 48x de {estimateInstallment(car.price)} no financiamento</span>
              )}
            </div>

            {car.highlights.length > 0 && (
              <div className="car-feature-icons">
                {car.highlights.slice(0, 4).map((h) => {
                  const Icon = HIGHLIGHT_ICONS[h] || ShieldCheck
                  return (
                    <div key={h} className="car-feature-icon">
                      <Icon size={20} />
                      <span>{h}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {isSold ? (
              <Link to="/estoque" className="btn btn-dark btn-block car-cta">Ver carros disponíveis</Link>
            ) : (
              <a
                href={whatsappLinkForCar(car)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-whatsapp btn-block car-cta"
              >
                <MessageCircle size={19} /> Falar no WhatsApp sobre este carro
              </a>
            )}

            {!isSold && (
              <div className="car-trade-badge">
                <Repeat size={18} />
                <span>Aceitamos seu usado como parte do pagamento</span>
              </div>
            )}
          </div>
        </div>

        {car.description && (
          <div className="car-description">
            <h2>Sobre este carro</h2>
            <p>{car.description}</p>
          </div>
        )}

        <div className="car-specs">
          <button type="button" className="car-specs-toggle" onClick={() => setSpecsOpen((v) => !v)}>
            Ficha técnica completa {specsOpen ? '−' : '+'}
          </button>
          {specsOpen && (
            <dl className="car-specs-table">
              {specs.map(([label, value]) => (
                <div key={label} className="car-specs-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {similar.length > 0 && (
        <CarCarousel eyebrow="Você também pode gostar" title="Carros parecidos" cars={similar} viewAllLink="/estoque" />
      )}
    </div>
  )
}
