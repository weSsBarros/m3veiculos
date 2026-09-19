# M&3 Veículos

Site de vitrine para revenda de veículos novos e seminovos, inspirado no layout da [blocobox.com](https://blocobox.com), adaptado para o mercado automotivo. Inclui um **painel administrativo** (`/admin`) para o cliente gerenciar o estoque (cadastrar carros, editar preço/km/fotos, marcar como vendido, excluir) e **controlar os gastos de cada carro** (elétrica, funilaria, mecânica, combustível etc.) com anexo de notas/fotos e cálculo automático de custo total e margem.

## Stack

- React + Vite
- React Router
- [Supabase](https://supabase.com) — banco de dados (Postgres), autenticação e armazenamento de fotos
- CSS puro (sem framework de UI)
- lucide-react (ícones)

## Configuração do Supabase (obrigatória)

O site busca os carros de um banco de dados Supabase — sem isso, tanto o site público quanto o `/admin` mostram uma tela pedindo para configurar. Siga estes passos uma única vez:

1. **Crie uma conta e um projeto** em [supabase.com](https://supabase.com) (o plano gratuito é suficiente). Anote a senha do banco que você definir.
2. **Rode o schema**: abra *SQL Editor* no painel do projeto → *New query* → cole todo o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) deste repositório → *Run*. Isso cria a tabela `cars`, a tabela `car_expenses` (gastos), as permissões (RLS), o bucket de fotos `car-photos`, o bucket privado de anexos `expense-attachments` e insere 16 carros de exemplo.
   > Se o projeto já existia antes desta função de gastos: **rode o `schema.sql` de novo**, ele é seguro de repetir — só adiciona o que falta (colunas de custo de aquisição, tabela de gastos, bucket de anexos e a proteção que impede o site público de ler o custo de aquisição).
3. **Pegue as chaves da API**: em *Project Settings → API*, copie a **Project URL** e a chave **anon public**.
4. **Configure o `.env`**: copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-public
   VITE_SITE_URL=https://dominio-onde-o-site-esta-publicado.com
   ```
   O `VITE_SITE_URL` é usado nos links de WhatsApp (para montar a URL completa do anúncio) e na geração dos previews por carro (passo abaixo). Sem domínio próprio ainda, use a URL temporária da hospedagem.
5. **Crie o usuário admin**: no painel do Supabase, vá em *Authentication → Users → Add user → Create new user*, informe o e-mail e senha que o cliente vai usar para entrar em `/admin`. Marque a opção para já confirmar o e-mail automaticamente (ou desative a confirmação por e-mail em *Authentication → Settings*).
6. Rode `npm install && npm run dev` e acesse `/admin` para logar.

> A chave `anon` é pública por natureza (é enviada ao navegador) — quem protege os dados é a Row Level Security: qualquer pessoa pode **ler** os carros, mas só usuários autenticados (o `/admin`) podem **criar/editar/excluir**. Isso já está configurado no `schema.sql`.

## Rodando localmente

```bash
npm install
npm run dev
```

## Painel administrativo (`/admin`)

- **Login**: e-mail e senha cadastrados no Supabase Auth (passo 5 acima). Não há cadastro público — só quem tem uma conta criada no Supabase acessa.
- **Estoque**: lista todos os carros (disponíveis e vendidos), com custo total e margem calculados automaticamente, atalho para marcar Disponível/Vendido com um clique, marcar como destaque (⭐), ver gastos, editar ou excluir.
- **Novo carro / Editar carro**: formulário completo — marca, modelo, versão, ano, km, câmbio, combustível, cor, categoria, preço (com preço "de" opcional para mostrar desconto), status, destaque na home, diferenciais (lista), descrição, **fotos** (upload direto, com reordenação e capa) e **preço/data de compra** (custo de aquisição, usado no cálculo de margem — não aparece no site público).
- **Gastos por carro** (`/admin/carros/:id/gastos`): cadastre cada gasto (categoria, valor, data, descrição) com anexo de fotos ou PDF de notas fiscais/recibos. A tela mostra o resumo — preço de compra, total gasto, custo total e margem — e o total por categoria. Os anexos ficam num bucket **privado**, acessíveis só pelo painel via link temporário.
- **Financeiro** (`/admin/financeiro`): painel consolidado com o total investido no estoque disponível, margem média, gastos por categoria (somando todos os carros) e uma tabela com custo total/margem de cada carro.
- O site público (`/estoque`, páginas de carro, carrosséis da home) só mostra carros com status **Disponível**. Um carro marcado como **Vendido** some das listagens, mas sua página de detalhe continua acessível (mostrando "Vendido" e sem o botão de WhatsApp) caso alguém tenha o link salvo. O custo de aquisição e os gastos **nunca** são expostos ao site público — só o painel `/admin` (autenticado) tem acesso.

## Estrutura

- `supabase/schema.sql` — schema completo do banco (tabelas, permissões, storage) + dados de exemplo.
- `src/lib/supabaseClient.js` — cliente Supabase (lê `.env`).
- `src/lib/carsApi.js` — funções de leitura/escrita dos carros e upload de fotos.
- `src/lib/expensesApi.js` — funções de leitura/escrita dos gastos por carro e upload/link assinado dos anexos.
- `src/context/CarsContext.jsx` — carrega os carros disponíveis para o site público.
- `src/context/AuthContext.jsx` — sessão de login do painel admin.
- `src/admin/` — painel administrativo (login, layout, lista de carros, formulário, upload de fotos, gastos por carro, painel financeiro).
- `src/utils/carFormat.js` — formatação de preço/parcelas e listas fixas (categorias de carro, marcas, câmbios, combustíveis, categorias de gasto).
- `src/components/` — componentes do site público (header, footer, cards, carrossel, FAQ etc.).
- `src/pages/` — páginas públicas: Home, Estoque (com filtros), Detalhe do carro, Sobre e Contato.
- `src/utils/whatsapp.js` — número de WhatsApp e helpers para montar os links de contato (mensagem já vem com dados do carro e link do anúncio).
- `scripts/prerender-og.mjs` — roda automaticamente depois do `npm run build` (`postbuild`). Busca os carros disponíveis no Supabase e gera uma página estática por carro (`dist/carro/<slug>/index.html`) com título, descrição e imagem específicos — é isso que faz o link do carro aparecer com foto/preço quando colado no WhatsApp, Instagram etc. Se o `.env` não tiver `VITE_SUPABASE_*`/`VITE_SITE_URL` preenchidos, o script pula essa etapa sem quebrar o build.

## Antes de publicar

- Rode o `supabase/schema.sql` (já não insere mais carros de exemplo — o schema só cria/atualiza a estrutura do banco) e cadastre o estoque real pelo `/admin`.
- Preencha o endereço da loja e o CNPJ real em `src/components/Footer.jsx` e `src/pages/Contact.jsx` (estão marcados com `[...]`).
- Confirme o e-mail de contato (`contato@m3veiculos.com.br`) e os números de WhatsApp em `src/utils/whatsapp.js`, `src/components/Header.jsx`, `src/components/Footer.jsx` e `src/pages/Contact.jsx`.
- Crie o(s) usuário(s) do painel admin no Supabase Auth com o e-mail real do cliente (e peça para ele trocar a senha depois, em *Authentication → Users*).
- Quando o domínio definitivo estiver no ar, atualize `VITE_SITE_URL` no `.env` e gere um novo build — os links de WhatsApp e os previews por carro usam esse valor.
