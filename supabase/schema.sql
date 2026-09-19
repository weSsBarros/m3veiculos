-- M&3 Veículos — schema do Supabase
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
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cars add column if not exists featured boolean not null default false;

-- Custo de aquisição do carro (controle financeiro interno, não aparece no site público)
alter table public.cars add column if not exists purchase_price integer;
alter table public.cars add column if not exists purchase_date date;

create index if not exists cars_status_idx on public.cars (status);
create index if not exists cars_category_idx on public.cars (category);
create index if not exists cars_brand_idx on public.cars (brand);
create index if not exists cars_featured_idx on public.cars (featured);
create index if not exists cars_slug_idx on public.cars (slug);

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
revoke select on public.cars from anon;
grant select (
  id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, doors,
  category, condition, price, original_price, badge, status, highlights, description, images,
  featured, created_at, updated_at
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
