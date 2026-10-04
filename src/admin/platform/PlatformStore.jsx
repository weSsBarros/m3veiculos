import { useParams } from 'react-router-dom'
import { fetchPlatformOverview } from '../../lib/platformApi.js'
import StoreReport from './StoreReport.jsx'

// Plataforma → uma loja (só o dono do sistema): a loja vem da URL
export default function PlatformStore() {
  const { slug } = useParams()

  async function loadStore(range) {
    const stores = await fetchPlatformOverview(range)
    const found = stores.find((s) => s.slug === slug)
    if (!found) throw new Error('Loja não encontrada.')
    return found
  }

  return <StoreReport loadStore={loadStore} reloadKey={slug} platform />
}
