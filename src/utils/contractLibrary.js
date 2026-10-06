// Biblioteca "Modelos prontos" (06/10/2026): modelos-base de contratos e termos
// escritos pela WB.Dev para qualquer loja, com base no Código Civil, no Código
// de Defesa do Consumidor e no Código de Trânsito. Os arquivos ficam em
// public/modelos-contrato/ (gerados por design/contratos/gerar_biblioteca.py).
// A loja adiciona o modelo à sua lista e ajusta no editor; revisar com o
// advogado da loja antes de usar.

export const LIBRARY_GROUPS = [
  { id: 'entrada', label: 'Entrada do veículo (aquisição de estoque)' },
  { id: 'venda', label: 'Saída (venda ao consumidor)' },
  { id: 'termos', label: 'Termos aditivos e de garantia' },
  { id: 'outros', label: 'Outros documentos' },
]

export const CONTRACT_LIBRARY = [
  {
    file: 'entrada-compra-troca.docx',
    name: 'Compra de veículo usado pela loja (com troca/troco)',
    kind: 'entrada',
    group: 'entrada',
    description: 'A loja compra o carro de um particular, com opção de troca por carro do estoque e troco. Declarações do vendedor, vistoria cautelar, débitos até a entrega, ATPV-e e Renave, evicção e multa por desfazimento.',
  },
  {
    file: 'entrada-consignacao.docx',
    name: 'Consignação de veículo',
    kind: 'entrada',
    group: 'entrada',
    description: 'Contrato estimatório (arts. 534 a 537 do Código Civil) com o registro no Renave, valor do consignante, remuneração, exclusividade, retirada, débitos, test-drive e seguro.',
  },
  {
    file: 'venda-a-vista.docx',
    name: 'Compra e venda à vista',
    kind: 'venda',
    group: 'venda',
    description: 'Venda ao consumidor com pagamento à vista: entrega após a compensação, vistoria, débitos, transferência em 30 dias, comunicação de venda, garantia legal e desistência.',
  },
  {
    file: 'venda-reserva-dominio.docx',
    name: 'Compra e venda com reserva de domínio (financiamento direto)',
    kind: 'venda',
    group: 'venda',
    description: 'Financiamento pela própria loja: a propriedade fica com a loja até a quitação (arts. 521 a 528 do Código Civil), com as informações do crédito do art. 52 do CDC, mora e retomada.',
  },
  {
    file: 'venda-alienacao-fiduciaria.docx',
    name: 'Compra e venda com financiamento bancário (alienação fiduciária)',
    kind: 'venda',
    group: 'venda',
    description: 'Parte do preço financiada por banco: a venda depende da aprovação do crédito, a entrega só depois da liberação, e a loja não responde pelas condições do banco.',
  },
  {
    file: 'termo-vistoria-recebimento.docx',
    name: 'Termo de vistoria e recebimento (checklist)',
    kind: 'venda',
    group: 'termos',
    description: 'Checklist do veículo na entrega (data, hora, quilometragem, combustível, itens e avarias informadas), que protege a loja quanto ao estado do carro.',
  },
  {
    file: 'termo-garantia.docx',
    name: 'Termo de garantia legal e contratual',
    kind: 'venda',
    group: 'termos',
    description: 'Garantia legal de 90 dias (art. 26 do CDC) e garantia contratual opcional (motor, câmbio etc.), com o que não é coberto, as condições e como acionar.',
  },
  {
    file: 'venda-repasse.docx',
    name: 'Repasse entre lojistas (sem garantia)',
    kind: 'venda',
    group: 'outros',
    description: 'Venda a outro lojista para revenda, fora do CDC: no estado em que se encontra, sem garantia de vícios (salvo ocultação proposital) e com transferência entre estoques no Renave.',
  },
  {
    file: 'termo-reserva-sinal.docx',
    name: 'Termo de reserva com sinal (arras)',
    kind: 'venda',
    group: 'outros',
    description: 'Reserva do carro com sinal: quem desiste perde o sinal (ou devolve em dobro), e o sinal volta inteiro se o financiamento for negado sem culpa do cliente.',
  },
  {
    file: 'termo-test-drive.docx',
    name: 'Termo de test-drive',
    kind: 'venda',
    group: 'outros',
    description: 'Responsabilidade do condutor no test-drive: CNH, trajeto acompanhado, multas (indicação de condutor) e danos.',
  },
  {
    file: 'distrato-compra-venda.docx',
    name: 'Distrato de compra e venda',
    kind: 'venda',
    group: 'outros',
    description: 'Desfaz uma venda de comum acordo: devolução do carro e dos valores com os descontos, multas do período, documentos e quitação.',
  },
]

export function libraryUrl(item) {
  return `/modelos-contrato/${item.file}`
}

// O modelo já foi adicionado pela loja (pelo arquivo de origem ou pelo nome)
export function libraryAdded(item, templates) {
  return templates.some((t) => t.originalFilename === item.file || t.name === item.name)
}
