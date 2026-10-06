import { supabase, COMPANY_ID } from './supabaseClient.js'
import { DOCX_MIME } from '../utils/fillContractTemplate.js'

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    filePath: row.file_path,
    originalFilename: row.original_filename || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    // 'venda' (tela Contratos) ou 'entrada' (cadastro do carro) — seção 51
    kind: row.kind || 'venda',
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

export async function fetchAllContractTemplates() {
  requireSupabase()
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchContractTemplate(id) {
  requireSupabase()
  const { data, error } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function uploadContractTemplate(name, file, kind = 'venda') {
  requireSupabase()
  const path = `${COMPANY_ID}/${crypto.randomUUID()}.docx`
  const { error: uploadError } = await supabase.storage.from('contract-templates').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError
  const { data, error } = await supabase
    .from('contract_templates')
    .insert({ company_id: COMPANY_ID, name, file_path: path, original_filename: file.name, kind })
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

// Salva o modelo editado: o arquivo novo vai para o Storage com outro nome e o
// anterior fica nas versões (save_contract_template_file, seção 47).
export async function saveContractTemplateFile(template, arrayBuffer) {
  requireSupabase()
  const path = `${COMPANY_ID}/${crypto.randomUUID()}.docx`
  const body = new Blob([arrayBuffer], { type: DOCX_MIME })
  const { error: uploadError } = await supabase.storage.from('contract-templates').upload(path, body, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError
  const { error } = await supabase.rpc('save_contract_template_file', { p_template: template.id, p_file_path: path })
  if (error) {
    await supabase.storage.from('contract-templates').remove([path])
    throw error
  }
  return fetchContractTemplate(template.id)
}

export async function updateContractTemplateKind(id, kind) {
  requireSupabase()
  const { error } = await supabase.from('contract_templates').update({ kind }).eq('id', id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

export async function fetchContractTemplateVersions(templateId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('contract_template_versions')
    .select('id, file_path, created_at')
    .eq('company_id', COMPANY_ID)
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({ id: row.id, filePath: row.file_path, createdAt: row.created_at }))
}

export async function restoreContractTemplateVersion(versionId) {
  requireSupabase()
  const { error } = await supabase.rpc('restore_contract_template_version', { p_version: versionId })
  if (error) throw error
}

// Exclui o modelo e os arquivos dele (atual e versões anteriores), menos os que
// algum contrato gerado ainda usa para ser baixado de novo.
export async function deleteContractTemplate(template) {
  requireSupabase()
  const versions = await fetchContractTemplateVersions(template.id).catch(() => [])
  const paths = [template.filePath, ...versions.map((v) => v.filePath)]
  const { data: used } = await supabase
    .from('contracts')
    .select('template_file_path')
    .eq('company_id', COMPANY_ID)
    .in('template_file_path', paths)
  const keep = new Set((used || []).map((row) => row.template_file_path))
  const remove = paths.filter((p) => !keep.has(p))
  if (remove.length) await supabase.storage.from('contract-templates').remove(remove)
  const { error } = await supabase.from('contract_templates').delete().eq('id', template.id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

export async function downloadContractTemplateFile(filePath) {
  requireSupabase()
  const { data, error } = await supabase.storage.from('contract-templates').download(filePath)
  if (error) throw error
  return data.arrayBuffer()
}
