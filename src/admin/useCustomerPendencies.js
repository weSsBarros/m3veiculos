import { useEffect, useMemo, useState } from 'react'
import { Sparkles, PhoneCall, CarFront } from 'lucide-react'
import { fetchMatches, fetchContacts, fetchInterests } from '../lib/customerCrmApi.js'
import { fetchAllCustomers } from '../lib/customersApi.js'
import { customerGaps } from '../utils/dashboardAlerts.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Pendências de clientes (Dashboard e "Minhas vendas"): carro novo que
// combina, retornos de atendimento e carro de que o cliente gostou que foi
// vendido. onlyMine (vendedor): clientes dele ou sem responsável, e os
// retornos que ele marcou ou de clientes dele. Admin e gerente veem todos.
export default function useCustomerPendencies(cars, { onlyMine = false, sellerId = null, userId = null } = {}) {
  const [data, setData] = useState({ matches: [], contacts: [], interests: [], customers: [] })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchMatches({ status: 'novo' }).catch(() => []),
      fetchContacts({ openFollowUps: true }).catch(() => []),
      fetchInterests().catch(() => []),
      fetchAllCustomers().catch(() => []),
    ]).then(([matches, contacts, interests, customers]) => {
      if (!cancelled) setData({ matches, contacts, interests, customers })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => {
    const responsible = new Map(data.customers.map((c) => [c.id, c.responsibleSellerId]))
    const mine = !onlyMine
      ? () => true
      : (customerId, row) => {
          // Sem login (autor ou vendedor) não conta como "meu": null === null daria todos
          if (row && 'followUpOn' in row) return Boolean(userId && row.createdBy === userId) || Boolean(sellerId && responsible.get(customerId) === sellerId)
          const owner = responsible.get(customerId)
          return !owner || owner === sellerId
        }
    const gaps = customerGaps({ matches: data.matches, contacts: data.contacts, interests: data.interests, cars, mine })
    return [
      {
        key: 'interest-match',
        count: gaps.newMatches,
        icon: Sparkles,
        to: '/admin/clientes?filtro=combina',
        cta: 'Avisar',
        text: `${plural(gaps.newMatches, 'cliente tem', 'clientes têm')} carro novo no estoque que combina com o que ${gaps.newMatches === 1 ? 'procura' : 'procuram'}.`,
      },
      {
        key: 'follow-up',
        count: gaps.followUps,
        icon: PhoneCall,
        to: '/admin/clientes?filtro=retorno',
        cta: 'Ver',
        text: `${plural(gaps.followUps, 'retorno de atendimento', 'retornos de atendimento')} para hoje ou ${gaps.followUps === 1 ? 'atrasado' : 'atrasados'}.`,
      },
      {
        key: 'liked-car-gone',
        count: gaps.likedCarGone,
        icon: CarFront,
        to: '/admin/clientes?filtro=carro-vendido',
        cta: 'Ver',
        text: `${plural(gaps.likedCarGone, 'cliente gostou', 'clientes gostaram')} de um carro que foi vendido ou reservado para outra pessoa — ofereça outra opção.`,
      },
    ]
  }, [data, cars, onlyMine, sellerId, userId])
}
