// Sessão encerrada fora deste aparelho (outro aparelho ou aba saiu, senha
// trocada, login excluído). O resto do painel ainda funciona até o acesso
// vencer, mas as Edge Functions conferem a sessão no servidor e respondem 401
// ("Não autenticado"). O painel sai só aqui e a tela de login avisa.

export const SESSION_ENDED_MESSAGE = 'Sua sessão foi encerrada. Entre de novo para continuar.'

// Erro do auth.getUser() que quer dizer "esta sessão não vale mais". Falha de
// rede (sem status) não conta: a pessoa continua logada.
export function isDeadSessionError(error) {
  if (!error) return false
  if (error.name === 'AuthSessionMissingError') return true
  if (['session_not_found', 'session_expired', 'refresh_token_not_found', 'user_not_found', 'bad_jwt'].includes(error.code)) {
    return true
  }
  return error.status === 401 || error.status === 403
}

// Resposta de uma Edge Function: no 401, confere se a sessão ainda existe. Se
// não existe, chama onDead (sair neste aparelho) e troca o erro pelo aviso;
// senão, devolve a resposta como veio (o corpo continua sem ler).
export async function checkFunctionResult(result, { sessionIsDead, onDead }) {
  if (result?.error?.context?.status !== 401) return result
  let dead = false
  try {
    dead = await sessionIsDead()
  } catch {
    dead = false
  }
  if (!dead) return result
  await onDead()
  return { ...result, data: null, error: new Error(SESSION_ENDED_MESSAGE) }
}
