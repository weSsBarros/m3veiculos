import { useState } from 'react'
import { FileDown, FileText } from 'lucide-react'
import { formatCurrency, formatDateBR } from '../utils/carFormat.js'
import { downloadSavedContract } from '../utils/contractDownload.js'
import { loadContractLogo } from '../utils/contractLogo.js'

// Contratos e recibos gerados pelo sistema (tela Contratos), com download em
// PDF ou Word. showVehicle: mostra o carro (na ficha do cliente).
export default function GeneratedContractsList({ contracts, showVehicle = false, showValue = true }) {
  const [busyId, setBusyId] = useState(null)

  async function download(contract, format) {
    setBusyId(contract.id)
    try {
      const logo = await loadContractLogo()
      await downloadSavedContract(contract, format, logo)
    } catch (err) {
      alert('Não foi possível gerar o arquivo: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (contracts.length === 0) return <p className="admin-muted">Nenhum contrato gerado pelo sistema.</p>

  return (
    <ul className="doc-list">
      {contracts.map((c) => (
        <li key={c.id}>
          <div className="doc-list-main">
            <span className="admin-pill">{c.documentType === 'recibo' ? 'Recibo de venda (gerado)' : 'Contrato de venda (gerado)'}</span>
            <strong>
              {showVehicle ? `${c.vehicle.brand || ''} ${c.vehicle.model || ''}`.trim() || 'Veículo' : c.buyer.name}
            </strong>
            <span className="admin-table-sub">
              {[formatDateBR(c.saleDate), showValue ? formatCurrency(c.salePrice) : ''].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="doc-list-actions">
            <button type="button" className="admin-action-btn" onClick={() => download(c, 'pdf')} disabled={busyId === c.id}>
              <FileDown size={14} /> PDF
            </button>
            <button type="button" className="admin-action-btn" onClick={() => download(c, 'docx')} disabled={busyId === c.id}>
              <FileText size={14} /> Word
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
