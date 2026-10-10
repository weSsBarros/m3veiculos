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

-- 32) Conferência: passou para a seção 34, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 33) Plataforma: monitor das lojas (só para o dono do sistema)
--
-- * platform_admins: logins que veem a aba "Plataforma" no painel da WB.AUTO.
--   Ninguém lê nem grava pela API; a carga é feita aqui (SQL Editor).
-- * platform_overview / platform_store_detail: números de cada loja (site,
--   estoque, vendas em quantidade, uso do painel e das funções), sem dados
--   sensíveis: nada de nome ou telefone de cliente, valores ou documentos.
-- * companies.is_demo marca a loja de demonstração (aparece no monitor, mas
--   fica fora da soma da "prova de valor"); companies.site_url guarda o
--   endereço do site de cada loja.
-- Datas de registros (timestamptz) contam no horário de São Luís.

alter table public.companies add column if not exists is_demo boolean not null default false;
alter table public.companies add column if not exists site_url text not null default '';

update public.companies set is_demo = true where slug = 'wb-auto';

update public.companies c set site_url = v.url
from (values
  ('dom-motors', 'https://dommotorsslz.com.br'),
  ('courotech', 'https://linen-starling-189856.hostingersite.com'),
  ('portal-veiculos', 'https://portalveiculosma.com.br'),
  ('aracagy-veiculos', 'https://aracagyveiculos.com'),
  ('m3-veiculos', 'https://m3veiculos.com'),
  ('multicar-slz', 'https://multicarslz.com'),
  ('ultra-seminovos', 'https://lightcyan-buffalo-854382.hostingersite.com'),
  ('wb-auto', 'https://sandybrown-mallard-175177.hostingersite.com'),
  ('lap-seminovos', 'https://lapseminovos.com.br'),
  ('katirao-veiculos', 'https://royalblue-echidna-510011.hostingersite.com'),
  ('top-carro-seminovos', 'https://coral-bison-140478.hostingersite.com'),
  ('imperio-dos-veiculos', 'https://imperiodosveiculos.com')
) as v(slug, url)
where c.slug = v.slug and c.site_url = '';

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated, public;

insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'wb.auto@gmail.com'
on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke execute on function public.is_platform_admin() from anon, public;
grant execute on function public.is_platform_admin() to authenticated;

-- Uma linha (jsonb) por loja, para o período e o período anterior de mesmo
-- tamanho (tendência)
create or replace function public.platform_overview(p_start date, p_end date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prev_start date;
  v_prev_end date;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  v_prev_end := p_start - 1;
  v_prev_start := p_start - (p_end - p_start + 1);

  select coalesce(jsonb_agg(s.store order by s.is_demo, s.name), '[]'::jsonb) into v_result
  from (
    select c.is_demo, c.name, jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'site_url', c.site_url,
      'is_demo', c.is_demo,
      'created_at', c.created_at,
      'stock_alert_days', c.stock_alert_days,
      'whatsapp_mode', c.whatsapp_mode,
      'whatsapp_ok', c.whatsapp_main <> '',
      'settings_customized', c.panel_settings <> '{}'::jsonb,
      'site', (
        select jsonb_build_object(
          'visits', coalesce(sum(v.visits) filter (where v.day between p_start and p_end), 0),
          'visitors', coalesce(sum(v.visitors) filter (where v.day between p_start and p_end), 0),
          'visits_prev', coalesce(sum(v.visits) filter (where v.day between v_prev_start and v_prev_end), 0),
          'visitors_prev', coalesce(sum(v.visitors) filter (where v.day between v_prev_start and v_prev_end), 0))
        from public.site_visits_daily v
        where v.company_id = c.id and v.day between v_prev_start and p_end),
      'car_views', (
        select jsonb_build_object(
          'views', coalesce(sum(x.views) filter (where x.day between p_start and p_end), 0),
          'views_prev', coalesce(sum(x.views) filter (where x.day between v_prev_start and v_prev_end), 0))
        from public.car_views_daily x
        where x.company_id = c.id and x.day between v_prev_start and p_end),
      'leads', (
        select jsonb_build_object(
          'total', count(*) filter (where d between p_start and p_end),
          'prev', count(*) filter (where d between v_prev_start and v_prev_end))
        from (select (l.created_at at time zone 'America/Fortaleza')::date as d
              from public.whatsapp_leads l where l.company_id = c.id) l),
      'stock', (
        select jsonb_build_object(
          'available', count(*) filter (where k.status = 'disponivel' and not k.hidden),
          'reserved', count(*) filter (where k.status = 'reservado'),
          'maintenance', count(*) filter (where k.status = 'manutencao'),
          'hidden', count(*) filter (where k.hidden and k.status <> 'vendido'),
          'in_stock', count(*) filter (where k.status <> 'vendido'),
          'no_photo', count(*) filter (where k.status = 'disponivel' and not k.hidden
                                         and jsonb_array_length(coalesce(k.images, '[]'::jsonb)) = 0),
          'stale', count(*) filter (where k.status = 'disponivel'
                                      and current_date - coalesce(k.purchase_date, (k.created_at at time zone 'America/Fortaleza')::date) > c.stock_alert_days),
          'added', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between p_start and p_end),
          'added_prev', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between v_prev_start and v_prev_end),
          'last_added_at', max(k.created_at),
          'last_updated_at', max(k.updated_at))
        from public.cars k
        where k.company_id = c.id),
      'sales', (
        select jsonb_build_object(
          'sold', count(*) filter (where x.sale_date between p_start and p_end),
          'sold_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end),
          'sold_site', count(*) filter (where x.sale_date between p_start and p_end and x.from_site),
          'sold_site_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end and x.from_site),
          'total', count(*))
        from (
          select s.sale_date, exists (
            select 1 from public.whatsapp_leads l
            where l.company_id = s.company_id and l.car_id = s.car_id
              and (l.created_at at time zone 'America/Fortaleza')::date <= s.sale_date) as from_site
          from public.sales s
          where s.company_id = c.id) x),
      'usage', (
        select jsonb_build_object(
          'last_activity_at', max(a.created_at),
          'last_work_at', max(a.created_at) filter (where a.entity <> 'auth'),
          'activities', count(*) filter (where a.entity <> 'auth' and a.d between p_start and p_end),
          'activities_prev', count(*) filter (where a.entity <> 'auth' and a.d between v_prev_start and v_prev_end),
          'logins', count(*) filter (where a.entity = 'auth' and a.d between p_start and p_end),
          'active_users', count(distinct a.user_id) filter (where a.d between p_start and p_end),
          'active_days', count(distinct a.d) filter (where a.entity <> 'auth' and a.d between p_start and p_end))
        from (select x.*, (x.created_at at time zone 'America/Fortaleza')::date as d
              from public.activity_log x where x.company_id = c.id) a),
      'last_login_at', (
        select max(u.last_sign_in_at)
        from public.user_company uc join auth.users u on u.id = uc.user_id
        where uc.company_id = c.id),
      'team', jsonb_build_object(
        'admins', (select count(*) from public.user_company uc where uc.company_id = c.id and uc.role = 'admin'),
        'managers', (select count(*) from public.sellers t
                     where t.company_id = c.id and t.role = 'manager' and t.active and t.deleted_at is null),
        'sellers', (select count(*) from public.sellers t
                    where t.company_id = c.id and t.role = 'seller' and t.active and t.deleted_at is null)),
      'features', jsonb_build_object(
        'customers', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customers x where x.company_id = c.id),
        'customer_contacts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_contacts x where x.company_id = c.id),
        'customer_interests', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_interests x where x.company_id = c.id),
        'reservations', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_reservations x where x.company_id = c.id),
        'contracts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contracts x where x.company_id = c.id),
        'contract_templates', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contract_templates x where x.company_id = c.id),
        'financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_financings x where x.company_id = c.id),
        'external_financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.external_financings x where x.company_id = c.id),
        'expenses', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_expenses x where x.company_id = c.id),
        'customer_documents', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_documents x where x.company_id = c.id),
        'sales', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where x.sale_date between p_start and p_end)) from public.sales x where x.company_id = c.id),
        'rotation', (select jsonb_build_object('total', count(*) filter (where x.active), 'period', 0) from public.whatsapp_rotation x where x.company_id = c.id))
    ) as store
    from public.companies c
  ) s;

  return v_result;
end $$;
revoke execute on function public.platform_overview(date, date) from anon, public;
grant execute on function public.platform_overview(date, date) to authenticated;

-- Detalhe de uma loja: série por dia, carros mais vistos e com mais contatos,
-- equipe (último acesso) e últimas atividades sem dados sensíveis (o rótulo e
-- os detalhes só aparecem em carros)
create or replace function public.platform_store_detail(p_company uuid, p_start date, p_end date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company) then
    raise exception 'Loja não encontrada' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'day', d.day,
          'visits', coalesce(v.visits, 0),
          'visitors', coalesce(v.visitors, 0),
          'views', coalesce(cv.views, 0),
          'leads', coalesce(l.leads, 0)) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series(p_start, p_end, interval '1 day') g) d
      left join public.site_visits_daily v on v.company_id = p_company and v.day = d.day
      left join lateral (
        select sum(x.views) as views from public.car_views_daily x
        where x.company_id = p_company and x.day = d.day) cv on true
      left join lateral (
        select count(*) as leads from public.whatsapp_leads w
        where w.company_id = p_company and (w.created_at at time zone 'America/Fortaleza')::date = d.day) l on true),
    'top_viewed', (
      select coalesce(jsonb_agg(t order by t.count desc, t.car), '[]'::jsonb)
      from (
        select concat_ws(' ', k.brand, k.model, k.model_year) as car, sum(x.views)::integer as count
        from public.car_views_daily x join public.cars k on k.id = x.car_id
        where x.company_id = p_company and x.day between p_start and p_end
        group by k.id, k.brand, k.model, k.model_year
        order by count desc
        limit 10) t),
    'top_leads', (
      select coalesce(jsonb_agg(t order by t.count desc, t.car), '[]'::jsonb)
      from (
        select concat_ws(' ', k.brand, k.model, k.model_year) as car, count(*)::integer as count
        from public.whatsapp_leads w join public.cars k on k.id = w.car_id
        where w.company_id = p_company
          and (w.created_at at time zone 'America/Fortaleza')::date between p_start and p_end
        group by k.id, k.brand, k.model, k.model_year
        order by count desc
        limit 10) t),
    'team', (
      select coalesce(jsonb_agg(t order by t.role, t.name), '[]'::jsonb)
      from (
        select coalesce(sl.name, 'Admin') as name, uc.role,
               coalesce(sl.active and sl.deleted_at is null, true) as active,
               u.last_sign_in_at
        from public.user_company uc
        join auth.users u on u.id = uc.user_id
        left join public.sellers sl on sl.company_id = uc.company_id and sl.user_id = uc.user_id
        where uc.company_id = p_company) t),
    'activities', (
      select coalesce(jsonb_agg(t order by t.at desc), '[]'::jsonb)
      from (
        select a.created_at as at, a.action, a.entity,
               case when a.entity = 'cars' then a.label end as label,
               case when a.entity = 'cars' then a.details end as details,
               coalesce(p.name, case when p.role = 'admin' then 'Admin' end, 'Sistema') as who,
               p.role
        from public.activity_log a
        left join lateral (
          select coalesce(sl.name, case when uc.role = 'admin' then 'Admin' end) as name,
                 coalesce(uc.role, sl.role) as role
          from (select 1) one
          left join public.user_company uc on uc.company_id = a.company_id and uc.user_id = a.user_id
          left join public.sellers sl on sl.company_id = a.company_id
            and (sl.user_id = a.user_id or sl.former_user_id = a.user_id)
          limit 1) p on true
        where a.company_id = p_company
        order by a.created_at desc
        limit 40) t)
  ) into v_result;

  return v_result;
end $$;
revoke execute on function public.platform_store_detail(uuid, date, date) from anon, public;
grant execute on function public.platform_store_detail(uuid, date, date) to authenticated;

-- 34) Conferência: passou para a seção 36, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 35) Desempenho: a aba de cada loja (só o admin, só a própria loja)
--
-- * platform_rows(p_start, p_end, p_company): os números da seção 33, sem
--   checar quem chama. Sem loja = todas; com loja = só ela. Ninguém chama pela
--   API (só as funções abaixo, que conferem o acesso).
-- * platform_overview: igual à seção 33 (só o dono da plataforma).
-- * store_performance(p_start, p_end): a linha da loja de quem chama, só para o
--   admin dela. É o que a aba "Desempenho" do painel mostra.
-- * platform_store_detail: o dono da plataforma vê qualquer loja; o admin vê
--   só a própria.

create or replace function public.platform_rows(p_start date, p_end date, p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prev_start date;
  v_prev_end date;
  v_result jsonb;
begin
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  v_prev_end := p_start - 1;
  v_prev_start := p_start - (p_end - p_start + 1);

  select coalesce(jsonb_agg(s.store order by s.is_demo, s.name), '[]'::jsonb) into v_result
  from (
    select c.is_demo, c.name, jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'site_url', c.site_url,
      'is_demo', c.is_demo,
      'created_at', c.created_at,
      'stock_alert_days', c.stock_alert_days,
      'whatsapp_mode', c.whatsapp_mode,
      'whatsapp_ok', c.whatsapp_main <> '',
      'settings_customized', c.panel_settings <> '{}'::jsonb,
      'site', (
        select jsonb_build_object(
          'visits', coalesce(sum(v.visits) filter (where v.day between p_start and p_end), 0),
          'visitors', coalesce(sum(v.visitors) filter (where v.day between p_start and p_end), 0),
          'visits_prev', coalesce(sum(v.visits) filter (where v.day between v_prev_start and v_prev_end), 0),
          'visitors_prev', coalesce(sum(v.visitors) filter (where v.day between v_prev_start and v_prev_end), 0))
        from public.site_visits_daily v
        where v.company_id = c.id and v.day between v_prev_start and p_end),
      'car_views', (
        select jsonb_build_object(
          'views', coalesce(sum(x.views) filter (where x.day between p_start and p_end), 0),
          'views_prev', coalesce(sum(x.views) filter (where x.day between v_prev_start and v_prev_end), 0))
        from public.car_views_daily x
        where x.company_id = c.id and x.day between v_prev_start and p_end),
      'leads', (
        select jsonb_build_object(
          'total', count(*) filter (where d between p_start and p_end),
          'prev', count(*) filter (where d between v_prev_start and v_prev_end))
        from (select (l.created_at at time zone 'America/Fortaleza')::date as d
              from public.whatsapp_leads l where l.company_id = c.id) l),
      'stock', (
        select jsonb_build_object(
          'available', count(*) filter (where k.status = 'disponivel' and not k.hidden),
          'reserved', count(*) filter (where k.status = 'reservado'),
          'maintenance', count(*) filter (where k.status = 'manutencao'),
          'hidden', count(*) filter (where k.hidden and k.status <> 'vendido'),
          'in_stock', count(*) filter (where k.status <> 'vendido'),
          'no_photo', count(*) filter (where k.status = 'disponivel' and not k.hidden
                                         and jsonb_array_length(coalesce(k.images, '[]'::jsonb)) = 0),
          'stale', count(*) filter (where k.status = 'disponivel'
                                      and current_date - coalesce(k.purchase_date, (k.created_at at time zone 'America/Fortaleza')::date) > c.stock_alert_days),
          'added', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between p_start and p_end),
          'added_prev', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between v_prev_start and v_prev_end),
          'last_added_at', max(k.created_at),
          'last_updated_at', max(k.updated_at))
        from public.cars k
        where k.company_id = c.id),
      'sales', (
        select jsonb_build_object(
          'sold', count(*) filter (where x.sale_date between p_start and p_end),
          'sold_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end),
          'sold_site', count(*) filter (where x.sale_date between p_start and p_end and x.from_site),
          'sold_site_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end and x.from_site),
          'total', count(*))
        from (
          select s.sale_date, exists (
            select 1 from public.whatsapp_leads l
            where l.company_id = s.company_id and l.car_id = s.car_id
              and (l.created_at at time zone 'America/Fortaleza')::date <= s.sale_date) as from_site
          from public.sales s
          where s.company_id = c.id) x),
      'usage', (
        select jsonb_build_object(
          'last_activity_at', max(a.created_at),
          'last_work_at', max(a.created_at) filter (where a.entity <> 'auth'),
          'activities', count(*) filter (where a.entity <> 'auth' and a.d between p_start and p_end),
          'activities_prev', count(*) filter (where a.entity <> 'auth' and a.d between v_prev_start and v_prev_end),
          'logins', count(*) filter (where a.entity = 'auth' and a.d between p_start and p_end),
          'active_users', count(distinct a.user_id) filter (where a.d between p_start and p_end),
          'active_days', count(distinct a.d) filter (where a.entity <> 'auth' and a.d between p_start and p_end))
        from (select x.*, (x.created_at at time zone 'America/Fortaleza')::date as d
              from public.activity_log x where x.company_id = c.id) a),
      'last_login_at', (
        select max(u.last_sign_in_at)
        from public.user_company uc join auth.users u on u.id = uc.user_id
        where uc.company_id = c.id),
      'team', jsonb_build_object(
        'admins', (select count(*) from public.user_company uc where uc.company_id = c.id and uc.role = 'admin'),
        'managers', (select count(*) from public.sellers t
                     where t.company_id = c.id and t.role = 'manager' and t.active and t.deleted_at is null),
        'sellers', (select count(*) from public.sellers t
                    where t.company_id = c.id and t.role = 'seller' and t.active and t.deleted_at is null)),
      'features', jsonb_build_object(
        'customers', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customers x where x.company_id = c.id),
        'customer_contacts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_contacts x where x.company_id = c.id),
        'customer_interests', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_interests x where x.company_id = c.id),
        'reservations', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_reservations x where x.company_id = c.id),
        'contracts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contracts x where x.company_id = c.id),
        'contract_templates', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contract_templates x where x.company_id = c.id),
        'financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_financings x where x.company_id = c.id),
        'external_financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.external_financings x where x.company_id = c.id),
        'expenses', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_expenses x where x.company_id = c.id),
        'customer_documents', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_documents x where x.company_id = c.id),
        'sales', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where x.sale_date between p_start and p_end)) from public.sales x where x.company_id = c.id),
        'rotation', (select jsonb_build_object('total', count(*) filter (where x.active), 'period', 0) from public.whatsapp_rotation x where x.company_id = c.id))
    ) as store
    from public.companies c
    where p_company is null or c.id = p_company
  ) s;

  return v_result;
end $$;
revoke execute on function public.platform_rows(date, date, uuid) from anon, authenticated, public;

create or replace function public.platform_overview(p_start date, p_end date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  return public.platform_rows(p_start, p_end, null);
end $$;
revoke execute on function public.platform_overview(date, date) from anon, public;
grant execute on function public.platform_overview(date, date) to authenticated;

create or replace function public.store_performance(p_start date, p_end date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Acesso restrito ao admin da loja' using errcode = '42501';
  end if;
  return public.platform_rows(p_start, p_end, v_company) -> 0;
end $$;
revoke execute on function public.store_performance(date, date) from anon, public;
grant execute on function public.store_performance(date, date) to authenticated;

create or replace function public.platform_store_detail(p_company uuid, p_start date, p_end date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (public.is_platform_admin()
          or (p_company is not null and p_company = public.current_company_id() and public.is_company_admin())) then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company) then
    raise exception 'Loja não encontrada' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'day', d.day,
          'visits', coalesce(v.visits, 0),
          'visitors', coalesce(v.visitors, 0),
          'views', coalesce(cv.views, 0),
          'leads', coalesce(l.leads, 0)) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series(p_start, p_end, interval '1 day') g) d
      left join public.site_visits_daily v on v.company_id = p_company and v.day = d.day
      left join lateral (
        select sum(x.views) as views from public.car_views_daily x
        where x.company_id = p_company and x.day = d.day) cv on true
      left join lateral (
        select count(*) as leads from public.whatsapp_leads w
        where w.company_id = p_company and (w.created_at at time zone 'America/Fortaleza')::date = d.day) l on true),
    'top_viewed', (
      select coalesce(jsonb_agg(t order by t.count desc, t.car), '[]'::jsonb)
      from (
        select concat_ws(' ', k.brand, k.model, k.model_year) as car, sum(x.views)::integer as count
        from public.car_views_daily x join public.cars k on k.id = x.car_id
        where x.company_id = p_company and x.day between p_start and p_end
        group by k.id, k.brand, k.model, k.model_year
        order by count desc
        limit 10) t),
    'top_leads', (
      select coalesce(jsonb_agg(t order by t.count desc, t.car), '[]'::jsonb)
      from (
        select concat_ws(' ', k.brand, k.model, k.model_year) as car, count(*)::integer as count
        from public.whatsapp_leads w join public.cars k on k.id = w.car_id
        where w.company_id = p_company
          and (w.created_at at time zone 'America/Fortaleza')::date between p_start and p_end
        group by k.id, k.brand, k.model, k.model_year
        order by count desc
        limit 10) t),
    'team', (
      select coalesce(jsonb_agg(t order by t.role, t.name), '[]'::jsonb)
      from (
        select coalesce(sl.name, 'Admin') as name, uc.role,
               coalesce(sl.active and sl.deleted_at is null, true) as active,
               u.last_sign_in_at
        from public.user_company uc
        join auth.users u on u.id = uc.user_id
        left join public.sellers sl on sl.company_id = uc.company_id and sl.user_id = uc.user_id
        where uc.company_id = p_company) t),
    'activities', (
      select coalesce(jsonb_agg(t order by t.at desc), '[]'::jsonb)
      from (
        select a.created_at as at, a.action, a.entity,
               case when a.entity = 'cars' then a.label end as label,
               case when a.entity = 'cars' then a.details end as details,
               coalesce(p.name, case when p.role = 'admin' then 'Admin' end, 'Sistema') as who,
               p.role
        from public.activity_log a
        left join lateral (
          select coalesce(sl.name, case when uc.role = 'admin' then 'Admin' end) as name,
                 coalesce(uc.role, sl.role) as role
          from (select 1) one
          left join public.user_company uc on uc.company_id = a.company_id and uc.user_id = a.user_id
          left join public.sellers sl on sl.company_id = a.company_id
            and (sl.user_id = a.user_id or sl.former_user_id = a.user_id)
          limit 1) p on true
        where a.company_id = p_company
        order by a.created_at desc
        limit 40) t)
  ) into v_result;

  return v_result;
end $$;
revoke execute on function public.platform_store_detail(uuid, date, date) from anon, public;
grant execute on function public.platform_store_detail(uuid, date, date) to authenticated;

-- 36) Conferência: passou para a seção 38, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 37) Cargos personalizados, menu por pessoa e troca de cargo
--
-- * custom_roles: cargos criados pelo admin (ex.: "Despachante"). Cada cargo
--   tem um nível de acesso (base_role: vendedor ou gerente), que é o que o
--   banco libera, e as abas que aparecem no menu (tabs). As regras (RLS)
--   continuam pelo papel do login (user_company.role).
-- * sellers.custom_role_id: o cargo da pessoa (sem cargo = Vendedor/Gerente).
--   Excluir o cargo devolve a pessoa ao cargo base.
-- * sellers.panel_tabs: o menu próprio da pessoa (null = segue o cargo).
-- * Trocar o cargo na Equipe (o admin muda sellers.role ou custom_role_id)
--   atualiza o papel do login nesta loja, só entre vendedor e gerente; um
--   vínculo de admin nunca muda.

create table if not exists public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  base_role text not null default 'seller' check (base_role in ('seller', 'manager')),
  tabs text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists custom_roles_company_name_idx on public.custom_roles (company_id, lower(btrim(name)));

alter table public.custom_roles enable row level security;

drop policy if exists "Team can read custom roles" on public.custom_roles;
create policy "Team can read custom roles"
on public.custom_roles for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Admin can insert custom roles" on public.custom_roles;
create policy "Admin can insert custom roles"
on public.custom_roles for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admin can update custom roles" on public.custom_roles;
create policy "Admin can update custom roles"
on public.custom_roles for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admin can delete custom roles" on public.custom_roles;
create policy "Admin can delete custom roles"
on public.custom_roles for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop trigger if exists custom_roles_set_updated_at on public.custom_roles;
create trigger custom_roles_set_updated_at
before update on public.custom_roles
for each row execute function public.set_updated_at();

alter table public.sellers add column if not exists custom_role_id uuid references public.custom_roles(id) on delete set null;
alter table public.sellers add column if not exists panel_tabs text[];
create index if not exists sellers_custom_role_id_idx on public.sellers (custom_role_id);

-- Com cargo personalizado, o nível da pessoa é o do cargo (e o cargo tem que
-- ser da mesma loja)
create or replace function public.sellers_apply_custom_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.custom_roles%rowtype;
begin
  if new.custom_role_id is not null then
    select * into v_role from public.custom_roles where id = new.custom_role_id;
    if not found or v_role.company_id <> new.company_id then
      raise exception 'Cargo não encontrado nesta loja' using errcode = '23503';
    end if;
    new.role := v_role.base_role;
  end if;
  return new;
end $$;

drop trigger if exists sellers_apply_custom_role on public.sellers;
create trigger sellers_apply_custom_role
before insert or update of custom_role_id, role on public.sellers
for each row execute function public.sellers_apply_custom_role();

-- Troca de nível: o papel do login nesta loja acompanha (só entre vendedor e
-- gerente; vínculo de admin não muda). Dispara em qualquer alteração, porque o
-- nível também muda quando só o cargo (custom_role_id) é trocado.
create or replace function public.sellers_sync_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.user_id is not null and new.role is distinct from old.role then
    update public.user_company
    set role = new.role
    where user_id = new.user_id
      and company_id = new.company_id
      and role in ('seller', 'manager')
      and role <> new.role;
  end if;
  return null;
end $$;

drop trigger if exists sellers_sync_role on public.sellers;
create trigger sellers_sync_role
after update on public.sellers
for each row execute function public.sellers_sync_role();

-- Mudou o nível do cargo: as pessoas do cargo acompanham
create or replace function public.custom_roles_propagate()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.base_role is distinct from old.base_role then
    update public.sellers set role = new.base_role
    where custom_role_id = new.id and role <> new.base_role;
  end if;
  return null;
end $$;

drop trigger if exists custom_roles_propagate on public.custom_roles;
create trigger custom_roles_propagate
after update of base_role on public.custom_roles
for each row execute function public.custom_roles_propagate();

-- Registro de atividades: cargos e troca de cargo
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
      -- Troca de cargo na Equipe: "cargo: Vendedor → Gerente"
      if tg_table_name = 'sellers' and ('role' = any(v_changed) or 'custom_role_id' = any(v_changed)) then
        v_details := format('cargo: %s → %s',
          coalesce((select r.name from public.custom_roles r where r.id = (old_rec->>'custom_role_id')::uuid),
                   case old_rec->>'role' when 'manager' then 'Gerente' else 'Vendedor' end),
          coalesce((select r.name from public.custom_roles r where r.id = (rec->>'custom_role_id')::uuid),
                   case rec->>'role' when 'manager' then 'Gerente' else 'Vendedor' end));
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'custom_roles' then rec->>'name'
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

drop trigger if exists custom_roles_log_activity on public.custom_roles;
create trigger custom_roles_log_activity after insert or update or delete on public.custom_roles
for each row execute function public.log_activity();

-- 38) Conferência: passou para a seção 40, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 39) Painel WB.Dev: clientes, planos, mensalidades, avisos e bloqueio
--
-- Gestão dos clientes do sistema (as lojas), dentro da aba Plataforma do
-- painel da WB.AUTO. Só o dono da plataforma (platform_admins) lê e grava as
-- tabelas desta seção; as lojas recebem só o que precisam por funções:
-- * my_account(): situação, abas do plano, avisos e (só para o admin) a
--   mensalidade.
-- * company_status(): pública; diz se a loja está bloqueada (o site mostra a
--   página de manutenção e o login mostra "acesso suspenso").
-- Bloqueio (ou cliente cancelado): current_company_id() devolve vazio para a
-- equipe da loja (o banco recusa tudo) e o site público deixa de ver os
-- carros. A loja de demonstração (WB.AUTO) não pode ser bloqueada.
-- Cobrança manual: um mês está pago quando há pagamento com aquele mês de
-- referência (client_payments.reference_month).

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  monthly_price numeric(10,2) check (monthly_price is null or monthly_price >= 0),
  features text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists plans_name_idx on public.plans (lower(btrim(name)));

alter table public.plans enable row level security;

drop policy if exists "Platform admins manage plans" on public.plans;
create policy "Platform admins manage plans"
on public.plans for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

insert into public.plans (name, features)
select 'Completo', array['estoque', 'novo-carro', 'vendas', 'financeiro', 'financiamentos-externos', 'relatorios',
  'historico', 'contratos', 'clientes', 'fornecedores', 'equipe', 'atividades', 'desempenho']
where not exists (select 1 from public.plans);

create table if not exists public.client_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  monthly_price numeric(10,2) check (monthly_price is null or monthly_price >= 0),
  due_day integer check (due_day between 1 and 28),
  billing_start date,
  status text not null default 'ativo' check (status in ('ativo', 'bloqueado', 'cancelado')),
  blocked_at timestamptz,
  block_reason text not null default '',
  legal_name text not null default '',
  cnpj text not null default '',
  responsible_name text not null default '',
  responsible_phone text not null default '',
  responsible_email text not null default '',
  domain text not null default '',
  domain_expires_on date,
  notes text not null default '',
  onboarding jsonb not null default '{}' check (jsonb_typeof(onboarding) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_accounts enable row level security;

drop policy if exists "Platform admins manage client accounts" on public.client_accounts;
create policy "Platform admins manage client accounts"
on public.client_accounts for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Mês de início sempre no dia 1; data do bloqueio; a demonstração não bloqueia
create or replace function public.client_accounts_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.billing_start is not null then
    new.billing_start := date_trunc('month', new.billing_start)::date;
  end if;
  if new.status <> 'ativo' and exists (select 1 from public.companies where id = new.company_id and is_demo) then
    raise exception 'A loja de demonstração não pode ser bloqueada nem cancelada' using errcode = '23514';
  end if;
  if new.status = 'ativo' then
    new.blocked_at := null;
  elsif tg_op = 'INSERT' or old.status is distinct from new.status then
    new.blocked_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists client_accounts_guard on public.client_accounts;
create trigger client_accounts_guard
before insert or update on public.client_accounts
for each row execute function public.client_accounts_guard();

insert into public.client_accounts (company_id, plan_id)
select c.id, (select p.id from public.plans p where p.name = 'Completo' limit 1)
from public.companies c
where not c.is_demo
on conflict (company_id) do nothing;

create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference_month date not null check (extract(day from reference_month) = 1),
  amount numeric(10,2) not null check (amount >= 0),
  paid_on date not null default current_date,
  method text not null default '',
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, reference_month)
);

alter table public.client_payments enable row level security;

drop policy if exists "Platform admins manage client payments" on public.client_payments;
create policy "Platform admins manage client payments"
on public.client_payments for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create table if not exists public.client_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  message text not null default '',
  level text not null default 'info' check (level in ('info', 'aviso', 'urgente')),
  audience text not null default 'equipe' check (audience in ('admin', 'equipe')),
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists client_notices_company_idx on public.client_notices (company_id);

alter table public.client_notices enable row level security;

drop policy if exists "Platform admins manage client notices" on public.client_notices;
create policy "Platform admins manage client notices"
on public.client_notices for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Loja bloqueada ou cliente cancelado: sem painel e sem estoque no site
create or replace function public.company_blocked(p_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.client_accounts
    where company_id = p_company and status in ('bloqueado', 'cancelado')
  )
$$;

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
    and not public.company_blocked(uc.company_id)
  limit 1
$$;

drop policy if exists "Public can read cars" on public.cars;
create policy "Public can read cars"
on public.cars for select
to anon
using (not hidden and not public.company_blocked(company_id));

-- Situação da cobrança de uma loja (p_today só para os testes)
create or replace function public.client_billing(p_company uuid, p_today date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  a public.client_accounts%rowtype;
  v_today date := coalesce(p_today, (now() at time zone 'America/Fortaleza')::date);
  v_price numeric;
  v_month date;
  v_last date;
  v_due date;
  v_open jsonb := '[]'::jsonb;
  v_next jsonb;
  v_oldest date;
  v_situation text;
begin
  select * into a from public.client_accounts where company_id = p_company;
  if not found then
    return jsonb_build_object('situation', 'sem_cobranca');
  end if;
  v_price := coalesce(a.monthly_price, (select p.monthly_price from public.plans p where p.id = a.plan_id));
  if a.status = 'cancelado' or coalesce(v_price, 0) = 0 or a.due_day is null or a.billing_start is null then
    return jsonb_build_object('situation', 'sem_cobranca', 'price', v_price, 'due_day', a.due_day);
  end if;

  v_month := a.billing_start;
  v_last := (date_trunc('month', v_today) + interval '1 month')::date;
  while v_month <= v_last loop
    v_due := v_month + (a.due_day - 1);
    if not exists (select 1 from public.client_payments p where p.company_id = p_company and p.reference_month = v_month) then
      if v_due < v_today then
        v_open := v_open || jsonb_build_array(jsonb_build_object('month', v_month, 'due', v_due, 'amount', v_price));
        v_oldest := coalesce(v_oldest, v_due);
      elsif v_next is null then
        v_next := jsonb_build_object('month', v_month, 'due', v_due, 'amount', v_price);
      end if;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  v_situation := case
    when v_oldest is not null then 'atrasado'
    when v_next is not null and (v_next->>'due')::date = v_today then 'vence_hoje'
    when v_next is not null and (v_next->>'due')::date - v_today <= 5 then 'vence_em_breve'
    else 'em_dia'
  end;

  return jsonb_build_object(
    'situation', v_situation,
    'price', v_price,
    'due_day', a.due_day,
    'open', v_open,
    'open_total', v_price * jsonb_array_length(v_open),
    'days_late', case when v_oldest is null then 0 else v_today - v_oldest end,
    'next', v_next
  );
end $$;
revoke execute on function public.client_billing(uuid, date) from anon, authenticated, public;

-- Lista do painel WB.Dev: conta, plano, cobrança e o que dá para conferir
-- sozinho no checklist de implantação
create or replace function public.platform_clients()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'company_id', c.id,
      'slug', c.slug,
      'name', c.name,
      'site_url', c.site_url,
      'account', to_jsonb(a) - 'company_id',
      'plan', (select jsonb_build_object('id', p.id, 'name', p.name, 'monthly_price', p.monthly_price, 'features', p.features)
               from public.plans p where p.id = a.plan_id),
      'billing', public.client_billing(c.id, null),
      'checks', jsonb_build_object(
        'whatsapp_ok', c.whatsapp_main <> '',
        'cars', (select count(*) from public.cars k where k.company_id = c.id),
        'logins', (select count(*) from public.user_company uc where uc.company_id = c.id),
        'own_domain', c.site_url <> '' and c.site_url not like '%hostingersite.com%')
    ) order by c.name), '[]'::jsonb)
    from public.companies c
    join public.client_accounts a on a.company_id = c.id
  );
end $$;
revoke execute on function public.platform_clients() from anon, public;
grant execute on function public.platform_clients() to authenticated;

-- Painel da loja: situação, abas do plano, avisos e (admin) a mensalidade
create or replace function public.my_account()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_admin boolean := public.is_company_admin();
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  a public.client_accounts%rowtype;
begin
  if v_company is null then
    raise exception 'Sem acesso' using errcode = '42501';
  end if;
  select * into a from public.client_accounts where company_id = v_company;
  return jsonb_build_object(
    'status', coalesce(a.status, 'ativo'),
    'plan_name', (select p.name from public.plans p where p.id = a.plan_id),
    'features', (select to_jsonb(p.features) from public.plans p where p.id = a.plan_id),
    'notices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'message', n.message, 'level', n.level) order by n.created_at desc), '[]'::jsonb)
      from public.client_notices n
      where (n.company_id is null or n.company_id = v_company)
        and n.starts_on <= v_today
        and (n.ends_on is null or n.ends_on >= v_today)
        and (n.audience = 'equipe' or v_admin)),
    'billing', case when v_admin then public.client_billing(v_company, null) end
  );
end $$;
revoke execute on function public.my_account() from anon, public;
grant execute on function public.my_account() to authenticated;

-- Público: a loja está bloqueada? (site e tela de login)
create or replace function public.company_status(p_company uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('blocked', public.company_blocked(c.id), 'name', c.name)
  from public.companies c
  where c.id = p_company
$$;
revoke execute on function public.company_status(uuid) from public;
grant execute on function public.company_status(uuid) to anon, authenticated;

-- 40) Conferência: passou para a seção 42, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 41) Painel WB.Dev: despesas da plataforma (aba Financeiro) ----------------
--
-- Custos da WB.Dev (hospedagem, domínios, ferramentas, anúncios...) para a aba
-- Financeiro da Plataforma mostrar o lucro do período. Só o dono da plataforma
-- (platform_admins) lê e grava. company_id (opcional) liga a despesa a um
-- cliente (ex.: o domínio da loja), para o ranking por cliente mostrar quanto
-- sobra de cada um.
create table if not exists public.platform_expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null default current_date,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  category text not null default 'outros'
    check (category in ('hospedagem', 'dominios', 'ferramentas', 'marketing', 'impostos', 'pessoal', 'outros')),
  amount numeric(10,2) not null check (amount > 0),
  company_id uuid references public.companies(id) on delete set null,
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists platform_expenses_spent_on_idx on public.platform_expenses (spent_on);

alter table public.platform_expenses enable row level security;

drop policy if exists "Platform admins manage platform expenses" on public.platform_expenses;
create policy "Platform admins manage platform expenses"
on public.platform_expenses for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- 42) Conferência: passou para a seção 44, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 43) Painel WB.Dev: cliente em implantação, ativação e vencimento automático -
--
-- O cliente novo entra "Em implantação" (sem cobrança). Quando o dono da
-- plataforma o passa para "Ativo", fica gravada a data de ativação e o primeiro
-- vencimento cai 30 dias depois, repetindo todo mês nesse dia; se cair no dia
-- 29, 30 ou 31, vence no dia 1 do mês seguinte. O dia de vencimento e o
-- primeiro mês escolhidos à mão (due_day, billing_start) valem no lugar do
-- automático. As contas que já existiam continuam "Ativo", como estavam.
-- Loja criada depois (pelo botão "Novo cliente" do painel ou pelo SQL) ganha a
-- conta "Em implantação" sozinha.
alter table public.client_accounts drop constraint if exists client_accounts_status_check;
alter table public.client_accounts add constraint client_accounts_status_check
  check (status in ('implantacao', 'ativo', 'bloqueado', 'cancelado'));
alter table public.client_accounts alter column status set default 'implantacao';
alter table public.client_accounts add column if not exists implantation_started_on date;
alter table public.client_accounts add column if not exists activated_on date;

-- Datas padrão no fuso de São Luís: o servidor está em UTC, e depois das 21h o
-- current_date já é o dia seguinte (um aviso sem data começaria "amanhã")
alter table public.client_notices alter column starts_on set default ((now() at time zone 'America/Fortaleza')::date);
alter table public.client_payments alter column paid_on set default ((now() at time zone 'America/Fortaleza')::date);
alter table public.platform_expenses alter column spent_on set default ((now() at time zone 'America/Fortaleza')::date);

create or replace function public.client_accounts_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Fortaleza')::date;
begin
  if new.billing_start is not null then
    new.billing_start := date_trunc('month', new.billing_start)::date;
  end if;
  if new.status in ('bloqueado', 'cancelado') and exists (select 1 from public.companies where id = new.company_id and is_demo) then
    raise exception 'A loja de demonstração não pode ser bloqueada nem cancelada' using errcode = '23514';
  end if;
  if new.status in ('ativo', 'implantacao') then
    new.blocked_at := null;
  elsif tg_op = 'INSERT' or old.status is distinct from new.status then
    new.blocked_at := now();
  end if;
  -- Entrou em implantação: começa a contar (voltar de "Ativo" recomeça do zero)
  if new.status = 'implantacao' then
    if tg_op = 'INSERT' then
      new.implantation_started_on := coalesce(new.implantation_started_on, v_today);
    elsif old.status = 'ativo' then
      new.implantation_started_on := v_today;
      new.activated_on := null;
    elsif old.status is distinct from 'implantacao' then
      new.implantation_started_on := coalesce(new.implantation_started_on, v_today);
    end if;
  end if;
  -- Saiu da implantação para "Ativo": data de ativação (a escolhida ou hoje)
  if new.status = 'ativo' and tg_op = 'UPDATE' and old.status = 'implantacao' then
    new.activated_on := coalesce(new.activated_on, v_today);
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Loja nova (fora a demonstração) ganha a conta "Em implantação" no plano Completo
create or replace function public.companies_create_client_account()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not coalesce(new.is_demo, false) then
    insert into public.client_accounts (company_id, plan_id, status)
    values (new.id, (select p.id from public.plans p where p.name = 'Completo' limit 1), 'implantacao')
    on conflict (company_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists companies_create_client_account on public.companies;
create trigger companies_create_client_account
after insert on public.companies
for each row execute function public.companies_create_client_account();

-- Situação da cobrança (substitui a da seção 39): "implantacao" não cobra; o
-- vencimento e o primeiro mês vêm da ativação quando não foram escolhidos
create or replace function public.client_billing(p_company uuid, p_today date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  a public.client_accounts%rowtype;
  v_today date := coalesce(p_today, (now() at time zone 'America/Fortaleza')::date);
  v_price numeric;
  v_due_day integer;
  v_start date;
  v_first date;
  v_month date;
  v_last date;
  v_due date;
  v_open jsonb := '[]'::jsonb;
  v_next jsonb;
  v_oldest date;
  v_situation text;
begin
  select * into a from public.client_accounts where company_id = p_company;
  if not found then
    return jsonb_build_object('situation', 'sem_cobranca');
  end if;
  v_price := coalesce(a.monthly_price, (select p.monthly_price from public.plans p where p.id = a.plan_id));
  v_due_day := a.due_day;
  v_start := a.billing_start;
  if a.activated_on is not null then
    v_first := a.activated_on + 30;
    if extract(day from v_first) > 28 then
      v_first := (date_trunc('month', v_first) + interval '1 month')::date;
    end if;
    v_due_day := coalesce(v_due_day, extract(day from v_first)::integer);
    v_start := coalesce(v_start, date_trunc('month', v_first)::date);
  end if;

  if a.status = 'implantacao' then
    return jsonb_build_object('situation', 'implantacao', 'price', v_price, 'due_day', a.due_day,
      'due_day_auto', a.due_day is null);
  end if;
  if a.status = 'cancelado' or coalesce(v_price, 0) = 0 or v_due_day is null or v_start is null then
    return jsonb_build_object('situation', 'sem_cobranca', 'price', v_price, 'due_day', v_due_day,
      'due_day_auto', a.due_day is null and a.activated_on is not null);
  end if;

  v_month := v_start;
  v_last := (date_trunc('month', v_today) + interval '1 month')::date;
  while v_month <= v_last loop
    v_due := v_month + (v_due_day - 1);
    if not exists (select 1 from public.client_payments p where p.company_id = p_company and p.reference_month = v_month) then
      if v_due < v_today then
        v_open := v_open || jsonb_build_array(jsonb_build_object('month', v_month, 'due', v_due, 'amount', v_price));
        v_oldest := coalesce(v_oldest, v_due);
      elsif v_next is null then
        v_next := jsonb_build_object('month', v_month, 'due', v_due, 'amount', v_price);
      end if;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  v_situation := case
    when v_oldest is not null then 'atrasado'
    when v_next is not null and (v_next->>'due')::date = v_today then 'vence_hoje'
    when v_next is not null and (v_next->>'due')::date - v_today <= 5 then 'vence_em_breve'
    else 'em_dia'
  end;

  return jsonb_build_object(
    'situation', v_situation,
    'price', v_price,
    'due_day', v_due_day,
    'due_day_auto', a.due_day is null and a.activated_on is not null,
    'billing_start', v_start,
    'open', v_open,
    'open_total', v_price * jsonb_array_length(v_open),
    'days_late', case when v_oldest is null then 0 else v_today - v_oldest end,
    'next', v_next
  );
end $$;
revoke execute on function public.client_billing(uuid, date) from anon, authenticated, public;

-- Botão "Novo cliente" do painel WB.Dev: cria a loja (nome + endereço interno)
-- e já preenche a conta, que nasce "Em implantação"
create or replace function public.platform_create_client(
  p_name text,
  p_slug text,
  p_responsible_name text default '',
  p_responsible_phone text default '',
  p_responsible_email text default '',
  p_plan_id uuid default null,
  p_monthly_price numeric default null,
  p_due_day integer default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe o nome da loja' using errcode = '23514';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 60 then
    raise exception 'Endereço interno inválido: use letras minúsculas, números e hífen' using errcode = '23514';
  end if;
  if exists (select 1 from public.companies where slug = v_slug) then
    raise exception 'Já existe uma loja com o endereço interno %', v_slug using errcode = '23505';
  end if;
  insert into public.companies (slug, name) values (v_slug, btrim(p_name)) returning id into v_id;
  update public.client_accounts set
    responsible_name = btrim(coalesce(p_responsible_name, '')),
    responsible_phone = btrim(coalesce(p_responsible_phone, '')),
    responsible_email = btrim(coalesce(p_responsible_email, '')),
    plan_id = coalesce(p_plan_id, plan_id),
    monthly_price = p_monthly_price,
    due_day = p_due_day
  where company_id = v_id;
  return jsonb_build_object('company_id', v_id, 'slug', v_slug);
end $$;
revoke execute on function public.platform_create_client(text, text, text, text, text, uuid, numeric, integer) from anon, public;
grant execute on function public.platform_create_client(text, text, text, text, text, uuid, numeric, integer) to authenticated;

-- 44) Conferência: passou para a seção 46, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 45) Painel WB.Dev: lembretes de mensalidade por e-mail --------------------
--
-- Todo dia de manhã a função wbdev-email (Edge Function) pergunta ao banco
-- quais lembretes saem hoje (billing_reminders_due) e manda por e-mail do
-- Gmail da WB.Dev; cada envio fica em client_reminders (o mesmo lembrete do
-- mesmo mês não sai duas vezes). Janelas:
--   antes_5: faltam de 1 a 5 dias para o vencimento;
--   no_dia: vence hoje;
--   atraso_1 / atraso_3 / atraso_7: 1-2, 3-6 e 7-13 dias de atraso (mês mais
--   antigo que isso não gera e-mail sozinho).
-- Quem recebe: o e-mail do responsável da ficha; sem ele, o e-mail de login
-- dos admins da loja (fora o dono da plataforma e os logins da equipe WB.Dev,
-- tabela platform_team). O recibo do pagamento também sai pela função (tipo
-- "recibo"). Só cliente "Ativo" com lembretes ligados.
alter table public.client_accounts add column if not exists reminders_enabled boolean not null default true;

create table if not exists public.client_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('antes_5', 'no_dia', 'atraso_1', 'atraso_3', 'atraso_7', 'recibo')),
  reference_month date,
  payment_id uuid references public.client_payments(id) on delete set null,
  sent_to text not null default '',
  status text not null default 'enviado' check (status in ('enviado', 'erro')),
  error text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists client_reminders_company_idx on public.client_reminders (company_id, created_at desc);
drop index if exists public.client_reminders_once;
create unique index client_reminders_once on public.client_reminders (company_id, kind, reference_month)
  where status = 'enviado' and kind <> 'recibo';

alter table public.client_reminders enable row level security;

drop policy if exists "Platform admins read client reminders" on public.client_reminders;
create policy "Platform admins read client reminders"
on public.client_reminders for select
to authenticated
using (public.is_platform_admin());

-- Chamada feita com a chave de serviço (a Edge Function e o agendamento diário)
-- platform_team: logins da equipe WB.Dev que ficam como admin nas lojas (para
-- suporte). Não recebem os lembretes. Incluir pelo SQL Editor:
--   insert into public.platform_team (user_id) select id from auth.users where lower(email) = '...';
create table if not exists public.platform_team (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_team enable row level security;
revoke all on public.platform_team from anon, authenticated, public;

create or replace function public.is_service_request()
returns boolean
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    current_setting('request.jwt.claim.role', true)
  ) = 'service_role'
$$;

create or replace function public.client_reminder_recipients(p_company uuid)
returns text[]
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_email text;
  v_list text[];
begin
  if not (public.is_platform_admin() or public.is_service_request()) then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  select nullif(lower(btrim(responsible_email)), '') into v_email from public.client_accounts where company_id = p_company;
  if v_email is not null then
    return array[v_email];
  end if;
  select array_agg(distinct lower(u.email) order by lower(u.email)) into v_list
  from public.user_company uc
  join auth.users u on u.id = uc.user_id
  where uc.company_id = p_company
    and uc.role = 'admin'
    and coalesce(u.email, '') <> ''
    and not exists (select 1 from public.platform_admins pa where pa.user_id = uc.user_id)
    and not exists (select 1 from public.platform_team pt where pt.user_id = uc.user_id);
  return coalesce(v_list, '{}');
end $$;
revoke execute on function public.client_reminder_recipients(uuid) from anon, public;
grant execute on function public.client_reminder_recipients(uuid) to authenticated, service_role;

create or replace function public.billing_reminders_due(p_today date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/Fortaleza')::date);
  v_items jsonb := '[]'::jsonb;
  r record;
  b jsonb;
  o jsonb;
  v_days integer;
  v_kind text;
begin
  if not (public.is_platform_admin() or public.is_service_request()) then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  for r in
    select c.id, c.name, a.responsible_name
    from public.companies c
    join public.client_accounts a on a.company_id = c.id
    where a.status = 'ativo' and a.reminders_enabled
  loop
    b := public.client_billing(r.id, v_today);
    -- antes do vencimento e no dia: o próximo vencimento
    if jsonb_typeof(b -> 'next') = 'object' then
      v_days := (b -> 'next' ->> 'due')::date - v_today;
      v_kind := case when v_days = 0 then 'no_dia' when v_days between 1 and 5 then 'antes_5' end;
      if v_kind is not null then
        v_items := v_items || jsonb_build_object('company_id', r.id, 'name', r.name, 'responsible_name', r.responsible_name,
          'kind', v_kind, 'month', b -> 'next' ->> 'month', 'due', b -> 'next' ->> 'due',
          'amount', b -> 'next' -> 'amount', 'days', v_days);
      end if;
    end if;
    -- em atraso: cada mês em aberto, nas janelas de 1, 3 e 7 dias
    for o in select value from jsonb_array_elements(coalesce(b -> 'open', '[]'::jsonb)) loop
      v_days := v_today - (o ->> 'due')::date;
      v_kind := case
        when v_days between 1 and 2 then 'atraso_1'
        when v_days between 3 and 6 then 'atraso_3'
        when v_days between 7 and 13 then 'atraso_7'
      end;
      if v_kind is not null then
        v_items := v_items || jsonb_build_object('company_id', r.id, 'name', r.name, 'responsible_name', r.responsible_name,
          'kind', v_kind, 'month', o ->> 'month', 'due', o ->> 'due', 'amount', o -> 'amount', 'days', v_days);
      end if;
    end loop;
  end loop;

  return (
    select coalesce(jsonb_agg(x || jsonb_build_object('to', to_jsonb(public.client_reminder_recipients((x ->> 'company_id')::uuid)))
                              order by x ->> 'name', x ->> 'month'), '[]'::jsonb)
    from jsonb_array_elements(v_items) as t(x)
    where not exists (
      select 1 from public.client_reminders cr
      where cr.company_id = (x ->> 'company_id')::uuid
        and cr.kind = x ->> 'kind'
        and cr.reference_month = (x ->> 'month')::date
        and cr.status = 'enviado')
  );
end $$;
revoke execute on function public.billing_reminders_due(date) from anon, public;
grant execute on function public.billing_reminders_due(date) to authenticated, service_role;

-- 46) Conferência: passou para a seção 48, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 47) Modelos de contrato: editar no painel, versões anteriores e modelo de cada contrato
--
-- O admin edita um modelo já enviado em Contratos → Modelos de contrato →
-- Editar. Ao salvar, o .docx novo vai para o Storage com outro nome
-- (save_contract_template_file) e o anterior fica em contract_template_versions,
-- de onde dá para restaurar (restore_contract_template_version). As duas funções
-- rodam com a permissão de quem chama: só o admin da loja consegue.
-- contracts.template_id e template_file_path guardam o modelo e a versão usados
-- em cada contrato, para o "Baixar" do histórico gerar o mesmo documento.
alter table public.contract_templates add column if not exists updated_at timestamptz;

drop policy if exists "Admins update contract templates" on public.contract_templates;
create policy "Admins update contract templates"
on public.contract_templates for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

create table if not exists public.contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  file_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create index if not exists contract_template_versions_template_idx
  on public.contract_template_versions (template_id, created_at desc);

alter table public.contract_template_versions enable row level security;

drop policy if exists "Admins read contract template versions" on public.contract_template_versions;
create policy "Admins read contract template versions"
on public.contract_template_versions for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admins insert contract template versions" on public.contract_template_versions;
create policy "Admins insert contract template versions"
on public.contract_template_versions for insert
to authenticated
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admins delete contract template versions" on public.contract_template_versions;
create policy "Admins delete contract template versions"
on public.contract_template_versions for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin());

-- Troca o arquivo do modelo pelo novo (já enviado ao Storage) e guarda o anterior
create or replace function public.save_contract_template_file(p_template uuid, p_file_path text)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_old text;
  v_company uuid;
begin
  select file_path, company_id into v_old, v_company
  from public.contract_templates where id = p_template
  for update;
  if not found then
    raise exception 'Modelo não encontrado ou sem permissão para editar' using errcode = '42501';
  end if;
  if coalesce(split_part(p_file_path, '/', 1), '') <> v_company::text or p_file_path = v_old then
    raise exception 'Arquivo do modelo inválido' using errcode = '22023';
  end if;
  insert into public.contract_template_versions (template_id, company_id, file_path)
  values (p_template, v_company, v_old);
  update public.contract_templates set file_path = p_file_path, updated_at = now() where id = p_template;
end $$;
revoke execute on function public.save_contract_template_file(uuid, text) from anon, public;
grant execute on function public.save_contract_template_file(uuid, text) to authenticated;

-- Volta para uma versão anterior (a versão atual vira uma versão anterior)
create or replace function public.restore_contract_template_version(p_version uuid)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v public.contract_template_versions%rowtype;
  v_current text;
begin
  select * into v from public.contract_template_versions where id = p_version;
  if not found then
    raise exception 'Versão não encontrada' using errcode = '42501';
  end if;
  select file_path into v_current from public.contract_templates where id = v.template_id for update;
  if not found then
    raise exception 'Modelo não encontrado ou sem permissão para editar' using errcode = '42501';
  end if;
  delete from public.contract_template_versions where id = p_version;
  insert into public.contract_template_versions (template_id, company_id, file_path)
  values (v.template_id, v.company_id, v_current);
  update public.contract_templates set file_path = v.file_path, updated_at = now() where id = v.template_id;
end $$;
revoke execute on function public.restore_contract_template_version(uuid) from anon, public;
grant execute on function public.restore_contract_template_version(uuid) to authenticated;

alter table public.contracts add column if not exists template_id uuid references public.contract_templates(id) on delete set null;
alter table public.contracts add column if not exists template_file_path text;

-- 48) Conferência: passou para a seção 50, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 49) Estoque: tipo de entrada, dono do carro e WhatsApp do carro --------------
--
-- * entry_type: como o carro entrou na loja — showroom (veículo próprio),
--   consignado (o dono deixa para a loja vender) ou repasse (vendido a outras
--   lojas no estado). Carro de repasse não aparece no site (decisão do Wesley).
--   No consignado, o "preço de compra" é o valor combinado com o dono.
-- * owner_customer_id: o dono anterior (de quem a loja comprou) ou o dono do
--   consignado, ligado ao cadastro de clientes (os dados vão para os contratos
--   de entrada).
-- * whatsapp_seller_id: pessoa da equipe que atende esse carro. Todo botão de
--   WhatsApp do carro vai para ela, passando por cima do número fixo e do
--   rodízio (whatsapp_contact devolve mode = 'carro').
alter table public.cars add column if not exists entry_type text not null default 'showroom';
alter table public.cars drop constraint if exists cars_entry_type_check;
alter table public.cars add constraint cars_entry_type_check check (entry_type in ('showroom', 'consignado', 'repasse'));
alter table public.cars add column if not exists owner_customer_id uuid references public.customers(id) on delete set null;
alter table public.cars add column if not exists whatsapp_seller_id uuid references public.sellers(id) on delete set null;

create index if not exists cars_owner_customer_idx on public.cars (owner_customer_id) where owner_customer_id is not null;

-- O dono e a pessoa do WhatsApp têm que ser da mesma loja do carro
create or replace function public.cars_check_links()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.owner_customer_id is not null and not exists (
    select 1 from public.customers where id = new.owner_customer_id and company_id = new.company_id
  ) then
    raise exception 'O dono do carro precisa ser um cliente desta loja' using errcode = '23514';
  end if;
  if new.whatsapp_seller_id is not null and not exists (
    select 1 from public.sellers where id = new.whatsapp_seller_id and company_id = new.company_id
  ) then
    raise exception 'O WhatsApp do carro precisa ser de alguém da equipe desta loja' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists cars_check_links on public.cars;
create trigger cars_check_links before insert or update of owner_customer_id, whatsapp_seller_id, company_id on public.cars
for each row execute function public.cars_check_links();

-- Site: carro de repasse não aparece
drop policy if exists "Public can read cars" on public.cars;
create policy "Public can read cars"
on public.cars for select
to anon
using (not hidden and entry_type <> 'repasse' and not public.company_blocked(company_id));

-- Estoque da equipe (admin, gerente e vendedor): tudo menos o custo de compra.
drop view if exists public.staff_cars;
create view public.staff_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, documents, customer_id, stock_alert_days,
  company_id, created_at, updated_at, internal_notes, intake_items, inspection,
  entry_type, owner_customer_id, whatsapp_seller_id
from public.cars
where company_id = public.current_company_id() and public.can_edit_stock()
with local check option;

revoke all on public.staff_cars from anon, authenticated, public;
grant select, insert, update on public.staff_cars to authenticated;

-- WhatsApp do site: carro com pessoa definida vai sempre para ela
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
  v_car_seller uuid;
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
    select id, whatsapp_seller_id into v_car, v_car_seller from public.cars
    where company_id = p_company and slug = left(trim(p_car_slug), 200) and not hidden;
  end if;

  -- Carro com pessoa definida (ativa e com telefone): vai direto para ela
  if v_car_seller is not null then
    select s.id, public.wa_digits(s.phone) into v_seller, v_phone
    from public.sellers s
    where s.id = v_car_seller and s.company_id = p_company and s.active and s.deleted_at is null
      and public.wa_digits(s.phone) <> '';
    if found then
      insert into public.whatsapp_leads (company_id, rotation_id, seller_id, phone, car_id, page, is_returning)
      values (p_company, null, v_seller, v_phone, v_car, left(coalesce(p_page, ''), 200), false);
      return jsonb_build_object('phone', v_phone, 'entry_id', null, 'mode', 'carro', 'sticky_days', v_sticky);
    end if;
    v_seller := null;
    v_phone := null;
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

-- 50) Conferência: passou para a seção 52, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 51) Modelos de contrato da entrada do veículo ----------------------------------
-- contract_templates.kind: 'venda' (aparece na tela Contratos) ou 'entrada'
-- (aparece no cadastro do carro, para a compra do particular, a consignação
-- etc., com os dados do dono do carro — seção 49). O admin troca na lista de
-- modelos (a regra de update da seção 47 já é só do admin).
alter table public.contract_templates add column if not exists kind text not null default 'venda';
alter table public.contract_templates drop constraint if exists contract_templates_kind_check;
alter table public.contract_templates add constraint contract_templates_kind_check check (kind in ('venda', 'entrada'));

-- 52) Conferência: passou para a seção 54, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 53) Assinatura digital dos contratos (Autentique) ------------------------------
-- * signature_requests: cada contrato mandado para assinar, de venda (tela
--   Contratos) ou de entrada (cadastro do carro), com a situação de cada
--   assinante. Quem grava é só a Edge Function "assinaturas", com a chave de
--   serviço. A equipe só lê, então ninguém marca "assinado" à mão. Quem vê
--   segue a regra dos contratos: admin e gerente veem todos, o vendedor só os
--   que ele mandou.
-- * A conta da Autentique é uma só, da WB.Dev. A loja de demonstração
--   (is_demo) manda em modo de teste, sem custo e sem validade.
-- * Quando todos assinam, a função guarda o PDF assinado na ficha do cliente
--   (customer_documents): tipo 'compra' na venda e 'entrada' (novo) na entrada.
-- * signature_team(): quem pode assinar pela loja (equipe ativa com e-mail,
--   fora os logins da WB.Dev). Usada na lista "Pela loja", porque o vendedor não
--   lê a tabela sellers inteira.
-- * platform_rows conta os envios por loja ("Assinaturas digitais" no uso das
--   funções da Plataforma e do Desempenho).

alter table public.customer_documents drop constraint if exists customer_documents_doc_type_check;
alter table public.customer_documents add constraint customer_documents_doc_type_check
  check (doc_type in ('compra', 'entrada', 'entrega', 'pos_venda', 'garantia', 'financiamento', 'outro'));

create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null default 'venda' check (kind in ('venda', 'entrada')),
  contract_id uuid references public.contracts(id) on delete set null,
  car_id uuid references public.cars(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null default '',
  file_name text not null default '',
  provider text not null default 'autentique',
  external_id text,
  sandbox boolean not null default false,
  status text not null default 'enviado' check (status in ('enviado', 'assinado', 'recusado', 'cancelado')),
  -- [{ role: cliente|dono|loja|testemunha, name, email, public_id, viewed_at, signed_at, rejected_at, reason }]
  signers jsonb not null default '[]' check (jsonb_typeof(signers) = 'array'),
  signed_document_id uuid references public.customer_documents(id) on delete set null,
  sent_by uuid default auth.uid() references auth.users(id) on delete set null,
  finished_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signature_requests_company_id_idx on public.signature_requests (company_id);
create index if not exists signature_requests_contract_id_idx on public.signature_requests (contract_id);
create index if not exists signature_requests_car_id_idx on public.signature_requests (car_id);
create index if not exists signature_requests_customer_id_idx on public.signature_requests (customer_id);
create unique index if not exists signature_requests_external_idx on public.signature_requests (provider, external_id);

drop trigger if exists signature_requests_set_updated_at on public.signature_requests;
create trigger signature_requests_set_updated_at
before update on public.signature_requests
for each row execute function public.set_updated_at();

-- Carro e cliente da mesma loja (regra geral) + contrato e via assinada
drop trigger if exists signature_requests_check_company_refs on public.signature_requests;
create trigger signature_requests_check_company_refs before insert or update on public.signature_requests
for each row execute function public.check_company_refs();

create or replace function public.signature_requests_check_refs()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.contract_id is not null
     and not exists (select 1 from public.contracts where id = new.contract_id and company_id = new.company_id) then
    raise exception 'Contrato não encontrado nesta loja' using errcode = '23503';
  end if;
  if new.signed_document_id is not null
     and not exists (select 1 from public.customer_documents where id = new.signed_document_id and company_id = new.company_id) then
    raise exception 'Documento não encontrado nesta loja' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists signature_requests_check_refs on public.signature_requests;
create trigger signature_requests_check_refs before insert or update on public.signature_requests
for each row execute function public.signature_requests_check_refs();

alter table public.signature_requests enable row level security;
revoke insert, update, delete on public.signature_requests from anon, authenticated;

drop policy if exists "Team can read signature requests" on public.signature_requests;
create policy "Team can read signature requests"
on public.signature_requests for select
to authenticated
using (company_id = public.current_company_id() and (public.is_company_staff() or sent_by = auth.uid()));

-- Quem pode assinar pela loja: equipe ativa com e-mail (o do cadastro na
-- Equipe ou, sem ele, o do login), sem repetir e-mail, fora a equipe WB.Dev
create or replace function public.signature_team()
returns table (name text, email text, role text)
language sql stable security definer set search_path = public
as $$
  select t.name, t.email, t.role
  from (
    select distinct on (x.email) x.name, x.email, x.role
    from (
      select s.name, lower(trim(s.email)) as email, coalesce(uc.role, s.role) as role, 1 as pri
      from public.sellers s
      left join public.user_company uc on uc.user_id = s.user_id and uc.company_id = s.company_id
      where s.company_id = public.current_company_id()
        and s.active and s.deleted_at is null and trim(s.email) <> ''
        and not exists (select 1 from public.platform_team pt where pt.user_id = s.user_id)
      union all
      select coalesce(nullif(trim(s.name), ''), split_part(u.email, '@', 1)), lower(trim(u.email)), uc.role, 2
      from public.user_company uc
      join auth.users u on u.id = uc.user_id
      left join public.sellers s on s.user_id = uc.user_id and s.company_id = uc.company_id
      where uc.company_id = public.current_company_id()
        and (s.id is null or (s.active and s.deleted_at is null))
        and coalesce(trim(u.email), '') <> ''
        and not exists (select 1 from public.platform_team pt where pt.user_id = uc.user_id)
    ) x
    order by x.email, x.pri
  ) t
  where public.current_company_id() is not null
  order by t.name
$$;
revoke execute on function public.signature_team() from anon, public;
grant execute on function public.signature_team() to authenticated;

-- Contador por loja: envios para assinar no uso das funções
create or replace function public.platform_rows(p_start date, p_end date, p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prev_start date;
  v_prev_end date;
  v_result jsonb;
begin
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  v_prev_end := p_start - 1;
  v_prev_start := p_start - (p_end - p_start + 1);

  select coalesce(jsonb_agg(s.store order by s.is_demo, s.name), '[]'::jsonb) into v_result
  from (
    select c.is_demo, c.name, jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'site_url', c.site_url,
      'is_demo', c.is_demo,
      'created_at', c.created_at,
      'stock_alert_days', c.stock_alert_days,
      'whatsapp_mode', c.whatsapp_mode,
      'whatsapp_ok', c.whatsapp_main <> '',
      'settings_customized', c.panel_settings <> '{}'::jsonb,
      'site', (
        select jsonb_build_object(
          'visits', coalesce(sum(v.visits) filter (where v.day between p_start and p_end), 0),
          'visitors', coalesce(sum(v.visitors) filter (where v.day between p_start and p_end), 0),
          'visits_prev', coalesce(sum(v.visits) filter (where v.day between v_prev_start and v_prev_end), 0),
          'visitors_prev', coalesce(sum(v.visitors) filter (where v.day between v_prev_start and v_prev_end), 0))
        from public.site_visits_daily v
        where v.company_id = c.id and v.day between v_prev_start and p_end),
      'car_views', (
        select jsonb_build_object(
          'views', coalesce(sum(x.views) filter (where x.day between p_start and p_end), 0),
          'views_prev', coalesce(sum(x.views) filter (where x.day between v_prev_start and v_prev_end), 0))
        from public.car_views_daily x
        where x.company_id = c.id and x.day between v_prev_start and p_end),
      'leads', (
        select jsonb_build_object(
          'total', count(*) filter (where d between p_start and p_end),
          'prev', count(*) filter (where d between v_prev_start and v_prev_end))
        from (select (l.created_at at time zone 'America/Fortaleza')::date as d
              from public.whatsapp_leads l where l.company_id = c.id) l),
      'stock', (
        select jsonb_build_object(
          'available', count(*) filter (where k.status = 'disponivel' and not k.hidden),
          'reserved', count(*) filter (where k.status = 'reservado'),
          'maintenance', count(*) filter (where k.status = 'manutencao'),
          'hidden', count(*) filter (where k.hidden and k.status <> 'vendido'),
          'in_stock', count(*) filter (where k.status <> 'vendido'),
          'no_photo', count(*) filter (where k.status = 'disponivel' and not k.hidden
                                         and jsonb_array_length(coalesce(k.images, '[]'::jsonb)) = 0),
          'stale', count(*) filter (where k.status = 'disponivel'
                                      and current_date - coalesce(k.purchase_date, (k.created_at at time zone 'America/Fortaleza')::date) > c.stock_alert_days),
          'added', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between p_start and p_end),
          'added_prev', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between v_prev_start and v_prev_end),
          'last_added_at', max(k.created_at),
          'last_updated_at', max(k.updated_at))
        from public.cars k
        where k.company_id = c.id),
      'sales', (
        select jsonb_build_object(
          'sold', count(*) filter (where x.sale_date between p_start and p_end),
          'sold_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end),
          'sold_site', count(*) filter (where x.sale_date between p_start and p_end and x.from_site),
          'sold_site_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end and x.from_site),
          'total', count(*))
        from (
          select s.sale_date, exists (
            select 1 from public.whatsapp_leads l
            where l.company_id = s.company_id and l.car_id = s.car_id
              and (l.created_at at time zone 'America/Fortaleza')::date <= s.sale_date) as from_site
          from public.sales s
          where s.company_id = c.id) x),
      'usage', (
        select jsonb_build_object(
          'last_activity_at', max(a.created_at),
          'last_work_at', max(a.created_at) filter (where a.entity <> 'auth'),
          'activities', count(*) filter (where a.entity <> 'auth' and a.d between p_start and p_end),
          'activities_prev', count(*) filter (where a.entity <> 'auth' and a.d between v_prev_start and v_prev_end),
          'logins', count(*) filter (where a.entity = 'auth' and a.d between p_start and p_end),
          'active_users', count(distinct a.user_id) filter (where a.d between p_start and p_end),
          'active_days', count(distinct a.d) filter (where a.entity <> 'auth' and a.d between p_start and p_end))
        from (select x.*, (x.created_at at time zone 'America/Fortaleza')::date as d
              from public.activity_log x where x.company_id = c.id) a),
      'last_login_at', (
        select max(u.last_sign_in_at)
        from public.user_company uc join auth.users u on u.id = uc.user_id
        where uc.company_id = c.id),
      'team', jsonb_build_object(
        'admins', (select count(*) from public.user_company uc where uc.company_id = c.id and uc.role = 'admin'),
        'managers', (select count(*) from public.sellers t
                     where t.company_id = c.id and t.role = 'manager' and t.active and t.deleted_at is null),
        'sellers', (select count(*) from public.sellers t
                    where t.company_id = c.id and t.role = 'seller' and t.active and t.deleted_at is null)),
      'features', jsonb_build_object(
        'customers', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customers x where x.company_id = c.id),
        'customer_contacts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_contacts x where x.company_id = c.id),
        'customer_interests', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_interests x where x.company_id = c.id),
        'reservations', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_reservations x where x.company_id = c.id),
        'contracts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contracts x where x.company_id = c.id),
        'contract_templates', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contract_templates x where x.company_id = c.id),
        'financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_financings x where x.company_id = c.id),
        'external_financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.external_financings x where x.company_id = c.id),
        'expenses', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_expenses x where x.company_id = c.id),
        'customer_documents', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_documents x where x.company_id = c.id),
        'signatures', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.signature_requests x where x.company_id = c.id),
        'sales', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where x.sale_date between p_start and p_end)) from public.sales x where x.company_id = c.id),
        'rotation', (select jsonb_build_object('total', count(*) filter (where x.active), 'period', 0) from public.whatsapp_rotation x where x.company_id = c.id))
    ) as store
    from public.companies c
    where p_company is null or c.id = p_company
  ) s;

  return v_result;
end $$;
revoke execute on function public.platform_rows(date, date, uuid) from anon, authenticated, public;

-- 54) Conferência: passou para a seção 56, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 55) RENAVE: entrada e saída de cada carro no estoque ----------------------------
-- Resolução Contran 1.026/2026: a loja registra no RENAVE a entrada e a saída de
-- cada veículo, por uma integradora autorizada. Enquanto a integração com a
-- integradora não fica pronta, a equipe marca aqui a situação, a data e o
-- protocolo, e o painel avisa o que falta (pendências do início e filtro no
-- estoque). Situação: 'pendente', 'registrado' ou 'dispensado' (não precisa).
-- A saída só conta como pendente depois de vendido, e o painel ignora os carros
-- vendidos antes de 28/09/2026 (fim do prazo da resolução; regra em
-- utils/renave.js), sem precisar mexer nos dados. O site público não lê estas
-- colunas (fora da lista do "anon").
alter table public.cars add column if not exists renave_entry_status text not null default 'pendente';
alter table public.cars add column if not exists renave_exit_status text not null default 'pendente';
alter table public.cars add column if not exists renave_entry_on date;
alter table public.cars add column if not exists renave_entry_protocol text not null default '';
alter table public.cars add column if not exists renave_exit_on date;
alter table public.cars add column if not exists renave_exit_protocol text not null default '';

alter table public.cars drop constraint if exists cars_renave_entry_status_check;
alter table public.cars add constraint cars_renave_entry_status_check
  check (renave_entry_status in ('pendente', 'registrado', 'dispensado'));
alter table public.cars drop constraint if exists cars_renave_exit_status_check;
alter table public.cars add constraint cars_renave_exit_status_check
  check (renave_exit_status in ('pendente', 'registrado', 'dispensado'));

-- Estoque da equipe (admin, gerente e vendedor): tudo menos o custo de compra.
drop view if exists public.staff_cars;
create view public.staff_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, documents, customer_id, stock_alert_days,
  company_id, created_at, updated_at, internal_notes, intake_items, inspection,
  entry_type, owner_customer_id, whatsapp_seller_id,
  renave_entry_status, renave_entry_on, renave_entry_protocol,
  renave_exit_status, renave_exit_on, renave_exit_protocol
from public.cars
where company_id = public.current_company_id() and public.can_edit_stock()
with local check option;

revoke all on public.staff_cars from anon, authenticated, public;
grant select, insert, update on public.staff_cars to authenticated;

-- 56) Conferência: passou para a seção 58, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 57) Dados fiscais da loja e endereço do cliente em partes ----------------------
-- Preparação da NF-e (emissora Focus NFe, conta da WB.Dev; decisão de 06/10/2026):
-- * companies.fiscal: razão social, CNPJ, Inscrição Estadual, regime (CRT da
--   NF-e: 1 Simples Nacional, 2 Simples com excesso de sublimite, 3 Regime
--   Normal, 4 MEI), endereço completo, telefone e e-mail da loja. Só o admin
--   grava (save_company_fiscal, que confere CNPJ, CEP, UF e código IBGE); a
--   equipe lê, e os documentos (contrato, termo de entrega, recibo) usam estes
--   dados no lugar dos guardados no navegador. O site público não lê companies.
-- * customers.address_parts: CEP, rua, número, complemento, bairro, cidade,
--   código IBGE e UF do cliente, que a nota exige. O painel continua gravando o
--   endereço completo em "address" (usado nos contratos).
alter table public.companies add column if not exists fiscal jsonb not null default '{}';
alter table public.companies drop constraint if exists companies_fiscal_check;
alter table public.companies add constraint companies_fiscal_check check (jsonb_typeof(fiscal) = 'object');

alter table public.customers add column if not exists address_parts jsonb not null default '{}';
alter table public.customers drop constraint if exists customers_address_parts_check;
alter table public.customers add constraint customers_address_parts_check check (jsonb_typeof(address_parts) = 'object');

create or replace function public.save_company_fiscal(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v jsonb := '{}'::jsonb;
  v_key text;
  v_text text;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador altera os dados fiscais' using errcode = '42501';
  end if;
  -- Só as chaves conhecidas, sem espaços sobrando; vazio não é guardado
  foreach v_key in array array['legal_name', 'trade_name', 'cnpj', 'ie', 'crt', 'zip', 'street', 'number', 'complement',
                               'district', 'city', 'city_code', 'state', 'phone', 'email'] loop
    v_text := left(btrim(coalesce(p->>v_key, '')), 160);
    if v_key in ('cnpj', 'zip', 'city_code') then v_text := regexp_replace(v_text, '\D', '', 'g'); end if;
    if v_key = 'ie' and upper(v_text) <> 'ISENTO' then v_text := regexp_replace(v_text, '\D', '', 'g'); end if;
    if v_key in ('state', 'ie') then v_text := upper(v_text); end if;
    if v_text <> '' then v := v || jsonb_build_object(v_key, v_text); end if;
  end loop;
  if v ? 'cnpj' and length(v->>'cnpj') <> 14 then raise exception 'CNPJ precisa ter 14 números' using errcode = '22023'; end if;
  if v ? 'zip' and length(v->>'zip') <> 8 then raise exception 'CEP precisa ter 8 números' using errcode = '22023'; end if;
  if v ? 'city_code' and length(v->>'city_code') <> 7 then raise exception 'Código IBGE da cidade precisa ter 7 números' using errcode = '22023'; end if;
  if v ? 'state' and (v->>'state') !~ '^[A-Z]{2}$' then raise exception 'UF inválida' using errcode = '22023'; end if;
  if v ? 'crt' and (v->>'crt') not in ('1', '2', '3', '4') then raise exception 'Regime inválido' using errcode = '22023'; end if;

  update public.companies set fiscal = v where id = v_company;
  insert into public.activity_log (company_id, user_id, user_email, action, entity, label, details)
  values (v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'update', 'companies',
          'Dados fiscais da loja', '');
  return v;
end;
$$;
revoke execute on function public.save_company_fiscal(jsonb) from anon, public;
grant execute on function public.save_company_fiscal(jsonb) to authenticated;

-- 58) Conferência: passou para a seção 60, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 59) Publicação automática na OLX (aba Portais) -----------------------------------
-- Integração homologada pela OLX em 06/10/2026 (aplicativo da WB.Dev). Cada loja
-- autoriza a WB.Dev na conta OLX dela (OAuth; a OLX exige plano Empresa) e o
-- sistema publica sozinho os carros disponíveis, visíveis no site, fora do
-- repasse e marcados "Publicar na OLX"; o que deixa de estar à venda sai sozinho.
-- Quem fala com a OLX é só a Edge Function "olx-oauth" (nome fixo da URI de
-- retorno cadastrada), com a chave de serviço.
-- * cars.olx_publish (marcado por padrão) e cars.olx_catalog (marca, modelo e
--   versão do catálogo da OLX e, na moto, a cilindrada): a equipe do estoque
--   grava como o resto do carro (staff_cars). O site público não lê.
-- * olx_accounts: o token de acesso da conta OLX da loja. Ninguém lê pela API
--   (RLS sem política). A tela usa olx_account_info() (sem o token) e o admin
--   grava os ajustes e a publicação automática por save_olx_settings().
-- * olx_oauth_states: o "state" do login na OLX (uso único, 15 minutos).
-- * olx_ads: um por carro enviado (id mandado à OLX, situação, link, motivo).
--   A equipe do estoque lê; só a função grava. Carro excluído deixa a linha sem
--   carro, para a função ainda tirar o anúncio do ar.
-- * olx_catalog: cache do catálogo da OLX (o mesmo para todas as lojas).
--   olx_state: hora da última rodada automática.
-- * Rodada automática a cada 10 minutos (pg_cron + pg_net chamando a função);
--   o bloco só roda onde as extensões existem (o banco de teste pula).
-- * A aba "portais" entra nos planos que já têm o Estoque; platform_rows conta
--   os anúncios ("Anúncios na OLX" no uso das funções).

alter table public.cars add column if not exists olx_publish boolean not null default true;
alter table public.cars add column if not exists olx_catalog jsonb not null default '{}';
alter table public.cars drop constraint if exists cars_olx_catalog_check;
alter table public.cars add constraint cars_olx_catalog_check check (jsonb_typeof(olx_catalog) = 'object');

-- Estoque da equipe (admin, gerente e vendedor): tudo menos o custo de compra.
drop view if exists public.staff_cars;
create view public.staff_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, documents, customer_id, stock_alert_days,
  company_id, created_at, updated_at, internal_notes, intake_items, inspection,
  entry_type, owner_customer_id, whatsapp_seller_id,
  renave_entry_status, renave_entry_on, renave_entry_protocol,
  renave_exit_status, renave_exit_on, renave_exit_protocol,
  olx_publish, olx_catalog
from public.cars
where company_id = public.current_company_id() and public.can_edit_stock()
with local check option;

revoke all on public.staff_cars from anon, authenticated, public;
grant select, insert, update on public.staff_cars to authenticated;

create table if not exists public.olx_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  access_token text not null,
  scope text not null default '',
  user_name text not null default '',
  user_email text not null default '',
  status text not null default 'conectada' check (status in ('conectada', 'sem_plano', 'erro')),
  status_detail text not null default '',
  auto_publish boolean not null default false,
  -- { publish_default: boolean, footer: texto no fim da descrição, exchange: 'sim' | 'nao' | '' }
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_list_at timestamptz,
  sync_lock_until timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists olx_accounts_set_updated_at on public.olx_accounts;
create trigger olx_accounts_set_updated_at
before update on public.olx_accounts
for each row execute function public.set_updated_at();

alter table public.olx_accounts enable row level security;
revoke all on public.olx_accounts from anon, authenticated;

create table if not exists public.olx_oauth_states (
  state text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  return_url text not null default '',
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.olx_oauth_states enable row level security;
revoke all on public.olx_oauth_states from anon, authenticated;

create table if not exists public.olx_ads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  car_id uuid references public.cars(id) on delete set null,
  ad_id text not null check (ad_id ~ '^[A-Za-z0-9_{}-]{1,19}$'),
  category integer,
  operation text not null default 'insert' check (operation in ('insert', 'delete')),
  status text not null default 'pendente' check (status in ('pendente', 'aguardando', 'publicado', 'recusado', 'erro',
    'sem_vaga', 'removendo', 'removido', 'removido_olx', 'expirado', 'simulado')),
  list_id text,
  url text not null default '',
  message text not null default '',
  errors jsonb not null default '[]' check (jsonb_typeof(errors) = 'array'),
  payload jsonb,
  payload_hash text not null default '',
  import_token text,
  attempts integer not null default 0,
  sent_at timestamptz,
  checked_at timestamptz,
  published_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, ad_id)
);

create unique index if not exists olx_ads_car_id_idx on public.olx_ads (car_id) where car_id is not null;
create index if not exists olx_ads_company_id_idx on public.olx_ads (company_id, status);

drop trigger if exists olx_ads_set_updated_at on public.olx_ads;
create trigger olx_ads_set_updated_at
before update on public.olx_ads
for each row execute function public.set_updated_at();

-- O carro tem que ser da mesma loja (regra geral)
drop trigger if exists olx_ads_check_company_refs on public.olx_ads;
create trigger olx_ads_check_company_refs before insert or update on public.olx_ads
for each row execute function public.check_company_refs();

alter table public.olx_ads enable row level security;
revoke insert, update, delete on public.olx_ads from anon, authenticated;

drop policy if exists "Stock team can read OLX ads" on public.olx_ads;
create policy "Stock team can read OLX ads"
on public.olx_ads for select
to authenticated
using (company_id = public.current_company_id() and public.can_edit_stock());

create table if not exists public.olx_catalog (
  path text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.olx_catalog enable row level security;
revoke all on public.olx_catalog from anon, authenticated;

create table if not exists public.olx_state (
  id integer primary key default 1 check (id = 1),
  last_round_at timestamptz not null default '1970-01-01'
);
insert into public.olx_state (id) values (1) on conflict (id) do nothing;

alter table public.olx_state enable row level security;
revoke all on public.olx_state from anon, authenticated;

-- Situação da conta OLX da loja para a equipe do estoque (sem o token). Com a
-- loja ainda sem conta: { connected: false } e os dados que a tela precisa.
create or replace function public.olx_account_info()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when public.current_company_id() is null or not public.can_edit_stock() then null
  else (
    select jsonb_build_object(
      'connected', a.company_id is not null,
      'user_name', coalesce(a.user_name, ''),
      'user_email', coalesce(a.user_email, ''),
      'status', coalesce(a.status, ''),
      'status_detail', coalesce(a.status_detail, ''),
      'auto_publish', coalesce(a.auto_publish, false),
      'settings', coalesce(a.settings, '{}'::jsonb),
      'connected_at', a.connected_at,
      'last_sync_at', a.last_sync_at,
      'is_demo', c.is_demo,
      'site_url', c.site_url,
      'zip', coalesce(c.fiscal ->> 'zip', ''),
      'main_phone', c.whatsapp_main)
    from public.companies c
    left join public.olx_accounts a on a.company_id = c.id
    where c.id = public.current_company_id())
  end
$$;
revoke execute on function public.olx_account_info() from anon, public;
grant execute on function public.olx_account_info() to authenticated;

-- Ajustes da OLX (só admin, com a conta conectada): carros novos marcados,
-- texto no fim da descrição, "aceita troca" e a publicação automática
create or replace function public.save_olx_settings(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_acc public.olx_accounts;
  v_settings jsonb;
  v_auto boolean;
  v_footer text;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador altera os ajustes da OLX' using errcode = '42501';
  end if;
  select * into v_acc from public.olx_accounts where company_id = v_company for update;
  if not found then
    raise exception 'Conecte a conta da OLX primeiro' using errcode = 'P0002';
  end if;
  v_settings := v_acc.settings;
  v_auto := v_acc.auto_publish;
  if p ? 'publish_default' then
    if jsonb_typeof(p -> 'publish_default') <> 'boolean' then raise exception 'Ajuste inválido' using errcode = '22023'; end if;
    v_settings := v_settings || jsonb_build_object('publish_default', (p ->> 'publish_default')::boolean);
  end if;
  if p ? 'footer' then
    v_footer := btrim(coalesce(p ->> 'footer', ''));
    if char_length(v_footer) > 1000 then
      raise exception 'O texto do fim da descrição pode ter até 1.000 caracteres' using errcode = '22023';
    end if;
    v_settings := v_settings || jsonb_build_object('footer', v_footer);
  end if;
  if p ? 'exchange' then
    if coalesce(p ->> 'exchange', '') not in ('', 'sim', 'nao') then raise exception 'Ajuste inválido' using errcode = '22023'; end if;
    v_settings := v_settings || jsonb_build_object('exchange', coalesce(p ->> 'exchange', ''));
  end if;
  if p ? 'auto_publish' then
    if jsonb_typeof(p -> 'auto_publish') <> 'boolean' then raise exception 'Ajuste inválido' using errcode = '22023'; end if;
    v_auto := (p ->> 'auto_publish')::boolean;
  end if;

  update public.olx_accounts set settings = v_settings, auto_publish = v_auto where company_id = v_company;
  if v_auto is distinct from v_acc.auto_publish then
    insert into public.activity_log (company_id, user_id, user_email, action, entity, label, details)
    values (v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'update', 'olx',
            case when v_auto then 'Ligou a publicação automática na OLX' else 'Desligou a publicação automática na OLX' end, '');
  end if;
  return public.olx_account_info();
end;
$$;
revoke execute on function public.save_olx_settings(jsonb) from anon, public;
grant execute on function public.save_olx_settings(jsonb) to authenticated;

-- A aba Portais entra nos planos que já têm o Estoque (em Planos dá para tirar)
update public.plans set features = array_append(features, 'portais')
where 'estoque' = any(features) and not ('portais' = any(features));

-- Contador por loja: anúncios no ar na OLX (uso das funções)
create or replace function public.platform_rows(p_start date, p_end date, p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prev_start date;
  v_prev_end date;
  v_result jsonb;
begin
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  v_prev_end := p_start - 1;
  v_prev_start := p_start - (p_end - p_start + 1);

  select coalesce(jsonb_agg(s.store order by s.is_demo, s.name), '[]'::jsonb) into v_result
  from (
    select c.is_demo, c.name, jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'site_url', c.site_url,
      'is_demo', c.is_demo,
      'created_at', c.created_at,
      'stock_alert_days', c.stock_alert_days,
      'whatsapp_mode', c.whatsapp_mode,
      'whatsapp_ok', c.whatsapp_main <> '',
      'settings_customized', c.panel_settings <> '{}'::jsonb,
      'site', (
        select jsonb_build_object(
          'visits', coalesce(sum(v.visits) filter (where v.day between p_start and p_end), 0),
          'visitors', coalesce(sum(v.visitors) filter (where v.day between p_start and p_end), 0),
          'visits_prev', coalesce(sum(v.visits) filter (where v.day between v_prev_start and v_prev_end), 0),
          'visitors_prev', coalesce(sum(v.visitors) filter (where v.day between v_prev_start and v_prev_end), 0))
        from public.site_visits_daily v
        where v.company_id = c.id and v.day between v_prev_start and p_end),
      'car_views', (
        select jsonb_build_object(
          'views', coalesce(sum(x.views) filter (where x.day between p_start and p_end), 0),
          'views_prev', coalesce(sum(x.views) filter (where x.day between v_prev_start and v_prev_end), 0))
        from public.car_views_daily x
        where x.company_id = c.id and x.day between v_prev_start and p_end),
      'leads', (
        select jsonb_build_object(
          'total', count(*) filter (where d between p_start and p_end),
          'prev', count(*) filter (where d between v_prev_start and v_prev_end))
        from (select (l.created_at at time zone 'America/Fortaleza')::date as d
              from public.whatsapp_leads l where l.company_id = c.id) l),
      'stock', (
        select jsonb_build_object(
          'available', count(*) filter (where k.status = 'disponivel' and not k.hidden),
          'reserved', count(*) filter (where k.status = 'reservado'),
          'maintenance', count(*) filter (where k.status = 'manutencao'),
          'hidden', count(*) filter (where k.hidden and k.status <> 'vendido'),
          'in_stock', count(*) filter (where k.status <> 'vendido'),
          'no_photo', count(*) filter (where k.status = 'disponivel' and not k.hidden
                                         and jsonb_array_length(coalesce(k.images, '[]'::jsonb)) = 0),
          'stale', count(*) filter (where k.status = 'disponivel'
                                      and current_date - coalesce(k.purchase_date, (k.created_at at time zone 'America/Fortaleza')::date) > c.stock_alert_days),
          'added', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between p_start and p_end),
          'added_prev', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between v_prev_start and v_prev_end),
          'last_added_at', max(k.created_at),
          'last_updated_at', max(k.updated_at))
        from public.cars k
        where k.company_id = c.id),
      'sales', (
        select jsonb_build_object(
          'sold', count(*) filter (where x.sale_date between p_start and p_end),
          'sold_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end),
          'sold_site', count(*) filter (where x.sale_date between p_start and p_end and x.from_site),
          'sold_site_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end and x.from_site),
          'total', count(*))
        from (
          select s.sale_date, exists (
            select 1 from public.whatsapp_leads l
            where l.company_id = s.company_id and l.car_id = s.car_id
              and (l.created_at at time zone 'America/Fortaleza')::date <= s.sale_date) as from_site
          from public.sales s
          where s.company_id = c.id) x),
      'usage', (
        select jsonb_build_object(
          'last_activity_at', max(a.created_at),
          'last_work_at', max(a.created_at) filter (where a.entity <> 'auth'),
          'activities', count(*) filter (where a.entity <> 'auth' and a.d between p_start and p_end),
          'activities_prev', count(*) filter (where a.entity <> 'auth' and a.d between v_prev_start and v_prev_end),
          'logins', count(*) filter (where a.entity = 'auth' and a.d between p_start and p_end),
          'active_users', count(distinct a.user_id) filter (where a.d between p_start and p_end),
          'active_days', count(distinct a.d) filter (where a.entity <> 'auth' and a.d between p_start and p_end))
        from (select x.*, (x.created_at at time zone 'America/Fortaleza')::date as d
              from public.activity_log x where x.company_id = c.id) a),
      'last_login_at', (
        select max(u.last_sign_in_at)
        from public.user_company uc join auth.users u on u.id = uc.user_id
        where uc.company_id = c.id),
      'team', jsonb_build_object(
        'admins', (select count(*) from public.user_company uc where uc.company_id = c.id and uc.role = 'admin'),
        'managers', (select count(*) from public.sellers t
                     where t.company_id = c.id and t.role = 'manager' and t.active and t.deleted_at is null),
        'sellers', (select count(*) from public.sellers t
                    where t.company_id = c.id and t.role = 'seller' and t.active and t.deleted_at is null)),
      'features', jsonb_build_object(
        'customers', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customers x where x.company_id = c.id),
        'customer_contacts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_contacts x where x.company_id = c.id),
        'customer_interests', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_interests x where x.company_id = c.id),
        'reservations', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_reservations x where x.company_id = c.id),
        'contracts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contracts x where x.company_id = c.id),
        'contract_templates', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contract_templates x where x.company_id = c.id),
        'financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_financings x where x.company_id = c.id),
        'external_financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.external_financings x where x.company_id = c.id),
        'expenses', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_expenses x where x.company_id = c.id),
        'customer_documents', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_documents x where x.company_id = c.id),
        'signatures', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.signature_requests x where x.company_id = c.id),
        'olx', (select jsonb_build_object('total', count(*) filter (where x.status in ('publicado', 'aguardando')), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.olx_ads x where x.company_id = c.id),
        'sales', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where x.sale_date between p_start and p_end)) from public.sales x where x.company_id = c.id),
        'rotation', (select jsonb_build_object('total', count(*) filter (where x.active), 'period', 0) from public.whatsapp_rotation x where x.company_id = c.id))
    ) as store
    from public.companies c
    where p_company is null or c.id = p_company
  ) s;

  return v_result;
end $$;
revoke execute on function public.platform_rows(date, date, uuid) from anon, authenticated, public;

-- Rodada automática a cada 10 minutos (só no Supabase, onde há pg_cron e pg_net)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('olx-rodada', '*/10 * * * *', $job$
      select net.http_post(
        url := 'https://pifqnbdmaytlhmdfnipz.supabase.co/functions/v1/olx-oauth',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{"action": "rodada"}'::jsonb,
        timeout_milliseconds := 120000)
    $job$);
  end if;
end $$;

-- 60) Conferência: passou para a seção 62, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 61) Publicação automática na Webmotors (aba Portais) ------------------------------
-- As mesmas regras da OLX (decisão do Wesley em 06/10/2026): vão os carros
-- disponíveis, visíveis no site, fora do repasse e marcados "Publicar na
-- Webmotors"; o que deixa de estar à venda sai sozinho. Só carros: a moto usa
-- outro serviço da Webmotors. A loja pede à Webmotors um "usuário de
-- integração" (CNPJ, e-mail e senha) e o admin digita em Portais. Quem fala com
-- a Webmotors (API SOAP) é só a Edge Function "webmotors", com a chave de serviço.
-- * cars.webmotors_publish (marcado por padrão) e cars.webmotors_catalog (marca,
--   modelo e versão da Webmotors e, se a pessoa escolher, cor, câmbio e
--   combustível): a equipe do estoque grava como o resto do carro (staff_cars).
--   O site público não lê.
-- * wm_accounts: o usuário de integração da loja e a sessão na Webmotors (o hash
--   vale 1000 minutos). Ninguém lê pela API (RLS sem política). A senha fica
--   cifrada no Vault do Supabase (segredo "webmotors-<id da loja>"), por funções
--   que só a chave de serviço chama. A tela usa webmotors_account_info() e o
--   admin grava os ajustes, a modalidade do plano e a publicação automática por
--   save_webmotors_settings().
-- * wm_ads: um por carro (código do anúncio na Webmotors, situação, motivo e as
--   fotos enviadas, com o código de cada uma). A equipe do estoque lê; só a
--   função grava. Carro excluído deixa a linha sem carro, para a função ainda
--   tirar o anúncio do ar.
-- * wm_catalog: cache das listas da Webmotors (as mesmas para todas as lojas).
--   wm_state: hora da última rodada automática.
-- * Rodada automática a cada 10 minutos (pg_cron + pg_net chamando a função), 5
--   minutos depois da rodada da OLX; o bloco só roda onde as extensões existem.
-- * platform_rows conta os anúncios ("Anúncios na Webmotors" no uso das funções).

alter table public.cars add column if not exists webmotors_publish boolean not null default true;
alter table public.cars add column if not exists webmotors_catalog jsonb not null default '{}';
alter table public.cars drop constraint if exists cars_webmotors_catalog_check;
alter table public.cars add constraint cars_webmotors_catalog_check check (jsonb_typeof(webmotors_catalog) = 'object');

-- Estoque da equipe (admin, gerente e vendedor): tudo menos o custo de compra.
drop view if exists public.staff_cars;
create view public.staff_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, documents, customer_id, stock_alert_days,
  company_id, created_at, updated_at, internal_notes, intake_items, inspection,
  entry_type, owner_customer_id, whatsapp_seller_id,
  renave_entry_status, renave_entry_on, renave_entry_protocol,
  renave_exit_status, renave_exit_on, renave_exit_protocol,
  olx_publish, olx_catalog, webmotors_publish, webmotors_catalog
from public.cars
where company_id = public.current_company_id() and public.can_edit_stock()
with local check option;

revoke all on public.staff_cars from anon, authenticated, public;
grant select, insert, update on public.staff_cars to authenticated;

-- O Vault guarda a senha do usuário de integração (no Supabase já vem ligado)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    create extension if not exists supabase_vault with schema vault;
  end if;
end $$;

create table if not exists public.wm_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  email text not null default '',
  -- Sessão na Webmotors (HashAutenticacao, vale 1000 minutos) e token do gateway
  session_hash text,
  session_expires_at timestamptz,
  gateway_token text,
  gateway_expires_at timestamptz,
  -- Modalidade do plano usada nos anúncios e a última leitura das modalidades:
  -- [{ code, name, type, total, used, photos }]
  modality_code text not null default '',
  modalities jsonb not null default '[]' check (jsonb_typeof(modalities) = 'array'),
  modalities_at timestamptz,
  status text not null default 'conectada' check (status in ('conectada', 'erro')),
  status_detail text not null default '',
  auto_publish boolean not null default false,
  -- { publish_default: boolean, footer: texto no fim da descrição, exchange: 'sim' | 'nao' | '' }
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_list_at timestamptz,
  sync_lock_until timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists wm_accounts_set_updated_at on public.wm_accounts;
create trigger wm_accounts_set_updated_at
before update on public.wm_accounts
for each row execute function public.set_updated_at();

alter table public.wm_accounts enable row level security;
revoke all on public.wm_accounts from anon, authenticated;

create table if not exists public.wm_ads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  car_id uuid references public.cars(id) on delete set null,
  ad_code bigint check (ad_code > 0),
  status text not null default 'pendente' check (status in ('pendente', 'publicado', 'erro', 'sem_vaga', 'removido',
    'removido_wm', 'simulado')),
  url text not null default '',
  message text not null default '',
  errors jsonb not null default '[]' check (jsonb_typeof(errors) = 'array'),
  payload jsonb,
  payload_hash text not null default '',
  -- Fotos já enviadas, na ordem: [{ url, code }]
  photos jsonb not null default '[]' check (jsonb_typeof(photos) = 'array'),
  attempts integer not null default 0,
  sent_at timestamptz,
  checked_at timestamptz,
  published_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wm_ads_car_id_idx on public.wm_ads (car_id) where car_id is not null;
create unique index if not exists wm_ads_code_idx on public.wm_ads (company_id, ad_code) where ad_code is not null;
create index if not exists wm_ads_company_id_idx on public.wm_ads (company_id, status);

drop trigger if exists wm_ads_set_updated_at on public.wm_ads;
create trigger wm_ads_set_updated_at
before update on public.wm_ads
for each row execute function public.set_updated_at();

-- O carro tem que ser da mesma loja (regra geral)
drop trigger if exists wm_ads_check_company_refs on public.wm_ads;
create trigger wm_ads_check_company_refs before insert or update on public.wm_ads
for each row execute function public.check_company_refs();

alter table public.wm_ads enable row level security;
revoke insert, update, delete on public.wm_ads from anon, authenticated;

drop policy if exists "Stock team can read Webmotors ads" on public.wm_ads;
create policy "Stock team can read Webmotors ads"
on public.wm_ads for select
to authenticated
using (company_id = public.current_company_id() and public.can_edit_stock());

create table if not exists public.wm_catalog (
  path text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.wm_catalog enable row level security;
revoke all on public.wm_catalog from anon, authenticated;

create table if not exists public.wm_state (
  id integer primary key default 1 check (id = 1),
  last_round_at timestamptz not null default '1970-01-01'
);
insert into public.wm_state (id) values (1) on conflict (id) do nothing;

alter table public.wm_state enable row level security;
revoke all on public.wm_state from anon, authenticated;

-- Senha do usuário de integração no Vault (cifrada). Só a chave de serviço (a
-- Edge Function) chama estas três funções.
create or replace function public.wm_save_password(p_company uuid, p_password text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := 'webmotors-' || p_company::text;
  v_id uuid;
begin
  if p_company is null or coalesce(p_password, '') = '' then
    raise exception 'Senha vazia' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_password, v_name, 'Senha do usuário de integração da Webmotors');
  else
    perform vault.update_secret(v_id, p_password);
  end if;
end;
$$;
revoke execute on function public.wm_save_password(uuid, text) from anon, authenticated, public;
grant execute on function public.wm_save_password(uuid, text) to service_role;

create or replace function public.wm_password(p_company uuid)
returns text
language plpgsql stable security definer set search_path = public
as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where name = 'webmotors-' || p_company::text limit 1);
end;
$$;
revoke execute on function public.wm_password(uuid) from anon, authenticated, public;
grant execute on function public.wm_password(uuid) to service_role;

create or replace function public.wm_delete_password(p_company uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'webmotors-' || p_company::text;
  if v_id is null then
    return;
  end if;
  -- Apaga o segredo; se o Vault não deixar apagar, troca a senha por um traço
  begin
    delete from vault.secrets where id = v_id;
  exception when others then
    perform vault.update_secret(v_id, '-');
  end;
end;
$$;
revoke execute on function public.wm_delete_password(uuid) from anon, authenticated, public;
grant execute on function public.wm_delete_password(uuid) to service_role;

-- Situação da conta Webmotors da loja para a equipe do estoque (sem a senha, o
-- hash e o token). Com a loja ainda sem conta: { connected: false } e os dados
-- que a tela precisa (o CNPJ dos dados fiscais vem para preencher o formulário).
create or replace function public.webmotors_account_info()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when public.current_company_id() is null or not public.can_edit_stock() then null
  else (
    select jsonb_build_object(
      'connected', a.company_id is not null,
      'cnpj', coalesce(a.cnpj, ''),
      'email', coalesce(a.email, ''),
      'status', coalesce(a.status, ''),
      'status_detail', coalesce(a.status_detail, ''),
      'auto_publish', coalesce(a.auto_publish, false),
      'settings', coalesce(a.settings, '{}'::jsonb),
      'modality_code', coalesce(a.modality_code, ''),
      'modalities', coalesce(a.modalities, '[]'::jsonb),
      'modalities_at', a.modalities_at,
      'connected_at', a.connected_at,
      'last_sync_at', a.last_sync_at,
      'is_demo', c.is_demo,
      'site_url', c.site_url,
      'fiscal_cnpj', coalesce(c.fiscal ->> 'cnpj', ''))
    from public.companies c
    left join public.wm_accounts a on a.company_id = c.id
    where c.id = public.current_company_id())
  end
$$;
revoke execute on function public.webmotors_account_info() from anon, public;
grant execute on function public.webmotors_account_info() to authenticated;

-- Ajustes da Webmotors (só admin, com a conta conectada): carros novos marcados,
-- texto no fim da descrição, "aceita troca", a modalidade do plano usada nos
-- anúncios e a publicação automática
create or replace function public.save_webmotors_settings(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_acc public.wm_accounts;
  v_settings jsonb;
  v_auto boolean;
  v_modality text;
  v_footer text;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador altera os ajustes da Webmotors' using errcode = '42501';
  end if;
  select * into v_acc from public.wm_accounts where company_id = v_company for update;
  if not found then
    raise exception 'Conecte a Webmotors primeiro' using errcode = 'P0002';
  end if;
  v_settings := v_acc.settings;
  v_auto := v_acc.auto_publish;
  v_modality := v_acc.modality_code;
  if p ? 'publish_default' then
    if jsonb_typeof(p -> 'publish_default') <> 'boolean' then raise exception 'Ajuste inválido' using errcode = '22023'; end if;
    v_settings := v_settings || jsonb_build_object('publish_default', (p ->> 'publish_default')::boolean);
  end if;
  if p ? 'footer' then
    v_footer := btrim(coalesce(p ->> 'footer', ''));
    if char_length(v_footer) > 1000 then
      raise exception 'O texto do fim da descrição pode ter até 1.000 caracteres' using errcode = '22023';
    end if;
    v_settings := v_settings || jsonb_build_object('footer', v_footer);
  end if;
  if p ? 'exchange' then
    if coalesce(p ->> 'exchange', '') not in ('', 'sim', 'nao') then raise exception 'Ajuste inválido' using errcode = '22023'; end if;
    v_settings := v_settings || jsonb_build_object('exchange', coalesce(p ->> 'exchange', ''));
  end if;
  if p ? 'modality_code' then
    v_modality := btrim(coalesce(p ->> 'modality_code', ''));
    if v_modality <> '' and not exists (
      select 1 from jsonb_array_elements(v_acc.modalities) m where m ->> 'code' = v_modality) then
      raise exception 'Modalidade inválida' using errcode = '22023';
    end if;
  end if;
  if p ? 'auto_publish' then
    if jsonb_typeof(p -> 'auto_publish') <> 'boolean' then raise exception 'Ajuste inválido' using errcode = '22023'; end if;
    v_auto := (p ->> 'auto_publish')::boolean;
  end if;

  update public.wm_accounts set settings = v_settings, auto_publish = v_auto, modality_code = v_modality
  where company_id = v_company;
  if v_auto is distinct from v_acc.auto_publish then
    insert into public.activity_log (company_id, user_id, user_email, action, entity, label, details)
    values (v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'update', 'webmotors',
            case when v_auto then 'Ligou a publicação automática na Webmotors' else 'Desligou a publicação automática na Webmotors' end, '');
  end if;
  if v_modality is distinct from v_acc.modality_code then
    insert into public.activity_log (company_id, user_id, user_email, action, entity, label, details)
    values (v_company, auth.uid(), (select email from auth.users where id = auth.uid()), 'update', 'webmotors',
            'Trocou a modalidade do plano da Webmotors', coalesce((
              select m ->> 'name' from jsonb_array_elements(v_acc.modalities) m where m ->> 'code' = v_modality limit 1), ''));
  end if;
  return public.webmotors_account_info();
end;
$$;
revoke execute on function public.save_webmotors_settings(jsonb) from anon, public;
grant execute on function public.save_webmotors_settings(jsonb) to authenticated;

-- Contador por loja: anúncios no ar na Webmotors (uso das funções)
create or replace function public.platform_rows(p_start date, p_end date, p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_prev_start date;
  v_prev_end date;
  v_result jsonb;
begin
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  v_prev_end := p_start - 1;
  v_prev_start := p_start - (p_end - p_start + 1);

  select coalesce(jsonb_agg(s.store order by s.is_demo, s.name), '[]'::jsonb) into v_result
  from (
    select c.is_demo, c.name, jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name,
      'site_url', c.site_url,
      'is_demo', c.is_demo,
      'created_at', c.created_at,
      'stock_alert_days', c.stock_alert_days,
      'whatsapp_mode', c.whatsapp_mode,
      'whatsapp_ok', c.whatsapp_main <> '',
      'settings_customized', c.panel_settings <> '{}'::jsonb,
      'site', (
        select jsonb_build_object(
          'visits', coalesce(sum(v.visits) filter (where v.day between p_start and p_end), 0),
          'visitors', coalesce(sum(v.visitors) filter (where v.day between p_start and p_end), 0),
          'visits_prev', coalesce(sum(v.visits) filter (where v.day between v_prev_start and v_prev_end), 0),
          'visitors_prev', coalesce(sum(v.visitors) filter (where v.day between v_prev_start and v_prev_end), 0))
        from public.site_visits_daily v
        where v.company_id = c.id and v.day between v_prev_start and p_end),
      'car_views', (
        select jsonb_build_object(
          'views', coalesce(sum(x.views) filter (where x.day between p_start and p_end), 0),
          'views_prev', coalesce(sum(x.views) filter (where x.day between v_prev_start and v_prev_end), 0))
        from public.car_views_daily x
        where x.company_id = c.id and x.day between v_prev_start and p_end),
      'leads', (
        select jsonb_build_object(
          'total', count(*) filter (where d between p_start and p_end),
          'prev', count(*) filter (where d between v_prev_start and v_prev_end))
        from (select (l.created_at at time zone 'America/Fortaleza')::date as d
              from public.whatsapp_leads l where l.company_id = c.id) l),
      'stock', (
        select jsonb_build_object(
          'available', count(*) filter (where k.status = 'disponivel' and not k.hidden),
          'reserved', count(*) filter (where k.status = 'reservado'),
          'maintenance', count(*) filter (where k.status = 'manutencao'),
          'hidden', count(*) filter (where k.hidden and k.status <> 'vendido'),
          'in_stock', count(*) filter (where k.status <> 'vendido'),
          'no_photo', count(*) filter (where k.status = 'disponivel' and not k.hidden
                                         and jsonb_array_length(coalesce(k.images, '[]'::jsonb)) = 0),
          'stale', count(*) filter (where k.status = 'disponivel'
                                      and current_date - coalesce(k.purchase_date, (k.created_at at time zone 'America/Fortaleza')::date) > c.stock_alert_days),
          'added', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between p_start and p_end),
          'added_prev', count(*) filter (where (k.created_at at time zone 'America/Fortaleza')::date between v_prev_start and v_prev_end),
          'last_added_at', max(k.created_at),
          'last_updated_at', max(k.updated_at))
        from public.cars k
        where k.company_id = c.id),
      'sales', (
        select jsonb_build_object(
          'sold', count(*) filter (where x.sale_date between p_start and p_end),
          'sold_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end),
          'sold_site', count(*) filter (where x.sale_date between p_start and p_end and x.from_site),
          'sold_site_prev', count(*) filter (where x.sale_date between v_prev_start and v_prev_end and x.from_site),
          'total', count(*))
        from (
          select s.sale_date, exists (
            select 1 from public.whatsapp_leads l
            where l.company_id = s.company_id and l.car_id = s.car_id
              and (l.created_at at time zone 'America/Fortaleza')::date <= s.sale_date) as from_site
          from public.sales s
          where s.company_id = c.id) x),
      'usage', (
        select jsonb_build_object(
          'last_activity_at', max(a.created_at),
          'last_work_at', max(a.created_at) filter (where a.entity <> 'auth'),
          'activities', count(*) filter (where a.entity <> 'auth' and a.d between p_start and p_end),
          'activities_prev', count(*) filter (where a.entity <> 'auth' and a.d between v_prev_start and v_prev_end),
          'logins', count(*) filter (where a.entity = 'auth' and a.d between p_start and p_end),
          'active_users', count(distinct a.user_id) filter (where a.d between p_start and p_end),
          'active_days', count(distinct a.d) filter (where a.entity <> 'auth' and a.d between p_start and p_end))
        from (select x.*, (x.created_at at time zone 'America/Fortaleza')::date as d
              from public.activity_log x where x.company_id = c.id) a),
      'last_login_at', (
        select max(u.last_sign_in_at)
        from public.user_company uc join auth.users u on u.id = uc.user_id
        where uc.company_id = c.id),
      'team', jsonb_build_object(
        'admins', (select count(*) from public.user_company uc where uc.company_id = c.id and uc.role = 'admin'),
        'managers', (select count(*) from public.sellers t
                     where t.company_id = c.id and t.role = 'manager' and t.active and t.deleted_at is null),
        'sellers', (select count(*) from public.sellers t
                    where t.company_id = c.id and t.role = 'seller' and t.active and t.deleted_at is null)),
      'features', jsonb_build_object(
        'customers', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customers x where x.company_id = c.id),
        'customer_contacts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_contacts x where x.company_id = c.id),
        'customer_interests', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_interests x where x.company_id = c.id),
        'reservations', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_reservations x where x.company_id = c.id),
        'contracts', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contracts x where x.company_id = c.id),
        'contract_templates', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.contract_templates x where x.company_id = c.id),
        'financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_financings x where x.company_id = c.id),
        'external_financings', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.external_financings x where x.company_id = c.id),
        'expenses', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.car_expenses x where x.company_id = c.id),
        'customer_documents', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.customer_documents x where x.company_id = c.id),
        'signatures', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.signature_requests x where x.company_id = c.id),
        'olx', (select jsonb_build_object('total', count(*) filter (where x.status in ('publicado', 'aguardando')), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.olx_ads x where x.company_id = c.id),
        'webmotors', (select jsonb_build_object('total', count(*) filter (where x.status = 'publicado'), 'period', count(*) filter (where (x.created_at at time zone 'America/Fortaleza')::date between p_start and p_end)) from public.wm_ads x where x.company_id = c.id),
        'sales', (select jsonb_build_object('total', count(*), 'period', count(*) filter (where x.sale_date between p_start and p_end)) from public.sales x where x.company_id = c.id),
        'rotation', (select jsonb_build_object('total', count(*) filter (where x.active), 'period', 0) from public.whatsapp_rotation x where x.company_id = c.id))
    ) as store
    from public.companies c
    where p_company is null or c.id = p_company
  ) s;

  return v_result;
end $$;
revoke execute on function public.platform_rows(date, date, uuid) from anon, authenticated, public;

-- Rodada automática a cada 10 minutos (só no Supabase, onde há pg_cron e pg_net)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('webmotors-rodada', '5-59/10 * * * *', $job$
      select net.http_post(
        url := 'https://pifqnbdmaytlhmdfnipz.supabase.co/functions/v1/webmotors',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{"action": "rodada"}'::jsonb,
        timeout_milliseconds := 120000)
    $job$);
  end if;
end $$;

-- 62) Conferência: passou para a seção 64, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 63) Despesas da empresa (Financeiro → Despesas da empresa) -----------------------
-- Contas da loja que não são de um carro: aluguel, água, energia, internet,
-- salários, contador... (pedido do Wesley em 07/10/2026).
-- * company_expenses: cada despesa tem vencimento (due_on) e fica "a pagar" até
--   ter a data do pagamento (paid_on). Valor com centavos. Anexos no bucket
--   expense-attachments, pasta <loja>/empresa/ (mesmas regras dos gastos).
-- * "Repetir todo mês" (opcional em cada despesa): a despesa vira um modelo
--   (company_expense_recurrences) e o sistema cria a de cada mês no mesmo dia (29
--   a 31: último dia do mês), do mês seguinte ao último criado até o mês atual.
--   Roda ao abrir a tela (company_expenses_generate) e todo dia pelo pg_cron
--   ("despesas-recorrentes"). Apagar uma despesa do mês não faz ela voltar.
--   "Parar de repetir" desliga o modelo; as já criadas ficam.
-- * Só o admin da loja vê e mexe (como o Financeiro da loja). Entram no lucro do
--   mês (Financeiro, Relatórios e Desempenho) pelo mês do vencimento.

create table if not exists public.company_expense_recurrences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  amount numeric(12, 2) not null check (amount >= 0 and amount < 100000000),
  day smallint not null check (day between 1 and 31),
  starts_on date not null,
  last_generated_month date not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_expense_recurrences_months_check
    check (starts_on = date_trunc('month', starts_on)::date and last_generated_month = date_trunc('month', last_generated_month)::date)
);

create index if not exists company_expense_recurrences_company_idx on public.company_expense_recurrences (company_id) where active;

create table if not exists public.company_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade,
  category text not null check (char_length(category) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  amount numeric(12, 2) not null check (amount >= 0 and amount < 100000000),
  due_on date not null,
  paid_on date,
  supplier_id uuid references public.suppliers(id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 1000),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  recurrence_id uuid references public.company_expense_recurrences(id) on delete set null,
  reference_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_expenses_reference_month_check
    check (reference_month is null or reference_month = date_trunc('month', reference_month)::date)
);

create index if not exists company_expenses_company_due_idx on public.company_expenses (company_id, due_on);
create unique index if not exists company_expenses_recurrence_month_idx
  on public.company_expenses (recurrence_id, reference_month) where recurrence_id is not null;

drop trigger if exists company_expense_recurrences_set_updated_at on public.company_expense_recurrences;
create trigger company_expense_recurrences_set_updated_at
before update on public.company_expense_recurrences
for each row execute function public.set_updated_at();

drop trigger if exists company_expenses_set_updated_at on public.company_expenses;
create trigger company_expenses_set_updated_at
before update on public.company_expenses
for each row execute function public.set_updated_at();

drop trigger if exists company_expense_recurrences_check_company_refs on public.company_expense_recurrences;
create trigger company_expense_recurrences_check_company_refs before insert or update on public.company_expense_recurrences
for each row execute function public.check_company_refs();

drop trigger if exists company_expenses_check_company_refs on public.company_expenses;
create trigger company_expenses_check_company_refs before insert or update on public.company_expenses
for each row execute function public.check_company_refs();

-- A despesa de um modelo tem que ser da mesma loja do modelo
create or replace function public.company_expenses_check_recurrence()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.recurrence_id is not null and not exists (
    select 1 from public.company_expense_recurrences r where r.id = new.recurrence_id and r.company_id = new.company_id
  ) then
    raise exception 'Modelo de despesa não encontrado nesta loja' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists company_expenses_check_recurrence on public.company_expenses;
create trigger company_expenses_check_recurrence before insert or update of recurrence_id, company_id on public.company_expenses
for each row execute function public.company_expenses_check_recurrence();

alter table public.company_expense_recurrences enable row level security;
alter table public.company_expenses enable row level security;
revoke all on public.company_expense_recurrences from anon;
revoke all on public.company_expenses from anon;

drop policy if exists "Admins manage company expense recurrences" on public.company_expense_recurrences;
create policy "Admins manage company expense recurrences"
on public.company_expense_recurrences for all
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Admins manage company expenses" on public.company_expenses;
create policy "Admins manage company expenses"
on public.company_expenses for all
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin())
with check (company_id = public.current_company_id() and public.is_company_admin());

drop trigger if exists company_expenses_log_activity on public.company_expenses;
create trigger company_expenses_log_activity after insert or update or delete on public.company_expenses
for each row execute function public.log_activity();

-- Cria as despesas dos meses que faltam de cada modelo ativo. Pelo painel (admin)
-- vale só a loja de quem chama; pelo cron (sem login), todas as lojas.
create or replace function public.company_expenses_generate()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := null;
  v_month_now date := date_trunc('month', (now() at time zone 'America/Fortaleza')::date)::date;
  v_count integer := 0;
  v_month date;
  v_due date;
  r public.company_expense_recurrences%rowtype;
begin
  if auth.uid() is not null then
    if not public.is_company_admin() then
      raise exception 'Acesso restrito ao administrador da loja' using errcode = '42501';
    end if;
    v_company := public.current_company_id();
  end if;
  -- Quem cria é o sistema: não vai para o registro de atividades de quem abriu a tela
  perform set_config('app.skip_activity_log', '1', true);
  for r in
    select * from public.company_expense_recurrences x
    where x.active and x.last_generated_month < v_month_now
      and (v_company is null or x.company_id = v_company)
    for update skip locked
  loop
    v_month := (r.last_generated_month + interval '1 month')::date;
    while v_month <= v_month_now loop
      v_due := v_month + (least(r.day, extract(day from (v_month + interval '1 month - 1 day'))::integer) - 1);
      insert into public.company_expenses (company_id, category, description, amount, due_on, supplier_id, notes, recurrence_id, reference_month)
      values (r.company_id, r.category, r.description, r.amount, v_due, r.supplier_id, r.notes, r.id, v_month)
      on conflict (recurrence_id, reference_month) where recurrence_id is not null do nothing;
      if found then
        v_count := v_count + 1;
      end if;
      v_month := (v_month + interval '1 month')::date;
    end loop;
    update public.company_expense_recurrences set last_generated_month = v_month_now where id = r.id;
  end loop;
  return v_count;
end $$;
revoke execute on function public.company_expenses_generate() from anon, public;
grant execute on function public.company_expenses_generate() to authenticated;

-- Nova despesa (e o modelo, com "Repetir todo mês") de uma vez só
create or replace function public.create_company_expense(p jsonb, p_repeat boolean default false)
returns public.company_expenses
language plpgsql security invoker set search_path = public
as $$
declare
  v_due date := (p ->> 'due_on')::date;
  v_month date := date_trunc('month', (p ->> 'due_on')::date)::date;
  v_recurrence uuid;
  v_row public.company_expenses;
begin
  if not public.is_company_admin() then
    raise exception 'Acesso restrito ao administrador da loja' using errcode = '42501';
  end if;
  if v_due is null then
    raise exception 'Informe o vencimento' using errcode = '22023';
  end if;
  if p_repeat then
    insert into public.company_expense_recurrences (category, description, amount, day, starts_on, last_generated_month, supplier_id, notes)
    values (p ->> 'category', coalesce(p ->> 'description', ''), (p ->> 'amount')::numeric, extract(day from v_due)::smallint,
            v_month, v_month, nullif(p ->> 'supplier_id', '')::uuid, coalesce(p ->> 'notes', ''))
    returning id into v_recurrence;
  end if;
  insert into public.company_expenses (category, description, amount, due_on, paid_on, supplier_id, notes, attachments, recurrence_id, reference_month)
  values (p ->> 'category', coalesce(p ->> 'description', ''), (p ->> 'amount')::numeric, v_due, nullif(p ->> 'paid_on', '')::date,
          nullif(p ->> 'supplier_id', '')::uuid, coalesce(p ->> 'notes', ''), coalesce(p -> 'attachments', '[]'::jsonb),
          v_recurrence, case when v_recurrence is null then null else v_month end)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.create_company_expense(jsonb, boolean) from anon, public;
grant execute on function public.create_company_expense(jsonb, boolean) to authenticated;

-- Todo dia às 00:15 de São Luís (03:15 UTC), só onde há pg_cron
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('despesas-recorrentes', '15 3 * * *', 'select public.company_expenses_generate()');
  end if;
end $$;

-- Registro de atividades: rótulo das despesas da empresa (o resto igual à última versão)
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
      -- Troca de cargo na Equipe: "cargo: Vendedor → Gerente"
      if tg_table_name = 'sellers' and ('role' = any(v_changed) or 'custom_role_id' = any(v_changed)) then
        v_details := format('cargo: %s → %s',
          coalesce((select r.name from public.custom_roles r where r.id = (old_rec->>'custom_role_id')::uuid),
                   case old_rec->>'role' when 'manager' then 'Gerente' else 'Vendedor' end),
          coalesce((select r.name from public.custom_roles r where r.id = (rec->>'custom_role_id')::uuid),
                   case rec->>'role' when 'manager' then 'Gerente' else 'Vendedor' end));
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'custom_roles' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
      when 'company_expenses' then concat('Despesa da empresa: ', coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
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

-- 64) Conferência: passou para a seção 66, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 65) Painel WB.Dev: mensalidade, PIX, contrato de adesão, suporte e contatos ------
-- Pedido do Wesley em 07/10/2026.
-- * Vencimento: no dia da ativação, todo mês (ativou em 03/10: vence 03/10, 03/11...);
--   nos meses sem o dia (29 a 31), no último dia do mês. Dia e mês escolhidos à
--   mão continuam valendo (due_day de 1 a 31). Contas que já corriam com o
--   vencimento automático antigo (30 dias) ficam com as datas gravadas.
--   "Vence em breve" (aviso no painel e lembrete por e-mail) passa a 3 dias.
-- * platform_settings: dados de pagamento (PIX e banco) e de suporte, que o dono
--   da plataforma preenche em Plataforma → Cobrança. A loja vê pelo my_account().
-- * client_payment_claims: o "Já paguei" da loja (meses, valor, data e
--   comprovante no bucket payment-receipts). A WB.Dev confirma (vira
--   client_payments) ou recusa com o motivo.
-- * suspended_account(): com a loja bloqueada, o login mostra ao admin dela o que
--   está em aberto e o PIX para pagar.
-- * Contrato de adesão: platform_terms (versões; rascunho → publicada) e
--   client_terms_acceptances (aceite do admin da loja com data, IP, navegador e
--   a impressão digital do texto). Com uma versão publicada que a loja não
--   aceitou, o painel pede o aceite ao admin (os logins da equipe WB.Dev,
--   platform_team, e o dono da plataforma não aceitam pelo cliente; a loja de
--   demonstração não aceita). A minuta entra como rascunho.
-- * Suporte: support_tickets e support_messages (anexos no bucket
--   support-files); client_contact_notes: anotações de atendimento (só a WB.Dev).
-- * A aba Portais sai dos planos (fica só na WB.AUTO, que não tem plano) até a
--   Webmotors ficar pronta; para liberar, marcar "Portais" em Plataforma → Planos.

-- Vencimento no dia da ativação ---------------------------------------------------

-- Quem já corria no automático antigo fica com o dia e o mês gravados
update public.client_accounts a
set due_day = coalesce(a.due_day, extract(day from f.first_due)::integer),
    billing_start = coalesce(a.billing_start, date_trunc('month', f.first_due)::date)
from (
  select company_id,
    case when extract(day from activated_on + 30) > 28
      then (date_trunc('month', activated_on + 30) + interval '1 month')::date
      else activated_on + 30
    end as first_due
  from public.client_accounts
  where activated_on is not null
) f
where f.company_id = a.company_id and (a.due_day is null or a.billing_start is null);

alter table public.client_accounts drop constraint if exists client_accounts_due_day_check;
alter table public.client_accounts add constraint client_accounts_due_day_check check (due_day between 1 and 31);

create or replace function public.client_billing(p_company uuid, p_today date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  a public.client_accounts%rowtype;
  v_today date := coalesce(p_today, (now() at time zone 'America/Fortaleza')::date);
  v_price numeric;
  v_due_day integer;
  v_start date;
  v_month date;
  v_last date;
  v_due date;
  v_open jsonb := '[]'::jsonb;
  v_next jsonb;
  v_oldest date;
  v_situation text;
begin
  select * into a from public.client_accounts where company_id = p_company;
  if not found then
    return jsonb_build_object('situation', 'sem_cobranca');
  end if;
  v_price := coalesce(a.monthly_price, (select p.monthly_price from public.plans p where p.id = a.plan_id));
  v_due_day := a.due_day;
  v_start := a.billing_start;
  -- Automático: vence no dia da ativação, a partir do mês da ativação
  if a.activated_on is not null then
    v_due_day := coalesce(v_due_day, extract(day from a.activated_on)::integer);
    v_start := coalesce(v_start, date_trunc('month', a.activated_on)::date);
  end if;

  if a.status = 'implantacao' then
    return jsonb_build_object('situation', 'implantacao', 'price', v_price, 'due_day', a.due_day,
      'due_day_auto', a.due_day is null);
  end if;
  if a.status = 'cancelado' or coalesce(v_price, 0) = 0 or v_due_day is null or v_start is null then
    return jsonb_build_object('situation', 'sem_cobranca', 'price', v_price, 'due_day', v_due_day,
      'due_day_auto', a.due_day is null and a.activated_on is not null);
  end if;

  v_month := v_start;
  v_last := (date_trunc('month', v_today) + interval '1 month')::date;
  while v_month <= v_last loop
    -- 29 a 31: nos meses mais curtos, o último dia do mês
    v_due := v_month + (least(v_due_day, extract(day from (v_month + interval '1 month - 1 day'))::integer) - 1);
    if not exists (select 1 from public.client_payments p where p.company_id = p_company and p.reference_month = v_month) then
      if v_due < v_today then
        v_open := v_open || jsonb_build_array(jsonb_build_object('month', v_month, 'due', v_due, 'amount', v_price));
        v_oldest := coalesce(v_oldest, v_due);
      elsif v_next is null then
        v_next := jsonb_build_object('month', v_month, 'due', v_due, 'amount', v_price);
      end if;
    end if;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  v_situation := case
    when v_oldest is not null then 'atrasado'
    when v_next is not null and (v_next->>'due')::date = v_today then 'vence_hoje'
    when v_next is not null and (v_next->>'due')::date - v_today <= 3 then 'vence_em_breve'
    else 'em_dia'
  end;

  return jsonb_build_object(
    'situation', v_situation,
    'price', v_price,
    'due_day', v_due_day,
    'due_day_auto', a.due_day is null and a.activated_on is not null,
    'billing_start', v_start,
    'open', v_open,
    'open_total', v_price * jsonb_array_length(v_open),
    'days_late', case when v_oldest is null then 0 else v_today - v_oldest end,
    'next', v_next
  );
end $$;
revoke execute on function public.client_billing(uuid, date) from anon, authenticated, public;

-- Lembrete por e-mail: de 1 a 3 dias antes (antes_3); o antes_5 fica no histórico
alter table public.client_reminders drop constraint if exists client_reminders_kind_check;
alter table public.client_reminders add constraint client_reminders_kind_check
  check (kind in ('antes_5', 'antes_3', 'no_dia', 'atraso_1', 'atraso_3', 'atraso_7', 'recibo'));

create or replace function public.billing_reminders_due(p_today date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'America/Fortaleza')::date);
  v_items jsonb := '[]'::jsonb;
  r record;
  b jsonb;
  o jsonb;
  v_days integer;
  v_kind text;
begin
  if not (public.is_platform_admin() or public.is_service_request()) then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  for r in
    select c.id, c.name, c.site_url, a.responsible_name
    from public.companies c
    join public.client_accounts a on a.company_id = c.id
    where a.status = 'ativo' and a.reminders_enabled
  loop
    b := public.client_billing(r.id, v_today);
    if jsonb_typeof(b -> 'next') = 'object' then
      v_days := (b -> 'next' ->> 'due')::date - v_today;
      v_kind := case when v_days = 0 then 'no_dia' when v_days between 1 and 3 then 'antes_3' end;
      if v_kind is not null then
        v_items := v_items || jsonb_build_object('company_id', r.id, 'name', r.name, 'site_url', r.site_url,
          'responsible_name', r.responsible_name, 'kind', v_kind, 'month', b -> 'next' ->> 'month',
          'due', b -> 'next' ->> 'due', 'amount', b -> 'next' -> 'amount', 'days', v_days);
      end if;
    end if;
    for o in select value from jsonb_array_elements(coalesce(b -> 'open', '[]'::jsonb)) loop
      v_days := v_today - (o ->> 'due')::date;
      v_kind := case
        when v_days between 1 and 2 then 'atraso_1'
        when v_days between 3 and 6 then 'atraso_3'
        when v_days between 7 and 13 then 'atraso_7'
      end;
      if v_kind is not null then
        v_items := v_items || jsonb_build_object('company_id', r.id, 'name', r.name, 'site_url', r.site_url,
          'responsible_name', r.responsible_name, 'kind', v_kind, 'month', o ->> 'month', 'due', o ->> 'due',
          'amount', o -> 'amount', 'days', v_days);
      end if;
    end loop;
  end loop;

  return (
    select coalesce(jsonb_agg(x || jsonb_build_object('to', to_jsonb(public.client_reminder_recipients((x ->> 'company_id')::uuid)))
                              order by x ->> 'name', x ->> 'month'), '[]'::jsonb)
    from jsonb_array_elements(v_items) as t(x)
    where not exists (
      select 1 from public.client_reminders cr
      where cr.company_id = (x ->> 'company_id')::uuid
        and cr.kind = x ->> 'kind'
        and cr.reference_month = (x ->> 'month')::date
        and cr.status = 'enviado')
  );
end $$;
revoke execute on function public.billing_reminders_due(date) from anon, public;
grant execute on function public.billing_reminders_due(date) to authenticated, service_role;

-- Dados de pagamento e de suporte da WB.Dev ----------------------------------------
create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  pix_key text not null default '' check (char_length(pix_key) <= 77),
  pix_name text not null default '' check (char_length(pix_name) <= 25),
  pix_city text not null default '' check (char_length(pix_city) <= 15),
  bank_name text not null default '' check (char_length(bank_name) <= 80),
  bank_agency text not null default '' check (char_length(bank_agency) <= 20),
  bank_account text not null default '' check (char_length(bank_account) <= 30),
  bank_holder text not null default '' check (char_length(bank_holder) <= 80),
  bank_document text not null default '' check (char_length(bank_document) <= 20),
  notify_phone text not null default '5598981295577' check (char_length(notify_phone) <= 20),
  support_email text not null default '' check (char_length(support_email) <= 120),
  support_hours text not null default '' check (char_length(support_hours) <= 120),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon;

drop policy if exists "Platform admins manage platform settings" on public.platform_settings;
create policy "Platform admins manage platform settings"
on public.platform_settings for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- "Já paguei" ----------------------------------------------------------------------
create table if not exists public.client_payment_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  months date[] not null check (cardinality(months) between 1 and 24),
  amount numeric(10, 2) not null check (amount >= 0),
  paid_on date not null,
  receipt jsonb check (receipt is null or jsonb_typeof(receipt) = 'object'),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'recusado')),
  response text not null default '' check (char_length(response) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  notified_at timestamptz
);

create index if not exists client_payment_claims_company_idx on public.client_payment_claims (company_id, created_at desc);
create index if not exists client_payment_claims_pending_idx on public.client_payment_claims (created_at) where status = 'pendente';

alter table public.client_payment_claims enable row level security;
revoke insert, update, delete on public.client_payment_claims from anon, authenticated;

drop policy if exists "Store admins and platform read payment claims" on public.client_payment_claims;
create policy "Store admins and platform read payment claims"
on public.client_payment_claims for select
to authenticated
using ((company_id = public.current_company_id() and public.is_company_admin()) or public.is_platform_admin());

-- O admin da loja informa o pagamento
create or replace function public.inform_payment(p_months date[], p_amount numeric, p_paid_on date, p_receipt jsonb default null, p_note text default '')
returns public.client_payment_claims
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
  v_months date[];
  v_paid date;
  v_row public.client_payment_claims;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador da loja informa o pagamento' using errcode = '42501';
  end if;
  select array_agg(distinct date_trunc('month', m)::date order by date_trunc('month', m)::date) into v_months
  from unnest(coalesce(p_months, '{}')) m where m is not null;
  if v_months is null or cardinality(v_months) = 0 then
    raise exception 'Escolha o mês pago' using errcode = '22023';
  end if;
  select min(p.reference_month) into v_paid from public.client_payments p
  where p.company_id = v_company and p.reference_month = any(v_months);
  if v_paid is not null then
    raise exception 'A mensalidade de %/% já está paga', to_char(v_paid, 'MM'), to_char(v_paid, 'YYYY') using errcode = '23505';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'America/Fortaleza')::date + 1 then
    raise exception 'Informe a data do pagamento' using errcode = '22023';
  end if;
  if p_receipt is not null and (p_receipt ->> 'path') is not null
     and split_part(p_receipt ->> 'path', '/', 1) <> v_company::text then
    raise exception 'Comprovante de outra loja' using errcode = '42501';
  end if;
  insert into public.client_payment_claims (company_id, months, amount, paid_on, receipt, note, created_by_email)
  values (v_company, v_months, coalesce(p_amount, 0), p_paid_on, p_receipt, left(coalesce(p_note, ''), 500),
          coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.inform_payment(date[], numeric, date, jsonb, text) from anon, public;
grant execute on function public.inform_payment(date[], numeric, date, jsonb, text) to authenticated;

-- A WB.Dev confirma (vira pagamento de cada mês) ou recusa com o motivo
create or replace function public.platform_review_payment_claim(p_id uuid, p_confirm boolean, p_response text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c public.client_payment_claims;
  v_count integer;
  v_each numeric;
  v_rest numeric;
  v_month date;
  v_ids uuid[] := '{}';
  v_id uuid;
  i integer := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  select * into c from public.client_payment_claims where id = p_id for update;
  if not found then
    raise exception 'Pagamento informado não encontrado' using errcode = 'P0002';
  end if;
  if c.status <> 'pendente' then
    raise exception 'Este pagamento já foi conferido' using errcode = '22023';
  end if;
  if p_confirm then
    v_count := cardinality(c.months);
    v_each := round(c.amount / v_count, 2);
    v_rest := c.amount - v_each * (v_count - 1);
    foreach v_month in array c.months loop
      i := i + 1;
      insert into public.client_payments (company_id, reference_month, amount, paid_on, method, notes)
      values (c.company_id, v_month, case when i = v_count then v_rest else v_each end, c.paid_on, 'PIX',
              'Informado pela loja no painel ("Já paguei")')
      on conflict (company_id, reference_month) do nothing
      returning id into v_id;
      if v_id is not null then
        v_ids := v_ids || v_id;
      end if;
      v_id := null;
    end loop;
  end if;
  update public.client_payment_claims
  set status = case when p_confirm then 'confirmado' else 'recusado' end,
      response = left(coalesce(p_response, ''), 500),
      reviewed_at = now()
  where id = p_id;
  return jsonb_build_object('status', case when p_confirm then 'confirmado' else 'recusado' end, 'payment_ids', to_jsonb(v_ids));
end $$;
revoke execute on function public.platform_review_payment_claim(uuid, boolean, text) from anon, public;
grant execute on function public.platform_review_payment_claim(uuid, boolean, text) to authenticated;

-- Pagamentos da própria loja (página Mensalidade, só o admin)
create or replace function public.my_payments()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Acesso restrito ao administrador da loja' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'reference_month', p.reference_month, 'amount', p.amount,
      'paid_on', p.paid_on, 'method', p.method) order by p.reference_month desc), '[]'::jsonb)
    from public.client_payments p where p.company_id = v_company
  );
end $$;
revoke execute on function public.my_payments() from anon, public;
grant execute on function public.my_payments() to authenticated;

-- Loja bloqueada: no login, o admin da loja vê o que está em aberto e como pagar
-- (PIX e banco) para regularizar. Quem chama acabou de entrar com a senha, mas o
-- painel está fechado (current_company_id() vazio); por isso a função confere o
-- vínculo de admin direto. Vendedor e gerente só ficam sabendo que é com o admin.
create or replace function public.suspended_account(p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.platform_settings%rowtype;
begin
  if auth.uid() is null or not public.company_blocked(p_company) then
    return null;
  end if;
  if not exists (select 1 from public.user_company uc
                 where uc.user_id = auth.uid() and uc.company_id = p_company and uc.role = 'admin') then
    return jsonb_build_object('admin', false);
  end if;
  select * into s from public.platform_settings where id = 1;
  return jsonb_build_object(
    'admin', true,
    'name', (select c.name from public.companies c where c.id = p_company),
    'billing', public.client_billing(p_company, null),
    'pix_key', coalesce(s.pix_key, ''), 'pix_name', coalesce(s.pix_name, ''), 'pix_city', coalesce(s.pix_city, ''),
    'bank_name', coalesce(s.bank_name, ''), 'bank_agency', coalesce(s.bank_agency, ''),
    'bank_account', coalesce(s.bank_account, ''), 'bank_holder', coalesce(s.bank_holder, ''),
    'bank_document', coalesce(s.bank_document, ''));
end $$;
revoke execute on function public.suspended_account(uuid) from anon, public;
grant execute on function public.suspended_account(uuid) to authenticated;

-- Comprovantes: <loja>/<arquivo> (o admin da loja envia e vê; a WB.Dev vê todos)
insert into storage.buckets (id, name, public) values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

drop policy if exists "Store admins upload payment receipts" on storage.objects;
create policy "Store admins upload payment receipts"
on storage.objects for insert
to authenticated
with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

drop policy if exists "Store admins and platform read payment receipts" on storage.objects;
create policy "Store admins and platform read payment receipts"
on storage.objects for select
to authenticated
using (bucket_id = 'payment-receipts' and (
  ((storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin()) or public.is_platform_admin()));

drop policy if exists "Store admins delete payment receipts" on storage.objects;
create policy "Store admins delete payment receipts"
on storage.objects for delete
to authenticated
using (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin());

-- Contrato de adesão ---------------------------------------------------------------
create table if not exists public.platform_terms (
  id uuid primary key default gen_random_uuid(),
  version integer unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(body) between 1 and 100000),
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada')),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  constraint platform_terms_published_check check ((status = 'publicada') = (version is not null and published_at is not null))
);

create unique index if not exists platform_terms_one_draft on public.platform_terms ((status)) where status = 'rascunho';

drop trigger if exists platform_terms_set_updated_at on public.platform_terms;
create trigger platform_terms_set_updated_at
before update on public.platform_terms
for each row execute function public.set_updated_at();

-- Versão publicada não muda (uma nova versão é um texto novo)
create or replace function public.platform_terms_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'publicada' then
    raise exception 'Versão publicada não pode ser alterada; publique uma nova versão' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists platform_terms_guard on public.platform_terms;
create trigger platform_terms_guard
before update or delete on public.platform_terms
for each row when (old.status = 'publicada')
execute function public.platform_terms_guard();

alter table public.platform_terms enable row level security;
revoke all on public.platform_terms from anon;

drop policy if exists "Platform admins manage terms" on public.platform_terms;
create policy "Platform admins manage terms"
on public.platform_terms for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin() and status = 'rascunho');

create table if not exists public.client_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  terms_id uuid not null references public.platform_terms(id) on delete restrict,
  version integer not null,
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null default '',
  user_email text not null default '',
  accepted_at timestamptz not null default now(),
  ip text not null default '',
  user_agent text not null default '',
  body_sha256 text not null,
  unique (company_id, version)
);

alter table public.client_terms_acceptances enable row level security;
revoke insert, update, delete on public.client_terms_acceptances from anon, authenticated;

drop policy if exists "Store admins and platform read terms acceptances" on public.client_terms_acceptances;
create policy "Store admins and platform read terms acceptances"
on public.client_terms_acceptances for select
to authenticated
using ((company_id = public.current_company_id() and public.is_company_admin()) or public.is_platform_admin());

create or replace function public.is_platform_team()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.platform_team where user_id = auth.uid())
$$;
revoke execute on function public.is_platform_team() from anon, public;
grant execute on function public.is_platform_team() to authenticated;

-- Aceite do admin da loja (a versão aceita tem que ser a publicada agora)
create or replace function public.accept_platform_terms(p_version integer)
returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
  t public.platform_terms;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text;
  v_row public.client_terms_acceptances;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador da loja aceita os termos' using errcode = '42501';
  end if;
  if public.is_platform_team() or public.is_platform_admin() then
    raise exception 'Logins da equipe WB.Dev não aceitam os termos pelo cliente' using errcode = '42501';
  end if;
  if (select coalesce(c.is_demo, false) from public.companies c where c.id = v_company) then
    raise exception 'A loja de demonstração não aceita o contrato' using errcode = '42501';
  end if;
  select * into t from public.platform_terms where status = 'publicada' order by version desc limit 1;
  if not found or t.version <> p_version then
    raise exception 'O texto dos termos mudou; recarregue a página' using errcode = '22023';
  end if;
  v_ip := coalesce(nullif(v_headers ->> 'cf-connecting-ip', ''), nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
                   nullif(v_headers ->> 'x-real-ip', ''), '');
  insert into public.client_terms_acceptances (company_id, terms_id, version, user_id, user_name, user_email, ip, user_agent, body_sha256)
  values (v_company, t.id, t.version, auth.uid(),
          coalesce((select s.name from public.sellers s where s.user_id = auth.uid()), ''),
          coalesce((select u.email from auth.users u where u.id = auth.uid()), ''),
          left(v_ip, 100), left(coalesce(v_headers ->> 'user-agent', ''), 300),
          encode(sha256(convert_to(t.body, 'UTF8')), 'hex'))
  on conflict (company_id, version) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.client_terms_acceptances where company_id = v_company and version = t.version;
  end if;
  return jsonb_build_object('version', v_row.version, 'accepted_at', v_row.accepted_at, 'user_email', v_row.user_email,
    'user_name', v_row.user_name);
end $$;
revoke execute on function public.accept_platform_terms(integer) from anon, public;
grant execute on function public.accept_platform_terms(integer) to authenticated;

-- Comprovante do aceite (texto aceito + registro): o admin da loja (a própria) ou
-- a plataforma (qualquer loja)
create or replace function public.terms_receipt(p_company uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := coalesce(p_company, public.current_company_id());
begin
  if p_company is null then
    if v_company is null or not public.is_company_admin() then
      raise exception 'Acesso restrito ao administrador da loja' using errcode = '42501';
    end if;
  elsif not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('company', c.name, 'legal_name', coalesce(c.fiscal ->> 'legal_name', ''), 'cnpj', coalesce(c.fiscal ->> 'cnpj', ''),
      'title', t.title, 'body', t.body, 'version', x.version, 'published_at', t.published_at, 'accepted_at', x.accepted_at,
      'user_name', x.user_name, 'user_email', x.user_email, 'ip', x.ip, 'user_agent', x.user_agent, 'body_sha256', x.body_sha256)
    from public.client_terms_acceptances x
    join public.platform_terms t on t.id = x.terms_id
    join public.companies c on c.id = x.company_id
    where x.company_id = v_company
    order by x.version desc
    limit 1
  );
end $$;
revoke execute on function public.terms_receipt(uuid) from anon, public;
grant execute on function public.terms_receipt(uuid) to authenticated;

-- Publica o rascunho como a próxima versão
create or replace function public.publish_platform_terms()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_version integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  select id into v_id from public.platform_terms where status = 'rascunho' for update;
  if v_id is null then
    raise exception 'Não há rascunho para publicar' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.platform_terms;
  update public.platform_terms set status = 'publicada', version = v_version, published_at = now() where id = v_id;
  return jsonb_build_object('version', v_version);
end $$;
revoke execute on function public.publish_platform_terms() from anon, public;
grant execute on function public.publish_platform_terms() to authenticated;

-- Quem aceitou: cada cliente com o último aceite
create or replace function public.platform_terms_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('company_id', c.id, 'slug', c.slug, 'name', c.name, 'status', a.status,
      'acceptance', (select jsonb_build_object('version', x.version, 'accepted_at', x.accepted_at, 'user_name', x.user_name,
                       'user_email', x.user_email, 'ip', x.ip)
                     from public.client_terms_acceptances x where x.company_id = c.id order by x.version desc limit 1))
      order by c.name), '[]'::jsonb)
    from public.companies c
    left join public.client_accounts a on a.company_id = c.id
  );
end $$;
revoke execute on function public.platform_terms_overview() from anon, public;
grant execute on function public.platform_terms_overview() to authenticated;

-- Suporte (chamados) ---------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opened_by uuid default auth.uid() references auth.users(id) on delete set null,
  opener_name text not null default '',
  opener_email text not null default '',
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  kind text not null default 'duvida' check (kind in ('duvida', 'problema', 'melhoria', 'financeiro')),
  status text not null default 'aberto' check (status in ('aberto', 'respondido', 'resolvido')),
  store_unread boolean not null default false,
  wbdev_unread boolean not null default true,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_company_idx on public.support_tickets (company_id, last_message_at desc);
create index if not exists support_tickets_open_idx on public.support_tickets (last_message_at desc) where status <> 'resolvido';

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  author_kind text not null check (author_kind in ('loja', 'wbdev')),
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke insert, update, delete on public.support_tickets from anon, authenticated;
revoke insert, update, delete on public.support_messages from anon, authenticated;

-- A loja: o admin vê os chamados da loja; gerente e vendedor, os que abriram
create or replace function public.can_see_support_ticket(p_company uuid, p_opened_by uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_platform_admin()
    or (p_company = public.current_company_id() and (public.is_company_admin() or (p_opened_by = auth.uid() and public.can_edit_stock())))
$$;
revoke execute on function public.can_see_support_ticket(uuid, uuid) from anon, public;
grant execute on function public.can_see_support_ticket(uuid, uuid) to authenticated;

drop policy if exists "Store team and platform read support tickets" on public.support_tickets;
create policy "Store team and platform read support tickets"
on public.support_tickets for select
to authenticated
using (public.can_see_support_ticket(company_id, opened_by));

drop policy if exists "Store team and platform read support messages" on public.support_messages;
create policy "Store team and platform read support messages"
on public.support_messages for select
to authenticated
using (exists (
  select 1 from public.support_tickets t
  where t.id = ticket_id and public.can_see_support_ticket(t.company_id, t.opened_by)));

create or replace function public.open_support_ticket(p_subject text, p_kind text, p_body text, p_attachments jsonb default '[]'::jsonb)
returns public.support_tickets
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
  v_name text;
  v_email text;
  v_ticket public.support_tickets;
begin
  if v_company is null or not public.can_edit_stock() then
    raise exception 'Só a equipe da loja abre chamados' using errcode = '42501';
  end if;
  v_name := coalesce((select s.name from public.sellers s where s.user_id = auth.uid()), '');
  v_email := coalesce((select u.email from auth.users u where u.id = auth.uid()), '');
  insert into public.support_tickets (company_id, opener_name, opener_email, subject, kind)
  values (v_company, v_name, v_email, btrim(p_subject), coalesce(nullif(p_kind, ''), 'duvida'))
  returning * into v_ticket;
  insert into public.support_messages (ticket_id, company_id, author_kind, author_name, body, attachments)
  values (v_ticket.id, v_company, 'loja', coalesce(nullif(v_name, ''), v_email), btrim(p_body), coalesce(p_attachments, '[]'::jsonb));
  return v_ticket;
end $$;
revoke execute on function public.open_support_ticket(text, text, text, jsonb) from anon, public;
grant execute on function public.open_support_ticket(text, text, text, jsonb) to authenticated;

-- Nova mensagem: da loja (reabre o chamado) ou da WB.Dev (fica "respondido")
create or replace function public.post_support_message(p_ticket uuid, p_body text, p_attachments jsonb default '[]'::jsonb)
returns public.support_messages
language plpgsql security definer set search_path = public, auth
as $$
declare
  t public.support_tickets;
  v_wbdev boolean := public.is_platform_admin();
  v_name text;
  v_row public.support_messages;
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or not public.can_see_support_ticket(t.company_id, t.opened_by) then
    raise exception 'Chamado não encontrado' using errcode = 'P0002';
  end if;
  -- O dono da plataforma responde como WB.Dev nos chamados das outras lojas
  v_wbdev := v_wbdev and t.company_id is distinct from public.current_company_id();
  v_name := case when v_wbdev then 'WB.Dev'
    else coalesce(nullif((select s.name from public.sellers s where s.user_id = auth.uid()), ''),
                  (select u.email from auth.users u where u.id = auth.uid()), '') end;
  insert into public.support_messages (ticket_id, company_id, author_kind, author_name, body, attachments)
  values (t.id, t.company_id, case when v_wbdev then 'wbdev' else 'loja' end, v_name, btrim(p_body), coalesce(p_attachments, '[]'::jsonb))
  returning * into v_row;
  update public.support_tickets
  set last_message_at = now(),
      status = case when v_wbdev then 'respondido' else 'aberto' end,
      store_unread = v_wbdev,
      wbdev_unread = not v_wbdev
  where id = t.id;
  return v_row;
end $$;
revoke execute on function public.post_support_message(uuid, text, jsonb) from anon, public;
grant execute on function public.post_support_message(uuid, text, jsonb) to authenticated;

-- Situação do chamado: a WB.Dev muda para qualquer uma; a loja só marca "resolvido"
create or replace function public.set_support_ticket_status(p_ticket uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or not public.can_see_support_ticket(t.company_id, t.opened_by) then
    raise exception 'Chamado não encontrado' using errcode = 'P0002';
  end if;
  if p_status not in ('aberto', 'respondido', 'resolvido') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  if not public.is_platform_admin() and p_status <> 'resolvido' then
    raise exception 'A loja só pode marcar o chamado como resolvido' using errcode = '42501';
  end if;
  update public.support_tickets set status = p_status where id = t.id;
end $$;
revoke execute on function public.set_support_ticket_status(uuid, text) from anon, public;
grant execute on function public.set_support_ticket_status(uuid, text) to authenticated;

-- Marca como lido: pela loja ou pela WB.Dev
create or replace function public.mark_support_ticket_read(p_ticket uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if not found or not public.can_see_support_ticket(t.company_id, t.opened_by) then
    raise exception 'Chamado não encontrado' using errcode = 'P0002';
  end if;
  if public.is_platform_admin() and t.company_id is distinct from public.current_company_id() then
    update public.support_tickets set wbdev_unread = false where id = t.id and wbdev_unread;
  else
    update public.support_tickets set store_unread = false where id = t.id and store_unread;
  end if;
end $$;
revoke execute on function public.mark_support_ticket_read(uuid) from anon, public;
grant execute on function public.mark_support_ticket_read(uuid) to authenticated;

-- Anexos dos chamados: <loja>/<arquivo> (a equipe da loja e a WB.Dev)
insert into storage.buckets (id, name, public) values ('support-files', 'support-files', false)
on conflict (id) do nothing;

drop policy if exists "Store team and platform upload support files" on storage.objects;
create policy "Store team and platform upload support files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'support-files' and (
  ((storage.foldername(name))[1] = public.current_company_id()::text and public.can_edit_stock()) or public.is_platform_admin()));

drop policy if exists "Store team and platform read support files" on storage.objects;
create policy "Store team and platform read support files"
on storage.objects for select
to authenticated
using (bucket_id = 'support-files' and (
  ((storage.foldername(name))[1] = public.current_company_id()::text and public.can_edit_stock()) or public.is_platform_admin()));

-- Anotações de atendimento (aba Contatos da Plataforma) ---------------------------
create table if not exists public.client_contact_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'telefone', 'email', 'visita', 'outro')),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  contacted_on date not null default ((now() at time zone 'America/Fortaleza')::date),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_contact_notes_company_idx on public.client_contact_notes (company_id, contacted_on desc);

alter table public.client_contact_notes enable row level security;
revoke all on public.client_contact_notes from anon;

drop policy if exists "Platform admins manage contact notes" on public.client_contact_notes;
create policy "Platform admins manage contact notes"
on public.client_contact_notes for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Lista dos clientes da plataforma (substitui a da seção 39): com o WhatsApp da loja
create or replace function public.platform_clients()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'company_id', c.id,
      'slug', c.slug,
      'name', c.name,
      'site_url', c.site_url,
      'whatsapp', c.whatsapp_main,
      'account', to_jsonb(a) - 'company_id',
      'plan', (select jsonb_build_object('id', p.id, 'name', p.name, 'monthly_price', p.monthly_price, 'features', p.features)
               from public.plans p where p.id = a.plan_id),
      'billing', public.client_billing(c.id, null),
      'checks', jsonb_build_object(
        'whatsapp_ok', c.whatsapp_main <> '',
        'cars', (select count(*) from public.cars k where k.company_id = c.id),
        'logins', (select count(*) from public.user_company uc where uc.company_id = c.id),
        'own_domain', c.site_url <> '' and c.site_url not like '%hostingersite.com%')
    ) order by c.name), '[]'::jsonb)
    from public.companies c
    join public.client_accounts a on a.company_id = c.id
  );
end $$;
revoke execute on function public.platform_clients() from anon, public;
grant execute on function public.platform_clients() to authenticated;

-- Painel da loja (substitui o da seção 39): + contrato de adesão, dados de
-- pagamento (admin), contatos do suporte e chamados com resposta não lida
create or replace function public.my_account()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_admin boolean := public.is_company_admin();
  v_today date := (now() at time zone 'America/Fortaleza')::date;
  a public.client_accounts%rowtype;
  t public.platform_terms%rowtype;
  s public.platform_settings%rowtype;
  v_accepted boolean := false;
  -- Loja de demonstração (WB.AUTO) não aceita o contrato; o dono da plataforma
  -- e a equipe WB.Dev não aceitam pelo cliente (só veem o aviso)
  v_demo boolean := false;
  v_team boolean := public.is_platform_team() or public.is_platform_admin();
begin
  if v_company is null then
    raise exception 'Sem acesso' using errcode = '42501';
  end if;
  select coalesce(c.is_demo, false) into v_demo from public.companies c where c.id = v_company;
  select * into a from public.client_accounts where company_id = v_company;
  select * into t from public.platform_terms where status = 'publicada' order by version desc limit 1;
  select * into s from public.platform_settings where id = 1;
  if t.id is not null then
    v_accepted := exists (select 1 from public.client_terms_acceptances x where x.company_id = v_company and x.version = t.version);
  end if;
  return jsonb_build_object(
    'status', coalesce(a.status, 'ativo'),
    'plan_name', (select p.name from public.plans p where p.id = a.plan_id),
    'features', (select to_jsonb(p.features) from public.plans p where p.id = a.plan_id),
    'notices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'message', n.message, 'level', n.level) order by n.created_at desc), '[]'::jsonb)
      from public.client_notices n
      where (n.company_id is null or n.company_id = v_company)
        and n.starts_on <= v_today
        and (n.ends_on is null or n.ends_on >= v_today)
        and (n.audience = 'equipe' or v_admin)),
    'billing', case when v_admin then public.client_billing(v_company, null) end,
    'terms', case when t.id is null or v_demo then null else jsonb_build_object(
      'version', t.version,
      'title', t.title,
      'accepted', v_accepted,
      'body', case when not v_accepted and v_admin and not v_team then t.body end,
      'acceptance', (select jsonb_build_object('version', x.version, 'accepted_at', x.accepted_at, 'user_name', x.user_name,
                       'user_email', x.user_email)
                     from public.client_terms_acceptances x where x.company_id = v_company order by x.version desc limit 1)) end,
    'platform_team', v_team,
    'payment', case when v_admin then jsonb_build_object(
      'pix_key', coalesce(s.pix_key, ''), 'pix_name', coalesce(s.pix_name, ''), 'pix_city', coalesce(s.pix_city, ''),
      'bank_name', coalesce(s.bank_name, ''), 'bank_agency', coalesce(s.bank_agency, ''), 'bank_account', coalesce(s.bank_account, ''),
      'bank_holder', coalesce(s.bank_holder, ''), 'bank_document', coalesce(s.bank_document, ''),
      'claims', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'months', c.months, 'amount', c.amount, 'paid_on', c.paid_on,
                   'status', c.status, 'response', c.response, 'created_at', c.created_at) order by c.created_at desc), '[]'::jsonb)
                 from (select * from public.client_payment_claims c2 where c2.company_id = v_company order by c2.created_at desc limit 10) c)) end,
    'support', jsonb_build_object(
      'phone', coalesce(s.notify_phone, ''), 'email', coalesce(s.support_email, ''), 'hours', coalesce(s.support_hours, ''),
      'unread', (select count(*) from public.support_tickets st
                 where st.company_id = v_company and st.store_unread and (v_admin or st.opened_by = auth.uid())))
  );
end $$;
revoke execute on function public.my_account() from anon, public;
grant execute on function public.my_account() to authenticated;

-- Aba Portais fora dos planos até a Webmotors ficar pronta (a WB.AUTO não tem plano)
update public.plans set features = array_remove(features, 'portais') where 'portais' = any(features);

-- Minuta do contrato de adesão: entra como rascunho e só vale depois de
-- revisada (com advogado), completada (campos entre colchetes) e publicada em
-- Plataforma → Contrato. Não entra de novo se já houver algum texto.
insert into public.platform_terms (title, body, status)
select 'Contrato de Adesão e Termos de Uso do WB.AUTO', $minuta$CONTRATO DE ADESÃO E TERMOS DE USO DO SISTEMA WB.AUTO

Este contrato vale entre:

CONTRATADA: [RAZÃO SOCIAL DA WB.DEV], inscrita no CNPJ sob o nº [CNPJ DA WB.DEV], com sede em [ENDEREÇO DA WB.DEV], doravante chamada WB.DEV.

CONTRATANTE: a loja identificada no cadastro do sistema (razão social, CNPJ e endereço informados em Configurações → Dados fiscais), representada pelo administrador que aceita estes termos no painel, doravante chamada LOJA.

1. OBJETO
1.1. A WB.DEV concede à LOJA o direito de uso, não exclusivo e intransferível, do sistema WB.AUTO, acessado pela internet, que inclui: (a) o site da LOJA, com a vitrine dos veículos; (b) o painel de gestão (estoque, vendas, clientes, financeiro, contratos, relatórios e as demais funções do plano contratado); (c) a hospedagem do site e do painel; e (d) o suporte descrito na cláusula 5.
1.2. As funções disponíveis dependem do plano contratado, mostrado no painel. Funções novas criadas pela WB.DEV podem ser incluídas sem custo adicional ou oferecidas à parte.

2. IMPLANTAÇÃO
2.1. A implantação compreende a personalização do site (logo, cores e contatos), a criação dos acessos da equipe e o treinamento inicial.
2.2. Durante a implantação não há cobrança de mensalidade. A implantação termina com a ativação, comunicada pela WB.DEV, e a data da ativação aparece no painel.

3. MENSALIDADE E PAGAMENTO
3.1. A LOJA paga à WB.DEV a mensalidade do plano contratado, no valor informado no painel (página Mensalidade).
3.2. A mensalidade vence todo mês no dia da ativação, sendo a primeira no próprio dia da ativação. Nos meses que não têm esse dia, ela vence no último dia do mês.
3.3. O pagamento é feito por PIX ou transferência, pelos dados mostrados no painel. Depois de pagar, a LOJA informa o pagamento pelo botão "Já paguei" e envia o comprovante; o pagamento vale como quitado depois da confirmação da WB.DEV.
3.4. O valor da mensalidade pode ser reajustado [uma vez a cada 12 meses, pelo IPCA], com aviso no painel com antecedência mínima de [30] dias.

4. ATRASO E SUSPENSÃO
4.1. O painel avisa a LOJA [3] dias antes do vencimento, no dia do vencimento e enquanto houver atraso; os avisos também podem ser enviados por e-mail.
4.2. Com mais de [10] dias de atraso, a WB.DEV pode suspender o acesso ao painel e mostrar no site uma página de manutenção, até a regularização. A suspensão não apaga os dados da LOJA, e o acesso volta depois da confirmação do pagamento.

5. SUPORTE
5.1. O suporte é prestado pelo WhatsApp (98) 98129-5577 e pela página Suporte do painel (chamados), [de segunda a sexta, das 8h às 18h].
5.2. A correção de falhas do sistema não tem custo. Pedidos de funções novas ou de mudanças específicas da LOJA são avaliados pela WB.DEV e podem ser cobrados à parte, com orçamento aprovado antes.

6. OBRIGAÇÕES DA LOJA
6.1. Manter corretas as informações cadastradas e publicadas (preços, fotos, dados dos veículos, contatos e dados fiscais).
6.2. Guardar as senhas de acesso e responder pelo uso do painel pela sua equipe; avisar a WB.DEV quando alguém sair da equipe ou houver suspeita de acesso indevido.
6.3. Cumprir a legislação aplicável ao seu negócio, inclusive o Código de Defesa do Consumidor, a Lei Geral de Proteção de Dados (LGPD), as regras de trânsito e do RENAVE e as obrigações fiscais.
6.4. Revisar com o seu advogado os modelos de contrato e documentos gerados pelo sistema antes de usá-los com clientes.

7. OBRIGAÇÕES DA WB.DEV
7.1. Manter o sistema funcionando e corrigir as falhas que forem informadas, no menor prazo possível.
7.2. Fazer cópia de segurança (backup) dos dados pelo menos uma vez por semana e guardar as cópias por pelo menos [4] semanas.
7.3. Adotar medidas de segurança razoáveis para proteger os dados contra acesso não autorizado.
7.4. A WB.DEV não responde por indisponibilidades ou falhas de serviços de terceiros (provedores de hospedagem e de banco de dados, internet, portais de anúncios, serviços de assinatura eletrônica, bancos e órgãos públicos), por perdas causadas por informações incorretas cadastradas pela LOJA, nem pelas decisões comerciais da LOJA.

8. DADOS PESSOAIS (LGPD)
8.1. A LOJA é a controladora dos dados pessoais dos seus clientes, da sua equipe e dos demais titulares cadastrados no sistema. A WB.DEV atua como operadora: trata esses dados somente para prestar o serviço, conforme as instruções da LOJA e estes termos.
8.2. A WB.DEV não vende nem compartilha esses dados, exceto com os fornecedores necessários ao funcionamento do sistema (hospedagem, banco de dados, envio de e-mails) e com os serviços que a própria LOJA ativar (por exemplo, portais de anúncios e assinatura eletrônica).
8.3. Ao fim do contrato, a LOJA pode pedir uma cópia dos seus dados em até [30] dias. Depois desse prazo, a WB.DEV pode apagar os dados, salvo os que a lei mandar guardar.

9. SERVIÇOS DE TERCEIROS
9.1. Integrações como portais de anúncios, assinatura eletrônica e consultas externas dependem de contas e regras desses serviços. Os custos de terceiros (planos de anúncios, assinaturas, taxas) são da LOJA, salvo quando estiverem incluídos no plano contratado.

10. PROPRIEDADE INTELECTUAL
10.1. O sistema WB.AUTO (programas, código, estrutura e marcas WB.DEV e WB.AUTO) pertence à WB.DEV. Este contrato não transfere à LOJA nenhum direito sobre o sistema além do uso previsto aqui.
10.2. A LOJA mantém todos os direitos sobre sua marca, logo, fotos e conteúdo. O rodapé do site traz o crédito "Site e sistema: WB.AUTO".

11. VIGÊNCIA E CANCELAMENTO
11.1. Este contrato vale por prazo indeterminado, a partir do aceite.
11.2. Qualquer das partes pode cancelar com aviso prévio de [30] dias, por WhatsApp ou e-mail. As mensalidades vencidas até o fim do aviso continuam devidas. [Não há multa de cancelamento.]
11.3. O domínio do site registrado em nome da LOJA continua sendo da LOJA após o cancelamento.

12. ALTERAÇÕES DESTES TERMOS
12.1. A WB.DEV pode atualizar estes termos. A nova versão aparece no painel e precisa ser aceita pelo administrador da LOJA para continuar o uso do sistema.

13. ACEITE ELETRÔNICO
13.1. O aceite destes termos no painel, pelo administrador da LOJA, registra a data, a hora, o login (e-mail), o endereço IP, o navegador e a versão do texto aceito. As partes reconhecem esse aceite como assinatura eletrônica válida deste contrato, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, com o mesmo valor de um documento assinado em papel.

14. FORO
14.1. Fica eleito o foro da comarca de [SÃO LUÍS/MA] para resolver qualquer questão sobre este contrato.$minuta$, 'rascunho'
where not exists (select 1 from public.platform_terms);

-- 66) Conferência: passou para a seção 68, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 67) Documentos pessoais do cliente e domínio dos clientes da WB.Dev ---------------
-- Pedido do Wesley em 07/10/2026.
-- * customer_documents: tipos novos para os documentos pessoais do cliente
--   (CNH, RG/identidade, comprovante de residência e comprovante de renda),
--   anexados no cadastro do cliente e na ficha. Quem vê continua igual: admin e
--   gerente veem todos; o vendedor, os que ele anexou.
-- * client_accounts (painel WB.Dev → ficha do cliente → Dados): data da compra do
--   domínio, por quantos anos foi comprado (1 a 10), onde está registrado e quem
--   paga a renovação. O vencimento continua em domain_expires_on: o painel calcula
--   pela compra + anos, e dá para corrigir à mão.

alter table public.customer_documents drop constraint if exists customer_documents_doc_type_check;
alter table public.customer_documents add constraint customer_documents_doc_type_check
  check (doc_type in ('compra', 'entrada', 'entrega', 'pos_venda', 'garantia', 'financiamento', 'outro',
                      'cnh', 'rg', 'comprovante_residencia', 'comprovante_renda'));

alter table public.client_accounts add column if not exists domain_registered_on date;
alter table public.client_accounts add column if not exists domain_years smallint;
alter table public.client_accounts add column if not exists domain_registrar text not null default '';
alter table public.client_accounts add column if not exists domain_paid_by text not null default '';

alter table public.client_accounts drop constraint if exists client_accounts_domain_years_check;
alter table public.client_accounts add constraint client_accounts_domain_years_check
  check (domain_years is null or domain_years between 1 and 10);
alter table public.client_accounts drop constraint if exists client_accounts_domain_registrar_check;
alter table public.client_accounts add constraint client_accounts_domain_registrar_check
  check (domain_registrar in ('', 'registro_br', 'hostinger_cliente', 'hostinger_wbdev', 'outro'));
alter table public.client_accounts drop constraint if exists client_accounts_domain_paid_by_check;
alter table public.client_accounts add constraint client_accounts_domain_paid_by_check
  check (domain_paid_by in ('', 'cliente', 'wbdev'));

-- 68) Conferência: passou para a seção 70, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 69) Administradores na Equipe (pedido do Wesley em 09/10/2026) -----------------
-- * sellers.role aceita 'admin': o admin cria outro login já como administrador
--   (Edge Function manage-sellers), troca o nível de qualquer pessoa da Equipe
--   (vendedor ↔ gerente ↔ administrador) e exclui; o login acompanha (user_company).
-- * Administradores que já existiam sem cadastro na Equipe (ligados direto pelo
--   SQL, como os da Agilize) aparecem na tela (store_admins_outside_team) e qualquer
--   admin da loja os inclui (add_admin_to_team) com nome e telefone. Na Equipe eles
--   entram no WhatsApp do carro, nas vendas, nas comissões e no rodízio.
-- * Travas (sellers_guard_admin): ninguém muda o próprio nível; a loja nunca fica
--   sem administrador (o acesso da equipe WB.Dev não conta); o acesso da equipe
--   WB.Dev (platform_team) não muda pela loja; cargo personalizado é só para
--   vendedor e gerente.

alter table public.sellers drop constraint if exists sellers_role_check;
alter table public.sellers add constraint sellers_role_check check (role in ('seller', 'manager', 'admin'));
alter table public.sellers drop constraint if exists sellers_admin_no_custom_role_check;
alter table public.sellers add constraint sellers_admin_no_custom_role_check check (role <> 'admin' or custom_role_id is null);

-- Outro administrador da loja que não seja o login informado nem da equipe WB.Dev
create or replace function public.company_has_other_admin(p_company uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_company uc
    where uc.company_id = p_company and uc.role = 'admin' and uc.user_id is distinct from p_user
      and not exists (select 1 from public.platform_team t where t.user_id = uc.user_id)
      and not exists (select 1 from public.platform_admins p where p.user_id = uc.user_id))
$$;
revoke execute on function public.company_has_other_admin(uuid, uuid) from anon, authenticated, public;
grant execute on function public.company_has_other_admin(uuid, uuid) to service_role;

-- Travas da troca de nível que envolve administrador
create or replace function public.sellers_guard_admin()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role is not distinct from old.role or (old.role <> 'admin' and new.role <> 'admin') then
    return new;
  end if;
  if not public.is_service_request() then
    if not public.is_company_admin() then
      raise exception 'Só o administrador da loja muda o nível de administrador' using errcode = '42501';
    end if;
    if new.user_id is not null and new.user_id = auth.uid() then
      raise exception 'Você não pode mudar o seu próprio nível' using errcode = '42501';
    end if;
    if new.user_id is not null and exists (select 1 from public.platform_team t where t.user_id = new.user_id) then
      raise exception 'O acesso da equipe WB.Dev não pode ser mudado pela loja' using errcode = '42501';
    end if;
  end if;
  if old.role = 'admin' and new.user_id is not null and not public.company_has_other_admin(new.company_id, new.user_id) then
    raise exception 'A loja precisa de pelo menos um administrador' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists sellers_guard_admin on public.sellers;
create trigger sellers_guard_admin
before update on public.sellers
for each row execute function public.sellers_guard_admin();

-- Troca de nível: o login acompanha. Entre vendedor e gerente, como antes (vínculo
-- de admin não muda); subir para administrador ou sair dele muda o vínculo também.
create or replace function public.sellers_sync_role()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.user_id is not null and new.role is distinct from old.role then
    update public.user_company
    set role = new.role
    where user_id = new.user_id
      and company_id = new.company_id
      and role <> new.role
      and (role in ('seller', 'manager') or old.role = 'admin' or new.role = 'admin');
  end if;
  return null;
end $$;

-- Administradores da loja que ainda não estão na Equipe (fora a equipe WB.Dev)
create or replace function public.store_admins_outside_team()
returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Acesso restrito ao administrador da loja' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', uc.user_id, 'email', coalesce(u.email, ''), 'me', uc.user_id = auth.uid())
                              order by u.email), '[]'::jsonb)
    from public.user_company uc
    left join auth.users u on u.id = uc.user_id
    where uc.company_id = v_company and uc.role = 'admin'
      and not exists (select 1 from public.platform_team t where t.user_id = uc.user_id)
      and not exists (select 1 from public.platform_admins p where p.user_id = uc.user_id)
      and not exists (select 1 from public.sellers s where s.company_id = v_company and s.user_id = uc.user_id and s.deleted_at is null)
  );
end $$;
revoke execute on function public.store_admins_outside_team() from anon, public;
grant execute on function public.store_admins_outside_team() to authenticated;

-- Inclui um administrador da loja na Equipe (nome e telefone; sem comissão até o
-- admin escolher)
create or replace function public.add_admin_to_team(p_user_id uuid, p_name text, p_phone text default '')
returns public.sellers
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
  v_row public.sellers;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador da loja inclui pessoas na Equipe' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Informe o nome' using errcode = '22023';
  end if;
  if not exists (select 1 from public.user_company where user_id = p_user_id and company_id = v_company and role = 'admin') then
    raise exception 'Esse login não é administrador desta loja' using errcode = '42501';
  end if;
  if exists (select 1 from public.platform_team where user_id = p_user_id)
     or exists (select 1 from public.platform_admins where user_id = p_user_id) then
    raise exception 'O acesso da WB.Dev não entra na Equipe da loja' using errcode = '42501';
  end if;
  if exists (select 1 from public.sellers where company_id = v_company and user_id = p_user_id and deleted_at is null) then
    raise exception 'Essa pessoa já está na Equipe' using errcode = '23505';
  end if;
  insert into public.sellers (company_id, user_id, role, name, email, phone, commission_type, commission_value)
  values (v_company, p_user_id, 'admin', left(btrim(p_name), 120),
          coalesce((select email from auth.users where id = p_user_id), ''), left(btrim(coalesce(p_phone, '')), 30), 'none', 0)
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.add_admin_to_team(uuid, text, text) from anon, public;
grant execute on function public.add_admin_to_team(uuid, text, text) to authenticated;

-- Registro de atividades: a troca de nível mostra "Administrador" (mesma função da seção 63,
-- só com o nome do nível novo)
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
      -- Troca de cargo na Equipe: "cargo: Vendedor → Gerente"
      if tg_table_name = 'sellers' and ('role' = any(v_changed) or 'custom_role_id' = any(v_changed)) then
        v_details := format('cargo: %s → %s',
          coalesce((select r.name from public.custom_roles r where r.id = (old_rec->>'custom_role_id')::uuid),
                   case old_rec->>'role' when 'manager' then 'Gerente' when 'admin' then 'Administrador' else 'Vendedor' end),
          coalesce((select r.name from public.custom_roles r where r.id = (rec->>'custom_role_id')::uuid),
                   case rec->>'role' when 'manager' then 'Gerente' when 'admin' then 'Administrador' else 'Vendedor' end));
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'custom_roles' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
      when 'company_expenses' then concat('Despesa da empresa: ', coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
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


-- 70) Conferência: passou para a seção 74, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 71) Preenchimento automático do cadastro do carro (FIPE, CRLV-e, foto e placa) ---
-- Pedido do Wesley em 09/10/2026. Quem fala com a tabela FIPE, lê o CRLV-e (PDF
-- ou foto, esta pela IA) e consulta a placa é a Edge Function veiculo-dados; o
-- painel nunca chama esses serviços direto.
-- * cars.fipe: a versão FIPE escolhida e o valor do mês (código FIPE, nome,
--   códigos de marca, modelo e ano, ano-modelo, combustível, valor e mês de
--   referência). Não vai para o site: a coluna fica fora da lista de colunas que
--   o anônimo lê. A staff_cars ganha a coluna (gerente e vendedor também usam).
-- * fipe_cache: respostas da FIPE, as mesmas para todas as lojas (listas por 30
--   dias; o valor até virar o mês de referência).
-- * placa_cache: consulta paga por placa (só com os segredos da APIBrasil), por 30
--   dias, só com dados do veículo (nada do dono). placa_consultas: cada consulta
--   (loja, placa, se veio do cache), para conferir a cobrança e o teto diário.
-- Só a chave de serviço (a função) lê e grava as três tabelas: RLS ligada, sem
-- regras, e nenhuma permissão para anon ou authenticated.
-- * Créditos da consulta por placa (pré-pago, no fim da seção): a loja compra
--   pacotes pelo PIX da WB.Dev e cada consulta nova debita o preço do saldo; a
--   leitura da foto do documento sai do mesmo saldo, com preço próprio.

alter table public.cars add column if not exists fipe jsonb not null default '{}';
alter table public.cars drop constraint if exists cars_fipe_check;
alter table public.cars add constraint cars_fipe_check check (jsonb_typeof(fipe) = 'object');

-- Estoque da equipe (admin, gerente e vendedor): tudo menos o custo de compra.
drop view if exists public.staff_cars;
create view public.staff_cars as
select
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, hidden, sold_at, plate, chassis, renavam, documents, customer_id, stock_alert_days,
  company_id, created_at, updated_at, internal_notes, intake_items, inspection,
  entry_type, owner_customer_id, whatsapp_seller_id,
  renave_entry_status, renave_entry_on, renave_entry_protocol,
  renave_exit_status, renave_exit_on, renave_exit_protocol,
  olx_publish, olx_catalog, webmotors_publish, webmotors_catalog, fipe
from public.cars
where company_id = public.current_company_id() and public.can_edit_stock()
with local check option;

revoke all on public.staff_cars from anon, authenticated, public;
grant select, insert, update on public.staff_cars to authenticated;

create table if not exists public.fipe_cache (
  key text primary key check (char_length(key) between 1 and 120),
  data jsonb not null,
  reference text not null default '',
  fetched_at timestamptz not null default now()
);
alter table public.fipe_cache enable row level security;
revoke all on public.fipe_cache from anon, authenticated, public;

create table if not exists public.placa_cache (
  plate text primary key check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  fetched_at timestamptz not null default now()
);
alter table public.placa_cache enable row level security;
revoke all on public.placa_cache from anon, authenticated, public;

create table if not exists public.placa_consultas (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  plate text not null check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  from_cache boolean not null default false,
  provider text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists placa_consultas_company_idx on public.placa_consultas (company_id, created_at desc);
alter table public.placa_consultas enable row level security;
revoke all on public.placa_consultas from anon, authenticated, public;

-- Créditos da consulta por placa (decisões do Wesley em 09/10/2026) ----------------
-- * Pré-pago: o admin da loja escolhe um pacote (platform_settings.plate_packages,
--   em reais), paga pelo PIX da WB.Dev e clica em "Já paguei" (plate_credit_orders).
--   A WB.Dev confirma em Plataforma → Cobrança e o valor entra no saldo.
-- * O saldo é a soma do extrato (plate_credit_ledger): recarga (+), consulta (−) e
--   ajuste feito pela WB.Dev (+ ou −).
-- * Cada consulta nova que acha o carro debita o preço (plate_price, R$ 0,40).
--   Placa não encontrada ou erro não cobra; a mesma placa de novo na mesma loja em
--   30 dias também não. Quem debita é a função veiculo-dados, com a chave de
--   serviço: plate_credit_hold (reserva antes de consultar, com trava por loja) e
--   plate_credit_release (devolve se a consulta não deu certo).
-- * A equipe toda vê o saldo (para consultar); extrato e compra são do admin.
-- * Leitura da FOTO do documento pela IA (decisão do Wesley: desconta dos mesmos
--   créditos, com preço próprio, doc_photo_price, padrão R$ 0,20): reserva com
--   doc_photo_credit_hold e devolve com plate_credit_release se a foto não der leitura.
alter table public.platform_settings add column if not exists plate_price numeric(6, 2) not null default 0.40;
alter table public.platform_settings add column if not exists doc_photo_price numeric(6, 2) not null default 0.20;
alter table public.platform_settings drop constraint if exists platform_settings_doc_photo_price_check;
alter table public.platform_settings add constraint platform_settings_doc_photo_price_check check (doc_photo_price > 0 and doc_photo_price <= 50);
alter table public.platform_settings add column if not exists plate_packages numeric(10, 2)[] not null default '{20,40,100}';
alter table public.platform_settings drop constraint if exists platform_settings_plate_price_check;
alter table public.platform_settings add constraint platform_settings_plate_price_check check (plate_price > 0 and plate_price <= 50);
alter table public.platform_settings drop constraint if exists platform_settings_plate_packages_check;
alter table public.platform_settings add constraint platform_settings_plate_packages_check
  check (cardinality(plate_packages) between 1 and 6 and 0 < all (plate_packages) and 10000 >= all (plate_packages));

create table if not exists public.plate_credit_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  paid_on date not null,
  receipt jsonb check (receipt is null or jsonb_typeof(receipt) = 'object'),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'recusado')),
  response text not null default '' check (char_length(response) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  notified_at timestamptz
);
create index if not exists plate_credit_orders_company_idx on public.plate_credit_orders (company_id, created_at desc);
create index if not exists plate_credit_orders_pending_idx on public.plate_credit_orders (created_at) where status = 'pendente';
alter table public.plate_credit_orders enable row level security;
revoke all on public.plate_credit_orders from anon;
revoke insert, update, delete on public.plate_credit_orders from authenticated;

drop policy if exists "Store admins and platform read plate credit orders" on public.plate_credit_orders;
create policy "Store admins and platform read plate credit orders"
on public.plate_credit_orders for select
to authenticated
using ((company_id = public.current_company_id() and public.is_company_admin()) or public.is_platform_admin());

create table if not exists public.plate_credit_ledger (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('recarga', 'consulta', 'documento', 'ajuste')),
  amount numeric(10, 2) not null check (amount <> 0),
  plate text check (plate is null or plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  order_id uuid references public.plate_credit_orders(id) on delete set null,
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'consulta') = (plate is not null)),
  check (kind not in ('consulta', 'documento') or amount < 0),
  check (kind <> 'recarga' or amount > 0)
);
create index if not exists plate_credit_ledger_company_idx on public.plate_credit_ledger (company_id, created_at desc);
create index if not exists plate_credit_ledger_plate_idx on public.plate_credit_ledger (company_id, plate, created_at desc) where kind = 'consulta';
alter table public.plate_credit_ledger enable row level security;
revoke all on public.plate_credit_ledger from anon;
revoke insert, update, delete on public.plate_credit_ledger from authenticated;

drop policy if exists "Store admins and platform read plate credit ledger" on public.plate_credit_ledger;
create policy "Store admins and platform read plate credit ledger"
on public.plate_credit_ledger for select
to authenticated
using ((company_id = public.current_company_id() and public.is_company_admin()) or public.is_platform_admin());

create or replace function public.plate_credit_balance(p_company uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(amount), 0) from public.plate_credit_ledger where company_id = p_company
$$;
revoke execute on function public.plate_credit_balance(uuid) from anon, authenticated, public;
grant execute on function public.plate_credit_balance(uuid) to service_role;

-- Saldo, preço e pacotes para a equipe da loja; pedidos e extrato só para o admin
create or replace function public.my_plate_credits()
returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
  v_admin boolean := public.is_company_admin();
  s public.platform_settings%rowtype;
begin
  if v_company is null then
    raise exception 'Acesso restrito à equipe da loja' using errcode = '42501';
  end if;
  select * into s from public.platform_settings where id = 1;
  return jsonb_build_object(
    'balance', public.plate_credit_balance(v_company),
    'price', coalesce(s.plate_price, 0.40),
    'doc_price', coalesce(s.doc_photo_price, 0.20),
    'packages', to_jsonb(coalesce(s.plate_packages, '{20,40,100}'::numeric[])),
    'admin', v_admin,
    'orders', case when v_admin then (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'amount', o.amount, 'paid_on', o.paid_on, 'status', o.status,
        'response', o.response, 'created_at', o.created_at) order by o.created_at desc), '[]'::jsonb)
      from (select * from public.plate_credit_orders where company_id = v_company order by created_at desc limit 20) o
    ) else '[]'::jsonb end,
    'ledger', case when v_admin then (
      select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'amount', l.amount, 'plate', l.plate,
        'note', l.note, 'created_at', l.created_at, 'user_email', coalesce(u.email, '')) order by l.created_at desc, l.id desc), '[]'::jsonb)
      from (select * from public.plate_credit_ledger where company_id = v_company order by created_at desc, id desc limit 50) l
      left join auth.users u on u.id = l.created_by
    ) else '[]'::jsonb end);
end $$;
revoke execute on function public.my_plate_credits() from anon, public;
grant execute on function public.my_plate_credits() to authenticated;

-- "Já paguei" dos créditos: o admin da loja informa o pacote pago
create or replace function public.request_plate_credit(p_amount numeric, p_paid_on date, p_receipt jsonb default null, p_note text default '')
returns public.plate_credit_orders
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
  v_packages numeric[];
  v_row public.plate_credit_orders;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Só o administrador da loja compra créditos' using errcode = '42501';
  end if;
  select plate_packages into v_packages from public.platform_settings where id = 1;
  if p_amount is null or not (p_amount = any (coalesce(v_packages, '{20,40,100}'::numeric[]))) then
    raise exception 'Escolha um dos pacotes de crédito' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'America/Fortaleza')::date + 1 then
    raise exception 'Informe a data do pagamento' using errcode = '22023';
  end if;
  if p_receipt is not null and (p_receipt ->> 'path') is not null
     and split_part(p_receipt ->> 'path', '/', 1) <> v_company::text then
    raise exception 'Comprovante de outra loja' using errcode = '42501';
  end if;
  -- Clique repetido: o mesmo pacote, no mesmo dia, há poucos minutos
  if exists (select 1 from public.plate_credit_orders o where o.company_id = v_company and o.status = 'pendente'
             and o.amount = p_amount and o.paid_on = p_paid_on and o.created_at > now() - interval '10 minutes') then
    raise exception 'Esse pagamento já foi informado. Aguarde a WB.Dev conferir.' using errcode = '23505';
  end if;
  insert into public.plate_credit_orders (company_id, amount, paid_on, receipt, note, created_by_email)
  values (v_company, p_amount, p_paid_on, p_receipt, left(coalesce(p_note, ''), 500),
          coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.request_plate_credit(numeric, date, jsonb, text) from anon, public;
grant execute on function public.request_plate_credit(numeric, date, jsonb, text) to authenticated;

-- A WB.Dev confirma (o valor entra no saldo) ou recusa com o motivo (a loja vê)
create or replace function public.platform_review_plate_credit(p_id uuid, p_confirm boolean, p_response text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  o public.plate_credit_orders;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  select * into o from public.plate_credit_orders where id = p_id for update;
  if not found then
    raise exception 'Compra de créditos não encontrada' using errcode = 'P0002';
  end if;
  if o.status <> 'pendente' then
    raise exception 'Esta compra já foi conferida' using errcode = '22023';
  end if;
  if not p_confirm and btrim(coalesce(p_response, '')) = '' then
    raise exception 'Escreva o motivo (a loja vê)' using errcode = '22023';
  end if;
  if p_confirm then
    insert into public.plate_credit_ledger (company_id, kind, amount, order_id, note, created_by)
    values (o.company_id, 'recarga', o.amount, o.id, 'Pacote pago por PIX', auth.uid());
  end if;
  update public.plate_credit_orders
  set status = case when p_confirm then 'confirmado' else 'recusado' end,
      response = left(coalesce(p_response, ''), 500),
      reviewed_at = now()
  where id = p_id;
  return jsonb_build_object('status', case when p_confirm then 'confirmado' else 'recusado' end,
                            'balance', public.plate_credit_balance(o.company_id));
end $$;
revoke execute on function public.platform_review_plate_credit(uuid, boolean, text) from anon, public;
grant execute on function public.platform_review_plate_credit(uuid, boolean, text) to authenticated;

-- Ajuste da WB.Dev (bônus, devolução): com motivo e sem deixar o saldo negativo
create or replace function public.platform_adjust_plate_credit(p_company uuid, p_amount numeric, p_note text)
returns numeric
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000 then
    raise exception 'Informe o valor do ajuste' using errcode = '22023';
  end if;
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'Escreva o motivo do ajuste' using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies where id = p_company) then
    raise exception 'Loja não encontrada' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plate_credit:' || p_company::text, 0));
  if public.plate_credit_balance(p_company) + p_amount < 0 then
    raise exception 'O ajuste deixaria o saldo negativo' using errcode = '22023';
  end if;
  insert into public.plate_credit_ledger (company_id, kind, amount, note, created_by)
  values (p_company, 'ajuste', p_amount, left(btrim(p_note), 200), auth.uid());
  return public.plate_credit_balance(p_company);
end $$;
revoke execute on function public.platform_adjust_plate_credit(uuid, numeric, text) from anon, public;
grant execute on function public.platform_adjust_plate_credit(uuid, numeric, text) to authenticated;

-- Saldo de cada loja e consultas pagas em 30 dias (Plataforma → Cobrança)
create or replace function public.platform_plate_credits()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'company_id', c.id, 'name', c.name, 'slug', c.slug,
      'balance', coalesce(t.balance, 0), 'queries_30d', coalesce(t.queries_30d, 0), 'docs_30d', coalesce(t.docs_30d, 0),
      'spent_30d', coalesce(t.spent_30d, 0), 'bought_total', coalesce(t.bought_total, 0),
      'last_recharge_at', t.last_recharge_at) order by c.name), '[]'::jsonb)
    from public.companies c
    left join lateral (
      select sum(l.amount) as balance,
             count(*) filter (where l.kind = 'consulta' and l.created_at > now() - interval '30 days') as queries_30d,
             count(*) filter (where l.kind = 'documento' and l.created_at > now() - interval '30 days') as docs_30d,
             -sum(l.amount) filter (where l.kind in ('consulta', 'documento') and l.created_at > now() - interval '30 days') as spent_30d,
             sum(l.amount) filter (where l.kind = 'recarga') as bought_total,
             max(l.created_at) filter (where l.kind = 'recarga') as last_recharge_at
      from public.plate_credit_ledger l where l.company_id = c.id
    ) t on true
    where exists (select 1 from public.plate_credit_ledger l where l.company_id = c.id)
       or exists (select 1 from public.plate_credit_orders o where o.company_id = c.id)
  );
end $$;
revoke execute on function public.platform_plate_credits() from anon, public;
grant execute on function public.platform_plate_credits() to authenticated;

-- Só a função veiculo-dados (chave de serviço): reserva o valor antes de consultar.
-- A mesma placa já cobrada desta loja em 30 dias sai de graça (charged = false).
-- Sem saldo: erro SALDO_INSUFICIENTE.
create or replace function public.plate_credit_hold(p_company uuid, p_plate text, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_price numeric;
  v_balance numeric;
  v_id bigint;
begin
  if p_company is null or p_plate is null or p_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Placa inválida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plate_credit:' || p_company::text, 0));
  v_balance := public.plate_credit_balance(p_company);
  if exists (select 1 from public.plate_credit_ledger l where l.company_id = p_company and l.kind = 'consulta'
             and l.plate = p_plate and l.created_at > now() - interval '30 days') then
    return jsonb_build_object('charged', false, 'balance', v_balance);
  end if;
  v_price := coalesce((select plate_price from public.platform_settings where id = 1), 0.40);
  if v_balance < v_price then
    raise exception 'SALDO_INSUFICIENTE' using errcode = 'P0001';
  end if;
  insert into public.plate_credit_ledger (company_id, kind, amount, plate, created_by)
  values (p_company, 'consulta', -v_price, p_plate, p_user)
  returning id into v_id;
  return jsonb_build_object('charged', true, 'ledger_id', v_id, 'price', v_price, 'balance', v_balance - v_price);
end $$;
revoke execute on function public.plate_credit_hold(uuid, text, uuid) from anon, authenticated, public;
grant execute on function public.plate_credit_hold(uuid, text, uuid) to service_role;

-- Só a função veiculo-dados: reserva o preço da leitura da foto do documento.
-- Sem saldo: erro SALDO_INSUFICIENTE.
create or replace function public.doc_photo_credit_hold(p_company uuid, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_price numeric;
  v_balance numeric;
  v_id bigint;
begin
  if p_company is null then
    raise exception 'Loja inválida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plate_credit:' || p_company::text, 0));
  v_balance := public.plate_credit_balance(p_company);
  v_price := coalesce((select doc_photo_price from public.platform_settings where id = 1), 0.20);
  if v_balance < v_price then
    raise exception 'SALDO_INSUFICIENTE' using errcode = 'P0001';
  end if;
  insert into public.plate_credit_ledger (company_id, kind, amount, created_by)
  values (p_company, 'documento', -v_price, p_user)
  returning id into v_id;
  return jsonb_build_object('charged', true, 'ledger_id', v_id, 'price', v_price, 'balance', v_balance - v_price);
end $$;
revoke execute on function public.doc_photo_credit_hold(uuid, uuid) from anon, authenticated, public;
grant execute on function public.doc_photo_credit_hold(uuid, uuid) to service_role;

-- Devolve a reserva quando a consulta não achou o carro, a foto não deu leitura ou deu erro
create or replace function public.plate_credit_release(p_id bigint)
returns void
language sql security definer set search_path = public
as $$
  delete from public.plate_credit_ledger where id = p_id and kind in ('consulta', 'documento')
$$;
revoke execute on function public.plate_credit_release(bigint) from anon, authenticated, public;
grant execute on function public.plate_credit_release(bigint) to service_role;

-- 72) Rascunhos do celular (pedido do Wesley em 09/10/2026) -----------------------
-- * "Fotos pelo celular" (painel): a pessoa da equipe tira as fotos do carro pela
--   câmera e elas ficam num rascunho, fora do estoque e do site. Depois, no
--   computador, "Completar cadastro" abre o Novo carro com as fotos; ao salvar o
--   carro, o rascunho sai.
-- * As fotos são as do site (/uploads/carros/...), como as de cars.images.
-- * Quem vê e mexe: a equipe ativa da loja (can_edit_stock). Quem criou e o nome
--   vêm do login, não do que o navegador manda.
create table if not exists public.car_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_name text not null default '' check (char_length(created_by_name) <= 160),
  images jsonb not null default '[]'::jsonb,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint car_drafts_images_check check (
    jsonb_typeof(images) = 'array'
    and jsonb_array_length(images) <= 60
    and not jsonb_path_exists(images, '$[*] ? (@.type() != "string")')
    and not jsonb_path_exists(images, '$[*] ? (!(@ starts with "/uploads/carros/"))')
  )
);
create index if not exists car_drafts_company_idx on public.car_drafts (company_id, created_at desc);

-- Autor: o login de quem cria (nome da Equipe ou o e-mail); a loja e o autor não mudam depois
create or replace function public.car_drafts_set_author()
returns trigger
language plpgsql security definer set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_service_request() then return new; end if;
    new.created_by := auth.uid();
    new.created_by_name := left(coalesce(
      (select s.name from public.sellers s
        where s.user_id = auth.uid() and s.company_id = new.company_id and s.deleted_at is null limit 1),
      (select u.email from auth.users u where u.id = auth.uid()),
      ''), 160);
  else
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

drop trigger if exists car_drafts_set_author on public.car_drafts;
create trigger car_drafts_set_author before insert or update on public.car_drafts
for each row execute function public.car_drafts_set_author();

drop trigger if exists car_drafts_set_updated_at on public.car_drafts;
create trigger car_drafts_set_updated_at before update on public.car_drafts
for each row execute function public.set_updated_at();

alter table public.car_drafts enable row level security;
revoke all on public.car_drafts from anon, public;
grant select, insert, update, delete on public.car_drafts to authenticated;

drop policy if exists "Equipe lê os rascunhos da loja" on public.car_drafts;
create policy "Equipe lê os rascunhos da loja"
on public.car_drafts for select
to authenticated
using (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Equipe cria rascunhos na loja" on public.car_drafts;
create policy "Equipe cria rascunhos na loja"
on public.car_drafts for insert
to authenticated
with check (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Equipe muda os rascunhos da loja" on public.car_drafts;
create policy "Equipe muda os rascunhos da loja"
on public.car_drafts for update
to authenticated
using (company_id = public.current_company_id() and public.can_edit_stock())
with check (company_id = public.current_company_id() and public.can_edit_stock());

drop policy if exists "Equipe apaga os rascunhos da loja" on public.car_drafts;
create policy "Equipe apaga os rascunhos da loja"
on public.car_drafts for delete
to authenticated
using (company_id = public.current_company_id() and public.can_edit_stock());

-- 73) Valores privados do carro (pedido do Wesley em 09/10/2026) -------------------
-- Para lojas com dois ou três sócios. Quem ativa os "Valores privados" num carro
-- vira o dono do cadeado: só ele (e quem ele liberar) vê o custo de aquisição, os
-- gastos e o que sai deles (custo total, margem, lucro). Os outros administradores
-- veem e editam o carro como o gerente (pela staff_cars, sem o custo), lançam
-- gastos sem ver os valores, e o painel deixa o carro fora das contas de dinheiro
-- deles, com o aviso "N carros com valores privados". Decisões do Wesley: nome
-- "Valores privados"; fora dos totais de quem não vê; o dono libera para todos,
-- libera para pessoas escolhidas e passa o cadeado para outro administrador.
-- * cars.created_by: quem cadastrou. Ativa o cadeado quem cadastrou, se for
--   administrador; carro cadastrado por vendedor ou gerente (ou antes desta seção)
--   pode ser trancado por qualquer administrador que veja os valores.
-- * car_private_values: um registro por carro com cadeado (dono e liberados). Só
--   as funções gravam e ninguém lê direto. Dono que deixou de ser administrador da
--   loja (ou saiu dela) não tranca mais nada: os valores voltam a ser de todos.
-- * can_see_car_values(carro) entra nas regras de cars (o admin só lê e grava
--   direto o carro cujos valores vê), car_expenses (ler, editar e excluir), anexos
--   dos gastos e set_car_purchase. Lançar gasto continua livre para a equipe.
-- * Registro de atividades: gasto de carro com cadeado entra sem o valor, e ao
--   ativar o cadeado os gastos já registrados daquele carro perdem o valor.

alter table public.cars add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.cars alter column created_by set default auth.uid();

-- Quem cadastrou vem do login e não muda depois (sem login = SQL Editor ou função)
create or replace function public.cars_keep_created_by()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

drop trigger if exists cars_keep_created_by on public.cars;
create trigger cars_keep_created_by
before insert or update on public.cars
for each row execute function public.cars_keep_created_by();

create table if not exists public.car_private_values (
  car_id uuid primary key references public.cars(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  viewers uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_private_values_company_idx on public.car_private_values (company_id);

drop trigger if exists car_private_values_set_updated_at on public.car_private_values;
create trigger car_private_values_set_updated_at
before update on public.car_private_values
for each row execute function public.set_updated_at();

-- Só as funções abaixo leem e gravam (RLS ligada, sem regras)
alter table public.car_private_values enable row level security;
revoke all on public.car_private_values from anon, authenticated, public;

-- O dono do cadeado ainda é administrador da loja? (senão o cadeado não vale)
create or replace function public.car_values_owner_active(p_user uuid, p_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_company uc
    where uc.user_id = p_user and uc.company_id = p_company and uc.role = 'admin')
$$;
revoke execute on function public.car_values_owner_active(uuid, uuid) from anon, authenticated, public;

-- Quem chama vê os valores do carro? Sem cadeado (ou cadeado de quem saiu), sim;
-- com cadeado, só o dono e os liberados.
create or replace function public.can_see_car_values(p_car uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.car_private_values v
    where v.car_id = p_car
      and v.owner_id is distinct from auth.uid()
      and not coalesce(auth.uid() = any (v.viewers), false)
      and public.car_values_owner_active(v.owner_id, v.company_id))
$$;
revoke execute on function public.can_see_car_values(uuid) from anon, public;
grant execute on function public.can_see_car_values(uuid) to authenticated;

-- Anexos dos gastos ficam em <loja>/<carro>/...; a pasta "empresa" (despesas da
-- empresa, seção 63) não é de carro
create or replace function public.can_see_car_values_folder(p_folder text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_see_car_values(p_folder::uuid)
    else true
  end
$$;
revoke execute on function public.can_see_car_values_folder(text) from anon, public;
grant execute on function public.can_see_car_values_folder(text) to authenticated;

-- Nome da pessoa na loja: o da Equipe ou, sem cadastro, o e-mail do login
create or replace function public.company_person_name(p_user uuid, p_company uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(s.name), '') from public.sellers s
     where s.user_id = p_user and s.company_id = p_company and s.deleted_at is null
     order by s.created_at limit 1),
    (select u.email from auth.users u where u.id = p_user),
    'Administrador')
$$;
revoke execute on function public.company_person_name(uuid, uuid) from anon, authenticated, public;

-- Carros: o admin lê, grava e exclui direto só o carro cujos valores vê; o resto
-- ele lê e grava pela staff_cars (sem o custo), como o gerente
drop policy if exists "Authenticated can read own company cars" on public.cars;
create policy "Authenticated can read own company cars"
on public.cars for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin() and public.can_see_car_values(id));

drop policy if exists "Authenticated can update cars" on public.cars;
create policy "Authenticated can update cars"
on public.cars for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin() and public.can_see_car_values(id))
with check (company_id = public.current_company_id() and public.is_company_admin());

drop policy if exists "Authenticated can delete cars" on public.cars;
create policy "Authenticated can delete cars"
on public.cars for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin() and public.can_see_car_values(id));

-- Gastos: ler, editar e excluir só com os valores à vista (lançar continua livre)
drop policy if exists "Authenticated can read expenses" on public.car_expenses;
create policy "Authenticated can read expenses"
on public.car_expenses for select
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin() and public.can_see_car_values(car_id));

drop policy if exists "Authenticated can update expenses" on public.car_expenses;
create policy "Authenticated can update expenses"
on public.car_expenses for update
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin() and public.can_see_car_values(car_id))
with check (company_id = public.current_company_id() and public.is_company_admin() and public.can_see_car_values(car_id));

drop policy if exists "Authenticated can delete expenses" on public.car_expenses;
create policy "Authenticated can delete expenses"
on public.car_expenses for delete
to authenticated
using (company_id = public.current_company_id() and public.is_company_admin() and public.can_see_car_values(car_id));

drop policy if exists "Authenticated can view expense attachments" on storage.objects;
create policy "Authenticated can view expense attachments"
on storage.objects for select
to authenticated
using (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text
       and public.is_company_admin() and public.can_see_car_values_folder((storage.foldername(name))[2]));

drop policy if exists "Authenticated can delete expense attachments" on storage.objects;
create policy "Authenticated can delete expense attachments"
on storage.objects for delete
to authenticated
using (bucket_id = 'expense-attachments' and (storage.foldername(name))[1] = public.current_company_id()::text
       and public.is_company_admin() and public.can_see_car_values_folder((storage.foldername(name))[2]));

-- Custo de aquisição: carro com cadeado, só o dono e os liberados (o resto como antes)
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
  if not public.can_see_car_values(p_car_id) then
    raise exception 'Os valores deste carro são privados.' using errcode = '42501';
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

-- Linha do histórico das ações do cadeado
create or replace function public.car_values_log(p_car uuid, p_details text)
returns void
language sql security definer set search_path = public
as $$
  insert into public.activity_log (company_id, user_id, user_email, action, entity, entity_id, label, details)
  select c.company_id, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), 'update', 'cars', c.id,
         concat_ws(' ', c.brand, c.model, c.version), p_details
  from public.cars c where c.id = p_car
$$;
revoke execute on function public.car_values_log(uuid, text) from anon, authenticated, public;

-- Situação do cadeado de um carro (tela do carro; só administrador)
create or replace function public.car_values_state(p_car uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_me uuid := auth.uid();
  v_creator uuid;
  v_lock public.car_private_values%rowtype;
  v_active boolean := false;
  v_creator_admin boolean;
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Acesso restrito ao administrador da loja' using errcode = '42501';
  end if;
  select created_by into v_creator from public.cars where id = p_car and company_id = v_company;
  if not found then
    raise exception 'Carro não encontrado';
  end if;
  select * into v_lock from public.car_private_values where car_id = p_car;
  if found then
    v_active := public.car_values_owner_active(v_lock.owner_id, v_company);
  end if;
  -- Carro cadastrado por outro administrador: só ele ativa
  v_creator_admin := v_creator is not null and v_creator is distinct from v_me
    and public.car_values_owner_active(v_creator, v_company);
  return jsonb_build_object(
    'locked', v_active,
    'owner_name', case when v_active then public.company_person_name(v_lock.owner_id, v_company) end,
    'is_owner', coalesce(v_active and v_lock.owner_id = v_me, false),
    'can_see', public.can_see_car_values(p_car),
    'since', case when v_active then v_lock.created_at end,
    'viewers', case when v_active and v_lock.owner_id = v_me then (
      select coalesce(jsonb_agg(jsonb_build_object('id', u, 'name', public.company_person_name(u, v_company))
                                order by public.company_person_name(u, v_company)), '[]'::jsonb)
      from unnest(v_lock.viewers) u
      where public.car_values_owner_active(u, v_company)) else '[]'::jsonb end,
    'can_lock', not v_active and not v_creator_admin,
    'creator_name', case when v_creator_admin then public.company_person_name(v_creator, v_company) end);
end $$;
revoke execute on function public.car_values_state(uuid) from anon, public;
grant execute on function public.car_values_state(uuid) to authenticated;

-- Carros com cadeado da loja (listas do painel; só administrador, senão vazio)
create or replace function public.car_private_values_list()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'car_id', v.car_id,
           'owner_name', public.company_person_name(v.owner_id, v.company_id),
           'is_owner', v.owner_id = auth.uid(),
           'can_see', public.can_see_car_values(v.car_id))), '[]'::jsonb)
  from public.car_private_values v
  where v.company_id = public.current_company_id() and public.is_company_admin()
    and public.car_values_owner_active(v.owner_id, v.company_id)
$$;
revoke execute on function public.car_private_values_list() from anon, public;
grant execute on function public.car_private_values_list() to authenticated;

-- Pessoa que pode receber o cadeado ou ver os valores: administrador da loja, fora
-- a equipe WB.Dev e o dono da plataforma
create or replace function public.car_values_valid_person(p_user uuid, p_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_user is not null
    and public.car_values_owner_active(p_user, p_company)
    and not exists (select 1 from public.platform_team t where t.user_id = p_user)
    and not exists (select 1 from public.platform_admins p where p.user_id = p_user)
$$;
revoke execute on function public.car_values_valid_person(uuid, uuid) from anon, authenticated, public;

-- Administradores da loja para liberar ou passar o cadeado (fora quem chama)
create or replace function public.car_values_people()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if v_company is null or not public.is_company_admin() then
    raise exception 'Acesso restrito ao administrador da loja' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('id', uc.user_id, 'name', public.company_person_name(uc.user_id, v_company))
                              order by public.company_person_name(uc.user_id, v_company)), '[]'::jsonb)
    from public.user_company uc
    where uc.company_id = v_company and uc.role = 'admin' and uc.user_id is distinct from auth.uid()
      and public.car_values_valid_person(uc.user_id, v_company));
end $$;
revoke execute on function public.car_values_people() from anon, public;
grant execute on function public.car_values_people() to authenticated;

-- Ativar o cadeado
create or replace function public.car_values_lock(p_car uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_state jsonb := public.car_values_state(p_car);
begin
  if (v_state->>'locked')::boolean then
    raise exception 'Os valores deste carro já são privados (de %).', v_state->>'owner_name' using errcode = '42501';
  end if;
  if not (v_state->>'can_lock')::boolean then
    raise exception 'Só quem cadastrou este carro (%) pode ativar os valores privados.', v_state->>'creator_name' using errcode = '42501';
  end if;
  -- Cadeado de quem deixou de ser administrador sai antes
  delete from public.car_private_values where car_id = p_car;
  insert into public.car_private_values (car_id, company_id, owner_id) values (p_car, v_company, auth.uid());
  -- No histórico, os gastos já registrados deste carro perdem o valor
  update public.activity_log a
  set label = regexp_replace(a.label, ' — R\$ \S+$', ' — valor privado')
  where a.company_id = v_company and a.entity = 'car_expenses'
    and a.entity_id in (select e.id from public.car_expenses e where e.car_id = p_car);
  perform public.car_values_log(p_car, 'valores privados: ativados');
end $$;
revoke execute on function public.car_values_lock(uuid) from anon, public;
grant execute on function public.car_values_lock(uuid) to authenticated;

-- Liberar para todos (tira o cadeado)
create or replace function public.car_values_unlock(p_car uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.car_values_state(p_car)->>'is_owner')::boolean then
    raise exception 'Só quem ativou os valores privados pode liberar.' using errcode = '42501';
  end if;
  delete from public.car_private_values where car_id = p_car;
  perform public.car_values_log(p_car, 'valores privados: liberados para todos');
end $$;
revoke execute on function public.car_values_unlock(uuid) from anon, public;
grant execute on function public.car_values_unlock(uuid) to authenticated;

-- Escolher quem mais vê (lista completa; vazia = só o dono)
create or replace function public.car_values_share(p_car uuid, p_viewers uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_list uuid[];
begin
  if not (public.car_values_state(p_car)->>'is_owner')::boolean then
    raise exception 'Só quem ativou os valores privados escolhe quem vê.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct u), '{}') into v_list
  from unnest(coalesce(p_viewers, '{}'::uuid[])) u
  where u is distinct from auth.uid();
  if exists (select 1 from unnest(v_list) u where not public.car_values_valid_person(u, v_company)) then
    raise exception 'Só dá para liberar para administradores da loja.' using errcode = '42501';
  end if;
  update public.car_private_values set viewers = v_list where car_id = p_car;
  perform public.car_values_log(p_car, case
    when cardinality(v_list) = 0 then 'valores privados: só o dono vê'
    else 'valores privados: liberados para ' || (select string_agg(public.company_person_name(u, v_company), ', ') from unnest(v_list) u)
  end);
end $$;
revoke execute on function public.car_values_share(uuid, uuid[]) from anon, public;
grant execute on function public.car_values_share(uuid, uuid[]) to authenticated;

-- Passar o cadeado para outro administrador (quem passa continua vendo, se quiser)
create or replace function public.car_values_transfer(p_car uuid, p_new_owner uuid, p_keep_access boolean default true)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_viewers uuid[];
begin
  if not (public.car_values_state(p_car)->>'is_owner')::boolean then
    raise exception 'Só quem ativou os valores privados pode passar o cadeado.' using errcode = '42501';
  end if;
  if p_new_owner is not distinct from auth.uid() or not public.car_values_valid_person(p_new_owner, v_company) then
    raise exception 'Escolha outro administrador da loja.' using errcode = '42501';
  end if;
  select viewers into v_viewers from public.car_private_values where car_id = p_car for update;
  update public.car_private_values
  set owner_id = p_new_owner,
      viewers = (select coalesce(array_agg(distinct u), '{}')
                 from unnest(array_remove(v_viewers, p_new_owner)
                             || case when coalesce(p_keep_access, true) then array[auth.uid()] else '{}'::uuid[] end) u)
  where car_id = p_car;
  perform public.car_values_log(p_car, 'valores privados: cadeado passado para ' || public.company_person_name(p_new_owner, v_company)
    || case when coalesce(p_keep_access, true) then ' (quem passou continua vendo)' else '' end);
end $$;
revoke execute on function public.car_values_transfer(uuid, uuid, boolean) from anon, public;
grant execute on function public.car_values_transfer(uuid, uuid, boolean) to authenticated;

-- Registro de atividades: gasto de carro com cadeado (ou de carro excluído) entra
-- sem o valor (mesma função da seção 69, só com essa troca)
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
      -- Troca de cargo na Equipe: "cargo: Vendedor → Gerente"
      if tg_table_name = 'sellers' and ('role' = any(v_changed) or 'custom_role_id' = any(v_changed)) then
        v_details := format('cargo: %s → %s',
          coalesce((select r.name from public.custom_roles r where r.id = (old_rec->>'custom_role_id')::uuid),
                   case old_rec->>'role' when 'manager' then 'Gerente' when 'admin' then 'Administrador' else 'Vendedor' end),
          coalesce((select r.name from public.custom_roles r where r.id = (rec->>'custom_role_id')::uuid),
                   case rec->>'role' when 'manager' then 'Gerente' when 'admin' then 'Administrador' else 'Vendedor' end));
      end if;
    end if;

    v_label := case tg_table_name
      when 'cars' then concat_ws(' ', rec->>'brand', rec->>'model', rec->>'version')
      when 'customers' then rec->>'name'
      when 'suppliers' then rec->>'name'
      when 'sellers' then rec->>'name'
      when 'contract_templates' then rec->>'name'
      when 'custom_roles' then rec->>'name'
      when 'contracts' then concat(case rec->>'document_type' when 'recibo' then 'Recibo' else 'Contrato' end, ' — ', rec->>'buyer_name')
      when 'car_expenses' then concat(coalesce(nullif(rec->>'description', ''), rec->>'category'),
        case
          when exists (select 1 from public.car_private_values v where v.car_id = (rec->>'car_id')::uuid)
            or not exists (select 1 from public.cars c where c.id = (rec->>'car_id')::uuid)
            then ' — valor privado'
          else concat(' — R$ ', rec->>'amount')
        end)
      when 'company_expenses' then concat('Despesa da empresa: ', coalesce(nullif(rec->>'description', ''), rec->>'category'), ' — R$ ', rec->>'amount')
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


-- 74) Conferência: passou para a seção 76, no fim do arquivo (precisa ser a
-- última consulta para o resultado aparecer no SQL Editor).

-- 75) Créditos da assinatura digital (pedido do Wesley em 10/10/2026) -----------
-- * Cada contrato mandado para assinar pela Autentique (função assinaturas) desconta
--   dos mesmos créditos da loja (plate_credit_ledger, tipo 'assinatura'), com preço
--   próprio (platform_settings.signature_price, padrão R$ 1,00).
-- * Franquia: os primeiros signature_free_monthly envios do mês (padrão 5; mês de
--   São Luís) saem de graça. Contam todos os envios do mês, inclusive os cancelados.
-- * Cancelar não devolve (decisão do Wesley). Só o envio que falhou (a Autentique não
--   criou o documento ou o registro não foi gravado) é devolvido (plate_credit_release).
-- * signature_requests.charge_ledger_id: a cobrança daquele envio (vazio = franquia).
alter table public.platform_settings add column if not exists signature_price numeric(6, 2) not null default 1.00;
alter table public.platform_settings drop constraint if exists platform_settings_signature_price_check;
alter table public.platform_settings add constraint platform_settings_signature_price_check check (signature_price > 0 and signature_price <= 50);
alter table public.platform_settings add column if not exists signature_free_monthly integer not null default 5;
alter table public.platform_settings drop constraint if exists platform_settings_signature_free_monthly_check;
alter table public.platform_settings add constraint platform_settings_signature_free_monthly_check check (signature_free_monthly between 0 and 100);

alter table public.plate_credit_ledger drop constraint if exists plate_credit_ledger_kind_check;
alter table public.plate_credit_ledger add constraint plate_credit_ledger_kind_check
  check (kind in ('recarga', 'consulta', 'documento', 'ajuste', 'assinatura'));
alter table public.plate_credit_ledger drop constraint if exists plate_credit_ledger_assinatura_check;
alter table public.plate_credit_ledger add constraint plate_credit_ledger_assinatura_check check (kind <> 'assinatura' or amount < 0);

alter table public.signature_requests add column if not exists charge_ledger_id bigint references public.plate_credit_ledger(id) on delete set null;

-- Quantos envios grátis ainda restam no mês da loja
create or replace function public.signature_free_left(p_company uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select greatest(
    coalesce((select signature_free_monthly from public.platform_settings where id = 1), 5)
    - (select count(*)::int from public.signature_requests r
       where r.company_id = p_company
         and r.created_at >= (date_trunc('month', now() at time zone 'America/Fortaleza') at time zone 'America/Fortaleza')),
    0)
$$;
revoke execute on function public.signature_free_left(uuid) from anon, authenticated, public;
grant execute on function public.signature_free_left(uuid) to service_role;

-- Só a função assinaturas (chave de serviço), antes de mandar à Autentique: usa a
-- franquia do mês ou reserva o preço. Sem franquia e sem saldo: SALDO_INSUFICIENTE.
create or replace function public.signature_credit_hold(p_company uuid, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_price numeric;
  v_balance numeric;
  v_free integer;
  v_id bigint;
begin
  if p_company is null then
    raise exception 'Loja inválida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plate_credit:' || p_company::text, 0));
  v_balance := public.plate_credit_balance(p_company);
  v_free := public.signature_free_left(p_company);
  if v_free > 0 then
    return jsonb_build_object('charged', false, 'free_left', v_free - 1, 'balance', v_balance);
  end if;
  v_price := coalesce((select signature_price from public.platform_settings where id = 1), 1.00);
  if v_balance < v_price then
    raise exception 'SALDO_INSUFICIENTE' using errcode = 'P0001';
  end if;
  insert into public.plate_credit_ledger (company_id, kind, amount, created_by)
  values (p_company, 'assinatura', -v_price, p_user)
  returning id into v_id;
  return jsonb_build_object('charged', true, 'ledger_id', v_id, 'price', v_price, 'free_left', 0, 'balance', v_balance - v_price);
end $$;
revoke execute on function public.signature_credit_hold(uuid, uuid) from anon, authenticated, public;
grant execute on function public.signature_credit_hold(uuid, uuid) to service_role;

-- Devolve a reserva quando a consulta, a foto ou o envio para assinar não deu certo
create or replace function public.plate_credit_release(p_id bigint)
returns void
language sql security definer set search_path = public
as $$
  delete from public.plate_credit_ledger where id = p_id and kind in ('consulta', 'documento', 'assinatura')
$$;
revoke execute on function public.plate_credit_release(bigint) from anon, authenticated, public;
grant execute on function public.plate_credit_release(bigint) to service_role;

-- Saldo, preços (placa, foto e assinatura), franquia e pacotes para a equipe da
-- loja; pedidos e extrato só para o admin
create or replace function public.my_plate_credits()
returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_company uuid := public.current_company_id();
  v_admin boolean := public.is_company_admin();
  s public.platform_settings%rowtype;
begin
  if v_company is null then
    raise exception 'Acesso restrito à equipe da loja' using errcode = '42501';
  end if;
  select * into s from public.platform_settings where id = 1;
  return jsonb_build_object(
    'balance', public.plate_credit_balance(v_company),
    'price', coalesce(s.plate_price, 0.40),
    'doc_price', coalesce(s.doc_photo_price, 0.20),
    'signature_price', coalesce(s.signature_price, 1.00),
    'signature_free_monthly', coalesce(s.signature_free_monthly, 5),
    'signature_free_left', public.signature_free_left(v_company),
    'packages', to_jsonb(coalesce(s.plate_packages, '{20,40,100}'::numeric[])),
    'admin', v_admin,
    'orders', case when v_admin then (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'amount', o.amount, 'paid_on', o.paid_on, 'status', o.status,
        'response', o.response, 'created_at', o.created_at) order by o.created_at desc), '[]'::jsonb)
      from (select * from public.plate_credit_orders where company_id = v_company order by created_at desc limit 20) o
    ) else '[]'::jsonb end,
    'ledger', case when v_admin then (
      select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'amount', l.amount, 'plate', l.plate,
        'note', l.note, 'created_at', l.created_at, 'user_email', coalesce(u.email, '')) order by l.created_at desc, l.id desc), '[]'::jsonb)
      from (select * from public.plate_credit_ledger where company_id = v_company order by created_at desc, id desc limit 50) l
      left join auth.users u on u.id = l.created_by
    ) else '[]'::jsonb end);
end $$;
revoke execute on function public.my_plate_credits() from anon, public;
grant execute on function public.my_plate_credits() to authenticated;

-- Saldo de cada loja e o que foi pago em 30 dias: placas, fotos e assinaturas
-- (Plataforma → Cobrança)
create or replace function public.platform_plate_credits()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à plataforma' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'company_id', c.id, 'name', c.name, 'slug', c.slug,
      'balance', coalesce(t.balance, 0), 'queries_30d', coalesce(t.queries_30d, 0), 'docs_30d', coalesce(t.docs_30d, 0),
      'signatures_30d', coalesce(t.signatures_30d, 0),
      'spent_30d', coalesce(t.spent_30d, 0), 'bought_total', coalesce(t.bought_total, 0),
      'last_recharge_at', t.last_recharge_at) order by c.name), '[]'::jsonb)
    from public.companies c
    left join lateral (
      select sum(l.amount) as balance,
             count(*) filter (where l.kind = 'consulta' and l.created_at > now() - interval '30 days') as queries_30d,
             count(*) filter (where l.kind = 'documento' and l.created_at > now() - interval '30 days') as docs_30d,
             count(*) filter (where l.kind = 'assinatura' and l.created_at > now() - interval '30 days') as signatures_30d,
             -sum(l.amount) filter (where l.kind in ('consulta', 'documento', 'assinatura') and l.created_at > now() - interval '30 days') as spent_30d,
             sum(l.amount) filter (where l.kind = 'recarga') as bought_total,
             max(l.created_at) filter (where l.kind = 'recarga') as last_recharge_at
      from public.plate_credit_ledger l where l.company_id = c.id
    ) t on true
    where exists (select 1 from public.plate_credit_ledger l where l.company_id = c.id)
       or exists (select 1 from public.plate_credit_orders o where o.company_id = c.id)
  );
end $$;
revoke execute on function public.platform_plate_credits() from anon, public;
grant execute on function public.platform_plate_credits() to authenticated;

-- 76) Conferência (fica por último para aparecer no SQL Editor) -------------
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
