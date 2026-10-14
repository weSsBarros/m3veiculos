import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SESSION_ENDED_MESSAGE, isDeadSessionError, checkFunctionResult } from '../src/lib/sessionEnded.js'

function functionError(status) {
  return { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status } }
}

test('isDeadSessionError: sessão que não existe mais no servidor', () => {
  assert.equal(isDeadSessionError({ code: 'session_not_found', status: 403 }), true)
  assert.equal(isDeadSessionError({ name: 'AuthSessionMissingError' }), true)
  assert.equal(isDeadSessionError({ code: 'bad_jwt', status: 403 }), true)
  assert.equal(isDeadSessionError({ status: 401 }), true)
})

test('isDeadSessionError: sem erro ou falha de rede não derruba ninguém', () => {
  assert.equal(isDeadSessionError(null), false)
  assert.equal(isDeadSessionError(undefined), false)
  assert.equal(isDeadSessionError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), false)
  assert.equal(isDeadSessionError({ status: 500 }), false)
})

test('checkFunctionResult: 401 com a sessão encerrada sai e troca o erro pelo aviso', async () => {
  let saiu = 0
  const result = await checkFunctionResult(
    { data: null, error: functionError(401) },
    { sessionIsDead: async () => true, onDead: async () => { saiu++ } },
  )
  assert.equal(saiu, 1)
  assert.equal(result.data, null)
  assert.equal(result.error.message, SESSION_ENDED_MESSAGE)
  assert.equal(result.error.context, undefined)
})

test('checkFunctionResult: 401 com a sessão valendo devolve a resposta como veio', async () => {
  const original = { data: null, error: functionError(401) }
  let saiu = 0
  const result = await checkFunctionResult(original, { sessionIsDead: async () => false, onDead: async () => { saiu++ } })
  assert.equal(result, original)
  assert.equal(saiu, 0)
})

test('checkFunctionResult: outros códigos nem conferem a sessão', async () => {
  let conferiu = 0
  const sessionIsDead = async () => {
    conferiu++
    return true
  }
  for (const original of [{ data: { ok: true }, error: null }, { data: null, error: functionError(403) }, { data: null, error: functionError(402) }]) {
    assert.equal(await checkFunctionResult(original, { sessionIsDead, onDead: async () => {} }), original)
  }
  assert.equal(conferiu, 0)
})

test('checkFunctionResult: se a conferência falhar, a resposta fica como veio', async () => {
  const original = { data: null, error: functionError(401) }
  const result = await checkFunctionResult(original, {
    sessionIsDead: async () => {
      throw new Error('sem internet')
    },
    onDead: async () => assert.fail('não deveria sair'),
  })
  assert.equal(result, original)
})
