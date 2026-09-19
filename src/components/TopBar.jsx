import './TopBar.css'

const MESSAGES = [
  'Veículos novos e seminovos',
  'Financiamos em até 60x',
  'Aceitamos seu usado na troca',
  'Consignação, compra e venda',
]

export default function TopBar() {
  const items = [...MESSAGES, ...MESSAGES]
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
