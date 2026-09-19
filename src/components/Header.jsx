import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Menu, X, ChevronDown, Phone } from 'lucide-react'
import { CATEGORIES, BRANDS } from '../utils/carFormat.js'
import './Header.css'

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  function handleSearch(e) {
    e.preventDefault()
    navigate(`/estoque${query ? `?busca=${encodeURIComponent(query)}` : ''}`)
    setMobileOpen(false)
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo" onClick={() => setMobileOpen(false)}>
          <span className="logo-mark">
            <img src="/logo.jpg" alt="M&3 Veículos" />
          </span>
          <span className="logo-text">
            M&3 <strong>Veículos</strong>
          </span>
        </Link>

        <nav className="nav nav-desktop">
          <Link to="/">Início</Link>
          <Link to="/estoque">Estoque</Link>

          <div className="nav-dropdown">
            <button type="button" className="nav-dropdown-trigger">
              Categorias <ChevronDown size={15} />
            </button>
            <div className="nav-dropdown-panel">
              {CATEGORIES.map((c) => (
                <Link key={c.slug} to={`/estoque?categoria=${c.slug}`}>
                  {c.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="nav-dropdown">
            <button type="button" className="nav-dropdown-trigger">
              Marcas <ChevronDown size={15} />
            </button>
            <div className="nav-dropdown-panel nav-dropdown-panel-wide">
              {BRANDS.map((b) => (
                <Link key={b} to={`/estoque?marca=${encodeURIComponent(b)}`}>
                  {b}
                </Link>
              ))}
            </div>
          </div>

          <Link to="/sobre">Sobre</Link>
          <Link to="/contato">Contato</Link>
        </nav>

        <div className="header-actions">
          <form className="header-search" onSubmit={handleSearch}>
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar marca ou modelo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <a className="header-phone" href="tel:+5598981893675">
            <Phone size={16} />
            <span>(98) 98189-3675</span>
          </a>
          <button
            type="button"
            className="header-burger"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="nav-mobile">
          <form className="header-search header-search-mobile" onSubmit={handleSearch}>
            <Search size={17} />
            <input
              type="text"
              placeholder="Buscar marca ou modelo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <Link to="/" onClick={() => setMobileOpen(false)}>Início</Link>
          <Link to="/estoque" onClick={() => setMobileOpen(false)}>Estoque</Link>
          <p className="nav-mobile-label">Categorias</p>
          <div className="nav-mobile-chips">
            {CATEGORIES.map((c) => (
              <Link key={c.slug} to={`/estoque?categoria=${c.slug}`} onClick={() => setMobileOpen(false)}>
                {c.label}
              </Link>
            ))}
          </div>
          <p className="nav-mobile-label">Marcas</p>
          <div className="nav-mobile-chips">
            {BRANDS.map((b) => (
              <Link key={b} to={`/estoque?marca=${encodeURIComponent(b)}`} onClick={() => setMobileOpen(false)}>
                {b}
              </Link>
            ))}
          </div>
          <Link to="/sobre" onClick={() => setMobileOpen(false)}>Sobre</Link>
          <Link to="/contato" onClick={() => setMobileOpen(false)}>Contato</Link>
        </div>
      )}
    </header>
  )
}
