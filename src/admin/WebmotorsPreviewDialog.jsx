import { formatCurrency } from '../utils/carFormat.js'
import { webmotorsMissingText } from '../utils/webmotorsStatus.js'
import PortalPreviewDialog from './PortalPreviewDialog.jsx'

// Campos "S/N" do anúncio que aparecem como selo quando são "S"
const FLAGS = {
  UnicoDono: 'Único dono',
  IpvaPago: 'IPVA pago',
  Licenciado: 'Licenciado',
  Blindado: 'Blindado',
  GarantiaDeFabrica: 'Garantia de fábrica',
  RevisoesEmConcessionaria: 'Revisões na concessionária',
  AdaptadoDeficientesFisicos: 'Adaptado para PcD',
  NaoAceitaTroca: 'Não aceita troca',
}

// O anúncio como vai para a Webmotors, montado com o cadastro salvo (prévia da
// Edge Function). Na loja de demonstração é o que seria enviado.
export default function WebmotorsPreviewDialog({ preview, onClose }) {
  const ad = preview.ad
  const labels = preview.labels || {}
  const flags = ad ? Object.entries(FLAGS).filter(([key]) => ad[key] === 'S').map(([, label]) => label) : []
  const rows = ad
    ? [
        ['Marca', `${labels.marca} (código ${ad.CodigoMarca})`],
        ['Modelo', `${labels.modelo} (código ${ad.CodigoModelo})`],
        ['Versão', `${labels.versao} (código ${ad.CodigoVersao})`],
        ['Ano', `${ad.AnoFabricacao}/${ad.AnoDoModelo}`],
        ['Km', String(ad.Km)],
        ['Placa (não aparece no anúncio)', ad.Placa],
        ['Portas', String(ad.NrPortas)],
        ['Cor', labels.cor],
        ['Câmbio', labels.cambio],
        ['Combustível', labels.combustivel],
        ['Modalidade do plano', labels.modalidade || String(ad.CodigoModalidade)],
      ]
    : []
  return (
    <PortalPreviewDialog name="Webmotors" preview={preview} missingText={webmotorsMissingText} onClose={onClose}>
      {ad && (
        <div className="olx-preview">
          <p>
            <strong>{labels.marca} {labels.modelo} {labels.versao}</strong> ·{' '}
            {ad.PrecoReal > ad.PrecoVenda ? <>de {formatCurrency(ad.PrecoReal)} por </> : null}
            {formatCurrency(ad.PrecoVenda)}
          </p>
          {flags.length > 0 && <p className="admin-table-sub">{flags.join(' · ')}</p>}
          <div className="olx-preview-photos">
            {(preview.photos || []).map((url) => <img key={url} src={url} alt="" loading="lazy" />)}
          </div>
          <pre className="olx-preview-body">{ad.Observacao}</pre>
          <dl className="olx-preview-params">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <div>
              <dt>Opcionais</dt>
              <dd>{labels.opcionais?.length ? labels.opcionais.join(', ') : 'nenhum dos destaques bateu com a lista da Webmotors'}</dd>
            </div>
          </dl>
          <details>
            <summary>Ver os dados enviados</summary>
            <pre className="olx-preview-json">{JSON.stringify(ad, null, 2)}</pre>
          </details>
        </div>
      )}
    </PortalPreviewDialog>
  )
}
