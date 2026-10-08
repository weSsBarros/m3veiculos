import { formatCurrency } from '../utils/carFormat.js'
import { olxMissingText } from '../utils/olxStatus.js'
import PortalPreviewDialog from './PortalPreviewDialog.jsx'

const PARAM_LABELS = {
  vehicle_brand: 'Marca (id da OLX)',
  vehicle_model: 'Modelo (id da OLX)',
  vehicle_version: 'Versão (id da OLX)',
  cubiccms: 'Cilindrada (id da OLX)',
  regdate: 'Ano',
  mileage: 'Km',
  vehicle_tag: 'Placa (não aparece no anúncio)',
}

// O anúncio como vai para a OLX, montado com o cadastro salvo (prévia da
// Edge Function). Na loja de demonstração é o que seria enviado.
export default function OlxPreviewDialog({ preview, onClose }) {
  const ad = preview.ad
  return (
    <PortalPreviewDialog name="OLX" preview={preview} missingText={olxMissingText} onClose={onClose}>
      {ad && (
        <div className="olx-preview">
          <p><strong>{ad.subject}</strong> · {formatCurrency(ad.price)}</p>
          <p className="admin-table-sub">Telefone {ad.phone} · CEP {ad.zipcode} · categoria {ad.category === 2060 ? 'Motos' : 'Carros, vans e utilitários'}</p>
          <div className="olx-preview-photos">
            {ad.images.map((url) => <img key={url} src={url} alt="" loading="lazy" />)}
          </div>
          <pre className="olx-preview-body">{ad.body}</pre>
          <dl className="olx-preview-params">
            {Object.entries(ad.params).map(([key, value]) => (
              <div key={key}>
                <dt>{PARAM_LABELS[key] || key}</dt>
                <dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>Ver o JSON enviado</summary>
            <pre className="olx-preview-json">{JSON.stringify(ad, null, 2)}</pre>
          </details>
        </div>
      )}
    </PortalPreviewDialog>
  )
}
