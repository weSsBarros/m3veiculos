// "Você já fez o PIX?" (seção 94, pedido do Wesley em 20/10/2026): as lojas pagavam o
// PIX (créditos ou mensalidade) e não clicavam em "Já paguei". Depois de copiar o
// código ou a chave, a pergunta aparece quando a pessoa volta para o painel (foi pagar
// no app do banco). Fica guardada no navegador por 2 horas, para valer também quando o
// celular recarrega a página na volta.

export const PIX_PROMPT_TTL_MS = 2 * 60 * 60 * 1000
// Saídas curtas (um clique fora da janela, a caixa de copiar) não contam como "foi pagar"
export const PIX_AWAY_MIN_MS = 2000

const key = (kind) => `pix_pergunta:${kind}`

// O navegador pode recusar o armazenamento (janela anônima): aí só não lembra
function read(storage, k) {
  try {
    return storage?.getItem(k) ?? null
  } catch {
    return null
  }
}

function write(storage, k, value) {
  try {
    if (value == null) storage?.removeItem(k)
    else storage?.setItem(k, value)
  } catch {
    // sem armazenamento: a pergunta só vale enquanto a página estiver aberta
  }
}

// Copiou o PIX: guarda o valor (e os meses da mensalidade) para perguntar na volta
export function armPixPrompt(storage, { kind, amount, months = [] }, now = Date.now()) {
  if (!kind || !(Number(amount) > 0)) return null
  const entry = { kind, amount: Number(amount), months: [...months], at: now }
  write(storage, key(kind), JSON.stringify(entry))
  return entry
}

// O PIX copiado nas últimas 2 horas (ou nada)
export function readPixPrompt(storage, kind, now = Date.now()) {
  const raw = read(storage, key(kind))
  if (!raw) return null
  let entry
  try {
    entry = JSON.parse(raw)
  } catch {
    write(storage, key(kind), null)
    return null
  }
  const at = Number(entry?.at)
  if (!entry || entry.kind !== kind || !(Number(entry.amount) > 0) || !(now - at < PIX_PROMPT_TTL_MS) || at > now) {
    write(storage, key(kind), null)
    return null
  }
  return { kind, amount: Number(entry.amount), months: Array.isArray(entry.months) ? entry.months : [], at }
}

export function clearPixPrompt(storage, kind) {
  write(storage, key(kind), null)
}

// Voltou para o painel depois de sair por tempo bastante para pagar
export function cameBack(awayAt, now = Date.now()) {
  return awayAt != null && now - awayAt >= PIX_AWAY_MIN_MS
}

// A página abriu de novo depois de copiar o PIX (o celular recarregou na volta do banco):
// pergunta já ao abrir. Copiado nesta mesma página, espera a pessoa sair e voltar.
export function askOnOpen(entry, pageLoadedAt) {
  return Boolean(entry) && Number(entry.at) < Number(pageLoadedAt)
}
