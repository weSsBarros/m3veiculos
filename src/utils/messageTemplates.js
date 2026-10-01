// Mensagens prontas do "Chamar no WhatsApp" (Configurações → Mensagens
// prontas). Os campos entre chaves são trocados na hora de enviar. Os padrões
// são os mesmos de companies.whatsapp_templates no banco.

export const TEMPLATE_FIELDS = [
  { key: 'nome', label: 'primeiro nome do cliente' },
  { key: 'carro', label: 'carro (marca, modelo e ano)' },
  { key: 'link', label: 'link do carro no site' },
  { key: 'vendedor', label: 'nome de quem está enviando' },
  { key: 'loja', label: 'nome da loja' },
]

export const DEFAULT_TEMPLATES = [
  {
    id: 'saudacao',
    name: 'Saudação',
    text: 'Olá, {nome}! Aqui é {vendedor}, da {loja}. Tudo bem? Posso ajudar você a encontrar o seu próximo carro?',
  },
  {
    id: 'carro_combina',
    name: 'Chegou um carro que combina',
    text: 'Olá, {nome}! Aqui é {vendedor}, da {loja}. Chegou um {carro} que combina com o que você procura:\n{link}\nQuer agendar uma visita ou um test-drive?',
  },
  {
    id: 'parcela',
    name: 'Lembrete de parcela',
    text: 'Olá, {nome}! Aqui é {vendedor}, da {loja}. Passando para lembrar da sua parcela. Qualquer dúvida, estou à disposição.',
  },
  {
    id: 'documentos',
    name: 'Documentação',
    text: 'Olá, {nome}! Aqui é {vendedor}, da {loja}. Sobre a documentação do seu {carro}: ',
  },
  {
    id: 'pos_venda',
    name: 'Pós-venda',
    text: 'Olá, {nome}! Aqui é {vendedor}, da {loja}. Como está o seu {carro}? Se precisar de qualquer coisa, conte com a gente!',
  },
]

// Lista vinda do banco: só modelos com nome e texto; vazia = padrões
export function normalizeTemplates(raw) {
  const items = Array.isArray(raw)
    ? raw
        .filter((t) => t && typeof t.name === 'string' && typeof t.text === 'string' && t.name.trim() && t.text.trim())
        .map((t, i) => ({ id: String(t.id || `modelo-${i + 1}`), name: t.name.trim(), text: t.text }))
    : []
  return items.length ? items : DEFAULT_TEMPLATES
}

export function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || ''
}

// Troca {nome}, {carro}, {link}, {vendedor} e {loja}. Campo sem valor some
// (e o espaço que sobraria antes de pontuação também).
export function fillTemplate(text, values = {}) {
  const filled = String(text || '').replace(/\{(\w+)\}/g, (match, key) => {
    if (!TEMPLATE_FIELDS.some((f) => f.key === key)) return match
    const value = values[key]
    return value == null ? '' : String(value)
  })
  return filled
    .replace(/[ \t]+([,.!?])/g, '$1')
    .replace(/,([!?.])/g, '$1')
    // "Aqui é {vendedor}, da loja" sem o nome vira "Aqui é da loja"
    .replace(/ é, /g, ' é ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function carLabelForMessage(car) {
  if (!car) return ''
  return [car.brand, car.model, car.version, car.modelYear || car.year].filter(Boolean).join(' ')
}
