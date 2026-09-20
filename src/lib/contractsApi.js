import { supabase } from './supabaseClient.js'

function fromRow(row) {
  return {
    id: row.id,
    carId: row.car_id,
    company: {
      name: row.company_name,
      document: row.company_document,
      address: row.company_address || '',
      phone: row.company_phone || '',
      email: row.company_email || '',
    },
    buyer: {
      name: row.buyer_name,
      document: row.buyer_document,
      rg: row.buyer_rg || '',
      address: row.buyer_address || '',
      phone: row.buyer_phone || '',
      email: row.buyer_email || '',
    },
    vehicle: row.vehicle_snapshot || {},
    salePrice: row.sale_price,
    paymentMethod: row.payment_method || '',
    paymentDetails: row.payment_details || '',
    saleDate: row.sale_date,
    saleCity: row.sale_city || '',
    notes: row.notes || '',
    createdAt: row.created_at,
  }
}

function toRow(contract) {
  return {
    car_id: contract.carId || null,
    company_name: contract.company.name,
    company_document: contract.company.document,
    company_address: contract.company.address || '',
    company_phone: contract.company.phone || '',
    company_email: contract.company.email || '',
    buyer_name: contract.buyer.name,
    buyer_document: contract.buyer.document,
    buyer_rg: contract.buyer.rg || '',
    buyer_address: contract.buyer.address || '',
    buyer_phone: contract.buyer.phone || '',
    buyer_email: contract.buyer.email || '',
    vehicle_snapshot: contract.vehicle || {},
    sale_price: contract.salePrice,
    payment_method: contract.paymentMethod || '',
    payment_details: contract.paymentDetails || '',
    sale_date: contract.saleDate,
    sale_city: contract.saleCity || '',
    notes: contract.notes || '',
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase não configurado. Preencha o arquivo .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }
}

// -- Contratos gerados (painel /admin/contratos, requer login) ---------------

export async function fetchContractsAdmin() {
  requireSupabase()
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function createContract(contract) {
  requireSupabase()
  const { data, error } = await supabase.from('contracts').insert(toRow(contract)).select().single()
  if (error) throw error
  return fromRow(data)
}
