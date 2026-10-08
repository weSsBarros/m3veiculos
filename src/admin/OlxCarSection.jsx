import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Eye } from 'lucide-react'
import { fetchOlxAccount, fetchOlxAds, previewOlxAd } from '../lib/olxApi.js'
import { olxCarState, OLX_TONE_CLASS } from '../utils/olxStatus.js'
import { parseIntBR } from '../utils/carFormat.js'
import { useAuth } from '../context/AuthContext.jsx'
import OlxCatalogPicker from './OlxCatalogPicker.jsx'
import OlxPreviewDialog from './OlxPreviewDialog.jsx'

// Seção "OLX" do cadastro do carro (seção 59): "Publicar na OLX", a marca, o
// modelo e a versão do catálogo da OLX e a situação do anúncio. Só aparece com
// a conta da OLX conectada (aba Portais) e some com a aba Portais fora do plano
// da loja (ou escondida de todos).
export default function OlxCarSection({ car, carId, sellerPhones, noPrice, onChange }) {
  const { isStoreTabHidden } = useAuth()
  const [account, setAccount] = useState(null)
  const [ad, setAd] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    let active = true
    fetchOlxAccount()
      .then((acc) => {
        if (!active) return
        setAccount(acc)
        // Carro novo: começa marcado (ou não) conforme o ajuste da loja
        if (acc?.connected && !carId && car.olxPublish === undefined) onChange('olxPublish', acc.settings.publishDefault)
      })
      .catch(() => {})
    if (carId) {
      fetchOlxAds()
        .then((list) => active && setAd(list.find((a) => a.carId === carId) || null))
        .catch(() => {})
    }
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId])

  if (isStoreTabHidden('portais') || !account) return null
  if (!account.connected) {
    return (
      <section className="admin-form-section">
        <h2>OLX</h2>
        <p className="admin-form-note">
          A loja ainda não conectou a conta da OLX. Com ela conectada (em <Link to="/admin/portais">Portais</Link>), os carros disponíveis
          vão sozinhos para a OLX.
        </p>
      </section>
    )
  }

  // A situação usa o que está no formulário agora (preço e km ainda em texto)
  const formCar = { ...car, id: carId || car.id, price: noPrice ? null : parseIntBR(car.price), km: parseIntBR(car.km) }
  const state = olxCarState(formCar, ad, { account, sellerPhones, siteUrl: window.location.origin })

  async function openPreview() {
    setPreview({ loading: true })
    try {
      setPreview({ loading: false, ...(await previewOlxAd(carId)) })
    } catch (err) {
      setPreview({ loading: false, error: err.message })
    }
  }

  return (
    <section className="admin-form-section">
      <h2>OLX</h2>
      <label className="admin-checkbox">
        <input type="checkbox" checked={car.olxPublish !== false} onChange={(e) => onChange('olxPublish', e.target.checked)} />
        Publicar na OLX (enquanto estiver disponível e visível no site)
      </label>
      {car.olxPublish !== false && (
        <>
          <OlxCatalogPicker car={car} value={car.olxCatalog} onChange={(next) => onChange('olxCatalog', next)} />
          {state && (
            <div className="olx-car-state">
              <span className={`admin-pill ${OLX_TONE_CLASS[state.tone]}`}>{state.label}</span>
              {state.detail && <span className="admin-form-note">{state.detail}</span>}
              {ad?.url && ['publicado', 'aguardando', 'expirado'].includes(ad.status) && (
                <a href={ad.url} target="_blank" rel="noreferrer" className="admin-action-btn">
                  <ExternalLink size={14} /> Ver na OLX
                </a>
              )}
              {carId && (
                <button type="button" className="admin-action-btn" onClick={openPreview}>
                  <Eye size={14} /> Ver o anúncio
                </button>
              )}
            </div>
          )}
          <p className="admin-form-note">
            A OLX monta o título pela marca, modelo e versão do catálogo dela e confere a placa. As mudanças vão para a OLX quando o carro
            é salvo{account.autoPublish ? '' : ' (com a publicação automática ligada em Portais; sem ela, use "Publicar agora" lá)'}.
          </p>
        </>
      )}
      {preview && <OlxPreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </section>
  )
}
