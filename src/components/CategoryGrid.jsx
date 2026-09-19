import { Link } from 'react-router-dom'
import { CATEGORIES } from '../utils/carFormat.js'
import './CategoryGrid.css'

export default function CategoryGrid() {
  return (
    <section className="section category-grid-section">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Navegue pelo estoque</span>
            <h2>Escolha por categoria</h2>
          </div>
        </div>

        <div className="category-grid">
          {CATEGORIES.map((c) => (
            <Link key={c.slug} to={`/estoque?categoria=${c.slug}`} className="category-item">
              <span className="category-circle">
                <img src={c.image} alt={c.label} loading="lazy" />
              </span>
              <span className="category-label">{c.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
