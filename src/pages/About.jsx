import { Link } from 'react-router-dom'
import { ShieldCheck, Users, Wrench, ThumbsUp } from 'lucide-react'
import './Static.css'

export default function About() {
  return (
    <div className="static-page">
      <div className="container">
        <span className="eyebrow">Quem somos</span>
        <h1>Ajudando você a encontrar o carro certo.</h1>
        <p className="static-lead">
          A M&3 Veículos nasceu para tornar a compra e a venda de veículos novos e seminovos
          simples, transparente e segura. Selecionamos cada veículo com cuidado, revisamos
          antes da entrega e acompanhamos você do primeiro contato até a retirada das chaves.
        </p>

        <div className="static-grid">
          <div className="static-card">
            <ShieldCheck size={22} />
            <h3>Confiança em primeiro lugar</h3>
            <p>Todo carro passa por vistoria cautelar e revisão completa antes de ir para o estoque.</p>
          </div>
          <div className="static-card">
            <Wrench size={22} />
            <h3>Pós-venda de verdade</h3>
            <p>Garantia de 90 dias em motor e câmbio, com suporte próximo após a compra.</p>
          </div>
          <div className="static-card">
            <Users size={22} />
            <h3>Atendimento humano</h3>
            <p>Sem pressão, sem letra miúda. Nossa equipe te ajuda a decidir com calma.</p>
          </div>
          <div className="static-card">
            <ThumbsUp size={22} />
            <h3>Compra, venda e troca</h3>
            <p>Facilitamos todo o processo: financiamento, consignação e aceitamos seu usado na troca.</p>
          </div>
        </div>

        <div className="static-cta">
          <h2>Pronto para encontrar o seu próximo carro?</h2>
          <Link to="/estoque" className="btn btn-primary">Ver estoque completo</Link>
        </div>
      </div>
    </div>
  )
}
