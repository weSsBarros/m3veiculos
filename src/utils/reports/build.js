// Montagem dos relatórios (sem tela e sem banco — recebem os dados já
// carregados). Cada relatório tem seções; cada seção vira uma tabela no PDF e
// uma aba na planilha:
// { title, subtitle, sections: [{ title, columns: [{ key, label, type }], rows, totals }] }
// type: 'text' | 'money' | 'int' | 'date'

import { daysInStock, carStatusLabel, ENTRY_TYPES } from '../carFormat.js'
import { inRange } from '../period.js'
import { describePayment } from '../payment.js'
import { summarizeFinancing, lateCharges, isInstallmentPaid } from '../financing.js'
import { externalStatusLabel } from '../externalFinancing.js'
import { storeResult } from '../storeResult.js'

const carName = (car) => (car ? `${car.brand} ${car.model} ${car.version || ''}`.trim() : 'Carro removido')

function byId(list) {
  return Object.fromEntries((list || []).map((item) => [item.id, item]))
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
}

export function periodSubtitle(range) {
  const fmt = (iso) => iso.split('-').reverse().join('/')
  if (range.start && range.end) return `Período: ${fmt(range.start)} a ${fmt(range.end)}`
  if (range.start) return `A partir de ${fmt(range.start)}`
  if (range.end) return `Até ${fmt(range.end)}`
  return 'Todo o período'
}

// Vendas e comissões: vendas do período, financiamentos externos pagos no
// período e o resumo por vendedor (com o que falta pagar de comissão)
export function buildSalesReport({ sales, cars, sellers, customers, externals = [], range, showValues = true }) {
  const carsById = byId(cars)
  const sellersById = byId(sellers)
  const customersById = byId(customers)
  const sellerName = (id) => (id ? sellersById[id]?.name || '—' : 'Venda direta')

  const periodSales = sales.filter((s) => inRange(s.saleDate, range)).sort((a, b) => (a.saleDate < b.saleDate ? -1 : 1))
  const saleRows = periodSales.map((s) => {
    const car = carsById[s.carId]
    return {
      date: s.saleDate,
      car: carName(car),
      plate: car?.plate ? car.plate.toUpperCase() : '',
      customer: car?.customerId ? customersById[car.customerId]?.name || '' : '',
      seller: sellerName(s.sellerId),
      payment: describePayment(s),
      price: s.salePrice,
      commission: s.commissionAmount,
      commissionPaid: s.commissionPaidOn ? 'Paga' : s.commissionAmount ? 'A pagar' : '',
    }
  })

  const paidExternals = externals.filter((e) => e.status === 'pago' && inRange(e.paidOn || e.submittedOn, range))
  const externalRows = paidExternals.map((e) => ({
    date: e.paidOn || e.submittedOn,
    customer: e.customerName,
    car: e.vehicleLabel,
    bank: e.bank,
    financed: e.financedAmount || 0,
    seller: e.sellerId ? sellersById[e.sellerId]?.name || '—' : 'Loja',
    commission: e.commissionAmount,
    commissionPaid: e.commissionPaidOn ? 'Paga' : e.commissionAmount ? 'A pagar' : '',
  }))

  const bySeller = {}
  const ensure = (id) => {
    const key = id || 'loja'
    if (!bySeller[key]) bySeller[key] = { seller: id ? sellersById[id]?.name || '—' : 'Loja (sem vendedor)', count: 0, revenue: 0, externals: 0, commission: 0, toPay: 0 }
    return bySeller[key]
  }
  for (const s of periodSales) {
    const row = ensure(s.sellerId)
    row.count += 1
    row.revenue += s.salePrice
    row.commission += s.commissionAmount
    if (!s.commissionPaidOn) row.toPay += s.commissionAmount
  }
  for (const e of paidExternals) {
    const row = ensure(e.sellerId)
    row.externals += 1
    row.commission += e.commissionAmount
    if (!e.commissionPaidOn) row.toPay += e.commissionAmount
  }
  const summaryRows = Object.values(bySeller).sort((a, b) => b.revenue - a.revenue)

  const money = showValues
  const sections = [
    {
      title: 'Vendas',
      columns: [
        { key: 'date', label: 'Data', type: 'date' },
        { key: 'car', label: 'Carro', type: 'text' },
        { key: 'plate', label: 'Placa', type: 'text' },
        { key: 'customer', label: 'Cliente', type: 'text' },
        { key: 'seller', label: 'Vendedor', type: 'text' },
        { key: 'payment', label: 'Pagamento', type: 'text' },
        ...(money
          ? [
              { key: 'price', label: 'Valor', type: 'money' },
              { key: 'commission', label: 'Comissão', type: 'money' },
              { key: 'commissionPaid', label: 'Comissão paga?', type: 'text' },
            ]
          : []),
      ],
      rows: saleRows,
      totals: money ? { date: count(saleRows.length, 'venda', 'vendas'), price: sum(saleRows, 'price'), commission: sum(saleRows, 'commission') } : { date: count(saleRows.length, 'venda', 'vendas') },
    },
    {
      title: 'Financiamentos externos pagos',
      columns: [
        { key: 'date', label: 'Pago em', type: 'date' },
        { key: 'customer', label: 'Cliente', type: 'text' },
        { key: 'car', label: 'Carro', type: 'text' },
        { key: 'bank', label: 'Banco', type: 'text' },
        { key: 'seller', label: 'Vendedor', type: 'text' },
        ...(money
          ? [
              { key: 'financed', label: 'Financiado', type: 'money' },
              { key: 'commission', label: 'Comissão', type: 'money' },
              { key: 'commissionPaid', label: 'Comissão paga?', type: 'text' },
            ]
          : []),
      ],
      rows: externalRows,
      totals: money ? { date: count(externalRows.length, 'financiamento', 'financiamentos'), financed: sum(externalRows, 'financed'), commission: sum(externalRows, 'commission') } : { date: count(externalRows.length, 'financiamento', 'financiamentos') },
    },
    {
      title: 'Resumo por vendedor',
      columns: [
        { key: 'seller', label: 'Vendedor', type: 'text' },
        { key: 'count', label: 'Vendas', type: 'int' },
        { key: 'externals', label: 'Financ. externos', type: 'int' },
        ...(money
          ? [
              { key: 'revenue', label: 'Faturamento', type: 'money' },
              { key: 'commission', label: 'Comissão total', type: 'money' },
              { key: 'toPay', label: 'Comissão a pagar', type: 'money' },
            ]
          : []),
      ],
      rows: summaryRows,
      totals: money
        ? { seller: 'Total', count: sum(summaryRows, 'count'), externals: sum(summaryRows, 'externals'), revenue: sum(summaryRows, 'revenue'), commission: sum(summaryRows, 'commission'), toPay: sum(summaryRows, 'toPay') }
        : { seller: 'Total', count: sum(summaryRows, 'count'), externals: sum(summaryRows, 'externals') },
    },
  ]
  return { title: 'Vendas e comissões', subtitle: periodSubtitle(range), sections }
}

// Estoque atual (disponíveis, em manutenção e reservados). Custo e margem só
// para quem vê custos.
export function buildStockReport({ cars, expenses = [], showCosts = false, today = new Date() }) {
  const expensesByCar = {}
  for (const e of expenses) expensesByCar[e.carId] = (expensesByCar[e.carId] || 0) + e.amount
  const inStock = cars.filter((c) => c.status !== 'vendido').sort((a, b) => daysInStock(b) - daysInStock(a))
  const rows = inStock.map((car) => {
    const totalCost = (car.purchasePrice || 0) + (expensesByCar[car.id] || 0)
    return {
      car: carName(car),
      plate: car.plate ? car.plate.toUpperCase() : '',
      year: car.modelYear,
      km: car.km,
      status: carStatusLabel(car.status) + (car.hidden ? ' (oculto)' : ''),
      days: daysInStock(car),
      price: car.price ?? null,
      cost: car.purchasePrice ? totalCost : null,
      margin: car.purchasePrice && car.price != null ? car.price - totalCost : null,
    }
  })
  const columns = [
    { key: 'car', label: 'Carro', type: 'text' },
    { key: 'plate', label: 'Placa', type: 'text' },
    { key: 'year', label: 'Ano', type: 'text' },
    { key: 'km', label: 'Km', type: 'int' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'days', label: 'Dias em estoque', type: 'int' },
    { key: 'price', label: 'Preço', type: 'money' },
    ...(showCosts
      ? [
          { key: 'cost', label: 'Custo total', type: 'money' },
          { key: 'margin', label: 'Margem', type: 'money' },
        ]
      : []),
  ]
  const totals = { car: count(rows.length, 'carro', 'carros'), price: sum(rows, 'price'), ...(showCosts ? { cost: sum(rows, 'cost'), margin: sum(rows, 'margin') } : {}) }
  const date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  return { title: 'Estoque', subtitle: `Posição em ${date}`, sections: [{ title: 'Carros em estoque', columns, rows, totals }] }
}

// Gastos do período (só o admin): lista e totais por categoria
export function buildExpensesReport({ expenses, cars, suppliers = [], range, categoryLabel = (c) => c }) {
  const carsById = byId(cars)
  const suppliersById = byId(suppliers)
  const list = expenses.filter((e) => inRange(e.expenseDate, range)).sort((a, b) => (a.expenseDate < b.expenseDate ? -1 : 1))
  const rows = list.map((e) => ({
    date: e.expenseDate,
    car: carName(carsById[e.carId]),
    category: categoryLabel(e.category),
    description: e.description,
    supplier: e.supplierId ? suppliersById[e.supplierId]?.name || '' : '',
    amount: e.amount,
  }))
  const byCategory = {}
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] || 0) + r.amount
  const categoryRows = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
  return {
    title: 'Gastos',
    subtitle: periodSubtitle(range),
    sections: [
      {
        title: 'Gastos',
        columns: [
          { key: 'date', label: 'Data', type: 'date' },
          { key: 'car', label: 'Carro', type: 'text' },
          { key: 'category', label: 'Categoria', type: 'text' },
          { key: 'description', label: 'Descrição', type: 'text' },
          { key: 'supplier', label: 'Fornecedor', type: 'text' },
          { key: 'amount', label: 'Valor', type: 'money' },
        ],
        rows,
        totals: { date: count(rows.length, 'gasto', 'gastos'), amount: sum(rows, 'amount') },
      },
      {
        title: 'Por categoria',
        columns: [
          { key: 'category', label: 'Categoria', type: 'text' },
          { key: 'amount', label: 'Total', type: 'money' },
        ],
        rows: categoryRows,
        totals: { category: 'Total', amount: sum(categoryRows, 'amount') },
      },
    ],
  }
}

// Financiamentos: próprios (situação de cada carnê hoje) e externos do período
export function buildFinancingReport({ financings = [], externals = [], sellers = [], range, includeOwn = true, today }) {
  const sellersById = byId(sellers)
  const ownRows = financings
    .filter((f) => f.status !== 'cancelado')
    .map((f) => {
      const s = summarizeFinancing(f, today)
      return {
        customer: f.customerName,
        car: f.vehicleLabel,
        financed: f.financedAmount,
        installments: `${s.paidCount}/${s.count}`,
        paid: s.paid,
        open: s.open,
        overdue: s.overdueCount,
        overdueAmount: s.overdueAmount,
      }
    })
  const externalRows = externals
    .filter((e) => inRange(e.submittedOn, range))
    .map((e) => ({
      date: e.submittedOn,
      customer: e.customerName,
      car: e.vehicleLabel,
      bank: e.bank,
      financed: e.financedAmount || 0,
      status: externalStatusLabel(e.status),
      seller: e.sellerId ? sellersById[e.sellerId]?.name || '—' : 'Loja',
      storeReturn: e.storeReturn ?? null,
    }))
  const sections = []
  if (includeOwn) {
    sections.push({
      title: 'Financiamento próprio (carnês)',
      columns: [
        { key: 'customer', label: 'Cliente', type: 'text' },
        { key: 'car', label: 'Carro', type: 'text' },
        { key: 'financed', label: 'Financiado', type: 'money' },
        { key: 'installments', label: 'Parcelas pagas', type: 'text' },
        { key: 'paid', label: 'Recebido', type: 'money' },
        { key: 'open', label: 'Em aberto', type: 'money' },
        { key: 'overdue', label: 'Atrasadas', type: 'int' },
        { key: 'overdueAmount', label: 'Atraso c/ multa e juros', type: 'money' },
      ],
      rows: ownRows,
      totals: { customer: count(ownRows.length, 'financiamento', 'financiamentos'), financed: sum(ownRows, 'financed'), paid: sum(ownRows, 'paid'), open: sum(ownRows, 'open'), overdue: sum(ownRows, 'overdue'), overdueAmount: sum(ownRows, 'overdueAmount') },
    })
  }
  sections.push({
    title: 'Financiamentos externos',
    columns: [
      { key: 'date', label: 'Enviado em', type: 'date' },
      { key: 'customer', label: 'Cliente', type: 'text' },
      { key: 'car', label: 'Carro', type: 'text' },
      { key: 'bank', label: 'Banco', type: 'text' },
      { key: 'financed', label: 'Financiado', type: 'money' },
      { key: 'status', label: 'Situação', type: 'text' },
      { key: 'seller', label: 'Vendedor', type: 'text' },
      { key: 'storeReturn', label: 'Retorno da loja', type: 'money' },
    ],
    rows: externalRows,
    totals: { date: count(externalRows.length, 'financiamento', 'financiamentos'), financed: sum(externalRows, 'financed'), storeReturn: sum(externalRows, 'storeReturn') },
  })
  return { title: 'Financiamentos', subtitle: periodSubtitle(range), sections }
}

// Clientes cadastrados, com os carros que compraram
export function buildCustomersReport({ customers, cars = [] }) {
  const carsByCustomer = {}
  for (const car of cars) {
    if (!car.customerId) continue
    ;(carsByCustomer[car.customerId] ||= []).push(`${carName(car)}${car.plate ? ` (${car.plate.toUpperCase()})` : ''}`)
  }
  const rows = [...customers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      document: c.document,
      rg: c.rg,
      phone: c.phone,
      email: c.email,
      address: c.address,
      cars: (carsByCustomer[c.id] || []).join('; '),
      since: c.createdAt,
    }))
  return {
    title: 'Clientes',
    subtitle: count(rows.length, 'cliente cadastrado', 'clientes cadastrados'),
    sections: [
      {
        title: 'Clientes',
        columns: [
          { key: 'name', label: 'Nome', type: 'text' },
          { key: 'document', label: 'CPF/CNPJ', type: 'text' },
          { key: 'rg', label: 'RG', type: 'text' },
          { key: 'phone', label: 'Telefone', type: 'text' },
          { key: 'email', label: 'E-mail', type: 'text' },
          { key: 'address', label: 'Endereço', type: 'text' },
          { key: 'cars', label: 'Carros comprados', type: 'text' },
          { key: 'since', label: 'Cadastrado em', type: 'date' },
        ],
        rows,
        totals: null,
      },
    ],
  }
}

// Contatos pelo WhatsApp do site (um por clique): por vendedor, por carro e a
// lista. Quem já tinha falado com o mesmo vendedor conta como "voltou".
// team: nomes da equipe; rotation: entradas do rodízio (números avulsos).
export function buildLeadsReport({ leads, team = [], rotation = [], cars = [], range }) {
  const teamById = byId(team)
  const rotationById = byId(rotation)
  const carsById = byId(cars)
  const who = (lead) => {
    if (lead.sellerId) return teamById[lead.sellerId]?.name || 'Vendedor removido'
    if (lead.rotationId) return rotationById[lead.rotationId]?.name || 'Número removido do rodízio'
    return 'Número principal'
  }
  const inPeriod = leads.filter((l) => inRange(l.createdAt.slice(0, 10), range))

  const perPerson = {}
  for (const lead of inPeriod) {
    const name = who(lead)
    const row = (perPerson[name] ||= { name, fresh: 0, returning: 0, total: 0 })
    if (lead.isReturning) row.returning += 1
    else row.fresh += 1
    row.total += 1
  }
  const personRows = Object.values(perPerson).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  const perCar = {}
  for (const lead of inPeriod) {
    const key = lead.carId || 'geral'
    const row = (perCar[key] ||= { car: lead.carId ? carName(carsById[lead.carId]) : 'Sem carro (página geral, contato etc.)', total: 0 })
    row.total += 1
  }
  const carRows = Object.values(perCar).sort((a, b) => b.total - a.total)

  const listRows = inPeriod.map((lead) => ({
    date: lead.createdAt,
    time: new Date(lead.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    who: who(lead),
    car: lead.carId ? carName(carsById[lead.carId]) : '',
    kind: lead.isReturning ? 'Voltou' : 'Novo',
  }))

  return {
    title: 'Contatos pelo WhatsApp',
    subtitle: `${periodSubtitle(range)} · ${count(inPeriod.length, 'contato', 'contatos')}`,
    sections: [
      {
        title: 'Por vendedor',
        columns: [
          { key: 'name', label: 'Vendedor ou número', type: 'text' },
          { key: 'fresh', label: 'Clientes novos', type: 'int' },
          { key: 'returning', label: 'Voltaram', type: 'int' },
          { key: 'total', label: 'Total de cliques', type: 'int' },
        ],
        rows: personRows,
        totals: { name: 'Total', fresh: sum(personRows, 'fresh'), returning: sum(personRows, 'returning'), total: sum(personRows, 'total') },
      },
      {
        title: 'Por carro',
        columns: [
          { key: 'car', label: 'Carro', type: 'text' },
          { key: 'total', label: 'Contatos', type: 'int' },
        ],
        rows: carRows,
        totals: null,
      },
      {
        title: 'Todos os contatos',
        columns: [
          { key: 'date', label: 'Data', type: 'date' },
          { key: 'time', label: 'Hora', type: 'text' },
          { key: 'who', label: 'Vendedor ou número', type: 'text' },
          { key: 'car', label: 'Carro', type: 'text' },
          { key: 'kind', label: 'Cliente', type: 'text' },
        ],
        rows: listRows,
        totals: null,
      },
    ],
  }
}

// Margem por tipo de entrada (showroom, consignado, repasse): vendas do período
// com custo (compra ou valor do dono + gastos), margem e dias até vender; e o
// estoque de agora por tipo (no consignado a loja não tem dinheiro parado).
export function buildEntryTypeReport({ sales, cars, expenses = [], range }) {
  const carsById = byId(cars)
  const expensesByCar = {}
  for (const e of expenses) expensesByCar[e.carId] = (expensesByCar[e.carId] || 0) + e.amount
  const typeOf = (car) => car?.entryType || 'showroom'
  const pct = (margin, base) => (base ? `${((margin / base) * 100).toFixed(1).replace('.', ',')}%` : '')

  const periodSales = sales.filter((s) => inRange(s.saleDate, range) && carsById[s.carId])
  const soldRows = ENTRY_TYPES.map((t) => {
    const list = periodSales.filter((s) => typeOf(carsById[s.carId]) === t.value)
    const withCost = list.filter((s) => carsById[s.carId].purchasePrice)
    const revenue = withCost.reduce((total, s) => total + s.salePrice, 0)
    const cost = withCost.reduce((total, s) => total + carsById[s.carId].purchasePrice + (expensesByCar[s.carId] || 0), 0)
    const days = list.map((s) => daysInStock(carsById[s.carId]))
    return {
      type: t.short,
      count: list.length,
      sold: list.reduce((total, s) => total + s.salePrice, 0),
      cost: withCost.length ? cost : null,
      margin: withCost.length ? revenue - cost : null,
      marginPct: withCost.length ? pct(revenue - cost, revenue) : '',
      avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    }
  })

  const inStock = cars.filter((c) => c.status !== 'vendido')
  const stockRows = ENTRY_TYPES.map((t) => {
    const list = inStock.filter((c) => typeOf(c) === t.value)
    const days = list.map((c) => daysInStock(c))
    return {
      type: t.short,
      count: list.length,
      price: list.reduce((total, c) => total + (c.price || 0), 0),
      invested: t.value === 'consignado' ? 0 : list.reduce((total, c) => total + (c.purchasePrice || 0) + (expensesByCar[c.id] || 0), 0),
      avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    }
  })

  return {
    title: 'Margem por tipo de entrada',
    subtitle: periodSubtitle(range),
    sections: [
      {
        title: 'Vendidos no período',
        columns: [
          { key: 'type', label: 'Tipo de entrada', type: 'text' },
          { key: 'count', label: 'Vendidos', type: 'int' },
          { key: 'sold', label: 'Total vendido', type: 'money' },
          { key: 'cost', label: 'Custo (com gastos)', type: 'money' },
          { key: 'margin', label: 'Margem', type: 'money' },
          { key: 'marginPct', label: 'Margem %', type: 'text' },
          { key: 'avgDays', label: 'Dias até vender (média)', type: 'int' },
        ],
        rows: soldRows,
        totals: { type: 'Total', count: sum(soldRows, 'count'), sold: sum(soldRows, 'sold'), cost: sum(soldRows, 'cost'), margin: sum(soldRows, 'margin') },
      },
      {
        title: 'Em estoque agora',
        columns: [
          { key: 'type', label: 'Tipo de entrada', type: 'text' },
          { key: 'count', label: 'Carros', type: 'int' },
          { key: 'price', label: 'Valor anunciado', type: 'money' },
          { key: 'invested', label: 'Dinheiro da loja parado', type: 'money' },
          { key: 'avgDays', label: 'Dias em estoque (média)', type: 'int' },
        ],
        rows: stockRows,
        totals: { type: 'Total', count: sum(stockRows, 'count'), price: sum(stockRows, 'price'), invested: sum(stockRows, 'invested') },
      },
    ],
  }
}

// Resultado (lucro líquido): vendas do período menos o custo dos carros vendidos
// (compra + gastos), as comissões pagas no período (pela data do pagamento) e as
// despesas da empresa com vencimento no período. sellers: para o nome de quem
// recebeu a comissão.
export function buildResultReport({ soldEntries = [], carExpenses = [], companyExpenses = [], sellers = [], range, categoryLabel = (c) => c }) {
  const r = storeResult({ soldEntries, carExpenses, companyExpenses, range })
  const sellersById = byId(sellers)
  const summary = [
    { item: `Vendas (${count(r.soldCount, 'carro', 'carros')})`, value: r.revenue },
    { item: 'Custo dos carros vendidos (compra + gastos)', value: -r.carsCost },
    { item: 'Margem bruta', value: r.grossMargin },
    { item: `Comissões pagas no período (${count(r.paidCommissions.length, 'comissão', 'comissões')})`, value: -r.commissions },
    { item: 'Despesas da empresa', value: -r.companyExpenses },
    { item: 'Lucro líquido', value: r.net },
  ]
  const soldRows = r.sold.map((e) => ({
    date: e.date,
    car: carName(e.car),
    plate: e.car?.plate ? e.car.plate.toUpperCase() : '',
    price: e.price,
    cost: e.cost,
    margin: e.margin,
  }))
  const commissionRows = r.paidCommissions.map((e) => ({
    paidOn: e.paidOn,
    seller: sellersById[e.sale?.sellerId]?.name || '',
    car: carName(e.car),
    soldOn: e.date || '',
    amount: e.commission,
  }))
  const billRows = r.bills.map((e) => ({
    due: e.dueOn,
    category: categoryLabel(e.category),
    description: e.description || '',
    amount: e.amount,
    paid: e.paidOn ? e.paidOn.split('-').reverse().join('/') : 'A pagar',
  }))
  return {
    title: 'Resultado (lucro líquido)',
    subtitle: periodSubtitle(range),
    sections: [
      {
        title: 'Resultado',
        columns: [
          { key: 'item', label: 'Item', type: 'text' },
          { key: 'value', label: 'Valor', type: 'money' },
        ],
        rows: summary,
      },
      {
        title: 'Carros vendidos',
        columns: [
          { key: 'date', label: 'Data', type: 'date' },
          { key: 'car', label: 'Carro', type: 'text' },
          { key: 'plate', label: 'Placa', type: 'text' },
          { key: 'price', label: 'Venda', type: 'money' },
          { key: 'cost', label: 'Custo', type: 'money' },
          { key: 'margin', label: 'Margem', type: 'money' },
        ],
        rows: soldRows,
        totals: { date: count(soldRows.length, 'venda', 'vendas'), price: sum(soldRows, 'price'), cost: sum(soldRows, 'cost'), margin: sum(soldRows, 'margin') },
      },
      {
        title: 'Comissões pagas no período',
        columns: [
          { key: 'paidOn', label: 'Paga em', type: 'date' },
          { key: 'seller', label: 'Vendedor', type: 'text' },
          { key: 'car', label: 'Carro', type: 'text' },
          { key: 'soldOn', label: 'Vendido em', type: 'date' },
          { key: 'amount', label: 'Comissão', type: 'money' },
        ],
        rows: commissionRows,
        totals: { paidOn: count(commissionRows.length, 'comissão', 'comissões'), amount: sum(commissionRows, 'amount') },
      },
      {
        title: 'Despesas da empresa',
        columns: [
          { key: 'due', label: 'Vencimento', type: 'date' },
          { key: 'category', label: 'Categoria', type: 'text' },
          { key: 'description', label: 'Descrição', type: 'text' },
          { key: 'amount', label: 'Valor', type: 'money' },
          { key: 'paid', label: 'Pago em', type: 'text' },
        ],
        rows: billRows,
        totals: { due: count(billRows.length, 'despesa', 'despesas'), amount: sum(billRows, 'amount') },
      },
    ],
  }
}

// Financeiro dos clientes (carnês da loja) num período: o que vence (a receber),
// o que atrasou, o que foi recebido e o saldo de cada cliente. financings já vem
// com a busca e o filtro da tela; customersById para o telefone.
export function buildInstallmentsReport({ financings = [], customersById = new Map(), range, today }) {
  const active = financings.filter((f) => f.status !== 'cancelado')
  const phone = (f) => (f.customerId ? customersById.get(f.customerId)?.phone || '' : '')
  const vehicle = (f) => [f.vehicleLabel, f.vehiclePlate ? f.vehiclePlate.toUpperCase() : ''].filter(Boolean).join(' · ')
  const parcel = (f, i) => `${i.number}/${f.installmentsCount || (f.installments || []).length}`
  const fmt = (iso) => iso.split('-').reverse().join('/')

  const openRows = []
  const paidRows = []
  for (const f of active) {
    for (const i of f.installments || []) {
      if (!isInstallmentPaid(i) && inRange(i.dueDate, range)) {
        const charges = i.dueDate < today ? lateCharges(i, f, today) : { days: 0, total: 0 }
        openRows.push({
          due: i.dueDate,
          customer: f.customerName,
          phone: phone(f),
          car: vehicle(f),
          parcel: parcel(f, i),
          amount: i.amount,
          updated: Math.round((i.amount + charges.total) * 100) / 100,
          situation: i.dueDate < today ? `Atrasada há ${charges.days} ${charges.days === 1 ? 'dia' : 'dias'}` : i.dueDate === today ? 'Vence hoje' : 'A vencer',
        })
      }
      if (isInstallmentPaid(i) && inRange(i.paidOn, range)) {
        paidRows.push({
          paidOn: i.paidOn,
          customer: f.customerName,
          car: vehicle(f),
          parcel: parcel(f, i),
          due: i.dueDate,
          amount: i.amount,
          received: i.paidAmount ?? i.amount,
          method: i.paymentMethod || '',
        })
      }
    }
  }
  openRows.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.customer.localeCompare(b.customer)))
  paidRows.sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1))

  const balanceRows = active
    .map((f) => ({ f, s: summarizeFinancing(f, today) }))
    .filter(({ s }) => s.open > 0)
    .map(({ f, s }) => ({
      customer: f.customerName,
      phone: phone(f),
      car: vehicle(f),
      openCount: s.count - s.paidCount,
      open: s.open,
      overdue: s.overdueAmount,
      next: s.nextDue ? fmt(s.nextDue.dueDate) : '',
    }))
    .sort((a, b) => a.customer.localeCompare(b.customer))

  const overdueRows = openRows.filter((r) => r.due < today)
  const summary = [
    { item: `A receber (${count(openRows.length, 'parcela', 'parcelas')})`, value: sum(openRows, 'amount') },
    { item: `Em atraso, com multa e juros (${count(overdueRows.length, 'parcela', 'parcelas')})`, value: sum(overdueRows, 'updated') },
    { item: `Recebido (${count(paidRows.length, 'parcela', 'parcelas')})`, value: sum(paidRows, 'received') },
    { item: `Saldo em aberto dos clientes (${count(balanceRows.length, 'financiamento', 'financiamentos')})`, value: sum(balanceRows, 'open') },
  ]

  return {
    title: 'Financeiro dos clientes',
    subtitle: periodSubtitle(range),
    sections: [
      {
        title: 'Resumo',
        columns: [
          { key: 'item', label: 'Item', type: 'text' },
          { key: 'value', label: 'Valor', type: 'money' },
        ],
        rows: summary,
      },
      {
        title: 'Parcelas a receber',
        columns: [
          { key: 'due', label: 'Vencimento', type: 'date' },
          { key: 'customer', label: 'Cliente', type: 'text' },
          { key: 'phone', label: 'Telefone', type: 'text' },
          { key: 'car', label: 'Veículo', type: 'text' },
          { key: 'parcel', label: 'Parcela', type: 'text' },
          { key: 'amount', label: 'Valor', type: 'money' },
          { key: 'updated', label: 'Com multa e juros', type: 'money' },
          { key: 'situation', label: 'Situação', type: 'text' },
        ],
        rows: openRows,
        totals: { due: count(openRows.length, 'parcela', 'parcelas'), amount: sum(openRows, 'amount'), updated: sum(openRows, 'updated') },
      },
      {
        title: 'Parcelas recebidas',
        columns: [
          { key: 'paidOn', label: 'Pago em', type: 'date' },
          { key: 'customer', label: 'Cliente', type: 'text' },
          { key: 'car', label: 'Veículo', type: 'text' },
          { key: 'parcel', label: 'Parcela', type: 'text' },
          { key: 'due', label: 'Vencimento', type: 'date' },
          { key: 'amount', label: 'Parcela', type: 'money' },
          { key: 'received', label: 'Recebido', type: 'money' },
          { key: 'method', label: 'Forma', type: 'text' },
        ],
        rows: paidRows,
        totals: { paidOn: count(paidRows.length, 'parcela', 'parcelas'), amount: sum(paidRows, 'amount'), received: sum(paidRows, 'received') },
      },
      {
        title: 'Saldo por cliente',
        columns: [
          { key: 'customer', label: 'Cliente', type: 'text' },
          { key: 'phone', label: 'Telefone', type: 'text' },
          { key: 'car', label: 'Veículo', type: 'text' },
          { key: 'openCount', label: 'Parcelas em aberto', type: 'int' },
          { key: 'open', label: 'Saldo', type: 'money' },
          { key: 'overdue', label: 'Em atraso', type: 'money' },
          { key: 'next', label: 'Próximo vencimento', type: 'text' },
        ],
        rows: balanceRows,
        totals: { customer: count(balanceRows.length, 'cliente', 'clientes'), openCount: sum(balanceRows, 'openCount'), open: sum(balanceRows, 'open'), overdue: sum(balanceRows, 'overdue') },
      },
    ],
  }
}
