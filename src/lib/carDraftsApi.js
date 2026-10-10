import { supabase, COMPANY_ID } from './supabaseClient.js'
import { deleteCarImage } from './carsApi.js'

// Rascunhos do celular (seção 72): as fotos tiradas pela câmera do painel ficam
// aqui, fora do estoque e do site, até alguém completar o cadastro no computador.

function fromRow(row) {
  return {
    id: row.id,
    images: Array.isArray(row.images) ? row.images : [],
    note: row.note || '',
    createdBy: row.created_by || null,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.')
}

export async function fetchCarDrafts() {
  requireSupabase()
  const { data, error } = await supabase
    .from('car_drafts')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function fetchCarDraft(id) {
  requireSupabase()
  const { data, error } = await supabase.from('car_drafts').select('*').eq('id', id).eq('company_id', COMPANY_ID).maybeSingle()
  if (error) throw error
  return data ? fromRow(data) : null
}

export async function createCarDraft({ images = [], note = '' } = {}) {
  requireSupabase()
  const { data, error } = await supabase
    .from('car_drafts')
    .insert({ company_id: COMPANY_ID, images, note: note.trim() })
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function updateCarDraft(id, { images, note }) {
  requireSupabase()
  const patch = {}
  if (images !== undefined) patch.images = images
  if (note !== undefined) patch.note = note.trim()
  const { data, error } = await supabase.from('car_drafts').update(patch).eq('id', id).eq('company_id', COMPANY_ID).select('*').single()
  if (error) throw error
  return fromRow(data)
}

// removePhotos: apaga também as fotos do site (rascunho descartado). Ao virar
// carro, as fotos passam para o cadastro e só o rascunho sai.
export async function deleteCarDraft(draft, { removePhotos = false } = {}) {
  requireSupabase()
  const { error } = await supabase.from('car_drafts').delete().eq('id', draft.id).eq('company_id', COMPANY_ID)
  if (error) throw error
  if (removePhotos) {
    for (const url of draft.images) {
      try {
        await deleteCarImage(url)
      } catch {
        // Foto que não saiu do site fica órfã; o rascunho já foi apagado
      }
    }
  }
}
