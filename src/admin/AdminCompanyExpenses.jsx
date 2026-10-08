import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCcw, Download, PlusCircle, Search, Pencil, Trash2, Paperclip, Repeat, CheckCircle2, Undo2 } from 'lucide-react'
import {
  fetchCompanyExpenses,
  fetchCompanyExpenseRecurrences,
  generateCompanyExpenses,
  deleteCompanyExpense,
  setCompanyExpensePaid,
  stopCompanyExpenseRecurrence,
} from '../lib/companyExpensesApi.js'
import { getAttachmentSignedUrl } from '../lib/expensesApi.js'
import { fetchAllSuppliers } from '../lib/suppliersApi.js'
import {
  COMPANY_EXPENSE_FILTERS,
  COMPANY_EXPENSE_STATUS_LABELS,
  companyExpenseCategoryLabel,
  companyExpenseStatus,
  companyExpenseTotals,
  companyExpensesByCategory,
  matchesCompanyExpenseFilter,
  matchesCompanyExpenseSearch,
  nextRecurrenceDue,
} from '../utils/companyExpenses.js'
import { DUE_PERIODS, duePeriodRange, inRange } from '../utils/period.js'
import { formatCurrencyCents, formatDateBR, todayISO } from '../utils/carFormat.js'
import { downloadCsv } from '../utils/exportCsv.js'
import useConfirm from '../components/useConfirm.jsx'
import DateInputBR from '../components/DateInputBR.jsx'
import FinanceTabs from './FinanceTabs.jsx'
import PeriodFilter from './PeriodFilter.jsx'
import CompanyExpenseDialog from './CompanyExpenseDialog.jsx'
import '../components/ConfirmDialog.css'
import './admin.css'

const STATUS_PILL = { paga: 'is-success', atrasada: 'is-danger', vence_hoje: 'is-warning', vence_em_breve: 'is-warning', a_pagar: '' }

// Financeiro → Despesas da empresa: contas da loja que não são de um carro
// (aluguel, água, energia, salários...), com vencimento, pagamento, repetição
// mensal e comprovante. Só o admin.
export default function AdminCompanyExpenses() {
  const { confirm, confirmDialog } = useConfirm()
  const [searchParams, setSearchParams] = useSearchParams()
  const [expenses, setExpenses] = useState([])
  const [recurrences, setRecurrences] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(() =>
    COMPANY_EXPENSE_FILTERS.some((f) => f.value === searchParams.get('filtro')) ? searchParams.get('filtro') : 'todas'
  )
  const [editing, setEditing] = useState(null) // null | 'nova' | despesa
  const [paying, setPaying] = useState(null) // despesa sendo marcada como paga
  const [paidOn, setPaidOn] = useState(todayISO())

  async function load() {
    setLoading(true)
    setError('')
    try {
      // Primeiro cria as despesas do mês dos modelos "Repetir todo mês"
      await generateCompanyExpenses().catch(() => {})
      const [expensesData, recurrencesData, suppliersData] = await Promise.all([
        fetchCompanyExpenses(),
        fetchCompanyExpenseRecurrences(),
        fetchAllSuppliers(),
      ])
      setExpenses(expensesData)
      setRecurrences(recurrencesData)
      setSuppliers(suppliersData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar as despesas da empresa.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const today = todayISO()
  const range = useMemo(() => duePeriodRange(period, customStart, customEnd, today), [period, customStart, customEnd, today])
  const suppliersById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers])
  const recurrencesById = useMemo(() => new Map(recurrences.map((r) => [r.id, r])), [recurrences])
  const activeRecurrences = recurrences.filter((r) => r.active)

  // Atrasadas aparecem mesmo fora do período (são contas a pagar)
  const inPeriod = useMemo(
    () => expenses.filter((e) => inRange(e.dueOn, range) || (filter === 'atrasadas' && companyExpenseStatus(e, today) === 'atrasada')),
    [expenses, range, filter, today]
  )
  const totals = useMemo(() => companyExpenseTotals(inPeriod, today), [inPeriod, today])
  const overdueAll = useMemo(() => companyExpenseTotals(expenses.filter((e) => companyExpenseStatus(e, today) === 'atrasada'), today), [expenses, today])
  const byCategory = useMemo(() => companyExpensesByCategory(inPeriod), [inPeriod])
  const counts = useMemo(() => {
    const result = {}
    for (const f of COMPANY_EXPENSE_FILTERS) result[f.value] = inPeriod.filter((e) => matchesCompanyExpenseFilter(e, f.value, today)).length
    return result
  }, [inPeriod, today])

  const visible = useMemo(
    () =>
      inPeriod
        .filter((e) => matchesCompanyExpenseFilter(e, filter, today))
        .filter((e) => matchesCompanyExpenseSearch(e, search, suppliersById.get(e.supplierId)?.name || ''))
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
    [inPeriod, filter, search, today, suppliersById]
  )

  function changeFilter(value) {
    setFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'todas') next.delete('filtro')
    else next.set('filtro', value)
    setSearchParams(next, { replace: true })
  }

  function applySaved(saved, { recurrence, repeated }) {
    setExpenses((prev) => (prev.some((e) => e.id === saved.id) ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev]))
    if (recurrence) setRecurrences((prev) => prev.map((r) => (r.id === recurrence.id ? recurrence : r)))
    setEditing(null)
    if (repeated) load()
  }

  async function confirmPaid(e) {
    e.preventDefault()
    try {
      const saved = await setCompanyExpensePaid(paying.id, paidOn)
      setExpenses((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      setPaying(null)
    } catch (err) {
      alert('Não foi possível marcar como paga: ' + err.message)
    }
  }

  async function handleUnpay(expense) {
    if (!(await confirm('Voltar esta despesa para "a pagar"?'))) return
    try {
      const saved = await setCompanyExpensePaid(expense.id, null)
      setExpenses((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
    } catch (err) {
      alert('Não foi possível alterar: ' + err.message)
    }
  }

  async function handleDelete(expense) {
    const repeating = expense.recurrenceId && recurrencesById.get(expense.recurrenceId)?.active
    const message = repeating
      ? 'Excluir esta despesa? As dos próximos meses continuam sendo criadas (para parar, use "Parar de repetir").'
      : 'Excluir esta despesa? Essa ação não pode ser desfeita.'
    if (!(await confirm(message))) return
    try {
      await deleteCompanyExpense(expense.id)
      setExpenses((prev) => prev.filter((x) => x.id !== expense.id))
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  async function handleStop(recurrence) {
    if (!(await confirm(`Parar de repetir "${recurrence.description || companyExpenseCategoryLabel(recurrence.category)}"? As despesas já criadas ficam.`))) return
    try {
      const saved = await stopCompanyExpenseRecurrence(recurrence.id)
      setRecurrences((prev) => prev.map((r) => (r.id === saved.id ? saved : r)))
    } catch (err) {
      alert('Não foi possível parar: ' + err.message)
    }
  }

  async function openAttachment(path) {
    try {
      window.open(await getAttachmentSignedUrl(path), '_blank', 'noreferrer')
    } catch (err) {
      alert('Não foi possível abrir o comprovante: ' + err.message)
    }
  }

  function handleExport() {
    if (visible.length === 0) {
      alert('Nenhuma despesa para exportar.')
      return
    }
    const columns = [
      { label: 'Vencimento', value: (e) => e.dueOn },
      { label: 'Categoria', value: (e) => companyExpenseCategoryLabel(e.category) },
      { label: 'Descrição', value: (e) => e.description },
      { label: 'Fornecedor', value: (e) => suppliersById.get(e.supplierId)?.name || '' },
      { label: 'Valor (R$)', value: (e) => e.amount },
      { label: 'Situação', value: (e) => COMPANY_EXPENSE_STATUS_LABELS[companyExpenseStatus(e, today)] },
      { label: 'Pago em', value: (e) => e.paidOn || '' },
      { label: 'Repete todo mês', value: (e) => (e.recurrenceId && recurrencesById.get(e.recurrenceId)?.active ? 'Sim' : '') },
      { label: 'Observação', value: (e) => e.notes },
    ]
    downloadCsv('despesas-da-empresa.csv', columns, visible)
  }

  function statusCell(expense) {
    const status = companyExpenseStatus(expense, today)
    return (
      <>
        <span className={`admin-pill ${STATUS_PILL[status]}`}>{COMPANY_EXPENSE_STATUS_LABELS[status]}</span>
        {expense.paidOn && <span className="admin-table-sub">em {formatDateBR(expense.paidOn)}</span>}
      </>
    )
  }

  function actions(expense, compact = false) {
    const button = (key, onClick, Icon, label, danger = false) => (
      <button
        key={key}
        type="button"
        className={compact ? (danger ? 'admin-icon-btn-danger' : '') : `admin-action-btn ${danger ? 'admin-action-danger' : ''}`}
        onClick={onClick}
      >
        <Icon size={compact ? 14 : 15} /> {label}
      </button>
    )
    return [
      expense.paidOn
        ? button('pagar', () => handleUnpay(expense), Undo2, 'Voltar para a pagar')
        : button('pagar', () => { setPaidOn(todayISO()); setPaying(expense) }, CheckCircle2, 'Marcar como paga'),
      button('editar', () => setEditing(expense), Pencil, 'Editar'),
      button('excluir', () => handleDelete(expense), Trash2, 'Excluir', true),
    ]
  }

  if (loading) {
    return (
      <div className="admin-page">
        <FinanceTabs />
        <p className="admin-muted">Carregando…</p>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <FinanceTabs />
      <div className="admin-page-head">
        <div>
          <h1>Despesas da empresa</h1>
          <p>Contas da loja que não são de um carro: aluguel, água, energia, salários, contador…</p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-primary" onClick={() => setEditing('nova')}>
            <PlusCircle size={15} /> Nova despesa
          </button>
          <button type="button" className="btn btn-outline" onClick={handleExport}>
            <Download size={15} /> Exportar (planilha)
          </button>
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCcw size={15} /> Atualizar
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <PeriodFilter
        periods={DUE_PERIODS}
        period={period}
        onPeriodChange={setPeriod}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      />

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Total no período ({totals.count})</span>
          <strong>{formatCurrencyCents(totals.total)}</strong>
        </div>
        <div className="expense-summary-card is-positive">
          <span>Pagas</span>
          <strong>{formatCurrencyCents(totals.paid)}</strong>
        </div>
        <div className="expense-summary-card">
          <span>A pagar</span>
          <strong>{formatCurrencyCents(totals.open)}</strong>
        </div>
        <div className={`expense-summary-card ${overdueAll.count ? 'is-negative' : ''}`}>
          <span>
            {overdueAll.count} {overdueAll.count === 1 ? 'conta atrasada' : 'contas atrasadas'} (todas)
          </span>
          <strong>{formatCurrencyCents(overdueAll.total)}</strong>
        </div>
      </div>

      {byCategory.length > 0 && (
        <div className="expense-categories">
          {byCategory.map((c) => (
            <span className="expense-category-chip" key={c.slug}>
              {c.label} · {formatCurrencyCents(c.amount)}
            </span>
          ))}
        </div>
      )}

      {expenses.length > 0 && (
        <>
          <div className="admin-search-bar">
            <label className="admin-search-input">
              <Search size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por descrição, categoria, fornecedor ou valor…"
                aria-label="Buscar despesa"
              />
            </label>
          </div>
          <div className="admin-chip-row" role="radiogroup" aria-label="Filtrar despesas">
            {COMPANY_EXPENSE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                className={`admin-chip ${filter === f.value ? 'is-active' : ''} ${f.value === 'atrasadas' && overdueAll.count ? 'is-danger' : ''}`}
                onClick={() => changeFilter(f.value)}
              >
                {f.label} ({f.value === 'atrasadas' ? overdueAll.count : counts[f.value]})
              </button>
            ))}
          </div>
        </>
      )}

      {expenses.length === 0 ? (
        <div className="admin-empty">
          <p>Nenhuma despesa cadastrada. Lance aqui as contas da loja (aluguel, água, energia, salários) para acompanhar o que vence e entrar no lucro do mês.</p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing('nova')}>
            <PlusCircle size={15} /> Nova despesa
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="admin-muted">Nenhuma despesa encontrada neste período ou filtro.</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Despesa</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th>Comprovante</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((expense) => (
                  <tr key={expense.id}>
                    <td className="admin-nowrap">{formatDateBR(expense.dueOn)}</td>
                    <td>
                      <strong>{expense.description || companyExpenseCategoryLabel(expense.category)}</strong>
                      <span className="admin-table-sub">
                        {companyExpenseCategoryLabel(expense.category)}
                        {expense.supplierId && suppliersById.get(expense.supplierId) ? ` · ${suppliersById.get(expense.supplierId).name}` : ''}
                      </span>
                      {expense.recurrenceId && recurrencesById.get(expense.recurrenceId)?.active && (
                        <span className="company-expense-repeat"><Repeat size={12} /> Repete todo mês</span>
                      )}
                    </td>
                    <td className="admin-nowrap">{formatCurrencyCents(expense.amount)}</td>
                    <td>{statusCell(expense)}</td>
                    <td>
                      {expense.attachments.length === 0
                        ? '—'
                        : expense.attachments.map((a) => (
                          <button key={a.path} type="button" className="expense-attachment-link" onClick={() => openAttachment(a.path)}>
                            <Paperclip size={12} /> {a.name}
                          </button>
                        ))}
                    </td>
                    <td>
                      <div className="admin-action-group">{actions(expense)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card-list">
            {visible.map((expense) => (
              <div className="admin-card" key={expense.id}>
                <div className="admin-card-top">
                  <div className="admin-card-title">
                    <strong>{expense.description || companyExpenseCategoryLabel(expense.category)}</strong>
                    <span className="admin-table-sub">
                      {companyExpenseCategoryLabel(expense.category)} · vence {formatDateBR(expense.dueOn)}
                    </span>
                  </div>
                  <strong>{formatCurrencyCents(expense.amount)}</strong>
                </div>
                <div className="company-expense-card-status">
                  {statusCell(expense)}
                  {expense.recurrenceId && recurrencesById.get(expense.recurrenceId)?.active && (
                    <span className="company-expense-repeat"><Repeat size={12} /> Repete todo mês</span>
                  )}
                </div>
                {expense.attachments.length > 0 && (
                  <div className="expense-attachments-list">
                    {expense.attachments.map((a) => (
                      <button key={a.path} type="button" className="expense-attachment-link" onClick={() => openAttachment(a.path)}>
                        <Paperclip size={12} /> {a.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="admin-card-actions">{actions(expense, true)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeRecurrences.length > 0 && (
        <>
          <h2 className="admin-section-title">Contas que se repetem todo mês</h2>
          <div className="company-recurrence-list">
            {activeRecurrences.map((r) => (
              <div className="company-recurrence" key={r.id}>
                <div>
                  <strong>{r.description || companyExpenseCategoryLabel(r.category)}</strong>
                  <span className="admin-table-sub">
                    {companyExpenseCategoryLabel(r.category)} · {formatCurrencyCents(r.amount)} · todo dia {r.day} · próxima em {formatDateBR(nextRecurrenceDue(r))}
                  </span>
                </div>
                <button type="button" className="admin-action-btn" onClick={() => handleStop(r)}>
                  Parar de repetir
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        <CompanyExpenseDialog
          expense={editing === 'nova' ? null : editing}
          recurrence={editing !== 'nova' && editing.recurrenceId ? recurrences.find((r) => r.id === editing.recurrenceId && r.active) || null : null}
          suppliers={suppliers}
          onSaved={applySaved}
          onClose={() => setEditing(null)}
        />
      )}

      {paying && (
        <div className="confirm-dialog-overlay" onClick={() => setPaying(null)}>
          <form className="confirm-dialog admin-form" onClick={(e) => e.stopPropagation()} onSubmit={confirmPaid}>
            <h2>Marcar como paga</h2>
            <p>
              {paying.description || companyExpenseCategoryLabel(paying.category)} · {formatCurrencyCents(paying.amount)} · venceu/vence em {formatDateBR(paying.dueOn)}
            </p>
            <label>
              Pago em
              <DateInputBR required value={paidOn} onChange={setPaidOn} />
            </label>
            <div className="confirm-dialog-actions">
              <button type="button" className="btn btn-outline" onClick={() => setPaying(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Confirmar</button>
            </div>
          </form>
        </div>
      )}

      {confirmDialog}
    </div>
  )
}
