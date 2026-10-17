import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { saveStoreSettings } from '../lib/storeSettingsApi.js'
import { MODELOS, setModeloDaLoja } from '../modelos/siteModelo.js'
import { PAINEIS, setPainelVisual } from '../modelos/painelVisual.js'
import useConfirm from '../components/useConfirm.jsx'
import './AppearanceSettings.css'

// Configurações → Aparência (seção 84, só o admin): o modelo do site e o visual do
// painel, um sem depender do outro. Ao clicar num visual do painel, ele já aparece
// (só nesta tela, até salvar); o site só muda ao salvar, para todos os visitantes.
export default function AppearanceSettings({ siteModelo, painelVisual, onSaved }) {
  const { confirm, confirmDialog } = useConfirm()
  const [site, setSite] = useState(siteModelo)
  const [painel, setPainel] = useState(painelVisual)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const painelSalvo = useRef(painelVisual)

  // Sair da tela sem salvar devolve o painel como estava
  useEffect(() => () => setPainelVisual(painelSalvo.current), [])

  const mudouSite = site !== siteModelo
  const mudouPainel = painel !== painelVisual

  function escolherPainel(id) {
    setPainel(id)
    setMsg('')
    setPainelVisual(id, { guardar: false })
  }

  async function salvar() {
    if (!mudouSite && !mudouPainel) return
    const nomeSite = MODELOS.find((m) => m.id === site)?.nome
    const nomePainel = PAINEIS.find((p) => p.id === painel)?.nome
    if (mudouSite) {
      const ok = await confirm(`O site da loja passa a abrir no modelo "${nomeSite}" para todos os visitantes, a partir de agora.`, {
        title: 'Trocar o modelo do site',
        confirmLabel: 'Usar este modelo',
      })
      if (!ok) return
    }
    setSaving(true)
    setMsg('')
    try {
      await saveStoreSettings({ ...(mudouSite && { siteModelo: site }), ...(mudouPainel && { painelVisual: painel }) })
      painelSalvo.current = painel
      setPainelVisual(painel)
      setModeloDaLoja(site)
      const partes = []
      if (mudouSite) partes.push(`O site já abre no modelo "${nomeSite}".`)
      if (mudouPainel) partes.push(`O painel de toda a equipe fica com o visual "${nomePainel}".`)
      onSaved?.({ siteModelo: site, painelVisual: painel })
      setMsg(partes.join(' '))
    } catch (err) {
      setMsg('Não foi possível salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <fieldset className="aparencia-grupo">
        <legend className="settings-subtitle">Modelo do site</legend>
        <p className="admin-form-hint">
          Use &quot;Ver no site&quot; para olhar com os carros da loja antes de escolher. Ao salvar, o site muda para todos os visitantes.
        </p>
        <div className="aparencia-grade">
          {MODELOS.map((m) => (
            <div key={m.id} className={`aparencia-opcao${site === m.id ? ' is-escolhida' : ''}`}>
              <label>
                <input type="radio" name="aparencia-site" value={m.id} checked={site === m.id} onChange={() => { setSite(m.id); setMsg('') }} />
                <MiniaturaSite id={m.id} />
                <span className="aparencia-nome">
                  {m.numero > 0 && <span className="aparencia-num">{m.numero}</span>}
                  {m.nome}
                  {site === m.id && <Check size={16} className="aparencia-check" aria-hidden="true" />}
                </span>
                <span className="aparencia-resumo">{m.resumo}</span>
                {m.id === siteModelo && <span className="aparencia-selo">No ar</span>}
              </label>
              <a className="aparencia-ver" href={`/?modelo=${m.numero}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} aria-hidden="true" /> Ver no site
              </a>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="aparencia-grupo">
        <legend className="settings-subtitle">Visual do painel</legend>
        <p className="admin-form-hint">
          Ao clicar, o painel já mostra como fica (só para você, até salvar). Depois de salvar, vale para toda a equipe. O tema claro ou escuro continua sendo de cada pessoa, no menu.
        </p>
        <div className="aparencia-grade is-painel">
          {PAINEIS.map((p) => (
            <div key={p.id} className={`aparencia-opcao${painel === p.id ? ' is-escolhida' : ''}`}>
              <label>
                <input type="radio" name="aparencia-painel" value={p.id} checked={painel === p.id} onChange={() => escolherPainel(p.id)} />
                <MiniaturaPainel id={p.id} />
                <span className="aparencia-nome">
                  {p.nome}
                  {painel === p.id && <Check size={16} className="aparencia-check" aria-hidden="true" />}
                </span>
                <span className="aparencia-resumo">{p.resumo}</span>
                {p.id === painelVisual && <span className="aparencia-selo">Em uso</span>}
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="settings-buttons">
        {msg && (
          <p className="settings-msg" role="status">
            {msg}
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={salvar} disabled={saving || (!mudouSite && !mudouPainel)}>
          {saving ? 'Salvando…' : 'Salvar aparência'}
        </button>
        {(mudouSite || mudouPainel) && !saving && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setSite(siteModelo)
              escolherPainel(painelVisual)
            }}
          >
            Desfazer
          </button>
        )}
      </div>
      {confirmDialog}
    </>
  )
}

// Desenho de cada modelo do site, nas cores da loja (não é uma foto: dá a ideia de
// como a página se organiza)
function MiniaturaSite({ id }) {
  return (
    <svg className="aparencia-mini" viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <rect className="mi-papel" width="160" height="100" />
      {id === 'atual' && (
        <>
          <rect className="mi-tinta" width="160" height="12" />
          <rect className="mi-cor" x="8" y="4" width="18" height="4" rx="1" />
          <rect className="mi-claro" x="96" y="5" width="12" height="2" rx="1" />
          <rect className="mi-claro" x="112" y="5" width="12" height="2" rx="1" />
          <rect className="mi-claro" x="128" y="5" width="12" height="2" rx="1" />
          <rect className="mi-cor" y="12" width="160" height="34" />
          <rect className="mi-sobre" x="10" y="20" width="62" height="5" rx="1" />
          <rect className="mi-sobre is-fraco" x="10" y="28" width="46" height="3" rx="1" />
          <rect className="mi-tinta" x="10" y="35" width="26" height="6" rx="2" />
          {[8, 56, 104].map((x) => (
            <g key={x}>
              <rect className="mi-linha" x={x} y="54" width="48" height="40" rx="3" />
              <rect className="mi-foto" x={x} y="54" width="48" height="22" rx="3" />
              <rect className="mi-texto" x={x + 4} y="80" width="30" height="3" rx="1" />
              <rect className="mi-cor" x={x + 4} y="86" width="20" height="3" rx="1" />
            </g>
          ))}
        </>
      )}
      {id === 'estoque' && (
        <>
          <rect className="mi-cor" x="8" y="5" width="14" height="6" rx="1" />
          <rect className="mi-campo" x="28" y="4" width="92" height="8" rx="4" />
          <circle className="mi-traco" cx="34" cy="8" r="2" />
          <rect className="mi-zap" x="126" y="4" width="26" height="8" rx="4" />
          <rect className="mi-tinta" x="8" y="18" width="52" height="5" rx="1" />
          <rect className="mi-tinta" x="8" y="27" width="20" height="6" rx="3" />
          <rect className="mi-linha" x="31" y="27" width="20" height="6" rx="3" />
          <rect className="mi-linha" x="54" y="27" width="20" height="6" rx="3" />
          <rect className="mi-linha" x="77" y="27" width="20" height="6" rx="3" />
          {[38, 50, 62, 74, 86].map((y) => (
            <g key={y}>
              <rect className="mi-foto" x="8" y={y} width="16" height="9" rx="1.5" />
              <rect className="mi-texto-forte" x="28" y={y + 1} width="48" height="3" rx="1" />
              <rect className="mi-texto" x="28" y={y + 6} width="32" height="2" rx="1" />
              <rect className="mi-cor" x="124" y={y + 2} width="28" height="4" rx="1" />
            </g>
          ))}
        </>
      )}
      {id === 'vitrine' && (
        <>
          <rect className="mi-tinta" width="160" height="66" />
          <path
            className="mi-carro"
            d="M66 50c3-7 10-11 19-12l13-7c6-3 13-4 21-3l10 1c9 2 15 7 19 14l4 2c3 1 4 3 4 6v5H66z"
          />
          <circle className="mi-tinta" cx="84" cy="56" r="6" />
          <circle className="mi-tinta" cx="136" cy="56" r="6" />
          <rect className="mi-sobre-claro" x="8" y="6" width="18" height="4" rx="1" />
          <rect className="mi-sobre-claro" x="10" y="34" width="40" height="7" rx="1" />
          <rect className="mi-sobre-claro is-fraco" x="10" y="44" width="30" height="3" rx="1" />
          <rect className="mi-cor" x="10" y="51" width="26" height="6" rx="1" />
          <circle className="mi-sobre-claro" cx="140" cy="62" r="1.3" />
          <circle className="mi-sobre-claro is-fraco" cx="145" cy="62" r="1.3" />
          <circle className="mi-sobre-claro is-fraco" cx="150" cy="62" r="1.3" />
          {[8, 58, 108].map((x) => (
            <g key={x}>
              <rect className="mi-foto" x={x} y="72" width="44" height="18" rx="2" />
              <rect className="mi-texto-forte" x={x} y="93" width="26" height="3" rx="1" />
            </g>
          ))}
        </>
      )}
      {id === 'bairro' && (
        <>
          <rect className="mi-tinta" width="160" height="6" />
          <rect className="mi-cor" x="8" y="9" width="16" height="6" rx="1" />
          <rect className="mi-zap" x="124" y="9" width="28" height="6" rx="3" />
          <rect className="mi-cor" y="19" width="160" height="27" />
          <rect className="mi-sobre" x="10" y="25" width="64" height="5" rx="1" />
          <rect className="mi-sobre is-fraco" x="10" y="33" width="48" height="3" rx="1" />
          <g transform="rotate(-4 129 32)">
            <rect className="mi-tinta" x="112" y="24" width="34" height="16" rx="2" />
            <rect className="mi-sobre-claro" x="118" y="29" width="22" height="6" rx="1" />
          </g>
          {[8, 58, 108].map((x) => (
            <g key={x}>
              <rect className="mi-linha" x={x} y="52" width="44" height="42" rx="3" />
              <rect className="mi-foto" x={x} y="52" width="44" height="20" rx="3" />
              <g transform={`rotate(-4 ${x + 14} 72)`}>
                <rect className="mi-cor" x={x + 3} y="68" width="22" height="7" rx="1" />
              </g>
              <rect className="mi-texto" x={x + 4} y="79" width="28" height="2.5" rx="1" />
              <rect className="mi-zap" x={x + 4} y="85" width="36" height="6" rx="3" />
            </g>
          ))}
        </>
      )}
    </svg>
  )
}

// Desenho do painel com cada visual do menu
function MiniaturaPainel({ id }) {
  const compacto = id === 'compacto'
  const menu = id === 'escuro' ? 'mi-tinta' : id === 'cor' ? 'mi-cor' : 'mi-papel'
  const claro = id === 'atual' || compacto
  const raio = compacto ? 1.5 : 3
  const itens = compacto ? [12, 19, 26, 33, 40, 47, 54] : [12, 22, 32, 42, 52]
  return (
    <svg className="aparencia-mini is-painel" viewBox="0 0 120 76" aria-hidden="true" focusable="false">
      <rect className="mi-fundo" width="120" height="76" />
      <rect className={menu} width="30" height="76" />
      {claro && <rect className="mi-linha" x="29.5" width="0.8" height="76" />}
      {itens.map((y, i) => (
        <rect
          key={y}
          className={i === 1 ? (claro ? 'mi-cor-claro' : 'mi-sobre-claro') : claro ? 'mi-texto' : 'mi-sobre-claro is-fraco'}
          x={i === 1 ? 3 : 6}
          y={i === 1 ? y - 2 : y}
          width={i === 1 ? 24 : 18}
          height={i === 1 ? (compacto ? 5 : 7) : 3}
          rx={i === 1 ? raio / 1.5 : 1}
        />
      ))}
      <rect className="mi-texto-forte" x="38" y={compacto ? 6 : 8} width="36" height="4" rx="1" />
      <rect className="mi-papel mi-borda" x="38" y={compacto ? 14 : 18} width="36" height={compacto ? 18 : 20} rx={raio} />
      <rect className="mi-papel mi-borda" x="78" y={compacto ? 14 : 18} width="36" height={compacto ? 18 : 20} rx={raio} />
      <rect className="mi-cor" x="42" y={compacto ? 18 : 23} width="16" height="4" rx="1" />
      <rect className="mi-texto" x="82" y={compacto ? 18 : 23} width="20" height="3" rx="1" />
      <rect className="mi-papel mi-borda" x="38" y={compacto ? 36 : 42} width="76" height={compacto ? 34 : 28} rx={raio} />
      {(compacto ? [41, 48, 55, 62] : [48, 56, 64]).map((y) => (
        <rect key={y} className="mi-texto" x="42" y={y} width="62" height="2.5" rx="1" />
      ))}
    </svg>
  )
}
