import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { fetchSales, soldEntriesFrom } from '../lib/salesApi.js'
import { fetchCompanyExpenses, generateCompanyExpenses } from '../lib/companyExpensesApi.js'
import { fetchExternalFinancings } from '../lib/externalFinancingApi.js'
import { storeResult, monthRange } from '../utils/storeResult.js'
import { formatCurrencyCents } from '../utils/carFormat.js'
import { privateNote } from '../utils/privateValues.js'
import MonthSelectBR from '../components/MonthSelectBR.jsx'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// "Resultado do mês": vendas − custo dos vendidos + retorno e plus dos bancos −
// comissões pagas no mês − despesas da empresa = lucro líquido. Só o admin (custos e despesas são dele).
// Sem os dados (data = null), carrega sozinho (aba Desempenho).
export default function StoreResultCard({ data = null }) {
  const [month, setMonth] = useState(currentMonth)
  const [loaded, setLoaded] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (data) return undefined
    let cancelled = false
    Promise.all([
      fetchAllCarsAdmin(),
      fetchSales(),
      fetchAllExpensesAdmin(),
      generateCompanyExpenses().catch(() => {}).then(fetchCompanyExpenses).catch(() => []),
      fetchExternalFinancings().catch(() => []),
    ])
      .then(([cars, sales, carExpenses, companyExpenses, externalFinancings]) => {
        if (!cancelled) setLoaded({ cars, sales, carExpenses, companyExpenses, externalFinancings })
      })
      .catch((err) => !cancelled && setError(err.message || 'Não foi possível calcular o resultado.'))
    return () => {
      cancelled = true
    }
  }, [data])

  const source = data || loaded
  const result = useMemo(() => {
    if (!source || !month) return null
    return storeResult({
      soldEntries: soldEntriesFrom(source.cars, source.sales),
      carExpenses: source.carExpenses,
      companyExpenses: source.companyExpenses,
      externalFinancings: source.externalFinancings || [],
      range: monthRange(month),
    })
  }, [source, month])

  return (
    <section className="store-result">
      <div className="store-result-head">
        <h2 className="admin-section-title">Resultado do mês</h2>
        <MonthSelectBR value={month} onChange={(v) => setMonth(v || currentMonth())} back={24} ahead={0} />
      </div>
      {error && <p className="admin-error">{error}</p>}
      {!result ? (
        !error && <p className="admin-muted">Calculando…</p>
      ) : (
        <>
          <div className="expense-summary">
            <div className="expense-summary-card">
              <span>Vendas ({result.soldCount})</span>
              <strong>{formatCurrencyCents(result.revenue)}</strong>
            </div>
            <div className="expense-summary-card">
              <span>Custo dos vendidos</span>
              <strong>{formatCurrencyCents(result.carsCost)}</strong>
            </div>
            <div className="expense-summary-card">
              <span>Margem bruta</span>
              <strong>{formatCurrencyCents(result.grossMargin)}</strong>
            </div>
            {(result.bankIncome.total > 0 || result.bankIncome.plusOpen > 0) && (
              <div className="expense-summary-card">
                <span>
                  Retorno e plus dos bancos
                  {result.bankIncome.plusOpen > 0 && ` (${formatCurrencyCents(result.bankIncome.plusOpen)} de plus a receber)`}
                </span>
                <strong>{formatCurrencyCents(result.bankIncome.total)}</strong>
              </div>
            )}
            <div className="expense-summary-card">
              <span>
                Comissões pagas
                {result.commissionsOpen > 0 && ` (${formatCurrencyCents(result.commissionsOpen)} a pagar)`}
              </span>
              <strong>{formatCurrencyCents(result.commissions)}</strong>
            </div>
            <div className="expense-summary-card">
              <span>
                <Link to="/admin/financeiro/despesas">Despesas da empresa</Link>
                {result.companyOpen > 0 && ` (${formatCurrencyCents(result.companyOpen)} a pagar)`}
              </span>
              <strong>{formatCurrencyCents(result.companyExpenses)}</strong>
            </div>
            <div className={`expense-summary-card ${result.net < 0 ? 'is-negative' : 'is-positive'}`}>
              <span>Lucro líquido</span>
              <strong>{formatCurrencyCents(result.net)}</strong>
            </div>
          </div>
          <p className="admin-form-note">
            Vendas pela data da venda; retorno do banco pela data da venda (ou do pagamento do financiamento externo) e
            plus pela data em que foi recebido; comissões (das vendas e dos financiamentos externos) pela data do pagamento
            (o "a pagar" são as das vendas do mês ainda não pagas); despesas da empresa pelo vencimento (pagas ou não).
            {result.privateCount > 0 && ` ${privateNote(result.privateCount)}`}
          </p>
        </>
      )}
    </section>
  )
}
