import { supabase, COMPANY_ID } from './supabaseClient.js'

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    filePath: row.file_path,
    originalFilename: row.original_filename || '',
    createdAt: row.created_at,
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

export async function uploadContractTemplate(name, file) {
  requireSupabase()
  const path = `${COMPANY_ID}/${crypto.randomUUID()}.docx`
  const { error: uploadError } = await supabase.storage.from('contract-templates').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError
  const { data, error } = await supabase
    .from('contract_templates')
    .insert({ company_id: COMPANY_ID, name, file_path: path, original_filename: file.name })
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteContractTemplate(template) {
  requireSupabase()
  await supabase.storage.from('contract-templates').remove([template.filePath])
  const { error } = await supabase.from('contract_templates').delete().eq('id', template.id).eq('company_id', COMPANY_ID)
  if (error) throw error
}

export async function downloadContractTemplateFile(filePath) {
  requireSupabase()
  const { data, error } = await supabase.storage.from('contract-templates').download(filePath)
  if (error) throw error
  return data.arrayBuffer()
}
