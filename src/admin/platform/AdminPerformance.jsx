import { fetchStorePerformance } from '../../lib/platformApi.js'
import StoreReport from './StoreReport.jsx'

// Aba "Desempenho" (só o admin): os números da própria loja, os mesmos que o
// dono do sistema vê na Plataforma
export default function AdminPerformance() {
  return <StoreReport loadStore={fetchStorePerformance} />
}
