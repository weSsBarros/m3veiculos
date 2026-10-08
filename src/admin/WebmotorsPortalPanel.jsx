import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCcw, Eye, Send, RotateCcw, Link2, Unlink, Wand2, Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { updateCarWebmotors } from '../lib/carsApi.js'
import {
  fetchWebmotorsAccount, fetchWebmotorsAds, fetchWebmotorsSetup, fetchWebmotorsLists, fetchWebmotorsCatalog, saveWebmotorsSettings,
  connectWebmotors, disconnectWebmotors, refreshWebmotorsModalities, syncWebmotors, previewWebmotorsAd,
} from '../lib/webmotorsApi.js'
import { webmotorsCarState, webmotorsCatalogLabel, webmotorsModality, webmotorsLive } from '../utils/webmotorsStatus.js'
import { portalStateOrder, formatPortalDateTime } from '../utils/portalStatus.js'
import { wmMissing, wmYears, wmVersionsForYear, wmModalityFull } from '../utils/webmotorsAd.js'
import { olxRankBrands, olxRankModels, olxRankVersions, olxConfident } from '../utils/olxAd.js'
import { formatCnpj, isValidCnpj, onlyDigits } from '../utils/fiscal.js'
import useConfirm from '../components/useConfirm.jsx'
import WebmotorsCatalogPicker from './WebmotorsCatalogPicker.jsx'
import WebmotorsPreviewDialog from './WebmotorsPreviewDialog.jsx'
import PortalCarList from './PortalCarList.jsx'

const ACCOUNT_STATUS = {
  conectada: { label: 'Conectada', tone: 'is-success' },
  erro: { label: 'Precisa conectar de novo', tone: 'is-danger' },
}

// Webmotors na aba Portais (seção 61): usuário de integração da loja, modalidade
// do plano, publicação automática, ajustes e a situação de cada carro. Enquanto
// a Webmotors não libera a integração da WB.Dev, o cartão avisa e não conecta.
// cars/setCars vêm da aba; reloadKey muda quando a pessoa clica em "Atualizar".
export default function WebmotorsPortalPanel({ cars, setCars, reloadKey }) {
  const { isAdmin } = useAuth()
  const { confirm, confirmDialog } = useConfirm()
  const [params] = useSearchParams()
  const [account, setAccount] = useState(null)
  const [setup, setSetup] = useState(null)
  const [ads, setAds] = useState([])
  const [lists, setLists] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState(() => (params.get('filtro') === 'problemas' && params.get('portal') === 'webmotors' ? 'problemas' : 'todos'))
  const [editing, setEditing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [draft, setDraft] = useState(null)
  const [form, setForm] = useState({ cnpj: '', email: '', password: '' })
  const [suggestion, setSuggestion] = useState('')

  async function load() {
    setError('')
    try {
      const acc = await fetchWebmotorsAccount({ fresh: true })
      const [setupData, adsData] = await Promise.all([
        // Função ainda não publicada = integração ainda não liberada
        fetchWebmotorsSetup().catch(() => null),
        acc?.connected ? fetchWebmotorsAds() : Promise.resolve([]),
      ])
      setAccount(acc)
      setSetup(setupData)
      setAds(adsData)
      setDraft(acc?.connected ? { ...acc.settings } : null)
      if (acc && !acc.connected) setForm((f) => ({ ...f, cnpj: f.cnpj || (acc.fiscalCnpj ? formatCnpj(acc.fiscalCnpj) : '') }))
      if (acc?.connected) fetchWebmotorsLists().then(setLists).catch(() => setLists(null))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a Webmotors.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  const adsByCar = useMemo(() => new Map(ads.filter((a) => a.carId).map((a) => [a.carId, a])), [ads])
  const ctx = useMemo(() => ({ account, siteUrl: window.location.origin, lists }), [account, lists])

  // Carros (moto fica de fora: a Webmotors usa outro serviço) e os vendidos que ainda estão na Webmotors
  const rows = useMemo(() => {
    if (!account?.connected) return []
    return cars
      .filter((car) => car.category !== 'moto')
      .filter((car) => car.status !== 'vendido' || webmotorsLive(adsByCar.get(car.id)))
      .map((car) => {
        const ad = adsByCar.get(car.id) || null
        return { car, ad, state: webmotorsCarState(car, ad, ctx) }
      })
      .sort((a, b) => portalStateOrder(a.state) - portalStateOrder(b.state) || `${a.car.brand} ${a.car.model}`.localeCompare(`${b.car.brand} ${b.car.model}`))
  }, [cars, adsByCar, ctx, account])

  const configured = Boolean(setup?.configured)
  const simulates = Boolean(account?.isDemo) && setup?.ambiente === 'producao'
  const modality = webmotorsModality(account)

  async function run(key, fn) {
    setBusy(key)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setNotice({ tone: 'error', text: err.message || 'Não deu certo. Tente de novo.' })
    } finally {
      setBusy('')
    }
  }

  async function refreshAds() {
    setAds(await fetchWebmotorsAds())
  }

  // Aviso depois de mandar: o que a Webmotors aceitou e, à parte, o que ela recusou
  // ou não respondeu (esses ficam em "Com problema", com o motivo no carro)
  function syncNotice(result) {
    if (result?.busy) return { tone: 'success', text: 'A Webmotors já está sendo atualizada agora. Confira de novo em instantes.' }
    if (result?.modality === false) return { tone: 'error', text: 'Escolha a modalidade do plano da Webmotors: sem ela nenhum carro vai.' }
    if (result?.lists === false) {
      return { tone: 'error', text: 'A Webmotors não mandou as listas de cor, câmbio e combustível agora. Tente de novo em instantes.' }
    }
    const done = []
    if (result?.sent) {
      done.push(simulates
        ? `${result.sent} ${result.sent === 1 ? 'anúncio simulado' : 'anúncios simulados'} (na loja de demonstração nada vai para a Webmotors)`
        : `${result.sent} ${result.sent === 1 ? 'anúncio enviado' : 'anúncios enviados'}`)
    }
    if (result?.updated) done.push(`${result.updated} ${result.updated === 1 ? 'atualizado' : 'atualizados'}`)
    if (result?.removed) done.push(`${result.removed} ${result.removed === 1 ? 'tirado' : 'tirados'} da Webmotors`)
    const problems = []
    if (result?.refused) {
      problems.push(`${result.refused} ${result.refused === 1 ? 'recusado' : 'recusados'} pela Webmotors (o motivo aparece no carro, em "Com problema")`)
    }
    if (result?.waiting) problems.push(`${result.waiting} sem resposta da Webmotors agora (o sistema tenta de novo em alguns minutos)`)
    if (problems.length) {
      const text = [...done, ...problems].join('; ')
      return { tone: 'error', text: `${done.length ? 'Pronto: ' : 'Anúncios: '}${text}.` }
    }
    return { tone: 'success', text: done.length ? `Pronto: ${done.join(', ')}.` : 'Tudo em dia com a Webmotors.' }
  }

  const handleConnect = (e) => {
    e.preventDefault()
    run('connect', async () => {
      if (!isValidCnpj(form.cnpj)) throw new Error('Confira o CNPJ: os números não batem.')
      if (!form.email.trim() || !form.password) throw new Error('Digite o e-mail e a senha do usuário de integração.')
      await connectWebmotors({ cnpj: onlyDigits(form.cnpj), email: form.email.trim(), password: form.password })
      setForm((f) => ({ ...f, password: '' }))
      await load()
      setNotice({ tone: 'success', text: 'Webmotors conectada. Confira a modalidade do plano e os carros abaixo e, quando estiver tudo certo, ligue a publicação automática.' })
    })
  }

  const handleDisconnect = () =>
    run('disconnect', async () => {
      if (!(await confirm('Desconectar a Webmotors desta loja? Os carros deixam de ir para a Webmotors e a senha do usuário de integração é apagada.', { title: 'Desconectar Webmotors', confirmLabel: 'Desconectar' }))) return
      const live = ads.filter((a) => webmotorsLive(a) || a.status === 'simulado').length
      const removeAds = live > 0 && (await confirm(
        `Tirar da Webmotors ${live === 1 ? 'o anúncio publicado' : `os ${live} anúncios publicados`} pelo sistema? Se deixar, eles continuam no ar e a loja cuida deles direto na Webmotors.`,
        { title: 'Anúncios na Webmotors', confirmLabel: 'Tirar da Webmotors', cancelLabel: 'Deixar no ar' },
      ))
      await disconnectWebmotors(removeAds)
      await load()
      setNotice({ tone: 'success', text: 'Webmotors desconectada.' })
    })

  const changeModality = (code) =>
    run('modality', async () => {
      const acc = await saveWebmotorsSettings({ modalityCode: code })
      setAccount(acc)
    })

  const reloadModalities = () =>
    run('modalities', async () => {
      await refreshWebmotorsModalities()
      await load()
      setNotice({ tone: 'success', text: 'Modalidades e vagas do plano atualizadas.' })
    })

  const toggleAuto = (next) =>
    run('auto', async () => {
      const ready = rows.filter((r) => r.state?.key === 'pronto').length
      const message = next
        ? `Ligar a publicação automática? ${ready ? `${ready === 1 ? 'O carro pronto vai' : `Os ${ready} carros prontos vão`} para a Webmotors agora. ` : ''}Depois, carro novo ou editado vai sozinho, e o que for vendido, reservado, ocultado ou desmarcado sai sozinho.`
        : 'Desligar a publicação automática? Os anúncios que já estão na Webmotors continuam lá (e saem quando o carro é vendido), mas carro novo não vai mais sozinho.'
      if (!(await confirm(message, { title: 'Publicação automática', confirmLabel: next ? 'Ligar' : 'Desligar' }))) return
      const acc = await saveWebmotorsSettings({ autoPublish: next })
      setAccount(acc)
      if (next) {
        const result = await syncWebmotors({ manual: true })
        await refreshAds()
        setNotice(syncNotice(result))
      }
    })

  const saveSettings = (e) => {
    e.preventDefault()
    run('settings', async () => {
      const acc = await saveWebmotorsSettings({ publishDefault: draft.publishDefault, footer: draft.footer, exchange: draft.exchange })
      setAccount(acc)
      setDraft({ ...acc.settings })
      setNotice({ tone: 'success', text: 'Ajustes da Webmotors salvos. Os anúncios são atualizados na próxima sincronização.' })
    })
  }

  const syncNow = () =>
    run('sync', async () => {
      const result = await syncWebmotors({ manual: true })
      await load()
      setNotice(syncNotice(result))
    })

  const togglePublish = (car) =>
    run(`pub-${car.id}`, async () => {
      const updated = await updateCarWebmotors(car.id, { webmotorsPublish: car.webmotorsPublish === false })
      setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
    })

  const saveCatalog = (car) =>
    run(`cat-${car.id}`, async () => {
      const updated = await updateCarWebmotors(car.id, { webmotorsCatalog: { ...editing.value, auto: false } })
      setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
      setEditing(null)
    })

  const publishNow = (car, { force = false, again = false } = {}) =>
    run(`send-${car.id}`, async () => {
      if (again && !(await confirm('Publicar de novo na Webmotors? Entra como um anúncio novo no plano da loja.', { title: 'Publicar de novo', confirmLabel: 'Publicar' }))) return
      const result = await syncWebmotors({ carIds: [car.id], force })
      await refreshAds()
      setNotice(syncNotice(result))
    })

  async function openPreview(car) {
    setPreview({ loading: true })
    try {
      setPreview({ loading: false, ...(await previewWebmotorsAd(car.id)) })
    } catch (err) {
      setPreview({ loading: false, error: err.message })
    }
  }

  // Escolhe marca, modelo e versão da Webmotors de todos os carros em que a combinação é clara
  const suggestAll = () =>
    run('suggest', async () => {
      const pending = rows.filter((r) => r.car.webmotorsPublish !== false && wmMissing(r.car, { siteUrl: ctx.siteUrl }).includes('catalogo'))
      let done = 0
      for (const [index, { car }] of pending.entries()) {
        setSuggestion(`Procurando a versão da Webmotors: ${index + 1} de ${pending.length}…`)
        const next = { ...(car.webmotorsCatalog || {}) }
        if (!next.brandId) {
          const brand = olxConfident(olxRankBrands(car.brand, await fetchWebmotorsCatalog({ level: 'marcas' })))
          if (brand) Object.assign(next, { brandId: brand.id, brandName: brand.name })
        }
        if (next.brandId && !next.modelId) {
          const model = olxConfident(olxRankModels(car.model, await fetchWebmotorsCatalog({ level: 'modelos', brandId: next.brandId })))
          if (model) Object.assign(next, { modelId: model.id, modelName: model.name })
        }
        if (next.modelId && !next.versionId) {
          const versions = wmVersionsForYear(await fetchWebmotorsCatalog({ level: 'versoes', modelId: next.modelId }), wmYears(car)?.model)
          const version = olxConfident(olxRankVersions(car, versions, next.modelName))
          if (version) Object.assign(next, { versionId: version.id, versionName: version.name })
        }
        if (JSON.stringify(next) !== JSON.stringify(car.webmotorsCatalog || {})) {
          const updated = await updateCarWebmotors(car.id, { webmotorsCatalog: { ...next, auto: true } })
          setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
        }
        if (next.brandId && next.modelId && next.versionId) done += 1
      }
      setSuggestion('')
      const left = pending.length - done
      setNotice({
        tone: 'success',
        text: pending.length === 0
          ? 'Todos os carros já têm a versão da Webmotors.'
          : `${done} ${done === 1 ? 'carro ficou' : 'carros ficaram'} com a versão da Webmotors (confira as sugestões).${left ? ` ${left} ${left === 1 ? 'precisa' : 'precisam'} que você escolha.` : ''}`,
      })
    }).finally(() => setSuggestion(''))

  if (loading) return <p className="admin-muted">Carregando a Webmotors…</p>

  const accountStatus = ACCOUNT_STATUS[account?.status] || ACCOUNT_STATUS.conectada

  return (
    <>
      {error && <p className="admin-error">{error}</p>}
      {notice && <p className={notice.tone === 'error' ? 'admin-error' : 'admin-success'}>{notice.text}</p>}

      <section className="admin-form-section portals-card">
        <div className="portals-card-head">
          <span className="portals-logo is-webmotors" aria-hidden="true">WM</span>
          <div className="portals-card-title">
            <h2>Webmotors</h2>
            {account?.connected ? (
              <p>
                Conectada com o CNPJ <strong>{formatCnpj(account.cnpj)}</strong>
                {account.email ? ` (${account.email})` : ''}
              </p>
            ) : (
              <p>Os carros disponíveis vão sozinhos para a Webmotors e saem quando são vendidos, reservados ou ocultados.</p>
            )}
          </div>
          {account?.connected && <span className={`admin-pill ${accountStatus.tone}`}>{accountStatus.label}</span>}
        </div>

        {account?.isDemo && (
          <p className="portals-demo">
            {simulates
              ? 'Loja de demonstração: dá para conectar e ver tudo, mas nada vai para a Webmotors (os anúncios ficam como “Simulado”).'
              : 'Loja de demonstração: aqui a conexão usa o ambiente de teste da Webmotors (os anúncios de lá são de teste).'}
          </p>
        )}

        {!account?.connected ? (
          <>
            {!configured && (
              <p className="portals-waiting">
                <strong>Aguardando a liberação da Webmotors.</strong> A WB.Dev está concluindo o cadastro da integração na Webmotors. Assim que
                for liberada, a loja pede o usuário de integração e conecta aqui.
              </p>
            )}
            <p className="admin-form-hint">Para conectar, a loja precisa de:</p>
            <ul className="portals-requirements">
              <li>um <strong>plano de anúncios para lojas</strong> na Webmotors (carros);</li>
              <li>o <strong>usuário de integração</strong>: a loja pede à Webmotors, pelo atendimento ao lojista, um usuário de integração de API para a WB.AUTO. Vêm o CNPJ, o e-mail e a senha;</li>
              <li>em cada carro, a <strong>placa</strong> e a <strong>versão da Webmotors</strong> (o sistema sugere).</li>
            </ul>
            {!isAdmin && <p className="admin-form-note">Peça ao administrador da loja para conectar a Webmotors.</p>}
            {isAdmin && configured && (
              <form onSubmit={handleConnect} className="admin-form portals-connect">
                <div className="admin-form-grid">
                  <label>
                    CNPJ da loja
                    <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: formatCnpj(e.target.value) })} placeholder="00.000.000/0000-00" inputMode="numeric" />
                  </label>
                  <label>
                    E-mail do usuário de integração
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
                  </label>
                  <label>
                    Senha do usuário de integração
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
                  </label>
                </div>
                <div className="admin-row-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy === 'connect'}>
                    <Link2 size={15} /> {busy === 'connect' ? 'Conectando…' : 'Conectar à Webmotors'}
                  </button>
                </div>
                <p className="admin-form-note">
                  O sistema testa o usuário na Webmotors antes de guardar. A senha fica cifrada no cofre do banco e só a integração usa: ninguém da
                  equipe vê depois.
                </p>
              </form>
            )}
          </>
        ) : (
          <>
            {account.statusDetail && <p className="admin-error">{account.statusDetail}</p>}
            <div className="portals-modality admin-form">
              <label>
                Modalidade do plano usada nos anúncios
                <select value={account.modalityCode} disabled={!isAdmin || busy === 'modality'} onChange={(e) => changeModality(e.target.value)}>
                  <option value="">{account.modalities.length ? 'Escolha a modalidade' : 'Nenhuma modalidade no plano'}</option>
                  {account.modalities.map((m) => (
                    <option key={m.code} value={String(m.code)}>
                      {m.name} ({m.used} de {m.total} anúncios)
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="admin-action-btn" onClick={reloadModalities} disabled={busy === 'modalities' || simulates}>
                <RefreshCcw size={14} /> {busy === 'modalities' ? 'Atualizando…' : 'Atualizar as vagas'}
              </button>
            </div>
            {!modality && <p className="portals-waiting">Escolha a modalidade do plano: sem ela nenhum carro vai para a Webmotors.</p>}
            {modality && wmModalityFull(modality) && (
              <p className="admin-error">A modalidade “{modality.name}” está cheia ({modality.used} de {modality.total}). Carro novo só entra quando abrir vaga.</p>
            )}

            <label className="admin-checkbox portals-auto">
              <input type="checkbox" checked={account.autoPublish} disabled={!isAdmin || busy === 'auto'} onChange={(e) => toggleAuto(e.target.checked)} />
              <span>
                <strong>Publicação automática</strong>
                {account.autoPublish
                  ? ' ligada: carro novo ou editado vai sozinho, e o que sai de venda é tirado da Webmotors.'
                  : ' desligada: só vai o que você mandar com “Publicar agora” (vendido, reservado ou oculto continua saindo sozinho).'}
              </span>
            </label>

            {isAdmin && draft && (
              <details className="portals-settings">
                <summary>Ajustes dos anúncios</summary>
                <form onSubmit={saveSettings} className="admin-form">
                  <label className="admin-checkbox">
                    <input type="checkbox" checked={draft.publishDefault} onChange={(e) => setDraft({ ...draft, publishDefault: e.target.checked })} />
                    Carro novo já vem marcado “Publicar na Webmotors”
                  </label>
                  <div className="admin-form-grid">
                    <label>
                      Aceita troca?
                      <select value={draft.exchange} onChange={(e) => setDraft({ ...draft, exchange: e.target.value })}>
                        <option value="">Não informar</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Texto no fim de toda descrição (opcional)
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={draft.footer}
                      onChange={(e) => setDraft({ ...draft, footer: e.target.value })}
                      placeholder="Ex: Aceitamos seu usado na troca e financiamos em até 60x."
                    />
                  </label>
                  <p className="admin-form-note">
                    Não coloque telefone, site ou link na descrição. O contato do anúncio é o que a loja tem cadastrado na Webmotors.
                  </p>
                  <div className="admin-row-actions">
                    <button type="submit" className="btn btn-primary" disabled={busy === 'settings'}>
                      <Save size={15} /> {busy === 'settings' ? 'Salvando…' : 'Salvar ajustes'}
                    </button>
                  </div>
                </form>
              </details>
            )}

            <div className="admin-row-actions portals-card-actions">
              <button type="button" className="btn btn-outline" onClick={syncNow} disabled={busy === 'sync'}>
                <RefreshCcw size={15} /> {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar agora'}
              </button>
              <button type="button" className="btn btn-outline" onClick={suggestAll} disabled={busy === 'suggest'}>
                <Wand2 size={15} /> {busy === 'suggest' ? 'Sugerindo…' : 'Sugerir versões da Webmotors'}
              </button>
              {isAdmin && (
                <button type="button" className="btn btn-outline admin-delete-btn" onClick={handleDisconnect} disabled={busy === 'disconnect'}>
                  <Unlink size={15} /> Desconectar
                </button>
              )}
            </div>
            {suggestion && <p className="admin-form-note">{suggestion}</p>}
            {account.lastSyncAt && (
              <p className="admin-form-note">Última sincronização: {formatPortalDateTime(account.lastSyncAt)}. O sistema confere a Webmotors sozinho a cada 10 minutos.</p>
            )}
          </>
        )}
      </section>

      {account?.connected && (
        <PortalCarList
          name="Webmotors"
          rows={rows}
          filter={filter}
          onFilter={setFilter}
          busy={busy}
          isPublished={(car) => car.webmotorsPublish !== false}
          onTogglePublish={togglePublish}
          renderCatalog={(car, rowBusy) => {
            const catalogLabel = webmotorsCatalogLabel(car.webmotorsCatalog)
            const isEditing = editing?.carId === car.id
            return (
              <>
                <div className="portals-item-catalog">
                  <span className={catalogLabel ? '' : 'is-missing'}>
                    {catalogLabel ? `Versão da Webmotors: ${catalogLabel}` : 'Sem a versão da Webmotors'}
                    {catalogLabel && car.webmotorsCatalog?.auto ? ' (sugerida)' : ''}
                  </span>
                  {!isEditing && (
                    <button type="button" className="admin-action-btn" onClick={() => setEditing({ carId: car.id, value: { ...(car.webmotorsCatalog || {}) } })}>
                      {catalogLabel ? 'Trocar' : 'Escolher'}
                    </button>
                  )}
                </div>
                {isEditing && (
                  <div className="portals-item-editor admin-form">
                    <WebmotorsCatalogPicker car={car} value={editing.value} onChange={(value) => setEditing({ carId: car.id, value })} />
                    <div className="admin-row-actions">
                      <button type="button" className="btn btn-primary" onClick={() => saveCatalog(car)} disabled={rowBusy}>
                        <Save size={15} /> Salvar
                      </button>
                      <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </>
            )
          }}
          renderActions={({ car, ad, state, rowBusy }) => (
            <>
              {state?.key === 'pronto' && (
                <button type="button" className="btn btn-primary" onClick={() => publishNow(car)} disabled={rowBusy || !modality}>
                  <Send size={15} /> Publicar agora
                </button>
              )}
              {['erro', 'sem_vaga', 'pendente'].includes(state?.key) && (
                <button type="button" className="btn btn-outline" onClick={() => publishNow(car, { force: true })} disabled={rowBusy}>
                  <RotateCcw size={15} /> Tentar de novo
                </button>
              )}
              {state?.key === 'removido_wm' && (
                <button type="button" className="btn btn-outline" onClick={() => publishNow(car, { force: true, again: true })} disabled={rowBusy}>
                  <Send size={15} /> Publicar de novo
                </button>
              )}
              {state?.key === 'faltam' && (
                <Link to={`/admin/carros/${car.id}`} className="admin-action-btn">Completar no cadastro</Link>
              )}
              {webmotorsLive(ad) && <span className="admin-table-sub">Código na Webmotors: {ad.adCode}</span>}
              <button type="button" className="admin-action-btn" onClick={() => openPreview(car)}>
                <Eye size={14} /> Ver o anúncio
              </button>
            </>
          )}
        />
      )}

      {preview && <WebmotorsPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
      {confirmDialog}
    </>
  )
}
