import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, Paperclip, Download } from 'lucide-react'
import { fetchCarById } from '../lib/carsApi.js'
import {
  fetchExpensesByCar,
  createExpense,
  updateExpense,
  deleteExpense,
  getAttachmentSignedUrl,
} from '../lib/expensesApi.js'
import { EXPENSE_CATEGORIES, expenseCategoryLabel, formatCurrency } from '../utils/carFormat.js'
import ExpenseAttachmentUploader from './ExpenseAttachmentUploader.jsx'
import { downloadCsv } from '../utils/exportCsv.js'
import './admin.css'

const EXPENSE_CSV_COLUMNS = [
  { label: 'Data', value: (e) => e.expenseDate },
  { label: 'Categoria', value: (e) => expenseCategoryLabel(e.category) },
  { label: 'Descrição', value: (e) => e.description },
  { label: 'Valor (R$)', value: (e) => e.amount },
]

function emptyExpense() {
  return {
    category: EXPENSE_CATEGORIES[0].slug,
    description: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    attachments: [],
  }
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR')
}

export default function AdminCarExpenses() {
  const { id } = useParams()
  const [car, setCar] = useState(null)
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyExpense)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [foundCar, foundExpenses] = await Promise.all([fetchCarById(id), fetchExpensesByCar(id)])
      setCar(foundCar)
      setExpenses(foundExpenses)
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

  const totalExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])
  const totalCost = (car?.purchasePrice || 0) + totalExpenses
  const margin = car ? car.price - totalCost : 0

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
    const payload = {
      carId: id,
      category: form.category,
      description: form.description,
      amount: Number(form.amount),
      expenseDate: form.expenseDate,
      attachments: form.attachments,
    }
    try {
      if (editingId) {
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
    if (!confirm('Excluir este gasto? Essa ação não pode ser desfeita.')) return
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

  function handleExportCsv() {
    const filename = `gastos-${car.brand}-${car.model}`.toLowerCase().replace(/\s+/g, '-') + '.csv'
    downloadCsv(filename, EXPENSE_CSV_COLUMNS, expenses)
  }

  if (loading) return <p className="admin-muted">Carregando…</p>
  if (!car) return <p className="admin-error">Carro não encontrado.</p>

  return (
    <div className="admin-page">
      <Link to="/admin" className="admin-back-link">
        <ChevronLeft size={16} /> Voltar para o estoque
      </Link>

      <div className="admin-page-head">
        <div>
          <h1>Gastos — {car.brand} {car.model}</h1>
          <p>{car.version} · {car.modelYear}</p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-outline" onClick={handleExportCsv} disabled={expenses.length === 0}>
            <Download size={15} /> Exportar CSV
          </button>
          <Link to={`/admin/carros/${id}`} className="btn btn-outline">Editar dados do carro</Link>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

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
        <div className={`expense-summary-card ${margin < 0 ? 'is-negative' : 'is-positive'}`}>
          <span>Margem (preço de venda)</span>
          <strong>{formatCurrency(margin)}</strong>
        </div>
      </div>

      {byCategory.length > 0 && (
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
            Valor (R$)
            <input type="number" min="0" required value={form.amount} onChange={(e) => update('amount', e.target.value)} />
          </label>
          <label>
            Data
            <input type="date" required value={form.expenseDate} onChange={(e) => update('expenseDate', e.target.value)} />
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
        <div className="admin-form-actions">
          {editingId && (
            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
              Cancelar edição
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Adicionar gasto'}
          </button>
        </div>
      </form>

      {expenses.length === 0 ? (
        <p className="admin-muted">Nenhum gasto cadastrado para este carro ainda.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
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
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" className="admin-icon-btn" aria-label="Editar" onClick={() => startEdit(expense)}>
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-danger"
                          aria-label="Excluir"
                          onClick={() => handleDelete(expense)}
                        >
                          <Trash2 size={16} />
                        </button>
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
                    <span className="admin-card-meta">{formatDate(expense.expenseDate)}</span>
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
                  </div>
                )}

                <div className="admin-card-actions">
                  <button type="button" onClick={() => startEdit(expense)}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button type="button" className="admin-icon-btn-danger" onClick={() => handleDelete(expense)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
