import { Link } from 'react-router-dom'
import { ShieldCheck, Wrench, FileCheck2 } from 'lucide-react'
import './PromoBanner.css'

export default function PromoBanner() {
  return (
    <section className="section">
      <div className="container promo-banner">
        <div className="promo-media">
          <img
            src="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1100&q=80"
            alt="Mecânico revisando um carro"
            loading="lazy"
          />
        </div>
        <div className="promo-content">
          <span className="eyebrow">Compra sem dor de cabeça</span>
          <h2>Todo carro revisado, com garantia e laudo cautelar.</h2>
          <p>
            Antes de chegar até você, cada veículo passa por uma revisão completa de mais
            de 100 itens. Menos surpresa, mais confiança na hora de fechar negócio.
          </p>
          <ul className="promo-list">
            <li><ShieldCheck size={18} /> Garantia de 90 dias em motor e câmbio</li>
            <li><Wrench size={18} /> Revisão completa antes da entrega</li>
            <li><FileCheck2 size={18} /> Laudo cautelar sem custo adicional</li>
          </ul>
          <Link to="/estoque" className="btn btn-dark">Ver estoque revisado</Link>
        </div>
      </div>
    </section>
  )
}
