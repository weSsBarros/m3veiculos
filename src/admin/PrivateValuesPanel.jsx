import { useEffect, useState } from 'react'
import { ArrowRightLeft, Lock, LockOpen, Users } from 'lucide-react'
import {
  fetchCarValuesState,
  fetchCarValuesPeople,
  lockCarValues,
  unlockCarValues,
  shareCarValues,
  transferCarValues,
} from '../lib/privateValuesApi.js'
import useConfirm from '../components/useConfirm.jsx'

const dateBR = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')
const namesText = (list) =>
  list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`

// Cadeado dos valores do carro (seção 73), no cadastro do carro, só para o
// administrador. Quem ativa vira o dono: só essa pessoa (e quem ela liberar) vê
// o custo, os gastos e a margem; ela libera para todos, escolhe quem mais vê ou
// passa o cadeado. onAccessLost: o dono passou o cadeado sem continuar vendo (a
// tela carrega o carro de novo, já sem os valores).
export default function PrivateValuesPanel({ carId, onAccessLost }) {
  const { confirm, confirmDialog } = useConfirm()
  const [state, setState] = useState(null)
  const [people, setPeople] = useState(null)
  const [mode, setMode] = useState('')
  const [chosen, setChosen] = useState([])
  const [newOwner, setNewOwner] = useState('')
  const [keep, setKeep] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    try {
      setState(await fetchCarValuesState(carId))
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os valores privados.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId])

  async function openMode(next) {
    setError('')
    setMessage('')
    if (next === 'share') setChosen(state.viewers.map((v) => v.id))
    if (next === 'transfer') {
      setNewOwner('')
      setKeep(true)
    }
    setMode(next)
    if (!people) {
      try {
        setPeople(await fetchCarValuesPeople())
      } catch (err) {
        setError(err.message)
      }
    }
  }

  async function run(action, done) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
      setMode('')
      await load()
      setMessage(done)
    } catch (err) {
      setError(err.message || 'Não deu certo. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  async function lock() {
    const ok = await confirm(
      'Só você vai ver o custo de aquisição, os gastos, a margem e o lucro deste carro. Os outros administradores continuam vendo e ' +
        'editando o carro (fotos, preço, status, venda), mas sem esses valores, e o carro fica fora das contas de dinheiro deles. ' +
        'Você pode liberar depois.',
      { title: 'Ativar valores privados', confirmLabel: 'Ativar' }
    )
    if (ok) run(() => lockCarValues(carId), 'Valores privados ativados: só você vê os valores deste carro.')
  }

  async function unlock() {
    const ok = await confirm('Todos os administradores da loja voltam a ver o custo, os gastos e a margem deste carro.', {
      title: 'Liberar para todos',
      confirmLabel: 'Liberar',
    })
    if (ok) run(() => unlockCarValues(carId), 'Valores liberados para todos os administradores.')
  }

  function saveShare() {
    const names = (people || []).filter((p) => chosen.includes(p.id)).map((p) => p.name)
    run(() => shareCarValues(carId, chosen), names.length ? `Liberado para ${namesText(names)}.` : 'Agora só você vê os valores.')
  }

  async function transfer() {
    const person = (people || []).find((p) => p.id === newOwner)
    if (!person) return setError('Escolha quem vai ficar com o cadeado.')
    const ok = await confirm(
      `${person.name} passa a ter o cadeado: só essa pessoa libera ou passa adiante.` +
        (keep ? ' Você continua vendo os valores.' : ' Você deixa de ver os valores deste carro.'),
      { title: 'Passar o cadeado', confirmLabel: 'Passar' }
    )
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await transferCarValues(carId, newOwner, keep)
      setMode('')
      await load()
      setMessage(`Cadeado passado para ${person.name}.`)
      if (!keep) onAccessLost?.()
    } catch (err) {
      setError(err.message || 'Não deu certo. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return error ? <p className="admin-error">{error}</p> : null
  }

  const viewerNames = state.viewers.map((v) => v.name)
  let status
  if (!state.locked) {
    status = state.canLock
      ? 'Desligado: todos os administradores veem o custo, os gastos e a margem deste carro.'
      : `Desligado. Só quem cadastrou este carro (${state.creatorName}) pode ativar.`
  } else if (state.isOwner) {
    status = `Ligado por você${state.since ? ` em ${dateBR(state.since)}` : ''}: ${
      viewerNames.length ? `você e ${namesText(viewerNames)} veem` : 'só você vê'
    } o custo, os gastos e a margem.`
  } else if (state.canSee) {
    status = `Ligado por ${state.ownerName}, que liberou para você ver os valores.`
  } else {
    status = `Ligado por ${state.ownerName}: só quem ativou (e quem for liberado) vê o custo, os gastos e a margem. Para você, o carro fica fora das contas de dinheiro.`
  }

  return (
    <div className={`private-values${state.locked ? ' is-locked' : ''}`}>
      <div className="private-values-head">
        <span className="private-values-icon" aria-hidden="true">
          {state.locked ? <Lock size={18} /> : <LockOpen size={18} />}
        </span>
        <div className="private-values-text">
          <strong>Valores privados</strong>
          <span>{status}</span>
        </div>
      </div>

      {!state.locked && state.canLock && (
        <div className="private-values-actions">
          <button type="button" className="btn btn-outline" onClick={lock} disabled={busy}>
            <Lock size={15} /> Ativar valores privados
          </button>
        </div>
      )}

      {state.isOwner && !mode && (
        <div className="private-values-actions">
          <button type="button" className="btn btn-outline" onClick={() => openMode('share')} disabled={busy}>
            <Users size={15} /> Quem mais vê
          </button>
          <button type="button" className="btn btn-outline" onClick={() => openMode('transfer')} disabled={busy}>
            <ArrowRightLeft size={15} /> Passar o cadeado
          </button>
          <button type="button" className="btn btn-outline" onClick={unlock} disabled={busy}>
            <LockOpen size={15} /> Liberar para todos
          </button>
        </div>
      )}

      {mode === 'share' && (
        <fieldset className="private-values-box">
          <legend>Quem mais vê os valores deste carro</legend>
          {!people ? (
            <p className="admin-muted">Carregando…</p>
          ) : people.length === 0 ? (
            <p className="admin-muted">A loja não tem outro administrador.</p>
          ) : (
            people.map((p) => (
              <label key={p.id} className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={chosen.includes(p.id)}
                  onChange={(e) => setChosen((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                />
                {p.name}
              </label>
            ))
          )}
          <div className="private-values-actions">
            <button type="button" className="btn btn-primary" onClick={saveShare} disabled={busy || !people}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setMode('')} disabled={busy}>
              Cancelar
            </button>
          </div>
        </fieldset>
      )}

      {mode === 'transfer' && (
        <fieldset className="private-values-box">
          <legend>Passar o cadeado para</legend>
          {people && people.length === 0 ? (
            <p className="admin-muted">A loja não tem outro administrador.</p>
          ) : (
            <>
              <select value={newOwner} onChange={(e) => setNewOwner(e.target.value)} disabled={!people} aria-label="Quem fica com o cadeado">
                <option value="">{people ? 'Escolha o administrador' : 'Carregando…'}</option>
                {(people || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <label className="admin-checkbox">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                Continuar vendo os valores
              </label>
            </>
          )}
          <div className="private-values-actions">
            <button type="button" className="btn btn-primary" onClick={transfer} disabled={busy || !newOwner}>
              {busy ? 'Passando…' : 'Passar o cadeado'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setMode('')} disabled={busy}>
              Cancelar
            </button>
          </div>
        </fieldset>
      )}

      {error && <p className="admin-error" role="alert">{error}</p>}
      {message && <p className="admin-success" role="status">{message}</p>}
      {confirmDialog}
    </div>
  )
}
