// Título e descrição de cada página pública (Google e prévia do WhatsApp). Os
// mesmos textos saem no HTML (api/pagina.php, gravados no build pelo
// vite.config.js) e no navegador (PublicLayout no App.jsx). A página inicial usa
// o título e a descrição do index.html de cada loja; a do carro, carSeo.js.
// store: { name, city }. Sem cidade, os textos ficam sem ela (o build põe São Luís
// quando o site da loja não diz a cidade; decisão do Wesley em 10/10/2026).
// Sem artigo antes do nome da loja ("a Dom Motors", "o Império"...).

const inCity = (store) => (store.city ? ` em ${store.city}` : '')

export function pageSeo(path, store) {
  const name = store.name
  switch (path) {
    case '/estoque':
      return {
        title: `Carros seminovos à venda${inCity(store)} | ${name}`,
        description: `${name}${inCity(store)}: carros à venda com fotos, preço e quilometragem, e atendimento direto pelo WhatsApp.`,
      }
    case '/sobre':
      return {
        title: `Quem somos | ${name}`,
        description: `${name}${inCity(store)}: conheça a loja e fale com a equipe pelo WhatsApp.`,
      }
    case '/contato':
      return {
        title: `Contato${inCity(store)} | ${name}`,
        description: `${name}${inCity(store)}: ${store.hasAddress ? 'WhatsApp, telefone e endereço' : 'WhatsApp e telefone'} para falar direto com a equipe.`,
      }
    case '/financiamento':
      return {
        title: `Financiamento de seminovos${inCity(store)} | ${name}`,
        description: `Simule as parcelas do seu seminovo e fale com a equipe pelo WhatsApp. ${name}${inCity(store)}.`,
      }
    case '/venda-seu-veiculo':
      return {
        title: `Venda ou troque seu carro${inCity(store)} | ${name}`,
        description: `Mande os dados do seu veículo e a equipe entra em contato pelo WhatsApp. ${name}${inCity(store)}.`,
      }
    default:
      return null
  }
}

// Cidade da loja pelo título, pela descrição ou pelo endereço (São Luís e região)
const CITIES = ['São José de Ribamar', 'Paço do Lumiar', 'Raposa', 'São Luís']

export function storeCity(...texts) {
  const all = texts.flat().filter(Boolean).join(' ')
  return CITIES.find((c) => all.includes(c)) || ''
}
