// Login da equipe: e-mail e senha trocados pelo painel (seção 96). A senha guardada
// aparece para o admin em "Ver senha" (Equipe) e cada pessoa troca a própria em
// "Minha conta" (canto de cima do painel).

export const MIN_PASSWORD = 6

const EMAIL_RE = /^\S+@\S+\.\S+$/

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email))
}

// O e-mail do formulário é diferente do e-mail do login?
export function emailChanged(before, after) {
  return normalizeEmail(after) !== '' && normalizeEmail(after) !== normalizeEmail(before)
}

const ORIGIN_TEXT = {
  cadastro: 'no cadastro do login',
  admin: 'pelo administrador, em Nova senha',
  propria: 'pela própria pessoa, em Minha conta',
}

function dateTimeBR(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })
  const time = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' })
  return `${date} às ${time}`
}

// "Definida pelo administrador, em Nova senha, em 27/10/2026 às 14:05 (admin@loja)."
export function savedPasswordInfo(saved) {
  if (!saved) return ''
  const how = ORIGIN_TEXT[saved.origin] || 'pelo painel'
  const when = saved.savedAt ? dateTimeBR(saved.savedAt) : ''
  const who = saved.origin !== 'propria' && saved.savedByEmail ? ` (${saved.savedByEmail})` : ''
  return `Definida ${how}${when ? `, em ${when}` : ''}${who}.`
}

// Confere o "Minha conta" antes de mandar: '' = pode salvar
export function myAccountError({ currentEmail, email, password, currentPassword }) {
  const changeEmail = emailChanged(currentEmail, email)
  const changePassword = String(password || '') !== ''
  if (!changeEmail && !changePassword) return 'Troque o e-mail ou digite a nova senha.'
  if (changeEmail && !isValidEmail(email)) return 'E-mail inválido.'
  if (changePassword && String(password).length < MIN_PASSWORD) return `A senha nova precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
  if (!String(currentPassword || '')) return 'Digite a sua senha atual para confirmar.'
  return ''
}
