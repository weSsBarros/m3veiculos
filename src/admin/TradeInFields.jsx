export const EMPTY_TRADE_IN = {
  enabled: false,
  brand: '',
  model: '',
  version: '',
  year: '',
  modelYear: '',
  km: '',
  color: '',
  plate: '',
  value: '',
}

// Carro recebido na troca: o valor abate da venda e o carro entra no
// estoque "em manutenção" e oculto do site, para completar o cadastro depois.
export default function TradeInFields({ value, onChange, disabled }) {
  function update(field, val) {
    onChange({ ...value, [field]: val })
  }

  return (
    <div className="trade-in-fields">
      <label className="admin-checkbox">
        <input type="checkbox" checked={value.enabled} onChange={(e) => update('enabled', e.target.checked)} disabled={disabled} />
        Recebeu um carro na troca
      </label>
      {value.enabled && (
        <>
          <div className="admin-form-grid">
            <label>
              Marca
              <input value={value.brand} onChange={(e) => update('brand', e.target.value)} disabled={disabled} />
            </label>
            <label>
              Modelo
              <input value={value.model} onChange={(e) => update('model', e.target.value)} disabled={disabled} />
            </label>
            <label>
              Versão
              <input value={value.version} onChange={(e) => update('version', e.target.value)} disabled={disabled} />
            </label>
            <label>
              Ano de fabricação
              <input inputMode="numeric" value={value.year} onChange={(e) => update('year', e.target.value.replace(/\D/g, '').slice(0, 4))} disabled={disabled} />
            </label>
            <label>
              Ano/Modelo
              <input value={value.modelYear} onChange={(e) => update('modelYear', e.target.value)} placeholder="Ex: 2019/2020" disabled={disabled} />
            </label>
            <label>
              Quilometragem
              <input inputMode="numeric" value={value.km} onChange={(e) => update('km', e.target.value)} disabled={disabled} />
            </label>
            <label>
              Cor
              <input value={value.color} onChange={(e) => update('color', e.target.value)} disabled={disabled} />
            </label>
            <label>
              Placa
              <input value={value.plate} onChange={(e) => update('plate', e.target.value)} placeholder="Ex: ABC1D23" disabled={disabled} />
            </label>
            <label>
              Valor da troca (R$)
              <input inputMode="numeric" value={value.value} onChange={(e) => update('value', e.target.value)} placeholder="Quanto abate da venda" disabled={disabled} />
            </label>
          </div>
          <span className="sale-dialog-note">
            O carro entra no estoque "em manutenção" e oculto do site, com o valor da troca como custo de compra. Complete o
            cadastro (fotos, preço, documentos) em Estoque.
          </span>
        </>
      )}
    </div>
  )
}
