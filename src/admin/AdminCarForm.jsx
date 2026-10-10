import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Trash2, Receipt, Lock, Sparkles, Copy, Eye, FileText, PenLine } from 'lucide-react'
import { fetchCarById, createCar, updateCar, deleteCar, uploadCarDocument, updateCarDocuments, deleteCarImage } from '../lib/carsApi.js'
import { removedPhotos } from '../utils/carPhotos.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { fetchSaleByCar, saveSaleForCar, deleteSaleForCar } from '../lib/salesApi.js'
import { fetchReservations, closeReservation } from '../lib/reservationsApi.js'
import { CATEGORIES, VEHICLE_CATEGORIES, ENTRY_TYPES, BRANDS, TRANSMISSIONS, FUELS, CONDITIONS, CAR_STATUSES, parseIntBR, todayISO } from '../utils/carFormat.js'
import ImageUploader from './ImageUploader.jsx'
import CarDocumentUploader from './CarDocumentUploader.jsx'
import CustomerPicker from './CustomerPicker.jsx'
import PaymentFields, { paymentFromSale, EMPTY_PAYMENT } from './PaymentFields.jsx'
import { IntakeChecklist, InspectionChecklist } from './CarChecklists.jsx'
import { buildIntake, buildInspection, compactChecklist } from '../utils/carChecklists.js'
import { parseMoneyBR } from '../utils/financing.js'
import DateInputBR from '../components/DateInputBR.jsx'
import VehicleAutofill from './VehicleAutofill.jsx'
import { AUTOFILL_SOURCES, fipePriceNote } from '../utils/preenchimento.js'
import { vehicleDocWarnings } from '../utils/documentosVeiculo.js'
import { formatCurrency } from '../utils/carFormat.js'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchCompanySettings, DEFAULT_STOCK_ALERT_DAYS } from '../lib/companyApi.js'
import { generateCarTexts } from '../lib/textosApi.js'
import { fetchAllContractTemplates, downloadContractTemplateFile } from '../lib/contractTemplatesApi.js'
import { buildEntryTemplateData } from '../utils/contractTemplateTags.js'
import { fillContractTemplateBlob, downloadBlob } from '../utils/fillContractTemplate.js'
import { companyForDocuments } from '../utils/contractCompany.js'
import { slugify } from '../utils/carFormat.js'
import DocxPreview from '../components/DocxPreview.jsx'
import SignatureDialog from './SignatureDialog.jsx'
import SignatureStatus from './SignatureStatus.jsx'
import { fetchSignatureRequests, refreshSignatures } from '../lib/signaturesApi.js'
import { pendingToRefresh } from '../utils/signatures.js'
import { RENAVE_STATUSES } from '../utils/renave.js'
import { DEFAULT_INTAKE_CHECKLIST, DEFAULT_INSPECTION_CHECKLIST } from '../utils/carChecklists.js'
import { DEFAULT_BANKS } from '../utils/payment.js'
import { MoneyInput, KmInput } from '../components/NumberInputs.jsx'
import AnoModeloInput from '../components/AnoModeloInput.jsx'
import { parseAnoModelo, anoModeloFromSaved } from '../utils/anoModelo.js'
import { fetchCarDraft, deleteCarDraft } from '../lib/carDraftsApi.js'
import { lockCarValues } from '../lib/privateValuesApi.js'
import PrivateValuesPanel from './PrivateValuesPanel.jsx'
import OlxCarSection from './OlxCarSection.jsx'
import WebmotorsCarSection from './WebmotorsCarSection.jsx'
import NewCarTabs from './NewCarTabs.jsx'
import { olxSellerPhones } from '../utils/olxStatus.js'

const EMPTY_CAR = {
  brand: '',
  model: '',
  version: '',
  year: '',
  modelYear: '',
  km: 0,
  transmission: TRANSMISSIONS[0],
  fuel: FUELS[0],
  color: '',
  doors: 4,
  category: CATEGORIES[0].slug,
  condition: CONDITIONS[0],
  price: '',
  originalPrice: '',
  badge: 'Disponível',
  status: 'disponivel',
  soldAt: null,
  highlights: [],
  description: '',
  images: [],
  purchasePrice: '',
  purchaseDate: '',
  featured: false,
  hidden: false,
  plate: '',
  chassis: '',
  renavam: '',
  documents: [],
  customerId: '',
  internalNotes: '',
  intakeItems: [],
  inspection: [],
  entryType: 'showroom',
  ownerCustomerId: '',
  whatsappSellerId: '',
  renaveEntryStatus: 'pendente',
  renaveEntryOn: '',
  renaveEntryProtocol: '',
  renaveExitStatus: 'pendente',
  renaveExitOn: '',
  renaveExitProtocol: '',
  fipe: {},
}

export default function AdminCarForm() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin, isStaff, isSeller, seller: me, canSeeCosts } = useAuth()
  const [alertDefault, setAlertDefault] = useState(DEFAULT_STOCK_ALERT_DAYS)
  // Documentos escolhidos antes de o carro existir: sobem logo após o cadastro
  const [pendingDocs, setPendingDocs] = useState([])
  // Valores privados (seção 73): o admin ativa o cadeado já no cadastro
  const [privateOnSave, setPrivateOnSave] = useState(false)
  // Listas da loja (itens que vêm com o carro, vistoria e bancos)
  const [lists, setLists] = useState({ intake: DEFAULT_INTAKE_CHECKLIST, inspection: DEFAULT_INSPECTION_CHECKLIST, banks: DEFAULT_BANKS })
  const [intake, setIntake] = useState(() => buildIntake(DEFAULT_INTAKE_CHECKLIST))
  const [inspection, setInspection] = useState(() => buildInspection(DEFAULT_INSPECTION_CHECKLIST))
  const [payment, setPayment] = useState(EMPTY_PAYMENT)
  const [activeReservation, setActiveReservation] = useState(null)
  // Textos da IA: a descrição vai para o campo; a legenda é só para copiar
  const [generating, setGenerating] = useState(false)
  const [textsError, setTextsError] = useState('')
  const [caption, setCaption] = useState('')
  const [copied, setCopied] = useState(false)
  // Contratos da entrada: modelos marcados como "Entrada do veículo"
  const [entryTemplates, setEntryTemplates] = useState([])
  const [entryTemplateId, setEntryTemplateId] = useState('')
  const [showEntryPreview, setShowEntryPreview] = useState(false)
  const [entryPreview, setEntryPreview] = useState({ blob: null, error: '', loading: false })
  const [entryBusy, setEntryBusy] = useState(false)
  const entryFiles = useRef(new Map())
  const [storeName, setStoreName] = useState('')
  // Assinatura digital dos contratos da entrada (seção 53)
  const [entrySignatures, setEntrySignatures] = useState([])
  const [entrySigning, setEntrySigning] = useState(false)

  useEffect(() => {
    fetchCompanySettings().then((settings) => {
      setAlertDefault(settings.stockAlertDays)
      setLists({ intake: settings.intakeChecklist, inspection: settings.inspectionChecklist, banks: settings.bankList })
      setStoreName(settings.name || '')
    })
  }, [])
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  // "Completar cadastro" de um rascunho do celular (seção 72): /admin/carros/novo?rascunho=<id>
  const [searchParams] = useSearchParams()
  const draftId = isEditing ? null : searchParams.get('rascunho')
  const [draft, setDraft] = useState(null)

  const [car, setCar] = useState(EMPTY_CAR)
  // Carro com o cadeado de outro sócio: sem custo, gastos nem margem (seção 73)
  const seeCosts = canSeeCosts && !car.valuesHidden
  const [originalStatus, setOriginalStatus] = useState(null)
  const [highlightsText, setHighlightsText] = useState('')
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [noPrice, setNoPrice] = useState(false)
  const [customers, setCustomers] = useState([])
  const [sellers, setSellers] = useState([])
  const [existingSale, setExistingSale] = useState(null)
  const [sale, setSale] = useState({ sellerId: '', price: '', date: todayISO() })
  // Todas as fotos que passaram pelo formulário (gravadas ou enviadas agora):
  // as que não ficarem no carro são apagadas do site depois de salvar
  const seenImages = useRef(new Set())

  useEffect(() => {
    if (!draftId) return
    fetchCarDraft(draftId)
      .then((found) => {
        if (!found) {
          setError('Esse rascunho não existe mais (talvez alguém já tenha completado o cadastro).')
          return
        }
        setDraft(found)
        found.images.forEach((url) => seenImages.current.add(url))
        setCar((prev) => ({
          ...prev,
          images: [...found.images, ...prev.images.filter((url) => !found.images.includes(url))],
          internalNotes: prev.internalNotes || found.note,
        }))
      })
      .catch((err) => setError('Não foi possível abrir o rascunho: ' + err.message))
  }, [draftId])

  useEffect(() => {
    fetchAllCustomers().then(setCustomers).catch(() => {})
    fetchSellers().then(setSellers).catch(() => {})
    fetchAllContractTemplates()
      .then((list) => {
        const entry = list.filter((t) => t.kind === 'entrada')
        setEntryTemplates(entry)
        setEntryTemplateId((prev) => prev || entry[0]?.id || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isEditing) return
    fetchSaleByCar(id)
      .then((found) => {
        setExistingSale(found)
        if (found) {
          setSale({ sellerId: found.sellerId || '', price: String(found.salePrice), date: found.saleDate })
          setPayment(paymentFromSale(found))
        }
      })
      .catch(() => {})
  }, [id, isEditing])

  function updateSale(field, value) {
    setSale((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    if (!isEditing) return
    fetchCarById(id).then((found) => {
      if (found) {
        setCar({ ...found, modelYear: anoModeloFromSaved(found.modelYear, found.year), customerId: found.customerId || '', ownerCustomerId: found.ownerCustomerId || '', whatsappSellerId: found.whatsappSellerId || '' })
        found.images.forEach((url) => seenImages.current.add(url))
        setOriginalStatus(found.status)
        if (found.status === 'reservado') {
          fetchReservations()
            .then((list) => setActiveReservation(list.find((r) => r.carId === found.id) || null))
            .catch(() => {})
        }
        setHighlightsText(found.highlights.join('\n'))
        setNoPrice(found.price == null)
      } else {
        setError('Carro não encontrado.')
      }
      setLoading(false)
    })
  }, [id, isEditing])

  useEffect(() => {
    setIntake(buildIntake(lists.intake, car.intakeItems))
    setInspection(buildInspection(lists.inspection, car.inspection))
    // Só quando o carro gravado ou as listas da loja chegam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, car.id])

  // Campos preenchidos pelo CRLV-e, pela FIPE ou pela placa: ficam destacados
  // até a pessoa mexer neles
  const [filled, setFilled] = useState({})
  // Placa, chassi e RENAVAM: o aviso de formato aparece fora do campo em edição
  const [docFocus, setDocFocus] = useState('')

  function update(field, value) {
    setCar((prev) => ({ ...prev, [field]: value }))
    setFilled((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  // Ano/Modelo num campo só: o ano de fabricação sai do texto ("2025/2026")
  function updateAnoModelo(text, parsed) {
    update('modelYear', text)
    if (parsed.ok) update('year', parsed.year)
  }

  // sources: campo -> de onde veio ('crlv', 'foto', 'fipe' ou 'placa'); pdf: o
  // documento (PDF ou foto) que a pessoa pediu para guardar
  async function handleAutofill({ car: next, sources, pdf }) {
    setCar(next)
    setFilled((prev) => ({ ...prev, ...sources }))
    if (!pdf) return
    if (!isEditing) {
      setPendingDocs((prev) => [...prev, pdf])
      return
    }
    try {
      const doc = await uploadCarDocument(id, pdf)
      setCar((prev) => ({ ...prev, documents: [...(prev.documents || []), doc] }))
    } catch (err) {
      setError('Os dados foram aplicados, mas o documento não foi guardado (' + err.message + '). Anexe em "Documentos do carro".')
    }
  }

  const autofillClass = (field) => (filled[field] ? 'is-autofilled' : undefined)
  const autofillNote = (field) =>
    filled[field] ? <small className="autofill-note">Preenchido {AUTOFILL_SOURCES[filled[field]]}, confira</small> : null
  const docWarnings = vehicleDocWarnings(car)
  const docWarning = (field) =>
    docWarnings[field] && docFocus !== field ? <small className="autofill-doc-warning" role="status">{docWarnings[field]}</small> : null

  // RENAVE (seção 55): ao marcar como registrada, a data vem com hoje
  function updateRenave(which, status) {
    setCar((prev) => ({
      ...prev,
      [`renave${which}Status`]: status,
      ...(status === 'registrado' && !prev[`renave${which}On`] ? { [`renave${which}On`]: todayISO() } : {}),
    }))
  }

  function updateImages(images) {
    images.forEach((url) => seenImages.current.add(url))
    update('images', images)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const isSold = car.status === 'vendido'
    const salePrice = isSold ? parseIntBR(sale.price) ?? (noPrice ? null : parseIntBR(car.price)) : null
    if (isSold && !salePrice) {
      setError('Informe o valor final da venda.')
      setSaving(false)
      return
    }
    if (isSold && !sale.date) {
      setError('Informe a data da venda (dd/mm/aaaa).')
      setSaving(false)
      return
    }
    if (!isSold && existingSale && !isAdmin) {
      setError('Esse carro tem uma venda registrada. Só o administrador pode desfazer uma venda.')
      setSaving(false)
      return
    }
    // Vendedor não muda carro vendido ou reservado (nem o que já estava assim)
    if (!isStaff && (originalStatus === 'vendido' || originalStatus === 'reservado') && car.status !== originalStatus) {
      setError('Só o administrador ou o gerente mudam o status de um carro vendido ou reservado.')
      setSaving(false)
      return
    }
    const anoModelo = parseAnoModelo(car.modelYear)
    if (!anoModelo.ok) {
      setError(anoModelo.error)
      setSaving(false)
      return
    }
    if (car.status === 'reservado' && originalStatus !== 'reservado') {
      setError('Para reservar, use o status "Reservado" no Estoque (a janela pede o cliente e o sinal).')
      setSaving(false)
      return
    }
    if (originalStatus === 'reservado' && car.status !== 'reservado' && activeReservation
      && !(await confirm(`Esse carro está reservado${activeReservation.customerName ? ` para ${activeReservation.customerName}` : ''}. Ao mudar o status, a reserva ${car.status === 'vendido' ? 'vira venda' : 'é cancelada'}. Continuar?`))) {
      setSaving(false)
      return
    }
    if (!isSold && existingSale
      && !(await confirm('Esse carro tem uma venda registrada (vendedor, valor e comissão). Ao mudar o status, o registro da venda será apagado. Continuar?'))) {
      setSaving(false)
      return
    }

    let soldAt = null
    if (isSold) {
      const saleDateChanged = !existingSale || existingSale.saleDate !== sale.date
      soldAt = car.soldAt && originalStatus === 'vendido' && !saleDateChanged
        ? car.soldAt
        : new Date(`${sale.date}T12:00:00`).toISOString()
    }

    // Saiu de "vendido": o carro deixa de ter cliente comprador
    const customerId = !isSold && originalStatus === 'vendido' ? null : car.customerId || null

    const payload = {
      ...car,
      year: anoModelo.year,
      modelYear: anoModelo.modelYear,
      km: parseIntBR(car.km),
      doors: car.category === 'moto' ? 0 : Number(car.doors) || 4,
      ownerCustomerId: car.ownerCustomerId || null,
      whatsappSellerId: car.whatsappSellerId || null,
      price: noPrice ? null : parseIntBR(car.price),
      originalPrice: !noPrice && car.originalPrice ? parseIntBR(car.originalPrice) : null,
      purchasePrice: car.purchasePrice ? parseIntBR(car.purchasePrice) : null,
      purchaseDate: car.purchaseDate || null,
      customerId,
      stockAlertDays: car.stockAlertDays ? Number.parseInt(car.stockAlertDays, 10) || null : null,
      soldAt,
      internalNotes: (car.internalNotes || '').trim(),
      intakeItems: compactChecklist(intake),
      inspection: compactChecklist(inspection),
      highlights: highlightsText.split('\n').map((h) => h.trim()).filter(Boolean),
    }

    try {
      const saved = isEditing ? await updateCar(id, payload) : await createCar(payload)
      // Carro salvo: agora sim tira do site as fotos removidas no formulário
      for (const url of removedPhotos(seenImages.current, saved.images)) deleteCarImage(url).catch(() => {})
      seenImages.current = new Set(saved.images)
      // Carro novo vindo de um rascunho do celular: o rascunho sai (as fotos ficam no carro)
      if (!isEditing && draft) await deleteCarDraft(draft).catch(() => {})
      // Valores privados marcados no cadastro: o cadeado entra logo depois de salvar
      let lockError = null
      if (!isEditing && privateOnSave) {
        try {
          await lockCarValues(saved.id)
        } catch (err) {
          lockError = err
        }
      }
      let docError = null
      if (!isEditing && pendingDocs.length > 0) {
        try {
          const uploaded = []
          for (const file of pendingDocs) uploaded.push(await uploadCarDocument(saved.id, file))
          await updateCarDocuments(saved.id, uploaded)
        } catch (err) {
          docError = err
        }
      }
      if (isSold) {
        await saveSaleForCar(saved.id, {
          sellerId: isSeller ? me?.id || null : sale.sellerId || null,
          salePrice,
          saleDate: sale.date,
          payment: {
            method: payment.method,
            bank: payment.bank.trim(),
            downPayment: payment.method === 'financiado' ? parseMoneyBR(payment.downPayment) : null,
            financedAmount: payment.method === 'financiado' ? parseMoneyBR(payment.financedAmount) : null,
          },
          insertOnly: isSeller && !existingSale,
        })
      } else if (existingSale) {
        await deleteSaleForCar(saved.id)
      }
      if (originalStatus === 'reservado' && car.status !== 'reservado' && activeReservation) {
        await closeReservation(activeReservation.id, isSold ? 'convertida' : 'cancelada').catch(() => {})
      }
      if (docError || lockError) {
        // O carro já foi cadastrado: abre a edição dele para acertar o que faltou
        const parts = []
        if (docError) parts.push(`os documentos não foram enviados (${docError.message}). Anexe de novo abaixo`)
        if (lockError) parts.push(`os valores privados não foram ativados (${lockError.message}). Ative em "Custo de aquisição"`)
        setError(`Carro cadastrado, mas ${parts.join('; ')}.`)
        setPendingDocs([])
        setSaving(false)
        navigate(`/admin/carros/${saved.id}`, { replace: true })
        return
      }
      navigate('/admin/estoque')
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
      setSaving(false)
    }
  }

  const entryTemplate = entryTemplates.find((t) => t.id === entryTemplateId) || null

  // Dados do contrato da entrada: loja (da tela Contratos), dono e carro deste cadastro
  function entryData() {
    const owner = customers.find((c) => c.id === car.ownerCustomerId) || null
    const showValue = seeCosts || (isStaff && !isEditing)
    return buildEntryTemplateData({
      company: companyForDocuments(storeName),
      owner,
      vehicle: {
        brand: car.brand,
        model: car.model,
        version: car.version,
        year: car.year,
        modelYear: car.modelYear,
        color: car.color,
        km: parseIntBR(car.km),
        plate: car.plate,
        chassis: car.chassis,
        renavam: car.renavam,
        price: noPrice ? null : parseIntBR(car.price),
      },
      entry: { type: car.entryType, value: showValue ? parseIntBR(car.purchasePrice) : null, date: car.purchaseDate || '' },
    })
  }

  async function entryTemplateFile(template) {
    if (!entryFiles.current.has(template.filePath)) entryFiles.current.set(template.filePath, await downloadContractTemplateFile(template.filePath))
    return entryFiles.current.get(template.filePath)
  }

  useEffect(() => {
    if (!showEntryPreview || !entryTemplate) return
    let cancelled = false
    setEntryPreview((p) => ({ ...p, loading: true, error: '' }))
    const timer = setTimeout(async () => {
      try {
        const blob = await fillContractTemplateBlob(await entryTemplateFile(entryTemplate), entryData())
        if (!cancelled) setEntryPreview({ blob, error: '', loading: false })
      } catch (err) {
        if (!cancelled) setEntryPreview({ blob: null, error: 'Não foi possível montar a prévia: ' + (err.message || err), loading: false })
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEntryPreview, entryTemplate, car, customers, noPrice, storeName])

  async function downloadEntryContract() {
    if (!entryTemplate) return
    setEntryBusy(true)
    try {
      const blob = await fillContractTemplateBlob(await entryTemplateFile(entryTemplate), entryData())
      downloadBlob(blob, `${slugify(entryTemplate.name) || 'contrato'}-${slugify(`${car.brand} ${car.model}`) || 'carro'}.docx`)
    } catch (err) {
      setError('Não foi possível gerar o contrato: ' + err.message)
    } finally {
      setEntryBusy(false)
    }
  }

  // Envios deste carro para assinar; os que aguardam são conferidos em segundo plano
  useEffect(() => {
    if (!id) return
    let active = true
    fetchSignatureRequests({ kind: 'entrada', carId: id })
      .then((list) => {
        if (!active) return
        setEntrySignatures(list)
        const ids = pendingToRefresh(list)
        if (ids.length) refreshSignatures(ids).then((updated) => active && updated.forEach(updateEntrySignature)).catch(() => {})
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [id])

  function updateEntrySignature(updated) {
    setEntrySignatures((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)])
  }

  const entryOwner = customers.find((c) => c.id === car.ownerCustomerId) || null

  async function entryContractFile() {
    const blob = await fillContractTemplateBlob(await entryTemplateFile(entryTemplate), entryData())
    return { blob, fileName: `${slugify(entryTemplate.name) || 'contrato'}-${slugify(`${car.brand} ${car.model}`) || 'carro'}.docx` }
  }

  async function handleGenerateTexts() {
    if (!car.brand || !car.model) {
      setTextsError('Preencha ao menos a marca e o modelo antes de gerar.')
      return
    }
    if (car.description.trim() && !(await confirm('Trocar a descrição atual pela escrita pela IA?', { confirmLabel: 'Trocar' }))) return
    setGenerating(true)
    setTextsError('')
    try {
      const result = await generateCarTexts({
        ...car,
        km: parseIntBR(car.km),
        price: noPrice ? null : parseIntBR(car.price),
        highlights: highlightsText.split('\n').map((h) => h.trim()).filter(Boolean),
        intakeItems: intake.filter((e) => e.status === 'ok').map((e) => e.item),
      })
      update('description', result.descricao)
      setCaption(result.legenda)
      setCopied(false)
    } catch (err) {
      setTextsError('Não foi possível gerar: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption)
      setCopied(true)
    } catch {
      setTextsError('Não foi possível copiar. Selecione o texto e copie à mão.')
    }
  }

  // Passou o cadeado sem continuar vendo: o formulário fica, sem os valores
  function handleValuesAccessLost() {
    fetchCarById(id)
      .then((found) => {
        if (!found) return
        setCar((prev) => ({
          ...prev,
          valuesHidden: found.valuesHidden,
          privateValues: found.privateValues,
          purchasePrice: found.valuesHidden ? '' : prev.purchasePrice,
          purchaseDate: found.valuesHidden ? '' : prev.purchaseDate,
        }))
      })
      .catch(() => {})
  }

  async function handleDelete() {
    if (!(await confirm(`Excluir "${car.brand} ${car.model}"? Essa ação não pode ser desfeita.`))) return
    setSaving(true)
    try {
      await deleteCar(id)
      navigate('/admin/estoque')
    } catch (err) {
      setError('Não foi possível excluir: ' + err.message)
      setSaving(false)
    }
  }

  if (loading) return <p className="admin-muted">Carregando…</p>

  // Gerente informa o custo só no cadastro; na edição o campo nem aparece.
  // O vendedor não informa custo.
  const showPurchase = seeCosts || (isStaff && !isEditing)
  // Status que o vendedor não pode mudar
  const statusLocked = !isStaff && (originalStatus === 'vendido' || originalStatus === 'reservado')

  return (
    <div className="admin-page admin-form-page">
      <Link to="/admin/estoque" className="admin-back-link">
        <ChevronLeft size={16} /> Voltar para o estoque
      </Link>

      <div className="admin-page-head">
        <h1>{isEditing ? 'Editar carro' : 'Novo carro'}</h1>
        {isEditing && (
          <div className="admin-row-actions">
            <Link to={`/admin/carros/${id}/gastos`} className="btn btn-outline">
              <Receipt size={15} /> {seeCosts ? 'Ver gastos' : 'Lançar gasto'}
            </Link>
            {isAdmin && !car.valuesHidden && (
              <button type="button" className="btn btn-outline admin-delete-btn" onClick={handleDelete} disabled={saving}>
                <Trash2 size={15} /> Excluir
              </button>
            )}
          </div>
        )}
      </div>
      {!isEditing && <NewCarTabs />}

      {error && <p className="admin-error">{error}</p>}
      {draft && (
        <p className="car-draft-banner" role="status">
          Completando o rascunho do celular{draft.note ? ` "${draft.note}"` : ''}: {draft.images.length}{' '}
          {draft.images.length === 1 ? 'foto' : 'fotos'}, por {draft.createdByName || 'equipe'}. Ao salvar o carro, o rascunho sai da lista.
        </p>
      )}

      <form className="admin-form" onSubmit={handleSubmit}>
        <VehicleAutofill
          car={car}
          defaults={isEditing ? {} : EMPTY_CAR}
          knownBrands={BRANDS}
          onApply={handleAutofill}
          onFipeUpdate={(fipe) => setCar((prev) => ({ ...prev, fipe }))}
          disabled={saving}
        />

        <section className="admin-form-section">
          <h2>Fotos</h2>
          <ImageUploader images={car.images} onChange={updateImages} />
        </section>

        <section className="admin-form-section">
          <h2>Identificação</h2>
          <div className="admin-form-grid">
            <label className={autofillClass('brand')}>
              Marca
              <input list="brands" required value={car.brand} onChange={(e) => update('brand', e.target.value)} />
              <datalist id="brands">
                {BRANDS.map((b) => <option key={b} value={b} />)}
              </datalist>
              {autofillNote('brand')}
            </label>
            <label className={autofillClass('model')}>
              Modelo
              <input required value={car.model} onChange={(e) => update('model', e.target.value)} />
              {autofillNote('model')}
            </label>
            <label className={autofillClass('version')}>
              Versão
              <input required value={car.version} onChange={(e) => update('version', e.target.value)} placeholder="Ex: XEi 2.0 Flex" />
              {autofillNote('version')}
            </label>
            <label className={autofillClass('category')}>
              Categoria
              <select required value={car.category} onChange={(e) => update('category', e.target.value)}>
                {VEHICLE_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
              {autofillNote('category')}
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Ficha técnica</h2>
          <div className="admin-form-grid">
            <label className={autofillClass('modelYear')}>
              Ano/Modelo
              <AnoModeloInput required value={car.modelYear} onChange={updateAnoModelo} />
              {autofillNote('modelYear')}
            </label>
            <label>
              Quilometragem
              <KmInput required value={car.km} onChange={(v) => update('km', v)} />
            </label>
            <label className={autofillClass('transmission')}>
              Câmbio
              <input list="transmissions" required value={car.transmission} onChange={(e) => update('transmission', e.target.value)} />
              <datalist id="transmissions">
                {TRANSMISSIONS.map((t) => <option key={t} value={t} />)}
              </datalist>
              {autofillNote('transmission')}
            </label>
            <label className={autofillClass('fuel')}>
              Combustível
              <select required value={car.fuel} onChange={(e) => update('fuel', e.target.value)}>
                {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              {autofillNote('fuel')}
            </label>
            <label className={autofillClass('color')}>
              Cor
              <input required value={car.color} onChange={(e) => update('color', e.target.value)} />
              {autofillNote('color')}
            </label>
            {car.category !== 'moto' && (
              <label className={autofillClass('doors')}>
                Portas
                <input type="number" min="2" max="5" required value={car.doors || 4} onChange={(e) => update('doors', e.target.value)} />
                {autofillNote('doors')}
              </label>
            )}
            <label>
              Condição
              <select required value={car.condition} onChange={(e) => update('condition', e.target.value)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Identificação do veículo</h2>
          <p className="admin-form-hint">
            Usados para preencher o contrato de venda automaticamente. Não aparecem no site público.
          </p>
          <div className="admin-form-grid">
            <label className={autofillClass('plate')}>
              Placa
              <input
                value={car.plate}
                onChange={(e) => update('plate', e.target.value)}
                onFocus={() => setDocFocus('plate')}
                onBlur={() => setDocFocus('')}
                placeholder="Ex: ABC1D23"
                autoCapitalize="characters"
              />
              {autofillNote('plate')}
              {docWarning('plate')}
            </label>
            <label className={autofillClass('chassis')}>
              Chassi
              <input
                value={car.chassis}
                onChange={(e) => update('chassis', e.target.value)}
                onFocus={() => setDocFocus('chassis')}
                onBlur={() => setDocFocus('')}
                autoCapitalize="characters"
              />
              {autofillNote('chassis')}
              {docWarning('chassis')}
            </label>
            <label className={autofillClass('renavam')}>
              Renavam
              <input
                value={car.renavam}
                onChange={(e) => update('renavam', e.target.value)}
                onFocus={() => setDocFocus('renavam')}
                onBlur={() => setDocFocus('')}
                inputMode="numeric"
              />
              {autofillNote('renavam')}
              {docWarning('renavam')}
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Preço e status</h2>

          <div className="admin-form-grid">
            <label>
              Preço de venda
              <MoneyInput
                required={!noPrice}
                disabled={noPrice}
                value={noPrice ? '' : car.price}
                onChange={(v) => update('price', v)}
                placeholder={noPrice ? 'Sem preço definido' : ''}
              />
              {car.fipe?.value != null && (
                <small className="fipe-price-ref">
                  FIPE {formatCurrency(car.fipe.value)} ({car.fipe.reference}).{' '}
                  {!noPrice && fipePriceNote(parseIntBR(car.price), car.fipe.value)}
                  {' '}
                  <button
                    type="button"
                    className="admin-link-btn"
                    onClick={() => {
                      setNoPrice(false)
                      update('price', String(car.fipe.value))
                    }}
                  >
                    Usar como preço de venda
                  </button>
                </small>
              )}
            </label>
            <label>
              Preço "de" — opcional, mostra desconto
              <MoneyInput
                disabled={noPrice}
                value={noPrice ? '' : car.originalPrice || ''}
                onChange={(v) => update('originalPrice', v)}
              />
            </label>
            <label>
              Selo/badge do anúncio
              <input value={car.badge} onChange={(e) => update('badge', e.target.value)} placeholder="Ex: Última unidade" />
            </label>
            <label>
              Status
              <select required value={car.status} onChange={(e) => update('status', e.target.value)} disabled={statusLocked}>
                {CAR_STATUSES.filter((s) => s.value !== 'reservado' || originalStatus === 'reservado').map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>

          {car.status === 'vendido' && (
            <div className="admin-sale-fields">
              <h3>Dados da venda</h3>
              <div className="admin-form-grid">
                <label>
                  Vendedor
                  <select value={isSeller ? me?.id || '' : sale.sellerId} onChange={(e) => updateSale('sellerId', e.target.value)} disabled={isSeller}>
                    <option value="">Sem vendedor (venda direta da loja)</option>
                    {sellers
                      .filter((s) => s.active || s.id === sale.sellerId)
                      .map((s) => <option key={s.id} value={s.id}>{s.name}{s.role === 'manager' ? ' (gerente)' : ''}{s.deletedAt ? ' (excluído)' : ''}</option>)}
                  </select>
                </label>
                <label>
                  Valor final da venda
                  <MoneyInput
                    value={sale.price}
                    onChange={(v) => updateSale('price', v)}
                    placeholder={noPrice ? 'Ex: 95.000' : 'Em branco = preço anunciado'}
                  />
                </label>
                <label>
                  Data da venda
                  <DateInputBR value={sale.date} onChange={(v) => updateSale('date', v)} />
                </label>
                <CustomerPicker
                  customers={customers}
                  value={car.customerId}
                  onChange={(value) => update('customerId', value)}
                  onCreated={(created) => setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))}
                  disabled={saving}
                />
              </div>
              <PaymentFields value={payment} onChange={setPayment} banks={lists.banks} disabled={saving} />
            </div>
          )}

          {originalStatus === 'reservado' && activeReservation && (
            <p className="admin-form-note">
              Reservado{activeReservation.customerName ? ` para ${activeReservation.customerName}` : ''}
              {activeReservation.reservedUntil ? ` até ${activeReservation.reservedUntil.split('-').reverse().join('/')}` : ''}.
              A reserva é gerenciada em Vendas → Reservas.
            </p>
          )}

          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={noPrice}
              onChange={(e) => setNoPrice(e.target.checked)}
            />
            Sem preço definido (site mostra "Consulte o valor", sem opção de simular financiamento)
          </label>

          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={car.featured}
              onChange={(e) => update('featured', e.target.checked)}
            />
            Destaque na home (aparece em "Carros em destaque")
          </label>

          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={car.hidden}
              onChange={(e) => update('hidden', e.target.checked)}
            />
            Ocultar do site (some das listagens e da página do carro, sem marcar como vendido)
          </label>
        </section>

        <OlxCarSection car={car} carId={id} sellerPhones={olxSellerPhones(sellers)} noPrice={noPrice} onChange={update} />
        <WebmotorsCarSection car={car} carId={id} noPrice={noPrice} onChange={update} />

        <section className="admin-form-section">
          <h2>Entrada na loja</h2>
          <div className="admin-form-grid">
            <label>
              Tipo de entrada
              <select value={car.entryType} onChange={(e) => update('entryType', e.target.value)}>
                {ENTRY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              WhatsApp deste carro
              <select value={car.whatsappSellerId || ''} onChange={(e) => update('whatsappSellerId', e.target.value)}>
                <option value="">Padrão da loja (número fixo ou rodízio)</option>
                {sellers
                  .filter((s) => (s.active && !s.deletedAt && s.phone) || s.id === car.whatsappSellerId)
                  .map((s) => <option key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ' (sem telefone)'}</option>)}
              </select>
            </label>
            <CustomerPicker
              customers={customers}
              value={car.ownerCustomerId || ''}
              onChange={(value) => update('ownerCustomerId', value)}
              onCreated={(created) => setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))}
              disabled={saving}
              label={car.entryType === 'consignado' ? 'Dono do carro (consignante)' : 'Dono anterior (de quem a loja comprou)'}
            />
          </div>
          <p className="admin-form-note">
            {car.entryType === 'repasse'
              ? 'Carro de repasse fica só no painel: não aparece no site.'
              : car.entryType === 'consignado'
                ? 'No consignado, informe abaixo o valor combinado com o dono: a margem da venda é a diferença.'
                : 'O dono anterior vai para os contratos de entrada.'}{' '}
            Todo botão de WhatsApp deste carro vai para a pessoa escolhida (precisa ter telefone na Equipe).
          </p>

          <div className="entry-contracts">
            <h3>Contratos da entrada</h3>
            {entryTemplates.length === 0 ? (
              <p className="admin-form-note">
                Nenhum modelo de entrada ainda.{' '}
                {isAdmin
                  ? 'Envie um em Contratos → Modelos de contrato, marcado como “Entrada do veículo”.'
                  : 'Peça ao administrador para cadastrar um.'}
              </p>
            ) : (
              <>
                <div className="entry-contracts-actions">
                  <label>
                    Modelo
                    <select value={entryTemplateId} onChange={(e) => setEntryTemplateId(e.target.value)}>
                      {entryTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn btn-outline" onClick={() => setShowEntryPreview((v) => !v)}>
                    <Eye size={15} /> {showEntryPreview ? 'Fechar prévia' : 'Prévia'}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={downloadEntryContract} disabled={entryBusy}>
                    <FileText size={15} /> {entryBusy ? 'Gerando…' : 'Baixar Word'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setEntrySigning(true)}
                    disabled={!isEditing || !entryTemplate}
                    title={isEditing ? undefined : 'Salve o carro antes de mandar para assinar'}
                  >
                    <PenLine size={15} /> Enviar para assinatura
                  </button>
                </div>
                {showEntryPreview && <DocxPreview blob={entryPreview.blob} error={entryPreview.error} loading={entryPreview.loading} />}
              </>
            )}
            {entrySignatures.some((r) => r.status !== 'cancelado') && (
              <ul className="signature-list">
                {entrySignatures
                  .filter((r) => r.status !== 'cancelado')
                  .map((r) => (
                    <li key={r.id}>
                      <p className="signature-list-title">{r.title}</p>
                      <SignatureStatus request={r} onChange={updateEntrySignature} compact />
                    </li>
                  ))}
              </ul>
            )}
            <p className="admin-form-note">
              Usa os dados deste cadastro e do dono escolhido acima{isEditing ? '' : ' (para mandar assinar, salve o carro antes)'}. Pela
              assinatura digital, a via assinada vai sozinha para a ficha do dono; assinado no papel, anexe em “Documentos do carro”.
            </p>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>RENAVE</h2>
          <p className="admin-form-hint">
            A entrada e a saída de cada carro no estoque são registradas no RENAVE pela integradora contratada pela loja
            (obrigatório pela Resolução Contran 1.026/2026). Marque aqui depois de registrar: o início do painel avisa o que
            estiver pendente.
          </p>
          <div className="admin-form-grid">
            <label>
              Entrada no RENAVE
              <select value={car.renaveEntryStatus} onChange={(e) => updateRenave('Entry', e.target.value)}>
                {RENAVE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            {car.renaveEntryStatus === 'registrado' && (
              <>
                <label>
                  Data da entrada
                  <DateInputBR value={car.renaveEntryOn || ''} onChange={(iso) => update('renaveEntryOn', iso)} />
                </label>
                <label>
                  Protocolo (opcional)
                  <input value={car.renaveEntryProtocol} onChange={(e) => update('renaveEntryProtocol', e.target.value)} maxLength={80} />
                </label>
              </>
            )}
          </div>
          {car.status === 'vendido' ? (
            <div className="admin-form-grid">
              <label>
                Saída no RENAVE
                <select value={car.renaveExitStatus} onChange={(e) => updateRenave('Exit', e.target.value)}>
                  {RENAVE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              {car.renaveExitStatus === 'registrado' && (
                <>
                  <label>
                    Data da saída
                    <DateInputBR value={car.renaveExitOn || ''} onChange={(iso) => update('renaveExitOn', iso)} />
                  </label>
                  <label>
                    Protocolo (opcional)
                    <input value={car.renaveExitProtocol} onChange={(e) => update('renaveExitProtocol', e.target.value)} maxLength={80} />
                  </label>
                </>
              )}
            </div>
          ) : (
            <p className="admin-form-note">A saída aparece aqui quando o carro for marcado como vendido.</p>
          )}
        </section>

        <section className="admin-form-section">
          <h2>{showPurchase || car.valuesHidden ? (car.entryType === 'consignado' ? 'Valor combinado com o dono' : 'Custo de aquisição') : 'Aviso de estoque'}</h2>
          {isAdmin && isEditing && <PrivateValuesPanel carId={id} onAccessLost={handleValuesAccessLost} />}
          {isAdmin && !isEditing && (
            <label className="admin-checkbox admin-checkbox-note private-values-new">
              <input type="checkbox" checked={privateOnSave} onChange={(e) => setPrivateOnSave(e.target.checked)} />
              <span>
                <Lock size={14} aria-hidden="true" /> Valores privados: só eu vejo o custo, os gastos e a margem deste carro
                <small className="admin-form-hint">
                  Os outros administradores veem e editam o carro, mas sem esses valores, e ele fica fora das contas de dinheiro deles. Dá
                  para liberar depois.
                </small>
              </span>
            </label>
          )}
          {showPurchase && (
            <p className="admin-form-hint">
              {seeCosts
                ? 'Usado para calcular o custo total e a margem do carro (junto com os gastos cadastrados em "Ver gastos"). Não aparece no site público.'
                : 'Informe quanto a loja pagou pelo carro. Depois de cadastrar, só o administrador vê e altera esse valor.'}
            </p>
          )}
          <div className="admin-form-grid">
            {showPurchase && (
              <label>
                {car.entryType === 'consignado' ? 'Valor que vai para o dono' : 'Preço de compra'}
                <MoneyInput
                  value={car.purchasePrice || ''}
                  onChange={(v) => update('purchasePrice', v)}
                  placeholder={car.entryType === 'consignado' ? 'Quanto o dono recebe na venda' : 'Quanto a loja pagou pelo carro'}
                />
              </label>
            )}
            {showPurchase && (
              <label>
                {car.entryType === 'consignado' ? 'Data de entrada' : 'Data da compra'}
                <DateInputBR value={car.purchaseDate || ''} onChange={(iso) => update('purchaseDate', iso)} />
              </label>
            )}
            <label>
              Aviso de estoque (dias)
              <input
                inputMode="numeric"
                value={car.stockAlertDays || ''}
                onChange={(e) => update('stockAlertDays', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={`Padrão da loja: ${alertDefault} dias`}
              />
            </label>
          </div>
          <p className="admin-form-note">
            O tempo em estoque fica em vermelho a partir desse prazo. Em branco, usa o padrão da loja (ajustável em Estoque → Aviso de estoque).
          </p>
        </section>

        <section className="admin-form-section">
          <h2>Diferenciais</h2>
          <p className="admin-form-hint">Um item por linha. Aparecem como destaques no anúncio (até 4 são exibidos).</p>
          <textarea
            rows={4}
            value={highlightsText}
            onChange={(e) => setHighlightsText(e.target.value)}
            placeholder={'Revisado na concessionária\nÚnico dono\nIPVA pago'}
          />
        </section>

        <section className="admin-form-section">
          <h2>Documentos do carro</h2>
          <p className="admin-form-hint">CRLV, laudo cautelar, nota fiscal etc. Ficam visíveis só no painel da equipe, nunca no site.</p>
          <CarDocumentUploader
            carId={id}
            documents={car.documents}
            onChange={(documents) => update('documents', documents)}
            pendingFiles={pendingDocs}
            onPendingChange={setPendingDocs}
          />
        </section>

        <section className="admin-form-section">
          <h2>Entrada do carro</h2>
          <p className="admin-form-hint">
            Opcional. O que veio com o carro já aparece marcado no checklist de entrega quando ele for vendido.
          </p>
          <IntakeChecklist value={intake} onChange={setIntake} disabled={saving} />
          <InspectionChecklist value={inspection} onChange={setInspection} disabled={saving} />
        </section>

        <section className="admin-form-section">
          <h2>Observações internas</h2>
          <p className="internal-notes-hint">
            <Lock size={13} /> Só a equipe vê; não aparece no site.
          </p>
          <textarea
            rows={3}
            value={car.internalNotes || ''}
            onChange={(e) => update('internalNotes', e.target.value)}
            placeholder="Ex: pneu dianteiro para trocar, dono anterior mora no bairro X, aceita troca por moto..."
          />
        </section>

        <section className="admin-form-section">
          <div className="ai-texts-head">
            <h2>Descrição</h2>
            <button type="button" className="btn btn-outline" onClick={handleGenerateTexts} disabled={generating || saving}>
              <Sparkles size={15} /> {generating ? 'Escrevendo…' : 'Gerar com IA'}
            </button>
          </div>
          {textsError && <p className="admin-error">{textsError}</p>}
          <textarea
            rows={5}
            value={car.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Texto de apresentação do carro, exibido na página de detalhe."
          />
          {caption && (
            <div className="ai-caption">
              <div className="ai-caption-head">
                <strong>Legenda para Instagram e WhatsApp</strong>
                <button type="button" className="admin-action-btn" onClick={copyCaption}>
                  <Copy size={14} /> {copied ? 'Copiada' : 'Copiar'}
                </button>
              </div>
              <textarea rows={9} value={caption} onChange={(e) => { setCaption(e.target.value); setCopied(false) }} />
            </div>
          )}
          <p className="admin-form-note">
            “Gerar com IA” escreve a descrição e uma legenda para redes sociais só com os dados deste cadastro (ficha, diferenciais e
            itens que vieram com o carro). Revise antes de salvar.
          </p>
        </section>

        <div className="admin-form-actions">
          <Link to="/admin/estoque" className="btn btn-outline">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Cadastrar carro'}
          </button>
        </div>
      </form>
      {entrySigning && entryTemplate && (
        <SignatureDialog
          kind="entrada"
          carId={id}
          defaultTitle={[entryTemplate.name, [car.brand, car.model].filter(Boolean).join(' '), entryOwner?.name].filter(Boolean).join(' · ')}
          party={{ name: entryOwner?.name || '', email: entryOwner?.email || '' }}
          buildFile={entryContractFile}
          onClose={() => setEntrySigning(false)}
          onSent={(request) => {
            updateEntrySignature(request)
            setEntrySigning(false)
          }}
        />
      )}
      {confirmDialog}
    </div>
  )
}
