import { X } from 'lucide-react'
import './ConfirmDialog.css'

export default function ConfirmDialog({ title, message, options, onClose }) {
  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        <div className="confirm-dialog-actions">
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className={`btn ${opt.variant === 'primary' ? 'btn-primary' : 'btn-outline'} btn-block`}
              onClick={opt.onClick}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
