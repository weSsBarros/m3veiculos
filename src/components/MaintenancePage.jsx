import './MaintenancePage.css'

// Site da loja bloqueada pela WB.Dev (painel WB.Dev → Clientes → Acesso): só o
// logo e o aviso, sem estoque, preços nem contato. Logo e cores desta loja.
export default function MaintenancePage() {
  return (
    <main className="maintenance-page is-dark" style={{ '--maintenance-surface': '#000' }}>
      <div className="maintenance-card">
        <div className="maintenance-logo">
          {/* O logo.jpg tem muita margem preta: mostra só a faixa do meio, onde fica o desenho */}
          <img src="/logo.jpg" alt="M&3 Veículos" style={{ width: 240, height: 120, maxHeight: 'none', objectFit: 'cover' }} />
        </div>
        <h1>Site em manutenção</h1>
        <p>Voltamos em breve. Obrigado pela compreensão.</p>
      </div>
    </main>
  )
}
