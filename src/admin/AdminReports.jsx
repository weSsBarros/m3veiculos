import { useState } from 'react'
import { FileText, FileSpreadsheet } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchSales, soldEntriesFrom } from '../lib/salesApi.js'
import { fetchAllCarsAdmin } from '../lib/carsApi.js'
import { fetchSellers } from '../lib/sellersApi.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { fetchAllExpensesAdmin } from '../lib/expensesApi.js'
import { fetchAllSuppliers } from '../lib/suppliersApi.js'
import { fetchFinancings } from '../lib/financingApi.js'
import { fetchExternalFinancings } from '../lib/externalFinancingApi.js'
import { fetchCompanySettings } from '../lib/companyApi.js'
import { fetchLeads, fetchTeamDirectory, fetchRotation } from '../lib/storeSettingsApi.js'
import { fetchCompanyExpenses, generateCompanyExpenses } from '../lib/companyExpensesApi.js'
import { companyExpenseCategoryLabel } from '../utils/companyExpenses.js'
import { expenseCategoryLabel } from '../utils/carFormat.js'
import { periodRange } from '../utils/period.js'
import { withoutPrivate, itemsWithoutPrivate, privateNote } from '../utils/privateValues.js'
import {
  buildSalesReport,
  buildStockReport,
  buildExpensesReport,
  buildFinancingReport,
  buildCustomersReport,
  buildLeadsReport,
  buildEntryTypeReport,
  buildResultReport,
} from '../utils/reports/build.js'
import { exportReportPdf, exportReportExcel } from '../utils/reports/export.js'
import PeriodFilter from './PeriodFilter.jsx'
import './admin.css'

// Valores privados (seção 73): carros com o cadeado de outro sócio ficam fora das
// contas de dinheiro; o subtítulo do relatório avisa quantos
function notePrivate(report, count) {
  return count ? { ...report, subtitle: [report.subtitle, privateNote(count)].filter(Boolean).join(' · ') } : report
}

// Relatórios para baixar em PDF (imprimir, enviar) ou Excel (mexer nos
// números). Cada papel só tira o que pode ver: o vendedor tira o das vendas e
// comissões dele; gastos, custo e margem são só do admin.
export default function AdminReports() {
  const { isAdmin, isStaff, isSeller, canSeeCosts, canSeeSaleValues, canManageCustomerFinance } = useAuth()
  const [period, setPeriod] = useState('mes')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const range = periodRange(period, customStart, customEnd)

  const reports = [
    {
      id: 'vendas',
      title: isSeller ? 'Minhas vendas e comissões' : 'Vendas e comissões',
      description: 'Vendas do período (com forma de pagamento), financiamentos externos pagos e o resumo por vendedor, com a comissão a pagar.',
      usesPeriod: true,
      show: true,
      build: async () => {
        const [sales, cars, sellers, customers, externals] = await Promise.all([
          fetchSales(),
          fetchAllCarsAdmin(),
          fetchSellers().catch(() => []),
          fetchAllCustomers().catch(() => []),
          fetchExternalFinancings().catch(() => []),
        ])
        const money = itemsWithoutPrivate(sales, cars)
        return notePrivate(
          buildSalesReport({ sales: money.items, cars, sellers, customers, externals, range, showValues: canSeeSaleValues || isSeller }),
          money.hidden
        )
      },
    },
    {
      id: 'contatos',
      title: isSeller ? 'Meus contatos pelo WhatsApp' : 'Contatos pelo WhatsApp',
      description: 'Cliques nos botões de WhatsApp do site: quantos clientes cada vendedor recebeu (novos e que voltaram) e quais carros geraram mais contatos.',
      usesPeriod: true,
      show: true,
      build: async () => {
        const [leads, team, rotation, cars] = await Promise.all([
          fetchLeads({ start: range.start, end: range.end }),
          fetchTeamDirectory().catch(() => []),
          fetchRotation().catch(() => []),
          fetchAllCarsAdmin(),
        ])
        return buildLeadsReport({ leads, team, rotation, cars, range })
      },
    },
    {
      id: 'estoque',
      title: 'Estoque',
      description: canSeeCosts
        ? 'Carros disponíveis, em manutenção e reservados, com dias em estoque, preço, custo total e margem.'
        : 'Carros disponíveis, em manutenção e reservados, com dias em estoque e preço.',
      usesPeriod: false,
      show: true,
      build: async () => {
        const [cars, expenses] = await Promise.all([fetchAllCarsAdmin(), canSeeCosts ? fetchAllExpensesAdmin() : Promise.resolve([])])
        return notePrivate(buildStockReport({ cars, expenses, showCosts: canSeeCosts }), canSeeCosts ? withoutPrivate(cars).hidden : 0)
      },
    },
    {
      id: 'tipo-entrada',
      title: 'Margem por tipo de entrada',
      description: 'Showroom, consignado e repasse: vendidos no período com custo, margem e dias até vender, e o estoque de agora por tipo.',
      usesPeriod: true,
      show: canSeeCosts,
      build: async () => {
        const [sales, cars, expenses] = await Promise.all([fetchSales(), fetchAllCarsAdmin(), fetchAllExpensesAdmin()])
        const visible = withoutPrivate(cars)
        return notePrivate(
          buildEntryTypeReport({ sales: itemsWithoutPrivate(sales, cars).items, cars: visible.cars, expenses, range }),
          visible.hidden
        )
      },
    },
    {
      id: 'resultado',
      title: 'Resultado (lucro líquido)',
      description: 'Vendas do período menos o custo dos carros vendidos, as comissões pagas no período e as despesas da empresa (aluguel, contas, salários).',
      usesPeriod: true,
      show: isAdmin,
      build: async () => {
        const [sales, cars, carExpenses, companyExpenses, sellers] = await Promise.all([
          fetchSales(),
          fetchAllCarsAdmin(),
          fetchAllExpensesAdmin(),
          generateCompanyExpenses().catch(() => {}).then(fetchCompanyExpenses),
          fetchSellers().catch(() => []),
        ])
        return buildResultReport({
          soldEntries: soldEntriesFrom(cars, sales),
          carExpenses,
          companyExpenses,
          sellers,
          range,
          categoryLabel: companyExpenseCategoryLabel,
        })
      },
    },
    {
      id: 'gastos',
      title: 'Gastos',
      description: 'Gastos do período por carro, categoria e fornecedor, com o total por categoria.',
      usesPeriod: true,
      show: isAdmin,
      build: async () => {
        const [expenses, cars, suppliers] = await Promise.all([fetchAllExpensesAdmin(), fetchAllCarsAdmin(), fetchAllSuppliers().catch(() => [])])
        // Os gastos dos carros trancados nem chegam (o banco não manda)
        return notePrivate(buildExpensesReport({ expenses, cars, suppliers, range, categoryLabel: expenseCategoryLabel }), withoutPrivate(cars).hidden)
      },
    },
    {
      id: 'financiamentos',
      title: 'Financiamentos',
      description: 'Carnês da loja (parcelas pagas, em aberto e atrasadas) e financiamentos externos enviados no período, com o retorno da loja.',
      usesPeriod: true,
      show: canManageCustomerFinance,
      build: async () => {
        const [financings, externals, sellers] = await Promise.all([
          fetchFinancings(),
          fetchExternalFinancings().catch(() => []),
          fetchSellers().catch(() => []),
        ])
        return buildFinancingReport({ financings, externals, sellers, range })
      },
    },
    {
      id: 'clientes',
      title: 'Clientes',
      description: 'Todos os clientes cadastrados, com contato e os carros que compraram.',
      usesPeriod: false,
      show: true,
      build: async () => {
        const [customers, cars] = await Promise.all([fetchAllCustomers(), fetchAllCarsAdmin()])
        return buildCustomersReport({ customers, cars })
      },
    },
  ].filter((r) => r.show)

  async function download(report, format) {
    setBusy(`${report.id}-${format}`)
    setError('')
    try {
      const [data, settings] = await Promise.all([report.build(), fetchCompanySettings()])
      if (format === 'pdf') await exportReportPdf(data, { companyName: settings.name })
      else await exportReportExcel(data, { companyName: settings.name })
    } catch (err) {
      setError(`Não foi possível gerar o relatório "${report.title}": ${err.message}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Baixe em PDF para imprimir ou enviar, ou em Excel para trabalhar os números</p>
        </div>
        <div className="admin-row-actions">
          <PeriodFilter
            period={period}
            onPeriodChange={setPeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!isStaff && !isSeller && <p className="admin-muted">Sem relatórios disponíveis.</p>}

      <div className="report-grid">
        {reports.map((report) => (
          <section className="report-card" key={report.id}>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
            <span className="report-card-period">{report.usesPeriod ? 'Usa o período escolhido acima' : 'Posição de hoje'}</span>
            <div className="report-card-actions">
              <button type="button" className="btn btn-outline" onClick={() => download(report, 'pdf')} disabled={Boolean(busy)}>
                <FileText size={15} /> {busy === `${report.id}-pdf` ? 'Gerando…' : 'PDF'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => download(report, 'xlsx')} disabled={Boolean(busy)}>
                <FileSpreadsheet size={15} /> {busy === `${report.id}-xlsx` ? 'Gerando…' : 'Excel'}
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
