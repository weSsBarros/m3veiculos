// Edge Function "manage-sellers" — cria login da equipe (vendedor, gerente ou,
// desde a seção 69, administrador), redefine senha e exclui da equipe. A loja
// nunca fica sem administrador e o acesso da WB.Dev não é mexido pela loja.
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

  // A loja é a mesma que o banco usa nas regras (current_company_id), e o
  // papel precisa ser admin NESSA loja — ser admin em outra loja não vale aqui.
  const { data: companyId } = await userClient.rpc('current_company_id')
  if (!companyId) return json({ error: 'Apenas administradores podem gerenciar vendedores' }, 403)
  const { data: link } = await admin
    .from('user_company')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!link || link.role !== 'admin') return json({ error: 'Apenas administradores podem gerenciar vendedores' }, 403)

  // O login só pertence a esta loja (sem vínculo com outra loja)? Só então o
  // admin daqui pode redefinir a senha ou apagá-lo. Desde a seção 69 vale também
  // para outro administrador desta loja.
  async function loginOnlyHere(userId: string) {
    const { data: links } = await admin.from('user_company').select('company_id, role').eq('user_id', userId)
    return (links ?? []).every((l) => l.company_id === companyId)
  }

  // Acesso da equipe WB.Dev ou do dono da plataforma: a loja não mexe
  async function isWbdevLogin(userId: string) {
    const [{ data: team }, { data: owner }] = await Promise.all([
      admin.from('platform_team').select('user_id').eq('user_id', userId).maybeSingle(),
      admin.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
    return Boolean(team || owner)
  }

  const ROLE_NAMES: Record<string, string> = { seller: 'vendedor', manager: 'gerente', admin: 'administrador' }

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
    const role = body.role === 'admin' ? 'admin' : body.role === 'manager' ? 'manager' : 'seller'
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
      details: `Criou login do ${ROLE_NAMES[role]}`,
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
    if (await isWbdevLogin(seller.user_id)) return json({ error: 'O acesso da WB.Dev não pode ser mudado pela loja.' }, 403)
    // Um login que também acessa outra loja não pode ter a senha trocada por
    // aqui (senão o admin desta loja entraria com esse login na outra)
    if (!(await loginOnlyHere(seller.user_id))) {
      return json({ error: 'Esse login também tem acesso a outra loja. A senha só pode ser trocada pela própria pessoa.' }, 403)
    }

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

  // Excluir: apaga o login e tira a pessoa da equipe. O cadastro fica guardado
  // como excluído (inativo, sem login) para as vendas antigas manterem o nome e
  // a comissão, e o registro de atividades continuar mostrando quem fez o quê.
  if (body.action === 'delete') {
    const sellerId = String(body.sellerId ?? '')

    const { data: seller } = await admin
      .from('sellers')
      .select('id, user_id, name, role, active, deleted_at')
      .eq('id', sellerId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!seller || seller.deleted_at) return json({ error: 'Pessoa não encontrada na equipe' }, 404)
    if (seller.user_id === userData.user.id) return json({ error: 'Você não pode excluir o seu próprio acesso' }, 400)
    if (seller.user_id && (await isWbdevLogin(seller.user_id))) return json({ error: 'O acesso da WB.Dev não pode ser mudado pela loja.' }, 403)
    // Excluir um administrador: a loja precisa continuar com pelo menos um
    if (seller.user_id) {
      const { data: link } = await admin.from('user_company').select('role').eq('user_id', seller.user_id).eq('company_id', companyId).maybeSingle()
      if (link?.role === 'admin') {
        const { data: other } = await admin.rpc('company_has_other_admin', { p_company: companyId, p_user: seller.user_id })
        if (other !== true) return json({ error: 'A loja precisa de pelo menos um administrador.' }, 400)
      }
    }

    const { data: saved, error: updateError } = await admin
      .from('sellers')
      .update({ active: false, deleted_at: new Date().toISOString(), former_user_id: seller.user_id })
      .eq('id', seller.id)
      .select()
      .single()
    if (updateError) return json({ error: 'Não foi possível excluir' }, 500)

    if (seller.user_id) {
      // Só apaga o login se ele for apenas vendedor/gerente desta loja. Se a
      // mesma conta tiver outro acesso (admin aqui ou em outra loja), só tira o
      // vínculo com a equipe desta loja.
      const onlyHere = await loginOnlyHere(seller.user_id)
      const { error: accessError } = onlyHere
        ? await admin.auth.admin.deleteUser(seller.user_id)
        : await admin.from('user_company').delete().eq('user_id', seller.user_id).eq('company_id', companyId)
      if (accessError) {
        await admin.from('sellers').update({ active: seller.active, deleted_at: null, former_user_id: null }).eq('id', seller.id)
        return json({ error: 'Não foi possível apagar o login' }, 500)
      }
      if (!onlyHere) await admin.from('sellers').update({ user_id: null }).eq('id', seller.id)
    }

    await admin.from('activity_log').insert({
      company_id: companyId,
      user_id: userData.user.id,
      user_email: userData.user.email,
      action: 'delete',
      entity: 'sellers',
      entity_id: seller.id,
      label: seller.name,
      details: `Excluiu o ${ROLE_NAMES[seller.role] || 'vendedor'} e o login dele`,
    })

    return json({ seller: { ...saved, user_id: null } })
  }

  return json({ error: 'Ação desconhecida' }, 400)
})
