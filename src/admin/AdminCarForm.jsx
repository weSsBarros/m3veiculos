import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Trash2, Receipt } from 'lucide-react'
import { fetchCarById, createCar, updateCar, deleteCar } from '../lib/carsApi.js'
import { CATEGORIES, BRANDS, TRANSMISSIONS, FUELS, CONDITIONS, CAR_STATUSES, parseLocaleNumber } from '../utils/carFormat.js'
import ImageUploader from './ImageUploader.jsx'
import CarDocumentUploader from './CarDocumentUploader.jsx'
import './admin.css'

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
}

export default function AdminCarForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [car, setCar] = useState(EMPTY_CAR)
  const [originalStatus, setOriginalStatus] = useState(null)
  const [highlightsText, setHighlightsText] = useState('')
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEditing) return
    fetchCarById(id).then((found) => {
      if (found) {
        setCar(found)
        setOriginalStatus(found.status)
        setHighlightsText(found.highlights.join('\n'))
      } else {
        setError('Carro não encontrado.')
      }
      setLoading(false)
    })
  }, [id, isEditing])

  function update(field, value) {
    setCar((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    let soldAt = car.soldAt || null
    if (car.status === 'vendido' && originalStatus !== 'vendido') {
      soldAt = new Date().toISOString()
    } else if (car.status !== 'vendido') {
      soldAt = null
    }

    const payload = {
      ...car,
      year: Number(car.year),
      km: Math.round(parseLocaleNumber(car.km) || 0),
      doors: Number(car.doors),
      price: Math.round(parseLocaleNumber(car.price) || 0),
      originalPrice: car.originalPrice ? Math.round(parseLocaleNumber(car.originalPrice) || 0) : null,
      purchasePrice: car.purchasePrice ? Math.round(parseLocaleNumber(car.purchasePrice) || 0) : null,
      purchaseDate: car.purchaseDate || null,
      soldAt,
      highlights: highlightsText.split('\n').map((h) => h.trim()).filter(Boolean),
    }

    try {
      if (isEditing) {
        await updateCar(id, payload)
      } else {
        await createCar(payload)
      }
      navigate('/admin')
    } catch (err) {
      setError('Não foi possível salvar: ' + err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Excluir "${car.brand} ${car.model}"? Essa ação não pode ser desfeita.`)) return
    setSaving(true)
    try {
      await deleteCar(id)
      navigate('/admin')
    } catch (err) {
      setError('Não foi possível excluir: ' + err.message)
      setSaving(false)
    }
  }

  if (loading) return <p className="admin-muted">Carregando…</p>

  return (
    <div className="admin-page admin-form-page">
      <Link to="/admin" className="admin-back-link">
        <ChevronLeft size={16} /> Voltar para o estoque
      </Link>

      <div className="admin-page-head">
        <h1>{isEditing ? 'Editar carro' : 'Novo carro'}</h1>
        {isEditing && (
          <div className="admin-row-actions">
            <Link to={`/admin/carros/${id}/gastos`} className="btn btn-outline">
              <Receipt size={15} /> Ver gastos
            </Link>
            <button type="button" className="btn btn-outline admin-delete-btn" onClick={handleDelete} disabled={saving}>
              <Trash2 size={15} /> Excluir
            </button>
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
              <input
                type="text"
                inputMode="decimal"
                required
                value={car.km}
                onChange={(e) => update('km', e.target.value)}
                placeholder="Ex: 45.000"
              />
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
          <div className="admin-form-grid">
            <label>
              Preço de venda (R$)
              <input
                type="text"
                inputMode="decimal"
                required
                value={car.price}
                onChange={(e) => update('price', e.target.value)}
                placeholder="Ex: 45.900"
              />
            </label>
            <label>
              Preço "de" — opcional, mostra desconto
              <input
                type="text"
                inputMode="decimal"
                value={car.originalPrice || ''}
                onChange={(e) => update('originalPrice', e.target.value)}
                placeholder="Ex: 49.900"
              />
            </label>
            <label>
              Selo/badge do anúncio
              <input value={car.badge} onChange={(e) => update('badge', e.target.value)} placeholder="Ex: Última unidade" />
            </label>
            <label>
              Status
              <select required value={car.status} onChange={(e) => update('status', e.target.value)}>
                {CAR_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

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
          <h2>Custo de aquisição</h2>
          <p className="admin-form-hint">
            Usado para calcular o custo total e a margem do carro (junto com os gastos cadastrados em "Ver gastos"). Não aparece no site público.
          </p>
          <div className="admin-form-grid">
            <label>
              Preço de compra (R$)
              <input
                type="text"
                inputMode="decimal"
                value={car.purchasePrice || ''}
                onChange={(e) => update('purchasePrice', e.target.value)}
                placeholder="Ex: 32.500"
              />
            </label>
            <label>
              Data da compra
              <input type="date" value={car.purchaseDate || ''} onChange={(e) => update('purchaseDate', e.target.value)} />
            </label>
          </div>
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

        {isEditing && (
          <section className="admin-form-section">
            <h2>Documentos do carro</h2>
            <p className="admin-form-hint">CRLV, laudo cautelar, nota fiscal etc. Ficam visíveis só para o painel admin.</p>
            <CarDocumentUploader carId={id} documents={car.documents} onChange={(documents) => update('documents', documents)} />
          </section>
        )}

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
          <Link to="/admin" className="btn btn-outline">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Cadastrar carro'}
          </button>
        </div>
      </form>
    </div>
  )
}
