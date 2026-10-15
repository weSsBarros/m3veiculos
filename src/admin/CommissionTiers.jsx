import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Wand2 } from 'lucide-react'
import { fetchCommissionTiers, saveCommissionTier, deleteCommissionTier, applyCommissionTiers } from '../lib/commissionTiersApi.js'
import { VEHICLE_CATEGORIES, vehicleCategoryLabel, formatCurrencyCents } from '../utils/carFormat.js'
import { parseMoneyBR, formatMoneyInput } from '../utils/financing.js'
import { MoneyInput } from '../components/NumberInputs.jsx'
import useConfirm from '../components/useConfirm.jsx'

const EMPTY = { id: null, name: '', amount: '', categories: [], active: true }

// Equipe → Faixas de comissão (só o admin; seção 78). Para lojas que pagam pelo
// tamanho do veículo: cada faixa tem nome, valor e as categorias que já entram
// nela. Quem tem a comissão "Pela faixa do carro" recebe o valor da faixa do
// carro vendido (a faixa fica no cadastro do carro).
export default function CommissionTiers() {
  const { confirm, confirmDialog } = useConfirm()
  const [tiers, setTiers] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchCommissionTiers()
      .then(setTiers)
      .catch((err) => {
        setError(err.message || 'Não foi possível carregar as faixas de comissão.')
        setTiers([])
      })
  }, [])

  function toggleCategory(slug) {
    setForm((f) => ({ ...f, categories: f.categories.includes(slug) ? f.categories.filter((c) => c !== slug) : [...f.categories, slug] }))
  }

  // Uma categoria fica numa faixa só (a sugestão do carro novo não fica ambígua)
  const takenBy = (slug) => (tiers || []).find((t) => t.id !== form?.id && t.active && t.categories.includes(slug))

  async function submit(e) {
    e.preventDefault()
    const amount = parseMoneyBR(form.amount)
    if (!form.name.trim()) return setError('Dê um nome para a faixa (ex.: Carro grande).')
    if (amount == null || Number.isNaN(amount) || amount < 0) return setError('Informe o valor da comissão da faixa.')
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const saved = await saveCommissionTier({ ...form, amount, position: form.id ? form.position : tiers?.length || 0 })
      setTiers((list) => (form.id ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved]))
      setForm(null)
      setMessage(form.id ? 'Faixa atualizada.' : 'Faixa criada. Os carros novos dessas categorias já entram nela.')
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a faixa.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(tier) {
    const ok = await confirm(`Excluir a faixa "${tier.name}"? Os carros que estão nela ficam sem faixa (as vendas já feitas não mudam).`, {
      title: 'Excluir faixa de comissão',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    try {
      await deleteCommissionTier(tier.id)
      setTiers((list) => list.filter((t) => t.id !== tier.id))
    } catch (err) {
      setError(err.message || 'Não foi possível excluir a faixa.')
    }
  }

  async function apply() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const n = await applyCommissionTiers()
      setMessage(n ? `${n} ${n === 1 ? 'carro recebeu' : 'carros receberam'} a faixa da categoria.` : 'Nenhum carro sem faixa nas categorias das faixas.')
    } catch (err) {
      setError(err.message || 'Não foi possível aplicar as faixas.')
    } finally {
      setBusy(false)
    }
  }

  function startNew() {
    setForm({ ...EMPTY })
    setMessage('')
    setError('')
  }

  if (tiers === null) return null

  return (
    <section className="admin-form-section commission-tiers" aria-labelledby="commission-tiers-title">
      <h2 id="commission-tiers-title">Faixas de comissão por veículo</h2>
      <p className="admin-form-hint">
        Para pagar a comissão pelo tamanho ou tipo do veículo (ex.: carro grande R$ 1.000, carro pequeno R$ 500). Cada carro recebe a faixa no
        cadastro, já sugerida pela categoria. Na pessoa da equipe, escolha a comissão "Pela faixa do carro".
      </p>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}

      {tiers.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Faixa</th>
                <th>Comissão</th>
                <th>Categorias</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} className={t.active ? '' : 'is-hidden-row'}>
                  <td>
                    <strong>{t.name}</strong>
                    {!t.active && <span className="admin-table-sub">Desativada</span>}
                  </td>
                  <td>{formatCurrencyCents(t.amount)}</td>
                  <td>{t.categories.length ? t.categories.map(vehicleCategoryLabel).join(', ') : '—'}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" className="admin-action-btn" onClick={() => setForm({ ...t, amount: formatMoneyInput(t.amount) })}>
                        <Pencil size={14} /> Editar
                      </button>
                      <button type="button" className="admin-action-btn admin-action-danger" onClick={() => remove(t)} aria-label={`Excluir ${t.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <form className="admin-form commission-tier-form" onSubmit={submit}>
          <div className="admin-form-grid">
            <label>
              Nome da faixa
              <input value={form.name} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Carro grande" required />
            </label>
            <label>
              Comissão por veículo vendido
              <MoneyInput cents value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="Ex: 1.000,00" required />
            </label>
          </div>
          <fieldset className="commission-tier-categories">
            <legend>Categorias que entram nesta faixa</legend>
            {VEHICLE_CATEGORIES.map((c) => {
              const other = takenBy(c.slug)
              return (
                <label key={c.slug} className="admin-checkbox">
                  <input type="checkbox" checked={form.categories.includes(c.slug)} onChange={() => toggleCategory(c.slug)} disabled={Boolean(other)} />
                  {c.label}
                  {other && <span className="admin-table-sub">na faixa {other.name}</span>}
                </label>
              )
            })}
          </fieldset>
          {form.id && (
            <label className="admin-checkbox">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              Faixa ativa (desativada, não é sugerida para carros novos)
            </label>
          )}
          <div className="admin-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : form.id ? 'Salvar faixa' : 'Criar faixa'}
            </button>
          </div>
        </form>
      ) : (
        <div className="admin-form-actions commission-tiers-actions">
          <button type="button" className="btn btn-outline" onClick={startNew}>
            <Plus size={15} /> Nova faixa
          </button>
          {tiers.some((t) => t.active && t.categories.length) && (
            <button type="button" className="btn btn-outline" onClick={apply} disabled={busy}>
              <Wand2 size={15} /> Pôr a faixa nos carros que estão sem
            </button>
          )}
        </div>
      )}
      {confirmDialog}
    </section>
  )
}
