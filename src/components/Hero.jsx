import { Link } from 'react-router-dom'
import { CheckCircle2, ShieldCheck, Wallet, RefreshCcw } from 'lucide-react'
import './Hero.css'

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero-inner">
        <div className="hero-content">
          <h1>
            Encontre o carro novo ou
            <br /> seminovo certo pra você.
          </h1>
          <ul className="hero-bullets">
            <li><CheckCircle2 size={18} /> Novos e seminovos com procedência garantida</li>
            <li><CheckCircle2 size={18} /> Consignação, compra, venda e troca</li>
            <li><CheckCircle2 size={18} /> Financiamento aprovado em minutos</li>
          </ul>
          <div className="hero-actions">
            <Link to="/estoque" className="btn btn-primary">Ver estoque</Link>
            <Link to="/contato" className="btn btn-outline">Falar com um consultor</Link>
          </div>
          <div className="hero-perks">
            <span><ShieldCheck size={16} /> Garantia de 90 dias</span>
            <span><Wallet size={16} /> Em até 60x</span>
            <span><RefreshCcw size={16} /> Aceitamos seu usado na troca</span>
          </div>
        </div>

        <div className="hero-media">
          <img
            src="/loja/cartao.jpeg"
            alt="M&3 Veículos"
          />
        </div>
      </div>
    </section>
  )
}
