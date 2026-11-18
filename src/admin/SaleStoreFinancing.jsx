import { Link } from 'react-router-dom'
import DateInputBR from '../components/DateInputBR.jsx'
import { MoneyInput } from '../components/NumberInputs.jsx'
import { formatCurrencyCents } from '../utils/carFormat.js'
import { formatMoneyInput, round2 } from '../utils/financing.js'
import { storeFinancingValues } from '../utils/storeFinancing.js'

// Na janela da venda, com a forma "Financiamento próprio da loja" (pedido de
// 17/11/2026): as parcelas já são geradas no Financeiro dos clientes ao salvar a
// venda, com o valor e o número de parcelas da própria forma de pagamento. Aqui
// ficam só os juros (opcional), o valor da parcela (calculado) e o 1º vencimento.
// Só para quem cuida do financeiro dos clientes (admin e gerente que vê valores).

// existing: financiamento ativo deste carro (as parcelas já existem; mudanças lá)
// canManage: false para quem não cuida do financeiro dos clientes (só um aviso)
export default function SaleStoreFinancing({ form, onChange, part, existing, canManage, disabled }) {
  if (existing) {
    return (
      <p className="sale-dialog-note">
        Esta venda já tem as parcelas no Financeiro dos clientes ({existing.installmentsCount}x de {formatCurrencyCents(existing.installmentAmount)}).
        Para mudar as parcelas,{' '}
        <Link to={`/admin/financeiro/clientes?financiamento=${existing.id}`}>abra o financiamento</Link>.
      </p>
    )
  }
  if (!canManage) {
    return (
      <p className="sale-dialog-note">
        As parcelas do financiamento da loja são geradas pelo administrador ou pelo gerente, em Financeiro dos clientes.
      </p>
    )
  }

  const v = storeFinancingValues(form, part)
  const update = (patch) => onChange({ ...form, ...patch })

  return (
    <div className="sale-store-financing">
      <label className="admin-checkbox">
        <input type="checkbox" checked={form.enabled} onChange={(e) => update({ enabled: e.target.checked })} disabled={disabled} />
        Gerar as parcelas no Financeiro dos clientes
      </label>
      {form.enabled && (
        <>
          <div className="admin-form-grid">
            <label>
              Juros (% ao mês)
              <input inputMode="decimal" value={form.rate} onChange={(e) => update({ rate: e.target.value })} placeholder="Em branco = sem juros" disabled={disabled} />
            </label>
            <label>
              Valor da parcela
              <MoneyInput
                cents
                value={form.installmentTouched ? form.installment : formatMoneyInput(v.suggested || '')}
                onChange={(value) => update({ installment: value, installmentTouched: true })}
                placeholder="Calculado sozinho"
                disabled={disabled}
              />
            </label>
            <label>
              Vencimento da 1ª parcela
              <DateInputBR value={form.firstDue} onChange={(value) => update({ firstDue: value })} required />
            </label>
          </div>
          {form.installmentTouched && (
            <button type="button" className="customer-picker-add" onClick={() => update({ installment: '', installmentTouched: false })} disabled={disabled}>
              Voltar a calcular sozinho o valor da parcela
            </button>
          )}
          {v.financed > 0 && v.count > 0 && v.installment > 0 ? (
            <div className="financing-preview">
              <span>
                {v.count}x de <strong>{formatCurrencyCents(v.installment)}</strong>
              </span>
              <span>
                Total das parcelas: <strong>{formatCurrencyCents(round2(v.installment * v.count))}</strong>
              </span>
            </div>
          ) : (
            <span className="sale-dialog-note">Informe o valor e o número de parcelas na forma “Financiamento próprio da loja”.</span>
          )}
        </>
      )}
    </div>
  )
}
