import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { fetchCommissionBands, saveCommissionBand, deleteCommissionBand } from '../lib/commissionTiersApi.js'
import { sortBands, bandRangeLabel, bandProblem } from '../utils/commissionBands.js'
import { formatCurrencyCents } from '../utils/carFormat.js'
import { parseMoneyBR, formatMoneyInput } from '../utils/financing.js'
import { MoneyInput } from '../components/NumberInputs.jsx'
import useConfirm from '../components/useConfirm.jsx'

const EMPTY = { id: null, upTo: '', above: false, amount: '' }

// Equipe → Faixas de comissão por valor da venda (só o admin; seção 82). Ex.: até
// R$ 30.000 = R$ 300; até R$ 70.000 = R$ 500; acima = R$ 1.000. Quem tem a comissão
// "Pela faixa de valor" recebe a faixa em que o valor da venda cai.
export default function CommissionPriceBands() {
  const { confirm, confirmDialog } = useConfirm()
  const [bands, setBands] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchCommissionBands()
      .then(setBands)
      .catch((err) => {
        setError(err.message || 'Não foi possível carregar as faixas de valor.')
        setBands([])
      })
  }, [])

  const sorted = sortBands(bands || [])
  const hasAbove = sorted.some((b) => b.upTo == null)

  function startNew() {
    setForm({ ...EMPTY })
    setError('')
    setMessage('')
  }

  async function submit(e) {
    e.preventDefault()
    const band = {
      id: form.id,
      upTo: form.above ? null : parseMoneyBR(form.upTo),
      amount: parseMoneyBR(form.amount),
    }
    if (!form.above && (band.upTo == null || Number.isNaN(band.upTo))) return setError('Informe até que valor de venda vale a faixa.')
    const problem = bandProblem(bands, band)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const saved = await saveCommissionBand(band)
      setBands((list) => (form.id ? list.map((b) => (b.id === saved.id ? saved : b)) : [...list, saved]))
      setForm(null)
      setMessage(form.id ? 'Faixa atualizada.' : 'Faixa criada.')
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a faixa.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(band) {
    const ok = await confirm(`Excluir a faixa "${bandRangeLabel(sorted, band)}"? As vendas já feitas não mudam.`, {
      title: 'Excluir faixa de valor',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    try {
      await deleteCommissionBand(band.id)
      setBands((list) => list.filter((b) => b.id !== band.id))
    } catch (err) {
      setError(err.message || 'Não foi possível excluir a faixa.')
    }
  }

  if (bands === null) return null

  return (
    <section className="admin-form-section commission-tiers" aria-labelledby="commission-bands-title">
      <h2 id="commission-bands-title">Faixas de comissão por valor da venda</h2>
      <p className="admin-form-hint">
        Para pagar a comissão pelo valor da venda (ex.: até R$ 30.000, R$ 300; até R$ 70.000, R$ 500; acima disso, R$ 1.000). Vale o valor
        final da venda. Na pessoa da equipe, escolha a comissão "Pela faixa de valor".
      </p>
      {error && <p className="admin-error">{error}</p>}
      {message && <p className="admin-success">{message}</p>}

      {sorted.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Valor da venda</th>
                <th>Comissão</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{bandRangeLabel(sorted, b)}</strong>
                  </td>
                  <td>{formatCurrencyCents(b.amount)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-action-btn"
                        onClick={() => setForm({ id: b.id, above: b.upTo == null, upTo: b.upTo == null ? '' : formatMoneyInput(b.upTo), amount: formatMoneyInput(b.amount) })}
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button type="button" className="admin-action-btn admin-action-danger" onClick={() => remove(b)} aria-label={`Excluir ${bandRangeLabel(sorted, b)}`}>
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
      {sorted.length > 0 && !hasAbove && (
        <p className="admin-form-note">Venda acima de {formatCurrencyCents(sorted[sorted.length - 1].upTo)} fica sem comissão. Para pagar, crie a faixa "acima".</p>
      )}

      {form ? (
        <form className="admin-form commission-tier-form" onSubmit={submit}>
          <label className="admin-checkbox">
            <input type="checkbox" checked={form.above} onChange={(e) => setForm((f) => ({ ...f, above: e.target.checked }))} />
            Faixa "acima" (vale para as vendas maiores que a maior faixa)
          </label>
          <div className="admin-form-grid">
            {!form.above && (
              <label>
                Vendas até
                <MoneyInput cents value={form.upTo} onChange={(v) => setForm((f) => ({ ...f, upTo: v }))} placeholder="Ex: 30.000,00" required />
              </label>
            )}
            <label>
              Comissão por venda
              <MoneyInput cents value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="Ex: 300,00" required />
            </label>
          </div>
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
            <Plus size={15} /> Nova faixa de valor
          </button>
        </div>
      )}
      {confirmDialog}
    </section>
  )
}
