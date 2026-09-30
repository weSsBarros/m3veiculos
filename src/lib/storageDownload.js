import { supabase } from './supabaseClient.js'
import { downloadBlob } from '../utils/downloadBlob.js'

// Baixa um arquivo privado do Storage (documentos do carro, anexos de gastos,
// documentos do cliente, modelos de contrato) com o nome original. Quem pode
// baixar é quem pode ver o arquivo (regras do banco).
export async function downloadStorageFile(bucket, path, fileName) {
  if (!supabase) throw new Error('Supabase não configurado.')
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  downloadBlob(data, fileName || path.split('/').pop())
}
