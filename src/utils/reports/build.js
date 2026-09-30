// Montagem dos relatórios (sem tela e sem banco — recebem os dados já
// carregados). Cada relatório tem seções; cada seção vira uma tabela no PDF e
// uma aba na planilha:
// { title, subtitle, sections: [{ title, columns: [{ key, label, type }], rows, totals }] }
// type: 'text' | 'money' | 'int' | 'date'

import { daysInStock, carStatusLabel } from '../carFormat.js'
import { inRange } from '../period.js'
import { describePayment } from '../payment.js'
import { summarizeFinancing } from '../financing.js'
import { externalStatusLabel } from '../externalFinancing.js'

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
