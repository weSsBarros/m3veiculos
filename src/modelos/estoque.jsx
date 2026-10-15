import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Search, Menu, X, MessageCircle, ArrowRight } from 'lucide-react'
import { useCars } from '../context/CarsContext.jsx'
import { whatsappLinkForCar } from '../utils/whatsapp.js'
import { useMainPhone, hasRealPhone } from '../utils/whatsappRouter.js'
import { responsivePhoto } from '../utils/carPhotos.js'
import { formatCurrency, discountPercent } from '../utils/carFormat.js'
import { formatMileage } from '../utils/vehicleTypes.js'
import { NAV, SORTS, priceText, transmissionShort, categoryCounts, brandCounts, sortCars, filterCars, stockLink } from './comum.js'
import { LogoLink, MenuCelular, ContatosLoja, RodapeBase, formatPhone, linkContato, linkEstoque } from './partes.jsx'
import './estoque.css'

// Modelo 1, "Estoque primeiro": para loja com muitos carros. A página inicial é a
// lista do estoque, com abas de categoria, índice de marcas e ordem, filtrando ali
// mesmo; o topo tem a busca sempre à mão.

const LIMITE = 12
const NAV_TOPO = NAV.filter((item) => item.to !== '/')

export function TopoEstoque() {
  const [open, setOpen] = useState(false)
  const [termo, setTermo] = useState('')
  const phone = useMainPhone()
  const navigate = useNavigate()
  const close = () => setOpen(false)

  function buscar(e) {
    e.preventDefault()
    const texto = termo.trim()
    navigate(texto ? `/estoque?busca=${encodeURIComponent(texto)}` : '/estoque')
    close()
  }

  return (
    <header className="m-topo m-claro m-est-topo">
      <div className="m-container m-est-topo-linha">
        <LogoLink onClick={close} />
        <form className="m-est-busca" role="search" onSubmit={buscar}>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar marca ou modelo"
            aria-label="Buscar marca ou modelo no estoque"
            enterKeyHint="search"
          />
        </form>
        <nav className="m-est-nav" aria-label="Menu principal">
          {NAV_TOPO.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <a className="m-btn m-btn-zap m-est-zap" href={linkContato()} target="_blank" rel="noreferrer">
          <MessageCircle size={17} aria-hidden="true" /> <span>WhatsApp</span>
        </a>
        <button
          type="button"
          className="m-burger"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
          aria-controls="m-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && <MenuCelular id="m-menu" phone={phone} onClose={close} />}
    </header>
  )
}

// Uma linha do estoque: foto, nome, versão e ficha à esquerda; preço e WhatsApp à direita.
// O nome é o link (cobre a linha toda); o WhatsApp fica por cima.
export function LinhaEstoque({ car }) {
  const url = `/carro/${car.slug}`
  const nome = `${car.brand} ${car.model}`
  const off = car.price != null && discountPercent(car.price, car.originalPrice)
  const badge = car.badge && car.badge !== 'Disponível' ? car.badge : ''

  return (
    <article className="m-linha">
      <div className="m-linha-foto">
        {car.images?.[0] ? (
          <img {...responsivePhoto(car.images[0], '(max-width: 640px) 128px, 232px')} alt="" loading="lazy" />
        ) : (
          <span className="m-linha-semfoto">Foto em breve</span>
        )}
        {(off || badge) && (
          <span className="m-linha-tags">
            {off && <span className="is-oferta">{off}% OFF</span>}
            {badge && <span>{badge}</span>}
          </span>
        )}
      </div>
      <div className="m-linha-dados">
        <h3>
          <Link to={url} className="m-linha-link">
            {nome}
          </Link>
        </h3>
        <p className="m-linha-versao">{car.version}</p>
        <ul className="m-linha-ficha">
          <li>{car.modelYear}</li>
          <li>{formatMileage(car)}</li>
          {car.transmission && <li>{transmissionShort(car.transmission)}</li>}
          {car.fuel && <li>{car.fuel}</li>}
        </ul>
      </div>
      <div className="m-linha-preco">
        {car.price != null && car.originalPrice && <s>{formatCurrency(car.originalPrice)}</s>}
        <strong className={car.price == null ? 'is-consulte' : ''}>{priceText(car)}</strong>
      </div>
      <a className="m-linha-zap" href={whatsappLinkForCar(car)} target="_blank" rel="noreferrer" aria-label={`Falar no WhatsApp sobre ${nome}`}>
        <MessageCircle size={18} aria-hidden="true" />
      </a>
    </article>
  )
}

function titulo(loading, total) {
  if (loading) return 'Carregando o estoque…'
  if (total === 0) return 'Estoque em atualização'
  return (
    <>
      <span className="m-est-num">{total}</span> {total === 1 ? 'carro à venda' : 'carros à venda'}
    </>
  )
}

export function InicioEstoque() {
  const { cars, loading, error } = useCars()
  const phone = useMainPhone()
  const [categoria, setCategoria] = useState('')
  const [marca, setMarca] = useState('')
  const [ordem, setOrdem] = useState('recentes')

  const categorias = useMemo(() => categoryCounts(cars), [cars])
  const naCategoria = useMemo(() => filterCars(cars, { categoria }), [cars, categoria])
  const marcas = useMemo(() => brandCounts(naCategoria), [naCategoria])
  // A marca escolhida sai do filtro quando a categoria nova não tem carro dela
  const marcaAtiva = marcas.some((m) => m.brand === marca) ? marca : ''
  const filtrados = useMemo(() => sortCars(filterCars(naCategoria, { marca: marcaAtiva }), ordem), [naCategoria, marcaAtiva, ordem])
  const visiveis = filtrados.slice(0, LIMITE)
  const filtrando = Boolean(categoria || marcaAtiva)

  function limpar() {
    setCategoria('')
    setMarca('')
  }

  return (
    <>
      <section className="m-est-painel">
        <div className="m-container">
          <div className="m-est-cabeca">
            <h1>{titulo(loading, cars.length)}</h1>
            {cars.length > 1 && (
              <label className="m-est-ordem">
                <span>Ordenar</span>
                <select value={ordem} onChange={(e) => setOrdem(e.target.value)}>
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {categorias.length > 1 && (
            <div className="m-est-abas" role="group" aria-label="Categorias">
              <button type="button" aria-pressed={!categoria} onClick={() => setCategoria('')}>
                Todos <span>{cars.length}</span>
              </button>
              {categorias.map((c) => (
                <button key={c.slug} type="button" aria-pressed={categoria === c.slug} onClick={() => setCategoria(categoria === c.slug ? '' : c.slug)}>
                  {c.label} <span>{c.count}</span>
                </button>
              ))}
            </div>
          )}

          {marcas.length > 1 && (
            <div className="m-est-marcas">
              <span className="m-est-marcas-rotulo" id="m-est-marcas-rotulo">
                Marcas
              </span>
              <div className="m-est-marcas-lista" role="group" aria-labelledby="m-est-marcas-rotulo">
                {marcas.map((m) => (
                  <button key={m.brand} type="button" aria-pressed={marcaAtiva === m.brand} onClick={() => setMarca(marcaAtiva === m.brand ? '' : m.brand)}>
                    {m.brand} <span>{m.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && error && <p className="m-est-aviso">Não foi possível carregar os carros agora. Tente recarregar a página em instantes.</p>}

          {!loading && !error && cars.length === 0 && (
            <div className="m-est-vazio">
              <p>Estamos atualizando o estoque do site. Fale com a loja para saber quais carros estão disponíveis agora.</p>
              <a className="m-btn m-btn-zap" href={linkEstoque()} target="_blank" rel="noreferrer">
                <MessageCircle size={18} aria-hidden="true" /> Falar no WhatsApp
              </a>
            </div>
          )}

          {filtrados.length > 0 && (
            <>
              <p className="m-est-resultado" aria-live="polite">
                <span>{filtrando ? `${filtrados.length} de ${cars.length} carros` : `Mostrando ${visiveis.length} de ${cars.length}`}</span>
                {filtrando && (
                  <button type="button" onClick={limpar}>
                    Limpar filtros
                  </button>
                )}
              </p>
              <ul className="m-est-lista">
                {visiveis.map((car) => (
                  <li key={car.id}>
                    <LinhaEstoque car={car} />
                  </li>
                ))}
              </ul>
              {filtrados.length > visiveis.length && (
                <Link to={stockLink({ categoria, marca: marcaAtiva })} className="m-btn m-btn-primario m-est-mais">
                  Ver os {filtrados.length} carros <ArrowRight size={17} aria-hidden="true" />
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      <section className="m-est-servicos" aria-label="Atendimento">
        <div className="m-container m-est-servicos-grade">
          <Link to="/financiamento">
            <strong>Financiamento</strong>
            <span>Simule a parcela e mande pelo WhatsApp.</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link to="/venda-seu-veiculo">
            <strong>Venda ou troca</strong>
            <span>Conte qual é o seu carro e receba a avaliação.</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <a href={linkContato()} target="_blank" rel="noreferrer">
            <strong>Fale com a loja</strong>
            <span>{hasRealPhone(phone) ? `WhatsApp ${formatPhone(phone)}` : 'Atendimento pelo WhatsApp'}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </section>
    </>
  )
}

export function RodapeEstoque() {
  const phone = useMainPhone()
  return (
    <footer className="m-rodape m-claro m-est-rodape">
      <div className="m-container m-est-rodape-grade">
        <div className="m-est-rodape-marca">
          <LogoLink />
          <a className="m-btn m-btn-zap" href={linkContato()} target="_blank" rel="noreferrer">
            <MessageCircle size={17} aria-hidden="true" /> Falar no WhatsApp
          </a>
        </div>
        <nav className="m-est-rodape-nav" aria-label="Rodapé">
          {NAV_TOPO.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
        <ContatosLoja phone={phone} />
      </div>
      <div className="m-container">
        <RodapeBase />
      </div>
    </footer>
  )
}
