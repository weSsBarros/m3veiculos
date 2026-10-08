import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCcw, Pencil, Trash2, Search, FolderOpen, MessageCircle, Sparkles, CalendarClock, AlertTriangle } from 'lucide-react'
import { fetchAllCustomers, createCustomer, updateCustomer, deleteCustomer } from '../lib/customersApi.js'
import { fetchAllCarsAdmin, fetchSellerCars } from '../lib/carsApi.js'
import { fetchSales } from '../lib/salesApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { removeCustomerDocumentFiles } from '../lib/customerDocumentsApi.js'
import { useAuth } from '../context/AuthContext.jsx'
import { maskCPF, maskPhoneBR, maskKeepingCaret } from '../utils/masks.js'
import { matchesCarSearch, parseIntBR, todayISO } from '../utils/carFormat.js'
import { fetchTeamDirectory } from '../lib/storeSettingsApi.js'
import { fetchMatches, fetchContacts, fetchInterests } from '../lib/customerCrmApi.js'
import { likedCarGone, PAYMENT_INTENTS } from '../utils/customerInterests.js'
import CustomerFileDialog from './CustomerFileDialog.jsx'
import PersonalDocuments, { uploadPendingPersonalDocs } from './PersonalDocuments.jsx'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'
import { MoneyInput, KmInput } from '../components/NumberInputs.jsx'
import AddressFields from '../components/AddressFields.jsx'
import { hasAddress } from '../utils/fiscal.js'

function emptyCustomer(responsibleSellerId = '') {
  return {
    name: '',
    document: '',
    rg: '',
    phone: '',
    email: '',
    address: '',
    addressParts: {},
    notes: '',
    responsibleSellerId,
    tradeIn: { model: '', year: '', km: '', expectedValue: '' },
    paymentIntent: { method: '', downPayment: '', maxInstallment: '' },
  }
}

const asText = (v) => (v == null ? '' : String(v))

// Filtros da lista (?filtro=): também são os destinos dos avisos do Dashboard
const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'meus', label: 'Meus clientes' },
  { value: 'combina', label: 'Carro novo que combina' },
  { value: 'retorno', label: 'Retorno hoje ou atrasado' },
  { value: 'carro-vendido', label: 'Carro que gostou foi vendido' },
]

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
  const { isAdmin, isStaff, isSeller, seller, canEditStock, canSeeSaleValues, canManageCustomerFinance, viewAs } = useAuth()
  const mySellerId = seller?.id || ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [customers, setCustomers] = useState([])
  const [cars, setCars] = useState([])
  const [sales, setSales] = useState([])
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(() => emptyCustomer(isSeller ? mySellerId : ''))
  const [team, setTeam] = useState([])
  const [crm, setCrm] = useState({ matches: [], followUps: [], interests: [] })
  const [editingId, setEditingId] = useState(null)
  // CNH, RG e comprovantes escolhidos no cadastro novo: vão depois de cadastrar
  const [pendingDocs, setPendingDocs] = useState([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [customersData, carsData, salesData, sellersData] = await Promise.all([
        fetchAllCustomers(),
        isStaff ? fetchAllCarsAdmin() : fetchSellerCars(),
        // Quem vendeu cada carro (o vendedor recebe só as vendas dele)
        fetchSales().catch(() => []),
        fetchSellers().catch(() => []),
      ])
      setCustomers(customersData)
      setCars(carsData)
      setSales(salesData)
      setSellers(sellersData)
      fetchTeamDirectory().then(setTeam).catch(() => setTeam([]))
      loadCrm()
    } catch (err) {
      setError(err.message || 'Erro ao carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }

  // Avisos de carro que combina, retornos e interesses (marcadores e filtros)
  function loadCrm() {
    Promise.all([
      fetchMatches({ status: 'novo' }).catch(() => []),
      fetchContacts({ openFollowUps: true }).catch(() => []),
      fetchInterests().catch(() => []),
    ]).then(([matches, followUps, interests]) => setCrm({ matches, followUps, interests }))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const teamById = useMemo(() => Object.fromEntries(team.map((t) => [t.id, t])), [team])
  const carsById = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars])
  const today = todayISO()
  const flags = useMemo(() => {
    const map = {}
    const flag = (id) => (map[id] ||= { match: 0, followUp: false, late: false, gone: false })
    for (const m of crm.matches) flag(m.customerId).match += 1
    for (const c of crm.followUps) {
      if (c.followUpOn > today) continue
      flag(c.customerId).followUp = true
      if (c.followUpOn < today) flag(c.customerId).late = true
    }
    for (const i of crm.interests) if (likedCarGone(i, carsById.get(i.carId))) flag(i.customerId).gone = true
    return map
  }, [crm, carsById, today])

  const carsByCustomer = useMemo(() => {
    const map = {}
    for (const c of cars) {
      if (!c.customerId) continue
      if (!map[c.customerId]) map[c.customerId] = []
      map[c.customerId].push(c)
    }
    return map
  }, [cars])

  const salesByCar = useMemo(() => {
    const map = {}
    for (const sale of sales) map[sale.carId] = sale
    return map
  }, [sales])

  const sellersById = useMemo(() => {
    const map = {}
    for (const seller of sellers) map[seller.id] = seller
    return map
  }, [sellers])

  const filter = searchParams.get('filtro') || ''
  const filters = FILTERS.filter((f) => f.value !== 'meus' || mySellerId)

  // Busca também pelo carro comprado (modelo ou placa)
  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return customers.filter((c) => {
      const f = flags[c.id]
      if (filter === 'meus' && c.responsibleSellerId !== mySellerId) return false
      if (filter === 'combina' && !f?.match) return false
      if (filter === 'retorno' && !f?.followUp) return false
      if (filter === 'carro-vendido' && !f?.gone) return false
      if (!query) return true
      return (
        `${c.name} ${c.document} ${c.phone} ${c.email}`.toLowerCase().includes(query) ||
        (carsByCustomer[c.id] || []).some((car) => matchesCarSearch(car, query))
      )
    })
  }, [customers, search, carsByCustomer, filter, flags, mySellerId])

  function setFilter(value) {
    const next = {}
    if (value) next.filtro = value
    setSearchParams(next)
  }

  function Badges({ customer }) {
    const f = flags[customer.id]
    const owner = customer.responsibleSellerId ? teamById[customer.responsibleSellerId]?.name : ''
    if (!f && !owner) return null
    return (
      <div className="crm-badges">
        {f?.match > 0 && (
          <span className="admin-pill is-success" title="Entrou um carro que combina com o que ele procura">
            <Sparkles size={12} /> Carro novo combina
          </span>
        )}
        {f?.followUp && (
          <span className={`admin-pill ${f.late ? 'is-danger' : 'is-warning'}`}>
            <CalendarClock size={12} /> {f.late ? 'Retorno atrasado' : 'Retorno hoje'}
          </span>
        )}
        {f?.gone && (
          <span className="admin-pill is-danger" title="O carro de que ele gostou foi vendido ou reservado para outra pessoa">
            <AlertTriangle size={12} /> Carro vendido
          </span>
        )}
        {owner && <span className="admin-table-sub">Responsável: {owner}</span>}
      </div>
    )
  }

  // Ficha aberta: ?cliente=<id>&aba=<ficha|interesses|atendimento> (links
  // vindos de Vendas, do Financeiro e dos avisos)
  const fileCustomerId = searchParams.get('cliente')
  const fileCustomer = fileCustomerId ? customers.find((c) => c.id === fileCustomerId) : null
  const fileTab = searchParams.get('aba') || (filter === 'combina' || filter === 'carro-vendido' ? 'interesses' : filter === 'retorno' ? 'atendimento' : 'ficha')

  function openFile(customer, tab) {
    const next = { cliente: customer.id }
    if (filter) next.filtro = filter
    if (tab) next.aba = tab
    setSearchParams(next)
  }

  function closeFile() {
    setSearchParams(filter ? { filtro: filter } : {})
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateNested(group, field, value) {
    setForm((prev) => ({ ...prev, [group]: { ...prev[group], [field]: value } }))
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
      addressParts: customer.addressParts || {},
      notes: customer.notes,
      responsibleSellerId: customer.responsibleSellerId || '',
      tradeIn: {
        model: asText(customer.tradeIn?.model),
        year: asText(customer.tradeIn?.year),
        km: asText(customer.tradeIn?.km),
        expectedValue: asText(customer.tradeIn?.expectedValue),
      },
      paymentIntent: {
        method: asText(customer.paymentIntent?.method),
        downPayment: asText(customer.paymentIntent?.downPayment),
        maxInstallment: asText(customer.paymentIntent?.maxInstallment),
      },
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setPendingDocs([])
    setForm(emptyCustomer(isSeller ? mySellerId : ''))
  }

  // Valores da negociação viram número (o resto, texto)
  function formToCustomer() {
    return {
      ...form,
      tradeIn: {
        model: form.tradeIn.model,
        year: form.tradeIn.year,
        km: parseIntBR(form.tradeIn.km),
        expectedValue: parseIntBR(form.tradeIn.expectedValue),
      },
      paymentIntent: {
        method: form.paymentIntent.method,
        downPayment: parseIntBR(form.paymentIntent.downPayment),
        maxInstallment: parseIntBR(form.paymentIntent.maxInstallment),
      },
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const updated = await updateCustomer(editingId, formToCustomer())
        setCustomers((prev) => prev.map((c) => (c.id === editingId ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        const created = await createCustomer(formToCustomer())
        setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        if (pendingDocs.length > 0) {
          try {
            await uploadPendingPersonalDocs(created.id, pendingDocs)
          } catch (err) {
            // O cliente já foi cadastrado: abre a edição dele para anexar de novo
            startEdit(created)
            setPendingDocs([])
            setError('Cliente cadastrado, mas os documentos não foram enviados (' + err.message + '). Anexe de novo abaixo.')
            return
          }
        }
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
    if (!(await confirm(`Excluir o cliente "${customer.name}"?${warning} Os contratos e documentos anexados a ele também serão excluídos.`))) return
    try {
      // Arquivos anexados: se não der para apagar, o cliente sai mesmo assim
      await removeCustomerDocumentFiles(customer.id).catch(() => {})
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
            <input value={form.document} onChange={(e) => update('document', maskKeepingCaret(e, maskCPF))} placeholder="000.000.000-00" />
          </label>
          <label>
            RG
            <input value={form.rg} onChange={(e) => update('rg', e.target.value)} />
          </label>
          <label>
            Telefone
            <input value={form.phone} onChange={(e) => update('phone', maskKeepingCaret(e, maskPhoneBR))} placeholder="(00) 00000-0000" />
          </label>
          <label>
            E-mail
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </label>
        </div>
        <fieldset className="customer-address">
          <legend>Endereço</legend>
          <AddressFields value={form.addressParts} onChange={(parts) => update('addressParts', parts)} disabled={saving} />
          {form.address && !hasAddress(form.addressParts) && (
            <p className="admin-form-note">Endereço anotado antes: {form.address}. Preencha as partes acima (a nota fiscal exige).</p>
          )}
        </fieldset>
        <fieldset className="customer-address personal-docs-box">
          <legend>Documentos pessoais</legend>
          <PersonalDocuments
            key={editingId || 'novo'}
            customerId={editingId}
            canDelete={isAdmin}
            pending={pendingDocs}
            onPendingChange={setPendingDocs}
            disabled={saving}
          />
          <p className="admin-form-note">
            {editingId
              ? 'Foto pela câmera do celular ou PDF. Cada arquivo é enviado na hora.'
              : 'Foto pela câmera do celular ou PDF. Os arquivos vão junto quando você cadastrar o cliente.'}
          </p>
        </fieldset>
        <label>
          Observações
          <textarea rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Opcional" />
        </label>
        <details className="crm-negotiation" open={Boolean(editingId && (form.responsibleSellerId || form.tradeIn.model || form.paymentIntent.method))}>
          <summary>Negociação (opcional): vendedor responsável, carro para a troca e forma de pagamento</summary>
          <div className="admin-form-grid">
            <label>
              Vendedor responsável
              <select value={form.responsibleSellerId} onChange={(e) => update('responsibleSellerId', e.target.value)}>
                <option value="">Sem responsável (avisos para todos)</option>
                {team
                  .filter((t) => t.active || t.id === form.responsibleSellerId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
            </label>
            <label>
              Como pretende pagar
              <select value={form.paymentIntent.method} onChange={(e) => updateNested('paymentIntent', 'method', e.target.value)}>
                {PAYMENT_INTENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label>
              Entrada disponível
              <MoneyInput value={form.paymentIntent.downPayment} onChange={(v) => updateNested('paymentIntent', 'downPayment', v)} placeholder="Ex: 20.000" />
            </label>
            <label>
              Parcela que cabe no bolso
              <MoneyInput value={form.paymentIntent.maxInstallment} onChange={(v) => updateNested('paymentIntent', 'maxInstallment', v)} placeholder="Ex: 1.500" />
            </label>
            <label>
              Carro dele para a troca
              <input value={form.tradeIn.model} onChange={(e) => updateNested('tradeIn', 'model', e.target.value)} placeholder="Ex: Fiat Argo Drive 1.0" />
            </label>
            <label>
              Ano do carro da troca
              <input value={form.tradeIn.year} onChange={(e) => updateNested('tradeIn', 'year', e.target.value)} placeholder="Ex: 2019/2020" />
            </label>
            <label>
              Km do carro da troca
              <KmInput value={form.tradeIn.km} onChange={(v) => updateNested('tradeIn', 'km', v)} placeholder="Ex: 45.000" />
            </label>
            <label>
              Quanto ele espera pelo carro
              <MoneyInput value={form.tradeIn.expectedValue} onChange={(v) => updateNested('tradeIn', 'expectedValue', v)} placeholder="Ex: 55.000" />
            </label>
          </div>
        </details>
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
        <div className="admin-chip-row" role="radiogroup" aria-label="Filtrar clientes">
          {filters.map((f) => {
            const count =
              f.value === 'combina' ? customers.filter((c) => flags[c.id]?.match).length
                : f.value === 'retorno' ? customers.filter((c) => flags[c.id]?.followUp).length
                  : f.value === 'carro-vendido' ? customers.filter((c) => flags[c.id]?.gone).length
                    : null
            return (
              <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} className={`admin-chip ${filter === f.value ? 'is-active' : ''}`} onClick={() => setFilter(f.value)}>
                {f.label}
                {count ? <span className="crm-filter-count">{count}</span> : null}
              </button>
            )
          })}
        </div>
      )}

      {customers.length > 0 && (
        <div className="admin-search-bar">
          <label className="admin-search-input">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, CPF, telefone, e-mail, carro ou placa…"
            />
          </label>
        </div>
      )}

      {customers.length === 0 ? (
        <p className="admin-muted">Nenhum cliente cadastrado ainda.</p>
      ) : filteredCustomers.length === 0 ? (
        <p className="admin-muted">{filter ? 'Nenhum cliente neste filtro.' : 'Nenhum cliente encontrado para essa busca.'}</p>
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
                      <td>
                        <strong>{c.name}</strong>
                        <Badges customer={c} />
                      </td>
                      <td>{c.document || '—'}</td>
                      <td>{c.phone || c.email || '—'}</td>
                      <td>
                        {purchases.length === 0 ? (
                          '—'
                        ) : (
                          <div className="expense-attachments-list">
                            {purchases.map((car) => (
                              <PurchaseLink key={car.id} car={car} isAdmin={canEditStock} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="admin-action-group">
                          {c.phone && !viewAs && (
                            <button type="button" className="admin-action-btn is-whatsapp" onClick={() => openFile(c, 'atendimento')}>
                              <MessageCircle size={15} /> WhatsApp
                            </button>
                          )}
                          <button type="button" className="admin-action-btn" onClick={() => openFile(c)}>
                            <FolderOpen size={15} /> Ficha
                          </button>
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
                      <Badges customer={c} />
                    </div>
                  </div>

                  {(c.phone || c.email) && <p className="admin-card-description">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>}

                  {purchases.length > 0 && (
                    <div className="expense-attachments-list">
                      {purchases.map((car) => (
                        <PurchaseLink key={car.id} car={car} isAdmin={canEditStock} />
                      ))}
                    </div>
                  )}

                  <div className="admin-card-actions">
                    {c.phone && !viewAs && (
                      <button type="button" onClick={() => openFile(c, 'atendimento')}>
                        <MessageCircle size={14} /> WhatsApp
                      </button>
                    )}
                    <button type="button" onClick={() => openFile(c)}>
                      <FolderOpen size={14} /> Ficha
                    </button>
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
      {fileCustomer && (
        <CustomerFileDialog
          customer={fileCustomer}
          purchases={carsByCustomer[fileCustomer.id] || []}
          salesByCar={salesByCar}
          sellersById={sellersById}
          cars={cars}
          teamById={teamById}
          initialTab={fileTab}
          onChanged={loadCrm}
          isAdmin={isAdmin}
          isStaff={isStaff}
          canSeeSaleValues={canSeeSaleValues}
          canManageCustomerFinance={canManageCustomerFinance}
          onClose={closeFile}
        />
      )}
      {confirmDialog}
    </div>
  )
}
