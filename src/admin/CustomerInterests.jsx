import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Pause, Play, Sparkles, MessageCircle, X, AlertTriangle } from 'lucide-react'
import { fetchInterests, createInterest, updateInterest, deleteInterest, fetchMatches, setMatchStatus, MATCH_STATUS_LABELS } from '../lib/customerCrmApi.js'
import { CATEGORIES, BRANDS, TRANSMISSIONS, CAR_STATUSES, formatCurrency, formatDateBR, parseIntBR } from '../utils/carFormat.js'
import { describeInterest, matchingStockCars, likedCarGone, hasCriteria } from '../utils/customerInterests.js'
import { useAuth } from '../context/AuthContext.jsx'
import useConfirm from '../components/useConfirm.jsx'
import { MoneyInput, KmInput } from '../components/NumberInputs.jsx'

const categoryLabel = (slug) => CATEGORIES.find((c) => c.slug === slug)?.label || slug
const statusLabel = (value) => CAR_STATUSES.find((s) => s.value === value)?.label || value
const carName = (car) => (car ? `${car.brand} ${car.model} ${car.version} · ${car.modelYear}` : 'Carro removido')

const EMPTY = { kind: 'procura', carId: '', brand: '', model: '', category: '', yearMin: '', priceMax: '', kmMax: '', transmission: '', notes: '' }

// Aba "Interesses" da ficha do cliente: carros do estoque de que ele gostou e
// carros que ele procura. Cada busca mostra o que já combina no estoque e os
// avisos criados pelo banco quando entra um carro novo que combina.
// onNotify(car, match): abre o atendimento com a mensagem "chegou um carro".
export default function CustomerInterests({ customer, cars, onNotify, onChanged }) {
  const { confirm, confirmDialog } = useConfirm()
  const { isStaff, user, viewAs } = useAuth()
  const [interests, setInterests] = useState([])
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [interestsData, matchesData] = await Promise.all([
        fetchInterests({ customerId: customer.id }),
        fetchMatches({ customerId: customer.id }).catch(() => []),
      ])
      setInterests(interestsData)
      setMatches(matchesData)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os interesses.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id])

  const carsById = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars])
  const stockOptions = cars.filter((c) => c.status !== 'vendido')
  const canEdit = (item) => !viewAs && (isStaff || item.createdBy === user?.id)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const item = {
      ...form,
      customerId: customer.id,
      yearMin: parseIntBR(form.yearMin),
      priceMax: parseIntBR(form.priceMax),
      kmMax: parseIntBR(form.kmMax),
    }
    if (item.kind === 'estoque' && !item.carId) {
      setError('Escolha o carro do estoque.')
      return
    }
    if (item.kind === 'procura' && !hasCriteria(item)) {
      setError('Preencha pelo menos um campo do carro que ele procura (marca, modelo, preço máximo...).')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await createInterest(item)
      setInterests((prev) => [created, ...prev])
      setForm(null)
      onChanged?.()
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(item) {
    try {
      const updated = await updateInterest(item.id, { ...item, active: !item.active })
      setInterests((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
      onChanged?.()
    } catch (err) {
      setError('Não foi possível alterar: ' + err.message)
    }
  }

  async function remove(item) {
    if (!(await confirm('Excluir este interesse do cliente?'))) return
    try {
      await deleteInterest(item.id)
      setInterests((prev) => prev.filter((i) => i.id !== item.id))
      setMatches((prev) => prev.filter((m) => m.interestId !== item.id))
      onChanged?.()
    } catch (err) {
      setError('Não foi possível excluir: ' + err.message)
    }
  }

  async function discard(match) {
    try {
      const updated = await setMatchStatus(match.id, 'descartado')
      setMatches((prev) => prev.map((m) => (m.id === match.id ? updated : m)))
      onChanged?.()
    } catch (err) {
      setError('Não foi possível descartar: ' + err.message)
    }
  }

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="crm-tab">
      {error && <p className="admin-error">{error}</p>}

      {interests.length === 0 && !form && (
        <p className="admin-muted">Nenhum interesse registrado. Anote o carro que ele gostou ou o que ele procura: quando entrar um carro que combina, você recebe um aviso.</p>
      )}

      <ul className="crm-list">
        {interests.map((item) => {
          const car = item.carId ? carsById.get(item.carId) : null
          const itemMatches = matches.filter((m) => m.interestId === item.id && m.status !== 'descartado')
          const inStock = item.kind === 'procura' ? matchingStockCars(item, cars) : []
          const gone = likedCarGone(item, car)
          return (
            <li key={item.id} className={`crm-item ${item.active ? '' : 'is-paused'}`}>
              <div className="crm-item-head">
                <div>
                  <span className={`admin-pill ${item.kind === 'estoque' ? 'is-info' : 'is-success'}`}>
                    {item.kind === 'estoque' ? 'Gostou deste carro' : 'Procura'}
                  </span>
                  {!item.active && <span className="admin-pill">Pausado</span>}
                  <strong>
                    {item.kind === 'estoque' ? carName(car) : describeInterest(item, { formatCurrency, categoryLabel })}
                  </strong>
                  {item.kind === 'estoque' && car && (
                    <span className="admin-table-sub">
                      {statusLabel(car.status)}
                      {car.price != null ? ` · ${formatCurrency(car.price)}` : ''}
                    </span>
                  )}
                  {item.notes && <span className="admin-table-sub">{item.notes}</span>}
                </div>
                {canEdit(item) && (
                  <div className="crm-item-actions">
                    <button type="button" className="admin-action-btn" onClick={() => toggleActive(item)}>
                      {item.active ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Reativar</>}
                    </button>
                    <button type="button" className="admin-action-btn admin-action-danger" onClick={() => remove(item)}>
                      <Trash2 size={14} /> Excluir
                    </button>
                  </div>
                )}
              </div>

              {gone && (
                <p className="crm-warning">
                  <AlertTriangle size={15} /> Este carro foi {car.status === 'vendido' ? 'vendido' : 'reservado'} para outra pessoa. Que tal oferecer outra opção?
                </p>
              )}

              {itemMatches.length > 0 && (
                <div className="crm-matches">
                  <span className="crm-matches-title">
                    <Sparkles size={15} /> Carros novos que combinam
                  </span>
                  {itemMatches.map((m) => {
                    const mcar = carsById.get(m.carId)
                    return (
                      <div key={m.id} className={`crm-match ${m.status === 'novo' ? 'is-new' : ''}`}>
                        <div>
                          <strong>{carName(mcar)}</strong>
                          <span className="admin-table-sub">
                            {mcar?.price != null ? `${formatCurrency(mcar.price)} · ` : ''}
                            {MATCH_STATUS_LABELS[m.status]}
                            {m.handledAt ? ` em ${formatDateBR(m.handledAt.slice(0, 10))}` : ` · entrou em ${formatDateBR(m.createdAt.slice(0, 10))}`}
                          </span>
                        </div>
                        {!viewAs && mcar && (
                          <div className="crm-item-actions">
                            <button type="button" className="admin-action-btn is-whatsapp" onClick={() => onNotify(mcar, m)}>
                              <MessageCircle size={14} /> Avisar no WhatsApp
                            </button>
                            {m.status === 'novo' && (
                              <button type="button" className="admin-action-btn" onClick={() => discard(m)}>
                                <X size={14} /> Descartar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {item.kind === 'procura' && item.active && (
                <details className="crm-instock">
                  <summary>
                    {inStock.length === 0
                      ? 'Nenhum carro do estoque combina agora'
                      : `${inStock.length} ${inStock.length === 1 ? 'carro do estoque combina' : 'carros do estoque combinam'} agora`}
                  </summary>
                  {inStock.length > 0 && (
                    <ul>
                      {inStock.map((c) => (
                        <li key={c.id}>
                          <Link to={`/admin/carros/${c.id}`}>{carName(c)}</Link>
                          {c.price != null && <span className="admin-table-sub"> · {formatCurrency(c.price)}</span>}
                          {!viewAs && (
                            <button type="button" className="admin-link-btn" onClick={() => onNotify(c, null)}>
                              <MessageCircle size={13} /> Oferecer
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
            </li>
          )
        })}
      </ul>

      {!viewAs && !form && (
        <button type="button" className="btn btn-outline" onClick={() => setForm(EMPTY)}>
          <Plus size={15} /> Registrar interesse
        </button>
      )}

      {form && (
        <form className="admin-form crm-form" onSubmit={handleSubmit}>
          <div className="admin-segmented" role="radiogroup" aria-label="Tipo de interesse">
            <button type="button" className={form.kind === 'procura' ? 'is-active' : ''} onClick={() => update('kind', 'procura')}>
              Carro que ele procura
            </button>
            <button type="button" className={form.kind === 'estoque' ? 'is-active' : ''} onClick={() => update('kind', 'estoque')}>
              Carro do estoque que ele gostou
            </button>
          </div>

          {form.kind === 'estoque' ? (
            <label>
              Carro
              <select value={form.carId} onChange={(e) => update('carId', e.target.value)} required>
                <option value="">Escolha…</option>
                {stockOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {carName(c)}{c.plate ? ` · ${c.plate.toUpperCase()}` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <p className="admin-form-hint">Preencha só o que importa para ele; o resto vale "qualquer um".</p>
              <div className="admin-form-grid">
                <label>
                  Marca
                  <input list="crm-brands" value={form.brand} onChange={(e) => update('brand', e.target.value)} placeholder="Ex: Toyota" />
                  <datalist id="crm-brands">
                    {BRANDS.map((b) => <option key={b} value={b} />)}
                  </datalist>
                </label>
                <label>
                  Modelo
                  <input value={form.model} onChange={(e) => update('model', e.target.value)} placeholder="Ex: Corolla" />
                </label>
                <label>
                  Categoria
                  <select value={form.category} onChange={(e) => update('category', e.target.value)}>
                    <option value="">Qualquer</option>
                    {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                  </select>
                </label>
                <label>
                  Ano a partir de
                  <input inputMode="numeric" value={form.yearMin} onChange={(e) => update('yearMin', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Ex: 2019" />
                </label>
                <label>
                  Preço até
                  <MoneyInput value={form.priceMax} onChange={(v) => update('priceMax', v)} placeholder="Ex: 120.000" />
                </label>
                <label>
                  Km até
                  <KmInput value={form.kmMax} onChange={(v) => update('kmMax', v)} placeholder="Ex: 60.000" />
                </label>
                <label>
                  Câmbio
                  <select value={form.transmission} onChange={(e) => update('transmission', e.target.value)}>
                    <option value="">Qualquer</option>
                    <option value="Manual">Manual</option>
                    <option value="Automático">Automático</option>
                    {TRANSMISSIONS.filter((t) => !['Manual', 'Automático'].includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}
          <label>
            Observações
            <input value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Opcional (ex.: prefere cor clara, quer até o fim do mês)" />
          </label>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar interesse'}</button>
          </div>
        </form>
      )}
      {confirmDialog}
    </div>
  )
}
