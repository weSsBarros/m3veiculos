import { useEffect, useState } from 'react'
import { fetchCompanySettings } from '../lib/companyApi.js'
import PlateCredits from './PlateCredits.jsx'

// Página Créditos (/admin/creditos, equipe toda, seção 86): comprar créditos da
// placa, da foto do documento e da assinatura digital sem depender do admin. O
// link "Comprar créditos" do cadastro do carro e da assinatura vem para cá.
export default function AdminCredits() {
  const [storeName, setStoreName] = useState('a loja')

  useEffect(() => {
    fetchCompanySettings().then((s) => s?.name && setStoreName(s.name)).catch(() => {})
  }, [])

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Créditos</h1>
          <p>Consulta por placa, foto do documento e assinatura digital usam o mesmo saldo da loja.</p>
        </div>
      </div>
      <PlateCredits payment={null} storeName={storeName} />
    </div>
  )
}
