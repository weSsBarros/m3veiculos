import { useEffect, useState } from 'react'
import { RefreshCcw, Pencil, Trash2 } from 'lucide-react'
import { fetchAllSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../lib/suppliersApi.js'
import { SUPPLIER_CATEGORIES, supplierCategoryLabel } from '../utils/carFormat.js'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'
import { useAuth } from '../context/AuthContext.jsx'

function emptySupplier() {
  return { name: '', category: SUPPLIER_CATEGORIES[0].slug, contact: '', notes: '' }
}

export default function AdminSuppliers() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptySupplier)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      // Gerente só cadastra fornecedores; a lista fica com o admin
      setSuppliers(isAdmin ? await fetchAllSuppliers() : [])
    } catch (err) {
      setError(err.message || 'Erro ao carregar os fornecedores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function startEdit(supplier) {
    setEditingId(supplier.id)
    setForm({ name: supplier.name, category: supplier.category, contact: supplier.contact, notes: supplier.notes })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptySupplier())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (editingId) {
        const updated = await updateSupplier(editingId, form)
        setSuppliers((prev) => prev.map((s) => (s.id === editingId ? updated : s)).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        const created = await createSupplier(form)
        if (isAdmin) setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        else setSuccess(`Fornecedor "${created.name}" cadastrado. Ele já aparece na lista ao lançar um gasto.`)
      }
      cancelEdit()
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(supplier) {
    if (!(await confirm(`Excluir o fornecedor "${supplier.name}"? Gastos já lançados com ele não são apagados, só perdem o vínculo.`))) return
    try {
      await deleteSupplier(supplier.id)
      setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id))
      if (editingId === supplier.id) cancelEdit()
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Fornecedores</h1>
          <p>
            {isAdmin
              ? `${suppliers.length} ${suppliers.length === 1 ? 'fornecedor cadastrado' : 'fornecedores cadastrados'}`
              : 'Cadastre oficinas, lojas de peças e outros prestadores usados nos gastos dos carros'}
          </p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        )}
      </div>

      {error && <p className="admin-error">{error}</p>}

      <form className="admin-form admin-form-section" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
        <div className="admin-form-grid">
          <label>
            Nome
            <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Ex: Oficina do Edilson" />
          </label>
          <label>
            Categoria
            <select required value={form.category} onChange={(e) => update('category', e.target.value)}>
              {SUPPLIER_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </label>
          <label>
            Contato (telefone, WhatsApp, e-mail)
            <input value={form.contact} onChange={(e) => update('contact', e.target.value)} />
          </label>
        </div>
        <label>
          Observações
          <textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Opcional" />
        </label>
        {success && <p className="admin-success">{success}</p>}
        <div className="admin-form-actions">
          {editingId && (
            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
              Cancelar edição
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar fornecedor'}
          </button>
        </div>
      </form>

      {!isAdmin ? (
        <p className="admin-muted">A lista de fornecedores e os contatos ficam visíveis só para o administrador.</p>
      ) : suppliers.length === 0 ? (
        <p className="admin-muted">Nenhum fornecedor cadastrado ainda.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Contato</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className={editingId === s.id ? 'is-busy' : ''}>
                    <td><strong>{s.name}</strong></td>
                    <td>{supplierCategoryLabel(s.category)}</td>
                    <td>{s.contact || '—'}</td>
                    <td>
                      <div className="admin-action-group">
                          <button type="button" className="admin-action-btn" onClick={() => startEdit(s)}>
                            <Pencil size={15} /> Editar
                          </button>
                          {isAdmin && (
                            <button type="button" className="admin-action-btn admin-action-danger" onClick={() => handleDelete(s)}>
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
            {suppliers.map((s) => (
              <div className={`admin-card ${editingId === s.id ? 'is-busy' : ''}`} key={s.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{s.name}</strong>
                    <span className="admin-table-sub">{supplierCategoryLabel(s.category)}</span>
                  </div>
                </div>

                {s.contact && <p className="admin-card-description">{s.contact}</p>}

                <div className="admin-card-actions">
                  <button type="button" onClick={() => startEdit(s)}>
                    <Pencil size={14} /> Editar
                  </button>
                  {isAdmin && (
                    <button type="button" className="admin-icon-btn-danger" onClick={() => handleDelete(s)}>
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
