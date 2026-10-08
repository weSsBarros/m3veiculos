import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { fetchWebmotorsAccount, fetchWebmotorsAds, fetchWebmotorsLists, previewWebmotorsAd } from '../lib/webmotorsApi.js'
import { webmotorsCarState, webmotorsLive } from '../utils/webmotorsStatus.js'
import { PORTAL_TONE_CLASS } from '../utils/portalStatus.js'
import { parseIntBR } from '../utils/carFormat.js'
import { useAuth } from '../context/AuthContext.jsx'
import WebmotorsCatalogPicker from './WebmotorsCatalogPicker.jsx'
import WebmotorsPreviewDialog from './WebmotorsPreviewDialog.jsx'

// Seção "Webmotors" do cadastro do carro (seção 61): "Publicar na Webmotors", a
// marca, o modelo e a versão da Webmotors (e, se quiser, cor, câmbio e
// combustível da lista dela) e a situação do anúncio. Só aparece com a
// Webmotors conectada (aba Portais) e some com a aba Portais fora do plano da
// loja (ou escondida de todos).
export default function WebmotorsCarSection({ car, carId, noPrice, onChange }) {
  const { isStoreTabHidden } = useAuth()
  const [account, setAccount] = useState(null)
  const [ad, setAd] = useState(null)
  const [lists, setLists] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    let active = true
    fetchWebmotorsAccount()
      .then((acc) => {
        if (!active) return
        setAccount(acc)
        if (!acc?.connected) return
        // Carro novo: começa marcado (ou não) conforme o ajuste da loja
        if (!carId && car.webmotorsPublish === undefined) onChange('webmotorsPublish', acc.settings.publishDefault)
        fetchWebmotorsLists().then((data) => active && setLists(data)).catch(() => {})
        if (carId) {
          fetchWebmotorsAds()
            .then((list) => active && setAd(list.find((a) => a.carId === carId) || null))
            .catch(() => {})
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId])

  if (isStoreTabHidden('portais') || !account?.connected) return null

  if (car.category === 'moto') {
    return (
      <section className="admin-form-section">
        <h2>Webmotors</h2>
        <p className="admin-form-note">A Webmotors usa outro serviço para motos: este cadastro não vai para a Webmotors.</p>
      </section>
    )
  }

  // A situação usa o que está no formulário agora (preço e km ainda em texto)
  const formCar = { ...car, id: carId || car.id, price: noPrice ? null : parseIntBR(car.price), km: parseIntBR(car.km) }
  const state = webmotorsCarState(formCar, ad, { account, siteUrl: window.location.origin, lists })

  async function openPreview() {
    setPreview({ loading: true })
    try {
      setPreview({ loading: false, ...(await previewWebmotorsAd(carId)) })
    } catch (err) {
      setPreview({ loading: false, error: err.message })
    }
  }

  return (
    <section className="admin-form-section">
      <h2>Webmotors</h2>
      <label className="admin-checkbox">
        <input type="checkbox" checked={car.webmotorsPublish !== false} onChange={(e) => onChange('webmotorsPublish', e.target.checked)} />
        Publicar na Webmotors (enquanto estiver disponível e visível no site)
      </label>
      {car.webmotorsPublish !== false && (
        <>
          <WebmotorsCatalogPicker car={formCar} value={car.webmotorsCatalog} onChange={(next) => onChange('webmotorsCatalog', next)} />
          {state && (
            <div className="olx-car-state">
              <span className={`admin-pill ${PORTAL_TONE_CLASS[state.tone]}`}>{state.label}</span>
              {state.detail && <span className="admin-form-note">{state.detail}</span>}
              {webmotorsLive(ad) && <span className="admin-form-note">Código na Webmotors: {ad.adCode}</span>}
              {carId && (
                <button type="button" className="admin-action-btn" onClick={openPreview}>
                  <Eye size={14} /> Ver o anúncio
                </button>
              )}
            </div>
          )}
          <p className="admin-form-note">
            A Webmotors usa os códigos dela para marca, modelo e versão. Cor, câmbio e combustível vão pela lista da Webmotors que combina com o
            cadastro (dá para trocar acima). As mudanças vão quando o carro é salvo
            {account.autoPublish ? '' : ' (com a publicação automática ligada em Portais; sem ela, use "Publicar agora" lá)'}.
          </p>
        </>
      )}
      {preview && <WebmotorsPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </section>
  )
}
