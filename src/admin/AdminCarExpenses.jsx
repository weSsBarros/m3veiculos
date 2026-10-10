import { useEffect, useMemo, useState } from 'react'
import { downloadStorageFile } from '../lib/storageDownload.js'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, Paperclip, Download, Lock } from 'lucide-react'
import { fetchCarById } from '../lib/carsApi.js'
import {
  fetchExpensesByCar,
  createExpense,
  launchExpense,
  updateExpense,
  deleteExpense,
  getAttachmentSignedUrl,
} from '../lib/expensesApi.js'
import { fetchAllSuppliers } from '../lib/suppliersApi.js'
import { EXPENSE_CATEGORIES, expenseCategoryLabel, formatCurrency, parseIntBR, formatDateBR as formatDate, slugify } from '../utils/carFormat.js'
import ExpenseAttachmentUploader from './ExpenseAttachmentUploader.jsx'
import DateInputBR from '../components/DateInputBR.jsx'
import { downloadCsv } from '../utils/exportCsv.js'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'

function emptyExpense() {
  return {
    category: EXPENSE_CATEGORIES[0].slug,
    description: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    attachments: [],
    supplierId: '',
  }
}

export default function AdminCarExpenses() {
  const { confirm, confirmDialog } = useConfirm()
  // Gerente (sem canSeeCosts) só lança gastos: não vê a lista, os valores nem os totais
  const { isAdmin, canSeeCosts: roleSeesCosts } = useAuth()
  const { id } = useParams()
  const [car, setCar] = useState(null)
  // Carro com o cadeado de outro sócio (seção 73): o admin só lança, como o gerente
  const canSeeCosts = roleSeesCosts && !car?.valuesHidden
  const [expenses, setExpenses] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyExpense)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [foundCar, foundExpenses, foundSuppliers] = await Promise.all([
        fetchCarById(id),
        canSeeCosts ? fetchExpensesByCar(id) : Promise.resolve([]),
        fetchAllSuppliers(),
      ])
      setCar(foundCar)
      setExpenses(foundExpenses)
      setSuppliers(foundSuppliers)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os gastos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const suppliersById = useMemo(() => {
    const map = {}
    for (const s of suppliers) map[s.id] = s
    return map
  }, [suppliers])

  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])
  const totalCost = (car?.purchasePrice || 0) + totalExpenses
  const margin = car && car.price != null ? car.price - totalCost : null

  const byCategory = useMemo(() => {
    const map = {}
    for (const e of expenses) map[e.category] = (map[e.category] || 0) + e.amount
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function startEdit(expense) {
    setEditingId(expense.id)
    setForm({
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      attachments: expense.attachments,
      supplierId: expense.supplierId || '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyExpense())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    const payload = {
      carId: id,
      category: form.category,
      description: form.description,
      amount: parseIntBR(form.amount),
      expenseDate: form.expenseDate,
      attachments: form.attachments,
      supplierId: form.supplierId || null,
    }
    try {
      if (!canSeeCosts) {
        await launchExpense(payload)
        setSuccess('Gasto lançado. Os valores lançados ficam visíveis só para o administrador.')
      } else if (editingId) {
        const updated = await updateExpense(editingId, payload)
        setExpenses((prev) => prev.map((e) => (e.id === editingId ? updated : e)))
      } else {
        const created = await createExpense(payload)
        setExpenses((prev) => [created, ...prev])
      }
      cancelEdit()
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(expense) {
    if (!(await confirm('Excluir este gasto? Essa ação não pode ser desfeita.'))) return
    try {
      await deleteExpense(expense.id)
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id))
      if (editingId === expense.id) cancelEdit()
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  async function handleOpenAttachment(path) {
    try {
      const url = await getAttachmentSignedUrl(path)
      window.open(url, '_blank', 'noreferrer')
    } catch (err) {
      alert('Não foi possível abrir o anexo: ' + err.message)
    }
  }

  async function handleDownloadAttachment(attachment) {
    try {
      await downloadStorageFile('expense-attachments', attachment.path, attachment.name)
    } catch (err) {
      alert('Não foi possível baixar o anexo: ' + err.message)
    }
  }

  function handleExportCsv() {
    const columns = [
      { label: 'Data', value: (e) => e.expenseDate },
      { label: 'Categoria', value: (e) => expenseCategoryLabel(e.category) },
      { label: 'Fornecedor', value: (e) => (e.supplierId ? suppliersById[e.supplierId]?.name || '—' : '—') },
      { label: 'Descrição', value: (e) => e.description },
      { label: 'Valor (R$)', value: (e) => e.amount },
    ]
    const filename = `gastos-${slugify(`${car.brand} ${car.model}`)}.csv`
    downloadCsv(filename, columns, expenses)
  }

  if (loading) return <p className="admin-muted">Carregando…</p>
  if (!car) return <p className="admin-error">Carro não encontrado.</p>

  return (
    <div className="admin-page">
      <Link to="/admin/estoque" className="admin-back-link">
        <ChevronLeft size={16} /> Voltar para o estoque
      </Link>

      <div className="admin-page-head">
        <div>
          <h1>{canSeeCosts ? 'Gastos' : 'Lançar gasto'} — {car.brand} {car.model}</h1>
          <p>{car.version} · {car.modelYear}</p>
          {car.valuesHidden && (
            <p className="private-values-note">
              <Lock size={14} aria-hidden="true" /> Os valores deste carro são privados
              {car.privateValues?.ownerName ? ` (cadeado de ${car.privateValues.ownerName})` : ''}: você lança o gasto, mas só quem
              ativou o cadeado vê os valores.
            </p>
          )}
        </div>
        <div className="admin-row-actions">
          {canSeeCosts && (
            <button type="button" className="btn btn-outline" onClick={handleExportCsv} disabled={expenses.length === 0}>
              <Download size={15} /> Exportar CSV
            </button>
          )}
          <Link to={`/admin/carros/${id}`} className="btn btn-outline">Editar dados do carro</Link>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {canSeeCosts && (
        <div className="expense-summary">
          <div className="expense-summary-card">
            <span>Preço de compra</span>
            <strong>{car.purchasePrice ? formatCurrency(car.purchasePrice) : '—'}</strong>
          </div>
          <div className="expense-summary-card">
            <span>Gastos ({expenses.length})</span>
            <strong>{formatCurrency(totalExpenses)}</strong>
          </div>
          <div className="expense-summary-card">
            <span>Custo total</span>
            <strong>{formatCurrency(totalCost)}</strong>
          </div>
          <div className="expense-summary-card">
            <span>Preço anunciado</span>
            <strong>{car.price != null ? formatCurrency(car.price) : 'Sem preço'}</strong>
          </div>
          <div className={`expense-summary-card ${margin == null ? '' : margin < 0 ? 'is-negative' : 'is-positive'}`}>
            <span>Margem (preço anunciado − custo)</span>
            <strong>{margin != null ? formatCurrency(margin) : '—'}</strong>
          </div>
        </div>
      )}

      {!canSeeCosts && (
        <div className="expense-summary">
          <div className="expense-summary-card">
            <span>Preço anunciado</span>
            <strong>{car.price != null ? formatCurrency(car.price) : 'Sem preço'}</strong>
          </div>
        </div>
      )}

      {canSeeCosts && byCategory.length > 0 && (
        <div className="expense-categories">
          {byCategory.map(([slug, amount]) => (
            <span className="expense-category-chip" key={slug}>
              {expenseCategoryLabel(slug)} · {formatCurrency(amount)}
            </span>
          ))}
        </div>
      )}

      <form className="admin-form admin-form-section expense-form" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Editar gasto' : 'Novo gasto'}</h2>
        <div className="admin-form-grid">
          <label>
            Categoria
            <select required value={form.category} onChange={(e) => update('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            Valor
            <MoneyInput required value={form.amount} onChange={(v) => update('amount', v)} />
          </label>
          <label>
            Data
            <DateInputBR required value={form.expenseDate} onChange={(iso) => update('expenseDate', iso)} />
          </label>
          <label>
            Fornecedor (opcional)
            <select value={form.supplierId} onChange={(e) => update('supplierId', e.target.value)}>
              <option value="">— Nenhum —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Descrição
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Ex: Troca de pastilhas de freio"
          />
        </label>
        <label className="expense-form-attachments-label">
          Anexos (fotos, notas fiscais em PDF)
          <ExpenseAttachmentUploader carId={id} attachments={form.attachments} onChange={(a) => update('attachments', a)} />
        </label>
        {success && <p className="admin-success">{success}</p>}
        <div className="admin-form-actions">
          {editingId && (
            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
              Cancelar edição
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : canSeeCosts ? 'Adicionar gasto' : 'Lançar gasto'}
          </button>
        </div>
      </form>

      {!canSeeCosts ? (
        <p className="admin-muted">Os gastos já lançados e os totais deste carro ficam visíveis só para o administrador.</p>
      ) : expenses.length === 0 ? (
        <p className="admin-muted">Nenhum gasto cadastrado para este carro ainda.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Fornecedor</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Anexos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className={editingId === expense.id ? 'is-busy' : ''}>
                    <td>{formatDate(expense.expenseDate)}</td>
                    <td>{expenseCategoryLabel(expense.category)}</td>
                    <td>{expense.supplierId ? suppliersById[expense.supplierId]?.name || '—' : '—'}</td>
                    <td>{expense.description || '—'}</td>
                    <td>{formatCurrency(expense.amount)}</td>
                    <td>
                      {expense.attachments.length === 0 ? (
                        '—'
                      ) : (
                        <div className="expense-attachments-list">
                          {expense.attachments.map((a) => (
                            <button
                              key={a.path}
                              type="button"
                              className="expense-attachment-link"
                              onClick={() => handleOpenAttachment(a.path)}
                            >
                              <Paperclip size={12} /> {a.name}
                            </button>
                          ))}
                          {expense.attachments.map((a) => (
                            <button
                              key={`${a.path}-baixar`}
                              type="button"
                              className="expense-attachment-link"
                              onClick={() => handleDownloadAttachment(a)}
                              title={`Baixar ${a.name}`}
                            >
                              <Download size={12} /> Baixar
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="admin-action-group">
                          <button type="button" className="admin-action-btn" onClick={() => startEdit(expense)}>
                            <Pencil size={15} /> Editar
                          </button>
                          {isAdmin && (
                            <button type="button" className="admin-action-btn admin-action-danger" onClick={() => handleDelete(expense)}>
                              <Trash2 size={15} /> Excluir
                            </button>
                          )}
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {expenses.map((expense) => (
              <div className={`admin-card ${editingId === expense.id ? 'is-busy' : ''}`} key={expense.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <span className="expense-category-chip">{expenseCategoryLabel(expense.category)}</span>
                    <span className="admin-card-meta">
                      {formatDate(expense.expenseDate)}
                      {expense.supplierId && suppliersById[expense.supplierId] && ` · ${suppliersById[expense.supplierId].name}`}
                    </span>
                  </div>
                  <strong>{formatCurrency(expense.amount)}</strong>
                </div>

                {expense.description && <p className="admin-card-description">{expense.description}</p>}

                {expense.attachments.length > 0 && (
                  <div className="expense-attachments-list">
                    {expense.attachments.map((a) => (
                      <button
                        key={a.path}
                        type="button"
                        className="expense-attachment-link"
                        onClick={() => handleOpenAttachment(a.path)}
                      >
                        <Paperclip size={12} /> {a.name}
                      </button>
                    ))}
                    {expense.attachments.map((a) => (
                      <button
                        key={`${a.path}-baixar`}
                        type="button"
                        className="expense-attachment-link"
                        onClick={() => handleDownloadAttachment(a)}
                        title={`Baixar ${a.name}`}
                      >
                        <Download size={12} /> Baixar
                      </button>
                    ))}
                  </div>
                )}

                <div className="admin-card-actions">
                  <button type="button" onClick={() => startEdit(expense)}>
                    <Pencil size={14} /> Editar
                  </button>
                  {isAdmin && (
                    <button type="button" className="admin-icon-btn-danger" onClick={() => handleDelete(expense)}>
                      <Trash2 size={14} /> Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {confirmDialog}
    </div>
  )
}
