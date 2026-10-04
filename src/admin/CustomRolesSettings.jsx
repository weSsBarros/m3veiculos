import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { fetchCustomRoles, saveCustomRole, deleteCustomRole } from '../lib/customRolesApi.js'
import { fetchSellers, accessLabel } from '../lib/sellersApi.js'
import { tabsForRole, PANEL_TABS } from '../utils/panelSettings.js'
import useConfirm from '../components/useConfirm.jsx'

const ACCESS = {
  seller: 'Vê só as próprias vendas, reservas e documentos de clientes.',
  manager: 'Vê tudo da loja, menos custos (os valores das vendas seguem o que for marcado na Equipe).',
}

const EMPTY = { id: null, name: '', baseRole: 'manager', tabs: [] }

const tabLabel = (key) => PANEL_TABS.find((t) => t.key === key)?.label || key

// Configurações → Painel → Cargos da loja: o admin cria cargos com o nome que
// quiser (ex.: "Despachante"), o nível de acesso e as abas que aparecem
export default function CustomRolesSettings() {
  const { confirm, confirmDialog } = useConfirm()
  const [roles, setRoles] = useState([])
  const [team, setTeam] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchCustomRoles(), fetchSellers().catch(() => [])])
      .then(([r, s]) => {
        if (cancelled) return
        setRoles(r)
        setTeam(s.filter((p) => !p.deletedAt))
      })
      .catch((err) => !cancelled && setError(err.message || 'Não foi possível carregar os cargos.'))
    return () => {
      cancelled = true
    }
  }, [])

  const membersOf = (id) => team.filter((p) => p.customRoleId === id)
  const available = form ? tabsForRole(form.baseRole) : []

  function startNew() {
    setForm({ ...EMPTY })
    setError('')
    setMsg('')
  }

  function startEdit(role) {
    setForm({ ...role, tabs: [...role.tabs] })
    setError('')
    setMsg('')
  }

  function toggleTab(key) {
    setForm((f) => ({ ...f, tabs: f.tabs.includes(key) ? f.tabs.filter((k) => k !== key) : [...f.tabs, key] }))
  }

  // Trocar o nível tira as abas que o novo nível não tem
  function setBase(baseRole) {
    const allowed = tabsForRole(baseRole).map((t) => t.key)
    setForm((f) => ({ ...f, baseRole, tabs: f.tabs.filter((k) => allowed.includes(k)) }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Dê um nome ao cargo.')
      return
    }
    const before = roles.find((r) => r.id === form.id)
    const people = form.id ? membersOf(form.id) : []
    if (before && before.baseRole !== form.baseRole && people.length > 0) {
      const ok = await confirm(
        `${people.length === 1 ? '1 pessoa tem' : `${people.length} pessoas têm`} esse cargo e ${people.length === 1 ? 'passa' : 'passam'} a ter ${accessLabel(form.baseRole)}. ${ACCESS[form.baseRole]}`,
        { title: 'Mudar o acesso do cargo', confirmLabel: 'Mudar' }
      )
      if (!ok) return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await saveCustomRole(form)
      setRoles((prev) => [...prev.filter((r) => r.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)))
      setMsg(`Cargo "${saved.name}" salvo. Quem tem o cargo vê o menu novo ao recarregar o painel.`)
      setForm(null)
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o cargo.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(role) {
    const people = membersOf(role.id)
    const base = role.baseRole === 'manager' ? 'Gerente' : 'Vendedor'
    const ok = await confirm(
      people.length > 0
        ? `${people.map((p) => p.name).join(', ')} ${people.length === 1 ? 'volta' : 'voltam'} a ser ${base} (com o menu de ${base} em Configurações).`
        : 'Ninguém tem esse cargo agora.',
      { title: `Excluir o cargo "${role.name}"`, confirmLabel: 'Excluir' }
    )
    if (!ok) return
    try {
      await deleteCustomRole(role.id)
      setRoles((prev) => prev.filter((r) => r.id !== role.id))
      setTeam((prev) => prev.map((p) => (p.customRoleId === role.id ? { ...p, customRoleId: null, customRole: null } : p)))
      setMsg(`Cargo "${role.name}" excluído.`)
    } catch (err) {
      setError(err.message || 'Não foi possível excluir o cargo.')
    }
  }

  return (
    <div className="custom-roles">
      <h3 className="settings-subtitle">Cargos da loja</h3>
      <p className="admin-form-hint">
        Crie cargos com o nome que quiser (ex.: Despachante, Secretária) e escolha as abas que aparecem. Depois, em Equipe, é só
        escolher o cargo da pessoa.
      </p>

      {roles.length > 0 && (
        <ul className="custom-roles-list">
          {roles.map((r) => {
            const people = membersOf(r.id)
            return (
              <li key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <span className="admin-table-sub">
                    {accessLabel(r.baseRole)} · {people.length === 1 ? '1 pessoa' : `${people.length} pessoas`}
                  </span>
                  <span className="custom-roles-tabs">
                    {r.tabs.length > 0 ? r.tabs.map(tabLabel).join(', ') : 'Só o início do painel'}
                  </span>
                </div>
                <div className="admin-row-actions">
                  <button type="button" className="admin-action-btn" onClick={() => startEdit(r)}>
                    <Pencil size={14} /> Editar
                  </button>
                  <button type="button" className="admin-action-btn admin-action-danger" onClick={() => remove(r)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {form ? (
        <form className="custom-roles-form" onSubmit={submit}>
          <label>
            Nome do cargo
            <input value={form.name} maxLength={40} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: Despachante" />
          </label>
          <div>
            <span className="admin-field-label">Acesso</span>
            <div className="admin-segmented" role="radiogroup" aria-label="Acesso do cargo">
              {['seller', 'manager'].map((base) => (
                <button
                  key={base}
                  type="button"
                  role="radio"
                  aria-checked={form.baseRole === base}
                  className={form.baseRole === base ? 'is-active' : ''}
                  onClick={() => setBase(base)}
                >
                  {base === 'manager' ? 'Como gerente' : 'Como vendedor'}
                </button>
              ))}
            </div>
            <p className="admin-form-note">{ACCESS[form.baseRole]}</p>
          </div>
          <div>
            <span className="admin-field-label">Abas que aparecem</span>
            <div className="settings-checks">
              {available.map((t) => (
                <label key={t.key} className="admin-checkbox">
                  <input type="checkbox" checked={form.tabs.includes(t.key)} onChange={() => toggleTab(t.key)} />
                  {t.label}
                </label>
              ))}
            </div>
            <p className="admin-form-note">O início do painel sempre aparece. Abas escondidas de todos (acima) não aparecem para ninguém.</p>
          </div>
          {error && <p className="admin-error">{error}</p>}
          <div className="admin-form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : form.id ? 'Salvar cargo' : 'Criar cargo'}
            </button>
          </div>
        </form>
      ) : (
        <>
          {error && <p className="admin-error">{error}</p>}
          <div className="admin-form-actions custom-roles-actions">
            {msg && <span className="settings-msg">{msg}</span>}
            <button type="button" className="btn btn-outline" onClick={startNew}>
              <Plus size={15} /> Novo cargo
            </button>
          </div>
        </>
      )}
      {confirmDialog}
    </div>
  )
}
