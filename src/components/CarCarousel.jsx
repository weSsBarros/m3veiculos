import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import CarCard from './CarCard.jsx'
import './CarCarousel.css'

export default function CarCarousel({ eyebrow, title, cars, viewAllLink }) {
  const trackRef = useRef(null)

  function scrollBy(dir) {
    const track = trackRef.current
    if (!track) return
    const amount = track.clientWidth * 0.8 * dir
    track.scrollBy({ left: amount, behavior: 'smooth' })
  }

  return (
    <section className="section car-carousel">
      <div className="container">
        <div className="section-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <div className="carousel-controls">
            {viewAllLink && (
              <Link to={viewAllLink} className="link-arrow">Ver todos →</Link>
            )}
            <button type="button" aria-label="Anterior" onClick={() => scrollBy(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" aria-label="Próximo" onClick={() => scrollBy(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="car-carousel-track" ref={trackRef}>
          {cars.map((car) => (
            <div className="car-carousel-item" key={car.id}>
              <CarCard car={car} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
