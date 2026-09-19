import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import './FAQ.css'

const QUESTIONS = [
  {
    q: 'Como funciona o financiamento?',
    a: 'Trabalhamos com os principais bancos e financeiras do mercado. Você simula direto no site ou pelo WhatsApp e recebe a aprovação em poucos minutos, com entrada facilitada e parcelas em até 60x.',
  },
  {
    q: 'Os carros têm garantia?',
    a: 'Sim. Todo veículo vendido pela M&3 Veículos sai com garantia de 90 dias para motor e câmbio, além de revisão completa antes da entrega.',
  },
  {
    q: 'Vocês aceitam meu carro usado como parte do pagamento?',
    a: 'Aceitamos! Fazemos a avaliação do seu veículo atual e abatemos o valor diretamente na compra do novo carro.',
  },
  {
    q: 'Como funciona a consignação?',
    a: 'Você deixa seu veículo conosco para anunciarmos e cuidarmos de toda a negociação. Você só define o valor mínimo aceito e recebe quando o carro for vendido.',
  },
  {
    q: 'Posso consultar o laudo cautelar antes de comprar?',
    a: 'Sim, todos os veículos possuem laudo cautelar disponível para consulta antes do fechamento do negócio, sem custo adicional.',
  },
  {
    q: 'Quais documentos preciso levar para fechar negócio?',
    a: 'Basta RG ou CNH, CPF e comprovante de residência atualizado. Para financiamento, também pedimos comprovante de renda.',
  },
]

export default function FAQ() {
  const [open, setOpen] = useState(0)

  return (
    <section className="section faq">
      <div className="container faq-inner">
        <div className="faq-head">
          <span className="eyebrow">Dúvidas frequentes</span>
          <h2>Tem alguma dúvida?</h2>
          <p>Nossa equipe de atendimento está disponível de segunda a sexta, das 8h às 18h, e aos sábados, das 8h às 14h.</p>
        </div>

        <div className="faq-list">
          {QUESTIONS.map((item, i) => {
            const isOpen = open === i
            return (
              <div className={`faq-item ${isOpen ? 'is-open' : ''}`} key={i}>
                <button type="button" className="faq-question" onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{item.q}</span>
                  {isOpen ? <Minus size={18} /> : <Plus size={18} />}
                </button>
                {isOpen && <p className="faq-answer">{item.a}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
