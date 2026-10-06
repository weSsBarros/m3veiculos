import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FileText, PencilLine, Trash2, Upload } from 'lucide-react'
import {
  fetchAllContractTemplates,
  uploadContractTemplate,
  deleteContractTemplate,
  updateContractTemplateKind,
} from '../lib/contractTemplatesApi.js'
import { CONTRACT_TEMPLATE_TAGS } from '../utils/contractTemplateTags.js'
import './admin.css'
import useConfirm from '../components/useConfirm.jsx'
import ContractLibrary from './ContractLibrary.jsx'

export default function AdminContractTemplates() {
  const { confirm, confirmDialog } = useConfirm()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [kind, setKind] = useState('venda')
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setTemplates(await fetchAllContractTemplates())
    } catch (err) {
      setError(err.message || 'Erro ao carregar os modelos de contrato.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function handleFileChange(e) {
    const selected = e.target.files?.[0] || null
    setFile(selected)
    if (selected && !name) {
      setName(selected.name.replace(/\.docx$/i, ''))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) {
      setError('Selecione um arquivo .docx.')
      return
    }
    setUploading(true)
    setError('')
    try {
      const created = await uploadContractTemplate(name.trim() || file.name, file, kind)
      setTemplates((prev) => [created, ...prev])
      setName('')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setError('Falha ao enviar o modelo: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleKind(template, value) {
    try {
      await updateContractTemplateKind(template.id, value)
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, kind: value } : t)))
    } catch (err) {
      setError('Não foi possível mudar: ' + err.message)
    }
  }

  async function handleDelete(template) {
    if (!(await confirm(`Excluir o modelo "${template.name}" e as versões anteriores dele? Contratos já gerados com ele continuam podendo ser baixados.`))) return
    try {
      await deleteContractTemplate(template)
      setTemplates((prev) => prev.filter((t) => t.id !== template.id))
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <Link to="/admin/contratos" className="admin-back-link">
            <ArrowLeft size={15} /> Voltar para contratos
          </Link>
          <h1>Modelos de contrato</h1>
          <p>Use os modelos prontos ou envie modelos próprios em .docx que a loja usa na hora de gerar um contrato. Depois de adicionado, o modelo pode ser editado aqui mesmo, em “Editar”.</p>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      {!loading && <ContractLibrary templates={templates} onAdded={(created) => setTemplates((prev) => [created, ...prev])} />}

      <form className="admin-form admin-form-section" onSubmit={handleSubmit}>
        <h2>Novo modelo</h2>
        <div className="admin-form-grid">
          <label>
            Nome do modelo
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Contrato com garantia" />
          </label>
          <label>
            Usado em
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="venda">Venda (tela Contratos)</option>
              <option value="entrada">Entrada do veículo (compra do particular, consignação)</option>
            </select>
          </label>
        </div>

        <label className="attachment-uploader-drop">
          <Upload size={16} />
          <span>{file ? file.name : uploading ? 'Enviando…' : 'Clique para selecionar o arquivo .docx'}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            disabled={uploading}
            hidden
          />
        </label>

        <div className="admin-form-actions">
          <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
            {uploading ? 'Enviando…' : 'Enviar modelo'}
          </button>
        </div>
      </form>

      <div className="admin-form-section">
        <h2>Marcadores disponíveis</h2>
        <p className="admin-form-hint">
          No Word, escreva os marcadores entre chaves onde quiser que o sistema preencha automaticamente, ex: <code>{'{cliente_nome}'}</code>.
          Nos modelos de entrada do veículo, os campos do cliente trazem o dono do carro (o mesmo que os de “Dono do carro”).
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Marcador</th>
                <th>Preenchido com</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACT_TEMPLATE_TAGS.map((t) => (
                <tr key={t.tag}>
                  <td><code>{`{${t.tag}}`}</code></td>
                  <td>{t.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-form-section">
        <h2>Modelos enviados</h2>
        {loading ? (
          <p className="admin-muted">Carregando…</p>
        ) : templates.length === 0 ? (
          <p className="admin-muted">Nenhum modelo enviado ainda. O sistema usa o modelo padrão até que um seja enviado.</p>
        ) : (
          <ul className="attachment-uploader-list">
            {templates.map((t) => (
              <li key={t.id}>
                <span>
                  <FileText size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
                  {t.name}
                  {t.updatedAt && <small className="admin-table-sub"> · editado em {new Date(t.updatedAt).toLocaleDateString('pt-BR')}</small>}
                </span>
                <select
                  className="template-kind-select"
                  value={t.kind}
                  onChange={(e) => handleKind(t, e.target.value)}
                  aria-label="Usado em"
                >
                  <option value="venda">Venda</option>
                  <option value="entrada">Entrada do veículo</option>
                </select>
                <Link to={`/admin/contratos/modelos/${t.id}`} className="admin-action-btn">
                  <PencilLine size={13} /> Editar
                </Link>
                <button type="button" onClick={() => handleDelete(t)} aria-label="Excluir modelo">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmDialog}
    </div>
  )
}
