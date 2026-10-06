import { supabase, COMPANY_ID } from './supabaseClient.js'
import { downloadBlob } from '../utils/fillContractTemplate.js'

// Assinatura digital (seção 53): os envios ficam em "signature_requests" (a
// equipe só lê; quem grava é a Edge Function "assinaturas", que fala com a
// Autentique). O vendedor vê só os que ele mandou; admin e gerente veem todos.

function fromSigner(s) {
  return {
    role: s.role,
    name: s.name || '',
    email: s.email || '',
    viewedAt: s.viewed_at || null,
    signedAt: s.signed_at || null,
    rejectedAt: s.rejected_at || null,
    reason: s.reason || '',
  }
}

export function signatureFromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    contractId: row.contract_id || null,
    carId: row.car_id || null,
    customerId: row.customer_id || null,
    title: row.title || '',
    fileName: row.file_name || '',
    sandbox: !!row.sandbox,
    status: row.status,
    signers: Array.isArray(row.signers) ? row.signers.map(fromSigner) : [],
    signedDocumentId: row.signed_document_id || null,
    sentBy: row.sent_by || null,
    finishedAt: row.finished_at || null,
    checkedAt: row.checked_at || null,
    createdAt: row.created_at,
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

// Filtros opcionais: kind, carId, customerId, contractIds
export async function fetchSignatureRequests({ kind, carId, customerId, contractIds } = {}) {
  requireSupabase()
  if (contractIds && contractIds.length === 0) return []
  let query = supabase.from('signature_requests').select('*').eq('company_id', COMPANY_ID)
  if (kind) query = query.eq('kind', kind)
  if (contractIds) query = query.in('contract_id', contractIds)
  if (carId) query = query.eq('car_id', carId)
  if (customerId) query = query.eq('customer_id', customerId)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data.map(signatureFromRow)
}

// Quem pode assinar pela loja: [{ name, email, role }]
export async function fetchSignatureTeam() {
  requireSupabase()
  const { data, error } = await supabase.rpc('signature_team')
  if (error) throw error
  return data || []
}

async function call(body) {
  requireSupabase()
  const { data, error } = await supabase.functions.invoke('assinaturas', { body })
  if (error) {
    let message = error.message
    try {
      const payload = await error.context?.json()
      if (payload?.error) message = payload.error
    } catch {
      // resposta sem corpo JSON
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(blob)
  })
}

// kind 'venda' (contractId) ou 'entrada' (carId); signers: [{ role, name, email }]
export async function sendForSignature({ kind, contractId, carId, title, blob, fileName, signers }) {
  const fileBase64 = await blobToBase64(blob)
  const data = await call({ action: 'enviar', kind, contractId, carId, title, fileName, fileBase64, signers })
  return signatureFromRow(data.request)
}

export async function refreshSignatures(ids, force = false) {
  if (!ids.length) return []
  const data = await call({ action: 'atualizar', ids, force })
  return (data.requests || []).map(signatureFromRow)
}

export async function resendSignature(id) {
  await call({ action: 'reenviar', id })
}

export async function cancelSignature(id) {
  const data = await call({ action: 'cancelar', id })
  return signatureFromRow(data.request)
}

export async function downloadSignedPdf(id) {
  const data = await call({ action: 'baixar', id })
  const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0))
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), data.fileName || 'documento-assinado.pdf')
}
