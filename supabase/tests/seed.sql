-- Dados de teste: duas lojas no mesmo projeto (multi-tenant), com admin,
-- gerente que vê valores, gerente que vê só quantidades, vendedores (um deles
-- desativado), um usuário ligado às duas lojas e registros em todas as tabelas
-- e buckets. Rodado como superusuário (sem RLS), depois do schema.sql.

\set ON_ERROR_STOP 1

insert into public.companies (id, slug, name)
values ('bbbbbbbb-0000-0000-0000-00000000000b', 'loja-b', 'Loja B')
on conflict (slug) do nothing;

create temp table co as
select (select id from public.companies where slug = 'dom-motors') as a,
       'bbbbbbbb-0000-0000-0000-00000000000b'::uuid as b;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@loja-a'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'gerente-valores@loja-a'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gerente-quantidades@loja-a'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'vendedor@loja-a'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'vendedor2@loja-a'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'desativado@loja-a'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'vendedor-a-admin-b@x'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'admin@loja-b'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'vendedor@loja-b');

-- Vínculos: a instalação pode já ter ligado usuários à Dom Motors; aqui cada
-- um fica só com o vínculo certo
delete from public.user_company where user_id in (select id from auth.users where email like '%@loja-%' or email like '%@x');
insert into public.user_company (user_id, company_id, role)
select u, c, r from co, (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'a', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'a', 'manager'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'a', 'manager'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'a', 'seller'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'a', 'seller'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'a', 'seller'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'a', 'seller'),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'b', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b', 'seller')
) v(u, k, r)
cross join lateral (select case k when 'a' then co.a else co.b end as c) x;

-- Simula a falha antiga da seção 11 (rodar o schema de novo ligava todo
-- usuário como admin da Dom Motors): o schema.sql rodado depois do seed
-- precisa remover este vínculo
insert into public.user_company (user_id, company_id, role)
select 'bbbbbbbb-0000-0000-0000-000000000002', a, 'admin' from co;

insert into public.sellers (id, company_id, user_id, name, email, role, commission_type, commission_value, active, finance_access)
select id, case k when 'a' then co.a else co.b end, u, n, '', r, 'percent', 1, act, fa
from co, (values
  ('5e000000-0000-0000-0000-000000000002'::uuid, 'a', 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'Gerente V', 'manager', true, 'values'),
  ('5e000000-0000-0000-0000-000000000003', 'a', 'aaaaaaaa-0000-0000-0000-000000000003', 'Gerente C', 'manager', true, 'counts'),
  ('5e000000-0000-0000-0000-000000000004', 'a', 'aaaaaaaa-0000-0000-0000-000000000004', 'Vendedor A', 'seller', true, 'counts'),
  ('5e000000-0000-0000-0000-000000000005', 'a', 'aaaaaaaa-0000-0000-0000-000000000005', 'Vendedor A2', 'seller', true, 'counts'),
  ('5e000000-0000-0000-0000-000000000006', 'a', 'aaaaaaaa-0000-0000-0000-000000000006', 'Desativado', 'seller', false, 'counts'),
  ('5e000000-0000-0000-0000-000000000007', 'a', 'aaaaaaaa-0000-0000-0000-000000000007', 'Vendedor A / admin B', 'seller', true, 'counts'),
  ('5e000000-0000-0000-0000-0000000000b2', 'b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Vendedor B', 'seller', true, 'counts')
) v(id, k, u, n, r, act, fa);

-- Carros: loja A tem os 16 de exemplo + 1 oculto + 1 vendido; loja B, 1 visível e 1 oculto
insert into public.cars (id, company_id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, category, price, status, hidden, purchase_price, plate, chassis, renavam, sold_at, customer_id)
select id, case k when 'a' then co.a else co.b end, slug, 'Marca', 'Modelo', 'V', 2022, '2022/2022', 1000, 'Manual', 'Flex', 'Preto', 'hatch', 50000, st, hid, 40000, placa, 'CHASSI' || placa, 'RENAVAM' || placa, null, null
from co, (values
  ('ca000000-0000-0000-0000-0000000000a1'::uuid, 'a', 'oculto-a', 'disponivel', true, 'AAA1A11'),
  ('ca000000-0000-0000-0000-0000000000a2', 'a', 'vendido-a', 'vendido', false, 'AAA2A22'),
  ('ca000000-0000-0000-0000-0000000000a3', 'a', 'vendido-a2', 'vendido', false, 'AAA3A33'),
  ('ca000000-0000-0000-0000-0000000000b1', 'b', 'visivel-b', 'vendido', false, 'BBB1B11'),
  ('ca000000-0000-0000-0000-0000000000b2', 'b', 'oculto-b', 'disponivel', true, 'BBB2B22')
) v(id, k, slug, st, hid, placa);

insert into public.suppliers (id, company_id, name) select 'f1000000-0000-0000-0000-0000000000a1', a, 'Oficina A' from co;
insert into public.suppliers (id, company_id, name) select 'f1000000-0000-0000-0000-0000000000b1', b, 'Oficina B' from co;

insert into public.car_expenses (company_id, car_id, category, amount, supplier_id)
select a, 'ca000000-0000-0000-0000-0000000000a1', 'mecanica', 900, 'f1000000-0000-0000-0000-0000000000a1' from co;
insert into public.car_expenses (company_id, car_id, category, amount)
select b, 'ca000000-0000-0000-0000-0000000000b1', 'mecanica', 700 from co;

insert into public.customers (id, company_id, name, document, phone) select 'c0000000-0000-0000-0000-0000000000a1', a, 'Cliente A1', '111.111.111-11', '(98) 91111-1111' from co;
insert into public.customers (id, company_id, name, document) select 'c0000000-0000-0000-0000-0000000000a2', a, 'Cliente A2', '222.222.222-22' from co;
insert into public.customers (id, company_id, name, document) select 'c0000000-0000-0000-0000-0000000000b1', b, 'Cliente B1', '333.333.333-33' from co;
update public.cars set customer_id = 'c0000000-0000-0000-0000-0000000000a1', sold_at = now() where id = 'ca000000-0000-0000-0000-0000000000a2';
update public.cars set customer_id = 'c0000000-0000-0000-0000-0000000000b1', sold_at = now() where id = 'ca000000-0000-0000-0000-0000000000b1';

-- Contratos: um do vendedor A, um do admin A, um da loja B
insert into public.contracts (company_id, car_id, customer_id, company_name, company_document, buyer_name, buyer_document, sale_price, created_by)
select a, 'ca000000-0000-0000-0000-0000000000a2'::uuid, 'c0000000-0000-0000-0000-0000000000a1'::uuid, 'Loja A', '1', 'Cliente A1', '111', 50000, 'aaaaaaaa-0000-0000-0000-000000000004'::uuid from co
union all select a, null::uuid, null::uuid, 'Loja A', '1', 'Outro', '999', 40000, 'aaaaaaaa-0000-0000-0000-000000000001' from co
union all select b, 'ca000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000b1', 'Loja B', '2', 'Cliente B1', '333', 60000, 'bbbbbbbb-0000-0000-0000-000000000001' from co;

insert into public.contract_templates (company_id, name, file_path) select a, 'Modelo A', a || '/modelo.docx' from co;
insert into public.contract_templates (company_id, name, file_path) select b, 'Modelo B', b || '/modelo.docx' from co;

-- Vendas: uma do vendedor A, uma do vendedor A2, uma da loja B
insert into public.sales (id, company_id, car_id, seller_id, sale_price, sale_date)
select '5a000000-0000-0000-0000-0000000000a2', a, 'ca000000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-000000000004', 50000, current_date from co;
insert into public.sales (id, company_id, car_id, seller_id, sale_price, sale_date)
select '5a000000-0000-0000-0000-0000000000a3', a, 'ca000000-0000-0000-0000-0000000000a3', '5e000000-0000-0000-0000-000000000005', 45000, current_date from co;
insert into public.sales (id, company_id, car_id, seller_id, sale_price, sale_date)
select '5a000000-0000-0000-0000-0000000000b1', b, 'ca000000-0000-0000-0000-0000000000b1', '5e000000-0000-0000-0000-0000000000b2', 60000, current_date from co;

-- Documentos do cliente: do vendedor A, do admin A e da loja B (com os arquivos)
insert into public.customer_documents (company_id, customer_id, car_id, doc_type, file_path, file_name, created_by)
select a, 'c0000000-0000-0000-0000-0000000000a1'::uuid, 'ca000000-0000-0000-0000-0000000000a2'::uuid, 'compra', a || '/c-a1/vendedor.pdf', 'vendedor.pdf', 'aaaaaaaa-0000-0000-0000-000000000004'::uuid from co
union all select a, 'c0000000-0000-0000-0000-0000000000a1'::uuid, null::uuid, 'garantia', a || '/c-a1/admin.pdf', 'admin.pdf', 'aaaaaaaa-0000-0000-0000-000000000001' from co
union all select b, 'c0000000-0000-0000-0000-0000000000b1', null, 'compra', b || '/c-b1/b.pdf', 'b.pdf', 'bbbbbbbb-0000-0000-0000-000000000001' from co;

-- Financiamentos (1 por loja, 3 parcelas cada)
insert into public.customer_financings (id, company_id, customer_id, car_id, customer_name, vehicle_price, down_payment, financed_amount, installments_count, installment_amount, first_due_date)
select 'f0000000-0000-0000-0000-0000000000a1'::uuid, a, 'c0000000-0000-0000-0000-0000000000a1'::uuid, 'ca000000-0000-0000-0000-0000000000a2'::uuid, 'Cliente A1', 50000, 20000, 30000, 3, 10000, current_date from co
union all select 'f0000000-0000-0000-0000-0000000000b1', b, 'c0000000-0000-0000-0000-0000000000b1', 'ca000000-0000-0000-0000-0000000000b1', 'Cliente B1', 60000, 30000, 30000, 3, 10000, current_date from co;
insert into public.financing_installments (company_id, financing_id, number, due_date, amount)
select f.company_id, f.id, g, current_date + (g - 1) * 30, 10000
from public.customer_financings f cross join generate_series(1, 3) g;

-- Registro de atividades (os gatilhos só gravam com usuário logado)
insert into public.activity_log (company_id, user_id, user_email, action, entity, label)
select a, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'admin@loja-a', 'insert', 'car_expenses', 'Gasto do admin' from co
union all select a, 'aaaaaaaa-0000-0000-0000-000000000001', 'admin@loja-a', 'update', 'financing_installments', 'Parcela 1/3' from co
union all select a, 'aaaaaaaa-0000-0000-0000-000000000001', 'admin@loja-a', 'insert', 'customers', 'Cliente A1' from co
union all select b, 'bbbbbbbb-0000-0000-0000-000000000001', 'admin@loja-b', 'insert', 'customers', 'Cliente B1' from co;

insert into public.site_visits_daily (company_id, day, visits, visitors) select a, current_date, 10, 5 from co union all select b, current_date, 7, 3 from co;
insert into public.car_views_daily (company_id, car_id, day, views, viewers)
select a, 'ca000000-0000-0000-0000-0000000000a2'::uuid, current_date, 4, 2 from co
union all select b, 'ca000000-0000-0000-0000-0000000000b1', current_date, 3, 1 from co;

-- Um arquivo de cada loja em cada bucket privado ou de fotos
insert into storage.objects (bucket_id, name)
select bucket, (case k when 'a' then co.a else co.b end) || '/' || f
from co, (values
  ('car-photos', 'a', 'x/foto.webp'), ('car-photos', 'b', 'x/foto.webp'),
  ('expense-attachments', 'a', 'x/nota.pdf'), ('expense-attachments', 'b', 'x/nota.pdf'),
  ('car-documents', 'a', 'x/crlv.pdf'), ('car-documents', 'b', 'x/crlv.pdf'),
  ('contract-templates', 'a', 'modelo.docx'), ('contract-templates', 'b', 'modelo.docx'),
  ('customer-documents', 'a', 'c-a1/vendedor.pdf'), ('customer-documents', 'a', 'c-a1/admin.pdf'),
  ('customer-documents', 'b', 'c-b1/b.pdf')
) v(bucket, k, f);
