import { supabase, COMPANY_ID } from './supabaseClient.js'
import { scopeByCreator } from './viewScope.js'

function fromRow(row) {
  return {
    id: row.id,
    carId: row.car_id,
    customerId: row.customer_id || null,
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
    documentType: row.document_type || 'contrato',
    // Modelo próprio usado (seção 47): o "Baixar" gera de novo com o mesmo arquivo
    templateId: row.template_id || null,
    templateFilePath: row.template_file_path || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  }
}

function toRow(contract) {
  return {
    car_id: contract.carId || null,
    customer_id: contract.customerId || null,
    company_id: COMPANY_ID,
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
    document_type: contract.documentType || 'contrato',
    template_id: contract.templateId || null,
    template_file_path: contract.templateFilePath || null,
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
    .eq('company_id', COMPANY_ID)
    .order('created_at', { ascending: false })
  if (error) throw error
  return scopeByCreator(data.map(fromRow))
}

// Contratos gerados para um cliente (o vendedor recebe só os que ele gerou)
export async function fetchContractsForCustomer(customerId) {
  requireSupabase()
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return scopeByCreator(data.map(fromRow))
}

export async function createContract(contract) {
  requireSupabase()
  const { data, error } = await supabase.from('contracts').insert(toRow(contract)).select().single()
  if (error) throw error
  return fromRow(data)
}
