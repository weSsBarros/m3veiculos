import { useEffect, useMemo, useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { fetchActivity, entityLabel, actionLabel } from '../lib/activityApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { periodRange } from '../utils/period.js'
import PeriodFilter from './PeriodFilter.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import './admin.css'

const ENTITY_FILTERS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'auth', label: 'Acessos (login)' },
  { value: 'sales', label: 'Vendas' },
  { value: 'contracts', label: 'Contratos e recibos' },
  { value: 'customers', label: 'Clientes' },
  { value: 'cars', label: 'Carros' },
  { value: 'car_expenses', label: 'Gastos' },
  { value: 'suppliers', label: 'Fornecedores' },
  { value: 'sellers', label: 'Equipe' },
  { value: 'contract_templates', label: 'Modelos de contrato' },
  { value: 'customer_documents', label: 'Documentos dos clientes' },
  { value: 'customer_financings', label: 'Financiamentos dos clientes', finance: true },
  { value: 'external_financings', label: 'Financiamentos externos' },
  { value: 'car_reservations', label: 'Reservas' },
  { value: 'financing_installments', label: 'Parcelas dos clientes', finance: true },
]

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const FIELD_LABELS = {
  status: 'status',
  price: 'preço',
  featured: 'destaque',
  hidden: 'visibilidade no site',
  images: 'fotos',
  description: 'descrição',
  km: 'km',
  name: 'nome',
  phone: 'telefone',
  email: 'e-mail',
  document: 'documento',
  address: 'endereço',
  commission_type: 'tipo de comissão',
  commission_value: 'comissão',
  active: 'ativo/inativo',
  sale_price: 'valor da venda',
  seller_id: 'vendedor',
  sale_date: 'data da venda',
  amount: 'valor',
  stock_alert_days: 'aviso de estoque',
  customer_id: 'cliente',
  sold_at: 'data da venda',
  purchase_price: 'preço de compra',
  purchase_date: 'data da compra',
  documents: 'documentos',
  finance_access: 'acesso aos valores das vendas',
  transfer_status: 'situação da transferência',
  transfer_responsible: 'quem faz a transferência',
  transfer_due_date: 'prazo da transferência',
  transfer_done_on: 'transferência concluída em',
  transfer_notes: 'observações da transferência',
  checklist: 'checklist de entrega',
  paid_on: 'data do pagamento',
  paid_amount: 'valor pago',
  late_charges: 'multa e juros',
  payment_method: 'forma de pagamento',
  due_date: 'vencimento',
  doc_type: 'tipo de documento',
  signed_on: 'data da assinatura',
  title: 'descrição',
  car_id: 'carro',
  late_fee_percent: 'multa por atraso',
  late_interest_percent: 'juros por atraso',
  internal_notes: 'observações internas',
  intake_items: 'itens que vieram com o carro',
  inspection: 'vistoria de entrada',
  payment_method: 'forma de pagamento',
  bank: 'banco',
  down_payment: 'entrada',
  financed_amount: 'valor financiado',
  trade_in_car_id: 'carro da troca',
  trade_in_value: 'valor da troca',
  commission_paid_on: 'comissão paga em',
  store_return: 'retorno da loja',
  reserved_until: 'prazo da reserva',
  deposit_amount: 'sinal',
  approved_on: 'aprovado em',
}

const STATUS_LABELS = { disponivel: 'Disponível', manutencao: 'Em manutenção', vendido: 'Vendido' }

function describeDetails(entry) {
  if (!entry.details) return ''
  const statusMatch = entry.details.match(/^status: (\w+) → (\w+)$/)
  if (statusMatch) return `Status: ${STATUS_LABELS[statusMatch[1]] || statusMatch[1]} → ${STATUS_LABELS[statusMatch[2]] || statusMatch[2]}`
  if (entry.action !== 'update' || entry.details.includes(' ')) return entry.details
  const fields = entry.details.split(', ').map((f) => FIELD_LABELS[f] || f.replace(/_/g, ' '))
  return `Alterou: ${fields.join(', ')}`
}

export default function AdminActivity() {
  const { canSeeSaleValues } = useAuth()
  const [entries, setEntries] = useState([])
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [period, setPeriod] = useState('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = periodRange(period, customStart, customEnd)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [activityData, sellersData] = await Promise.all([
        fetchActivity({ userId: userFilter || undefined, start: range.start, end: range.end, limit: 500 }),
        fetchSellers(),
      ])
      setEntries(activityData)
      setSellers(sellersData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar o registro de atividades.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFilter, range.start, range.end])

  // Quem foi excluído da equipe não tem mais login: vale o que ele usava
  const sellersByUser = useMemo(() => {
    const map = {}
    for (const s of sellers) {
      const id = s.userId || s.formerUserId
      if (id) map[id] = s
    }
    return map
  }, [sellers])

  // Opções do filtro de pessoa: vendedores cadastrados + quem aparece no log
  const people = useMemo(() => {
    const map = {}
    for (const [id, s] of Object.entries(sellersByUser)) {
      map[id] = `${s.name} (${s.role === 'manager' ? 'gerente' : 'vendedor'}${s.deletedAt ? ', excluído' : ''})`
    }
    for (const e of entries) if (e.userId && !map[e.userId]) map[e.userId] = e.userEmail || 'Usuário'
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]))
  }, [sellersByUser, entries])

  const visible = entityFilter ? entries.filter((e) => e.entity === entityFilter) : entries

  // Gerente em "só quantidades": o registro da venda aparece sem o valor
  function entryLabel(entry) {
    if (!entry.label) return '—'
    if (!canSeeSaleValues && entry.entity === 'sales') return entry.label.replace(/ — R\$ .*$/, '')
    return entry.label
  }

  function personName(entry) {
    const seller = sellersByUser[entry.userId]
    if (seller) {
      const role = seller.role === 'manager' ? 'Gerente' : 'Vendedor'
      return { name: seller.name, role: seller.deletedAt ? `${role} (excluído)` : role }
    }
    return { name: entry.userEmail || '—', role: 'Admin' }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Registro de atividades</h1>
          <p>Tudo o que foi feito no painel, por quem e quando</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      <div className="admin-search-bar">
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} aria-label="Pessoa">
          <option value="">Todas as pessoas</option>
          {people.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} aria-label="Tipo">
          {ENTITY_FILTERS.filter((f) => !f.finance || canSeeSaleValues).map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <PeriodFilter
          period={period}
          onPeriodChange={setPeriod}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />
      </div>

      {error && <p className="admin-error">{error}</p>}

      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="admin-muted">Nenhuma atividade encontrada com esses filtros.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Quem</th>
                  <th>Ação</th>
                  <th>Item</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const person = personName(entry)
                  return (
                    <tr key={entry.id}>
                      <td className="admin-nowrap">{formatDateTime(entry.createdAt)}</td>
                      <td>
                        <strong>{person.name}</strong>
                        <span className="admin-table-sub">{person.role}</span>
                      </td>
                      <td>
                        <span className={`activity-action activity-${entry.action}`}>{actionLabel(entry.action)}</span>
                        <span className="admin-table-sub">{entityLabel(entry.entity)}</span>
                      </td>
                      <td>{entryLabel(entry)}</td>
                      <td className="admin-muted-cell">{describeDetails(entry) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {visible.map((entry) => {
              const person = personName(entry)
              return (
                <div className="admin-card" key={entry.id}>
                  <div className="admin-card-top">
                    <div className="admin-card-title">
                      <strong>
                        <span className={`activity-action activity-${entry.action}`}>{actionLabel(entry.action)}</span>{' '}
                        {entityLabel(entry.entity)}
                      </strong>
                      <span className="admin-table-sub">{entryLabel(entry)}</span>
                      <span className="admin-card-meta">
                        {person.name} ({person.role}) · {formatDateTime(entry.createdAt)}
                      </span>
                      {describeDetails(entry) && <span className="admin-card-meta">{describeDetails(entry)}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
