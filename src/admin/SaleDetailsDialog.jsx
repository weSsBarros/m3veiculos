import { useState } from 'react'
import { describePayment } from '../utils/payment.js'
import { Link } from 'react-router-dom'
import { X, Handshake, FolderOpen, FileDown } from 'lucide-react'
import { updateSaleTransfer, updateSaleChecklist } from '../lib/salesApi.js'
import { formatCurrency, formatDateBR, todayISO } from '../utils/carFormat.js'
import { buildChecklist } from '../utils/saleChecklist.js'
import { TRANSFER_STATUSES, TRANSFER_RESPONSIBLES, TRANSFER_DEFAULT_DAYS, transferDueDate } from '../utils/transfer.js'
import { downloadDeliveryTerm } from '../utils/deliveryTerm.js'
import DateInputBR from '../components/DateInputBR.jsx'
import SaleChecklist from './SaleChecklist.jsx'
import CustomerDocuments from './CustomerDocuments.jsx'
import GeneratedContractsList from './GeneratedContractsList.jsx'
import TransferPill from './TransferPill.jsx'
import '../components/ConfirmDialog.css'

function transferKey(sale) {
  return JSON.stringify(sale ? [sale.transferStatus, sale.transferResponsible, sale.transferDueDate, sale.transferDoneOn, sale.transferNotes] : null)
}

function transferForm(sale) {
  return {
    status: sale?.transferStatus || 'pendente',
    responsible: sale?.transferResponsible || 'comprador',
    dueDate: sale?.transferDueDate || '',
    doneOn: sale?.transferDoneOn || '',
    notes: sale?.transferNotes || '',
  }
}

// Detalhes de uma venda: quem comprou e quem vendeu, transferência do
// veículo, checklist de entrega (com o termo em PDF) e os contratos e
// documentos daquele carro.
export default function SaleDetailsDialog({
  row,
  contracts,
  checklistItems,
  companyName,
  isAdmin,
  canSeeSaleValues,
  // O vendedor vê as vendas dele, mas só admin e gerente editam
  canEdit = true,
  onSaleUpdated,
  onEditSale,
  onClose,
}) {
  const { car, sale, customer, sellerName, date, price } = row
  const [transfer, setTransfer] = useState(() => transferForm(sale))
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferMessage, setTransferMessage] = useState('')
  const [checklist, setChecklist] = useState(() => buildChecklist(checklistItems, sale?.checklist || []))
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [checklistMessage, setChecklistMessage] = useState('')
  const [error, setError] = useState('')

  // Venda gravada (aqui ou pela janela "Editar venda"): atualiza só a parte
  // que mudou, sem apagar o que ainda não foi salvo na outra
  const [syncedSale, setSyncedSale] = useState(sale)
  if (sale !== syncedSale) {
    setSyncedSale(sale)
    if (transferKey(sale) !== transferKey(syncedSale)) setTransfer(transferForm(sale))
    if (JSON.stringify(sale?.checklist || []) !== JSON.stringify(syncedSale?.checklist || [])) {
      setChecklist(buildChecklist(checklistItems, sale?.checklist || []))
    }
  }

  function updateTransfer(field, value) {
    setTransfer((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'status' && value === 'concluida' && !next.doneOn) next.doneOn = todayISO()
      return next
    })
    setTransferMessage('')
  }

  async function saveTransfer() {
    setSavingTransfer(true)
    setError('')
    try {
      const updated = await updateSaleTransfer(sale.id, transfer)
      onSaleUpdated(updated)
      setTransferMessage('Transferência salva.')
    } catch (err) {
      setError('Não foi possível salvar a transferência: ' + err.message)
    } finally {
      setSavingTransfer(false)
    }
  }

  async function saveChecklist() {
    setSavingChecklist(true)
    setError('')
    try {
      const updated = await updateSaleChecklist(sale.id, checklist)
      onSaleUpdated(updated)
      setChecklistMessage('Checklist salvo.')
    } catch (err) {
      setError('Não foi possível salvar o checklist: ' + err.message)
    } finally {
      setSavingChecklist(false)
    }
  }

  async function handleDeliveryTerm() {
    const city = contracts.find((c) => c.saleCity)?.saleCity || ''
    try {
      await downloadDeliveryTerm({ car, customer, sale, checklist, companyName, city })
    } catch (err) {
      alert('Não foi possível gerar o termo de entrega: ' + err.message)
    }
  }

  const defaultDue = sale?.saleDate ? transferDueDate({ ...sale, transferDueDate: null }) : null

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog admin-dialog-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Detalhes da venda">
        <button type="button" className="confirm-dialog-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <div>
          <h2>{car.brand} {car.model} {car.version}</h2>
          <p className="admin-table-sub">
            {[car.modelYear, car.color, car.plate && `placa ${car.plate.toUpperCase()}`, car.chassis && `chassi ${car.chassis}`].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="admin-detail-grid">
          <div>
            <span>Vendido em</span>
            <strong>{date ? formatDateBR(date) : '—'}</strong>
          </div>
          <div>
            <span>Vendido por</span>
            <strong>{sellerName}</strong>
          </div>
          {canSeeSaleValues && (
            <div>
              <span>Valor da venda</span>
              <strong>{price != null ? formatCurrency(price) : '—'}</strong>
            </div>
          )}
          <div>
            <span>Transferência</span>
            <TransferPill sale={sale} />
          </div>
          {sale?.paymentMethod && (
            <div>
              <span>Pagamento</span>
              <strong>{describePayment(sale)}</strong>
            </div>
          )}
          {sale?.tradeInCarId && (
            <div>
              <span>Carro na troca</span>
              <strong>
                <Link to={`/admin/carros/${sale.tradeInCarId}`}>Ver no estoque</Link>
                {canSeeSaleValues && sale.tradeInValue != null ? ` · ${formatCurrency(sale.tradeInValue)}` : ''}
              </strong>
            </div>
          )}
        </div>

        <div className="admin-row-actions">
          {canEdit && (
            <button type="button" className="btn btn-outline" onClick={() => onEditSale(car)}>
              <Handshake size={15} /> {sale ? 'Editar venda' : 'Registrar venda'}
            </button>
          )}
          {customer && (
            <Link to={`/admin/clientes?cliente=${customer.id}`} className="btn btn-outline">
              <FolderOpen size={15} /> Ficha do cliente
            </Link>
          )}
        </div>

        {error && <p className="admin-error">{error}</p>}

        <section className="admin-dialog-section">
          <h3>Comprador</h3>
          {customer ? (
            <div className="admin-detail-grid">
              <div>
                <span>Nome</span>
                <strong>{customer.name}</strong>
              </div>
              <div>
                <span>CPF</span>
                <strong>{customer.document || '—'}</strong>
              </div>
              <div>
                <span>Telefone</span>
                <strong>{customer.phone || '—'}</strong>
              </div>
              <div>
                <span>E-mail</span>
                <strong>{customer.email || '—'}</strong>
              </div>
            </div>
          ) : (
            <p className="admin-muted">Nenhum cliente vinculado a esta venda. Use "{sale ? 'Editar venda' : 'Registrar venda'}" para escolher o comprador.</p>
          )}
        </section>

        {!sale ? (
          <section className="admin-dialog-section">
            <h3>Transferência e checklist</h3>
            <p className="admin-muted">
              Este carro foi marcado como vendido antes do registro de vendas. Clique em "Registrar venda" para informar vendedor, valor e
              data — aí dá para acompanhar a transferência e o checklist.
            </p>
          </section>
        ) : (
          <>
            <section className="admin-dialog-section admin-form">
              <div className="admin-dialog-section-head">
                <h3>Transferência do veículo</h3>
                <TransferPill sale={sale} />
              </div>
              <div className="admin-form-grid">
                <label>
                  Situação
                  <select value={transfer.status} onChange={(e) => updateTransfer('status', e.target.value)}>
                    {TRANSFER_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quem faz a transferência
                  <select value={transfer.responsible} onChange={(e) => updateTransfer('responsible', e.target.value)}>
                    {TRANSFER_RESPONSIBLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prazo
                  <DateInputBR
                    value={transfer.dueDate}
                    onChange={(iso) => updateTransfer('dueDate', iso)}
                    placeholder={defaultDue ? `${formatDateBR(defaultDue)} (${TRANSFER_DEFAULT_DAYS} dias)` : 'dd/mm/aaaa'}
                  />
                </label>
                {transfer.status === 'concluida' && (
                  <label>
                    Concluída em
                    <DateInputBR value={transfer.doneOn} onChange={(iso) => updateTransfer('doneOn', iso)} />
                  </label>
                )}
              </div>
              <label>
                Observações
                <input
                  value={transfer.notes}
                  onChange={(e) => updateTransfer('notes', e.target.value)}
                  placeholder="Ex.: comprador avisado por telefone em 10/10"
                />
              </label>
              <p className="admin-form-note">
                Em branco, o prazo é de {TRANSFER_DEFAULT_DAYS} dias após a venda. Transferências pendentes aparecem no Dashboard e no menu
                Vendas quando faltam 7 dias ou menos ou quando o prazo passou.
              </p>
              {canEdit && (
                <div className="doc-upload-actions">
                  <button type="button" className="btn btn-primary" onClick={saveTransfer} disabled={savingTransfer}>
                    {savingTransfer ? 'Salvando…' : 'Salvar transferência'}
                  </button>
                  {transferMessage && <span className="admin-success">{transferMessage}</span>}
                </div>
              )}
            </section>

            <section className="admin-dialog-section">
              <h3>Checklist de entrega</h3>
              <SaleChecklist
                value={checklist}
                onChange={(next) => {
                  setChecklist(next)
                  setChecklistMessage('')
                }}
                disabled={savingChecklist || !canEdit}
              />
              <div className="doc-upload-actions">
                {canEdit && (
                  <button type="button" className="btn btn-primary" onClick={saveChecklist} disabled={savingChecklist}>
                    {savingChecklist ? 'Salvando…' : 'Salvar checklist'}
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={handleDeliveryTerm}>
                  <FileDown size={15} /> Termo de entrega (PDF)
                </button>
                {checklistMessage && <span className="admin-success">{checklistMessage}</span>}
              </div>
              <p className="admin-form-note">
                O termo sai com o checklist acima, para o comprador assinar na entrega. Depois, anexe a via assinada aqui embaixo como
                "Termo de entrega".
              </p>
            </section>
          </>
        )}

        <section className="admin-dialog-section">
          <h3>Contratos e documentos deste carro</h3>
          <GeneratedContractsList contracts={contracts} showValue={canSeeSaleValues} />
          {customer ? (
            <CustomerDocuments customerId={customer.id} carId={car.id} canDelete={isAdmin} />
          ) : (
            <p className="admin-muted">Vincule o comprador à venda para anexar contratos e documentos.</p>
          )}
        </section>
      </div>
    </div>
  )
}
