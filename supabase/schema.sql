-- Dom Motors — schema do Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase (Project > SQL Editor > New query).
-- Pode rodar novamente sem problemas: os comandos são "idempotentes" (if not exists / on conflict).

-- 1) Tabela principal de carros --------------------------------------------

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  brand text not null,
  model text not null,
  version text not null,
  year integer not null,
  model_year text not null,
  km integer not null default 0,
  transmission text not null,
  fuel text not null,
  color text not null,
  doors integer not null default 4,
  category text not null,
  condition text not null default 'Único dono',
  price integer not null,
  original_price integer,
  badge text not null default 'Disponível',
  status text not null default 'disponivel' check (status in ('disponivel', 'vendido')),
  highlights text[] not null default '{}',
  description text not null default '',
  images jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cars_status_idx on public.cars (status);
create index if not exists cars_category_idx on public.cars (category);
create index if not exists cars_brand_idx on public.cars (brand);
create index if not exists cars_slug_idx on public.cars (slug);

-- Custo de aquisição do carro (controle financeiro interno, não aparece no site público)
alter table public.cars add column if not exists purchase_price integer;
alter table public.cars add column if not exists purchase_date date;

-- Controle manual de "carros em destaque" na home (marcado pelo admin)
alter table public.cars add column if not exists featured boolean not null default false;
create index if not exists cars_featured_idx on public.cars (featured);

-- mantém updated_at em dia automaticamente
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists cars_set_updated_at on public.cars;
create trigger cars_set_updated_at
before update on public.cars
for each row execute function public.set_updated_at();

-- 2) Row Level Security ------------------------------------------------------
-- Qualquer visitante pode LER os carros (o site público precisa disso).
-- Só usuários autenticados (logados no painel admin) podem criar/editar/apagar.

alter table public.cars enable row level security;

drop policy if exists "Public can read cars" on public.cars;
create policy "Public can read cars"
on public.cars for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can insert cars" on public.cars;
create policy "Authenticated can insert cars"
on public.cars for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update cars" on public.cars;
create policy "Authenticated can update cars"
on public.cars for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete cars" on public.cars;
create policy "Authenticated can delete cars"
on public.cars for delete
to authenticated
using (true);

-- RLS libera a LEITURA de todas as colunas por linha, mas "purchase_price" e "purchase_date"
-- são o custo de aquisição do carro — informação sensível que não pode vazar para o site público
-- (a chave "anon" é pública, então isso precisa ser bloqueado a nível de coluna, não só de linha).
-- Só o papel "authenticated" (login do /admin) pode ler essas duas colunas.
-- "hidden" também precisa estar aqui: mesmo não sendo exibida ao público, o site
-- usa ela num filtro (where hidden = false) nas buscas públicas — e o Postgres
-- exige permissão de leitura da coluna pra usá-la em filtro, não só pra exibir.
-- Sem isso, a busca pública inteira falha (nenhum carro aparece no site).
-- (A coluna é criada aqui porque, numa instalação nova, a seção 7 ainda não rodou.)
alter table public.cars add column if not exists hidden boolean not null default false;
revoke select on public.cars from anon;
grant select (
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, created_at, updated_at
) on public.cars to anon;

-- 3) Storage: bucket público para as fotos dos carros ------------------------

insert into storage.buckets (id, name, public)
values ('car-photos', 'car-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public can view car photos" on storage.objects;
create policy "Public can view car photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'car-photos');

drop policy if exists "Authenticated can upload car photos" on storage.objects;
create policy "Authenticated can upload car photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-photos');

drop policy if exists "Authenticated can update car photos" on storage.objects;
create policy "Authenticated can update car photos"
on storage.objects for update
to authenticated
using (bucket_id = 'car-photos');

drop policy if exists "Authenticated can delete car photos" on storage.objects;
create policy "Authenticated can delete car photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'car-photos');

-- 4) Gastos por carro (elétrica, funilaria, mecânica, combustível etc.) ------
-- Tabela só acessível pelo painel admin (/admin) — nunca pelo site público.

create table if not exists public.car_expenses (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  category text not null,
  description text not null default '',
  amount integer not null,
  expense_date date not null default current_date,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_expenses_car_id_idx on public.car_expenses (car_id);
create index if not exists car_expenses_category_idx on public.car_expenses (category);

drop trigger if exists car_expenses_set_updated_at on public.car_expenses;
create trigger car_expenses_set_updated_at
before update on public.car_expenses
for each row execute function public.set_updated_at();

alter table public.car_expenses enable row level security;

drop policy if exists "Authenticated can read expenses" on public.car_expenses;
create policy "Authenticated can read expenses"
on public.car_expenses for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert expenses" on public.car_expenses;
create policy "Authenticated can insert expenses"
on public.car_expenses for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update expenses" on public.car_expenses;
create policy "Authenticated can update expenses"
on public.car_expenses for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete expenses" on public.car_expenses;
create policy "Authenticated can delete expenses"
on public.car_expenses for delete
to authenticated
using (true);

-- 5) Storage: bucket PRIVADO para anexos dos gastos (fotos e PDFs de notas) ---
-- Diferente do bucket de fotos dos carros, este é privado: os arquivos só são
-- acessíveis por link assinado (temporário), gerado pelo painel admin.

insert into storage.buckets (id, name, public)
values ('expense-attachments', 'expense-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated can view expense attachments" on storage.objects;
create policy "Authenticated can view expense attachments"
on storage.objects for select
to authenticated
using (bucket_id = 'expense-attachments');

drop policy if exists "Authenticated can upload expense attachments" on storage.objects;
create policy "Authenticated can upload expense attachments"
on storage.objects for insert
to authenticated
with check (bucket_id = 'expense-attachments');

drop policy if exists "Authenticated can delete expense attachments" on storage.objects;
create policy "Authenticated can delete expense attachments"
on storage.objects for delete
to authenticated
using (bucket_id = 'expense-attachments');

-- 6) Dados de exemplo (opcional) ---------------------------------------------
-- 16 carros fictícios para o site não ficar vazio no primeiro acesso.
-- Apague ou edite pelo painel /admin depois que os dados reais estiverem prontos.
-- Só roda numa instalação nova (antes da coluna company_id existir — seção 11).
-- Num projeto que já passou pela migração multi-tenant, rodar o schema.sql de
-- novo pularia isso: inserir sem company_id violaria a constraint not null.
do $$
begin
if not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'cars' and column_name = 'company_id'
) then

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'toyota-corolla-xei-2022', 'Toyota', 'Corolla', 'XEi 2.0 Flex', 2022, '2022/2022', 32000,
  'Automático CVT', 'Flex', 'Branco Polar', 4, 'sedan', 'Único dono',
  119900, 129900, 'Última unidade', 'disponivel',
  ARRAY['Revisado na concessionária', 'Único dono', 'IPVA 2026 pago', 'Laudo cautelar aprovado']::text[], 'Corolla XEi impecável, com histórico completo de revisões na concessionária Toyota. Interior conservado, multimídia com Apple CarPlay/Android Auto, bancos em couro e piloto automático adaptativo.', '["https://images.unsplash.com/photo-1774854158646-589f7c712bdc?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1582639510494-c80b5de9f148?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1613027633780-8bc7365c0101?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'honda-hrv-exl-2023', 'Honda', 'HR-V', 'EXL 1.5 Turbo', 2023, '2023/2023', 18500,
  'Automático CVT', 'Flex', 'Prata Lunar', 4, 'suv', 'Único dono',
  139900, 149900, 'Poucas unidades', 'disponivel',
  ARRAY['Garantia de fábrica', 'Teto solar', 'Câmera 360°', 'Revisado']::text[], 'HR-V EXL Turbo com baixíssima quilometragem, ainda na garantia de fábrica. Teto solar panorâmico, central multimídia de 9", sensores dianteiros e traseiros e assistente de permanência em faixa.', '["https://images.unsplash.com/photo-1653325189816-5d8dc746cc16?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1658988297153-e173ba9c490d?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1748214547184-d994bfe53322?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'volkswagen-polo-highline-2021', 'Volkswagen', 'Polo', 'Highline 200 TSI', 2021, '2021/2021', 41000,
  'Automático 6 marchas', 'Flex', 'Vermelho Flash', 4, 'hatch', 'Segundo dono',
  79900, 84900, 'Disponível', 'disponivel',
  ARRAY['Revisado', 'IPVA pago', 'Rodas de liga leve 17"', 'Multimídia VW Play']::text[], 'Polo Highline turbo, ágil e econômico. Bancos com acabamento premium, ar-condicionado digital de duas zonas e faróis full LED. Pneus novos e revisão completa em dia.', '["https://images.unsplash.com/photo-1586201047938-f117c409e2d7?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1605270396307-d00ba5cda1d0?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1605270397189-b613ace3b4f3?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'chevrolet-onix-plus-ltz-2022', 'Chevrolet', 'Onix Plus', 'LTZ 1.0 Turbo', 2022, '2022/2023', 29000,
  'Automático', 'Flex', 'Branco Summit', 4, 'sedan', 'Único dono',
  84900, 89900, 'Disponível', 'disponivel',
  ARRAY['Único dono', 'Revisado na concessionária', 'IPVA 2026 pago', 'Central multimídia 8"']::text[], 'Onix Plus LTZ Turbo com ótimo custo-benefício, completo com sensor de estacionamento, câmera de ré, piloto automático e conectividade sem fio com Apple CarPlay/Android Auto.', '["https://images.unsplash.com/photo-1656200529331-0596ff6372f1?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1656200732291-78edf5bec525?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1758179128122-6079c9cb3e4e?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'jeep-compass-longitude-2021', 'Jeep', 'Compass', 'Longitude 1.3 Turbo', 2021, '2021/2021', 52000,
  'Automático 6 marchas', 'Flex', 'Cinza Granite', 4, 'suv', 'Segundo dono',
  118900, 124900, 'Disponível', 'disponivel',
  ARRAY['Revisado', 'Laudo cautelar aprovado', 'Bancos em couro', 'Central 8.4"']::text[], 'Compass Longitude robusto e confortável para o dia a dia e viagens em família. Suspensão revisada, pneus em bom estado e documentação 100% regularizada.', '["https://images.unsplash.com/photo-1748214547306-360d11024747?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1758411898236-60451aa6c6c9?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1758411898280-2dc7c95e0ba7?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'fiat-toro-freedom-2022', 'Fiat', 'Toro', 'Freedom 2.0 Diesel 4x4', 2022, '2022/2022', 38000,
  'Automático 9 marchas', 'Diesel', 'Preto Vulcano', 4, 'picape', 'Único dono',
  149900, 159900, 'Última unidade', 'disponivel',
  ARRAY['Tração 4x4', 'Único dono', 'Revisado', 'Caçamba com forração']::text[], 'Toro Freedom Diesel 4x4, motor forte e econômico para trabalho e lazer. Caçamba com forração e engate, ótima para quem precisa de espaço e robustez sem abrir mão do conforto.', '["https://images.unsplash.com/photo-1598043249911-1122b7faa4f3?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1655209302911-a1e6d6253d77?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1509510834889-05f7321fa47d?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'hyundai-hb20-comfort-2023', 'Hyundai', 'HB20', 'Comfort 1.0', 2023, '2023/2023', 15000,
  'Manual', 'Flex', 'Prata Sleek', 4, 'hatch', 'Único dono',
  76900, null, 'Poucas unidades', 'disponivel',
  ARRAY['Baixa km', 'Único dono', 'IPVA pago', 'Revisado']::text[], 'HB20 Comfort com baixíssima quilometragem, ideal para o dia a dia na cidade. Econômico, ágil e com excelente valor de revenda. Documentação em dia e pronto para transferência.', '["https://images.unsplash.com/photo-1471444928139-48c5bf5173f8?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1663852408695-f57f4d75a536?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1667913605679-278b1b9604fa?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'renault-duster-iconic-2020', 'Renault', 'Duster', 'Iconic 1.6 CVT', 2020, '2020/2020', 61000,
  'Automático CVT', 'Flex', 'Branco Glacier', 4, 'suv', 'Segundo dono',
  76900, 82900, 'Disponível', 'disponivel',
  ARRAY['Revisado', 'Laudo cautelar aprovado', 'Câmera de ré', 'Multimídia com GPS']::text[], 'Duster Iconic com ótimo espaço interno e porta-malas generoso. Suspensão alta ideal para estradas de terra, revisão em dia e pneus com boa vida útil restante.', '["https://images.unsplash.com/photo-1760163288073-74799d2275c4?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1788873951020-59860eb91280?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'nissan-kicks-sl-2022', 'Nissan', 'Kicks', 'SL CVT', 2022, '2022/2022', 34000,
  'Automático CVT', 'Flex', 'Vermelho Vibrante', 4, 'suv', 'Único dono',
  108900, null, 'Disponível', 'disponivel',
  ARRAY['Único dono', 'Revisado na concessionária', 'Câmera 360°', 'Teto bicolor']::text[], 'Kicks SL completo, com câmera 360°, central multimídia com navegação e acabamento bicolor. Excelente estado de conservação, interno e externo.', '["https://images.unsplash.com/photo-1758411898226-5b91498e87e0?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1788874620958-3a96ce22f5b4?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1658988297153-e173ba9c490d?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'ford-ranger-xls-2021', 'Ford', 'Ranger', 'XLS 2.2 Diesel 4x4', 2021, '2021/2021', 47000,
  'Manual', 'Diesel', 'Prata Aluminium', 4, 'picape', 'Segundo dono',
  179900, 189900, 'Disponível', 'disponivel',
  ARRAY['Tração 4x4', 'Revisada', 'Laudo cautelar aprovado', 'Capota marítima']::text[], 'Ranger XLS Diesel 4x4, robusta e preparada para o trabalho pesado ou aventura fora de estrada. Capota marítima incluída, revisões em dia e pneus em ótimo estado.', '["https://images.unsplash.com/photo-1564355172839-be57081c219f?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1592092186887-af4968ddc78c?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1598043249911-1122b7faa4f3?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'volkswagen-t-cross-comfortline-2023', 'Volkswagen', 'T-Cross', 'Comfortline 200 TSI', 2023, '2023/2023', 21000,
  'Automático 6 marchas', 'Flex', 'Azul Biscay', 4, 'suv', 'Único dono',
  132900, null, 'Poucas unidades', 'disponivel',
  ARRAY['Único dono', 'Garantia de fábrica', 'Multimídia VW Play', 'Revisado']::text[], 'T-Cross Comfortline com baixa quilometragem e ainda coberta pela garantia de fábrica. Ótimo espaço interno, porta-malas amplo e assistentes de condução completos.', '["https://images.unsplash.com/photo-1779983625011-e9c207710d11?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1771208442405-73a20b41111a?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1758411898236-60451aa6c6c9?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'toyota-corolla-cross-xre-2023', 'Toyota', 'Corolla Cross', 'XRE 2.0 Flex', 2023, '2023/2023', 12000,
  'Automático CVT', 'Flex', 'Preto Ébano', 4, 'suv', 'Único dono',
  149900, 159900, 'Última unidade', 'disponivel',
  ARRAY['Baixa km', 'Único dono', 'Garantia de fábrica', 'Bancos em couro']::text[], 'Corolla Cross XRE seminovo, com quilometragem baixíssima e ainda na garantia de fábrica. Interior premium, central multimídia de 9" e pacote completo de segurança Toyota Safety Sense.', '["https://images.unsplash.com/photo-1653325189816-5d8dc746cc16?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1788874620958-3a96ce22f5b4?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1788873951020-59860eb91280?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'chevrolet-tracker-premier-2022', 'Chevrolet', 'Tracker', 'Premier 1.2 Turbo', 2022, '2022/2022', 26000,
  'Automático', 'Flex', 'Branco Summit', 4, 'suv', 'Único dono',
  119900, null, 'Disponível', 'disponivel',
  ARRAY['Único dono', 'Revisado', 'Teto solar', 'Central multimídia 8"']::text[], 'Tracker Premier completa, com teto solar, bancos aquecidos e central multimídia com navegação. Estado de conservação impecável, dentro e fora.', '["https://images.unsplash.com/photo-1758411898280-2dc7c95e0ba7?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1758411898226-5b91498e87e0?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1748214547306-360d11024747?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'honda-civic-touring-2021', 'Honda', 'Civic', 'Touring 1.5 Turbo', 2021, '2021/2021', 44000,
  'Automático CVT', 'Flex', 'Cinza Modern Steel', 4, 'sedan', 'Segundo dono',
  129900, 139900, 'Disponível', 'disponivel',
  ARRAY['Revisado', 'Bancos em couro', 'Teto solar', 'Honda Sensing']::text[], 'Civic Touring, o sedan esportivo com acabamento premium. Pacote completo de segurança Honda Sensing, teto solar e bancos em couro com ajuste elétrico.', '["https://images.unsplash.com/photo-1613027633780-8bc7365c0101?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1656200732291-78edf5bec525?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1774854158646-589f7c712bdc?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'fiat-pulse-drive-2023', 'Fiat', 'Pulse', 'Drive 1.3', 2023, '2023/2023', 9000,
  'Manual', 'Flex', 'Amarelo Racing', 4, 'suv', 'Único dono',
  98900, null, 'Poucas unidades', 'disponivel',
  ARRAY['Baixa km', 'Único dono', 'Garantia de fábrica', 'Central multimídia 10.1"']::text[], 'Pulse Drive praticamente zero km, com visual marcante e central multimídia de 10.1". Ótima opção de SUV compacto com baixo custo de manutenção.', '["https://images.unsplash.com/photo-1771208442405-73a20b41111a?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1748214547184-d994bfe53322?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

insert into public.cars (slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors, category, condition, price, original_price, badge, status, highlights, description, images) values (
  'renault-kwid-zen-2022', 'Renault', 'Kwid', 'Zen 1.0', 2022, '2022/2022', 22000,
  'Manual', 'Flex', 'Branco Glacier', 4, 'hatch', 'Único dono',
  54900, 59900, 'Disponível', 'disponivel',
  ARRAY['Único dono', 'Baixo consumo', 'IPVA pago', 'Revisado']::text[], 'Kwid Zen, o hatch compacto mais econômico da categoria. Ideal para o dia a dia na cidade, com baixíssimo custo de manutenção e seguro acessível.', '["https://images.unsplash.com/photo-1605270397189-b613ace3b4f3?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1663852408695-f57f4d75a536?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1586201047938-f117c409e2d7?auto=format&fit=crop&w=1200&q=80"]'::jsonb
)
on conflict (slug) do nothing;

end if;
end $$;

-- 7) Ocultar carro do site sem marcar como vendido (reservado, em negociação etc.) -
-- Diferente de "vendido", um carro oculto some do site mas continua no estoque.

alter table public.cars add column if not exists hidden boolean not null default false;
create index if not exists cars_hidden_idx on public.cars (hidden);

-- Data em que o carro foi marcado como "vendido" (preenchida automaticamente pelo
-- painel admin) — alimenta a aba Histórico.
alter table public.cars add column if not exists sold_at timestamptz;

-- Identificação do veículo (placa, chassi, Renavam), usada para preencher o
-- contrato de venda automaticamente.
alter table public.cars add column if not exists plate text;
alter table public.cars add column if not exists chassis text;
alter table public.cars add column if not exists renavam text;

-- Documentos anexados ao carro (CRLV, laudo cautelar, nota fiscal etc.) — mesmo
-- padrão de car_expenses.attachments, guardado como jsonb de {path, name, type}.
alter table public.cars add column if not exists documents jsonb not null default '[]';

-- 8) Storage: bucket PRIVADO para documentos dos carros ----------------------
-- Igual ao "expense-attachments": só o painel admin (authenticated) acessa,
-- nunca fica público.

insert into storage.buckets (id, name, public)
values ('car-documents', 'car-documents', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated can view car documents" on storage.objects;
create policy "Authenticated can view car documents"
on storage.objects for select
to authenticated
using (bucket_id = 'car-documents');

drop policy if exists "Authenticated can upload car documents" on storage.objects;
create policy "Authenticated can upload car documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-documents');

drop policy if exists "Authenticated can delete car documents" on storage.objects;
create policy "Authenticated can delete car documents"
on storage.objects for delete
to authenticated
using (bucket_id = 'car-documents');

-- 9) Contratos de venda gerados pelo painel -----------------------------------
-- Guarda um "retrato" (snapshot) dos dados da empresa, do comprador e do veículo
-- no momento em que o contrato foi gerado — assim, editar ou apagar o carro depois
-- não altera contratos já emitidos. Só acessível pelo painel admin.

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  car_id uuid references public.cars(id) on delete set null,
  company_name text not null,
  company_document text not null,
  company_address text not null default '',
  company_phone text not null default '',
  company_email text not null default '',
  buyer_name text not null,
  buyer_document text not null,
  buyer_rg text not null default '',
  buyer_address text not null default '',
  buyer_phone text not null default '',
  buyer_email text not null default '',
  vehicle_snapshot jsonb not null default '{}',
  sale_price integer not null,
  payment_method text not null default '',
  payment_details text not null default '',
  sale_date date not null default current_date,
  sale_city text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists contracts_car_id_idx on public.contracts (car_id);

alter table public.contracts enable row level security;

drop policy if exists "Authenticated can read contracts" on public.contracts;
create policy "Authenticated can read contracts"
on public.contracts for select
to authenticated
using (true);

drop policy if exists "Authenticated can insert contracts" on public.contracts;
create policy "Authenticated can insert contracts"
on public.contracts for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can delete contracts" on public.contracts;
create policy "Authenticated can delete contracts"
on public.contracts for delete
to authenticated
using (true);

-- 10) Status "em manutenção" — carro fora de venda mas ainda não vendido -----
-- (retirado de circulação pra reparo/preparação antes de ir pro estoque disponível)

alter table public.cars drop constraint if exists cars_status_check;
alter table public.cars add constraint cars_status_check
  check (status in ('disponivel', 'manutencao', 'vendido'));

-- 11) Multi-tenant: várias empresas (sites) no mesmo projeto Supabase --------
-- Cada empresa é uma linha em "companies". Cada usuário do Supabase Auth é
-- vinculado a uma empresa via "user_company". A função current_company_id()
-- devolve a empresa do usuário logado e é usada nas policies de RLS abaixo
-- pra isolar os dados: um admin da empresa A nunca lê/escreve dado da empresa B.
-- Isso existe pra não precisar criar um projeto Supabase novo (e pagar mais
-- $10/mês de compute) a cada cliente novo — todos compartilham este projeto.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_company (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (user_id, company_id)
);

alter table public.user_company enable row level security;

drop policy if exists "User can read own company link" on public.user_company;
create policy "User can read own company link"
on public.user_company for select
to authenticated
using (user_id = auth.uid());

-- security definer: precisa ler user_company ignorando a RLS dela (que só
-- deixa cada usuário ver a própria linha), senão vira referência circular.
create or replace function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.user_company where user_id = auth.uid() limit 1
$$;
grant execute on function public.current_company_id() to authenticated;

-- Empresa "Dom Motors" (a primeira, já existente) e migração dos dados atuais
insert into public.companies (slug, name) values ('dom-motors', 'Dom Motors')
on conflict (slug) do nothing;

alter table public.cars add column if not exists company_id uuid references public.companies(id);
update public.cars set company_id = (select id from public.companies where slug = 'dom-motors') where company_id is null;
alter table public.cars alter column company_id set not null;
create index if not exists cars_company_id_idx on public.cars (company_id);

alter table public.car_expenses add column if not exists company_id uuid references public.companies(id);
update public.car_expenses set company_id = (select id from public.companies where slug = 'dom-motors') where company_id is null;
alter table public.car_expenses alter column company_id set not null;
create index if not exists car_expenses_company_id_idx on public.car_expenses (company_id);

alter table public.contracts add column if not exists company_id uuid references public.companies(id);
update public.contracts set company_id = (select id from public.companies where slug = 'dom-motors') where company_id is null;
alter table public.contracts alter column company_id set not null;
create index if not exists contracts_company_id_idx on public.contracts (company_id);

-- Instalação nova: os usuários que já existem viram admin da Dom Motors.
-- Isso só acontece enquanto NINGUÉM estiver vinculado a nenhuma loja. Antes,
-- rodar o schema.sql de novo ligava como admin da Dom Motors todo usuário do
-- projeto, inclusive a equipe das outras lojas (ver seção 27). Pra um cliente
-- novo, insira manualmente uma linha em user_company vinculando o auth.uid()
-- dele à company_id certa.
insert into public.user_company (user_id, company_id)
select id, (select id from public.companies where slug = 'dom-motors') from auth.users
where not exists (select 1 from public.user_company)
on conflict do nothing;

-- company_id precisa estar liberado pro "anon" ler, senão o filtro
-- .eq('company_id', ...) do site público falha por falta de permissão de
-- coluna (mesmo motivo do "hidden" — ver comentário na seção 2).
revoke select on public.cars from anon;
grant select (
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, company_id, created_at, updated_at
) on public.cars to anon;

-- Escrita em "cars" agora exige ser da mesma empresa do carro
drop policy if exists "Authenticated can insert cars" on public.cars;
create policy "Authenticated can insert cars"
on public.cars for insert
to authenticated
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can update cars" on public.cars;
create policy "Authenticated can update cars"
on public.cars for update
to authenticated
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can delete cars" on public.cars;
create policy "Authenticated can delete cars"
on public.cars for delete
to authenticated
using (company_id = public.current_company_id());

-- "car_expenses" e "contracts" nunca são lidos pelo site público — antes
-- qualquer admin logado (de qualquer empresa) lia/escrevia tudo; agora fica
-- restrito à própria empresa.
drop policy if exists "Authenticated can read expenses" on public.car_expenses;
create policy "Authenticated can read expenses"
on public.car_expenses for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Authenticated can insert expenses" on public.car_expenses;
create policy "Authenticated can insert expenses"
on public.car_expenses for insert
to authenticated
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can update expenses" on public.car_expenses;
create policy "Authenticated can update expenses"
on public.car_expenses for update
to authenticated
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can delete expenses" on public.car_expenses;
create policy "Authenticated can delete expenses"
on public.car_expenses for delete
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Authenticated can read contracts" on public.contracts;
create policy "Authenticated can read contracts"
on public.contracts for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Authenticated can insert contracts" on public.contracts;
create policy "Authenticated can insert contracts"
on public.contracts for insert
to authenticated
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can delete contracts" on public.contracts;
create policy "Authenticated can delete contracts"
on public.contracts for delete
to authenticated
using (company_id = public.current_company_id());

-- Storage: cada arquivo passa a viver dentro de uma pasta "{company_id}/...".
-- Os 3 buckets estão vazios hoje, então não há arquivo antigo pra realocar.
drop policy if exists "Authenticated can upload car photos" on storage.objects;
create policy "Authenticated can upload car photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'car-photos'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can update car photos" on storage.objects;
create policy "Authenticated can update car photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'car-photos'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can delete car photos" on storage.objects;
create policy "Authenticated can delete car photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'car-photos'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can view expense attachments" on storage.objects;
create policy "Authenticated can view expense attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'expense-attachments'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can upload expense attachments" on storage.objects;
create policy "Authenticated can upload expense attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'expense-attachments'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can delete expense attachments" on storage.objects;
create policy "Authenticated can delete expense attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'expense-attachments'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can view car documents" on storage.objects;
create policy "Authenticated can view car documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can upload car documents" on storage.objects;
create policy "Authenticated can upload car documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can delete car documents" on storage.objects;
create policy "Authenticated can delete car documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'car-documents'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

-- 12) Corrige leitura de "cars" pra admin autenticado ------------------------
-- A policy da seção 2 ("Public can read cars") cobria "anon" e "authenticated"
-- com using(true) — certo pro site público (vitrine é mesmo pra todo mundo ver),
-- mas deixava qualquer admin logado (de qualquer empresa) ler os carros de
-- TODAS as empresas via API direta, inclusive purchase_price/purchase_date
-- (que "authenticated" tem permissão de coluna pra ver, diferente de "anon").
-- Agora "anon" continua liberado geral; "authenticated" só lê da própria empresa.
drop policy if exists "Public can read cars" on public.cars;
create policy "Public can read cars"
on public.cars for select
to anon
using (true);

drop policy if exists "Authenticated can read own company cars" on public.cars;
create policy "Authenticated can read own company cars"
on public.cars for select
to authenticated
using (company_id = public.current_company_id());

-- 13) Preço opcional ------------------------------------------------------------
-- Algumas lojas preferem não expor o valor no anúncio (carro aparece como
-- "Consulte o valor" e o cliente fala direto com o vendedor pelo WhatsApp).
alter table public.cars alter column price drop not null;

-- 14) Fornecedores ---------------------------------------------------------------
-- Permite registrar com quem cada gasto foi feito (oficina, loja de peças etc.)
-- pra loja acompanhar quanto gastou em cada prestador/fornecedor ao longo do ano.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text not null default 'servico' check (category in ('servico', 'pecas', 'outros')),
  contact text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_company_id_idx on public.suppliers (company_id);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;

drop policy if exists "Authenticated can read suppliers" on public.suppliers;
create policy "Authenticated can read suppliers"
on public.suppliers for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Authenticated can insert suppliers" on public.suppliers;
create policy "Authenticated can insert suppliers"
on public.suppliers for insert
to authenticated
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can update suppliers" on public.suppliers;
create policy "Authenticated can update suppliers"
on public.suppliers for update
to authenticated
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can delete suppliers" on public.suppliers;
create policy "Authenticated can delete suppliers"
on public.suppliers for delete
to authenticated
using (company_id = public.current_company_id());

-- Vincula o gasto a um fornecedor (opcional) pra alimentar o relatório
-- "gasto por fornecedor" na aba Financeiro.
alter table public.car_expenses add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists car_expenses_supplier_id_idx on public.car_expenses (supplier_id);

-- 15) Cadastro de clientes -------------------------------------------------------
-- Controle de pra quem cada carro foi vendido, com os dados relevantes do
-- comprador (documento, contato) reaproveitáveis na hora de gerar o contrato.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  document text not null default '',
  rg text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_company_id_idx on public.customers (company_id);

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

drop policy if exists "Authenticated can read customers" on public.customers;
create policy "Authenticated can read customers"
on public.customers for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Authenticated can insert customers" on public.customers;
create policy "Authenticated can insert customers"
on public.customers for insert
to authenticated
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can update customers" on public.customers;
create policy "Authenticated can update customers"
on public.customers for update
to authenticated
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can delete customers" on public.customers;
create policy "Authenticated can delete customers"
on public.customers for delete
to authenticated
using (company_id = public.current_company_id());

-- Vincula o carro ao cliente que comprou (opcional, normalmente preenchido
-- quando o carro é marcado como vendido).
alter table public.cars add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists cars_customer_id_idx on public.cars (customer_id);


-- 16) Modelos de contrato próprios da loja ----------------------------------------
-- Cada loja pode subir seus próprios modelos de contrato em .docx (com garantia,
-- sem garantia, repasse etc.) com marcadores {tag} que o sistema preenche
-- automaticamente na hora de gerar. Bucket privado, só o painel admin acessa.

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  file_path text not null,
  original_filename text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists contract_templates_company_id_idx on public.contract_templates (company_id);

alter table public.contract_templates enable row level security;

drop policy if exists "Authenticated can read contract templates" on public.contract_templates;
create policy "Authenticated can read contract templates"
on public.contract_templates for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Authenticated can insert contract templates" on public.contract_templates;
create policy "Authenticated can insert contract templates"
on public.contract_templates for insert
to authenticated
with check (company_id = public.current_company_id());

drop policy if exists "Authenticated can delete contract templates" on public.contract_templates;
create policy "Authenticated can delete contract templates"
on public.contract_templates for delete
to authenticated
using (company_id = public.current_company_id());

insert into storage.buckets (id, name, public)
values ('contract-templates', 'contract-templates', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated can view contract templates" on storage.objects;
create policy "Authenticated can view contract templates"
on storage.objects for select
to authenticated
using (
  bucket_id = 'contract-templates'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can upload contract templates" on storage.objects;
create policy "Authenticated can upload contract templates"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'contract-templates'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

drop policy if exists "Authenticated can delete contract templates storage" on storage.objects;
create policy "Authenticated can delete contract templates storage"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'contract-templates'
  and (storage.foldername(name))[1] = public.current_company_id()::text
);

-- 17) Tipo de documento gerado (contrato ou recibo de venda) ----------------------
-- A tela de Contratos passa a gerar tanto o contrato de compra e venda quanto um
-- recibo de venda simples (comprovante interno, não substitui NF-e). O histórico
-- guarda qual dos dois foi gerado pra poder baixar de novo corretamente.

alter table public.contracts add column if not exists document_type text not null default 'contrato';

alter table public.contracts drop constraint if exists contracts_document_type_check;
alter table public.contracts add constraint contracts_document_type_check check (document_type in ('contrato', 'recibo'));

-- 18) Protege a tabela "companies" com RLS -----------------------------------------
-- Faltava habilitar RLS nesta tabela. Sem isso, um usuário autenticado de
-- QUALQUER empresa conseguia ler a lista completa de empresas do sistema
-- (nome/slug de todo cliente) e, pior, como as outras tabelas referenciam
-- "companies(id) on delete cascade", um delete nessa tabela apagaria em
-- cascata TODOS os carros, gastos, contratos, clientes, fornecedores e
-- modelos de contrato daquela empresa. Agora cada usuário só enxerga a
-- própria empresa; não há política de insert/update/delete de propósito —
-- cadastro de empresa continua só pelo SQL Editor (fora do RLS, via service role).

alter table public.companies enable row level security;

drop policy if exists "Authenticated can read own company" on public.companies;
create policy "Authenticated can read own company"
on public.companies for select
to authenticated
using (id = public.current_company_id());

-- 19) Vendedores, vendas, permissões por papel e registro de atividades --------------
-- Cada usuário vinculado a uma empresa passa a ter um papel: 'admin' (acesso
-- total, como sempre foi) ou 'seller' (vendedor, acesso restrito). Todo usuário
-- já existente vira 'admin' pelo default — nenhuma loja perde acesso a nada.
--
-- O vendedor NUNCA lê custos/margens/valor de compra: a tabela "cars" fica
-- restrita ao admin e o vendedor lê o estoque pela view "seller_cars", que não
-- tem essas colunas. Gastos, fornecedores, documentos dos carros e anexos de
-- gastos também ficam só com o admin.

alter table public.user_company add column if not exists role text not null default 'admin';
alter table public.user_company drop constraint if exists user_company_role_check;
-- 'manager' já entra aqui (é criado na seção 20): ao rodar o schema de novo
-- numa loja que já tem gerente, a regra só com admin/seller seria recusada.
alter table public.user_company add constraint user_company_role_check check (role in ('admin', 'manager', 'seller'));

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null default '',
  phone text not null default '',
  commission_type text not null default 'percent' check (commission_type in ('percent', 'fixed')),
  commission_value numeric(12, 2) not null default 0 check (commission_value >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sellers_company_id_idx on public.sellers (company_id);

drop trigger if exists sellers_set_updated_at on public.sellers;
create trigger sellers_set_updated_at
before update on public.sellers
for each row execute function public.set_updated_at();

-- Vendedor desativado perde o acesso na hora: current_company_id() passa a
-- devolver null pra ele, e todas as policies (que comparam com ela) negam tudo.
create or replace function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select uc.company_id
  from public.user_company uc
  where uc.user_id = auth.uid()
    and (
      uc.role = 'admin'
      or exists (select 1 from public.sellers s where s.user_id = uc.user_id and s.company_id = uc.company_id and s.active)
    )
  limit 1
$$;

create or replace function public.is_company_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_company where user_id = auth.uid() and role = 'admin')
$$;
grant execute on function public.is_company_admin() to authenticated;

create or replace function public.current_seller_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.sellers where user_id = auth.uid() and active limit 1
$$;
grant execute on function public.current_seller_id() to authenticated;

alter table public.sellers enable row level security;

drop policy if exists "Admin or self can read sellers" on public.sellers;
create policy "Admin or self can read sellers"
on public.sellers for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_admin() or user_id = auth.uid()));

drop policy if exists "Admin can update sellers" on public.sellers;
create policy "Admin can update sellers"
on public.sellers for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());
-- Sem policy de insert/delete: o vendedor (com login) é criado pela Edge
-- Function "manage-sellers" (service role), e vendedor não é excluído — só
-- desativado, pra não perder o histórico de vendas.

-- Vendas: uma por carro. A comissão é calculada e "congelada" no momento da
-- venda (trigger abaixo) — mudar a comissão do vendedor depois não altera
-- vendas antigas.
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  car_id uuid not null unique references public.cars(id) on delete cascade,
  seller_id uuid references public.sellers(id) on delete set null,
  sale_price integer not null check (sale_price >= 0),
  sale_date date not null default current_date,
  commission_type text,
  commission_value numeric(12, 2),
  commission_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sales_company_id_idx on public.sales (company_id);
create index if not exists sales_seller_id_idx on public.sales (seller_id);

create or replace function public.sales_compute_commission()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s public.sellers%rowtype;
begin
  if new.seller_id is null then
    new.commission_type := null;
    new.commission_value := null;
    new.commission_amount := 0;
    return new;
  end if;
  -- Numa edição, só recalcula se trocou o vendedor ou o valor da venda.
  if tg_op = 'UPDATE' and new.seller_id is not distinct from old.seller_id
     and new.sale_price = old.sale_price then
    new.commission_type := old.commission_type;
    new.commission_value := old.commission_value;
    new.commission_amount := old.commission_amount;
    return new;
  end if;
  select * into s from public.sellers where id = new.seller_id and company_id = new.company_id;
  if not found then
    raise exception 'Vendedor inválido para esta empresa';
  end if;
  new.commission_type := s.commission_type;
  new.commission_value := s.commission_value;
  new.commission_amount := case
    when s.commission_type = 'percent' then round(new.sale_price * s.commission_value / 100, 2)
    else s.commission_value
  end;
  return new;
end;
$$;

drop trigger if exists sales_compute_commission on public.sales;
create trigger sales_compute_commission
before insert or update on public.sales
for each row execute function public.sales_compute_commission();

alter table public.sales enable row level security;

drop policy if exists "Admin or own seller can read sales" on public.sales;
create policy "Admin or own seller can read sales"
on public.sales for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_admin() or seller_id = public.current_seller_id()));

drop policy if exists "Admin can insert sales" on public.sales;
create policy "Admin can insert sales"
on public.sales for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admin can update sales" on public.sales;
create policy "Admin can update sales"
on public.sales for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admin can delete sales" on public.sales;
create policy "Admin can delete sales"
on public.sales for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Estoque do vendedor: mesmas linhas da empresa, SEM purchase_price,
-- purchase_date e documents. A view roda com o dono (ignora a RLS de "cars",
-- que agora é só admin), por isso filtra a empresa explicitamente.
create or replace view public.seller_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, customer_id, company_id, created_at, updated_at
from public.cars
where company_id = public.current_company_id();

revoke all on public.seller_cars from anon, public;
grant select on public.seller_cars to authenticated;

-- "cars": leitura e escrita autenticada passam a exigir admin. (O site público
-- continua lendo pela policy "Public can read cars", do papel anon.)
drop policy if exists "Authenticated can read own company cars" on public.cars;
create policy "Authenticated can read own company cars"
on public.cars for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can insert cars" on public.cars;
create policy "Authenticated can insert cars"
on public.cars for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can update cars" on public.cars;
create policy "Authenticated can update cars"
on public.cars for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can delete cars" on public.cars;
create policy "Authenticated can delete cars"
on public.cars for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Gastos e fornecedores: só admin
drop policy if exists "Authenticated can read expenses" on public.car_expenses;
create policy "Authenticated can read expenses"
on public.car_expenses for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can insert expenses" on public.car_expenses;
create policy "Authenticated can insert expenses"
on public.car_expenses for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can update expenses" on public.car_expenses;
create policy "Authenticated can update expenses"
on public.car_expenses for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can delete expenses" on public.car_expenses;
create policy "Authenticated can delete expenses"
on public.car_expenses for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can read suppliers" on public.suppliers;
create policy "Authenticated can read suppliers"
on public.suppliers for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can insert suppliers" on public.suppliers;
create policy "Authenticated can insert suppliers"
on public.suppliers for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can update suppliers" on public.suppliers;
create policy "Authenticated can update suppliers"
on public.suppliers for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can delete suppliers" on public.suppliers;
create policy "Authenticated can delete suppliers"
on public.suppliers for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Clientes: vendedor lê, cadastra e edita; excluir só admin
drop policy if exists "Authenticated can delete customers" on public.customers;
create policy "Authenticated can delete customers"
on public.customers for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Contratos: vendedor gera e vê só os que ele mesmo criou; admin vê todos
alter table public.contracts add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

drop policy if exists "Authenticated can read contracts" on public.contracts;
create policy "Authenticated can read contracts"
on public.contracts for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_admin() or created_by = auth.uid()));

drop policy if exists "Authenticated can insert contracts" on public.contracts;
create policy "Authenticated can insert contracts"
on public.contracts for insert
to authenticated
with check (company_id = public.current_company_id() and (public.is_company_admin() or created_by = auth.uid()));

drop policy if exists "Authenticated can delete contracts" on public.contracts;
create policy "Authenticated can delete contracts"
on public.contracts for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Modelos de contrato: vendedor usa (lê), só admin sobe/apaga
drop policy if exists "Authenticated can insert contract templates" on public.contract_templates;
create policy "Authenticated can insert contract templates"
on public.contract_templates for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can delete contract templates" on public.contract_templates;
create policy "Authenticated can delete contract templates"
on public.contract_templates for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Storage: escrita de fotos e tudo de anexos/documentos só admin
drop policy if exists "Authenticated can upload car photos" on storage.objects;
create policy "Authenticated can upload car photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can update car photos" on storage.objects;
create policy "Authenticated can update car photos"
on storage.objects for update
to authenticated
using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can delete car photos" on storage.objects;
create policy "Authenticated can delete car photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can view expense attachments" on storage.objects;
create policy "Authenticated can view expense attachments"
on storage.objects for select
to authenticated
using (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can upload expense attachments" on storage.objects;
create policy "Authenticated can upload expense attachments"
on storage.objects for insert
to authenticated
with check (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can delete expense attachments" on storage.objects;
create policy "Authenticated can delete expense attachments"
on storage.objects for delete
to authenticated
using (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can view car documents" on storage.objects;
create policy "Authenticated can view car documents"
on storage.objects for select
to authenticated
using (bucket_id = 'car-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can upload car documents" on storage.objects;
create policy "Authenticated can upload car documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can delete car documents" on storage.objects;
create policy "Authenticated can delete car documents"
on storage.objects for delete
to authenticated
using (bucket_id = 'car-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can upload contract templates" on storage.objects;
create policy "Authenticated can upload contract templates"
on storage.objects for insert
to authenticated
with check (bucket_id = 'contract-templates' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Authenticated can delete contract templates storage" on storage.objects;
create policy "Authenticated can delete contract templates storage"
on storage.objects for delete
to authenticated
using (bucket_id = 'contract-templates' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

-- Registro de atividades -------------------------------------------------------
-- Preenchido só por triggers (security definer) — nenhum usuário consegue
-- inserir, editar ou apagar linhas direto. Só o admin da empresa lê.
create table if not exists public.activity_log (
  id bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid,
  user_email text,
  action text not null,
  entity text not null,
  entity_id uuid,
  label text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_company_created_idx on public.activity_log (company_id, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "Admin can read activity log" on public.activity_log;
create policy "Admin can read activity log"
on public.activity_log for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

create or replace function public.log_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb;
  old_rec jsonb;
  v_company uuid;
  v_label text;
  v_details text;
  v_email text;
  v_changed text[];
begin
  begin
    if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
    v_company := (rec->>'company_id')::uuid;
    -- Sem usuário = SQL Editor ou Edge Function (que grava o próprio log).
    if v_company is null or auth.uid() is null then return null; end if;

    if tg_op = 'UPDATE' then
      old_rec := to_jsonb(old);
      select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(rec) n
      where n.key not in ('updated_at') and n.value is distinct from old_rec->n.key;
      if v_changed is null then return null; end if;
      v_details := array_to_string(v_changed, ', ');
      if 'status' = any(v_changed) then
        v_details := format('status: %s → %s', old_rec->>'status', rec->>'status');
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
      when 'sales' then (select concat(c.brand, ' ', c.model, ' — R$ ', rec->>'sale_price') from public.cars c where c.id = (rec->>'car_id')::uuid)
      else null
    end;

    select email into v_email from auth.users where id = auth.uid();

    insert into public.activity_log (company_id, user_id, user_email, action, entity, entity_id, label, details)
    values (v_company, auth.uid(), v_email, lower(tg_op), tg_table_name, (rec->>'id')::uuid, v_label, v_details);
  exception when others then
    -- O log nunca pode impedir a operação principal
    null;
  end;
  return null;
end;
$$;

drop trigger if exists cars_log_activity on public.cars;
create trigger cars_log_activity after insert or update or delete on public.cars
for each row execute function public.log_activity();

drop trigger if exists car_expenses_log_activity on public.car_expenses;
create trigger car_expenses_log_activity after insert or update or delete on public.car_expenses
for each row execute function public.log_activity();

drop trigger if exists suppliers_log_activity on public.suppliers;
create trigger suppliers_log_activity after insert or update or delete on public.suppliers
for each row execute function public.log_activity();

drop trigger if exists customers_log_activity on public.customers;
create trigger customers_log_activity after insert or update or delete on public.customers
for each row execute function public.log_activity();

drop trigger if exists contracts_log_activity on public.contracts;
create trigger contracts_log_activity after insert or update or delete on public.contracts
for each row execute function public.log_activity();

drop trigger if exists contract_templates_log_activity on public.contract_templates;
create trigger contract_templates_log_activity after insert or update or delete on public.contract_templates
for each row execute function public.log_activity();

drop trigger if exists sellers_log_activity on public.sellers;
create trigger sellers_log_activity after insert or update or delete on public.sellers
for each row execute function public.log_activity();

drop trigger if exists sales_log_activity on public.sales;
create trigger sales_log_activity after insert or update or delete on public.sales
for each row execute function public.log_activity();

-- Login no painel (chamado pelo front logo após entrar)
create or replace function public.log_login()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null then return; end if;
  insert into public.activity_log (company_id, user_id, user_email, action, entity, label)
  values (v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'login', 'auth', 'Entrou no painel');
end;
$$;
grant execute on function public.log_login() to authenticated;

-- 20) Gerente, comissão opcional e aviso de dias em estoque ---------------------------
-- Novo papel 'manager' (gerente): cadastra/edita carros, fotos, gastos,
-- fornecedores, vendas, contratos e clientes, vê tudo que é financeiro e os
-- números da equipe — mas NÃO exclui nada (delete continua só admin) e não
-- gerencia a equipe. Vendedores e gerentes ficam na tabela "sellers" (Equipe).

alter table public.user_company drop constraint if exists user_company_role_check;
alter table public.user_company add constraint user_company_role_check check (role in ('admin', 'manager', 'seller'));

alter table public.sellers add column if not exists role text not null default 'seller';
alter table public.sellers drop constraint if exists sellers_role_check;
alter table public.sellers add constraint sellers_role_check check (role in ('seller', 'manager'));

-- Comissão opcional: 'none' = não recebe comissão
alter table public.sellers drop constraint if exists sellers_commission_type_check;
alter table public.sellers add constraint sellers_commission_type_check check (commission_type in ('percent', 'fixed', 'none'));

create or replace function public.sales_compute_commission()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s public.sellers%rowtype;
begin
  if new.seller_id is null then
    new.commission_type := null;
    new.commission_value := null;
    new.commission_amount := 0;
    return new;
  end if;
  -- Numa edição, só recalcula se trocou o vendedor ou o valor da venda.
  if tg_op = 'UPDATE' and new.seller_id is not distinct from old.seller_id
     and new.sale_price = old.sale_price then
    new.commission_type := old.commission_type;
    new.commission_value := old.commission_value;
    new.commission_amount := old.commission_amount;
    return new;
  end if;
  select * into s from public.sellers where id = new.seller_id and company_id = new.company_id;
  if not found then
    raise exception 'Vendedor inválido para esta empresa';
  end if;
  new.commission_type := s.commission_type;
  new.commission_value := s.commission_value;
  new.commission_amount := case
    when s.commission_type = 'percent' then round(new.sale_price * s.commission_value / 100, 2)
    when s.commission_type = 'fixed' then s.commission_value
    else 0
  end;
  return new;
end;
$$;

-- admin ou gerente ("equipe de gestão")
create or replace function public.is_company_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_company where user_id = auth.uid() and role in ('admin', 'manager'))
$$;
grant execute on function public.is_company_staff() to authenticated;

-- Equipe: gerente vê todos (acompanha os números); só admin edita
drop policy if exists "Admin or self can read sellers" on public.sellers;
create policy "Admin or self can read sellers"
on public.sellers for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or user_id = auth.uid()));

-- Vendas: gerente registra e edita; desfazer (excluir) só admin
drop policy if exists "Admin or own seller can read sales" on public.sales;
create policy "Admin or own seller can read sales"
on public.sales for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or seller_id = public.current_seller_id()));

drop policy if exists "Admin can insert sales" on public.sales;
create policy "Admin can insert sales"
on public.sales for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Admin can update sales" on public.sales;
create policy "Admin can update sales"
on public.sales for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff())
with check (company_id = public.current_company_id() and public.is_company_staff());

-- Carros: gerente lê, cadastra e edita; excluir só admin
drop policy if exists "Authenticated can read own company cars" on public.cars;
create policy "Authenticated can read own company cars"
on public.cars for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Authenticated can insert cars" on public.cars;
create policy "Authenticated can insert cars"
on public.cars for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Authenticated can update cars" on public.cars;
create policy "Authenticated can update cars"
on public.cars for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff())
with check (company_id = public.current_company_id() and public.is_company_staff());

-- Gastos e fornecedores: gerente lê, lança e edita; excluir só admin
drop policy if exists "Authenticated can read expenses" on public.car_expenses;
create policy "Authenticated can read expenses"
on public.car_expenses for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Authenticated can insert expenses" on public.car_expenses;
create policy "Authenticated can insert expenses"
on public.car_expenses for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Authenticated can update expenses" on public.car_expenses;
create policy "Authenticated can update expenses"
on public.car_expenses for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff())
with check (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Authenticated can read suppliers" on public.suppliers;
create policy "Authenticated can read suppliers"
on public.suppliers for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Authenticated can insert suppliers" on public.suppliers;
create policy "Authenticated can insert suppliers"
on public.suppliers for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Authenticated can update suppliers" on public.suppliers;
create policy "Authenticated can update suppliers"
on public.suppliers for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff())
with check (company_id = public.current_company_id() and public.is_company_staff());

-- Contratos: gerente vê todos da loja
drop policy if exists "Authenticated can read contracts" on public.contracts;
create policy "Authenticated can read contracts"
on public.contracts for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

drop policy if exists "Authenticated can insert contracts" on public.contracts;
create policy "Authenticated can insert contracts"
on public.contracts for insert
to authenticated
with check (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

-- Registro de atividades: gerente também lê
drop policy if exists "Admin can read activity log" on public.activity_log;
create policy "Admin can read activity log"
on public.activity_log for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff());

-- Storage: gerente sobe fotos, documentos e anexos (e vê os privados); apagar arquivo só admin
drop policy if exists "Authenticated can upload car photos" on storage.objects;
create policy "Authenticated can upload car photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_staff());

drop policy if exists "Authenticated can update car photos" on storage.objects;
create policy "Authenticated can update car photos"
on storage.objects for update
to authenticated
using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_staff());

drop policy if exists "Authenticated can view expense attachments" on storage.objects;
create policy "Authenticated can view expense attachments"
on storage.objects for select
to authenticated
using (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_staff());

drop policy if exists "Authenticated can upload expense attachments" on storage.objects;
create policy "Authenticated can upload expense attachments"
on storage.objects for insert
to authenticated
with check (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_staff());

drop policy if exists "Authenticated can view car documents" on storage.objects;
create policy "Authenticated can view car documents"
on storage.objects for select
to authenticated
using (bucket_id = 'car-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_staff());

drop policy if exists "Authenticated can upload car documents" on storage.objects;
create policy "Authenticated can upload car documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_staff());

-- Aviso de dias em estoque: prazo por carro (null = usa o padrão da loja)
alter table public.cars add column if not exists stock_alert_days integer check (stock_alert_days is null or stock_alert_days > 0);
alter table public.companies add column if not exists stock_alert_days integer not null default 60 check (stock_alert_days > 0);

-- Admin/gerente só pode alterar o prazo padrão — nenhuma outra coluna da empresa
revoke update on public.companies from authenticated;
grant update (stock_alert_days) on public.companies to authenticated;

drop policy if exists "Staff can update company stock alert" on public.companies;
create policy "Staff can update company stock alert"
on public.companies for update
to authenticated
using (id = public.current_company_id() and public.is_company_staff())
with check (id = public.current_company_id() and public.is_company_staff());

-- O log por linha ignora operações em massa marcadas com esta flag (a função
-- em massa grava um único registro resumido no lugar).
create or replace function public.log_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb;
  old_rec jsonb;
  v_company uuid;
  v_label text;
  v_details text;
  v_email text;
  v_changed text[];
begin
  begin
    if current_setting('app.skip_activity_log', true) = '1' then return null; end if;
    if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
    v_company := (rec->>'company_id')::uuid;
    -- Sem usuário = SQL Editor ou Edge Function (que grava o próprio log).
    if v_company is null or auth.uid() is null then return null; end if;

    if tg_op = 'UPDATE' then
      old_rec := to_jsonb(old);
      select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(rec) n
      where n.key not in ('updated_at') and n.value is distinct from old_rec->n.key;
      if v_changed is null then return null; end if;
      v_details := array_to_string(v_changed, ', ');
      if 'status' = any(v_changed) then
        v_details := format('status: %s → %s', old_rec->>'status', rec->>'status');
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
      when 'sales' then (select concat(c.brand, ' ', c.model, ' — R$ ', rec->>'sale_price') from public.cars c where c.id = (rec->>'car_id')::uuid)
      else null
    end;

    select email into v_email from auth.users where id = auth.uid();

    insert into public.activity_log (company_id, user_id, user_email, action, entity, entity_id, label, details)
    values (v_company, auth.uid(), v_email, lower(tg_op), tg_table_name, (rec->>'id')::uuid, v_label, v_details);
  exception when others then
    -- O log nunca pode impedir a operação principal
    null;
  end;
  return null;
end;
$$;

-- "Aplicar a todos": muda o padrão da loja e sobrescreve o prazo de todos os
-- carros. Security definer para gravar o log resumido; as checagens de
-- empresa e papel são feitas aqui dentro.
create or replace function public.apply_stock_alert_to_all(p_days integer)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_count integer;
begin
  if v_company is null or not public.is_company_staff() then
    raise exception 'Sem permissão';
  end if;
  if p_days is null or p_days < 1 then
    raise exception 'Informe um número de dias válido';
  end if;
  perform set_config('app.skip_activity_log', '1', true);
  update public.companies set stock_alert_days = p_days where id = v_company;
  update public.cars set stock_alert_days = p_days where company_id = v_company;
  get diagnostics v_count = row_count;
  perform set_config('app.skip_activity_log', '0', true);
  insert into public.activity_log (company_id, user_id, user_email, action, entity, label, details)
  values (v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'update', 'cars',
          'Todos os carros', format('Aviso de estoque: %s dias (aplicado a %s carros)', p_days, v_count));
  return v_count;
end;
$$;
revoke execute on function public.apply_stock_alert_to_all(integer) from anon, public;
grant execute on function public.apply_stock_alert_to_all(integer) to authenticated;

-- 21) Gerente sem acesso a custos e gastos -------------------------------------------
-- O gerente deixa de ver o custo de aquisição (preço e data de compra), os gastos
-- dos carros e tudo que sai deles (custo total, margem, lucro, investimento).
-- Isso vale aqui no banco, não só na tela:
--   * "cars" volta a ser só do admin; o gerente lê e grava o estoque pela view
--     "staff_cars", que não tem purchase_price nem purchase_date;
--   * o gerente informa o custo de aquisição uma única vez (ao cadastrar o
--     carro) pela função set_car_purchase — depois disso só o admin vê e altera;
--   * gastos: o gerente só lança; ler, editar e excluir é do admin;
--   * fornecedores: o gerente cadastra e vê os nomes (para escolher no gasto),
--     editar e excluir é do admin.
-- O que cada gerente vê das vendas — valores ('values') ou só quantidades
-- ('counts') — é escolhido pelo admin na Equipe e aplicado nas telas.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sellers' and column_name = 'finance_access'
  ) then
    alter table public.sellers add column finance_access text not null default 'counts';
    -- Gerentes que já existiam continuam vendo os valores das vendas
    update public.sellers set finance_access = 'values' where role = 'manager';
  end if;
end $$;

alter table public.sellers drop constraint if exists sellers_finance_access_check;
alter table public.sellers add constraint sellers_finance_access_check check (finance_access in ('values', 'counts'));

-- Carros: leitura e escrita direta só do admin (excluir já era só admin)
drop policy if exists "Authenticated can read own company cars" on public.cars;
create policy "Authenticated can read own company cars"
on public.cars for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can insert cars" on public.cars;
create policy "Authenticated can insert cars"
on public.cars for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can update cars" on public.cars;
create policy "Authenticated can update cars"
on public.cars for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

-- Estoque do gerente: tudo menos o custo de aquisição. A view roda com o dono
-- (ignora a RLS de "cars"), então filtra empresa e papel explicitamente; o
-- CHECK OPTION impede gravar carro de outra empresa por ela. Sem DELETE.
-- (drop antes: rodando o schema de novo, a view já tem as colunas da seção 29,
-- e "create or replace" não consegue tirar colunas)
drop view if exists public.staff_cars;
create or replace view public.staff_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, documents, customer_id, stock_alert_days,
  company_id, created_at, updated_at
from public.cars
where company_id = public.current_company_id() and public.is_company_staff()
with local check option;

revoke all on public.staff_cars from anon, authenticated, public;
grant select, insert, update on public.staff_cars to authenticated;

-- A view do vendedor é só leitura (sem isto, o privilégio padrão do Supabase
-- deixaria gravar por ela, passando por cima da RLS de "cars").
revoke all on public.seller_cars from anon, authenticated, public;
grant select on public.seller_cars to authenticated;

-- Custo de aquisição informado pelo gerente: só se ainda estiver em branco
create or replace function public.set_car_purchase(p_car_id uuid, p_price integer, p_date date)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_already boolean;
begin
  if v_company is null or not public.is_company_staff() then
    raise exception 'Sem permissão';
  end if;
  select (purchase_price is not null or purchase_date is not null) into v_already
  from public.cars
  where id = p_car_id and company_id = v_company;
  if not found then
    raise exception 'Carro não encontrado';
  end if;
  if v_already and not public.is_company_admin() then
    raise exception 'O custo de aquisição deste carro já foi informado. Só o administrador pode alterar.';
  end if;
  update public.cars
  set purchase_price = p_price, purchase_date = p_date
  where id = p_car_id and company_id = v_company;
end;
$$;
revoke execute on function public.set_car_purchase(uuid, integer, date) from anon, public;
grant execute on function public.set_car_purchase(uuid, integer, date) to authenticated;

-- Gastos: gerente só lança
drop policy if exists "Authenticated can read expenses" on public.car_expenses;
create policy "Authenticated can read expenses"
on public.car_expenses for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can update expenses" on public.car_expenses;
create policy "Authenticated can update expenses"
on public.car_expenses for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can view expense attachments" on storage.objects;
create policy "Authenticated can view expense attachments"
on storage.objects for select
to authenticated
using (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

-- Fornecedores: gerente cadastra; editar só admin
drop policy if exists "Authenticated can update suppliers" on public.suppliers;
create policy "Authenticated can update suppliers"
on public.suppliers for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

-- Registro de atividades: o gerente não vê os gastos lançados por outras
-- pessoas (o texto do registro traz o valor do gasto)
drop policy if exists "Admin can read activity log" on public.activity_log;
create policy "Admin can read activity log"
on public.activity_log for select
to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_company_admin()
    or (public.is_company_staff() and (entity <> 'car_expenses' or user_id = auth.uid()))
  )
);

-- 22) Contador de visitas do site e de visualizações por carro ----------------------
-- O site público soma, por dia:
--   * visitas: cada acesso ao site (voltar em até 30 min conta como o mesmo
--     acesso, pra não contar recarregar a página) e pessoas diferentes no dia
--     (cada navegador conta 1 vez por dia);
--   * por carro: visualizações da página do carro (mesma regra) e pessoas
--     diferentes no dia.
-- A regra dos 30 min e do "1 vez por dia" roda no navegador do visitante. Aqui
-- ficam só os totais diários — nada que identifique quem visitou (sem IP, sem
-- cookie de rastreamento). Gravação só pelas funções track_* (o site público
-- chama como anon); leitura: admin e gerente veem tudo, o vendedor vê as
-- visualizações dos carros.

create table if not exists public.site_visits_daily (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null,
  visits integer not null default 0,
  visitors integer not null default 0,
  primary key (company_id, day)
);

create table if not exists public.car_views_daily (
  company_id uuid not null references public.companies(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  day date not null,
  views integer not null default 0,
  viewers integer not null default 0,
  primary key (car_id, day)
);

create index if not exists car_views_daily_company_day_idx on public.car_views_daily (company_id, day);

alter table public.site_visits_daily enable row level security;
alter table public.car_views_daily enable row level security;

revoke all on public.site_visits_daily from anon, authenticated, public;
revoke all on public.car_views_daily from anon, authenticated, public;
grant select on public.site_visits_daily to authenticated;
grant select on public.car_views_daily to authenticated;

drop policy if exists "Staff can read site visits" on public.site_visits_daily;
create policy "Staff can read site visits"
on public.site_visits_daily for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Team can read car views" on public.car_views_daily;
create policy "Team can read car views"
on public.car_views_daily for select
to authenticated
using (company_id = public.current_company_id());

-- Dia no fuso das lojas (Maranhão, UTC-3)
create or replace function public.stats_today()
returns date
language sql stable
as $$
  select (now() at time zone 'America/Fortaleza')::date
$$;

create or replace function public.track_site_visit(p_company uuid, p_new_visitor boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.companies where id = p_company) then
    return;
  end if;
  insert into public.site_visits_daily as s (company_id, day, visits, visitors)
  values (p_company, public.stats_today(), 1, case when p_new_visitor then 1 else 0 end)
  on conflict (company_id, day) do update
  set visits = s.visits + 1,
      visitors = s.visitors + case when p_new_visitor then 1 else 0 end;
end;
$$;

create or replace function public.track_car_view(p_car uuid, p_new_viewer boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.cars where id = p_car and not hidden;
  if v_company is null then
    return;
  end if;
  insert into public.car_views_daily as v (company_id, car_id, day, views, viewers)
  values (v_company, p_car, public.stats_today(), 1, case when p_new_viewer then 1 else 0 end)
  on conflict (car_id, day) do update
  set views = v.views + 1,
      viewers = v.viewers + case when p_new_viewer then 1 else 0 end;
end;
$$;

revoke execute on function public.track_site_visit(uuid, boolean) from public;
revoke execute on function public.track_car_view(uuid, boolean) from public;
grant execute on function public.track_site_visit(uuid, boolean) to anon, authenticated;
grant execute on function public.track_car_view(uuid, boolean) to anon, authenticated;

-- Totais de um período (null = sem limite), somados no banco. Rodam com a
-- permissão de quem chama, então a RLS acima vale normalmente.
create or replace function public.site_visit_totals(p_start date default null, p_end date default null)
returns table (visits bigint, visitors bigint)
language sql stable
as $$
  select coalesce(sum(visits), 0), coalesce(sum(visitors), 0)
  from public.site_visits_daily
  where company_id = public.current_company_id()
    and (p_start is null or day >= p_start)
    and (p_end is null or day <= p_end)
$$;

create or replace function public.car_view_totals(p_start date default null, p_end date default null)
returns table (car_id uuid, views bigint, viewers bigint)
language sql stable
as $$
  select car_id, sum(views), sum(viewers)
  from public.car_views_daily
  where company_id = public.current_company_id()
    and (p_start is null or day >= p_start)
    and (p_end is null or day <= p_end)
  group by car_id
$$;

revoke execute on function public.site_visit_totals(date, date) from public, anon;
revoke execute on function public.car_view_totals(date, date) from public, anon;
grant execute on function public.site_visit_totals(date, date) to authenticated;
grant execute on function public.car_view_totals(date, date) to authenticated;

-- 23) Endereço (slug) do carro único por loja, e não no projeto inteiro -------------
-- Antes, se duas lojas cadastrassem o mesmo modelo/ano (ex.: "honda-civic-2020"),
-- a segunda recebia erro de duplicidade. O site já busca o carro por loja + slug.
-- (Numa instalação nova, a seção 1 cria o "unique (slug)" que os dados de exemplo
-- usam; esta seção troca pela regra por loja logo depois.)
alter table public.cars drop constraint if exists cars_slug_key;
alter table public.cars drop constraint if exists cars_company_slug_key;
alter table public.cars add constraint cars_company_slug_key unique (company_id, slug);

-- 24) Armazenamento: fotos sem listagem pública, tipos e tamanhos limitados --------
-- O bucket "car-photos" é público: o site mostra as fotos pelo endereço público
-- (/object/public/...), que não passa pelas regras abaixo. A regra de leitura
-- antiga ("Public can view car photos") valia para qualquer pessoa e sem filtro
-- de loja, o que permitia LISTAR os arquivos de todas as lojas. Agora só admin
-- e gerente da própria loja leem pelas regras (o painel precisa disso para
-- apagar fotos). Os buckets passam a aceitar só os tipos que o painel envia e
-- têm tamanho máximo — evita, por exemplo, alguém hospedar um .html no bucket
-- público de fotos.

drop policy if exists "Public can view car photos" on storage.objects;
drop policy if exists "Staff can read own car photos" on storage.objects;
create policy "Staff can read own car photos"
on storage.objects for select
to authenticated
using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_staff());

-- Fotos: só imagens (o painel comprime para WebP/JPEG antes de enviar)
update storage.buckets
set allowed_mime_types = array['image/*'], file_size_limit = 10485760
where id = 'car-photos';

-- Documentos dos carros e anexos de gastos: imagens e PDF
update storage.buckets
set allowed_mime_types = array['image/*', 'application/pdf'], file_size_limit = 20971520
where id in ('car-documents', 'expense-attachments');

-- Modelos de contrato (.docx): só limite de tamanho — alguns computadores
-- enviam o .docx sem tipo definido, e o bucket é privado.
update storage.buckets
set file_size_limit = 10485760
where id = 'contract-templates';

-- 25) Excluir vendedor ou gerente sem perder o histórico ---------------------------
-- O admin pode excluir alguém da Equipe (Edge Function "manage-sellers", ação
-- "delete"): o login é apagado (o e-mail fica livre para um cadastro novo) e a
-- pessoa sai da lista. O cadastro fica guardado como excluído, inativo e sem
-- login, para as vendas antigas continuarem com o nome e a comissão dela e o
-- registro de atividades continuar mostrando quem fez cada coisa
-- ("former_user_id" guarda o login que ela usava).
alter table public.sellers add column if not exists deleted_at timestamptz;
alter table public.sellers add column if not exists former_user_id uuid;

-- 26) Pós-venda: contratos do cliente, transferência, checklist e financiamento próprio
--
-- * Contratos e documentos do cliente: vários arquivos por cliente (contrato de
--   compra, termo de entrega, pós-venda, garantia etc.), cada um com tipo, data
--   e o carro a que se refere. Bucket privado "customer-documents". Mesma regra
--   dos contratos gerados: o vendedor anexa e vê os que ele mesmo anexou;
--   admin e gerente veem todos; excluir só o admin.
-- * Contratos gerados pelo sistema passam a guardar o cliente (customer_id).
-- * Venda: situação da transferência do veículo (quem faz, prazo, concluída
--   em) e o checklist de itens entregues (manual, chave reserva etc.). A lista
--   de itens é de cada loja (companies.sale_checklist).
-- * Financiamento próprio (carnê da loja): financiamentos e parcelas dos
--   clientes. Só o admin e os gerentes com "Vê valores das vendas" leem e
--   registram pagamentos; excluir só o admin.

-- Admin, ou gerente que o admin liberou para ver valores (mesma regra da tela)
create or replace function public.can_manage_customer_finance()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_company where user_id = auth.uid() and role = 'admin')
    or exists (
      select 1
      from public.user_company uc
      join public.sellers s on s.user_id = uc.user_id and s.company_id = uc.company_id
      where uc.user_id = auth.uid() and uc.role = 'manager' and s.active and s.finance_access = 'values'
    )
$$;
revoke execute on function public.can_manage_customer_finance() from anon, public;
grant execute on function public.can_manage_customer_finance() to authenticated;

-- Contrato gerado -> cliente. Contratos antigos são ligados pelo CPF do comprador.
alter table public.contracts add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists contracts_customer_id_idx on public.contracts (customer_id);

update public.contracts ct
set customer_id = cu.id
from public.customers cu
where ct.customer_id is null
  and cu.company_id = ct.company_id
  and regexp_replace(cu.document, '\D', '', 'g') <> ''
  and regexp_replace(cu.document, '\D', '', 'g') = regexp_replace(ct.buyer_document, '\D', '', 'g');

-- Contratos e documentos anexados ao cliente
create table if not exists public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  car_id uuid references public.cars(id) on delete set null,
  doc_type text not null default 'compra',
  title text not null default '',
  signed_on date,
  notes text not null default '',
  file_path text not null,
  file_name text not null default '',
  file_type text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_documents drop constraint if exists customer_documents_doc_type_check;
alter table public.customer_documents add constraint customer_documents_doc_type_check
  check (doc_type in ('compra', 'entrega', 'pos_venda', 'garantia', 'financiamento', 'outro'));

create index if not exists customer_documents_company_id_idx on public.customer_documents (company_id);
create index if not exists customer_documents_customer_id_idx on public.customer_documents (customer_id);
create index if not exists customer_documents_car_id_idx on public.customer_documents (car_id);

drop trigger if exists customer_documents_set_updated_at on public.customer_documents;
create trigger customer_documents_set_updated_at
before update on public.customer_documents
for each row execute function public.set_updated_at();

alter table public.customer_documents enable row level security;

drop policy if exists "Team can read customer documents" on public.customer_documents;
create policy "Team can read customer documents"
on public.customer_documents for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

drop policy if exists "Team can insert customer documents" on public.customer_documents;
create policy "Team can insert customer documents"
on public.customer_documents for insert
to authenticated
with check (company_id = public.current_company_id() and created_by = auth.uid());

drop policy if exists "Team can update customer documents" on public.customer_documents;
create policy "Team can update customer documents"
on public.customer_documents for update
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()))
with check (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

drop policy if exists "Admin can delete customer documents" on public.customer_documents;
create policy "Admin can delete customer documents"
on public.customer_documents for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

insert into storage.buckets (id, name, public)
values ('customer-documents', 'customer-documents', false)
on conflict (id) do nothing;

update storage.buckets
set allowed_mime_types = array['image/*', 'application/pdf'], file_size_limit = 20971520
where id = 'customer-documents';

-- Ver o arquivo: quem pode ver a linha correspondente em customer_documents
-- (a RLS da tabela decide: equipe de gestão vê todos, vendedor só os dele)
drop policy if exists "Team can view customer documents" on storage.objects;
create policy "Team can view customer documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'customer-documents'
  and (storage.foldername(name))[1] = public.current_company_id()::text
  and exists (select 1 from public.customer_documents d where d.file_path = objects.name)
);

drop policy if exists "Team can upload customer documents" on storage.objects;
create policy "Team can upload customer documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'customer-documents' and (storage.foldername(name))[1] = public.current_company_id()::text);

drop policy if exists "Admin can delete customer documents" on storage.objects;
create policy "Admin can delete customer documents"
on storage.objects for delete
to authenticated
using (bucket_id = 'customer-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

-- Transferência do veículo e checklist de entrega, na venda
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales' and column_name = 'transfer_status'
  ) then
    alter table public.sales add column transfer_status text not null default 'pendente';
    -- Vendas anteriores a este controle ficam como "não informada" (sem gerar
    -- aviso); a loja atualiza as que ainda estiverem pendentes.
    update public.sales set transfer_status = 'nao_informada';
  end if;
end $$;

alter table public.sales drop constraint if exists sales_transfer_status_check;
alter table public.sales add constraint sales_transfer_status_check
  check (transfer_status in ('pendente', 'em_andamento', 'concluida', 'nao_informada'));

alter table public.sales add column if not exists transfer_responsible text not null default 'comprador';
alter table public.sales drop constraint if exists sales_transfer_responsible_check;
alter table public.sales add constraint sales_transfer_responsible_check check (transfer_responsible in ('comprador', 'loja'));

-- Prazo da transferência (em branco = 30 dias após a venda) e quando foi concluída
alter table public.sales add column if not exists transfer_due_date date;
alter table public.sales add column if not exists transfer_done_on date;
alter table public.sales add column if not exists transfer_notes text not null default '';

-- Checklist: [{ "item": "Chave reserva", "status": "ok" | "nao_possui" | null }]
alter table public.sales add column if not exists checklist jsonb not null default '[]';
alter table public.sales drop constraint if exists sales_checklist_check;
alter table public.sales add constraint sales_checklist_check check (jsonb_typeof(checklist) = 'array');

create index if not exists sales_transfer_status_idx on public.sales (company_id, transfer_status);

-- Itens do checklist de cada loja (admin e gerente editam)
alter table public.companies add column if not exists sale_checklist jsonb not null default
  '["Manual do proprietário", "Chave reserva", "Livro de revisões", "Estepe", "Macaco e chave de roda", "Triângulo", "Tapetes", "CRLV (documento do veículo)"]';
alter table public.companies drop constraint if exists companies_sale_checklist_check;
alter table public.companies add constraint companies_sale_checklist_check check (jsonb_typeof(sale_checklist) = 'array');

-- Padrão da loja para multa e juros por atraso das parcelas (cada
-- financiamento guarda as taxas com que foi feito)
alter table public.companies add column if not exists late_fee_percent numeric(5, 2) not null default 2;
alter table public.companies add column if not exists late_interest_percent numeric(5, 2) not null default 1;
alter table public.companies drop constraint if exists companies_late_fee_percent_check;
alter table public.companies add constraint companies_late_fee_percent_check check (late_fee_percent between 0 and 100);
alter table public.companies drop constraint if exists companies_late_interest_percent_check;
alter table public.companies add constraint companies_late_interest_percent_check check (late_interest_percent between 0 and 100);

grant update (stock_alert_days, sale_checklist) on public.companies to authenticated;

create or replace function public.set_customer_finance_defaults(p_late_fee numeric, p_late_interest numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null or not public.can_manage_customer_finance() then
    raise exception 'Sem permissão';
  end if;
  if p_late_fee is null or p_late_fee < 0 or p_late_fee > 100
     or p_late_interest is null or p_late_interest < 0 or p_late_interest > 100 then
    raise exception 'Informe taxas entre 0 e 100%%';
  end if;
  update public.companies
  set late_fee_percent = p_late_fee, late_interest_percent = p_late_interest
  where id = v_company;
end;
$$;
revoke execute on function public.set_customer_finance_defaults(numeric, numeric) from anon, public;
grant execute on function public.set_customer_finance_defaults(numeric, numeric) to authenticated;

-- Financiamento próprio: um por venda financiada pela loja. Nome do cliente
-- e descrição do carro ficam guardados no financiamento, para ele continuar
-- legível mesmo se o cadastro do cliente ou do carro for apagado.
create table if not exists public.customer_financings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  car_id uuid references public.cars(id) on delete set null,
  customer_name text not null,
  vehicle_label text not null default '',
  vehicle_plate text not null default '',
  vehicle_price numeric(12, 2) not null check (vehicle_price >= 0),
  down_payment numeric(12, 2) not null default 0 check (down_payment >= 0),
  financed_amount numeric(12, 2) not null check (financed_amount > 0),
  installments_count integer not null check (installments_count between 1 and 240),
  installment_amount numeric(12, 2) not null check (installment_amount > 0),
  interest_rate numeric(6, 3) check (interest_rate is null or interest_rate >= 0),
  first_due_date date not null,
  late_fee_percent numeric(5, 2) not null default 2 check (late_fee_percent between 0 and 100),
  late_interest_percent numeric(5, 2) not null default 1 check (late_interest_percent between 0 and 100),
  status text not null default 'ativo' check (status in ('ativo', 'cancelado')),
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_financings_company_id_idx on public.customer_financings (company_id);
create index if not exists customer_financings_customer_id_idx on public.customer_financings (customer_id);

drop trigger if exists customer_financings_set_updated_at on public.customer_financings;
create trigger customer_financings_set_updated_at
before update on public.customer_financings
for each row execute function public.set_updated_at();

-- Parcelas. paid_amount = total recebido (parcela + multa/juros - desconto);
-- late_charges = multa e juros cobrados no pagamento.
create table if not exists public.financing_installments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  financing_id uuid not null references public.customer_financings(id) on delete cascade,
  number integer not null check (number > 0),
  due_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date,
  paid_amount numeric(12, 2) check (paid_amount is null or paid_amount >= 0),
  late_charges numeric(12, 2) not null default 0 check (late_charges >= 0),
  payment_method text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (financing_id, number)
);

create index if not exists financing_installments_company_due_idx on public.financing_installments (company_id, due_date);

drop trigger if exists financing_installments_set_updated_at on public.financing_installments;
create trigger financing_installments_set_updated_at
before update on public.financing_installments
for each row execute function public.set_updated_at();

alter table public.customer_financings enable row level security;
alter table public.financing_installments enable row level security;

drop policy if exists "Finance can read customer financings" on public.customer_financings;
create policy "Finance can read customer financings"
on public.customer_financings for select
to authenticated
using (company_id = public.current_company_id() and public.can_manage_customer_finance());

drop policy if exists "Finance can insert customer financings" on public.customer_financings;
create policy "Finance can insert customer financings"
on public.customer_financings for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_manage_customer_finance());

drop policy if exists "Finance can update customer financings" on public.customer_financings;
create policy "Finance can update customer financings"
on public.customer_financings for update
to authenticated
using (company_id = public.current_company_id() and public.can_manage_customer_finance())
with check (company_id = public.current_company_id() and public.can_manage_customer_finance());

drop policy if exists "Admin can delete customer financings" on public.customer_financings;
create policy "Admin can delete customer financings"
on public.customer_financings for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Finance can read installments" on public.financing_installments;
create policy "Finance can read installments"
on public.financing_installments for select
to authenticated
using (company_id = public.current_company_id() and public.can_manage_customer_finance());

drop policy if exists "Finance can insert installments" on public.financing_installments;
create policy "Finance can insert installments"
on public.financing_installments for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_manage_customer_finance());

drop policy if exists "Finance can update installments" on public.financing_installments;
create policy "Finance can update installments"
on public.financing_installments for update
to authenticated
using (company_id = public.current_company_id() and public.can_manage_customer_finance())
with check (company_id = public.current_company_id() and public.can_manage_customer_finance());

drop policy if exists "Admin can delete installments" on public.financing_installments;
create policy "Admin can delete installments"
on public.financing_installments for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Cria o financiamento e todas as parcelas de uma vez (tudo ou nada). Roda
-- com a permissão de quem chama: as regras acima valem normalmente. As
-- parcelas vencem todo mês a partir da primeira (dia 31 vira o último dia
-- dos meses mais curtos).
create or replace function public.create_customer_financing(p jsonb)
returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_count integer := (p->>'installments_count')::integer;
  v_amount numeric(12, 2) := (p->>'installment_amount')::numeric;
  v_first date := (p->>'first_due_date')::date;
begin
  if v_company is null or not public.can_manage_customer_finance() then
    raise exception 'Sem permissão';
  end if;
  if v_count is null or v_count < 1 or v_count > 240 then
    raise exception 'Número de parcelas inválido (de 1 a 240)';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Informe o valor da parcela';
  end if;
  if v_first is null then
    raise exception 'Informe o vencimento da primeira parcela';
  end if;

  insert into public.customer_financings (
    company_id, customer_id, car_id, customer_name, vehicle_label, vehicle_plate,
    vehicle_price, down_payment, financed_amount, installments_count, installment_amount,
    interest_rate, first_due_date, late_fee_percent, late_interest_percent, notes
  ) values (
    v_company,
    nullif(p->>'customer_id', '')::uuid,
    nullif(p->>'car_id', '')::uuid,
    coalesce(nullif(trim(p->>'customer_name'), ''), 'Cliente'),
    coalesce(p->>'vehicle_label', ''),
    coalesce(p->>'vehicle_plate', ''),
    coalesce((p->>'vehicle_price')::numeric, 0),
    coalesce((p->>'down_payment')::numeric, 0),
    (p->>'financed_amount')::numeric,
    v_count,
    v_amount,
    nullif(p->>'interest_rate', '')::numeric,
    v_first,
    coalesce((p->>'late_fee_percent')::numeric, 2),
    coalesce((p->>'late_interest_percent')::numeric, 1),
    coalesce(p->>'notes', '')
  )
  returning id into v_id;

  insert into public.financing_installments (company_id, financing_id, number, due_date, amount)
  select v_company, v_id, g, (v_first + make_interval(months => g - 1))::date, v_amount
  from generate_series(1, v_count) g;

  return v_id;
end;
$$;
revoke execute on function public.create_customer_financing(jsonb) from anon, public;
grant execute on function public.create_customer_financing(jsonb) to authenticated;

-- Registro de atividades: rótulos dos novos registros (sem valores nos
-- rótulos de financiamento e parcela)
create or replace function public.log_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb;
  old_rec jsonb;
  v_company uuid;
  v_label text;
  v_details text;
  v_email text;
  v_changed text[];
begin
  begin
    if current_setting('app.skip_activity_log', true) = '1' then return null; end if;
    if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
    v_company := (rec->>'company_id')::uuid;
    -- Sem usuário = SQL Editor ou Edge Function (que grava o próprio log).
    if v_company is null or auth.uid() is null then return null; end if;

    if tg_op = 'UPDATE' then
      old_rec := to_jsonb(old);
      select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(rec) n
      where n.key not in ('updated_at') and n.value is distinct from old_rec->n.key;
      if v_changed is null then return null; end if;
      v_details := array_to_string(v_changed, ', ');
      if 'status' = any(v_changed) then
        v_details := format('status: %s → %s', old_rec->>'status', rec->>'status');
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
      when 'sales' then (select concat(c.brand, ' ', c.model, ' — R$ ', rec->>'sale_price') from public.cars c where c.id = (rec->>'car_id')::uuid)
      when 'customer_documents' then concat(
        coalesce(nullif(rec->>'title', ''), nullif(rec->>'file_name', ''), 'Documento'), ' — ',
        (select cu.name from public.customers cu where cu.id = (rec->>'customer_id')::uuid))
      when 'customer_financings' then concat('Financiamento — ', rec->>'customer_name')
      when 'financing_installments' then (
        select concat('Parcela ', rec->>'number', '/', f.installments_count, ' — ', f.customer_name)
        from public.customer_financings f where f.id = (rec->>'financing_id')::uuid)
      else null
    end;

    select email into v_email from auth.users where id = auth.uid();

    insert into public.activity_log (company_id, user_id, user_email, action, entity, entity_id, label, details)
    values (v_company, auth.uid(), v_email, lower(tg_op), tg_table_name, (rec->>'id')::uuid, v_label, v_details);
  exception when others then
    -- O log nunca pode impedir a operação principal
    null;
  end;
  return null;
end;
$$;

drop trigger if exists customer_documents_log_activity on public.customer_documents;
create trigger customer_documents_log_activity after insert or update or delete on public.customer_documents
for each row execute function public.log_activity();

drop trigger if exists customer_financings_log_activity on public.customer_financings;
create trigger customer_financings_log_activity after insert or update or delete on public.customer_financings
for each row execute function public.log_activity();

-- Parcelas: só pagamentos e ajustes (criar 48 parcelas não vira 48 registros)
drop trigger if exists financing_installments_log_activity on public.financing_installments;
create trigger financing_installments_log_activity after update on public.financing_installments
for each row execute function public.log_activity();

-- Registro de atividades: gerente sem "Vê valores das vendas" não vê os
-- registros de financiamento e parcelas
drop policy if exists "Admin can read activity log" on public.activity_log;
create policy "Admin can read activity log"
on public.activity_log for select
to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_company_admin()
    or (
      public.is_company_staff()
      and (entity <> 'car_expenses' or user_id = auth.uid())
      and (entity not in ('customer_financings', 'financing_installments') or public.can_manage_customer_finance())
    )
  )
);

-- 27) Segurança: papel só na loja atual, referências da mesma loja e carros ocultos
--
-- * is_company_admin() / is_company_staff() / can_manage_customer_finance() /
--   current_seller_id() olhavam o papel do usuário em QUALQUER loja: um login
--   que era vendedor na loja A e admin na loja B tinha poderes de admin na A.
--   Agora valem só para a loja atual (current_company_id()).
-- * Até esta versão, rodar o schema.sql de novo ligava todo usuário do projeto
--   como admin da Dom Motors (seção 11, já corrigida). Se isso aconteceu, a
--   consulta no fim deste arquivo lista os logins ligados a mais de uma loja
--   para você conferir e apagar os vínculos que não deveriam existir.
-- * Carro, cliente, fornecedor e financiamento referenciados num registro
--   precisam ser da mesma loja do registro. Antes, os ids dos carros são
--   públicos (o site mostra) e uma loja conseguia registrar "venda" de um carro
--   de outra loja — o que travava a venda de verdade dela.
-- * O site público só enxerga carros não ocultos (antes, ocultos saíam pela API).

create or replace function public.is_company_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_company
    where user_id = auth.uid() and company_id = public.current_company_id() and role = 'admin'
  )
$$;

create or replace function public.is_company_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_company
    where user_id = auth.uid() and company_id = public.current_company_id() and role in ('admin', 'manager')
  )
$$;

create or replace function public.can_manage_customer_finance()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_company_admin()
    or exists (
      select 1
      from public.user_company uc
      join public.sellers s on s.user_id = uc.user_id and s.company_id = uc.company_id
      where uc.user_id = auth.uid() and uc.company_id = public.current_company_id()
        and uc.role = 'manager' and s.active and s.finance_access = 'values'
    )
$$;

create or replace function public.current_seller_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.sellers
  where user_id = auth.uid() and company_id = public.current_company_id() and active
  limit 1
$$;

drop policy if exists "Public can read cars" on public.cars;
create policy "Public can read cars"
on public.cars for select
to anon
using (not hidden);

-- Referências da mesma loja (só confere o que foi informado ou mudou)
create or replace function public.check_company_refs()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := to_jsonb(new);
  old_rec jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_company uuid := (rec->>'company_id')::uuid;
  v_ref record;
  v_ok boolean;
begin
  for v_ref in
    select * from (values
      ('car_id', 'cars', 'Carro'),
      ('customer_id', 'customers', 'Cliente'),
      ('supplier_id', 'suppliers', 'Fornecedor'),
      ('financing_id', 'customer_financings', 'Financiamento')
    ) r (col, tbl, label)
  loop
    continue when not rec ? v_ref.col or rec->>v_ref.col is null;
    continue when tg_op = 'UPDATE'
      and rec->v_ref.col is not distinct from old_rec->v_ref.col
      and rec->'company_id' is not distinct from old_rec->'company_id';
    execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', v_ref.tbl)
      into v_ok using (rec->>v_ref.col)::uuid, v_company;
    if not v_ok then
      raise exception '% não encontrado nesta loja', v_ref.label using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists cars_check_company_refs on public.cars;
create trigger cars_check_company_refs before insert or update on public.cars
for each row execute function public.check_company_refs();

drop trigger if exists sales_check_company_refs on public.sales;
create trigger sales_check_company_refs before insert or update on public.sales
for each row execute function public.check_company_refs();

drop trigger if exists car_expenses_check_company_refs on public.car_expenses;
create trigger car_expenses_check_company_refs before insert or update on public.car_expenses
for each row execute function public.check_company_refs();

drop trigger if exists contracts_check_company_refs on public.contracts;
create trigger contracts_check_company_refs before insert or update on public.contracts
for each row execute function public.check_company_refs();

drop trigger if exists customer_documents_check_company_refs on public.customer_documents;
create trigger customer_documents_check_company_refs before insert or update on public.customer_documents
for each row execute function public.check_company_refs();

drop trigger if exists customer_financings_check_company_refs on public.customer_financings;
create trigger customer_financings_check_company_refs before insert or update on public.customer_financings
for each row execute function public.check_company_refs();

drop trigger if exists financing_installments_check_company_refs on public.financing_installments;
create trigger financing_installments_check_company_refs before insert or update on public.financing_installments
for each row execute function public.check_company_refs();

-- Limpa os vínculos criados por aquela falha que são inequívocos: admin da
-- Dom Motors para quem é vendedor ou gerente de OUTRA loja (a Edge Function da
-- Equipe nunca cria esse vínculo). Admins de outras lojas não são apagados
-- aqui: aparecem na conferência abaixo para você decidir.
delete from public.user_company uc
using public.companies dm
where dm.slug = 'dom-motors'
  and uc.company_id = dm.id
  and uc.role = 'admin'
  and exists (select 1 from public.sellers s where s.user_id = uc.user_id and s.company_id <> dm.id)
  and not exists (select 1 from public.sellers s where s.user_id = uc.user_id and s.company_id = dm.id);

-- 28) Conferência: passou para a seção 30, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 29) Estoque pelo vendedor, checklists do carro, forma de pagamento, reserva,
--     carro na troca, financiamento externo e comissões pagas
--
-- * Vendedor ativo também cadastra e edita carros (sem custo de compra e sem
--   excluir), muda o status, lança gastos (sem ler os lançados), anexa
--   documentos do carro e envia fotos (api/fotos.php usa can_edit_stock()).
--   Venda e reserva feitas por ele ficam no nome dele; depois disso, só admin
--   e gerente mudam o status do carro.
-- * Carro: observações internas (não aparecem no site), itens que vieram com
--   o carro e vistoria de entrada (listas de cada loja, preenchimento opcional).
-- * Venda: forma de pagamento, banco (lista de cada loja), entrada e valor
--   financiado (opcionais), carro recebido na troca e data em que a comissão
--   foi paga.
-- * Reserva com sinal (status "reservado"), financiamento externo (cliente
--   comprou o carro fora e só financiou pela loja) e comissão de financiamento
--   externo configurável por vendedor.

-- Qualquer pessoa ativa da loja atual: admin, gerente ou vendedor ativo
-- (current_company_id() já devolve null para vendedor desativado).
create or replace function public.can_edit_stock()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_company_id() is not null
$$;
revoke execute on function public.can_edit_stock() from anon, public;
grant execute on function public.can_edit_stock() to authenticated;

-- Carro -------------------------------------------------------------------------
alter table public.cars add column if not exists internal_notes text not null default '';
alter table public.cars add column if not exists intake_items jsonb not null default '[]';
alter table public.cars add column if not exists inspection jsonb not null default '[]';
alter table public.cars drop constraint if exists cars_intake_items_check;
alter table public.cars add constraint cars_intake_items_check check (jsonb_typeof(intake_items) = 'array');
alter table public.cars drop constraint if exists cars_inspection_check;
alter table public.cars add constraint cars_inspection_check check (jsonb_typeof(inspection) = 'array');

alter table public.cars drop constraint if exists cars_status_check;
alter table public.cars add constraint cars_status_check
  check (status in ('disponivel', 'manutencao', 'reservado', 'vendido'));

-- Estoque da equipe (admin, gerente e vendedor): tudo menos o custo de compra.
drop view if exists public.staff_cars;
create view public.staff_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, documents, customer_id, stock_alert_days,
  company_id, created_at, updated_at, internal_notes, intake_items, inspection
from public.cars
where company_id = public.current_company_id() and public.can_edit_stock()
with local check option;

revoke all on public.staff_cars from anon, authenticated, public;
grant select, insert, update on public.staff_cars to authenticated;

-- Carro vendido ou reservado: só admin e gerente mudam o status
create or replace function public.cars_guard_seller_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_company_staff() then return new; end if;
  if old.status in ('vendido', 'reservado') and new.status is distinct from old.status then
    raise exception 'Só o administrador ou o gerente podem mudar o status de um carro vendido ou reservado';
  end if;
  return new;
end;
$$;

drop trigger if exists cars_guard_seller_changes on public.cars;
create trigger cars_guard_seller_changes before update on public.cars
for each row execute function public.cars_guard_seller_changes();

-- Listas de cada loja (admin e gerente editam) ---------------------------------
alter table public.companies add column if not exists bank_list jsonb not null default
  '["Banco do Brasil", "Caixa", "Bradesco", "Itaú", "Santander", "BV", "Banco Pan", "Safra", "Omni", "C6 Bank", "Sicredi", "Sicoob", "Banco Toyota", "Banco Honda", "Banco Volkswagen"]';
alter table public.companies add column if not exists intake_checklist jsonb not null default
  '["Manual do proprietário", "Chave reserva", "Livro de revisões", "Estepe", "Macaco e chave de roda", "Triângulo", "Tapetes", "CRLV (documento do veículo)"]';
alter table public.companies add column if not exists inspection_checklist jsonb not null default
  '["Lataria e pintura", "Pneus", "Vidros e retrovisores", "Faróis e lanternas", "Motor", "Câmbio", "Suspensão", "Freios", "Ar-condicionado", "Parte elétrica", "Painel e luzes de alerta", "Bancos e acabamento interno"]';
alter table public.companies drop constraint if exists companies_bank_list_check;
alter table public.companies add constraint companies_bank_list_check check (jsonb_typeof(bank_list) = 'array');
alter table public.companies drop constraint if exists companies_intake_checklist_check;
alter table public.companies add constraint companies_intake_checklist_check check (jsonb_typeof(intake_checklist) = 'array');
alter table public.companies drop constraint if exists companies_inspection_checklist_check;
alter table public.companies add constraint companies_inspection_checklist_check check (jsonb_typeof(inspection_checklist) = 'array');

grant update (stock_alert_days, sale_checklist, bank_list, intake_checklist, inspection_checklist) on public.companies to authenticated;

-- Venda: forma de pagamento, banco, troca e comissão paga ------------------------
alter table public.sales add column if not exists payment_method text not null default '';
alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('', 'a_vista', 'financiado', 'financiamento_proprio', 'consorcio', 'outro'));
alter table public.sales add column if not exists bank text not null default '';
alter table public.sales add column if not exists down_payment numeric(12, 2) check (down_payment is null or down_payment >= 0);
alter table public.sales add column if not exists financed_amount numeric(12, 2) check (financed_amount is null or financed_amount >= 0);
alter table public.sales add column if not exists trade_in_car_id uuid references public.cars(id) on delete set null;
alter table public.sales add column if not exists trade_in_value numeric(12, 2) check (trade_in_value is null or trade_in_value >= 0);
alter table public.sales add column if not exists commission_paid_on date;

-- O vendedor registra venda só no nome dele (editar e excluir: admin e gerente)
drop policy if exists "Admin can insert sales" on public.sales;
create policy "Admin can insert sales"
on public.sales for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and (public.is_company_staff() or (seller_id is not null and seller_id = public.current_seller_id()))
);

-- Gastos, documentos do carro e fornecedores: o vendedor também lança e anexa
drop policy if exists "Authenticated can insert expenses" on public.car_expenses;
create policy "Authenticated can insert expenses"
on public.car_expenses for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Authenticated can upload expense attachments" on storage.objects;
create policy "Authenticated can upload expense attachments"
on storage.objects for insert
to authenticated
with check (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text and public.can_edit_stock());

drop policy if exists "Authenticated can view car documents" on storage.objects;
create policy "Authenticated can view car documents"
on storage.objects for select
to authenticated
using (bucket_id = 'car-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.can_edit_stock());

drop policy if exists "Authenticated can upload car documents" on storage.objects;
create policy "Authenticated can upload car documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-documents' and (storage.foldername(name))[1] = public.current_company_id()::text and public.can_edit_stock());

drop policy if exists "Authenticated can read suppliers" on public.suppliers;
create policy "Authenticated can read suppliers"
on public.suppliers for select
to authenticated
using (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Authenticated can insert suppliers" on public.suppliers;
create policy "Authenticated can insert suppliers"
on public.suppliers for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_edit_stock());

-- Carro recebido na troca: entra no estoque "em manutenção" e oculto do site,
-- com o custo de compra = valor da troca (o vendedor não informa custo pelo
-- cadastro, mas o valor da troca foi ele quem negociou).
create or replace function public.register_trade_in(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_brand text := nullif(trim(p->>'brand'), '');
  v_model text := nullif(trim(p->>'model'), '');
  v_version text := coalesce(trim(p->>'version'), '');
  v_year integer := nullif(p->>'year', '')::integer;
  v_slug text;
begin
  if v_company is null or not public.can_edit_stock() then
    raise exception 'Sem permissão';
  end if;
  if v_brand is null or v_model is null or v_year is null then
    raise exception 'Informe marca, modelo e ano do carro da troca';
  end if;
  v_slug := trim(both '-' from lower(regexp_replace(
    translate(concat_ws('-', v_brand, v_model, v_version, v_year::text),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^a-zA-Z0-9]+', '-', 'g'))) || '-troca-' || substr(md5(random()::text), 1, 6);

  insert into public.cars (
    company_id, slug, brand, model, version, year, model_year, km, transmission, fuel, color,
    doors, category, condition, price, badge, status, hidden, plate, description,
    purchase_price, purchase_date, internal_notes
  ) values (
    v_company, v_slug, v_brand, v_model, v_version, v_year,
    coalesce(nullif(trim(p->>'model_year'), ''), v_year::text),
    coalesce(nullif(p->>'km', '')::integer, 0),
    coalesce(nullif(trim(p->>'transmission'), ''), 'Manual'),
    coalesce(nullif(trim(p->>'fuel'), ''), 'Flex'),
    coalesce(nullif(trim(p->>'color'), ''), 'Não informada'),
    4,
    coalesce(nullif(trim(p->>'category'), ''), 'hatch'),
    coalesce(nullif(trim(p->>'condition'), ''), 'Segundo dono'),
    null, 'Disponível', 'manutencao', true,
    nullif(upper(trim(p->>'plate')), ''), '',
    nullif(p->>'value', '')::numeric::integer,
    coalesce(nullif(p->>'date', '')::date, current_date),
    coalesce(p->>'notes', 'Recebido na troca')
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.register_trade_in(jsonb) from anon, public;
grant execute on function public.register_trade_in(jsonb) to authenticated;

-- Reserva com sinal -------------------------------------------------------------
create table if not exists public.car_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null default '',
  seller_id uuid references public.sellers(id) on delete set null,
  deposit_amount numeric(12, 2) check (deposit_amount is null or deposit_amount >= 0),
  reserved_on date not null default current_date,
  reserved_until date,
  notes text not null default '',
  status text not null default 'ativa' check (status in ('ativa', 'convertida', 'cancelada')),
  closed_on date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_reservations_company_id_idx on public.car_reservations (company_id, status);
create unique index if not exists car_reservations_one_active_idx on public.car_reservations (car_id) where status = 'ativa';

drop trigger if exists car_reservations_set_updated_at on public.car_reservations;
create trigger car_reservations_set_updated_at
before update on public.car_reservations
for each row execute function public.set_updated_at();

alter table public.car_reservations enable row level security;

drop policy if exists "Team can read reservations" on public.car_reservations;
create policy "Team can read reservations"
on public.car_reservations for select
to authenticated
using (
  company_id = public.current_company_id()
  and (public.is_company_staff() or seller_id = public.current_seller_id() or created_by = auth.uid())
);

drop policy if exists "Staff can update reservations" on public.car_reservations;
create policy "Staff can update reservations"
on public.car_reservations for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff())
with check (company_id = public.current_company_id() and public.is_company_staff());

drop policy if exists "Admin can delete reservations" on public.car_reservations;
create policy "Admin can delete reservations"
on public.car_reservations for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Reservar: grava a reserva e muda o carro para "reservado" juntos. O vendedor
-- só reserva no nome dele.
create or replace function public.reserve_car(p jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_car uuid := (p->>'car_id')::uuid;
  v_seller uuid := nullif(p->>'seller_id', '')::uuid;
  v_status text;
  v_customer uuid := nullif(p->>'customer_id', '')::uuid;
  v_id uuid;
begin
  if v_company is null or not public.can_edit_stock() then
    raise exception 'Sem permissão';
  end if;
  if not public.is_company_staff() then
    v_seller := public.current_seller_id();
  end if;
  select status into v_status from public.cars where id = v_car and company_id = v_company for update;
  if not found then
    raise exception 'Carro não encontrado';
  end if;
  if v_status not in ('disponivel', 'manutencao') then
    raise exception 'Só dá para reservar um carro disponível ou em manutenção';
  end if;
  if v_customer is not null and not exists (select 1 from public.customers where id = v_customer and company_id = v_company) then
    raise exception 'Cliente não encontrado nesta loja';
  end if;
  if v_seller is not null and not exists (select 1 from public.sellers where id = v_seller and company_id = v_company) then
    raise exception 'Vendedor não encontrado nesta loja';
  end if;

  insert into public.car_reservations (company_id, car_id, customer_id, customer_name, seller_id, deposit_amount, reserved_on, reserved_until, notes)
  values (
    v_company, v_car, v_customer,
    coalesce((select name from public.customers where id = v_customer), nullif(trim(p->>'customer_name'), ''), ''),
    v_seller,
    nullif(p->>'deposit_amount', '')::numeric,
    coalesce(nullif(p->>'reserved_on', '')::date, current_date),
    nullif(p->>'reserved_until', '')::date,
    coalesce(p->>'notes', '')
  )
  returning id into v_id;

  update public.cars set status = 'reservado', sold_at = null where id = v_car;
  return v_id;
end;
$$;
revoke execute on function public.reserve_car(jsonb) from anon, public;
grant execute on function public.reserve_car(jsonb) to authenticated;

-- Encerrar reserva (admin e gerente): "convertida" (virou venda — o status do
-- carro é mudado pela venda) ou "cancelada" (carro volta a ficar disponível)
create or replace function public.close_reservation(p_id uuid, p_result text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_car uuid;
begin
  if v_company is null or not public.is_company_staff() then
    raise exception 'Só o administrador ou o gerente podem encerrar uma reserva';
  end if;
  if p_result not in ('convertida', 'cancelada') then
    raise exception 'Resultado inválido';
  end if;
  update public.car_reservations
  set status = p_result, closed_on = current_date
  where id = p_id and company_id = v_company and status = 'ativa'
  returning car_id into v_car;
  if v_car is null then
    raise exception 'Reserva não encontrada ou já encerrada';
  end if;
  if p_result = 'cancelada' then
    update public.cars set status = 'disponivel' where id = v_car and status = 'reservado';
  end if;
end;
$$;
revoke execute on function public.close_reservation(uuid, text) from anon, public;
grant execute on function public.close_reservation(uuid, text) to authenticated;

-- Comissão de financiamento externo, por vendedor --------------------------------
alter table public.sellers add column if not exists ext_commission_type text not null default 'none';
alter table public.sellers drop constraint if exists sellers_ext_commission_type_check;
alter table public.sellers add constraint sellers_ext_commission_type_check
  check (ext_commission_type in ('none', 'percent_financed', 'percent_return', 'fixed'));
alter table public.sellers add column if not exists ext_commission_value numeric(12, 2) not null default 0 check (ext_commission_value >= 0);

-- Financiamento externo: o cliente achou o carro fora e só fez o financiamento
-- pela loja. A loja recebe um retorno do banco quando o financiamento é pago.
create table if not exists public.external_financings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  vehicle_label text not null default '',
  vehicle_plate text not null default '',
  vehicle_year text not null default '',
  vehicle_price numeric(12, 2) check (vehicle_price is null or vehicle_price >= 0),
  vehicle_source text not null default 'particular' check (vehicle_source in ('loja', 'particular')),
  vehicle_source_name text not null default '',
  bank text not null default '',
  down_payment numeric(12, 2) check (down_payment is null or down_payment >= 0),
  financed_amount numeric(12, 2) check (financed_amount is null or financed_amount >= 0),
  installments_count integer check (installments_count is null or installments_count between 1 and 240),
  installment_amount numeric(12, 2) check (installment_amount is null or installment_amount >= 0),
  seller_id uuid references public.sellers(id) on delete set null,
  status text not null default 'em_analise' check (status in ('em_analise', 'aprovado', 'pago', 'recusado', 'cancelado')),
  submitted_on date not null default current_date,
  approved_on date,
  paid_on date,
  closed_on date,
  store_return numeric(12, 2) check (store_return is null or store_return >= 0),
  commission_type text,
  commission_value numeric(12, 2),
  commission_amount numeric(12, 2) not null default 0,
  commission_paid_on date,
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_financings_company_id_idx on public.external_financings (company_id, status);
create index if not exists external_financings_seller_id_idx on public.external_financings (seller_id);

drop trigger if exists external_financings_set_updated_at on public.external_financings;
create trigger external_financings_set_updated_at
before update on public.external_financings
for each row execute function public.set_updated_at();

-- Vendedor: não marca como pago, não informa o retorno da loja, não troca o
-- vendedor nem mexe em financiamento já pago (os gatilhos rodam em ordem
-- alfabética: 1_guard antes de 2_commission)
create or replace function public.external_financings_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_company_staff() then return new; end if;
  if tg_op = 'INSERT' then
    new.seller_id := public.current_seller_id();
    new.store_return := null;
    new.commission_paid_on := null;
    new.paid_on := null;
    if new.status = 'pago' then new.status := 'aprovado'; end if;
    return new;
  end if;
  if old.status = 'pago'
     or new.status = 'pago'
     or new.seller_id is distinct from old.seller_id
     or new.store_return is distinct from old.store_return
     or new.commission_paid_on is distinct from old.commission_paid_on then
    raise exception 'Só o administrador ou o gerente podem alterar isso';
  end if;
  return new;
end;
$$;

-- Comissão (gravada, como nas vendas) e datas de cada situação
create or replace function public.external_financings_compute()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  s public.sellers%rowtype;
begin
  if new.status is distinct from (case when tg_op = 'UPDATE' then old.status end) then
    if new.status = 'aprovado' and new.approved_on is null then new.approved_on := current_date; end if;
    if new.status = 'pago' and new.paid_on is null then new.paid_on := current_date; end if;
    if new.status in ('recusado', 'cancelado') and new.closed_on is null then new.closed_on := current_date; end if;
  end if;

  if new.seller_id is null then
    new.commission_type := null;
    new.commission_value := null;
    new.commission_amount := 0;
    return new;
  end if;
  -- Comissão já paga não muda mais
  if tg_op = 'UPDATE' and old.commission_paid_on is not null then
    new.commission_type := old.commission_type;
    new.commission_value := old.commission_value;
    new.commission_amount := old.commission_amount;
    return new;
  end if;
  -- Mesmo vendedor: mantém a regra da época e só recalcula o valor
  if tg_op = 'INSERT' or new.seller_id is distinct from old.seller_id then
    select * into s from public.sellers where id = new.seller_id and company_id = new.company_id;
    if not found then
      raise exception 'Vendedor inválido para esta empresa';
    end if;
    new.commission_type := s.ext_commission_type;
    new.commission_value := s.ext_commission_value;
  end if;
  new.commission_amount := case new.commission_type
    when 'percent_financed' then round(coalesce(new.financed_amount, 0) * new.commission_value / 100, 2)
    when 'percent_return' then round(coalesce(new.store_return, 0) * new.commission_value / 100, 2)
    when 'fixed' then coalesce(new.commission_value, 0)
    else 0
  end;
  return new;
end;
$$;

drop trigger if exists external_financings_1_guard on public.external_financings;
create trigger external_financings_1_guard before insert or update on public.external_financings
for each row execute function public.external_financings_guard();

drop trigger if exists external_financings_2_compute on public.external_financings;
create trigger external_financings_2_compute before insert or update on public.external_financings
for each row execute function public.external_financings_compute();

alter table public.external_financings enable row level security;

drop policy if exists "Team can read external financings" on public.external_financings;
create policy "Team can read external financings"
on public.external_financings for select
to authenticated
using (
  company_id = public.current_company_id()
  and (public.is_company_staff() or seller_id = public.current_seller_id() or created_by = auth.uid())
);

drop policy if exists "Team can insert external financings" on public.external_financings;
create policy "Team can insert external financings"
on public.external_financings for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Team can update external financings" on public.external_financings;
create policy "Team can update external financings"
on public.external_financings for update
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or seller_id = public.current_seller_id()))
with check (company_id = public.current_company_id() and (public.is_company_staff() or seller_id = public.current_seller_id()));

drop policy if exists "Admin can delete external financings" on public.external_financings;
create policy "Admin can delete external financings"
on public.external_financings for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Documentos do financiamento externo ficam na ficha do cliente
alter table public.customer_documents add column if not exists external_financing_id uuid
  references public.external_financings(id) on delete set null;
create index if not exists customer_documents_external_financing_idx on public.customer_documents (external_financing_id);

-- Comissões pagas (admin): marca ou desmarca de uma vez vendas e
-- financiamentos externos, com um único registro de atividade
create or replace function public.mark_commissions_paid(p_sale_ids uuid[], p_external_ids uuid[], p_paid_on date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_count integer := 0;
  v_rows integer;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador marca comissões como pagas';
  end if;
  perform set_config('app.skip_activity_log', '1', true);
  update public.sales set commission_paid_on = p_paid_on
  where company_id = v_company and id = any(coalesce(p_sale_ids, '{}'));
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  update public.external_financings set commission_paid_on = p_paid_on
  where company_id = v_company and id = any(coalesce(p_external_ids, '{}'));
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  perform set_config('app.skip_activity_log', '0', true);

  insert into public.activity_log (company_id, user_id, user_email, action, entity, label, details)
  values (
    v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'update', 'sellers', 'Comissões',
    case when p_paid_on is null
      then format('Desmarcou %s %s como paga(s)', v_count, case when v_count = 1 then 'comissão' else 'comissões' end)
      else format('Marcou %s %s como paga(s) em %s', v_count, case when v_count = 1 then 'comissão' else 'comissões' end, to_char(p_paid_on, 'DD/MM/YYYY'))
    end
  );
  return v_count;
end;
$$;
revoke execute on function public.mark_commissions_paid(uuid[], uuid[], date) from anon, public;
grant execute on function public.mark_commissions_paid(uuid[], uuid[], date) to authenticated;

-- Referências da mesma loja: acrescenta o carro da troca e o financiamento externo
create or replace function public.check_company_refs()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := to_jsonb(new);
  old_rec jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_company uuid := (rec->>'company_id')::uuid;
  v_ref record;
  v_ok boolean;
begin
  for v_ref in
    select * from (values
      ('car_id', 'cars', 'Carro'),
      ('customer_id', 'customers', 'Cliente'),
      ('supplier_id', 'suppliers', 'Fornecedor'),
      ('financing_id', 'customer_financings', 'Financiamento'),
      ('trade_in_car_id', 'cars', 'Carro da troca'),
      ('external_financing_id', 'external_financings', 'Financiamento externo')
    ) r (col, tbl, label)
  loop
    continue when not rec ? v_ref.col or rec->>v_ref.col is null;
    continue when tg_op = 'UPDATE'
      and rec->v_ref.col is not distinct from old_rec->v_ref.col
      and rec->'company_id' is not distinct from old_rec->'company_id';
    execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', v_ref.tbl)
      into v_ok using (rec->>v_ref.col)::uuid, v_company;
    if not v_ok then
      raise exception '% não encontrado nesta loja', v_ref.label using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists car_reservations_check_company_refs on public.car_reservations;
create trigger car_reservations_check_company_refs before insert or update on public.car_reservations
for each row execute function public.check_company_refs();

drop trigger if exists external_financings_check_company_refs on public.external_financings;
create trigger external_financings_check_company_refs before insert or update on public.external_financings
for each row execute function public.check_company_refs();

-- Registro de atividades: rótulos das tabelas novas
create or replace function public.log_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb;
  old_rec jsonb;
  v_company uuid;
  v_label text;
  v_details text;
  v_email text;
  v_changed text[];
begin
  begin
    if current_setting('app.skip_activity_log', true) = '1' then return null; end if;
    if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
    v_company := (rec->>'company_id')::uuid;
    -- Sem usuário = SQL Editor ou Edge Function (que grava o próprio log).
    if v_company is null or auth.uid() is null then return null; end if;

    if tg_op = 'UPDATE' then
      old_rec := to_jsonb(old);
      select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(rec) n
      where n.key not in ('updated_at') and n.value is distinct from old_rec->n.key;
      if v_changed is null then return null; end if;
      v_details := array_to_string(v_changed, ', ');
      if 'status' = any(v_changed) then
        v_details := format('status: %s → %s', old_rec->>'status', rec->>'status');
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
      when 'sales' then (select concat(c.brand, ' ', c.model, ' — R$ ', rec->>'sale_price') from public.cars c where c.id = (rec->>'car_id')::uuid)
      when 'customer_documents' then concat(
        coalesce(nullif(rec->>'title', ''), nullif(rec->>'file_name', ''), 'Documento'), ' — ',
        (select cu.name from public.customers cu where cu.id = (rec->>'customer_id')::uuid))
      when 'customer_financings' then concat('Financiamento — ', rec->>'customer_name')
      when 'financing_installments' then (
        select concat('Parcela ', rec->>'number', '/', f.installments_count, ' — ', f.customer_name)
        from public.customer_financings f where f.id = (rec->>'financing_id')::uuid)
      when 'car_reservations' then (
        select concat('Reserva — ', c.brand, ' ', c.model, coalesce(' — ' || nullif(rec->>'customer_name', ''), ''))
        from public.cars c where c.id = (rec->>'car_id')::uuid)
      when 'external_financings' then concat('Financiamento externo — ', rec->>'customer_name')
      else null
    end;

    select email into v_email from auth.users where id = auth.uid();

    insert into public.activity_log (company_id, user_id, user_email, action, entity, entity_id, label, details)
    values (v_company, auth.uid(), v_email, lower(tg_op), tg_table_name, (rec->>'id')::uuid, v_label, v_details);
  exception when others then
    -- O log nunca pode impedir a operação principal
    null;
  end;
  return null;
end;
$$;

drop trigger if exists car_reservations_log_activity on public.car_reservations;
create trigger car_reservations_log_activity after insert or update or delete on public.car_reservations
for each row execute function public.log_activity();

drop trigger if exists external_financings_log_activity on public.external_financings;
create trigger external_financings_log_activity after insert or update or delete on public.external_financings
for each row execute function public.log_activity();

-- 30) Conferência: passou para a seção 32, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 31) Configurações da loja, WhatsApp com rodízio, pendências dispensadas e
--     atendimento de clientes
--
-- * WhatsApp do site: número fixo ou rodízio entre pessoas da Equipe e números
--   avulsos, em sequência. O site pergunta o número a cada clique
--   (whatsapp_contact, liberada para o público) e o mesmo navegador continua
--   com o mesmo vendedor por alguns dias. Cada clique vira um contato (lead)
--   para o relatório. O topo e o rodapé mostram o número principal
--   (store_contact).
-- * Configurações (só admin, pela função save_store_settings): modo do
--   WhatsApp, número principal, abas escondidas (da loja toda ou por papel),
--   blocos do Dashboard e modelos de mensagem.
-- * Pendências do Dashboard: cada pessoa exclui (volta se a contagem
--   aumentar) ou adia por algumas horas.
-- * Clientes: vendedor responsável, carro para a troca, forma de pagamento,
--   interesses (carro do estoque ou carro procurado), aviso quando entra um
--   carro que combina e histórico de atendimento com data de retorno.

-- Telefone só com dígitos e com o 55 do Brasil (vazio se não der para usar)
create or replace function public.wa_digits(p text)
returns text
language sql immutable set search_path = public
as $$
  select case
    when length(d) in (10, 11) then '55' || d
    when length(d) between 12 and 15 then d
    else ''
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- Texto sem acento e em minúsculas, para comparar marca e modelo
create or replace function public.norm_text(p text)
returns text
language sql immutable set search_path = public
as $$
  select lower(translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
$$;

-- Configurações da loja -----------------------------------------------------------
alter table public.companies add column if not exists whatsapp_mode text not null default 'fixo';
alter table public.companies drop constraint if exists companies_whatsapp_mode_check;
alter table public.companies add constraint companies_whatsapp_mode_check check (whatsapp_mode in ('fixo', 'rodizio'));
alter table public.companies add column if not exists whatsapp_main text not null default '';
alter table public.companies add column if not exists whatsapp_sticky_days integer not null default 30;
alter table public.companies drop constraint if exists companies_whatsapp_sticky_days_check;
alter table public.companies add constraint companies_whatsapp_sticky_days_check check (whatsapp_sticky_days between 0 and 365);
-- Último número do rodízio que atendeu (o próximo clique vai para o seguinte)
alter table public.companies add column if not exists whatsapp_last_entry uuid;
alter table public.companies add column if not exists whatsapp_templates jsonb not null default
  '[{"id": "saudacao", "name": "Saudação", "text": "Olá, {nome}! Aqui é {vendedor}, da {loja}. Tudo bem? Posso ajudar você a encontrar o seu próximo carro?"},
    {"id": "carro_combina", "name": "Chegou um carro que combina", "text": "Olá, {nome}! Aqui é {vendedor}, da {loja}. Chegou um {carro} que combina com o que você procura:\n{link}\nQuer agendar uma visita ou um test-drive?"},
    {"id": "parcela", "name": "Lembrete de parcela", "text": "Olá, {nome}! Aqui é {vendedor}, da {loja}. Passando para lembrar da sua parcela. Qualquer dúvida, estou à disposição."},
    {"id": "documentos", "name": "Documentação", "text": "Olá, {nome}! Aqui é {vendedor}, da {loja}. Sobre a documentação do seu {carro}: "},
    {"id": "pos_venda", "name": "Pós-venda", "text": "Olá, {nome}! Aqui é {vendedor}, da {loja}. Como está o seu {carro}? Se precisar de qualquer coisa, conte com a gente!"}]';
alter table public.companies drop constraint if exists companies_whatsapp_templates_check;
alter table public.companies add constraint companies_whatsapp_templates_check check (jsonb_typeof(whatsapp_templates) = 'array');
-- {"hiddenTabs": {"all": [], "manager": [], "seller": []}, "hiddenBlocks": []}
alter table public.companies add column if not exists panel_settings jsonb not null default '{}';
alter table public.companies drop constraint if exists companies_panel_settings_check;
alter table public.companies add constraint companies_panel_settings_check check (jsonb_typeof(panel_settings) = 'object');

-- Só o admin grava (as colunas acima não têm permissão de update direto)
create or replace function public.save_store_settings(p jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_keys text[];
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador altera as configurações';
  end if;
  update public.companies set
    whatsapp_mode = case when p ? 'whatsapp_mode' then p->>'whatsapp_mode' else whatsapp_mode end,
    whatsapp_main = case when p ? 'whatsapp_main' then left(coalesce(p->>'whatsapp_main', ''), 30) else whatsapp_main end,
    whatsapp_sticky_days = case when p ? 'whatsapp_sticky_days' then (p->>'whatsapp_sticky_days')::integer else whatsapp_sticky_days end,
    whatsapp_templates = case when p ? 'whatsapp_templates' then p->'whatsapp_templates' else whatsapp_templates end,
    panel_settings = case when p ? 'panel_settings' then p->'panel_settings' else panel_settings end
  where id = v_company;

  select array_agg(k order by k) into v_keys from jsonb_object_keys(p) k;
  insert into public.activity_log (company_id, user_id, user_email, action, entity, label, details)
  values (v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'update', 'companies',
          'Configurações', array_to_string(v_keys, ', '));
end;
$$;
revoke execute on function public.save_store_settings(jsonb) from anon, public;
grant execute on function public.save_store_settings(jsonb) to authenticated;

-- Nomes da equipe para todos da loja (o vendedor não lê a tabela sellers
-- inteira, que tem comissões): usado no vendedor responsável pelo cliente
create or replace function public.team_directory()
returns table (id uuid, name text, role text, active boolean)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.role, s.active and s.deleted_at is null
  from public.sellers s
  where s.company_id = public.current_company_id()
  order by s.name
$$;
revoke execute on function public.team_directory() from anon, public;
grant execute on function public.team_directory() to authenticated;

-- Rodízio do WhatsApp ------------------------------------------------------------
-- Pessoa da Equipe (seller_id; telefone em branco = usa o do cadastro dela) ou
-- número avulso (nome e telefone). Quem é desativado ou excluído da Equipe sai
-- do rodízio sozinho.
create table if not exists public.whatsapp_rotation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  seller_id uuid references public.sellers(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_rotation_company_idx on public.whatsapp_rotation (company_id, position);
create unique index if not exists whatsapp_rotation_seller_idx on public.whatsapp_rotation (seller_id) where seller_id is not null;

drop trigger if exists whatsapp_rotation_set_updated_at on public.whatsapp_rotation;
create trigger whatsapp_rotation_set_updated_at
before update on public.whatsapp_rotation
for each row execute function public.set_updated_at();

alter table public.whatsapp_rotation enable row level security;

drop policy if exists "Team can read whatsapp rotation" on public.whatsapp_rotation;
create policy "Team can read whatsapp rotation"
on public.whatsapp_rotation for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Admin can insert whatsapp rotation" on public.whatsapp_rotation;
create policy "Admin can insert whatsapp rotation"
on public.whatsapp_rotation for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admin can update whatsapp rotation" on public.whatsapp_rotation;
create policy "Admin can update whatsapp rotation"
on public.whatsapp_rotation for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admin can delete whatsapp rotation" on public.whatsapp_rotation;
create policy "Admin can delete whatsapp rotation"
on public.whatsapp_rotation for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Contatos pelo WhatsApp do site (um por clique) ---------------------------------
create table if not exists public.whatsapp_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rotation_id uuid references public.whatsapp_rotation(id) on delete set null,
  seller_id uuid references public.sellers(id) on delete set null,
  phone text not null default '',
  car_id uuid references public.cars(id) on delete set null,
  page text not null default '',
  is_returning boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_leads_company_idx on public.whatsapp_leads (company_id, created_at desc);
create index if not exists whatsapp_leads_seller_idx on public.whatsapp_leads (seller_id);

alter table public.whatsapp_leads enable row level security;

-- Sem política de insert: só a função whatsapp_contact grava
drop policy if exists "Team can read whatsapp leads" on public.whatsapp_leads;
create policy "Team can read whatsapp leads"
on public.whatsapp_leads for select
to authenticated
using (
  company_id = public.current_company_id()
  and (public.is_company_staff() or seller_id = public.current_seller_id())
);

drop policy if exists "Admin can delete whatsapp leads" on public.whatsapp_leads;
create policy "Admin can delete whatsapp leads"
on public.whatsapp_leads for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Número para um clique no site. Rodízio: o mesmo navegador (p_keep = número
-- que ele recebeu antes) continua com o mesmo vendedor enquanto ele estiver
-- ativo; senão, vai para o próximo da lista depois do último que atendeu.
create or replace function public.whatsapp_contact(
  p_company uuid,
  p_car_slug text default null,
  p_keep uuid default null,
  p_page text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_mode text;
  v_main text;
  v_last uuid;
  v_sticky integer;
  v_car uuid;
  v_entry uuid;
  v_seller uuid;
  v_phone text;
  v_returning boolean := false;
begin
  -- Trava a linha da loja: dois cliques ao mesmo tempo não pegam o mesmo número
  select whatsapp_mode, public.wa_digits(whatsapp_main), whatsapp_last_entry, whatsapp_sticky_days
    into v_mode, v_main, v_last, v_sticky
  from public.companies where id = p_company
  for update;
  if not found then return null; end if;

  if nullif(trim(coalesce(p_car_slug, '')), '') is not null then
    select id into v_car from public.cars
    where company_id = p_company and slug = left(trim(p_car_slug), 200) and not hidden;
  end if;

  if v_mode = 'rodizio' then
    if p_keep is not null then
      select r.id, r.seller_id, public.wa_digits(coalesce(nullif(r.phone, ''), s.phone))
        into v_entry, v_seller, v_phone
      from public.whatsapp_rotation r
      left join public.sellers s on s.id = r.seller_id
      where r.id = p_keep and r.company_id = p_company and r.active
        and (r.seller_id is null or (s.active and s.deleted_at is null))
        and public.wa_digits(coalesce(nullif(r.phone, ''), s.phone)) <> '';
      v_returning := found;
    end if;

    if not v_returning then
      with valid as (
        select r.id, r.seller_id, r.position, r.created_at,
               public.wa_digits(coalesce(nullif(r.phone, ''), s.phone)) as phone
        from public.whatsapp_rotation r
        left join public.sellers s on s.id = r.seller_id
        where r.company_id = p_company and r.active
          and (r.seller_id is null or (s.active and s.deleted_at is null))
          and public.wa_digits(coalesce(nullif(r.phone, ''), s.phone)) <> ''
      ),
      last_served as (
        select position, created_at, id from public.whatsapp_rotation where id = v_last
      )
      select v.id, v.seller_id, v.phone into v_entry, v_seller, v_phone
      from valid v
      left join last_served l on true
      order by
        -- primeiro quem vem depois do último que atendeu; no fim, recomeça
        case when l.id is not null and (v.position, v.created_at, v.id) > (l.position, l.created_at, l.id) then 0 else 1 end,
        v.position, v.created_at, v.id
      limit 1;
      if found then
        update public.companies set whatsapp_last_entry = v_entry where id = p_company;
      end if;
    end if;
  end if;

  v_phone := coalesce(nullif(v_phone, ''), nullif(v_main, ''));
  if v_phone is null then
    return jsonb_build_object('phone', null, 'entry_id', null, 'mode', v_mode, 'sticky_days', v_sticky);
  end if;

  insert into public.whatsapp_leads (company_id, rotation_id, seller_id, phone, car_id, page, is_returning)
  values (p_company, v_entry, v_seller, v_phone, v_car, left(coalesce(p_page, ''), 200), v_returning);

  return jsonb_build_object('phone', v_phone, 'entry_id', v_entry, 'mode', v_mode, 'sticky_days', v_sticky);
end;
$$;
revoke execute on function public.whatsapp_contact(uuid, text, uuid, text) from public;
grant execute on function public.whatsapp_contact(uuid, text, uuid, text) to anon, authenticated;

-- Número principal (topo e rodapé do site)
create or replace function public.store_contact(p_company uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('mode', whatsapp_mode, 'main', nullif(public.wa_digits(whatsapp_main), ''))
  from public.companies where id = p_company
$$;
revoke execute on function public.store_contact(uuid) from public;
grant execute on function public.store_contact(uuid) to anon, authenticated;

-- Pendências do Dashboard dispensadas (cada pessoa as suas) ----------------------
-- dismissed_count: a pendência volta quando a contagem passar desse número.
-- snoozed_until: escondida até essa hora.
create table if not exists public.dashboard_dismissals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null check (length(key) between 1 and 100),
  dismissed_count integer,
  snoozed_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id, key)
);

drop trigger if exists dashboard_dismissals_set_updated_at on public.dashboard_dismissals;
create trigger dashboard_dismissals_set_updated_at
before update on public.dashboard_dismissals
for each row execute function public.set_updated_at();

alter table public.dashboard_dismissals enable row level security;

drop policy if exists "Own dismissals" on public.dashboard_dismissals;
create policy "Own dismissals"
on public.dashboard_dismissals for all
to authenticated
using (user_id = auth.uid() and company_id = public.current_company_id())
with check (user_id = auth.uid() and company_id = public.current_company_id());

-- Clientes: responsável, troca e forma de pagamento ------------------------------
alter table public.customers add column if not exists responsible_seller_id uuid references public.sellers(id) on delete set null;
alter table public.customers add column if not exists trade_in jsonb not null default '{}';
alter table public.customers add column if not exists payment_intent jsonb not null default '{}';
alter table public.customers drop constraint if exists customers_trade_in_check;
alter table public.customers add constraint customers_trade_in_check check (jsonb_typeof(trade_in) = 'object');
alter table public.customers drop constraint if exists customers_payment_intent_check;
alter table public.customers add constraint customers_payment_intent_check check (jsonb_typeof(payment_intent) = 'object');
create index if not exists customers_responsible_idx on public.customers (responsible_seller_id);

-- Interesses do cliente: um carro do estoque que ele gostou ou um carro que ele
-- procura (campos em branco = qualquer um)
create table if not exists public.customer_interests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null default 'procura' check (kind in ('estoque', 'procura')),
  car_id uuid references public.cars(id) on delete cascade,
  brand text not null default '',
  model text not null default '',
  category text not null default '',
  year_min integer check (year_min is null or year_min between 1950 and 2100),
  price_max numeric(12, 2) check (price_max is null or price_max >= 0),
  km_max integer check (km_max is null or km_max >= 0),
  transmission text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_interests_car_check check (kind <> 'estoque' or car_id is not null)
);

create index if not exists customer_interests_company_idx on public.customer_interests (company_id, kind) where active;
create index if not exists customer_interests_customer_idx on public.customer_interests (customer_id);

drop trigger if exists customer_interests_set_updated_at on public.customer_interests;
create trigger customer_interests_set_updated_at
before update on public.customer_interests
for each row execute function public.set_updated_at();

alter table public.customer_interests enable row level security;

drop policy if exists "Team can read customer interests" on public.customer_interests;
create policy "Team can read customer interests"
on public.customer_interests for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Team can insert customer interests" on public.customer_interests;
create policy "Team can insert customer interests"
on public.customer_interests for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Author or staff can update customer interests" on public.customer_interests;
create policy "Author or staff can update customer interests"
on public.customer_interests for update
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()))
with check (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

drop policy if exists "Author or staff can delete customer interests" on public.customer_interests;
create policy "Author or staff can delete customer interests"
on public.customer_interests for delete
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

-- Mesma regra do painel (src/utils/customerInterests.js): uma busca com pelo
-- menos um critério; marca igual, modelo contido em "modelo versão", ano
-- mínimo, preço máximo, km máximo e câmbio
create or replace function public.interest_matches_car(i public.customer_interests, c public.cars)
returns boolean
language sql stable set search_path = public
as $$
  select i.kind = 'procura' and i.active
    and (i.brand <> '' or i.model <> '' or i.category <> '' or i.transmission <> ''
         or i.year_min is not null or i.price_max is not null or i.km_max is not null)
    and (i.brand = '' or public.norm_text(c.brand) = public.norm_text(i.brand))
    and (i.model = '' or position(public.norm_text(i.model) in public.norm_text(c.model || ' ' || c.version)) > 0)
    and (i.category = '' or c.category = i.category)
    and (i.year_min is null or c.year >= i.year_min)
    and (i.price_max is null or (c.price is not null and c.price <= i.price_max))
    and (i.km_max is null or c.km <= i.km_max)
    and (i.transmission = '' or position(public.norm_text(i.transmission) in public.norm_text(c.transmission)) > 0)
$$;

-- Avisos de carro que combina (criados pelo banco quando um carro fica
-- disponível e visível no site, ou muda preço/km/modelo)
create table if not exists public.customer_interest_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  interest_id uuid not null references public.customer_interests(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  status text not null default 'novo' check (status in ('novo', 'avisado', 'descartado')),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (interest_id, car_id)
);

create index if not exists customer_interest_matches_company_idx on public.customer_interest_matches (company_id, status);
create index if not exists customer_interest_matches_customer_idx on public.customer_interest_matches (customer_id);

create or replace function public.customer_interest_matches_handled()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.handled_by := auth.uid();
    new.handled_at := case when new.status = 'novo' then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_interest_matches_handled on public.customer_interest_matches;
create trigger customer_interest_matches_handled before update on public.customer_interest_matches
for each row execute function public.customer_interest_matches_handled();

alter table public.customer_interest_matches enable row level security;

-- Sem política de insert: só o gatilho dos carros cria avisos
drop policy if exists "Team can read interest matches" on public.customer_interest_matches;
create policy "Team can read interest matches"
on public.customer_interest_matches for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Team can update interest matches" on public.customer_interest_matches;
create policy "Team can update interest matches"
on public.customer_interest_matches for update
to authenticated
using (company_id = public.current_company_id() and public.can_edit_stock())
with check (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Staff can delete interest matches" on public.customer_interest_matches;
create policy "Staff can delete interest matches"
on public.customer_interest_matches for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_staff());

create or replace function public.cars_match_interests()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status <> 'disponivel' or new.hidden then return null; end if;
  -- Já estava disponível e visível: só refaz a busca se mudou algo que conta
  if tg_op = 'UPDATE' and old.status = 'disponivel' and not old.hidden
     and (new.brand, new.model, new.version, new.category, new.year, new.km, new.transmission, new.price)
         is not distinct from
         (old.brand, old.model, old.version, old.category, old.year, old.km, old.transmission, old.price) then
    return null;
  end if;
  insert into public.customer_interest_matches (company_id, interest_id, customer_id, car_id)
  select new.company_id, i.id, i.customer_id, new.id
  from public.customer_interests i
  where i.company_id = new.company_id and public.interest_matches_car(i, new)
  on conflict (interest_id, car_id) do nothing;
  return null;
end;
$$;

drop trigger if exists cars_match_interests on public.cars;
create trigger cars_match_interests after insert or update on public.cars
for each row execute function public.cars_match_interests();

-- Histórico de atendimento ---------------------------------------------------------
create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'ligacao', 'visita', 'outro')),
  notes text not null default '',
  car_id uuid references public.cars(id) on delete set null,
  follow_up_on date,
  follow_up_done boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id, created_at desc);
create index if not exists customer_contacts_follow_up_idx on public.customer_contacts (company_id, follow_up_on) where not follow_up_done;

drop trigger if exists customer_contacts_set_updated_at on public.customer_contacts;
create trigger customer_contacts_set_updated_at
before update on public.customer_contacts
for each row execute function public.set_updated_at();

-- Nome de quem registrou (vendedor da Equipe ou, sem cadastro, o e-mail)
create or replace function public.customer_contacts_author()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.author_name := coalesce(
      (select name from public.sellers where user_id = auth.uid() and company_id = new.company_id limit 1),
      (select email from auth.users where id = auth.uid()),
      '');
  end if;
  return new;
end;
$$;

drop trigger if exists customer_contacts_author on public.customer_contacts;
create trigger customer_contacts_author before insert on public.customer_contacts
for each row execute function public.customer_contacts_author();

alter table public.customer_contacts enable row level security;

drop policy if exists "Team can read customer contacts" on public.customer_contacts;
create policy "Team can read customer contacts"
on public.customer_contacts for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Team can insert customer contacts" on public.customer_contacts;
create policy "Team can insert customer contacts"
on public.customer_contacts for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Author or staff can update customer contacts" on public.customer_contacts;
create policy "Author or staff can update customer contacts"
on public.customer_contacts for update
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()))
with check (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

drop policy if exists "Author or staff can delete customer contacts" on public.customer_contacts;
create policy "Author or staff can delete customer contacts"
on public.customer_contacts for delete
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or created_by = auth.uid()));

-- Referências da mesma loja: acrescenta vendedor, interesse e número do rodízio
create or replace function public.check_company_refs()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb := to_jsonb(new);
  old_rec jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_company uuid := (rec->>'company_id')::uuid;
  v_ref record;
  v_ok boolean;
begin
  for v_ref in
    select * from (values
      ('car_id', 'cars', 'Carro'),
      ('customer_id', 'customers', 'Cliente'),
      ('supplier_id', 'suppliers', 'Fornecedor'),
      ('financing_id', 'customer_financings', 'Financiamento'),
      ('trade_in_car_id', 'cars', 'Carro da troca'),
      ('external_financing_id', 'external_financings', 'Financiamento externo'),
      ('seller_id', 'sellers', 'Vendedor'),
      ('responsible_seller_id', 'sellers', 'Vendedor responsável'),
      ('interest_id', 'customer_interests', 'Interesse'),
      ('rotation_id', 'whatsapp_rotation', 'Número do rodízio')
    ) r (col, tbl, label)
  loop
    continue when not rec ? v_ref.col or rec->>v_ref.col is null;
    continue when tg_op = 'UPDATE'
      and rec->v_ref.col is not distinct from old_rec->v_ref.col
      and rec->'company_id' is not distinct from old_rec->'company_id';
    execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', v_ref.tbl)
      into v_ok using (rec->>v_ref.col)::uuid, v_company;
    if not v_ok then
      raise exception '% não encontrado nesta loja', v_ref.label using errcode = '23503';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists customers_check_company_refs on public.customers;
create trigger customers_check_company_refs before insert or update on public.customers
for each row execute function public.check_company_refs();

drop trigger if exists whatsapp_rotation_check_company_refs on public.whatsapp_rotation;
create trigger whatsapp_rotation_check_company_refs before insert or update on public.whatsapp_rotation
for each row execute function public.check_company_refs();

drop trigger if exists customer_interests_check_company_refs on public.customer_interests;
create trigger customer_interests_check_company_refs before insert or update on public.customer_interests
for each row execute function public.check_company_refs();

drop trigger if exists customer_contacts_check_company_refs on public.customer_contacts;
create trigger customer_contacts_check_company_refs before insert or update on public.customer_contacts
for each row execute function public.check_company_refs();

-- Registro de atividades: rótulos das tabelas novas
create or replace function public.log_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb;
  old_rec jsonb;
  v_company uuid;
  v_label text;
  v_details text;
  v_email text;
  v_changed text[];
begin
  begin
    if current_setting('app.skip_activity_log', true) = '1' then return null; end if;
    if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
    v_company := (rec->>'company_id')::uuid;
    -- Sem usuário = SQL Editor ou Edge Function (que grava o próprio log).
    if v_company is null or auth.uid() is null then return null; end if;

    if tg_op = 'UPDATE' then
      old_rec := to_jsonb(old);
      select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(rec) n
      where n.key not in ('updated_at') and n.value is distinct from old_rec->n.key;
      if v_changed is null then return null; end if;
      v_details := array_to_string(v_changed, ', ');
      if 'status' = any(v_changed) then
        v_details := format('status: %s → %s', old_rec->>'status', rec->>'status');
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
      when 'sales' then (select concat(c.brand, ' ', c.model, ' — R$ ', rec->>'sale_price') from public.cars c where c.id = (rec->>'car_id')::uuid)
      when 'customer_documents' then concat(
        coalesce(nullif(rec->>'title', ''), nullif(rec->>'file_name', ''), 'Documento'), ' — ',
        (select cu.name from public.customers cu where cu.id = (rec->>'customer_id')::uuid))
      when 'customer_financings' then concat('Financiamento — ', rec->>'customer_name')
      when 'financing_installments' then (
        select concat('Parcela ', rec->>'number', '/', f.installments_count, ' — ', f.customer_name)
        from public.customer_financings f where f.id = (rec->>'financing_id')::uuid)
      when 'car_reservations' then (
        select concat('Reserva — ', c.brand, ' ', c.model, coalesce(' — ' || nullif(rec->>'customer_name', ''), ''))
        from public.cars c where c.id = (rec->>'car_id')::uuid)
      when 'external_financings' then concat('Financiamento externo — ', rec->>'customer_name')
      when 'customer_interests' then concat('Interesse — ',
        (select cu.name from public.customers cu where cu.id = (rec->>'customer_id')::uuid))
      when 'customer_contacts' then concat('Atendimento — ',
        (select cu.name from public.customers cu where cu.id = (rec->>'customer_id')::uuid))
      when 'whatsapp_rotation' then concat('Rodízio do WhatsApp — ', coalesce(
        nullif(rec->>'name', ''), (select s.name from public.sellers s where s.id = (rec->>'seller_id')::uuid), rec->>'phone'))
      else null
    end;

    select email into v_email from auth.users where id = auth.uid();

    insert into public.activity_log (company_id, user_id, user_email, action, entity, entity_id, label, details)
    values (v_company, auth.uid(), v_email, lower(tg_op), tg_table_name, (rec->>'id')::uuid, v_label, v_details);
  exception when others then
    -- O log nunca pode impedir a operação principal
    null;
  end;
  return null;
end;
$$;

drop trigger if exists customer_interests_log_activity on public.customer_interests;
create trigger customer_interests_log_activity after insert or update or delete on public.customer_interests
for each row execute function public.log_activity();

drop trigger if exists customer_contacts_log_activity on public.customer_contacts;
create trigger customer_contacts_log_activity after insert or update or delete on public.customer_contacts
for each row execute function public.log_activity();

drop trigger if exists whatsapp_rotation_log_activity on public.whatsapp_rotation;
create trigger whatsapp_rotation_log_activity after insert or update or delete on public.whatsapp_rotation
for each row execute function public.log_activity();

-- 32) Conferência (fica por último para aparecer no SQL Editor) -------------
-- Logins ligados a mais de uma loja. Normalmente cada login é de UMA loja: se
-- aparecer alguém aqui, confira os acessos. Um vínculo "(admin)" com a Dom
-- Motors de quem é da equipe de outra loja veio da falha antiga da seção 11 e
-- deve ser apagado:
--   delete from public.user_company
--   where user_id = '<id do login>' and company_id = (select id from public.companies where slug = 'dom-motors');
-- Sem linhas no resultado = tudo certo.
select
  uc.user_id as "id do login",
  u.email as "login",
  string_agg(c.name || ' (' || uc.role || ')', ', ' order by c.name) as "acessos (confira: cada login deve ser de uma loja só)"
from public.user_company uc
join public.companies c on c.id = uc.company_id
left join auth.users u on u.id = uc.user_id
group by uc.user_id, u.email
having count(*) > 1
order by u.email;
