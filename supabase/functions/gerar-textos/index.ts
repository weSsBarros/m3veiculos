// Edge Function "gerar-textos" — descrição do anúncio e legenda para redes
// sociais de um carro, escritas pelo Claude (Anthropic) a partir dos dados do
// cadastro. Só a equipe ativa da loja chama (o banco confere com can_edit_stock).
// A chave da Anthropic fica no segredo ANTHROPIC_API_KEY, cadastrado pelo
// Wesley em Edge Functions → Secrets. A pessoa revisa o texto antes de salvar.
// Modelo Claude Haiku 4.5, o mais barato (decisão do Wesley: com muitas lojas
// usando, o custo por texto tem que ser mínimo); sem raciocínio extra.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const SYSTEM = `Você escreve anúncios de veículos seminovos para revendas do Maranhão.
Escreva em português do Brasil, com tom profissional, direto e acolhedor, sem exageros.
Use somente as informações recebidas. Não invente opcionais, revisões, garantia, laudo, histórico,
estado de conservação, condições de pagamento, endereço ou telefone que não estejam nos dados.
Se um dado não veio, simplesmente não fale dele.`

const SCHEMA = {
  type: 'object',
  properties: {
    descricao: { type: 'string' },
    legenda: { type: 'string' },
  },
  required: ['descricao', 'legenda'],
  additionalProperties: false,
}

type Car = Record<string, unknown>

function facts(car: Car) {
  const pick = (k: string) => (car[k] === null || car[k] === undefined || car[k] === '' ? undefined : car[k])
  return {
    tipo: car.category === 'moto' ? 'moto' : 'carro',
    marca: pick('brand'),
    modelo: pick('model'),
    versao: pick('version'),
    ano: pick('modelYear') ?? pick('year'),
    quilometragem: pick('km'),
    cambio: pick('transmission'),
    combustivel: pick('fuel'),
    cor: pick('color'),
    portas: car.category === 'moto' ? undefined : pick('doors'),
    categoria: pick('category'),
    dono: pick('condition'),
    diferenciais: Array.isArray(car.highlights) && car.highlights.length ? car.highlights : undefined,
    itens_que_acompanham: Array.isArray(car.intakeItems) && car.intakeItems.length ? car.intakeItems : undefined,
    preco: pick('price'),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: canEdit } = await caller.rpc('can_edit_stock')
  if (canEdit !== true) return json({ error: 'Acesso restrito à equipe da loja' }, 403)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'Falta a chave da Anthropic (segredo ANTHROPIC_API_KEY nas Edge Functions).' }, 500)

  let body: { car?: Car; store?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Corpo inválido' }, 400)
  }
  const car = body.car || {}
  if (!car.brand || !car.model) return json({ error: 'Preencha ao menos a marca e o modelo.' }, 400)

  const prompt = `Dados do veículo (JSON):
${JSON.stringify(facts(car), null, 2)}

Loja: ${String(body.store || '').slice(0, 80) || 'não informada'}

Escreva dois textos:
1. "descricao": texto para a página do veículo no site, com 3 a 5 frases em um ou dois parágrafos.
   Sem emojis, sem hashtags e sem citar o preço.
2. "legenda": post para Instagram e WhatsApp. Uma primeira linha chamativa com o veículo e o ano;
   de 3 a 5 linhas curtas com os destaques, cada uma começando com um emoji; o preço só se veio nos dados
   (no formato R$ 00.000); um convite para chamar no WhatsApp; e de 3 a 6 hashtags (marca, modelo, seminovos).`

  const client = new Anthropic({ apiKey })
  let response
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1500,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    } as never)
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: 'A chave da Anthropic foi recusada. Confira o segredo ANTHROPIC_API_KEY.' }, 502)
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'Muitos pedidos agora. Tente de novo em instantes.' }, 429)
    if (err instanceof Anthropic.APIError) return json({ error: `A IA não respondeu (erro ${err.status}).` }, 502)
    return json({ error: 'Não foi possível falar com a IA.' }, 502)
  }

  if (response.stop_reason === 'refusal') return json({ error: 'A IA não quis escrever esse texto. Tente ajustar os dados.' }, 422)
  const text = response.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined
  try {
    const parsed = JSON.parse(text?.text || '')
    return json({ descricao: String(parsed.descricao || '').trim(), legenda: String(parsed.legenda || '').trim() })
  } catch {
    return json({ error: 'A resposta da IA veio incompleta. Tente de novo.' }, 502)
  }
})
