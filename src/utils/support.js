// Suporte do sistema (WB.Dev): o item "Ajuda" do painel e o crédito
// "Site e sistema: WB.AUTO" no rodapé do site levam a este WhatsApp.
export const SUPPORT_WHATSAPP = '5598981295577'
export const SUPPORT_DISPLAY = '(98) 98129-5577'

const link = (text) => `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`

// Painel → Ajuda: a mensagem já diz de qual loja é
export function supportLink(storeName) {
  return link(`Olá! Sou da ${storeName} e preciso de ajuda com o painel.`)
}

// Rodapé do site: quem gostou do site e quer um igual
export function creditLink(storeName) {
  return link(`Olá! Vi o site da ${storeName} e quero saber mais sobre o sistema WB.AUTO.`)
}
