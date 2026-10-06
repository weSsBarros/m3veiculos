import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeByCreator } from './viewScope.js'
import { friendlyUploadError } from './storageErrors.js'

// Contratos e documentos anexados ao cliente (tabela "customer_documents" +
// bucket PRIVADO "customer-documents"). O vendedor vê só os que ele anexou;
// admin e gerente veem todos (regra no banco).

export const CUSTOMER_DOC_TYPES = [
  { value: 'compra', label: 'Contrato de compra' },
  { value: 'entrada', label: 'Contrato de entrada do carro' },
  { value: 'entrega', label: 'Termo de entrega' },
  { value: 'pos_venda', label: 'Pós-venda' },
  { value: 'garantia', label: 'Garantia' },
  { value: 'financiamento', label: 'Financiamento / carnê' },
  { value: 'outro', label: 'Outro' },
]

export function customerDocTypeLabel(value) {
  return CUSTOMER_DOC_TYPES.find((t) => t.value === value)?.label || 'Documento'
}

function fromRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    carId: row.car_id || null,
    docType: row.doc_type,
    title: row.title || '',
    signedOn: row.signed_on || null,
    notes: row.notes || '',
    filePath: row.file_path,
    fileName: row.file_name || '',
    fileType: row.file_type || '',
    createdBy: row.created_by || null,
    externalFinancingId: row.external_financing_id || null,
    createdAt: row.created_at,
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

// Filtros opcionais: customerId, carId, externalFinancingId
export async function fetchCustomerDocuments({ customerId, carId, externalFinancingId } = {}) {
  requireSupabase()
  let query = supabase.from('customer_documents').select('*').eq('company_id', COMPANY_ID)
  if (customerId) query = query.eq('customer_id', customerId)
  if (carId) query = query.eq('car_id', carId)
  if (externalFinancingId) query = query.eq('external_financing_id', externalFinancingId)
  const { data, error } = await query.order('signed_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
  if (error) throw error
  return scopeByCreator(data.map(fromRow))
}

// Envia o arquivo e grava o registro. meta: { docType, title, signedOn, carId, notes, externalFinancingId }
export async function uploadCustomerDocument(customerId, file, meta) {
  requireSupabase()
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf'
  const path = `${COMPANY_ID}/${customerId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('customer-documents').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw friendlyUploadError(uploadError, file.name, { accepted: 'PDF ou imagem (JPG, PNG)', maxSize: '20 MB' })
  const { data, error } = await supabase
    .from('customer_documents')
    .insert({
      company_id: COMPANY_ID,
      customer_id: customerId,
      car_id: meta.carId || null,
      doc_type: meta.docType || 'compra',
      title: meta.title || '',
      signed_on: meta.signedOn || null,
      notes: meta.notes || '',
      file_path: path,
      file_name: file.name,
      file_type: file.type || '',
      ...(meta.externalFinancingId ? { external_financing_id: meta.externalFinancingId } : {}),
    })
    .select()
    .single()
  if (error) {
    // Sem o registro, o arquivo não aparece em lugar nenhum: tenta apagar
    supabase.storage.from('customer-documents').remove([path]).catch(() => {})
    throw error
  }
  return fromRow(data)
}

export async function updateCustomerDocument(id, meta) {
  requireSupabase()
  const { data, error } = await supabase
    .from('customer_documents')
    .update({
      car_id: meta.carId || null,
      doc_type: meta.docType,
      title: meta.title || '',
      signed_on: meta.signedOn || null,
      notes: meta.notes || '',
    })
    .eq('id', id)
    .eq('company_id', COMPANY_ID)
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

// Só o admin (regra no banco)
export async function deleteCustomerDocument(doc) {
  requireSupabase()
  const { error } = await supabase.from('customer_documents').delete().eq('id', doc.id).eq('company_id', COMPANY_ID)
  if (error) throw error
  await supabase.storage.from('customer-documents').remove([doc.filePath])
}

// Arquivos de um cliente que vai ser excluído (os registros saem junto com ele)
export async function removeCustomerDocumentFiles(customerId) {
  requireSupabase()
  const docs = await fetchCustomerDocuments({ customerId })
  if (docs.length > 0) await supabase.storage.from('customer-documents').remove(docs.map((d) => d.filePath))
}

export async function getCustomerDocumentSignedUrl(path) {
  requireSupabase()
  const { data, error } = await supabase.storage.from('customer-documents').createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}
