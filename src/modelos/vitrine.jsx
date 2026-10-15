import { useMemo, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X, MessageCircle, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCars } from '../context/CarsContext.jsx'
import { whatsappLinkForCar } from '../utils/whatsapp.js'
import { useMainPhone, hasRealPhone } from '../utils/whatsappRouter.js'
import { responsivePhoto, thumbUrl } from '../utils/carPhotos.js'
import { formatMileage, mileageLabel } from '../utils/vehicleTypes.js'
import { NAV, priceText, transmissionShort, showcaseCars, photosFirst } from './comum.js'
import { STORE_NAME, LogoLink, MenuCelular, ContatosLoja, RodapeBase, formatPhone, linkContato, linkEstoque, linkVisita } from './partes.jsx'
import './vitrine.css'

// Modelo 2, "Vitrine": para loja com poucos carros. Cada carro ganha o palco inteiro,
// um de cada vez (foto grande, nome enorme, preço), e o resto do estoque vem em
// sequência, uma foto grande por linha.

const NAV_TOPO = NAV.filter((item) => item.to !== '/')

export function TopoVitrine() {
  const [open, setOpen] = useState(false)
  const phone = useMainPhone()
  const close = () => setOpen(false)

  return (
    <header className="m-topo m-vit-topo">
      <div className="m-container m-vit-topo-linha">
        <LogoLink tone="light" onClick={close} />
        <nav className="m-vit-nav" aria-label="Menu principal">
          {NAV_TOPO.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <a className="m-vit-zap" href={linkContato()} target="_blank" rel="noreferrer">
          <MessageCircle size={16} aria-hidden="true" />
          <span>{hasRealPhone(phone) ? formatPhone(phone) : 'WhatsApp'}</span>
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

// Palco: a foto do carro da vez ocupa a primeira tela; as outras trocam por miniatura,
// pelas setas, pelo teclado (← →) ou deslizando o dedo
function Palco({ cars }) {
  const [atual, setAtual] = useState(0)
  const toque = useRef(null)
  const total = cars.length
  const idx = Math.min(atual, total - 1)
  const car = cars[idx]
  const ir = (passo) => setAtual((i) => (Math.min(i, total - 1) + passo + total) % total)

  function teclas(e) {
    if (total < 2) return
    if (e.key === 'ArrowLeft') ir(-1)
    if (e.key === 'ArrowRight') ir(1)
  }

  function fimDoToque(e) {
    if (toque.current == null || total < 2) return
    const dx = e.changedTouches[0].clientX - toque.current
    toque.current = null
    if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1)
  }

  return (
    <section
      className="m-vit-palco"
      aria-roledescription="carrossel"
      aria-label="Carros em destaque"
      onKeyDown={teclas}
      onTouchStart={(e) => {
        toque.current = e.touches[0].clientX
      }}
      onTouchEnd={fimDoToque}
    >
      <div className="m-vit-fotos" aria-hidden="true" data-foto-cheia="">
        {/* Cada foto no seu quadro: a foto em pé aparece inteira com o fundo desfocado (photoFit) */}
        {cars.map((c, i) => (
          <span key={c.id} className={`m-vit-foto${i === idx ? ' is-ativa' : ''}`}>
            <img
              {...responsivePhoto(c.images[0], '100vw')}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : undefined}
            />
          </span>
        ))}
      </div>
      <div className="m-container m-vit-palco-conteudo">
        <div className="m-vit-legenda" key={car.id}>
          <h2 className="m-vit-modelo">{car.model}</h2>
          <p className="m-vit-versao">
            {[car.brand, car.version, car.modelYear, formatMileage(car)].filter(Boolean).join(' · ')}
          </p>
          <p className={`m-vit-preco${car.price == null ? ' is-consulte' : ''}`}>{priceText(car)}</p>
          <div className="m-vit-acoes">
            <Link className="m-btn m-btn-claro" to={`/carro/${car.slug}`}>
              Ver este carro <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="m-btn m-btn-vazado" href={whatsappLinkForCar(car)} target="_blank" rel="noreferrer">
              <MessageCircle size={17} aria-hidden="true" /> WhatsApp
            </a>
          </div>
        </div>
        {total > 1 && (
          <div className="m-vit-seletor">
            <div className="m-vit-setas">
              <button type="button" onClick={() => ir(-1)} aria-label="Carro anterior">
                <ChevronLeft size={20} />
              </button>
              <span className="m-vit-contador" aria-live="polite">
                {idx + 1} / {total}
              </span>
              <button type="button" onClick={() => ir(1)} aria-label="Próximo carro">
                <ChevronRight size={20} />
              </button>
            </div>
            <ul className="m-vit-miniaturas">
              {cars.map((c, i) => (
                <li key={c.id}>
                  <button type="button" aria-pressed={i === idx} aria-label={`${c.brand} ${c.model}`} onClick={() => setAtual(i)}>
                    <img src={thumbUrl(c.images[0])} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

// Um carro por linha, foto grande e ficha ao lado (alternando o lado)
export function LoteVitrine({ car }) {
  const url = `/carro/${car.slug}`
  const ficha = [
    ['Ano', car.modelYear],
    [mileageLabel(car.category), formatMileage(car)],
    ['Câmbio', transmissionShort(car.transmission)],
    ['Combustível', car.fuel],
  ].filter(([, v]) => v)

  return (
    <article className="m-vit-lote">
      <div className="m-vit-lote-foto">
        {car.images?.[0] ? (
          <img {...responsivePhoto(car.images[0], '(max-width: 900px) 100vw, 60vw')} alt="" loading="lazy" />
        ) : (
          <span className="m-vit-semfoto">Foto em breve</span>
        )}
      </div>
      <div className="m-vit-lote-dados">
        <h3>
          <Link to={url} className="m-vit-lote-link">
            {car.model}
          </Link>
        </h3>
        <p className="m-vit-lote-versao">{[car.brand, car.version].filter(Boolean).join(' · ')}</p>
        <dl className="m-vit-ficha">
          {ficha.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className={`m-vit-lote-preco${car.price == null ? ' is-consulte' : ''}`}>{priceText(car)}</p>
        <span className="m-vit-lote-ver" aria-hidden="true">
          Ver detalhes <ArrowRight size={16} />
        </span>
      </div>
    </article>
  )
}

// Cartão do estoque completo (e dos carros parecidos): foto grande e o mínimo de texto
export function CartaoVitrine({ car }) {
  const url = `/carro/${car.slug}`
  return (
    <article className="m-vit-cartao">
      <div className="m-vit-cartao-foto">
        {car.images?.[0] ? (
          <img {...responsivePhoto(car.images[0], '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw')} alt="" loading="lazy" />
        ) : (
          <span className="m-vit-semfoto">Foto em breve</span>
        )}
      </div>
      <h3>
        <Link to={url} className="m-vit-cartao-link">
          {car.model}
        </Link>
      </h3>
      <p className="m-vit-cartao-versao">{[car.brand, car.version].filter(Boolean).join(' · ')}</p>
      <p className="m-vit-cartao-linha">
        <span>{[car.modelYear, formatMileage(car)].filter(Boolean).join(' · ')}</span>
        <strong className={car.price == null ? 'is-consulte' : ''}>{priceText(car)}</strong>
      </p>
    </article>
  )
}

export function InicioVitrine() {
  const { cars, loading, error } = useCars()
  const palco = useMemo(() => showcaseCars(cars, 5), [cars])
  const resto = useMemo(() => {
    const noPalco = new Set(palco.map((c) => c.id))
    return photosFirst(cars.filter((c) => !noPalco.has(c.id))).slice(0, 6)
  }, [cars, palco])

  return (
    <>
      <h1 className="m-escondido">{STORE_NAME ? `${STORE_NAME}: carros à venda` : 'Carros à venda'}</h1>

      {palco.length > 0 ? (
        <Palco cars={palco} />
      ) : (
        <section className="m-vit-palco m-vit-palco-vazio">
          <div className="m-container m-vit-palco-conteudo">
            <div className="m-vit-legenda">
              <h2 className="m-vit-modelo">{loading ? 'Carregando…' : 'Estoque em atualização'}</h2>
              {!loading && (
                <p className="m-vit-versao">
                  {error ? 'Não foi possível carregar os carros agora. Tente recarregar a página.' : 'Fale com a loja para saber quais carros estão disponíveis agora.'}
                </p>
              )}
              {!loading && (
                <div className="m-vit-acoes">
                  <a className="m-btn m-btn-claro" href={linkEstoque()} target="_blank" rel="noreferrer">
                    <MessageCircle size={17} aria-hidden="true" /> Falar no WhatsApp
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {resto.length > 0 && (
        <section className="m-vit-lotes" aria-labelledby="m-vit-lotes-titulo">
          <div className="m-container">
            <div className="m-vit-cabeca">
              <h2 id="m-vit-lotes-titulo">Mais carros à venda</h2>
              <Link to="/estoque" className="m-vit-tudo">
                Ver os {cars.length} carros <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <ol className="m-vit-lista">
              {resto.map((car) => (
                <li key={car.id}>
                  <LoteVitrine car={car} />
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section className="m-vit-servicos" aria-label="Atendimento">
        <div className="m-container">
          <ul>
            <li>
              <h2>Financiamento</h2>
              <p>Simule a parcela pelo site e receba as condições pelo WhatsApp.</p>
              <Link to="/financiamento" className="m-vit-servico-acao">
                Simular <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <h2>Seu carro na troca</h2>
              <p>Conte o modelo, o ano e a quilometragem para receber a avaliação.</p>
              <Link to="/venda-seu-veiculo" className="m-vit-servico-acao">
                Avaliar meu carro <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <h2>Venha ver de perto</h2>
              <p>Combine a visita pelo WhatsApp e veja o carro pessoalmente.</p>
              <a href={linkVisita()} target="_blank" rel="noreferrer" className="m-vit-servico-acao">
                Combinar visita <ArrowRight size={16} aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>
      </section>
    </>
  )
}

export function RodapeVitrine() {
  const phone = useMainPhone()
  return (
    <footer className="m-rodape m-vit-rodape">
      <div className="m-container m-vit-rodape-grade">
        <LogoLink tone="light" />
        <nav className="m-vit-rodape-nav" aria-label="Rodapé">
          {NAV_TOPO.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
        <ContatosLoja phone={phone} className="m-vit-rodape-contatos" />
      </div>
      <div className="m-container">
        <RodapeBase />
      </div>
    </footer>
  )
}
