import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Wrench, Bookmark, BadgeCheck, ChevronDown, Check } from 'lucide-react'
import { CAR_STATUSES } from '../utils/carFormat.js'

const ICONS = {
  disponivel: CheckCircle2,
  manutencao: Wrench,
  reservado: Bookmark,
  vendido: BadgeCheck,
}

const GAP = 6
const MARGIN = 8

// Status do carro: etiqueta colorida (maior e legível) que abre um menu com
// as opções. lockedReason: texto que explica por que não dá para mudar
// (ex.: vendedor com carro vendido) — a etiqueta fica só de leitura.
//
// O menu abre por cima da página (portal no body, posição fixa calculada a
// partir da etiqueta): dentro do card ou da tabela ele era cortado. Abre para
// cima quando não cabe embaixo e fecha ao rolar a página.
export default function StatusMenu({ value, onChange, disabled = false, lockedReason = '' }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const ref = useRef(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const Icon = ICONS[value] || CheckCircle2
  const current = CAR_STATUSES.find((s) => s.value === value)
  const locked = disabled || Boolean(lockedReason)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !listRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const height = listRef.current.offsetHeight
    const width = Math.max(listRef.current.offsetWidth, rect.width)
    const below = window.innerHeight - rect.bottom
    const above = rect.top
    const top = below >= height + GAP + MARGIN || below >= above ? rect.bottom + GAP : Math.max(MARGIN, rect.top - height - GAP)
    const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - width - MARGIN)
    setPosition({ top, left, minWidth: Math.max(220, rect.width) })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e) {
      if (ref.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function close() {
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function toggle() {
    if (locked) return
    setPosition(null)
    setOpen((o) => !o)
  }

  function choose(next) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  return (
    <div className="status-menu" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={`status-pill status-${value}`}
        onClick={toggle}
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
      {open &&
        createPortal(
          <div
            ref={listRef}
            className="status-menu-list"
            role="menu"
            // Primeiro mede (invisível), depois posiciona
            style={position ? { top: position.top, left: position.left, minWidth: position.minWidth } : { top: 0, left: 0, visibility: 'hidden' }}
          >
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
          </div>,
          document.body
        )}
    </div>
  )
}
