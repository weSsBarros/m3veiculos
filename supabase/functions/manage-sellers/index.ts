// Edge Function "manage-sellers" — cria login da equipe (vendedor ou gerente)
// e redefine senha.
// Só um usuário com papel 'admin' consegue chamar, e só age dentro da
// própria empresa. A service role key existe apenas aqui no servidor.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'Não autenticado' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: link } = await admin
    .from('user_company')
    .select('company_id, role')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!link || link.role !== 'admin') return json({ error: 'Apenas administradores podem gerenciar vendedores' }, 403)
  const companyId = link.company_id

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requisição inválida' }, 400)
  }

  const password = typeof body.password === 'string' ? body.password : ''

  if (body.action === 'create') {
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const phone = String(body.phone ?? '').trim()
    const role = body.role === 'manager' ? 'manager' : 'seller'
    const commissionType = ['percent', 'fixed', 'none'].includes(String(body.commissionType)) ? String(body.commissionType) : 'percent'
    const commissionValue = commissionType === 'none' ? 0 : Number(body.commissionValue ?? 0)

    if (!name) return json({ error: 'Informe o nome do vendedor' }, 400)
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'E-mail inválido' }, 400)
    if (password.length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres' }, 400)
    if (!Number.isFinite(commissionValue) || commissionValue < 0) return json({ error: 'Comissão inválida' }, 400)
    if (commissionType === 'percent' && commissionValue > 100) return json({ error: 'Comissão em % não pode passar de 100' }, 400)

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created?.user) {
      const msg = createError?.message?.includes('already') ? 'Já existe um usuário com esse e-mail' : createError?.message
      return json({ error: msg || 'Não foi possível criar o login' }, 400)
    }
    const newUserId = created.user.id

    const { error: linkError } = await admin
      .from('user_company')
      .insert({ user_id: newUserId, company_id: companyId, role })
    if (linkError) {
      await admin.auth.admin.deleteUser(newUserId)
      return json({ error: 'Não foi possível vincular o usuário à loja' }, 500)
    }

    const { data: seller, error: sellerError } = await admin
      .from('sellers')
      .insert({
        company_id: companyId,
        user_id: newUserId,
        role,
        name,
        email,
        phone,
        commission_type: commissionType,
        commission_value: commissionValue,
      })
      .select()
      .single()
    if (sellerError) {
      await admin.from('user_company').delete().eq('user_id', newUserId)
      await admin.auth.admin.deleteUser(newUserId)
      return json({ error: 'Não foi possível cadastrar o vendedor' }, 500)
    }

    await admin.from('activity_log').insert({
      company_id: companyId,
      user_id: userData.user.id,
      user_email: userData.user.email,
      action: 'insert',
      entity: 'sellers',
      entity_id: seller.id,
      label: name,
      details: role === 'manager' ? 'Criou login do gerente' : 'Criou login do vendedor',
    })

    return json({ seller })
  }

  if (body.action === 'reset_password') {
    const sellerId = String(body.sellerId ?? '')
    if (password.length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres' }, 400)

    const { data: seller } = await admin
      .from('sellers')
      .select('user_id, name')
      .eq('id', sellerId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!seller?.user_id) return json({ error: 'Vendedor não encontrado' }, 404)

    const { error } = await admin.auth.admin.updateUserById(seller.user_id, { password })
    if (error) return json({ error: 'Não foi possível redefinir a senha' }, 500)

    await admin.from('activity_log').insert({
      company_id: companyId,
      user_id: userData.user.id,
      user_email: userData.user.email,
      action: 'update',
      entity: 'sellers',
      entity_id: sellerId,
      label: seller.name,
      details: 'Redefiniu a senha',
    })

    return json({ ok: true })
  }

  return json({ error: 'Ação desconhecida' }, 400)
})
