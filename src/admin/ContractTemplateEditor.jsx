import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Bold, Italic, Underline, Tags, CornerDownLeft, Trash2, Check, Save, Eye, PencilLine, Download,
  RotateCcw, Lock, TriangleAlert, Undo2, X,
} from 'lucide-react'
import {
  fetchContractTemplate,
  downloadContractTemplateFile,
  fetchContractTemplateVersions,
  saveContractTemplateFile,
  restoreContractTemplateVersion,
} from '../lib/contractTemplatesApi.js'
import {
  readTemplate, buildDocumentXml, checkTemplate, segmentsEqual, tagLabel, blankLine, isKnownTag, TAG_GROUPS,
} from '../utils/docxTemplateModel.js'
import { CONTRACT_TEMPLATE_TAGS, CONTRACT_SAMPLE_DATA, CONTRACT_EMPTY_DATA } from '../utils/contractTemplateTags.js'
import {
  readDocumentXml, replaceDocumentXml, fillContractTemplateBlob, downloadBlob, DOCX_MIME,
} from '../utils/fillContractTemplate.js'
import { slugify } from '../utils/carFormat.js'
import {
  segmentsToHtml, domToSegments, chipHtml, chipClass, insertAtCaret, splitAtCaret, placeCaret, isEmptyEditor,
} from './contractTemplateDom.js'
import DocxPreview from '../components/DocxPreview.jsx'
import useConfirm from '../components/useConfirm.jsx'
import './admin.css'

function formatDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

function fallbackMode(tag) {
  if (!tag.fallback) return 'nada'
  return /^_+$/.test(tag.fallback.trim()) ? 'linha' : 'texto'
}

// Editor de um modelo de contrato já enviado (Contratos → Modelos → Editar).
// Clique num parágrafo para editar: texto, negrito/itálico/sublinhado,
// marcadores, parágrafo novo (Enter) e apagar. Ao salvar, o arquivo novo vai
// para o Storage e o anterior fica nas versões. Logo, tabelas e cabeçalho
// ficam como estão no Word.
export default function ContractTemplateEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { confirm, confirmDialog } = useConfirm()
  const [template, setTemplate] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [model, setModel] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [chip, setChip] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [blankIfEmpty, setBlankIfEmpty] = useState(true)
  const [view, setView] = useState('editar')
  const [previewData, setPreviewData] = useState('exemplo')
  const [preview, setPreview] = useState({ blob: null, error: '', loading: false })
  const editorRef = useRef(null)
  const rangeRef = useRef(null)
  const newKey = useRef(0)

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const found = await fetchContractTemplate(id)
      if (!found) {
        setError('Modelo não encontrado.')
        return
      }
      const buf = await downloadContractTemplateFile(found.filePath)
      const parsed = readTemplate(await readDocumentXml(buf))
      setTemplate(found)
      setBuffer(buf)
      setModel(parsed)
      setBlocks(parsed.blocks)
      setDirty(false)
      setEditing(null)
      setChip(null)
      setVersions(await fetchContractTemplateVersions(found.id))
    } catch (err) {
      setError('Não foi possível abrir o modelo: ' + (err.message || err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Aviso do navegador ao sair com alterações sem salvar
  useEffect(() => {
    if (!dirty) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Ao abrir um parágrafo: foco e cursor onde clicou
  useEffect(() => {
    if (!editing || !editorRef.current) return
    editorRef.current.focus()
    placeCaret(editorRef.current, editing.point, editing.atStart)
    rangeRef.current = null
  }, [editing?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Marcador selecionado fica destacado
  useEffect(() => {
    const el = chip?.el
    if (!el) return
    el.classList.add('is-selected')
    return () => el.classList.remove('is-selected')
  }, [chip])

  const check = useMemo(() => checkTemplate(blocks), [blocks])
  const visible = blocks.filter((b) => !b.deleted)

  function baseCtx(block) {
    const style = model?.styles[block.base]
    return { s: block.base, b: style?.b || false, i: style?.i || false, u: style?.u || false }
  }

  // Lê o parágrafo que está aberto e guarda nos blocos (devolve a lista nova)
  function commitEdit(list = blocks) {
    if (!editing || !editorRef.current) return list
    const block = list.find((b) => b.key === editing.key)
    let next = list
    if (block) {
      const segments = domToSegments(editorRef.current, baseCtx(block))
      if (!segmentsEqual(segments, block.segments)) {
        next = list.map((b) => (b.key === block.key ? { ...b, segments, changed: true } : b))
        setDirty(true)
      }
    }
    setBlocks(next)
    setEditing(null)
    setChip(null)
    setPickerOpen(false)
    return next
  }

  function startEdit(block, point) {
    if (block.readonly || view !== 'editar') return
    if (editing?.key === block.key) return
    const list = commitEdit()
    const current = list.find((b) => b.key === block.key)
    setEditing({ key: block.key, html: segmentsToHtml(current.segments), point })
  }

  function saveRange() {
    const sel = window.getSelection()
    if (sel.rangeCount && editorRef.current?.contains(sel.anchorNode)) rangeRef.current = sel.getRangeAt(0).cloneRange()
  }

  function format(command) {
    document.execCommand(command)
    saveRange()
  }

  function newBlockAfter(list, afterKey, segments) {
    const source = list.find((b) => b.key === afterKey)
    newKey.current += 1
    const created = {
      key: `n${newKey.current}`,
      index: null,
      pPrFrom: source.index ?? source.pPrFrom,
      inTable: false,
      tableStart: false,
      readonly: '',
      align: source.align,
      base: source.base,
      segments,
      changed: true,
    }
    const next = []
    for (const b of list) {
      next.push(b)
      if (b.key === afterKey) next.push(created)
    }
    return { next, created }
  }

  function splitParagraph() {
    const root = editorRef.current
    const block = blocks.find((b) => b.key === editing.key)
    const tail = splitAtCaret(root)
    if (!tail) return
    const ctx = baseCtx(block)
    const head = domToSegments(root, ctx)
    const rest = domToSegments(tail, ctx)
    const updated = blocks.map((b) => (b.key === block.key ? { ...b, segments: head, changed: b.changed || !segmentsEqual(head, b.segments) } : b))
    const { next, created } = newBlockAfter(updated, block.key, rest)
    setBlocks(next)
    setDirty(true)
    setChip(null)
    setPickerOpen(false)
    setEditing({ key: created.key, html: segmentsToHtml(rest), point: null, atStart: true })
  }

  function addParagraphBelow() {
    if (!editing) return
    const key = editing.key
    const list = commitEdit()
    const { next, created } = newBlockAfter(list, key, [])
    setBlocks(next)
    setDirty(true)
    setEditing({ key: created.key, html: '', point: null })
  }

  async function deleteParagraph() {
    if (!editing) return
    const block = blocks.find((b) => b.key === editing.key)
    if (!block || block.inTable) return
    if (editorRef.current?.querySelector('[data-kind="obj"]')) {
      const ok = await confirm('Este parágrafo tem uma imagem ou quebra de página. Apagar mesmo assim?', { confirmLabel: 'Apagar' })
      if (!ok) return
    }
    const shown = blocks.filter((b) => !b.deleted)
    const pos = shown.findIndex((b) => b.key === block.key)
    const previous = shown.slice(0, pos).reverse().find((b) => !b.readonly && !b.inTable)
    const next = block.index == null ? blocks.filter((b) => b.key !== block.key) : blocks.map((b) => (b.key === block.key ? { ...b, deleted: true } : b))
    setBlocks(next)
    setDirty(true)
    setChip(null)
    setPickerOpen(false)
    setEditing(previous ? { key: previous.key, html: segmentsToHtml(previous.segments), point: null } : null)
  }

  function handleKeyDown(e) {
    const block = blocks.find((b) => b.key === editing?.key)
    if (!block) return
    if (e.key === 'Escape') {
      e.preventDefault()
      commitEdit()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey || block.inTable) document.execCommand('insertLineBreak')
      else splitParagraph()
      return
    }
    if (e.key === 'Backspace' && !block.inTable && isEmptyEditor(editorRef.current)) {
      e.preventDefault()
      deleteParagraph()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (text) document.execCommand('insertText', false, text.replace(/\r\n?/g, '\n'))
  }

  function handleEditorClick(e) {
    const el = e.target.closest?.('.tpl-chip')
    if (el && editorRef.current?.contains(el)) {
      setChip({ el, tag: JSON.parse(el.getAttribute('data-tag')) })
      setPickerOpen(false)
    } else setChip(null)
    saveRange()
  }

  function insertTag(name) {
    const root = editorRef.current
    if (!root) return
    const holder = document.createElement('span')
    holder.innerHTML = chipHtml({ kind: 'field', name, fallback: blankIfEmpty ? blankLine(name) : null })
    rangeRef.current = insertAtCaret(root, holder.firstChild, rangeRef.current)
    root.focus()
    setPickerOpen(false)
  }

  function updateChip(tag) {
    if (!chip) return
    chip.el.setAttribute('data-tag', JSON.stringify(tag))
    chip.el.textContent = tagLabel(tag)
    chip.el.className = chipClass(tag)
    setChip({ el: chip.el, tag })
  }

  function removeChip() {
    if (!chip) return
    const wrapper = chip.el.parentElement
    chip.el.remove()
    if (wrapper && wrapper !== editorRef.current && !wrapper.textContent && !wrapper.querySelector('[data-kind]')) wrapper.remove()
    setChip(null)
    editorRef.current?.focus()
  }

  async function buildCurrent(list) {
    return replaceDocumentXml(buffer, buildDocumentXml(model, list))
  }

  // Prévia: o modelo como está agora (mesmo sem salvar), preenchido
  useEffect(() => {
    if (view !== 'previa' || !model || !buffer) return
    let cancelled = false
    setPreview((p) => ({ ...p, loading: true, error: '' }))
    buildCurrent(blocks)
      .then((out) => fillContractTemplateBlob(out, previewData === 'vazio' ? CONTRACT_EMPTY_DATA : CONTRACT_SAMPLE_DATA))
      .then((blob) => {
        if (!cancelled) setPreview({ blob, error: '', loading: false })
      })
      .catch((err) => {
        if (!cancelled) setPreview({ blob: null, error: 'O modelo tem um erro: ' + (err.message || err), loading: false })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, previewData, blocks, model, buffer])

  function showView(next) {
    if (next === 'previa') commitEdit()
    setView(next)
  }

  async function handleSave() {
    const list = commitEdit()
    const result = checkTemplate(list)
    if (result.errors.length) {
      setError(result.errors.join(' '))
      return
    }
    if (result.unknown.length) {
      const ok = await confirm(
        `Estes marcadores o sistema não conhece e vão sair vazios no contrato: ${result.unknown.join(', ')}. Salvar mesmo assim?`,
        { confirmLabel: 'Salvar' }
      )
      if (!ok) return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const out = await buildCurrent(list)
      await fillContractTemplateBlob(out.slice(0), CONTRACT_SAMPLE_DATA)
      await saveContractTemplateFile(template, out)
      await load({ quiet: true })
      setNotice('Modelo salvo. A versão anterior ficou guardada em “Versões anteriores”.')
    } catch (err) {
      setError('Não foi possível salvar: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDiscard() {
    if (!(await confirm('Descartar as alterações e voltar ao modelo salvo?', { confirmLabel: 'Descartar' }))) return
    setNotice('')
    await load({ quiet: true })
  }

  async function downloadFile(filePath, suffix) {
    try {
      const buf = await downloadContractTemplateFile(filePath)
      downloadBlob(new Blob([buf], { type: DOCX_MIME }), `${slugify(template.name) || 'modelo'}${suffix}.docx`)
    } catch (err) {
      setError('Não foi possível baixar: ' + (err.message || err))
    }
  }

  async function handleRestore(version) {
    const ask = dirty
      ? 'As alterações sem salvar serão perdidas. Voltar para esta versão? A versão atual fica guardada nas versões anteriores.'
      : 'Voltar para esta versão? A versão atual fica guardada nas versões anteriores.'
    if (!(await confirm(ask, { confirmLabel: 'Restaurar' }))) return
    try {
      await restoreContractTemplateVersion(version.id)
      await load({ quiet: true })
      setNotice('Versão restaurada.')
    } catch (err) {
      setError('Não foi possível restaurar: ' + (err.message || err))
    }
  }

  async function handleBack(e) {
    if (!dirty) return
    e.preventDefault()
    if (await confirm('Sair sem salvar as alterações?', { confirmLabel: 'Sair sem salvar' })) navigate('/admin/contratos/modelos')
  }

  if (loading) return <div className="admin-page"><p className="admin-muted">Carregando o modelo…</p></div>
  if (!template || !model) {
    return (
      <div className="admin-page">
        <Link to="/admin/contratos/modelos" className="admin-back-link"><ArrowLeft size={15} /> Voltar para os modelos</Link>
        {error && <p className="admin-error">{error}</p>}
      </div>
    )
  }

  const editingBlock = blocks.find((b) => b.key === editing?.key)
  const keep = (e) => e.preventDefault()

  // Ferramentas que aparecem em cima do parágrafo aberto
  const inlineTools = (
    <div className="tpl-inline-tools">
      <button type="button" title="Negrito (Ctrl+B)" onMouseDown={keep} onClick={() => format('bold')}><Bold size={15} /></button>
      <button type="button" title="Itálico (Ctrl+I)" onMouseDown={keep} onClick={() => format('italic')}><Italic size={15} /></button>
      <button type="button" title="Sublinhado (Ctrl+U)" onMouseDown={keep} onClick={() => format('underline')}><Underline size={15} /></button>
      <button type="button" className={pickerOpen ? 'is-active' : ''} onMouseDown={keep} onClick={() => { setPickerOpen((v) => !v); setChip(null) }}>
        <Tags size={15} /> Marcador
      </button>
      {!editingBlock?.inTable && (
        <>
          <button type="button" title="Novo parágrafo abaixo (Enter)" onMouseDown={keep} onClick={addParagraphBelow}>
            <CornerDownLeft size={15} /> Parágrafo
          </button>
          <button type="button" title="Apagar este parágrafo" onMouseDown={keep} onClick={deleteParagraph}>
            <Trash2 size={15} /> Apagar
          </button>
        </>
      )}
      <button type="button" title="Fechar o parágrafo (Esc)" onMouseDown={keep} onClick={() => commitEdit()}>
        <Check size={15} /> Concluir
      </button>
    </div>
  )

  const pickerPanel = pickerOpen && (
    <div className="tpl-picker">
      <div className="tpl-picker-head">
        <strong>Inserir marcador no cursor</strong>
        <button type="button" className={`tpl-toggle${blankIfEmpty ? ' is-on' : ''}`} onMouseDown={keep} onClick={() => setBlankIfEmpty((v) => !v)}>
          {blankIfEmpty ? '☑' : '☐'} Se o campo estiver vazio, deixar linha em branco
        </button>
        <button type="button" className="tpl-icon-btn" onMouseDown={keep} onClick={() => setPickerOpen(false)} aria-label="Fechar"><X size={15} /></button>
      </div>
      {TAG_GROUPS.map((group) => (
        <div key={group.label} className="tpl-picker-group">
          <span>{group.label}</span>
          <div>
            {group.tags.map((t) => (
              <button key={t.tag} type="button" onMouseDown={keep} onClick={() => insertTag(t.tag)}>{t.label}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  const chipPanel = chip && (
    <div className="tpl-chip-panel">
      {chip.tag.kind === 'field' ? (
        <>
          <label>
            Campo
            <select
              value={chip.tag.name}
              onChange={(e) => {
                const name = e.target.value
                const fallback = fallbackMode(chip.tag) === 'linha' ? blankLine(name) : chip.tag.fallback
                updateChip({ ...chip.tag, name, fallback })
              }}
            >
              {!isKnownTag(chip.tag.name) && <option value={chip.tag.name}>{chip.tag.name} (desconhecido)</option>}
              {CONTRACT_TEMPLATE_TAGS.map((t) => (
                <option key={t.tag} value={t.tag}>{t.label}</option>
              ))}
            </select>
          </label>
          <label>
            Se o campo estiver vazio
            <select
              value={fallbackMode(chip.tag)}
              onChange={(e) => {
                const mode = e.target.value
                const fallback = mode === 'nada' ? null : mode === 'linha' ? blankLine(chip.tag.name) : chip.tag.fallback && fallbackMode(chip.tag) === 'texto' ? chip.tag.fallback : 'não informado'
                updateChip({ ...chip.tag, fallback })
              }}
            >
              <option value="nada">não mostrar nada</option>
              <option value="linha">linha em branco para preencher à mão</option>
              <option value="texto">um texto fixo</option>
            </select>
          </label>
          {fallbackMode(chip.tag) === 'texto' && (
            <label>
              Texto
              <input value={chip.tag.fallback || ''} onChange={(e) => updateChip({ ...chip.tag, fallback: e.target.value || null })} />
            </label>
          )}
        </>
      ) : (
        <p className="tpl-chip-help">
          Início ou fim de um bloco que só aparece {chip.tag.kind === 'inverse' ? 'quando o campo está vazio' : 'quando o campo está preenchido'}.
          Se apagar o início, apague o fim também (e vice-versa).
        </p>
      )}
      <button type="button" className="btn btn-outline" onClick={removeChip}><Trash2 size={15} /> Remover marcador</button>
    </div>
  )

  return (
    <div className="admin-page tpl-editor-page">
      <div className="admin-page-head">
        <div>
          <Link to="/admin/contratos/modelos" className="admin-back-link" onClick={handleBack}>
            <ArrowLeft size={15} /> Voltar para os modelos
          </Link>
          <h1>{template.name}</h1>
          <p>
            Clique num parágrafo para editar. Logo, tabelas e cabeçalho ficam como estão no Word.
            {template.updatedAt && ` Última edição: ${formatDateTime(template.updatedAt)}.`}
          </p>
        </div>
        <div className="admin-row-actions">
          <button type="button" className="btn btn-outline" onClick={() => downloadFile(template.filePath, '')}>
            <Download size={15} /> Baixar .docx
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {notice && <p className="admin-success">{notice}</p>}

      <div className="tpl-toolbar">
        <div className="tpl-view-switch" role="tablist">
          <button type="button" className={view === 'editar' ? 'is-active' : ''} onClick={() => showView('editar')}>
            <PencilLine size={15} /> Editar
          </button>
          <button type="button" className={view === 'previa' ? 'is-active' : ''} onClick={() => showView('previa')}>
            <Eye size={15} /> Prévia
          </button>
        </div>
        {view === 'previa' && (
          <label className="tpl-preview-data">
            Prévia com
            <select value={previewData} onChange={(e) => setPreviewData(e.target.value)}>
              <option value="exemplo">dados de exemplo</option>
              <option value="vazio">campos vazios</option>
            </select>
          </label>
        )}
        <div className="tpl-save">
          {dirty && (
            <button type="button" className="btn btn-outline" onClick={handleDiscard} disabled={saving}>
              <Undo2 size={15} /> Descartar
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || (!dirty && !editing)}>
            <Save size={15} /> {saving ? 'Salvando…' : 'Salvar modelo'}
          </button>
        </div>
      </div>

      {(check.errors.length > 0 || check.unknown.length > 0) && (
        <div className="tpl-check">
          <TriangleAlert size={16} />
          <div>
            {check.errors.map((msg) => <p key={msg}>{msg}</p>)}
            {check.unknown.length > 0 && (
              <p>Marcadores que o sistema não conhece (saem vazios): {check.unknown.map((n) => `{${n}}`).join(', ')}. Clique neles para trocar o campo.</p>
            )}
          </div>
        </div>
      )}

      {view === 'editar' ? (
        <div className="tpl-doc">
          {visible.map((block) => {
            const isEditing = editing?.key === block.key
            const cls = ['tpl-par', block.inTable && 'is-table', block.readonly && 'is-readonly', isEditing && 'is-editing', block.changed && 'is-changed']
              .filter(Boolean)
              .join(' ')
            const style = { textAlign: block.align || undefined }
            return (
              <div key={block.key} className="tpl-par-row">
                {block.tableStart && <span className="tpl-table-label">Tabela</span>}
                {block.readonly && <Lock size={12} className="tpl-lock" aria-label="Só no Word" />}
                {isEditing && inlineTools}
                {isEditing ? (
                  <div
                    ref={editorRef}
                    className={cls}
                    style={style}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck
                    dangerouslySetInnerHTML={{ __html: editing.html }}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onClick={handleEditorClick}
                    onKeyUp={saveRange}
                    onInput={saveRange}
                    onMouseUp={saveRange}
                    onBlur={saveRange}
                  />
                ) : (
                  <div
                    className={cls}
                    style={style}
                    title={block.readonly ? `Este trecho só muda pelo Word (${block.readonly}).` : undefined}
                    onClick={(e) => startEdit(block, { x: e.clientX, y: e.clientY })}
                    dangerouslySetInnerHTML={{ __html: segmentsToHtml(block.segments) }}
                  />
                )}
                {isEditing && pickerPanel}
                {isEditing && chipPanel}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="admin-form-section">
          <DocxPreview blob={preview.blob} error={preview.error} loading={preview.loading} />
        </div>
      )}

      <section className="admin-form-section">
        <h2>Versões anteriores</h2>
        {versions.length === 0 ? (
          <p className="admin-muted">Nenhuma ainda. Cada vez que você salva, a versão anterior fica guardada aqui.</p>
        ) : (
          <ul className="doc-list">
            {versions.map((v) => (
              <li key={v.id}>
                <div className="doc-list-main">
                  <strong>Versão usada até {formatDateTime(v.createdAt)}</strong>
                </div>
                <div className="doc-list-actions">
                  <button type="button" className="admin-action-btn" onClick={() => downloadFile(v.filePath, '-versao-anterior')}>
                    <Download size={14} /> Baixar
                  </button>
                  <button type="button" className="admin-action-btn" onClick={() => handleRestore(v)}>
                    <RotateCcw size={14} /> Restaurar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {view === 'editar' && (dirty || editing) && (
        <button type="button" className="btn btn-primary tpl-float-save" onClick={handleSave} disabled={saving}>
          <Save size={15} /> {saving ? 'Salvando…' : 'Salvar modelo'}
        </button>
      )}
      {confirmDialog}
    </div>
  )
}
