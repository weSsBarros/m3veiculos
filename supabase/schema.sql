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

-- 4) Dados de exemplo (opcional) ---------------------------------------------
-- 16 carros fictícios para o site não ficar vazio no primeiro acesso.
-- Apague ou edite pelo painel /admin depois que os dados reais estiverem prontos.

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
