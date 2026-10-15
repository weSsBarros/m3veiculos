import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import CarCard from '../components/CarCard.jsx'
import { MODELOS, useModeloState, useSiteModelo, setModeloPrevia, sairDaPrevia } from './siteModelo.js'
import { TopoEstoque, InicioEstoque, LinhaEstoque, RodapeEstoque } from './estoque.jsx'
import { TopoVitrine, InicioVitrine, CartaoVitrine, RodapeVitrine } from './vitrine.jsx'
import { TopoBairro, InicioBairro, CartaoBairro, BarraCarroBairro, RodapeBairro } from './bairro.jsx'

// Ponto de entrada dos modelos de site. Cada peça mostra a do modelo escolhido ou, no
// modelo atual (padrão), a da própria loja (passada em "padrao").

const TOPOS = { estoque: TopoEstoque, vitrine: TopoVitrine, bairro: TopoBairro }
const RODAPES = { estoque: RodapeEstoque, vitrine: RodapeVitrine, bairro: RodapeBairro }
const INICIOS = { estoque: InicioEstoque, vitrine: InicioVitrine, bairro: InicioBairro }

export function ModeloTopo({ padrao }) {
  const Topo = TOPOS[useSiteModelo()]
  return Topo ? <Topo /> : padrao
}

export function ModeloRodape({ padrao }) {
  const Rodape = RODAPES[useSiteModelo()]
  return Rodape ? <Rodape /> : padrao
}

export function ModeloInicio({ padrao }) {
  const Inicio = INICIOS[useSiteModelo()]
  return Inicio ? <Inicio /> : padrao
}

// Cartão do carro nas listas. "grade" = lista em grade (carros parecidos): no modelo
// "Estoque primeiro" fica o cartão da loja, porque a linha não cabe no carrossel.
export function ModeloCard({ car, grade = false, ...rest }) {
  const modelo = useSiteModelo()
  if (modelo === 'estoque' && !grade) return <LinhaEstoque car={car} />
  if (modelo === 'vitrine') return <CartaoVitrine car={car} />
  if (modelo === 'bairro') return <CartaoBairro car={car} />
  return <CarCard car={car} {...rest} />
}

// Página do carro: barra fixa de WhatsApp no celular (só no modelo "Revenda de bairro")
export function ModeloBarraCarro({ car, vendido = false }) {
  const modelo = useSiteModelo()
  if (modelo !== 'bairro' || !car || vendido) return null
  return <BarraCarroBairro car={car} />
}

// Barrinha da prévia (só aparece com ?modelo= no endereço): troca o modelo e sai da prévia
export function ModeloBar() {
  const { modelo, previa } = useModeloState()
  const [aberta, setAberta] = useState(true)
  if (!previa) return null
  const atual = MODELOS.find((m) => m.id === modelo) || MODELOS[0]

  if (!aberta) {
    return (
      <div className="m-previa is-recolhida">
        <button type="button" className="m-previa-pilula" onClick={() => setAberta(true)} aria-expanded="false">
          Prévia: {atual.numero ? `${atual.numero}. ` : ''}
          {atual.nome}
        </button>
      </div>
    )
  }

  return (
    <div className="m-previa" role="region" aria-label="Prévia dos modelos do site">
      <div className="m-previa-cabeca">
        <span className="m-previa-titulo">Prévia do modelo</span>
        <button type="button" className="m-previa-icone" onClick={() => setAberta(false)} aria-label="Recolher a barrinha" aria-expanded="true">
          <ChevronDown size={16} />
        </button>
        <button type="button" className="m-previa-icone" onClick={sairDaPrevia} aria-label="Sair da prévia (volta ao visual atual)">
          <X size={16} />
        </button>
      </div>
      <div className="m-previa-opcoes" role="group" aria-label="Modelo do site">
        {MODELOS.map((m) => (
          <button key={m.id} type="button" aria-pressed={m.id === modelo} onClick={() => setModeloPrevia(m.id)}>
            <span className="m-previa-num">{m.numero || '·'}</span>
            <span className="m-previa-texto">
              <strong>{m.nome}</strong>
              <span>{m.resumo}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
