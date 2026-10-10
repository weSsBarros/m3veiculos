import { supabase } from './supabaseClient.js'

// Valores privados do carro (seção 73): o cadeado de um sócio sobre o custo, os
// gastos e a margem. Tudo passa pelas funções do banco, que conferem quem pode.

async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

// { locked, ownerName, isOwner, canSee, since, viewers: [{ id, name }], canLock, creatorName }
export async function fetchCarValuesState(carId) {
  const s = (await call('car_values_state', { p_car: carId })) || {}
  return {
    locked: s.locked === true,
    ownerName: s.owner_name || '',
    isOwner: s.is_owner === true,
    canSee: s.can_see !== false,
    since: s.since || null,
    viewers: (s.viewers || []).map((v) => ({ id: v.id, name: v.name })),
    canLock: s.can_lock === true,
    creatorName: s.creator_name || '',
  }
}

// Administradores da loja para liberar ou passar o cadeado (sem quem chama)
export async function fetchCarValuesPeople() {
  return ((await call('car_values_people')) || []).map((p) => ({ id: p.id, name: p.name }))
}

export function lockCarValues(carId) {
  return call('car_values_lock', { p_car: carId })
}

export function unlockCarValues(carId) {
  return call('car_values_unlock', { p_car: carId })
}

// viewerIds: a lista completa de quem mais vê (vazia = só o dono)
export function shareCarValues(carId, viewerIds) {
  return call('car_values_share', { p_car: carId, p_viewers: viewerIds })
}

export function transferCarValues(carId, newOwnerId, keepAccess) {
  return call('car_values_transfer', { p_car: carId, p_new_owner: newOwnerId, p_keep_access: keepAccess })
}
