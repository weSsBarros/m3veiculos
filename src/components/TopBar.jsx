import './TopBar.css'

const MESSAGES = [
  'Veículos novos e seminovos',
  'Financiamos em até 60x',
  'Aceitamos seu usado na troca',
  'Consignação, compra e venda',
]

const BLOCK = Array(6).fill(MESSAGES).flat()

export default function TopBar() {
  const items = [...BLOCK, ...BLOCK]
  return (
    <div className="topbar">
      <div className="topbar-track">
        {items.map((msg, i) => (
          <span className="topbar-item" key={i}>
            {msg}
          </span>
        ))}
      </div>
    </div>
  )
}
