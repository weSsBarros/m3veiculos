import { CATEGORIES, BRANDS, TRANSMISSIONS } from '../utils/carFormat.js'
import { MoneyInput, KmInput } from '../components/NumberInputs.jsx'

// Campos do "carro que ele procura": marca, modelo, tipo, ano mínimo, preço e km
// máximos e câmbio. Usados na aba Interesses da ficha do cliente e no Novo cliente.
// form: { brand, model, category, yearMin, priceMax, kmMax, transmission } (em branco:
// EMPTY_SEARCH de utils/customerInterests.js)

export default function InterestSearchFields({ form, onChange, idPrefix = 'crm' }) {
  const brandsId = `${idPrefix}-brands`
  return (
    <div className="admin-form-grid">
      <label>
        Marca
        <input list={brandsId} value={form.brand} onChange={(e) => onChange('brand', e.target.value)} placeholder="Ex: Toyota" />
        <datalist id={brandsId}>
          {BRANDS.map((b) => <option key={b} value={b} />)}
        </datalist>
      </label>
      <label>
        Modelo
        <input value={form.model} onChange={(e) => onChange('model', e.target.value)} placeholder="Ex: Corolla" />
      </label>
      <label>
        Categoria
        <select value={form.category} onChange={(e) => onChange('category', e.target.value)}>
          <option value="">Qualquer</option>
          {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
      </label>
      <label>
        Ano a partir de
        <input inputMode="numeric" value={form.yearMin} onChange={(e) => onChange('yearMin', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Ex: 2019" />
      </label>
      <label>
        Preço até
        <MoneyInput value={form.priceMax} onChange={(v) => onChange('priceMax', v)} placeholder="Ex: 120.000" />
      </label>
      <label>
        Km até
        <KmInput value={form.kmMax} onChange={(v) => onChange('kmMax', v)} placeholder="Ex: 60.000" />
      </label>
      <label>
        Câmbio
        <select value={form.transmission} onChange={(e) => onChange('transmission', e.target.value)}>
          <option value="">Qualquer</option>
          <option value="Manual">Manual</option>
          <option value="Automático">Automático</option>
          {TRANSMISSIONS.filter((t) => !['Manual', 'Automático'].includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
    </div>
  )
}
