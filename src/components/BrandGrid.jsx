import { Link } from 'react-router-dom'
import { BRANDS } from '../utils/carFormat.js'
import { useCars } from '../context/CarsContext.jsx'
import './BrandGrid.css'

export default function BrandGrid() {
  const { cars } = useCars()

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Todas as marcas</span>
            <h2>Escolha por marca</h2>
          </div>
        </div>

        <div className="brand-grid">
          {BRANDS.map((b) => {
            const count = cars.filter((c) => c.brand === b).length
            return (
              <Link key={b} to={`/estoque?marca=${encodeURIComponent(b)}`} className="brand-item">
                <span className="brand-name">{b}</span>
                <span className="brand-count">{count} {count === 1 ? 'carro' : 'carros'}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
