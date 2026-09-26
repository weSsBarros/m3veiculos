import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCcw, Pencil, Trash2, Search } from 'lucide-react'
import { fetchAllCustomers, createCustomer, updateCustomer, deleteCustomer } from '../lib/customersApi.js'
import { fetchAllCarsAdmin, fetchSellerCars } from '../lib/carsApi.js'
import { useAuth } from '../context/AuthContext.jsx'
import { maskCPF, maskPhoneBR } from '../utils/masks.js'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'

function emptyCustomer() {
  return { name: '', document: '', rg: '', phone: '', email: '', address: '', notes: '' }
}

function PurchaseLink({ car, isAdmin }) {
  if (!isAdmin) return <span className="expense-attachment-link">{car.brand} {car.model}</span>
  return (
    <Link to={`/admin/carros/${car.id}`} className="expense-attachment-link">
      {car.brand} {car.model}
    </Link>
  )
}

export default function AdminCustomers() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin, isStaff } = useAuth()
  const [customers, setCustomers] = useState([])
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyCustomer)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [customersData, carsData] = await Promise.all([fetchAllCustomers(), isStaff ? fetchAllCarsAdmin() : fetchSellerCars()])
      setCustomers(customersData)
      setCars(carsData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const carsByCustomer = useMemo(() => {
    const map = {}
    for (const c of cars) {
      if (!c.customerId) continue
      if (!map[c.customerId]) map[c.customerId] = []
      map[c.customerId].push(c)
    }
    return map
  }, [cars])

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return customers
    return customers.filter((c) => `${c.name} ${c.document} ${c.phone} ${c.email}`.toLowerCase().includes(query))
  }, [customers, search])

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function startEdit(customer) {
    setEditingId(customer.id)
    setForm({
      name: customer.name,
      document: customer.document,
      rg: customer.rg,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      notes: customer.notes,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyCustomer())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const updated = await updateCustomer(editingId, form)
        setCustomers((prev) => prev.map((c) => (c.id === editingId ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        const created = await createCustomer(form)
        setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
      cancelEdit()
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(customer) {
    const purchases = carsByCustomer[customer.id] || []
    const warning = purchases.length
      ? ` Esse cliente está vinculado a ${purchases.length} ${purchases.length === 1 ? 'carro' : 'carros'} — o vínculo será removido, mas os carros continuam cadastrados.`
      : ''
    if (!(await confirm(`Excluir o cliente "${customer.name}"?${warning}`))) return
    try {
      await deleteCustomer(customer.id)
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id))
      if (editingId === customer.id) cancelEdit()
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Clientes</h1>
          <p>{customers.length} {customers.length === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <form className="admin-form admin-form-section" onSubmit={handleSubmit}>
        <h2>{editingId ? 'Editar cliente' : 'Novo cliente'}</h2>
        <div className="admin-form-grid">
          <label>
            Nome completo
            <input required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </label>
          <label>
            CPF
            <input value={form.document} onChange={(e) => update('document', maskCPF(e.target.value))} placeholder="000.000.000-00" />
          </label>
          <label>
            RG
            <input value={form.rg} onChange={(e) => update('rg', e.target.value)} />
          </label>
          <label>
            Telefone
            <input value={form.phone} onChange={(e) => update('phone', maskPhoneBR(e.target.value))} placeholder="(00) 00000-0000" />
          </label>
          <label>
            E-mail
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </label>
          <label>
            Endereço
            <input value={form.address} onChange={(e) => update('address', e.target.value)} />
          </label>
        </div>
        <label>
          Observações
          <textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Opcional" />
        </label>
        <div className="admin-form-actions">
          {editingId && (
            <button type="button" className="btn btn-outline" onClick={cancelEdit}>
              Cancelar edição
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar cliente'}
          </button>
        </div>
      </form>

      {customers.length > 0 && (
        <div className="admin-search-bar">
          <label className="admin-search-input">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF, telefone ou e-mail…"
            />
          </label>
        </div>
      )}

      {customers.length === 0 ? (
        <p className="admin-muted">Nenhum cliente cadastrado ainda.</p>
      ) : filteredCustomers.length === 0 ? (
        <p className="admin-muted">Nenhum cliente encontrado para essa busca.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Contato</th>
                  <th>Carros comprados</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((c) => {
                  const purchases = carsByCustomer[c.id] || []
                  return (
                    <tr key={c.id} className={editingId === c.id ? 'is-busy' : ''}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.document || '—'}</td>
                      <td>{c.phone || c.email || '—'}</td>
                      <td>
                        {purchases.length === 0 ? (
                          '—'
                        ) : (
                          <div className="expense-attachments-list">
                            {purchases.map((car) => (
                              <PurchaseLink key={car.id} car={car} isAdmin={isStaff} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="admin-action-group">
                          <button type="button" className="admin-action-btn" onClick={() => startEdit(c)}>
                            <Pencil size={15} /> Editar
                          </button>
                          {isAdmin && (
                          <button type="button" className="admin-action-btn admin-action-danger" onClick={() => handleDelete(c)}>
                            <Trash2 size={15} /> Excluir
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {filteredCustomers.map((c) => {
              const purchases = carsByCustomer[c.id] || []
              return (
                <div className={`admin-card ${editingId === c.id ? 'is-busy' : ''}`} key={c.id}>
                  <div className="admin-card-top">
                    <div className="admin-card-title">
                      <strong>{c.name}</strong>
                      <span className="admin-table-sub">{c.document || 'CPF não informado'}</span>
                    </div>
                  </div>

                  {(c.phone || c.email) && <p className="admin-card-description">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>}

                  {purchases.length > 0 && (
                    <div className="expense-attachments-list">
                      {purchases.map((car) => (
                        <PurchaseLink key={car.id} car={car} isAdmin={isStaff} />
                      ))}
                    </div>
                  )}

                  <div className="admin-card-actions">
                    <button type="button" onClick={() => startEdit(c)}>
                      <Pencil size={14} /> Editar
                    </button>
                    {isAdmin && (
                      <button type="button" className="admin-icon-btn-danger" onClick={() => handleDelete(c)}>
                        <Trash2 size={14} /> Excluir
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {confirmDialog}
    </div>
  )
}
