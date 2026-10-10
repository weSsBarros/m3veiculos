import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCompanySettings } from '../lib/companyApi.js'
import { DEFAULT_BANKS, contractPaymentText } from '../utils/payment.js'
import BankSelect from './BankSelect.jsx'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCcw, FileDown, FileText, Settings, PenLine } from 'lucide-react'
import { fetchAllCarsAdmin, fetchSellerCars } from '../lib/carsApi.js'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchContractsAdmin, createContract } from '../lib/contractsApi.js'
import { fetchAllContractTemplates, downloadContractTemplateFile } from '../lib/contractTemplatesApi.js'
import { formatCurrency, carStatusLabel, parseIntBR, formatDateBR as formatDate, slugify } from '../utils/carFormat.js'
import { buildContractTitle, buildContractParagraphs, buildContractSignatures } from '../utils/contractTemplate.js'
import { buildReceiptTitle, buildReceiptParagraphs, buildReceiptSignatures } from '../utils/receiptTemplate.js'
import { buildContractTemplateData } from '../utils/contractTemplateTags.js'
import { generateContractPdf } from '../utils/contractPdf.js'
import { generateContractDocx } from '../utils/contractDocx.js'
import { fillContractTemplateBlob, downloadBlob } from '../utils/fillContractTemplate.js'
import DocxPreview from '../components/DocxPreview.jsx'
import { loadContractLogo } from '../utils/contractLogo.js'
import { loadStoredCompany, saveStoredCompany } from '../utils/contractCompany.js'
import { companyFromFiscal } from '../utils/fiscal.js'
import { downloadSavedContract, buildSavedContractFile, savedContractTitle } from '../utils/contractDownload.js'
import { fetchSignatureRequests, refreshSignatures } from '../lib/signaturesApi.js'
import { latestByContract, pendingToRefresh } from '../utils/signatures.js'
import SignatureDialog from './SignatureDialog.jsx'
import SignatureStatus from './SignatureStatus.jsx'
import DateInputBR from '../components/DateInputBR.jsx'
import { MoneyInput, KmInput } from '../components/NumberInputs.jsx'
import AnoModeloInput from '../components/AnoModeloInput.jsx'
import './admin.css'

const EMPTY_BUYER = { name: '', document: '', rg: '', address: '', phone: '', email: '' }
const EMPTY_VEHICLE = { brand: '', model: '', version: '', year: '', modelYear: '', color: '', km: '', plate: '', chassis: '', renavam: '' }
const EMPTY_SALE = { price: '', paymentMethod: 'À vista', bank: '', paymentDetails: '', date: new Date().toISOString().slice(0, 10), city: '', notes: '' }

export default function AdminContracts() {
  const { isAdmin, isStaff } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectCarId = searchParams.get('carro')
  const [cars, setCars] = useState([])
  const [contracts, setContracts] = useState([])
  const [customers, setCustomers] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const [selectedCarId, setSelectedCarId] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [documentType, setDocumentType] = useState('contrato')
  const [company, setCompany] = useState(loadStoredCompany)
  const [buyer, setBuyer] = useState(EMPTY_BUYER)
  const [vehicle, setVehicle] = useState(EMPTY_VEHICLE)
  const [sale, setSale] = useState(EMPTY_SALE)
  const [logo, setLogo] = useState(null)
  const [banks, setBanks] = useState(DEFAULT_BANKS)
  const [templatePreview, setTemplatePreview] = useState({ blob: null, error: '', loading: false })
  const templateFiles = useRef(new Map())
  // Assinatura digital (seção 53): envios dos contratos e o contrato sendo enviado
  const [signRequests, setSignRequests] = useState([])
  const [signing, setSigning] = useState(null)

  useEffect(() => {
    loadContractLogo().then(setLogo)
    fetchCompanySettings()
      .then((settings) => {
        setBanks(settings.bankList)
        // Dados fiscais da loja (Configurações) passam na frente do que ficou neste navegador
        const official = companyFromFiscal(settings.fiscal, settings.name)
        if (official) setCompany(official)
      })
      .catch(() => {})
  }, [])

  // Financiado com banco escolhido: "Financiado pelo Banco do Brasil"
  const paymentText = contractPaymentText(sale.paymentMethod, sale.bank)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [carsData, contractsData, customersData, templatesData] = await Promise.all([
        isStaff ? fetchAllCarsAdmin() : fetchSellerCars(),
        fetchContractsAdmin(),
        fetchAllCustomers(),
        fetchAllContractTemplates(),
      ])
      setCars(carsData)
      setContracts(contractsData)
      setCustomers(customersData)
      // Modelos de entrada ficam no cadastro do carro
      setTemplates(templatesData.filter((t) => t.kind !== 'entrada'))
      loadSignatures()
    } catch (err) {
      setError(err.message || 'Erro ao carregar os contratos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Envios para assinar; os que aguardam são conferidos na Autentique em segundo plano
  async function loadSignatures() {
    try {
      const list = await fetchSignatureRequests({ kind: 'venda' })
      setSignRequests(list)
      const ids = pendingToRefresh(list)
      if (ids.length) refreshSignatures(ids).then((updated) => updated.forEach(updateSignature)).catch(() => {})
    } catch {
      setSignRequests([])
    }
  }

  function updateSignature(updated) {
    setSignRequests((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)])
  }

  const signatureByContract = useMemo(() => latestByContract(signRequests), [signRequests])

  // Vindo do estoque do vendedor ("Gerar contrato"): já seleciona o carro
  useEffect(() => {
    if (!preselectCarId || selectedCarId || cars.length === 0) return
    if (cars.some((c) => c.id === preselectCarId)) handleSelectCar(preselectCarId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, preselectCarId])

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
    setSale((prev) => ({ ...prev, price: car.price ?? '' }))
    if (car.customerId) handleSelectCustomer(car.customerId)
  }

  function handleSelectCustomer(customerId) {
    setSelectedCustomerId(customerId)
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) return
    setBuyer({
      name: customer.name,
      document: customer.document || '',
      rg: customer.rg || '',
      address: customer.address || '',
      phone: customer.phone || '',
      email: customer.email || '',
    })
  }

  const contractData = useMemo(
    () => ({
      company,
      buyer,
      vehicle,
      sale: { ...sale, paymentMethod: paymentText, price: parseIntBR(sale.price) || 0 },
    }),
    [company, buyer, vehicle, sale, paymentText]
  )

  const isReceipt = documentType === 'recibo'
  const paragraphs = useMemo(
    () => (isReceipt ? buildReceiptParagraphs(contractData) : buildContractParagraphs(contractData)),
    [contractData, isReceipt]
  )
  const title = isReceipt ? buildReceiptTitle() : buildContractTitle()
  const signatures = useMemo(
    () => (isReceipt ? buildReceiptSignatures(contractData) : buildContractSignatures(contractData)),
    [contractData, isReceipt]
  )

  const selectedTemplate = !isReceipt ? templates.find((t) => t.id === selectedTemplateId) || null : null

  // Arquivo do modelo (baixado uma vez por modelo)
  async function templateFile(template) {
    if (!templateFiles.current.has(template.filePath)) {
      templateFiles.current.set(template.filePath, await downloadContractTemplateFile(template.filePath))
    }
    return templateFiles.current.get(template.filePath)
  }

  // Prévia do modelo próprio: o Word preenchido com o que está no formulário
  useEffect(() => {
    if (!selectedTemplate) {
      setTemplatePreview({ blob: null, error: '', loading: false })
      return
    }
    let cancelled = false
    setTemplatePreview((p) => ({ ...p, loading: true, error: '' }))
    const timer = setTimeout(async () => {
      try {
        const file = await templateFile(selectedTemplate)
        const blob = await fillContractTemplateBlob(file, buildContractTemplateData(contractData))
        if (!cancelled) setTemplatePreview({ blob, error: '', loading: false })
      } catch (err) {
        if (!cancelled) setTemplatePreview({ blob: null, error: 'Não foi possível montar a prévia: ' + (err.message || err), loading: false })
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, contractData])

  function validate() {
    if (!company.name || !company.document) return 'Preencha nome e CNPJ/CPF da empresa vendedora.'
    if (!buyer.name || !buyer.document) return 'Preencha nome e CPF do comprador.'
    if (!vehicle.brand || !vehicle.model) return 'Selecione ou preencha o veículo.'
    if (!sale.price || Number(sale.price) <= 0) return 'Informe o preço de venda.'
    if (!sale.city) return 'Informe a cidade para o contrato.'
    return ''
  }

  async function saveContractRecord(template = null) {
    saveStoredCompany(company)
    const saved = await createContract({
      templateId: template?.id || null,
      templateFilePath: template?.filePath || null,
      carId: selectedCarId || null,
      // Fica na ficha do cliente (Clientes → Ficha e contratos)
      customerId: selectedCustomerId || null,
      documentType,
      company,
      buyer,
      vehicle,
      salePrice: parseIntBR(sale.price),
      paymentMethod: paymentText,
      paymentDetails: sale.paymentDetails,
      saleDate: sale.date,
      saleCity: sale.city,
      notes: sale.notes,
    })
    setContracts((prev) => [saved, ...prev])
    return saved
  }

  async function persistAndSave(fn, filename) {
    const validationError = validate()
    if (validationError) {
      alert(validationError)
      return
    }
    setGenerating(true)
    try {
      await fn({ title, paragraphs, signatures, filename, logo })
      await saveContractRecord()
    } catch (err) {
      alert('Não foi possível gerar o contrato: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  function contractFilename(ext) {
    const buyerSlug = slugify(buyer.name || '') || 'documento'
    return `${isReceipt ? 'recibo' : 'contrato'}-${buyerSlug}.${ext}`
  }

  async function handleDownloadPdf() {
    await persistAndSave(generateContractPdf, contractFilename('pdf'))
  }

  async function handleDownloadDocx() {
    await persistAndSave(generateContractDocx, contractFilename('docx'))
  }

  async function handleDownloadCustomTemplate() {
    const validationError = validate()
    if (validationError) {
      alert(validationError)
      return
    }
    const template = selectedTemplate
    if (!template) return
    setGenerating(true)
    try {
      const arrayBuffer = await templateFile(template)
      const data = buildContractTemplateData(contractData)
      downloadBlob(await fillContractTemplateBlob(arrayBuffer, data), contractFilename('docx'))
      await saveContractRecord(template)
    } catch (err) {
      alert('Não foi possível gerar o contrato: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  // Guarda o contrato (sem baixar) e abre o envio para assinatura
  async function handleSendForSignature() {
    const validationError = validate()
    if (validationError) {
      alert(validationError)
      return
    }
    setGenerating(true)
    try {
      setSigning(await saveContractRecord(selectedTemplate))
    } catch (err) {
      alert('Não foi possível gerar o contrato: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function redownload(contract, format) {
    await downloadSavedContract(contract, format, logo)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Contratos</h1>
          <p>Gere o contrato de venda ou o recibo, preenchidos automaticamente a partir dos dados do carro</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      <p className="admin-form-hint">
        {isReceipt
          ? 'Recibo interno de venda — não é assessoria jurídica nem substitui a Nota Fiscal Eletrônica (NF-e).'
          : 'Modelo padrão de contrato particular de compra e venda de veículo usado — não é assessoria jurídica.'}{' '}
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
              Cliente cadastrado
              <select value={selectedCustomerId} onChange={(e) => handleSelectCustomer(e.target.value)}>
                <option value="">Selecione para preencher e guardar na ficha do cliente…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
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
              <AnoModeloInput value={vehicle.modelYear} onChange={(text) => updateVehicle('modelYear', text)} />
            </label>
            <label>
              Cor
              <input value={vehicle.color} onChange={(e) => updateVehicle('color', e.target.value)} />
            </label>
            <label>
              Km
              <KmInput value={vehicle.km} onChange={(v) => updateVehicle('km', v)} />
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
              Preço de venda
              <MoneyInput value={sale.price} onChange={(v) => updateSale('price', v)} required />
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
            {sale.paymentMethod === 'Financiado' && (
              <BankSelect value={sale.bank} onChange={(bank) => updateSale('bank', bank)} banks={banks} />
            )}
            <label>
              Data da venda
              <DateInputBR value={sale.date} onChange={(iso) => updateSale('date', iso)} />
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
          <h2>Documento</h2>
          <div className="admin-form-grid">
            <label>
              Tipo de documento
              <select
                value={documentType}
                onChange={(e) => {
                  setDocumentType(e.target.value)
                  setSelectedTemplateId('')
                }}
              >
                <option value="contrato">Contrato de compra e venda</option>
                <option value="recibo">Recibo de venda</option>
              </select>
            </label>
            {!isReceipt && (
              <label>
                Modelo do contrato
                <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                  <option value="">Modelo padrão do sistema</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {isReceipt && (
            <p className="admin-form-note">
              Comprovante interno de venda, não substitui a Nota Fiscal Eletrônica (NF-e).
            </p>
          )}
          {!isReceipt && isAdmin && (
            <Link to="/admin/contratos/modelos" className="admin-back-link admin-form-note">
              <Settings size={14} /> Gerenciar modelos de contrato
            </Link>
          )}
        </section>

        <section className="admin-form-section">
          <h2>Prévia do {isReceipt ? 'recibo' : 'contrato'}</h2>
          {selectedTemplate ? (
            <DocxPreview blob={templatePreview.blob} error={templatePreview.error} loading={templatePreview.loading} />
          ) : (
            <div className="contract-preview">
              <h3>{title}</h3>
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
        </section>

        <div className="admin-form-actions">
          <button type="button" className="btn btn-outline" onClick={handleSendForSignature} disabled={generating}>
            <PenLine size={15} /> Enviar para assinatura digital
          </button>
          {selectedTemplateId ? (
            <button type="button" className="btn btn-primary" onClick={handleDownloadCustomTemplate} disabled={generating}>
              <FileText size={15} /> {generating ? 'Gerando…' : 'Baixar Word (modelo próprio)'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={handleDownloadDocx} disabled={generating}>
                <FileText size={15} /> Baixar Word
              </button>
              <button type="button" className="btn btn-primary" onClick={handleDownloadPdf} disabled={generating}>
                <FileDown size={15} /> Baixar PDF
              </button>
            </>
          )}
        </div>
        <p className="admin-form-note">
          {selectedCustomerId
            ? 'O documento gerado fica na ficha do cliente. Pela assinatura digital, a via assinada entra lá sozinha; assinado no papel, anexe em Clientes → Ficha e contratos.'
            : 'Escolha um cliente cadastrado para o documento ficar guardado na ficha dele.'}
        </p>
      </form>

      <h2 className="admin-section-title">{isStaff ? 'Contratos gerados' : 'Seus contratos gerados'}</h2>
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
                <th>Tipo</th>
                <th>Comprador</th>
                <th>Veículo</th>
                <th>Valor</th>
                <th>Assinatura digital</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.saleDate)}</td>
                  <td>{c.documentType === 'recibo' ? 'Recibo' : 'Contrato'}</td>
                  <td>{c.buyer.name}</td>
                  <td>{c.vehicle.brand} {c.vehicle.model}</td>
                  <td>{formatCurrency(c.salePrice)}</td>
                  <td>
                    {signatureByContract.get(c.id) && signatureByContract.get(c.id).status !== 'cancelado' ? (
                      <SignatureStatus request={signatureByContract.get(c.id)} onChange={updateSignature} compact />
                    ) : (
                      <button type="button" className="admin-action-btn" onClick={() => setSigning(c)}>
                        <PenLine size={15} /> {signatureByContract.get(c.id) ? 'Enviar de novo' : 'Enviar para assinar'}
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {!c.templateFilePath && (
                        <button type="button" className="admin-action-btn" onClick={() => redownload(c, 'pdf')}>
                          <FileDown size={15} /> Baixar PDF
                        </button>
                      )}
                      <button type="button" className="admin-action-btn" onClick={() => redownload(c, 'docx')}>
                        <FileText size={15} /> Baixar Word
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {signing && (
        <SignatureDialog
          kind="venda"
          contractId={signing.id}
          defaultTitle={savedContractTitle(signing)}
          party={{ name: signing.buyer.name, email: signing.buyer.email }}
          buildFile={() => buildSavedContractFile(signing, logo)}
          onClose={() => setSigning(null)}
          onSent={(request) => {
            updateSignature(request)
            setSigning(null)
          }}
        />
      )}
    </div>
  )
}
