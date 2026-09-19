import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setSent(true)
    setEmail('')
  }

  return (
    <footer className="footer">
      <div className="container footer-newsletter">
        <div>
          <h3>Fique por dentro das novidades do estoque</h3>
          <p>Receba por e-mail os carros recém-chegados e condições especiais.</p>
        </div>
        <form onSubmit={handleSubmit} className="newsletter-form">
          <input
            type="email"
            required
            placeholder="Seu melhor e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            {sent ? 'Inscrito!' : 'Assinar'}
          </button>
        </form>
      </div>

      <div className="container footer-grid">
        <div className="footer-col footer-brand">
          <div className="logo">
            <span className="logo-mark">
              <img src="/logo.jpg" alt="M&3 Veículos" />
            </span>
            <span className="logo-text">
              M&3 <strong>Veículos</strong>
            </span>
          </div>
          <p>Veículos novos e seminovos com procedência garantida. Financiamento, consignação, compra, venda e troca.</p>
          <div className="footer-social">
            <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">IG</a>
            <a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook">FB</a>
            <a href="https://youtube.com" target="_blank" rel="noreferrer" aria-label="Youtube">YT</a>
          </div>
        </div>

        <div className="footer-col">
          <h4>M&3 Veículos</h4>
          <Link to="/sobre">Quem somos</Link>
          <Link to="/contato">Fale conosco</Link>
          <Link to="/estoque">Ver estoque completo</Link>
          <a href="#" onClick={(e) => e.preventDefault()}>Trabalhe conosco</a>
        </div>

        <div className="footer-col">
          <h4>Políticas e informações</h4>
          <a href="#" onClick={(e) => e.preventDefault()}>Política de Privacidade</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Garantia e Devolução</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Financiamento</a>
          <a href="#" onClick={(e) => e.preventDefault()}>Termos de Uso</a>
        </div>

        <div className="footer-col">
          <h4>Precisa de atendimento?</h4>
          <p className="footer-hours">Seg. a sáb. — 09h às 18h</p>
          <p><strong>WhatsApp:</strong> (98) 98189-3675</p>
          <p><strong>WhatsApp:</strong> (98) 98888-6144</p>
          <p><strong>E-mail:</strong> contato@m3veiculos.com.br</p>
          <p><strong>Endereço:</strong> Av. dos Holandeses, Qd. 38, nº 25 — São Luís/MA, CEP 65071-380</p>
        </div>
      </div>

      <div className="container footer-bottom">
        <p>© 2026 M&3 Veículos. Todos os direitos reservados. CNPJ: 12.468.326/0001-27</p>
      </div>
    </footer>
  )
}
