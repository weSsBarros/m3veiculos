import { useEffect } from 'react'
import { fetchCompanyStatus } from '../lib/clientsApi.js'
import { setModeloDaLoja } from './siteModelo.js'
import { setPainelVisual } from './painelVisual.js'

// Aparência escolhida pela loja (Configurações → Aparência): o modelo do site e o
// visual do painel vêm do company_status, uma vez por página aberta. Sem resposta,
// fica o que o <html> trouxe (pagina.php) ou a última escolha guardada no navegador.

let pedido = null

export function carregarAparencia() {
  if (!pedido) {
    pedido = fetchCompanyStatus().then((status) => {
      if (!status.ok) {
        pedido = null
        return
      }
      setModeloDaLoja(status.modelo)
      setPainelVisual(status.painel)
    })
  }
  return pedido
}

// No topo do site e no painel
export function useAparenciaDaLoja() {
  useEffect(() => {
    carregarAparencia()
  }, [])
}
