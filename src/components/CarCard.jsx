import { Link } from 'react-router-dom'
import { Gauge, Fuel, Settings2 } from 'lucide-react'
import { formatCurrency, estimateInstallment, discountPercent } from '../utils/carFormat.js'
import './CarCard.css'

export default function CarCard({ car }) {
  const off = discountPercent(car.price, car.originalPrice)

  return (
    <Link to={`/carro/${car.slug}`} className="car-card">
      <div className="car-card-media">
        {off && <span className="pill pill-danger car-card-badge">{off}% OFF</span>}
        <span className="pill pill-dark car-card-stock">{car.badge}</span>
        <img src={car.images[0]} alt={`${car.brand} ${car.model}`} loading="lazy" />
      </div>
      <div className="car-card-body">
        <h3>
          {car.brand} {car.model}
        </h3>
        <p className="car-card-version">{car.version} · {car.modelYear}</p>

        <div className="car-card-specs">
          <span><Gauge size={14} /> {car.km.toLocaleString('pt-BR')} km</span>
          <span><Settings2 size={14} /> {car.transmission.split(' ')[0]}</span>
          <span><Fuel size={14} /> {car.fuel}</span>
        </div>

        <div className="car-card-price">
          {car.originalPrice && <span className="price-old">{formatCurrency(car.originalPrice)}</span>}
          <span className="price-main">{formatCurrency(car.price)}</span>
          <span className="price-installment">ou em até 48x de {estimateInstallment(car.price)}</span>
        </div>

        <span className="btn btn-outline btn-block car-card-cta">Ver detalhes</span>
      </div>
    </Link>
  )
}
