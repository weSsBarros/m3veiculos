import { formatCurrencyCents } from './carFormat.js'
import { round2 } from './financing.js'

// Contrato da venda parcelada pela loja (pedido de 17/11/2026): as condições do
// financiamento próprio (Financeiro dos clientes) entram no contrato. O contrato guarda
// um retrato delas (contracts.financing), para o "Baixar" do histórico sair igual
// mesmo depois de pagar, ajustar ou refazer as parcelas.

const dateBR = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR') : '')
const money = (value) => (value != null && value !== '' && !Number.isNaN(Number(value)) ? formatCurrencyCents(Number(value)) : '')
const percent = (value) =>
  value != null && value !== '' && !Number.isNaN(Number(value))
    ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
    : ''

// Juros ao ano equivalentes aos juros ao mês (composto), com 2 casas
export function annualRate(monthlyPercent) {
  const i = Number(monthlyPercent) || 0
  return round2((Math.pow(1 + i / 100, 12) - 1) * 100)
}

// Financiamento (lib/financingApi.js) → o retrato que vai no contrato
export function financingSnapshot(financing) {
  if (!financing) return null
  const installments = [...(financing.installments || [])]
    .sort((a, b) => a.number - b.number)
    .map((i) => ({ number: i.number, dueDate: i.dueDate, amount: Number(i.amount) || 0 }))
  return {
    id: financing.id || null,
    downPayment: Number(financing.downPayment) || 0,
    financedAmount: Number(financing.financedAmount) || 0,
    installmentsCount: financing.installmentsCount || installments.length,
    installmentAmount: Number(financing.installmentAmount) || 0,
    interestRate: financing.interestRate ?? null,
    firstDueDate: financing.firstDueDate || installments[0]?.dueDate || null,
    lateFeePercent: financing.lateFeePercent ?? null,
    lateInterestPercent: financing.lateInterestPercent ?? null,
    installments,
  }
}

function totals(snapshot) {
  const list = snapshot.installments || []
  const sum = list.length
    ? round2(list.reduce((s, i) => s + (Number(i.amount) || 0), 0))
    : round2((snapshot.installmentAmount || 0) * (snapshot.installmentsCount || 0))
  return { sum, total: round2((snapshot.downPayment || 0) + sum), last: list.length ? list[list.length - 1].dueDate : null }
}

// "1ª parcela: R$ 14.000,00, vence em 10/12/2026" (uma por linha)
export function installmentLines(snapshot) {
  return (snapshot?.installments || []).map((i) => `${i.number}ª parcela: ${money(i.amount)}, vence em ${dateBR(i.dueDate)}`)
}

export const FINANCING_TAG_KEYS = [
  'financiamento_entrada',
  'financiamento_valor',
  'financiamento_parcelas',
  'financiamento_parcela_valor',
  'financiamento_juros_mes',
  'financiamento_juros_ano',
  'financiamento_primeiro_vencimento',
  'financiamento_ultimo_vencimento',
  'financiamento_dia_vencimento',
  'financiamento_soma_parcelas',
  'financiamento_total',
  'financiamento_multa',
  'financiamento_juros_atraso',
  'financiamento_tabela',
]

// Marcadores do modelo .docx (vazios quando o contrato não tem financiamento da loja:
// aí o modelo mostra a linha em branco)
export function financingTags(snapshot) {
  if (!snapshot) return Object.fromEntries(FINANCING_TAG_KEYS.map((k) => [k, '']))
  const { sum, total, last } = totals(snapshot)
  const rate = Number(snapshot.interestRate) || 0
  return {
    financiamento_entrada: money(snapshot.downPayment || 0),
    financiamento_valor: money(snapshot.financedAmount),
    financiamento_parcelas: snapshot.installmentsCount ? String(snapshot.installmentsCount) : '',
    financiamento_parcela_valor: money(snapshot.installmentAmount),
    financiamento_juros_mes: percent(rate),
    financiamento_juros_ano: percent(annualRate(rate)),
    financiamento_primeiro_vencimento: dateBR(snapshot.firstDueDate),
    financiamento_ultimo_vencimento: dateBR(last),
    financiamento_dia_vencimento: snapshot.firstDueDate ? String(Number(snapshot.firstDueDate.slice(8, 10))) : '',
    financiamento_soma_parcelas: money(sum),
    financiamento_total: money(total),
    financiamento_multa: percent(snapshot.lateFeePercent),
    financiamento_juros_atraso: percent(snapshot.lateInterestPercent),
    financiamento_tabela: installmentLines(snapshot).join('\n'),
  }
}

// Texto do contrato padrão (cláusula do preço): o saldo parcelado com a loja, os juros,
// o total a prazo, a mora e a tabela das parcelas
export function financingClauseText(snapshot) {
  if (!snapshot) return ''
  const { sum, total } = totals(snapshot)
  const rate = Number(snapshot.interestRate) || 0
  const count = snapshot.installmentsCount
  let text =
    ` O saldo de ${money(snapshot.financedAmount)} é pago diretamente à VENDEDORA em ${count} ${count === 1 ? 'parcela mensal' : 'parcelas mensais'}` +
    ` de ${money(snapshot.installmentAmount)}, vencendo a primeira em ${dateBR(snapshot.firstDueDate)}` +
    `${count > 1 ? ' e as demais no mesmo dia dos meses seguintes' : ''}, conforme a tabela abaixo` +
    `${rate > 0 ? `, com juros de ${percent(rate)}% ao mês (${percent(annualRate(rate))}% ao ano)` : ', sem juros'}.` +
    ` Soma das parcelas: ${money(sum)}; total a prazo (entrada + parcelas): ${money(total)}.`
  if (snapshot.lateFeePercent != null || snapshot.lateInterestPercent != null) {
    text +=
      ` A parcela paga com atraso terá multa de ${percent(snapshot.lateFeePercent ?? 0)}% e juros de mora de` +
      ` ${percent(snapshot.lateInterestPercent ?? 0)}% ao mês, proporcionais aos dias de atraso.`
  }
  text += ' A entrega do veículo fica condicionada ao pagamento da entrada, e o documento de transferência é entregue após a quitação de todas as parcelas.'
  const lines = installmentLines(snapshot)
  return lines.length ? `${text}\n${lines.join('\n')}` : text
}
