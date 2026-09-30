import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Trash2, Receipt, Lock } from 'lucide-react'
import { fetchCarById, createCar, updateCar, deleteCar, uploadCarDocument, updateCarDocuments } from '../lib/carsApi.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { fetchSaleByCar, saveSaleForCar, deleteSaleForCar } from '../lib/salesApi.js'
import { fetchReservations, closeReservation } from '../lib/reservationsApi.js'
import { CATEGORIES, BRANDS, TRANSMISSIONS, FUELS, CONDITIONS, CAR_STATUSES, parseIntBR, todayISO } from '../utils/carFormat.js'
import ImageUploader from './ImageUploader.jsx'
import CarDocumentUploader from './CarDocumentUploader.jsx'
import CustomerPicker from './CustomerPicker.jsx'
import PaymentFields, { paymentFromSale, EMPTY_PAYMENT } from './PaymentFields.jsx'
import { IntakeChecklist, InspectionChecklist } from './CarChecklists.jsx'
import { buildIntake, buildInspection, compactChecklist } from '../utils/carChecklists.js'
import { parseMoneyBR } from '../utils/financing.js'
import DateInputBR from '../components/DateInputBR.jsx'
import FipeLookup from '../components/FipeLookup.jsx'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchCompanySettings, DEFAULT_STOCK_ALERT_DAYS } from '../lib/companyApi.js'
import { DEFAULT_INTAKE_CHECKLIST, DEFAULT_INSPECTION_CHECKLIST } from '../utils/carChecklists.js'
import { DEFAULT_BANKS } from '../utils/payment.js'

const EMPTY_CAR = {
  brand: '',
  model: '',
  version: '',
  year: new Date().getFullYear(),
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
}

export default function AdminCarForm() {
  const { confirm, confirmDialog } = useConfirm()
  const { isAdmin, isStaff, isSeller, seller: me, canSeeCosts } = useAuth()
  const [alertDefault, setAlertDefault] = useState(DEFAULT_STOCK_ALERT_DAYS)
  // Documentos escolhidos antes de o carro existir: sobem logo após o cadastro
  const [pendingDocs, setPendingDocs] = useState([])
  // Listas da loja (itens que vêm com o carro, vistoria e bancos)
  const [lists, setLists] = useState({ intake: DEFAULT_INTAKE_CHECKLIST, inspection: DEFAULT_INSPECTION_CHECKLIST, banks: DEFAULT_BANKS })
  const [intake, setIntake] = useState(() => buildIntake(DEFAULT_INTAKE_CHECKLIST))
  const [inspection, setInspection] = useState(() => buildInspection(DEFAULT_INSPECTION_CHECKLIST))
  const [payment, setPayment] = useState(EMPTY_PAYMENT)
  const [activeReservation, setActiveReservation] = useState(null)

  useEffect(() => {
    fetchCompanySettings().then((settings) => {
      setAlertDefault(settings.stockAlertDays)
      setLists({ intake: settings.intakeChecklist, inspection: settings.inspectionChecklist, banks: settings.bankList })
    })
  }, [])
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [car, setCar] = useState(EMPTY_CAR)
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

  useEffect(() => {
    fetchAllCustomers().then(setCustomers).catch(() => {})
    fetchSellers().then(setSellers).catch(() => {})
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
        setCar({ ...found, customerId: found.customerId || '' })
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

  function update(field, value) {
    setCar((prev) => ({ ...prev, [field]: value }))
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
      year: Number(car.year),
      km: parseIntBR(car.km),
      doors: Number(car.doors),
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
      if (docError) {
        // O carro já foi cadastrado: abre a edição dele para anexar de novo
        setError('Carro cadastrado, mas os documentos não foram enviados (' + docError.message + '). Anexe de novo abaixo.')
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
  const showPurchase = canSeeCosts || (isStaff && !isEditing)
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
              <Receipt size={15} /> {canSeeCosts ? 'Ver gastos' : 'Lançar gasto'}
            </Link>
            {isAdmin && (
              <button type="button" className="btn btn-outline admin-delete-btn" onClick={handleDelete} disabled={saving}>
                <Trash2 size={15} /> Excluir
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="admin-error">{error}</p>}

      <form className="admin-form" onSubmit={handleSubmit}>
        <section className="admin-form-section">
          <h2>Fotos</h2>
          <ImageUploader images={car.images} onChange={(images) => update('images', images)} />
        </section>

        <section className="admin-form-section">
          <h2>Identificação</h2>
          <div className="admin-form-grid">
            <label>
              Marca
              <input list="brands" required value={car.brand} onChange={(e) => update('brand', e.target.value)} />
              <datalist id="brands">
                {BRANDS.map((b) => <option key={b} value={b} />)}
              </datalist>
            </label>
            <label>
              Modelo
              <input required value={car.model} onChange={(e) => update('model', e.target.value)} />
            </label>
            <label>
              Versão
              <input required value={car.version} onChange={(e) => update('version', e.target.value)} placeholder="Ex: XEi 2.0 Flex" />
            </label>
            <label>
              Categoria
              <select required value={car.category} onChange={(e) => update('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Ficha técnica</h2>
          <div className="admin-form-grid">
            <label>
              Ano de fabricação
              <input type="number" required value={car.year} onChange={(e) => update('year', e.target.value)} />
            </label>
            <label>
              Ano/Modelo (texto)
              <input required value={car.modelYear} onChange={(e) => update('modelYear', e.target.value)} placeholder="Ex: 2022/2023" />
            </label>
            <label>
              Quilometragem
              <input inputMode="numeric" required value={car.km} onChange={(e) => update('km', e.target.value)} />
            </label>
            <label>
              Câmbio
              <input list="transmissions" required value={car.transmission} onChange={(e) => update('transmission', e.target.value)} />
              <datalist id="transmissions">
                {TRANSMISSIONS.map((t) => <option key={t} value={t} />)}
              </datalist>
            </label>
            <label>
              Combustível
              <select required value={car.fuel} onChange={(e) => update('fuel', e.target.value)}>
                {FUELS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label>
              Cor
              <input required value={car.color} onChange={(e) => update('color', e.target.value)} />
            </label>
            <label>
              Portas
              <input type="number" min="2" max="5" required value={car.doors} onChange={(e) => update('doors', e.target.value)} />
            </label>
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
            <label>
              Placa
              <input value={car.plate} onChange={(e) => update('plate', e.target.value)} placeholder="Ex: ABC1D23" />
            </label>
            <label>
              Chassi
              <input value={car.chassis} onChange={(e) => update('chassis', e.target.value)} />
            </label>
            <label>
              Renavam
              <input value={car.renavam} onChange={(e) => update('renavam', e.target.value)} />
            </label>
          </div>
        </section>

        <section className="admin-form-section">
          <h2>Preço e status</h2>

          <details className="fipe-lookup-details">
            <summary>Consultar tabela FIPE (opcional)</summary>
            <p className="admin-form-hint">
              Ajuda a ver o valor de referência FIPE do modelo. Não altera o preço até você clicar em "Usar como preço de venda".
            </p>
            <FipeLookup
              onUseValue={(value) => {
                if (value == null) return
                setNoPrice(false)
                update('price', String(value))
              }}
            />
          </details>

          <div className="admin-form-grid">
            <label>
              Preço de venda (R$)
              <input
                inputMode="numeric"
                required={!noPrice}
                disabled={noPrice}
                value={noPrice ? '' : car.price}
                onChange={(e) => update('price', e.target.value)}
                placeholder={noPrice ? 'Sem preço definido' : ''}
              />
            </label>
            <label>
              Preço "de" — opcional, mostra desconto
              <input
                inputMode="numeric"
                disabled={noPrice}
                value={noPrice ? '' : car.originalPrice || ''}
                onChange={(e) => update('originalPrice', e.target.value)}
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
                  Valor final da venda (R$)
                  <input
                    inputMode="numeric"
                    value={sale.price}
                    onChange={(e) => updateSale('price', e.target.value)}
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

        <section className="admin-form-section">
          <h2>{showPurchase ? 'Custo de aquisição' : 'Aviso de estoque'}</h2>
          {showPurchase && (
            <p className="admin-form-hint">
              {canSeeCosts
                ? 'Usado para calcular o custo total e a margem do carro (junto com os gastos cadastrados em "Ver gastos"). Não aparece no site público.'
                : 'Informe quanto a loja pagou pelo carro. Depois de cadastrar, só o administrador vê e altera esse valor.'}
            </p>
          )}
          <div className="admin-form-grid">
            {showPurchase && (
              <label>
                Preço de compra (R$)
                <input
                  inputMode="numeric"
                  value={car.purchasePrice || ''}
                  onChange={(e) => update('purchasePrice', e.target.value)}
                  placeholder="Quanto a loja pagou pelo carro"
                />
              </label>
            )}
            {showPurchase && (
              <label>
                Data da compra
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
          <h2>Descrição</h2>
          <textarea
            rows={5}
            value={car.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Texto de apresentação do carro, exibido na página de detalhe."
          />
        </section>

        <div className="admin-form-actions">
          <Link to="/admin/estoque" className="btn btn-outline">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Cadastrar carro'}
          </button>
        </div>
      </form>
      {confirmDialog}
    </div>
  )
}
