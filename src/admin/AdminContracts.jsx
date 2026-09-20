import { useEffect, useMemo, useState } from 'react'
import { RefreshCcw, FileDown, FileText } from 'lucide-react'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchContractsAdmin, createContract } from '../lib/contractsApi.js'
import { formatCurrency, carStatusLabel } from '../utils/carFormat.js'
import { buildContractTitle, buildContractParagraphs, buildContractSignatures } from '../utils/contractTemplate.js'
import { generateContractPdf } from '../utils/contractPdf.js'
import { generateContractDocx } from '../utils/contractDocx.js'
import './admin.css'

const COMPANY_STORAGE_KEY = 'domveiculos_contract_company'

const EMPTY_COMPANY = { name: '', document: '', address: '', phone: '', email: '' }
const EMPTY_BUYER = { name: '', document: '', rg: '', address: '', phone: '', email: '' }
const EMPTY_VEHICLE = { brand: '', model: '', version: '', year: '', modelYear: '', color: '', km: '', plate: '', chassis: '', renavam: '' }
const EMPTY_SALE = { price: '', paymentMethod: 'À vista', paymentDetails: '', date: new Date().toISOString().slice(0, 10), city: '', notes: '' }

function loadStoredCompany() {
  try {
    const raw = localStorage.getItem(COMPANY_STORAGE_KEY)
    return raw ? { ...EMPTY_COMPANY, ...JSON.parse(raw) } : EMPTY_COMPANY
  } catch {
    return EMPTY_COMPANY
  }
}

function formatDate(isoDate) {
  if (!isoDate) return '—'
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR')
}

export default function AdminContracts() {
  const [cars, setCars] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const [selectedCarId, setSelectedCarId] = useState('')
  const [company, setCompany] = useState(loadStoredCompany)
  const [buyer, setBuyer] = useState(EMPTY_BUYER)
  const [vehicle, setVehicle] = useState(EMPTY_VEHICLE)
  const [sale, setSale] = useState(EMPTY_SALE)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, contractsData] = await Promise.all([fetchAllCarsAdmin(), fetchContractsAdmin()])
      setCars(carsData)
      setContracts(contractsData)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os contratos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function updateCompany(field, value) {
    setCompany((prev) => ({ ...prev, [field]: value }))
  }

  function updateBuyer(field, value) {
    setBuyer((prev) => ({ ...prev, [field]: value }))
  }

  function updateVehicle(field, value) {
    setVehicle((prev) => ({ ...prev, [field]: value }))
  }

  function updateSale(field, value) {
    setSale((prev) => ({ ...prev, [field]: value }))
  }

  function handleSelectCar(carId) {
    setSelectedCarId(carId)
    const car = cars.find((c) => c.id === carId)
    if (!car) return
    setVehicle({
      brand: car.brand,
      model: car.model,
      version: car.version,
      year: car.year,
      modelYear: car.modelYear,
      color: car.color,
      km: car.km,
      plate: car.plate || '',
      chassis: car.chassis || '',
      renavam: car.renavam || '',
    })
    setSale((prev) => ({ ...prev, price: car.price }))
  }

  const contractData = useMemo(
    () => ({
      company,
      buyer,
      vehicle,
      sale: { ...sale, price: Number(sale.price) || 0 },
    }),
    [company, buyer, vehicle, sale]
  )

  const paragraphs = useMemo(() => buildContractParagraphs(contractData), [contractData])
  const title = buildContractTitle()
  const signatures = useMemo(() => buildContractSignatures(contractData), [contractData])

  function validate() {
    if (!company.name || !company.document) return 'Preencha nome e CNPJ/CPF da empresa vendedora.'
    if (!buyer.name || !buyer.document) return 'Preencha nome e CPF do comprador.'
    if (!vehicle.brand || !vehicle.model) return 'Selecione ou preencha o veículo.'
    if (!sale.price || Number(sale.price) <= 0) return 'Informe o preço de venda.'
    if (!sale.city) return 'Informe a cidade para o contrato.'
    return ''
  }

  async function persistAndSave(fn, filename) {
    const validationError = validate()
    if (validationError) {
      alert(validationError)
      return
    }
    setGenerating(true)
    try {
      await fn({ title, paragraphs, signatures, filename })
      localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(company))
      const saved = await createContract({
        carId: selectedCarId || null,
        company,
        buyer,
        vehicle,
        salePrice: Number(sale.price),
        paymentMethod: sale.paymentMethod,
        paymentDetails: sale.paymentDetails,
        saleDate: sale.date,
        saleCity: sale.city,
        notes: sale.notes,
      })
      setContracts((prev) => [saved, ...prev])
    } catch (err) {
      alert('Não foi possível gerar o contrato: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  function contractFilename(ext) {
    const buyerSlug = (buyer.name || 'contrato').toLowerCase().replace(/\s+/g, '-')
    return `contrato-${buyerSlug}.${ext}`
  }

  async function handleDownloadPdf() {
    await persistAndSave(generateContractPdf, contractFilename('pdf'))
  }

  async function handleDownloadDocx() {
    await persistAndSave(generateContractDocx, contractFilename('docx'))
  }

  async function redownload(contract, format) {
    const data = {
      title,
      paragraphs: buildContractParagraphs({
        company: contract.company,
        buyer: contract.buyer,
        vehicle: contract.vehicle,
        sale: {
          price: contract.salePrice,
          paymentMethod: contract.paymentMethod,
          paymentDetails: contract.paymentDetails,
          date: contract.saleDate,
          city: contract.saleCity,
          notes: contract.notes,
        },
      }),
      signatures: buildContractSignatures({ company: contract.company, buyer: contract.buyer }),
      filename: `contrato-${(contract.buyer.name || 'contrato').toLowerCase().replace(/\s+/g, '-')}.${format}`,
    }
    if (format === 'pdf') await generateContractPdf(data)
    else await generateContractDocx(data)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Contratos</h1>
          <p>Gere o contrato de venda preenchido automaticamente a partir dos dados do carro</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      <p className="admin-form-hint">
        Modelo padrão de contrato particular de compra e venda de veículo usado — não é assessoria jurídica.
        Vale revisar com um advogado ou contador antes de usar oficialmente.
      </p>

      {error && <p className="admin-error">{error}</p>}

      <form className="admin-form" onSubmit={(e) => e.preventDefault()}>
        <section className="admin-form-section">
          <h2>Empresa (vendedora)</h2>
          <div className="admin-form-grid">
            <label>
              Nome/Razão social
              <input value={company.name} onChange={(e) => updateCompany('name', e.target.value)} required />
            </label>
            <label>
              CNPJ
              <input value={company.document} onChange={(e) => updateCompany('document', e.target.value)} required />
            </label>
            <label>
              Endereço
              <input value={company.address} onChange={(e) => updateCompany('address', e.target.value)} />
            </label>
            <label>
              Telefone
              <input value={company.phone} onChange={(e) => updateCompany('phone', e.target.value)} />
            </label>
            <label>
              E-mail
              <input value={company.email} onChange={(e) => updateCompany('email', e.target.value)} />
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Comprador</h2>
          <div className="admin-form-grid">
            <label>
              Nome completo
              <input value={buyer.name} onChange={(e) => updateBuyer('name', e.target.value)} required />
            </label>
            <label>
              CPF
              <input value={buyer.document} onChange={(e) => updateBuyer('document', e.target.value)} required />
            </label>
            <label>
              RG
              <input value={buyer.rg} onChange={(e) => updateBuyer('rg', e.target.value)} />
            </label>
            <label>
              Endereço
              <input value={buyer.address} onChange={(e) => updateBuyer('address', e.target.value)} />
            </label>
            <label>
              Telefone
              <input value={buyer.phone} onChange={(e) => updateBuyer('phone', e.target.value)} />
            </label>
            <label>
              E-mail
              <input value={buyer.email} onChange={(e) => updateBuyer('email', e.target.value)} />
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Veículo</h2>
          <div className="admin-form-grid">
            <label>
              Carro cadastrado
              <select value={selectedCarId} onChange={(e) => handleSelectCar(e.target.value)}>
                <option value="">Selecione…</option>
                {cars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.brand} {c.model} {c.version} — {carStatusLabel(c.status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-form-grid">
            <label>
              Marca
              <input value={vehicle.brand} onChange={(e) => updateVehicle('brand', e.target.value)} required />
            </label>
            <label>
              Modelo
              <input value={vehicle.model} onChange={(e) => updateVehicle('model', e.target.value)} required />
            </label>
            <label>
              Versão
              <input value={vehicle.version} onChange={(e) => updateVehicle('version', e.target.value)} />
            </label>
            <label>
              Ano Fab./Modelo
              <input value={vehicle.modelYear} onChange={(e) => updateVehicle('modelYear', e.target.value)} placeholder="Ex: 2022/2023" />
            </label>
            <label>
              Cor
              <input value={vehicle.color} onChange={(e) => updateVehicle('color', e.target.value)} />
            </label>
            <label>
              Km
              <input type="number" min="0" value={vehicle.km} onChange={(e) => updateVehicle('km', e.target.value)} />
            </label>
            <label>
              Placa
              <input value={vehicle.plate} onChange={(e) => updateVehicle('plate', e.target.value)} />
            </label>
            <label>
              Chassi
              <input value={vehicle.chassis} onChange={(e) => updateVehicle('chassis', e.target.value)} />
            </label>
            <label>
              Renavam
              <input value={vehicle.renavam} onChange={(e) => updateVehicle('renavam', e.target.value)} />
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Condições da venda</h2>
          <div className="admin-form-grid">
            <label>
              Preço de venda (R$)
              <input type="number" min="0" value={sale.price} onChange={(e) => updateSale('price', e.target.value)} required />
            </label>
            <label>
              Forma de pagamento
              <select value={sale.paymentMethod} onChange={(e) => updateSale('paymentMethod', e.target.value)}>
                <option>À vista</option>
                <option>Financiado</option>
                <option>Parcelado direto com a loja</option>
                <option>Consórcio contemplado</option>
                <option>Outro</option>
              </select>
            </label>
            <label>
              Data da venda
              <input type="date" value={sale.date} onChange={(e) => updateSale('date', e.target.value)} />
            </label>
            <label>
              Cidade/UF (para o contrato)
              <input value={sale.city} onChange={(e) => updateSale('city', e.target.value)} placeholder="Ex: São José de Ribamar/MA" required />
            </label>
          </div>
          <label>
            Detalhes do pagamento (opcional)
            <textarea rows={2} value={sale.paymentDetails} onChange={(e) => updateSale('paymentDetails', e.target.value)} placeholder="Ex: Entrada de R$ 10.000 + 12x de R$ 3.000 no cartão" />
          </label>
          <label>
            Observações adicionais (opcional)
            <textarea rows={3} value={sale.notes} onChange={(e) => updateSale('notes', e.target.value)} placeholder="Cláusulas extras, combinados particulares etc." />
          </label>
        </section>

        <section className="admin-form-section">
          <h2>Prévia do contrato</h2>
          <div className="contract-preview">
            <h3>{title}</h3>
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        <div className="admin-form-actions">
          <button type="button" className="btn btn-outline" onClick={handleDownloadDocx} disabled={generating}>
            <FileText size={15} /> Baixar Word
          </button>
          <button type="button" className="btn btn-primary" onClick={handleDownloadPdf} disabled={generating}>
            <FileDown size={15} /> Baixar PDF
          </button>
        </div>
      </form>

      <h2 className="admin-section-title">Contratos gerados</h2>
      {loading ? (
        <p className="admin-muted">Carregando…</p>
      ) : contracts.length === 0 ? (
        <p className="admin-muted">Nenhum contrato gerado ainda.</p>
      ) : (
        <div className="admin-table-wrap contract-history-table">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Comprador</th>
                <th>Veículo</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.saleDate)}</td>
                  <td>{c.buyer.name}</td>
                  <td>{c.vehicle.brand} {c.vehicle.model}</td>
                  <td>{formatCurrency(c.salePrice)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" className="btn btn-outline" onClick={() => redownload(c, 'pdf')}>PDF</button>
                      <button type="button" className="btn btn-outline" onClick={() => redownload(c, 'docx')}>Word</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
