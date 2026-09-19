# M&3 Veículos

Site de vitrine para revenda de veículos novos e seminovos, inspirado no layout da [blocobox.com](https://blocobox.com), adaptado para o mercado automotivo. Inclui um **painel administrativo** (`/admin`) para o cliente gerenciar o estoque (cadastrar carros, editar preço/km/fotos, marcar como vendido, excluir).

## Stack

- React + Vite
- React Router
- [Supabase](https://supabase.com) — banco de dados (Postgres), autenticação e armazenamento de fotos
- CSS puro (sem framework de UI)
- lucide-react (ícones)

## Configuração do Supabase (obrigatória)

O site busca os carros de um banco de dados Supabase — sem isso, tanto o site público quanto o `/admin` mostram uma tela pedindo para configurar. Siga estes passos uma única vez:

1. **Crie uma conta e um projeto** em [supabase.com](https://supabase.com) (o plano gratuito é suficiente). Anote a senha do banco que você definir.
2. **Rode o schema**: abra *SQL Editor* no painel do projeto → *New query* → cole todo o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) deste repositório → *Run*. Isso cria a tabela `cars`, as permissões (RLS), o bucket de fotos `car-photos` e insere 16 carros de exemplo.
3. **Pegue as chaves da API**: em *Project Settings → API*, copie a **Project URL** e a chave **anon public**.
4. **Configure o `.env`**: copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-public
   ```
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
- **Estoque**: lista todos os carros (disponíveis e vendidos), com atalho para marcar Disponível/Vendido com um clique, editar ou excluir.
- **Novo carro / Editar carro**: formulário completo — marca, modelo, versão, ano, km, câmbio, combustível, cor, categoria, preço (com preço "de" opcional para mostrar desconto), status, diferenciais (lista), descrição e **fotos** (upload direto, com reordenação e capa).
- O site público (`/estoque`, páginas de carro, carrosséis da home) só mostra carros com status **Disponível**. Um carro marcado como **Vendido** some das listagens, mas sua página de detalhe continua acessível (mostrando "Vendido" e sem o botão de WhatsApp) caso alguém tenha o link salvo.

## Estrutura

- `supabase/schema.sql` — schema completo do banco (tabela, permissões, storage) + dados de exemplo.
- `src/lib/supabaseClient.js` — cliente Supabase (lê `.env`).
- `src/lib/carsApi.js` — funções de leitura/escrita dos carros e upload de fotos.
- `src/context/CarsContext.jsx` — carrega os carros disponíveis para o site público.
- `src/context/AuthContext.jsx` — sessão de login do painel admin.
- `src/admin/` — painel administrativo (login, layout, lista de carros, formulário, upload de fotos).
- `src/utils/carFormat.js` — formatação de preço/parcelas e listas fixas (categorias, marcas, câmbios, combustíveis).
- `src/components/` — componentes do site público (header, footer, cards, carrossel, FAQ etc.).
- `src/pages/` — páginas públicas: Home, Estoque (com filtros), Detalhe do carro, Sobre e Contato.
- `src/utils/whatsapp.js` — número de WhatsApp e helpers para montar os links de contato.

## Antes de publicar

- Rode o `supabase/schema.sql`, apague os 16 carros de exemplo pelo `/admin` (ou pela tabela no Supabase) e cadastre o estoque real.
- Preencha o endereço da loja e o CNPJ real em `src/components/Footer.jsx` e `src/pages/Contact.jsx` (estão marcados com `[...]`).
- Confirme o e-mail de contato (`contato@m3veiculos.com.br`) e os números de WhatsApp em `src/utils/whatsapp.js`, `src/components/Header.jsx`, `src/components/Footer.jsx` e `src/pages/Contact.jsx`.
- Crie o(s) usuário(s) do painel admin no Supabase Auth com o e-mail real do cliente (e peça para ele trocar a senha depois, em *Authentication → Users*).
