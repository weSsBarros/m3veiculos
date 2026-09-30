import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Wrench, Bookmark, BadgeCheck, ChevronDown, Check } from 'lucide-react'
import { CAR_STATUSES } from '../utils/carFormat.js'

const ICONS = {
  disponivel: CheckCircle2,
  manutencao: Wrench,
  reservado: Bookmark,
  vendido: BadgeCheck,
}

// Status do carro: etiqueta colorida (maior e legível) que abre um menu com
// as opções. lockedReason: texto que explica por que não dá para mudar
// (ex.: vendedor com carro vendido) — a etiqueta fica só de leitura.
export default function StatusMenu({ value, onChange, disabled = false, lockedReason = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const Icon = ICONS[value] || CheckCircle2
  const current = CAR_STATUSES.find((s) => s.value === value)
  const locked = disabled || Boolean(lockedReason)

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function choose(next) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  return (
    <div className="status-menu" ref={ref}>
      <button
        type="button"
        className={`status-pill status-${value}`}
        onClick={() => !locked && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${current?.label || value}${locked ? '' : ' (clique para mudar)'}`}
        title={lockedReason || undefined}
      >
        <Icon size={17} />
        <span>{current?.label || value}</span>
        {!locked && <ChevronDown size={16} className="status-pill-caret" />}
      </button>
      {open && (
        <div className="status-menu-list" role="menu">
          {CAR_STATUSES.map((s) => {
            const OptionIcon = ICONS[s.value] || CheckCircle2
            return (
              <button
                key={s.value}
                type="button"
                role="menuitemradio"
                aria-checked={s.value === value}
                className={`status-menu-option status-${s.value} ${s.value === value ? 'is-current' : ''}`}
                onClick={() => choose(s.value)}
              >
                <OptionIcon size={17} />
                <span>{s.label}</span>
                {s.value === value && <Check size={16} className="status-menu-check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
