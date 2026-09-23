import { useState } from 'react'
import { X } from 'lucide-react'
import { whatsappLinkForFinancing } from '../utils/whatsapp.js'
import './FinancingModal.css'

const EMPTY_FORM = {
  fullName: '',
  birthDate: '',
  email: '',
  phone: '',
  hasCnh: '',
  cpf: '',
  downPayment: '',
}

export default function FinancingModal({ car, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    window.open(whatsappLinkForFinancing(car, form), '_blank', 'noreferrer')
    onClose()
  }

  return (
    <div className="financing-modal-backdrop" onClick={onClose}>
      <div className="financing-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="financing-modal-close" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>

        <h2>Simular financiamento</h2>
        <p className="financing-modal-subtitle">
          Preencha seus dados para agilizarmos a simulação do <strong>{car.brand} {car.model} {car.version}</strong>. Enviaremos essas informações no WhatsApp para o vendedor.
        </p>

        <form className="financing-modal-form" onSubmit={handleSubmit}>
          <label>
            Nome completo
            <input required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="Seu nome completo" />
          </label>
          <label>
            Data de nascimento
            <input type="date" required value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} />
          </label>
          <label>
            E-mail
            <input type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="voce@email.com" />
          </label>
          <label>
            Número de contato
            <input type="tel" required value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="(00) 00000-0000" />
          </label>
          <label>
            Tem CNH?
            <div className="financing-modal-radio-group">
              <label className="financing-modal-radio">
                <input
                  type="radio"
                  name="hasCnh"
                  value="Sim"
                  checked={form.hasCnh === 'Sim'}
                  onChange={(e) => update('hasCnh', e.target.value)}
                  required
                />
                Sim
              </label>
              <label className="financing-modal-radio">
                <input
                  type="radio"
                  name="hasCnh"
                  value="Não"
                  checked={form.hasCnh === 'Não'}
                  onChange={(e) => update('hasCnh', e.target.value)}
                  required
                />
                Não
              </label>
            </div>
          </label>
          <label>
            CPF
            <input required value={form.cpf} onChange={(e) => update('cpf', e.target.value)} placeholder="000.000.000-00" />
          </label>
          <label>
            Valor de entrada
            <input required value={form.downPayment} onChange={(e) => update('downPayment', e.target.value)} placeholder="Ex: R$ 10.000" />
          </label>

          <button type="submit" className="btn btn-whatsapp btn-block">
            Enviar simulação pelo WhatsApp
          </button>
        </form>
      </div>
    </div>
  )
}
