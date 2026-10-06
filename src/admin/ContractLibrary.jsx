import { useState } from 'react'
import { BookOpen, Eye, EyeOff, Plus, Check } from 'lucide-react'
import { CONTRACT_LIBRARY, LIBRARY_GROUPS, libraryUrl, libraryAdded } from '../utils/contractLibrary.js'
import { CONTRACT_SAMPLE_DATA } from '../utils/contractTemplateTags.js'
import { fillContractTemplateBlob, DOCX_MIME } from '../utils/fillContractTemplate.js'
import { uploadContractTemplate } from '../lib/contractTemplatesApi.js'
import DocxPreview from '../components/DocxPreview.jsx'

async function loadLibraryFile(item) {
  const res = await fetch(libraryUrl(item))
  if (!res.ok) throw new Error('Não foi possível abrir o modelo.')
  return res.arrayBuffer()
}

// Biblioteca "Modelos prontos": a loja vê a prévia com dados de exemplo e
// adiciona o modelo à sua lista (depois ajusta no editor).
export default function ContractLibrary({ templates, onAdded }) {
  const [open, setOpen] = useState('')
  const [preview, setPreview] = useState({ blob: null, error: '', loading: false })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function togglePreview(item) {
    if (open === item.file) {
      setOpen('')
      return
    }
    setOpen(item.file)
    setPreview({ blob: null, error: '', loading: true })
    try {
      const blob = await fillContractTemplateBlob(await loadLibraryFile(item), CONTRACT_SAMPLE_DATA)
      setPreview({ blob, error: '', loading: false })
    } catch (err) {
      setPreview({ blob: null, error: err.message || 'Não foi possível montar a prévia.', loading: false })
    }
  }

  async function add(item) {
    setBusy(item.file)
    setError('')
    try {
      const file = new File([await loadLibraryFile(item)], item.file, { type: DOCX_MIME })
      onAdded(await uploadContractTemplate(item.name, file, item.kind))
    } catch (err) {
      setError(`Não foi possível adicionar "${item.name}": ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="admin-form-section contract-library">
      <h2>
        <BookOpen size={18} /> Modelos prontos
      </h2>
      <p className="admin-form-hint">
        Modelos-base escritos pela WB.Dev com base no Código Civil, no Código de Defesa do Consumidor e no Código de
        Trânsito. Veja a prévia, clique em “Usar este modelo” para colocar na lista da loja e ajuste em “Editar”. Revise
        com o advogado da loja antes de usar.
      </p>
      {error && <p className="admin-error">{error}</p>}
      {LIBRARY_GROUPS.map((group) => (
        <div key={group.id} className="contract-library-group">
          <h3>{group.label}</h3>
          <ul>
            {CONTRACT_LIBRARY.filter((item) => item.group === group.id).map((item) => {
              const added = libraryAdded(item, templates)
              return (
                <li key={item.file}>
                  <div className="contract-library-item">
                    <div>
                      <strong>{item.name}</strong>
                      <span className="admin-table-sub">
                        {item.kind === 'entrada' ? 'Usado no cadastro do carro (entrada)' : 'Usado na tela Contratos (venda)'}
                      </span>
                      <p>{item.description}</p>
                    </div>
                    <div className="admin-row-actions">
                      <button type="button" className="admin-action-btn" onClick={() => togglePreview(item)}>
                        {open === item.file ? <EyeOff size={14} /> : <Eye size={14} />} {open === item.file ? 'Fechar prévia' : 'Prévia'}
                      </button>
                      {added ? (
                        <span className="admin-pill is-success">
                          <Check size={12} /> Na lista da loja
                        </span>
                      ) : (
                        <button type="button" className="btn btn-primary" onClick={() => add(item)} disabled={busy === item.file}>
                          <Plus size={14} /> {busy === item.file ? 'Adicionando…' : 'Usar este modelo'}
                        </button>
                      )}
                    </div>
                  </div>
                  {open === item.file && <DocxPreview blob={preview.blob} error={preview.error} loading={preview.loading} />}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
