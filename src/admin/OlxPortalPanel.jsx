import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCcw, ExternalLink, Eye, Send, RotateCcw, Link2, Unlink, Wand2, Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { updateCarOlx } from '../lib/carsApi.js'
import {
  fetchOlxAccount, fetchOlxAds, saveOlxSettings, connectOlx, disconnectOlx, syncOlx, previewOlxAd, renewOlxAd, fetchOlxCatalog,
} from '../lib/olxApi.js'
import { olxCarState, olxContext, olxSellerPhones, olxCatalogLabel, olxStateOrder } from '../utils/olxStatus.js'
import { formatPortalDateTime } from '../utils/portalStatus.js'
import { olxRankBrands, olxRankModels, olxRankVersions, olxRankCc, olxConfident, olxMissing } from '../utils/olxAd.js'
import useConfirm from '../components/useConfirm.jsx'
import OlxCatalogPicker from './OlxCatalogPicker.jsx'
import OlxPreviewDialog from './OlxPreviewDialog.jsx'
import PortalCarList from './PortalCarList.jsx'

const CONNECT_ERRORS = {
  negado: 'A conexão foi cancelada na OLX (o acesso não foi autorizado).',
  expirado: 'O link de conexão venceu. Clique em "Conectar conta da OLX" de novo.',
  token: 'A OLX não confirmou a conexão. Tente de novo; se continuar, fale com a WB.Dev.',
  banco: 'Não foi possível guardar a conexão. Tente de novo.',
  olx: 'A OLX não completou a conexão. Tente de novo.',
}

const ACCOUNT_STATUS = {
  conectada: { label: 'Conectada', tone: 'is-success' },
  sem_plano: { label: 'Sem plano Empresa', tone: 'is-danger' },
  erro: { label: 'Precisa conectar de novo', tone: 'is-danger' },
}

function liveAd(ad) {
  return ad && ad.operation === 'insert' && ['publicado', 'aguardando', 'expirado'].includes(ad.status)
}

// OLX na aba Portais (seção 59): conta, publicação automática, ajustes e a
// situação de cada carro. cars/setCars e sellers vêm da aba (compartilhados com
// os outros portais); reloadKey muda quando a pessoa clica em "Atualizar".
export default function OlxPortalPanel({ cars, setCars, sellers, reloadKey }) {
  const { isAdmin } = useAuth()
  const { confirm, confirmDialog } = useConfirm()
  const [params, setParams] = useSearchParams()
  const [account, setAccount] = useState(null)
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState(() => (params.get('filtro') === 'problemas' && params.get('portal') !== 'webmotors' ? 'problemas' : 'todos'))
  const [editing, setEditing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [draft, setDraft] = useState(null)
  const [suggestion, setSuggestion] = useState('')

  async function load() {
    setError('')
    try {
      const acc = await fetchOlxAccount({ fresh: true })
      setAccount(acc)
      setDraft(acc?.connected ? { ...acc.settings } : null)
      setAds(acc?.connected ? await fetchOlxAds() : [])
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a OLX.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  useEffect(() => {
    // Volta do login na OLX: ?olx=conectada ou ?olx=erro&motivo=...
    const result = params.get('olx')
    if (result) {
      setNotice(result === 'conectada'
        ? { tone: 'success', text: 'Conta da OLX conectada. Confira os carros abaixo e, quando estiver tudo certo, ligue a publicação automática.' }
        : { tone: 'error', text: CONNECT_ERRORS[params.get('motivo')] || CONNECT_ERRORS.olx })
      const next = new URLSearchParams(params)
      next.delete('olx')
      next.delete('motivo')
      setParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sellerPhones = useMemo(() => olxSellerPhones(sellers), [sellers])
  const adsByCar = useMemo(() => new Map(ads.filter((a) => a.carId).map((a) => [a.carId, a])), [ads])
  const ctx = useMemo(() => ({ account, sellerPhones, siteUrl: window.location.origin }), [account, sellerPhones])

  // Carros em estoque e os vendidos que ainda estão saindo da OLX
  const rows = useMemo(() => {
    if (!account?.connected) return []
    return cars
      .filter((car) => car.status !== 'vendido' || liveAd(adsByCar.get(car.id)) || adsByCar.get(car.id)?.status === 'removendo')
      .map((car) => {
        const ad = adsByCar.get(car.id) || null
        return { car, ad, state: olxCarState(car, ad, ctx) }
      })
      .sort((a, b) => olxStateOrder(a.state) - olxStateOrder(b.state) || `${a.car.brand} ${a.car.model}`.localeCompare(`${b.car.brand} ${b.car.model}`))
  }, [cars, adsByCar, ctx, account])

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
    setAds(await fetchOlxAds())
  }

  function syncMessage(result) {
    if (result?.busy) return 'A OLX já está sendo atualizada agora. Confira de novo em instantes.'
    const parts = []
    if (result?.sent && account?.isDemo) {
      return `Pronto: ${result.sent} ${result.sent === 1 ? 'anúncio simulado' : 'anúncios simulados'}. Na loja de demonstração nada vai para a OLX.`
    }
    if (result?.sent) parts.push(`${result.sent} ${result.sent === 1 ? 'anúncio enviado' : 'anúncios enviados'}`)
    if (result?.removed) parts.push(`${result.removed} saindo da OLX`)
    return parts.length ? `Pronto: ${parts.join(', ')}. A OLX leva alguns minutos para processar.` : 'Tudo em dia com a OLX.'
  }

  const handleConnect = () => run('connect', connectOlx)

  const handleDisconnect = () =>
    run('disconnect', async () => {
      if (!(await confirm('Desconectar a conta da OLX desta loja? Os carros deixam de ir para a OLX.', { title: 'Desconectar OLX', confirmLabel: 'Desconectar' }))) return
      const live = ads.filter((a) => liveAd(a) || a.status === 'simulado').length
      const removeAds = live > 0 && (await confirm(
        `Tirar da OLX ${live === 1 ? 'o anúncio publicado' : `os ${live} anúncios publicados`} pelo sistema? Se deixar, eles continuam no ar e a loja cuida deles direto na OLX.`,
        { title: 'Anúncios na OLX', confirmLabel: 'Tirar da OLX', cancelLabel: 'Deixar no ar' },
      ))
      await disconnectOlx(removeAds)
      await load()
      setNotice({ tone: 'success', text: 'Conta da OLX desconectada.' })
    })

  const toggleAuto = (next) =>
    run('auto', async () => {
      const ready = rows.filter((r) => r.state?.key === 'pronto').length
      const message = next
        ? `Ligar a publicação automática? ${ready ? `${ready === 1 ? 'O carro pronto vai' : `Os ${ready} carros prontos vão`} para a OLX agora. ` : ''}Depois, carro novo ou editado vai sozinho, e o que for vendido, reservado, ocultado ou desmarcado sai sozinho.`
        : 'Desligar a publicação automática? Os anúncios que já estão na OLX continuam lá (e saem quando o carro é vendido), mas carro novo não vai mais sozinho.'
      if (!(await confirm(message, { title: 'Publicação automática', confirmLabel: next ? 'Ligar' : 'Desligar' }))) return
      const acc = await saveOlxSettings({ autoPublish: next })
      setAccount(acc)
      if (next) {
        const result = await syncOlx({ manual: true })
        await refreshAds()
        setNotice({ tone: 'success', text: syncMessage(result) })
      }
    })

  const saveSettings = (e) => {
    e.preventDefault()
    run('settings', async () => {
      const acc = await saveOlxSettings({ publishDefault: draft.publishDefault, footer: draft.footer, exchange: draft.exchange })
      setAccount(acc)
      setDraft({ ...acc.settings })
      setNotice({ tone: 'success', text: 'Ajustes da OLX salvos. Os anúncios são atualizados na próxima sincronização.' })
    })
  }

  const syncNow = () =>
    run('sync', async () => {
      const result = await syncOlx({ manual: true })
      await load()
      setNotice({ tone: 'success', text: syncMessage(result) })
    })

  const togglePublish = (car) =>
    run(`pub-${car.id}`, async () => {
      const updated = await updateCarOlx(car.id, { olxPublish: car.olxPublish === false })
      setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
    })

  const saveCatalog = (car) =>
    run(`cat-${car.id}`, async () => {
      const updated = await updateCarOlx(car.id, { olxCatalog: { ...editing.value, auto: false } })
      setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
      setEditing(null)
    })

  const publishNow = (car, { force = false, again = false } = {}) =>
    run(`send-${car.id}`, async () => {
      if (again && !(await confirm('Publicar de novo na OLX? A OLX conta como um anúncio novo no plano da loja.', { title: 'Publicar de novo', confirmLabel: 'Publicar' }))) return
      const result = await syncOlx({ carIds: [car.id], force })
      await refreshAds()
      setNotice({ tone: 'success', text: syncMessage(result) })
    })

  const renew = (car) =>
    run(`renew-${car.id}`, async () => {
      await renewOlxAd(car.id)
      await refreshAds()
      setNotice({ tone: 'success', text: 'Anúncio renovado. A OLX revisa e ele volta ao ar.' })
    })

  async function openPreview(car) {
    setPreview({ loading: true })
    try {
      setPreview({ loading: false, ...(await previewOlxAd(car.id)) })
    } catch (err) {
      setPreview({ loading: false, error: err.message })
    }
  }

  // Escolhe a versão da OLX de todos os carros em que a combinação é clara
  const suggestAll = () =>
    run('suggest', async () => {
      const pending = rows.filter((r) => r.car.olxPublish !== false && olxMissing(r.car, olxContext(r.car, ctx)).some((m) => m === 'catalogo' || m === 'cilindrada'))
      let done = 0
      for (const [index, { car }] of pending.entries()) {
        setSuggestion(`Procurando a versão da OLX: ${index + 1} de ${pending.length}…`)
        const kind = car.category === 'moto' ? 'moto' : 'carro'
        const next = { ...(car.olxCatalog || {}) }
        if (!next.brandId) {
          const brand = olxConfident(olxRankBrands(car.brand, await fetchOlxCatalog({ kind, level: 'marcas' })))
          if (brand) Object.assign(next, { brandId: brand.id, brandName: brand.name })
        }
        if (next.brandId && !next.modelId) {
          const model = olxConfident(olxRankModels(car.model, await fetchOlxCatalog({ kind, level: 'modelos', brandId: next.brandId })))
          if (model) Object.assign(next, { modelId: model.id, modelName: model.name })
        }
        if (next.modelId && !next.versionId) {
          const version = olxConfident(olxRankVersions(car, await fetchOlxCatalog({ kind, level: 'versoes', brandId: next.brandId, modelId: next.modelId }), next.modelName))
          if (version) Object.assign(next, { versionId: version.id, versionName: version.name })
        }
        if (kind === 'moto' && !next.ccId) {
          const cc = olxConfident(olxRankCc(car, await fetchOlxCatalog({ kind, level: 'cilindradas' })))
          if (cc) Object.assign(next, { ccId: cc.id, ccName: cc.name })
        }
        const complete = next.brandId && next.modelId && (kind === 'moto' ? next.ccId : next.versionId)
        if (JSON.stringify(next) !== JSON.stringify(car.olxCatalog || {})) {
          const updated = await updateCarOlx(car.id, { olxCatalog: { ...next, auto: true } })
          setCars((prev) => prev.map((c) => (c.id === car.id ? updated : c)))
        }
        if (complete) done += 1
      }
      setSuggestion('')
      const left = pending.length - done
      setNotice({
        tone: 'success',
        text: pending.length === 0
          ? 'Todos os carros já têm a versão da OLX.'
          : `${done} ${done === 1 ? 'carro ficou' : 'carros ficaram'} com a versão da OLX (confira as sugestões).${left ? ` ${left} ${left === 1 ? 'precisa' : 'precisam'} que você escolha.` : ''}`,
      })
    }).finally(() => setSuggestion(''))

  if (loading) return <p className="admin-muted">Carregando a OLX…</p>

  const accountStatus = ACCOUNT_STATUS[account?.status] || ACCOUNT_STATUS.conectada

  return (
    <>
      {error && <p className="admin-error">{error}</p>}
      {notice && <p className={notice.tone === 'error' ? 'admin-error' : 'admin-success'}>{notice.text}</p>}

      <section className="admin-form-section portals-card">
        <div className="portals-card-head">
          <span className="portals-logo" aria-hidden="true">OLX</span>
          <div className="portals-card-title">
            <h2>OLX</h2>
            {account?.connected ? (
              <p>
                Conectada como <strong>{account.userName || account.userEmail || 'conta da loja'}</strong>
                {account.userName && account.userEmail ? ` (${account.userEmail})` : ''}
              </p>
            ) : (
              <p>Os carros disponíveis vão sozinhos para a OLX e saem quando são vendidos, reservados ou ocultados.</p>
            )}
          </div>
          {account?.connected && <span className={`admin-pill ${accountStatus.tone}`}>{accountStatus.label}</span>}
        </div>

        {account?.isDemo && (
          <p className="portals-demo">Loja de demonstração: dá para conectar e ver tudo, mas nada vai para a OLX (os anúncios ficam como “Simulado”).</p>
        )}

        {!account?.connected ? (
          <>
            <p className="admin-form-hint">Para conectar, a loja precisa de:</p>
            <ul className="portals-requirements">
              <li>conta na OLX com <strong>plano Empresa</strong> (Essencial, Plus ou Premium Empresa): a OLX não aceita anúncios por integração em plano de autônomo;</li>
              <li>o <strong>CEP da loja</strong> em Configurações → Dados fiscais (a região do anúncio);</li>
              <li>em cada carro, a <strong>placa</strong> e a <strong>versão da OLX</strong> (o sistema sugere).</li>
            </ul>
            {isAdmin ? (
              <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={busy === 'connect'}>
                <Link2 size={15} /> {busy === 'connect' ? 'Abrindo a OLX…' : 'Conectar conta da OLX'}
              </button>
            ) : (
              <p className="admin-form-note">Peça ao administrador da loja para conectar a conta da OLX.</p>
            )}
            <p className="admin-form-note">Você entra na OLX com a conta da loja e autoriza a WB.Dev a publicar os anúncios. A senha fica só na OLX.</p>
          </>
        ) : (
          <>
            {account.statusDetail && <p className="admin-error">{account.statusDetail}</p>}
            <label className="admin-checkbox portals-auto">
              <input type="checkbox" checked={account.autoPublish} disabled={!isAdmin || busy === 'auto'} onChange={(e) => toggleAuto(e.target.checked)} />
              <span>
                <strong>Publicação automática</strong>
                {account.autoPublish
                  ? ' ligada: carro novo ou editado vai sozinho, e o que sai de venda é tirado da OLX.'
                  : ' desligada: só vai o que você mandar com “Publicar agora” (vendido, reservado ou oculto continua saindo sozinho).'}
              </span>
            </label>

            {isAdmin && draft && (
              <details className="portals-settings">
                <summary>Ajustes dos anúncios</summary>
                <form onSubmit={saveSettings} className="admin-form">
                  <label className="admin-checkbox">
                    <input type="checkbox" checked={draft.publishDefault} onChange={(e) => setDraft({ ...draft, publishDefault: e.target.checked })} />
                    Carro novo já vem marcado “Publicar na OLX”
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
                    Não coloque telefone, site ou link: a OLX recusa anúncio com contato na descrição. O telefone do anúncio é o WhatsApp do
                    carro ou, sem ele, o número principal da loja.
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
                <Wand2 size={15} /> {busy === 'suggest' ? 'Sugerindo…' : 'Sugerir versões da OLX'}
              </button>
              {isAdmin && (
                <button type="button" className="btn btn-outline admin-delete-btn" onClick={handleDisconnect} disabled={busy === 'disconnect'}>
                  <Unlink size={15} /> Desconectar
                </button>
              )}
            </div>
            {suggestion && <p className="admin-form-note">{suggestion}</p>}
            {account.lastSyncAt && <p className="admin-form-note">Última sincronização: {formatPortalDateTime(account.lastSyncAt)}. O sistema confere a OLX sozinho a cada 10 minutos.</p>}
          </>
        )}
      </section>

      {account?.connected && (
        <PortalCarList
          name="OLX"
          rows={rows}
          filter={filter}
          onFilter={setFilter}
          busy={busy}
          isPublished={(car) => car.olxPublish !== false}
          onTogglePublish={togglePublish}
          renderCatalog={(car, rowBusy) => {
            const catalogLabel = olxCatalogLabel(car.olxCatalog)
            const isEditing = editing?.carId === car.id
            return (
              <>
                <div className="portals-item-catalog">
                  <span className={catalogLabel ? '' : 'is-missing'}>
                    {catalogLabel ? `Versão da OLX: ${catalogLabel}` : 'Sem a versão da OLX'}
                    {catalogLabel && car.olxCatalog?.auto ? ' (sugerida)' : ''}
                  </span>
                  {!isEditing && (
                    <button type="button" className="admin-action-btn" onClick={() => setEditing({ carId: car.id, value: { ...(car.olxCatalog || {}) } })}>
                      {catalogLabel ? 'Trocar' : 'Escolher'}
                    </button>
                  )}
                </div>
                {isEditing && (
                  <div className="portals-item-editor admin-form">
                    <OlxCatalogPicker car={car} value={editing.value} onChange={(value) => setEditing({ carId: car.id, value })} />
                    <div className="admin-row-actions">
                      <button type="button" className="btn btn-primary" onClick={() => saveCatalog(car)} disabled={rowBusy}>
                        <Save size={15} /> Salvar versão
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
                <button type="button" className="btn btn-primary" onClick={() => publishNow(car)} disabled={rowBusy}>
                  <Send size={15} /> Publicar agora
                </button>
              )}
              {['erro', 'recusado', 'sem_vaga', 'pendente'].includes(state?.key) && (
                <button type="button" className="btn btn-outline" onClick={() => publishNow(car, { force: true })} disabled={rowBusy}>
                  <RotateCcw size={15} /> Tentar de novo
                </button>
              )}
              {state?.key === 'removido_olx' && (
                <button type="button" className="btn btn-outline" onClick={() => publishNow(car, { force: true, again: true })} disabled={rowBusy}>
                  <Send size={15} /> Publicar de novo
                </button>
              )}
              {state?.key === 'expirado' && (
                <button type="button" className="btn btn-outline" onClick={() => renew(car)} disabled={rowBusy}>
                  <RotateCcw size={15} /> Renovar
                </button>
              )}
              {state?.key === 'faltam' && (
                <Link to={`/admin/carros/${car.id}`} className="admin-action-btn">Completar no cadastro</Link>
              )}
              {ad?.url && liveAd(ad) && (
                <a href={ad.url} target="_blank" rel="noreferrer" className="admin-action-btn">
                  <ExternalLink size={14} /> Ver na OLX
                </a>
              )}
              <button type="button" className="admin-action-btn" onClick={() => openPreview(car)}>
                <Eye size={14} /> Ver o anúncio
              </button>
            </>
          )}
        />
      )}

      {preview && <OlxPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
      {confirmDialog}
    </>
  )
}
