import { useState } from 'react'
import { Phone, Mail, MapPin, Clock, MessageCircle } from 'lucide-react'
import { whatsappLink } from '../utils/whatsapp.js'
import './Static.css'

export default function Contact() {
  const [form, setForm] = useState({ name: '', phone: '', message: '' })
  const [sent, setSent] = useState(false)

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const text = `Olá! Meu nome é ${form.name || '—'}.\nTelefone: ${form.phone || '—'}\nMensagem: ${form.message || '—'}`
    window.open(whatsappLink(text), '_blank', 'noreferrer')
    setSent(true)
  }

  return (
    <div className="static-page">
      <div className="container">
        <span className="eyebrow">Fale conosco</span>
        <h1>Estamos por perto para te ajudar.</h1>

        <div className="contact-grid">
          <div className="contact-info">
            <div className="contact-info-item">
              <Phone size={20} />
              <div>
                <strong>Telefone / WhatsApp</strong>
                <p>(98) 98189-3675</p>
                <p>(98) 98888-6144</p>
              </div>
            </div>
            <div className="contact-info-item">
              <Mail size={20} />
              <div>
                <strong>E-mail</strong>
                <p>contato@m3veiculos.com.br</p>
              </div>
            </div>
            <div className="contact-info-item">
              <MapPin size={20} />
              <div>
                <strong>Endereço</strong>
                <p>Av. dos Holandeses, Qd. 38, nº 25 — São Luís/MA, CEP 65071-380</p>
              </div>
            </div>
            <div className="contact-info-item">
              <Clock size={20} />
              <div>
                <strong>Horário</strong>
                <p>Segunda a sábado, 9h às 18h</p>
              </div>
            </div>
          </div>

          <form className="contact-form" onSubmit={handleSubmit}>
            <label>
              Nome
              <input name="name" value={form.name} onChange={handleChange} required placeholder="Seu nome" />
            </label>
            <label>
              Telefone
              <input name="phone" value={form.phone} onChange={handleChange} required placeholder="(00) 00000-0000" />
            </label>
            <label>
              Mensagem
              <textarea name="message" value={form.message} onChange={handleChange} rows={4} placeholder="Como podemos ajudar?" />
            </label>
            <button type="submit" className="btn btn-whatsapp btn-block">
              <MessageCircle size={18} /> {sent ? 'Abrindo o WhatsApp…' : 'Enviar pelo WhatsApp'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
