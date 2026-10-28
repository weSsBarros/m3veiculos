// Edge Function "manage-sellers" — cria login da equipe (vendedor, gerente ou,
// desde a seção 69, administrador), redefine senha, troca o e-mail do login e
// exclui da equipe. A loja nunca fica sem administrador e o acesso da WB.Dev não
// é mexido pela loja. Desde a seção 96 a senha definida pelo painel fica guardada
// cifrada (Vault) para o admin da loja ver ("Ver senha", registrado no histórico),
// e qualquer pessoa da equipe troca o próprio e-mail e a própria senha em "Minha
// conta" (com a senha atual). As ações da Equipe só valem para um usuário com
// papel 'admin', e só dentro da própria empresa. A service role key existe apenas
// aqui no servidor.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_RE = /^\S+@\S+\.\S+$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Mensagem do Auth em português (e-mail repetido é o caso comum)
function authError(error: { message?: string } | null, fallback: string) {
  return /already|registered|exists/i.test(error?.message ?? '') ? 'Já existe um login com esse e-mail' : fallback
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
  const me = userData.user

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requisição inválida' }, 400)
  }

  const password = typeof body.password === 'string' ? body.password : ''

  // A loja é a mesma que o banco usa nas regras (current_company_id)
  const { data: companyId } = await userClient.rpc('current_company_id')

  // O login só pertence a esta loja (sem vínculo com outra loja)? Só então o
  // admin daqui pode redefinir a senha, trocar o e-mail, ver a senha ou apagá-lo.
  // Desde a seção 69 vale também para outro administrador desta loja.
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

  // Guarda a senha definida pelo painel para o admin da loja ver (seção 96). O banco
  // não guarda a da equipe WB.Dev, a do dono da plataforma nem a de login de duas
  // lojas. Falhar aqui não desfaz a troca: a senha só fica sem cópia guardada.
  async function savePassword(userId: string, pw: string, origin: 'cadastro' | 'admin' | 'propria') {
    const { error } = await admin.rpc('login_password_save', { p_user: userId, p_password: pw, p_origin: origin, p_by: me.id })
    if (error) console.warn('manage-sellers: senha não guardada', error.message)
  }

  async function logActivity(action: string, sellerId: string | null, label: string, details: string) {
    await admin.from('activity_log').insert({
      company_id: companyId,
      user_id: me.id,
      user_email: me.email,
      action,
      entity: 'sellers',
      entity_id: sellerId,
      label,
      details,
    })
  }

  // Minha conta: qualquer pessoa da equipe troca o próprio e-mail e a própria
  // senha, confirmando com a senha atual
  if (body.action === 'my_account') {
    if (!companyId) return json({ error: 'Sem acesso a esta loja' }, 403)
    const currentEmail = (me.email ?? '').toLowerCase()
    const email = String(body.email ?? '').trim().toLowerCase()
    const changeEmail = email !== '' && email !== currentEmail
    const changePassword = password !== ''
    if (!changeEmail && !changePassword) return json({ error: 'Nada para mudar: troque o e-mail ou digite a nova senha' }, 400)
    if (changeEmail && !EMAIL_RE.test(email)) return json({ error: 'E-mail inválido' }, 400)
    if (changePassword && password.length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres' }, 400)

    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const { data: matches } = await admin.rpc('login_password_matches', { p_user: me.id, p_password: currentPassword })
    if (matches === null) return json({ error: 'Não deu para conferir a senha atual. Peça ao administrador da loja para trocar.' }, 400)
    if (matches !== true) return json({ error: 'A senha atual não confere' }, 400)

    const changes: Record<string, unknown> = {}
    if (changeEmail) {
      changes.email = email
      changes.email_confirm = true
    }
    if (changePassword) changes.password = password
    const { error } = await admin.auth.admin.updateUserById(me.id, changes)
    if (error) return json({ error: authError(error, 'Não foi possível salvar') }, 400)
    if (changeEmail) await admin.from('sellers').update({ email }).eq('user_id', me.id)
    if (changePassword) await savePassword(me.id, password, 'propria')

    const { data: mine } = await admin.from('sellers').select('id, name').eq('user_id', me.id).eq('company_id', companyId).maybeSingle()
    const emailText = `o próprio e-mail (${currentEmail} → ${email})`
    const details = changeEmail && changePassword
      ? `Trocou ${emailText} e a própria senha`
      : changeEmail ? `Trocou ${emailText}` : 'Trocou a própria senha'
    await logActivity('update', mine?.id ?? null, mine?.name ?? currentEmail, details)
    return json({ ok: true, email: changeEmail ? email : me.email })
  }

  // Daqui para baixo, só o administrador da loja. O papel precisa ser admin NESSA
  // loja: ser admin em outra loja não vale aqui.
  if (!companyId) return json({ error: 'Apenas administradores podem gerenciar vendedores' }, 403)
  const { data: link } = await admin
    .from('user_company')
    .select('role')
    .eq('user_id', me.id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!link || link.role !== 'admin') return json({ error: 'Apenas administradores podem gerenciar vendedores' }, 403)

  const ROLE_NAMES: Record<string, string> = { seller: 'vendedor', manager: 'gerente', admin: 'administrador' }

  // Pessoa desta loja com login que o admin pode mexer (senha e e-mail). Recusa a
  // equipe WB.Dev e o login que também entra em outra loja.
  async function editableLogin(sellerId: string, otherStoreMessage: string) {
    const { data: seller } = await admin
      .from('sellers')
      .select('id, user_id, name, email, deleted_at')
      .eq('id', sellerId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!seller || seller.deleted_at || !seller.user_id) return { seller: null, failure: json({ error: 'Esta pessoa não tem login' }, 404) }
    if (await isWbdevLogin(seller.user_id)) return { seller: null, failure: json({ error: 'O acesso da WB.Dev não pode ser mudado pela loja.' }, 403) }
    if (!(await loginOnlyHere(seller.user_id))) {
      return { seller: null, failure: json({ error: `Esse login também tem acesso a outra loja. ${otherStoreMessage}` }, 403) }
    }
    return { seller, failure: null }
  }

  if (body.action === 'create') {
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const phone = String(body.phone ?? '').trim()
    const role = body.role === 'admin' ? 'admin' : body.role === 'manager' ? 'manager' : 'seller'
    // 'tier' = pela faixa do carro vendido (seção 78); 'price_band' = pela faixa de valor da
    // venda (seção 82): nos dois o valor vem da faixa na hora da venda
    const commissionType = ['percent', 'fixed', 'none', 'tier', 'price_band'].includes(String(body.commissionType)) ? String(body.commissionType) : 'percent'
    const commissionValue = ['none', 'tier', 'price_band'].includes(commissionType) ? 0 : Number(body.commissionValue ?? 0)

    if (!name) return json({ error: 'Informe o nome do vendedor' }, 400)
    if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido' }, 400)
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

    await logActivity('insert', seller.id, name, `Criou login do ${ROLE_NAMES[role]}`)
    await savePassword(newUserId, password, 'cadastro')

    return json({ seller })
  }

  if (body.action === 'reset_password') {
    if (password.length < 6) return json({ error: 'A senha precisa ter pelo menos 6 caracteres' }, 400)
    // Um login que também acessa outra loja não pode ter a senha trocada por
    // aqui (senão o admin desta loja entraria com esse login na outra)
    const { seller, failure } = await editableLogin(String(body.sellerId ?? ''), 'A senha só pode ser trocada pela própria pessoa.')
    if (failure) return failure

    const { error } = await admin.auth.admin.updateUserById(seller.user_id, { password })
    if (error) return json({ error: 'Não foi possível redefinir a senha' }, 500)
    await savePassword(seller.user_id, password, 'admin')
    await logActivity('update', seller.id, seller.name, 'Redefiniu a senha')

    return json({ ok: true })
  }

  // Trocar o e-mail do login: vale na hora (sem e-mail de confirmação, como no
  // cadastro) e o cadastro da Equipe acompanha
  if (body.action === 'update_email') {
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return json({ error: 'E-mail inválido' }, 400)
    const { seller, failure } = await editableLogin(String(body.sellerId ?? ''), 'O e-mail só pode ser trocado pela própria pessoa, em Minha conta.')
    if (failure) return failure

    const { data: current } = await admin.auth.admin.getUserById(seller.user_id)
    const before = (current?.user?.email ?? seller.email ?? '').toLowerCase()
    if (before !== email) {
      const { error } = await admin.auth.admin.updateUserById(seller.user_id, { email, email_confirm: true })
      if (error) return json({ error: authError(error, 'Não foi possível trocar o e-mail') }, 400)
      await logActivity('update', seller.id, seller.name, `Trocou o e-mail do login (${before} → ${email})`)
    }
    await admin.from('sellers').update({ email }).eq('user_id', seller.user_id)

    return json({ email })
  }

  // Ver a senha guardada (seção 96). Cada vez fica no histórico da loja.
  if (body.action === 'view_password') {
    const { seller, failure } = await editableLogin(String(body.sellerId ?? ''), 'A senha não aparece por aqui.')
    if (failure) return failure

    const { data: saved, error } = await admin.rpc('login_password_read', { p_user: seller.user_id })
    if (error) return json({ error: 'Não foi possível buscar a senha' }, 500)
    if (!saved) return json({ saved: null })
    await logActivity('view', seller.id, seller.name, 'Viu a senha do login')

    return json({
      saved: {
        password: saved.password,
        origin: saved.origin,
        savedAt: saved.saved_at,
        savedByEmail: saved.saved_by_email ?? null,
        stillValid: saved.still_valid,
      },
    })
  }

  // Excluir: apaga o login e tira a pessoa da equipe. O cadastro fica guardado
  // como excluído (inativo, sem login) para as vendas antigas manterem o nome e
  // a comissão, e o registro de atividades continuar mostrando quem fez o quê.
  // A senha guardada sai junto com o login (cascata no banco).
  if (body.action === 'delete') {
    const sellerId = String(body.sellerId ?? '')

    const { data: seller } = await admin
      .from('sellers')
      .select('id, user_id, name, role, active, deleted_at')
      .eq('id', sellerId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!seller || seller.deleted_at) return json({ error: 'Pessoa não encontrada na equipe' }, 404)
    if (seller.user_id === me.id) return json({ error: 'Você não pode excluir o seu próprio acesso' }, 400)
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

    await logActivity('delete', seller.id, seller.name, `Excluiu o ${ROLE_NAMES[seller.role] || 'vendedor'} e o login dele`)

    return json({ seller: { ...saved, user_id: null } })
  }

  return json({ error: 'Ação desconhecida' }, 400)
})
