import { TriangleAlert } from 'lucide-react'
import { formatCurrency, vehicleCategoryLabel } from '../utils/carFormat.js'

function display(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (key === 'category') return vehicleCategoryLabel(value)
  return String(value)
}

// Revisão do que veio do CRLV-e, da FIPE ou da placa antes de mexer no
// cadastro: campo vazio vem marcado; campo diferente mostra os dois valores e
// fica desmarcado; o que já está igual aparece numa linha só.
export default function AutofillReview({
  title,
  note,
  rows,
  checked,
  onToggle,
  warnings = [],
  versions = null,
  saveFile = null,
  onApply,
  onCancel,
}) {
  const changes = rows.filter((r) => r.status !== 'igual')
  const same = rows.filter((r) => r.status === 'igual')
  const needsVersion = Boolean(versions?.required && !versions.choice)
  const canApply = !needsVersion && !versions?.loading && (checked.size > 0 || Boolean(versions?.value))

  return (
    <div className="autofill-review" role="region" aria-label={title}>
      <div className="autofill-review-head">
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </div>

      {warnings.map((w) => (
        <p key={w} className="autofill-warning">
          <TriangleAlert size={15} aria-hidden="true" /> {w}
        </p>
      ))}

      {versions && versions.options.length > 0 && (
        <fieldset className="autofill-versions">
          <legend>Versão na tabela FIPE</legend>
          <p className="autofill-versions-hint">
            {versions.required
              ? 'Mais de uma versão parece com o documento. Escolha a certa para continuar.'
              : 'Marcamos a mais parecida com o documento. Confira.'}
          </p>
          {versions.options.map((v) => (
            <label key={v.id} className={`autofill-version${versions.choice === v.id ? ' is-chosen' : ''}`}>
              <input type="radio" name="autofill-version" checked={versions.choice === v.id} onChange={() => versions.onChoose(v.id)} />
              <span>
                <strong>{v.name}</strong>
                {v.detail && <small>{v.detail}</small>}
              </span>
            </label>
          ))}
          <label className={`autofill-version${versions.choice === 'nenhuma' ? ' is-chosen' : ''}`}>
            <input type="radio" name="autofill-version" checked={versions.choice === 'nenhuma'} onChange={() => versions.onChoose('nenhuma')} />
            <span>
              <strong>Nenhuma destas</strong>
              <small>Aplica só os dados do documento; a versão você escolhe depois na tabela FIPE</small>
            </span>
          </label>
          {versions.loading && <p className="autofill-versions-status" role="status">Buscando o valor na FIPE…</p>}
          {versions.error && <p className="autofill-warning"><TriangleAlert size={15} aria-hidden="true" /> {versions.error}</p>}
          {versions.value && (
            <p className="autofill-versions-status" role="status">
              FIPE {versions.value.code} · <strong>{versions.value.value != null ? formatCurrency(versions.value.value) : 'sem valor'}</strong> ({versions.value.reference})
            </p>
          )}
        </fieldset>
      )}

      {changes.length > 0 ? (
        <ul className="autofill-rows">
          {changes.map((row) => (
            <li key={row.key}>
              <label className={`autofill-row is-${row.status}`}>
                <input type="checkbox" checked={checked.has(row.key)} onChange={() => onToggle(row.key)} />
                <span className="autofill-row-text">
                  <span className="autofill-row-label">{row.label}</span>
                  <span className="autofill-row-value">{display(row.key, row.value)}</span>
                  {row.status === 'diferente' && (
                    <span className="autofill-row-current">No cadastro: {display(row.key, row.current)}</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="autofill-same">Nada novo para preencher: o cadastro já tem esses dados.</p>
      )}
      {same.length > 0 && changes.length > 0 && (
        <p className="autofill-same">Já iguais no cadastro: {same.map((r) => r.label).join(', ')}.</p>
      )}

      {saveFile && (
        <label className="admin-checkbox admin-checkbox-note autofill-save-file">
          <input type="checkbox" checked={saveFile.checked} onChange={(e) => saveFile.onChange(e.target.checked)} />
          <span>
            {saveFile.label || 'Guardar o PDF nos documentos do carro'}
            <small className="admin-form-hint">Fica só no painel da equipe. O documento tem o nome e o CPF do dono.</small>
          </span>
        </label>
      )}

      <div className="autofill-buttons">
        <button type="button" className="btn btn-primary" onClick={onApply} disabled={!canApply}>
          Aplicar ao cadastro
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
      </div>
      {needsVersion && <p className="autofill-same">Escolha a versão na tabela FIPE (ou "Nenhuma destas") para aplicar.</p>}
    </div>
  )
}
