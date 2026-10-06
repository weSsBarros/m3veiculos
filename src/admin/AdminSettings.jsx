import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  RefreshCcw,
  LayoutDashboard,
  MessageCircle,
  MessageSquareText,
  Car,
  Handshake,
  Wallet,
  ArrowUp,
  ArrowDown,
  Pause,
  Play,
  Trash2,
  Plus,
  RotateCcw,
  Eye,
  Landmark,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  fetchStoreSettings,
  saveStoreSettings,
  fetchRotation,
  createRotationEntry,
  updateRotationEntry,
  deleteRotationEntry,
  fetchMyDismissals,
  restoreDismissals,
} from '../lib/storeSettingsApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import CustomRolesSettings from './CustomRolesSettings.jsx'
import FiscalSettings from './FiscalSettings.jsx'
import { applyStockAlertToAll, fetchCompanySettings, DEFAULT_STOCK_ALERT_DAYS } from '../lib/companyApi.js'
import {
  PANEL_TABS,
  DASHBOARD_BLOCKS,
  PENDENCY_LABELS,
  normalizePanelSettings,
  toggleHiddenTab,
  toggleHiddenBlock,
} from '../utils/panelSettings.js'
import { DEFAULT_TEMPLATES, TEMPLATE_FIELDS, fillTemplate } from '../utils/messageTemplates.js'
import { sortRotation, entryName, entryPhone, entryProblem, nextRotationEntry, formatWaPhone, waDigits } from '../utils/whatsappRotation.js'
import { maskPhoneBR, maskKeepingCaret } from '../utils/masks.js'
import { formatDateBR } from '../utils/carFormat.js'
import ChecklistSettingsDialog from './ChecklistSettingsDialog.jsx'
import LateFeeSettingsDialog from './LateFeeSettingsDialog.jsx'
import useConfirm from '../components/useConfirm.jsx'
import './admin.css'

const SAMPLE = { nome: 'Maria', carro: 'Toyota Corolla XEi 2022', link: 'https://site-da-loja/carro/toyota-corolla', vendedor: 'João', loja: 'sua loja' }

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="admin-form-section settings-section">
      <div className="settings-section-head">
        <Icon size={20} />
        <div>
          <h2>{title}</h2>
          {description && <p className="admin-form-hint">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

// Configurações da loja (só admin): painel personalizável, WhatsApp do site
// (número fixo ou rodízio), mensagens prontas e as opções de estoque, vendas e
// financeiro que antes ficavam espalhadas.
export default function AdminSettings() {
  const { confirm, confirmDialog } = useConfirm()
  const { setPanelSettings, planTabs } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [store, setStore] = useState(null)
  const [company, setCompany] = useState(null)
  const [sellers, setSellers] = useState([])
  const [rotation, setRotation] = useState([])
  const [dismissals, setDismissals] = useState({})

  // Rascunhos de cada seção (salvas separadamente)
  const [panel, setPanel] = useState(normalizePanelSettings(null))
  const [panelMsg, setPanelMsg] = useState('')
  const [wa, setWa] = useState({ mode: 'fixo', main: '', stickyDays: '30' })
  const [waMsg, setWaMsg] = useState('')
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES)
  const [templatesMsg, setTemplatesMsg] = useState('')
  const [saving, setSaving] = useState('')
  const [newSellerId, setNewSellerId] = useState('')
  const [newExtra, setNewExtra] = useState({ name: '', phone: '' })
  const [rotationBusy, setRotationBusy] = useState(false)
  const [alertDays, setAlertDays] = useState('')
  const [alertMsg, setAlertMsg] = useState('')
  const [listDialog, setListDialog] = useState(null)
  const [lateFeeOpen, setLateFeeOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [storeData, companyData, sellersData, rotationData, dismissalsData] = await Promise.all([
        fetchStoreSettings(),
        fetchCompanySettings(),
        fetchSellers().catch(() => []),
        fetchRotation().catch(() => []),
        fetchMyDismissals(),
      ])
      setStore(storeData)
      setCompany(companyData)
      setSellers(sellersData)
      setRotation(rotationData)
      setDismissals(dismissalsData)
      setPanel(storeData.panel)
      setWa({ mode: storeData.whatsappMode, main: storeData.whatsappMain ? formatWaPhone(storeData.whatsappMain) : '', stickyDays: String(storeData.whatsappStickyDays) })
      setTemplates(storeData.templates)
      setAlertDays(String(companyData.stockAlertDays || DEFAULT_STOCK_ALERT_DAYS))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as configurações.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sellersById = useMemo(() => Object.fromEntries(sellers.map((s) => [s.id, s])), [sellers])
  const sortedRotation = useMemo(() => sortRotation(rotation), [rotation])
  const nextEntry = useMemo(
    () => nextRotationEntry(rotation, store?.whatsappLastEntry, sellersById),
    [rotation, store, sellersById]
  )
  const teamOptions = sellers.filter((s) => !s.deletedAt && !rotation.some((r) => r.sellerId === s.id))

  // -- Painel ----------------------------------------------------------------------
  async function savePanel() {
    setSaving('panel')
    setPanelMsg('')
    try {
      await saveStoreSettings({ panel })
      setPanelSettings(panel)
      setPanelMsg('Painel salvo. O menu já foi atualizado.')
    } catch (err) {
      setPanelMsg('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving('')
    }
  }

  async function restoreAll() {
    try {
      await restoreDismissals()
      setDismissals({})
    } catch (err) {
      setPanelMsg('Não foi possível mostrar os avisos de novo: ' + err.message)
    }
  }

  // -- WhatsApp ----------------------------------------------------------------------
  async function saveWhatsapp(e) {
    e.preventDefault()
    const days = Number.parseInt(wa.stickyDays, 10)
    if (!Number.isFinite(days) || days < 0 || days > 365) {
      setWaMsg('Informe de 0 a 365 dias.')
      return
    }
    if (wa.main && !waDigits(wa.main)) {
      setWaMsg('O número principal precisa ter DDD + número.')
      return
    }
    setSaving('wa')
    setWaMsg('')
    try {
      await saveStoreSettings({ whatsappMode: wa.mode, whatsappMain: waDigits(wa.main), whatsappStickyDays: days })
      setStore((prev) => ({ ...prev, whatsappMode: wa.mode, whatsappMain: waDigits(wa.main), whatsappStickyDays: days }))
      setWaMsg('WhatsApp salvo. O site já usa a nova configuração.')
    } catch (err) {
      setWaMsg('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving('')
    }
  }

  async function addTeamMember() {
    if (!newSellerId) return
    setRotationBusy(true)
    setWaMsg('')
    try {
      const position = rotation.reduce((max, r) => Math.max(max, r.position), 0) + 1
      const created = await createRotationEntry({ sellerId: newSellerId, position })
      setRotation((prev) => [...prev, created])
      setNewSellerId('')
    } catch (err) {
      setWaMsg('Não foi possível adicionar: ' + err.message)
    } finally {
      setRotationBusy(false)
    }
  }

  async function addExtraNumber(e) {
    e.preventDefault()
    if (!newExtra.name.trim() || !waDigits(newExtra.phone)) {
      setWaMsg('Informe o nome e o número com DDD.')
      return
    }
    setRotationBusy(true)
    setWaMsg('')
    try {
      const position = rotation.reduce((max, r) => Math.max(max, r.position), 0) + 1
      const created = await createRotationEntry({ name: newExtra.name.trim(), phone: waDigits(newExtra.phone), position })
      setRotation((prev) => [...prev, created])
      setNewExtra({ name: '', phone: '' })
    } catch (err) {
      setWaMsg('Não foi possível adicionar: ' + err.message)
    } finally {
      setRotationBusy(false)
    }
  }

  async function toggleEntry(entry) {
    setRotationBusy(true)
    try {
      const updated = await updateRotationEntry(entry.id, { active: !entry.active })
      setRotation((prev) => prev.map((r) => (r.id === entry.id ? updated : r)))
    } catch (err) {
      setWaMsg('Não foi possível alterar: ' + err.message)
    } finally {
      setRotationBusy(false)
    }
  }

  async function removeEntry(entry) {
    if (!(await confirm(`Tirar ${entryName(entry, sellersById)} do rodízio?`))) return
    setRotationBusy(true)
    try {
      await deleteRotationEntry(entry.id)
      setRotation((prev) => prev.filter((r) => r.id !== entry.id))
    } catch (err) {
      setWaMsg('Não foi possível remover: ' + err.message)
    } finally {
      setRotationBusy(false)
    }
  }

  // Sobe ou desce na ordem: renumera a lista (1, 2, 3...) e grava só o que mudou
  async function move(index, dir) {
    const list = [...sortedRotation]
    const target = index + dir
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    const changes = list.map((entry, i) => ({ entry, position: i + 1 })).filter(({ entry, position }) => entry.position !== position)
    setRotationBusy(true)
    try {
      const updated = await Promise.all(changes.map(({ entry, position }) => updateRotationEntry(entry.id, { position })))
      setRotation((prev) => prev.map((r) => updated.find((u) => u.id === r.id) || r))
    } catch (err) {
      setWaMsg('Não foi possível mudar a ordem: ' + err.message)
    } finally {
      setRotationBusy(false)
    }
  }

  // -- Mensagens prontas -------------------------------------------------------------
  function updateTemplate(index, field, value) {
    setTemplates((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)))
  }

  async function saveTemplates() {
    const clean = templates.filter((t) => t.name.trim() && t.text.trim())
    if (!clean.length) {
      setTemplatesMsg('Deixe pelo menos um modelo com nome e texto.')
      return
    }
    setSaving('templates')
    setTemplatesMsg('')
    try {
      await saveStoreSettings({ templates: clean.map((t, i) => ({ id: t.id || `modelo-${i + 1}`, name: t.name.trim(), text: t.text })) })
      setTemplates(clean)
      setTemplatesMsg('Mensagens salvas.')
    } catch (err) {
      setTemplatesMsg('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving('')
    }
  }

  // -- Estoque -------------------------------------------------------------------------
  async function applyAlert(e) {
    e.preventDefault()
    const days = Number.parseInt(alertDays, 10)
    if (!Number.isFinite(days) || days < 1) {
      setAlertMsg('Informe um número de dias maior que zero.')
      return
    }
    if (!(await confirm(`Aplicar ${days} dias a todos os carros? Os prazos definidos carro a carro serão substituídos.`))) return
    setSaving('alert')
    setAlertMsg('')
    try {
      await applyStockAlertToAll(days)
      setCompany((prev) => ({ ...prev, stockAlertDays: days }))
      setAlertMsg(`Aviso de estoque: ${days} dias para todos os carros.`)
    } catch (err) {
      setAlertMsg('Não foi possível aplicar: ' + err.message)
    } finally {
      setSaving('')
    }
  }

  const LIST_ITEMS = { intake: 'intakeChecklist', inspection: 'inspectionChecklist', sale: 'saleChecklist', banks: 'bankList' }

  if (loading) return <p className="admin-muted">Carregando…</p>

  const dismissedKeys = Object.keys(dismissals)

  return (
    <div className="admin-page settings-page">
      <div className="admin-page-head">
        <div>
          <h1>Configurações</h1>
          <p>Painel, WhatsApp do site, mensagens prontas, opções e dados fiscais da loja</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCcw size={15} /> Atualizar
        </button>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <nav className="settings-jump" aria-label="Seções">
        <a href="#painel">Painel</a>
        <a href="#whatsapp">WhatsApp do site</a>
        <a href="#mensagens">Mensagens prontas</a>
        <a href="#estoque">Estoque</a>
        <a href="#vendas">Vendas</a>
        <a href="#financeiro">Financeiro</a>
        <a href="#fiscal">Dados fiscais</a>
      </nav>

      <div id="painel">
        <Section icon={LayoutDashboard} title="Painel" description="Esconda as abas que a loja não usa — para todos ou só para o gerente ou o vendedor —, crie cargos com abas próprias e escolha os blocos do Dashboard.">
          <div className="admin-table-wrap">
            <table className="admin-table settings-matrix">
              <thead>
                <tr>
                  <th>Aba</th>
                  <th>Esconder de todos</th>
                  <th>Esconder do gerente</th>
                  <th>Esconder do vendedor</th>
                </tr>
              </thead>
              <tbody>
                {PANEL_TABS.map((tab) => {
                  const all = panel.hiddenTabs.all.includes(tab.key)
                  // Fora do plano da loja (painel WB.Dev): some para todos
                  const outOfPlan = Array.isArray(planTabs) && !planTabs.includes(tab.key)
                  return (
                    <tr key={tab.key} className={outOfPlan ? 'is-hidden-row' : ''}>
                      <td>
                        <strong>{tab.label}</strong>
                        {outOfPlan && <span className="admin-table-sub">fora do plano da loja</span>}
                      </td>
                      <td>
                        <input type="checkbox" aria-label={`Esconder ${tab.label} de todos`} checked={all} onChange={() => setPanel((p) => toggleHiddenTab(p, 'all', tab.key))} />
                      </td>
                      {['manager', 'seller'].map((role) => {
                        const has = tab.roles.includes(role)
                        return (
                          <td key={role}>
                            {has ? (
                              <input
                                type="checkbox"
                                aria-label={`Esconder ${tab.label} do ${role === 'manager' ? 'gerente' : 'vendedor'}`}
                                checked={all || panel.hiddenTabs[role].includes(tab.key)}
                                disabled={all}
                                onChange={() => setPanel((p) => toggleHiddenTab(p, role, tab.key))}
                              />
                            ) : (
                              <span className="admin-table-sub" title="Esse papel não tem essa aba">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="admin-form-note">O início do painel e as Configurações nunca somem. Abas escondidas também tiram do Dashboard os avisos ligados a elas.</p>

          <h3 className="settings-subtitle">Blocos do Dashboard</h3>
          <div className="settings-checks">
            {DASHBOARD_BLOCKS.map((block) => (
              <label key={block.key} className="admin-checkbox">
                <input type="checkbox" checked={!panel.hiddenBlocks.includes(block.key)} onChange={() => setPanel((p) => toggleHiddenBlock(p, block.key))} />
                {block.label}
              </label>
            ))}
          </div>

          <div className="admin-form-actions">
            {panelMsg && <span className="settings-msg">{panelMsg}</span>}
            <button type="button" className="btn btn-primary" onClick={savePanel} disabled={saving === 'panel'}>
              {saving === 'panel' ? 'Salvando…' : 'Salvar painel'}
            </button>
          </div>

          <CustomRolesSettings />

          <h3 className="settings-subtitle">Avisos que você escondeu</h3>
          {dismissedKeys.length === 0 ? (
            <p className="admin-muted">Nenhum aviso de pendência escondido por você.</p>
          ) : (
            <>
              <ul className="doc-list">
                {dismissedKeys.map((key) => {
                  const d = dismissals[key]
                  const snoozed = d.snoozedUntil && new Date(d.snoozedUntil) > new Date()
                  return (
                    <li key={key}>
                      <div className="doc-list-main">
                        <strong>{PENDENCY_LABELS[key] || key}</strong>
                        <span className="admin-table-sub">
                          {snoozed
                            ? `Adiado até ${formatDateBR(d.snoozedUntil.slice(0, 10))} às ${new Date(d.snoozedUntil).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                            : d.dismissedCount != null
                              ? 'Excluído — volta se surgir algo novo'
                              : 'Já voltou a aparecer'}
                        </span>
                      </div>
                      <div className="doc-list-actions">
                        <button type="button" className="admin-action-btn" onClick={() => restoreDismissals([key]).then(() => setDismissals((prev) => { const next = { ...prev }; delete next[key]; return next }))}>
                          <Eye size={14} /> Mostrar de novo
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="btn btn-outline" onClick={restoreAll}>
                <Eye size={15} /> Mostrar todos de novo
              </button>
            </>
          )}
        </Section>
      </div>

      <div id="whatsapp">
        <Section
          icon={MessageCircle}
          title="WhatsApp do site"
          description="Para onde vão os botões de WhatsApp do site. No rodízio, cada cliente novo vai para o próximo da lista, em sequência."
        >
          <form onSubmit={saveWhatsapp} className="settings-wa-form">
            <div className="admin-segmented settings-mode" role="radiogroup" aria-label="Modo do WhatsApp">
              <button type="button" role="radio" aria-checked={wa.mode === 'fixo'} className={wa.mode === 'fixo' ? 'is-active' : ''} onClick={() => setWa((p) => ({ ...p, mode: 'fixo' }))}>
                Número fixo
              </button>
              <button type="button" role="radio" aria-checked={wa.mode === 'rodizio'} className={wa.mode === 'rodizio' ? 'is-active' : ''} onClick={() => setWa((p) => ({ ...p, mode: 'rodizio' }))}>
                Rodízio entre vendedores
              </button>
            </div>
            <div className="admin-form-grid">
              <label>
                Número principal
                <input value={wa.main} onChange={(e) => setWa((p) => ({ ...p, main: maskKeepingCaret(e, maskPhoneBR) }))} placeholder="(98) 99999-9999" inputMode="tel" />
                <span className="admin-form-hint">
                  Aparece no topo e no rodapé do site. {wa.mode === 'fixo' ? 'Todos os botões vão para ele.' : 'No rodízio, só é usado se ninguém da lista estiver disponível.'}
                </span>
              </label>
              {wa.mode === 'rodizio' && (
                <label>
                  Mesmo vendedor para o mesmo cliente por (dias)
                  <input inputMode="numeric" value={wa.stickyDays} onChange={(e) => setWa((p) => ({ ...p, stickyDays: e.target.value.replace(/\D/g, '').slice(0, 3) }))} />
                  <span className="admin-form-hint">Quem clica de novo nesse prazo volta para o mesmo vendedor. 0 = todo clique vai para o próximo.</span>
                </label>
              )}
            </div>
            <div className="admin-form-actions">
              {waMsg && <span className="settings-msg">{waMsg}</span>}
              <button type="submit" className="btn btn-primary" disabled={saving === 'wa'}>
                {saving === 'wa' ? 'Salvando…' : 'Salvar WhatsApp'}
              </button>
            </div>
          </form>

          <h3 className="settings-subtitle">Lista do rodízio</h3>
          {wa.mode === 'fixo' && <p className="admin-form-note">A lista só vale no modo rodízio. Você pode montá-la antes de trocar o modo.</p>}
          {sortedRotation.length === 0 ? (
            <p className="admin-muted">Ninguém no rodízio ainda. Adicione pessoas da Equipe ou números avulsos abaixo.</p>
          ) : (
            <ol className="rotation-list">
              {sortedRotation.map((entry, i) => {
                const problem = entryProblem(entry, sellersById)
                const phone = entryPhone(entry, sellersById)
                const isNext = store?.whatsappMode === 'rodizio' && nextEntry?.id === entry.id
                return (
                  <li key={entry.id} className={problem ? 'is-off' : ''}>
                    <span className="rotation-order">{i + 1}</span>
                    <div className="rotation-main">
                      <strong>
                        {entryName(entry, sellersById)}
                        {isNext && <span className="admin-pill is-success">Próximo a receber</span>}
                        {problem && <span className="admin-pill is-warning">{problem}</span>}
                      </strong>
                      <span className="admin-table-sub">
                        {phone ? formatWaPhone(phone) : 'Sem telefone — cadastre em Equipe'}
                        {entry.sellerId ? ' · da Equipe' : ' · número avulso'}
                      </span>
                    </div>
                    <div className="rotation-actions">
                      <button type="button" className="admin-icon-btn" onClick={() => move(i, -1)} disabled={rotationBusy || i === 0} aria-label="Subir">
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" className="admin-icon-btn" onClick={() => move(i, 1)} disabled={rotationBusy || i === sortedRotation.length - 1} aria-label="Descer">
                        <ArrowDown size={15} />
                      </button>
                      <button type="button" className="admin-action-btn" onClick={() => toggleEntry(entry)} disabled={rotationBusy}>
                        {entry.active ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Ativar</>}
                      </button>
                      <button type="button" className="admin-action-btn admin-action-danger" onClick={() => removeEntry(entry)} disabled={rotationBusy}>
                        <Trash2 size={14} /> Tirar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          <div className="rotation-add">
            <div className="rotation-add-box">
              <h4>Pessoa da Equipe</h4>
              <p className="admin-form-hint">Usa o telefone do cadastro na Equipe.</p>
              <div className="rotation-add-row">
                <select value={newSellerId} onChange={(e) => setNewSellerId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {teamOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{!s.phone ? ' (sem telefone)' : ''}{!s.active ? ' (desativado)' : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-outline" onClick={addTeamMember} disabled={!newSellerId || rotationBusy}>
                  <Plus size={15} /> Adicionar
                </button>
              </div>
            </div>
            <form className="rotation-add-box" onSubmit={addExtraNumber}>
              <h4>Número avulso</h4>
              <p className="admin-form-hint">Ex.: telefone da recepção ou de alguém sem login.</p>
              <div className="rotation-add-row">
                <input value={newExtra.name} onChange={(e) => setNewExtra((p) => ({ ...p, name: e.target.value }))} placeholder="Nome" />
                <input value={newExtra.phone} onChange={(e) => setNewExtra((p) => ({ ...p, phone: maskKeepingCaret(e, maskPhoneBR) }))} placeholder="(98) 99999-9999" inputMode="tel" />
                <button type="submit" className="btn btn-outline" disabled={rotationBusy}>
                  <Plus size={15} /> Adicionar
                </button>
              </div>
            </form>
          </div>
          <p className="admin-form-note">
            Cada clique no WhatsApp do site fica registrado. Veja quantos contatos cada vendedor recebeu em{' '}
            <Link to="/admin/relatorios">Relatórios → Contatos pelo WhatsApp</Link>.
          </p>
        </Section>
      </div>

      <div id="mensagens">
        <Section icon={MessageSquareText} title="Mensagens prontas" description="Modelos do botão &quot;Chamar no WhatsApp&quot; da ficha do cliente. Quem envia pode ajustar o texto antes de abrir a conversa.">
          <p className="admin-form-hint settings-fields">
            Campos preenchidos sozinhos:{' '}
            {TEMPLATE_FIELDS.map((f) => (
              <span key={f.key}>
                <code>{`{${f.key}}`}</code> {f.label}
              </span>
            ))}
          </p>
          <div className="template-list">
            {templates.map((t, i) => (
              <div className="template-item" key={t.id || i}>
                <div className="template-item-head">
                  <input value={t.name} onChange={(e) => updateTemplate(i, 'name', e.target.value)} placeholder="Nome do modelo" aria-label="Nome do modelo" />
                  <button type="button" className="admin-action-btn admin-action-danger" onClick={() => setTemplates((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 size={14} /> Remover
                  </button>
                </div>
                <textarea rows={3} value={t.text} onChange={(e) => updateTemplate(i, 'text', e.target.value)} aria-label={`Texto de ${t.name}`} />
                <p className="template-preview">{fillTemplate(t.text, SAMPLE)}</p>
              </div>
            ))}
          </div>
          <div className="admin-form-actions">
            {templatesMsg && <span className="settings-msg">{templatesMsg}</span>}
            <button type="button" className="btn btn-outline" onClick={() => setTemplates((prev) => [...prev, { id: `modelo-${Date.now()}`, name: '', text: 'Olá, {nome}! Aqui é {vendedor}, da {loja}. ' }])}>
              <Plus size={15} /> Novo modelo
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setTemplates(DEFAULT_TEMPLATES)}>
              <RotateCcw size={15} /> Voltar aos modelos padrão
            </button>
            <button type="button" className="btn btn-primary" onClick={saveTemplates} disabled={saving === 'templates'}>
              {saving === 'templates' ? 'Salvando…' : 'Salvar mensagens'}
            </button>
          </div>
        </Section>
      </div>

      <div id="estoque">
        <Section icon={Car} title="Estoque" description="Aviso de tempo em estoque e as listas do cadastro do carro.">
          <form className="settings-inline-form" onSubmit={applyAlert}>
            <label>
              Aviso de estoque (dias)
              <input inputMode="numeric" value={alertDays} onChange={(e) => setAlertDays(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </label>
            <button type="submit" className="btn btn-outline" disabled={saving === 'alert'}>
              {saving === 'alert' ? 'Aplicando…' : 'Aplicar a todos os carros'}
            </button>
          </form>
          <p className="admin-form-note">
            Padrão atual: {company?.stockAlertDays || DEFAULT_STOCK_ALERT_DAYS} dias. O tempo em estoque fica em vermelho a partir desse prazo (dá para mudar carro a carro em Editar).
          </p>
          {alertMsg && <p className="settings-msg">{alertMsg}</p>}
          <div className="settings-buttons">
            <button type="button" className="btn btn-outline" onClick={() => setListDialog('intake')}>Itens que vêm com o carro</button>
            <button type="button" className="btn btn-outline" onClick={() => setListDialog('inspection')}>Itens da vistoria de entrada</button>
          </div>
        </Section>
      </div>

      <div id="vendas">
        <Section icon={Handshake} title="Vendas" description="Checklist de entrega conferido na venda e a lista de bancos (venda, contrato e financiamento externo).">
          <div className="settings-buttons">
            <button type="button" className="btn btn-outline" onClick={() => setListDialog('sale')}>Checklist de entrega</button>
            <button type="button" className="btn btn-outline" onClick={() => setListDialog('banks')}>Bancos</button>
          </div>
        </Section>
      </div>

      <div id="financeiro">
        <Section icon={Wallet} title="Financeiro" description="Multa e juros padrão das parcelas do financiamento próprio da loja.">
          <p className="admin-form-note">
            Hoje: multa de {String(company?.lateFeePercent ?? 2).replace('.', ',')}% e juros de {String(company?.lateInterestPercent ?? 1).replace('.', ',')}% ao mês.
          </p>
          <div className="settings-buttons">
            <button type="button" className="btn btn-outline" onClick={() => setLateFeeOpen(true)}>Multa e juros por atraso</button>
          </div>
        </Section>
      </div>

      <div id="fiscal">
        <Section
          icon={Landmark}
          title="Dados fiscais da loja"
          description="Razão social, CNPJ, Inscrição Estadual, regime e endereço. Os contratos, o termo de entrega e os recibos já usam estes dados; depois, a nota fiscal também. Confirme com o contador da loja."
        >
          {company && (
            <FiscalSettings
              fiscal={company.fiscal || {}}
              onSaved={(fiscal) => setCompany((prev) => ({ ...prev, fiscal }))}
            />
          )}
        </Section>
      </div>

      {listDialog && company && (
        <ChecklistSettingsDialog
          kind={listDialog}
          items={company[LIST_ITEMS[listDialog]]}
          onSaved={(items) => {
            setCompany((prev) => ({ ...prev, [LIST_ITEMS[listDialog]]: items }))
            setListDialog(null)
          }}
          onClose={() => setListDialog(null)}
        />
      )}
      {lateFeeOpen && company && (
        <LateFeeSettingsDialog
          settings={company}
          onSaved={(values) => {
            setCompany((prev) => ({ ...prev, ...values }))
            setLateFeeOpen(false)
          }}
          onClose={() => setLateFeeOpen(false)}
        />
      )}
      {confirmDialog}
    </div>
  )
}
