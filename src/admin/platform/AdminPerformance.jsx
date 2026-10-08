import { fetchStorePerformance } from '../../lib/platformApi.js'
import StoreReport from './StoreReport.jsx'
import StoreResultCard from '../StoreResultCard.jsx'

// Aba "Desempenho" (só o admin): os números da própria loja, os mesmos que o
// dono do sistema vê na Plataforma, e o lucro do mês (só aqui: os valores são
// da loja e não vão para a Plataforma)
export default function AdminPerformance() {
  return (
    <StoreReport loadStore={fetchStorePerformance}>
      <StoreResultCard />
    </StoreReport>
  )
}
