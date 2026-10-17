import { useEffect, useMemo, useState } from 'react'
import { Calculator, MessageCircle, Plus, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchCompanySettings, saveBankRates } from '../lib/companyApi.js'
import { createContact } from '../lib/customerCrmApi.js'
import { formatCurrency, formatCurrencyCents, parseIntBR } from '../utils/carFormat.js'
import { SIM_TERMS, DEFAULT_TERMS, normalizeRates, simulateBanks, simulationText } from '../utils/bankSimulator.js'
import { whatsappLinkToPhone } from '../utils/whatsapp.js'
import { MoneyInput } from '../components/NumberInputs.jsx'
import CustomerPicker from './CustomerPicker.jsx'
import FinancingTabs from './FinancingTabs.jsx'
import './admin.css'

const thousands = (value) => String(value ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const carLabel = (car) => [car.brand, car.model, car.version, car.modelYear].filter(Boolean).join(' ')

// Linhas do editor de taxas: os bancos da loja (Configurações) e os que já têm taxa
function rateRowsFrom(bankList, bankRates) {
  const rates = normalizeRates(bankRates)
  const byBank = new Map(rates.map((r) => [r.bank.toLowerCase(), r]))
  const rows = (bankList || []).map((bank) => ({ bank, rate: byBank.get(String(bank).toLowerCase())?.rate?.toString().replace('.', ',') || '' }))
  for (const r of rates) {
    if (!rows.some((row) => row.bank.toLowerCase() === r.bank.toLowerCase())) rows.push({ bank: r.bank, rate: String(r.rate).replace('.', ',') })
  }
  return rows
}

// Financ. externos → Simulador de bancos (seção 90): a parcela do mesmo
// financiamento em cada banco, com as taxas da loja, lado a lado. Envia ao
// cliente pelo WhatsApp e guarda a simulação no atendimento da ficha. Admin e
// gerente ajustam as taxas; a equipe toda simula.
export default function AdminSimulator() {
  const { isStaff, viewAs } = useAuth()
  const canEditRates = isStaff && !viewAs
  const [customers, setCustomers] = useState([])
  const [cars, setCars] = useState([])
  const [storeName, setStoreName] = useState('')
  const [rateRows, setRateRows] = useState([])
  const [savedRates, setSavedRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [carId, setCarId] = useState('')
  const [price, setPrice] = useState('')
  const [down, setDown] = useState('')
  const [terms, setTerms] = useState(DEFAULT_TERMS)
  const [ratesMsg, setRatesMsg] = useState('')
  const [savingRates, setSavingRates] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAllCustomers().catch(() => []), fetchAllCarsAdmin().catch(() => []), fetchCompanySettings()])
      .then(([customersData, carsData, settings]) => {
        if (cancelled) return
        setCustomers(customersData)
        setCars(carsData.filter((c) => c.status !== 'vendido'))
        setStoreName(settings.name || '')
        setSavedRates(normalizeRates(settings.bankRates))
        setRateRows(rateRowsFrom(settings.bankList, settings.bankRates))
      })
      .catch((err) => !cancelled && setError(err.message || 'Não foi possível carregar.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const customer = customers.find((c) => c.id === customerId) || null
  const car = cars.find((c) => c.id === carId) || null
  const priceValue = parseIntBR(price) || 0
  const downValue = parseIntBR(down) || 0
  const result = useMemo(
    () => simulateBanks({ price: priceValue, downPayment: downValue, terms, rates: savedRates }),
    [priceValue, downValue, terms, savedRates]
  )
  const text = result.rows.length
    ? simulationText({ customerName: customer?.name, vehicle: car ? carLabel(car) : '', price: priceValue, downPayment: downValue, result, storeName })
    : ''
  const waLink = text ? whatsappLinkToPhone(customer?.phone, text) || `https://wa.me/?text=${encodeURIComponent(text)}` : null

  function pickCar(id) {
    setCarId(id)
    const picked = cars.find((c) => c.id === id)
    if (picked?.price) setPrice(thousands(picked.price))
  }

  function toggleTerm(n) {
    setTerms((prev) => (prev.includes(n) ? prev.filter((t) => t !== n) : [...prev, n].sort((a, b) => a - b)))
  }

  function updateRow(index, field, value) {
    setRateRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
    setRatesMsg('')
  }

  async function saveRates() {
    const rates = normalizeRates(rateRows)
    setSavingRates(true)
    setRatesMsg('')
    try {
      await saveBankRates(rates)
      setSavedRates(rates)
      setRatesMsg(`Taxas salvas (${rates.length} ${rates.length === 1 ? 'banco' : 'bancos'}).`)
    } catch (err) {
      setRatesMsg('Não foi possível salvar: ' + err.message)
    } finally {
      setSavingRates(false)
    }
  }

  async function saveToCustomer() {
    if (!customer || !text) return
    setSavingContact(true)
    setSaveMsg('')
    try {
      await createContact({ customerId: customer.id, channel: 'whatsapp', notes: text, carId: car?.id || null })
      setSaveMsg('Simulação salva no atendimento do cliente.')
    } catch (err) {
      setSaveMsg('Não foi possível salvar: ' + err.message)
    } finally {
      setSavingContact(false)
    }
  }

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Simulador de bancos</h1>
          <p>A parcela do mesmo financiamento em cada banco, com as taxas da loja. É uma estimativa: a aprovação e as condições finais dependem da análise de crédito.</p>
        </div>
      </div>
      <FinancingTabs />
      {error && <p className="admin-error">{error}</p>}

      <section className="admin-form-section admin-form">
        <h2><Calculator size={18} aria-hidden="true" /> Simulação</h2>
        <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} onCreated={(c) => setCustomers((prev) => [...prev, c])} label="Cliente (opcional)" />
        <div className="admin-form-grid">
          <label>
            Carro do estoque (opcional)
            <select value={carId} onChange={(e) => pickCar(e.target.value)}>
              <option value="">Nenhum</option>
              {cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {carLabel(c)}{c.price ? ` · ${formatCurrency(c.price)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Valor do veículo
            <MoneyInput value={price} onChange={setPrice} placeholder="Ex: 85.000" />
          </label>
          <label>
            Entrada
            <MoneyInput value={down} onChange={setDown} placeholder="Ex: 20.000" />
          </label>
        </div>
        <span className="admin-field-label">Prazos</span>
        <div className="admin-chip-row" role="group" aria-label="Prazos">
          {SIM_TERMS.map((n) => (
            <button key={n} type="button" aria-pressed={terms.includes(n)} className={`admin-chip${terms.includes(n) ? ' is-active' : ''}`} onClick={() => toggleTerm(n)}>
              {n}x
            </button>
          ))}
        </div>

        {!savedRates.length ? (
          <p className="admin-muted">
            Nenhum banco com taxa ainda. {canEditRates ? 'Informe as taxas em "Taxas dos bancos", logo abaixo.' : 'Peça ao administrador ou ao gerente para cadastrar as taxas.'}
          </p>
        ) : !priceValue ? (
          <p className="admin-muted">Informe o valor do veículo para ver as parcelas.</p>
        ) : !result.financed ? (
          <p className="admin-muted">A entrada cobre o valor do veículo: não há o que financiar.</p>
        ) : !result.terms.length ? (
          <p className="admin-muted">Escolha pelo menos um prazo.</p>
        ) : (
          <>
            <p className="simulator-financed">
              Valor financiado: <strong>{formatCurrency(result.financed)}</strong>
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table simulator-table">
                <thead>
                  <tr>
                    <th>Banco</th>
                    <th>Taxa</th>
                    {result.terms.map((n) => (
                      <th key={n}>{n}x</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.bank}>
                      <td><strong>{r.bank}</strong></td>
                      <td>{String(r.rate).replace('.', ',')}% a.m.</td>
                      {result.terms.map((n) => (
                        <td key={n} className={result.best[n] === r.bank && result.rows.length > 1 ? 'is-best' : ''}>
                          {formatCurrencyCents(r.installments[n])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="admin-form-note">Em destaque, a menor parcela de cada prazo. Sem IOF, tarifas e seguros.</p>
            <div className="doc-upload-actions">
              {waLink && (
                <a className="btn btn-primary" href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} /> Enviar no WhatsApp{customer?.phone ? '' : ' (escolher o contato)'}
                </a>
              )}
              {customer && !viewAs && (
                <button type="button" className="btn btn-outline" onClick={saveToCustomer} disabled={savingContact}>
                  <Save size={15} /> {savingContact ? 'Salvando…' : 'Salvar no atendimento do cliente'}
                </button>
              )}
              {saveMsg && <span className={saveMsg.startsWith('Não') ? 'admin-error' : 'admin-success'}>{saveMsg}</span>}
            </div>
          </>
        )}
      </section>

      <section className="admin-form-section admin-form">
        <h2>Taxas dos bancos</h2>
        <p className="admin-form-hint">
          Taxa de juros ao mês que cada banco tem passado para a loja. Banco sem taxa fica fora da simulação.
          {canEditRates ? ' A lista de bancos vem de Configurações → Vendas; dá para acrescentar outro aqui.' : ''}
        </p>
        <div className="simulator-rates">
          {rateRows.map((row, index) => (
            <div className="simulator-rate-row" key={index}>
              <input
                value={row.bank}
                onChange={(e) => updateRow(index, 'bank', e.target.value)}
                placeholder="Banco"
                aria-label="Banco"
                disabled={!canEditRates}
              />
              <span className="simulator-rate-input">
                <input
                  inputMode="decimal"
                  value={row.rate}
                  onChange={(e) => updateRow(index, 'rate', e.target.value.replace(/[^\d,.]/g, '').slice(0, 6))}
                  placeholder="Ex: 1,89"
                  aria-label={`Taxa ao mês do ${row.bank || 'banco'}`}
                  disabled={!canEditRates}
                />
                <span>% a.m.</span>
              </span>
              {canEditRates && (
                <button type="button" className="admin-icon-btn admin-icon-btn-danger" onClick={() => setRateRows((prev) => prev.filter((_, i) => i !== index))} aria-label={`Tirar ${row.bank || 'o banco'}`}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
        {canEditRates && (
          <div className="doc-upload-actions">
            <button type="button" className="btn btn-outline" onClick={() => setRateRows((prev) => [...prev, { bank: '', rate: '' }])} disabled={rateRows.length >= 40}>
              <Plus size={15} /> Outro banco
            </button>
            <button type="button" className="btn btn-primary" onClick={saveRates} disabled={savingRates}>
              {savingRates ? 'Salvando…' : 'Salvar taxas'}
            </button>
            {ratesMsg && <span className={ratesMsg.startsWith('Não') ? 'admin-error' : 'admin-success'}>{ratesMsg}</span>}
          </div>
        )}
      </section>
    </div>
  )
}
