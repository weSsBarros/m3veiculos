-- Testes de segurança (RLS, permissões de coluna, views, funções e storage).
-- Cada linha é uma afirmação: o resultado sai como PASS/FAIL no final.
-- Rodado depois de supabase_stub.sql, schema.sql e seed.sql (ver run.sh).

\set ON_ERROR_STOP 1
\pset footer off

drop schema if exists test cascade;
create schema test;
create table test.results (id serial primary key, name text not null, ok boolean not null, detail text);
create table test.expected (key text primary key, value bigint not null);

-- Grava o resultado de uma afirmação (como dono, qualquer papel consegue gravar)
create function test.check(p_name text, p_ok boolean, p_detail text default null) returns void
language sql security definer set search_path = test as $$
  insert into test.results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail)
$$;

-- Conta linhas visíveis para o papel atual; erro (sem permissão) = -1
create function test.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) s', p_sql) into n;
  return n;
exception when others then return -1;
end $$;

-- Executa um comando como o papel atual: 'ok:<linhas afetadas>' ou 'error:<sqlstate>'
create function test.try(p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'ok:' || n;
exception when others then return 'error:' || sqlstate;
end $$;

-- Negado = deu erro ou não afetou nenhuma linha (a RLS filtra em silêncio)
create function test.denied(p_sql text) returns boolean language sql as $$
  select r like 'error:%' or r = 'ok:0' from (select test.try(p_sql) as r) s
$$;

create function test.allowed(p_sql text) returns boolean language sql as $$
  select r like 'ok:%' and r <> 'ok:0' from (select test.try(p_sql) as r) s
$$;

create function test.exp(p_key text) returns bigint language sql security definer set search_path = test as $$
  select value from test.expected where key = p_key
$$;

create function test.company_a() returns uuid language sql security definer set search_path = public as $$
  select id from public.companies where slug = 'dom-motors'
$$;

create function test.login(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false)
$$;

grant usage on schema test to anon, authenticated;
grant execute on all functions in schema test to anon, authenticated;

-- Contagens esperadas, calculadas sem RLS
create temp table co as
select (select id from public.companies where slug = 'dom-motors') as a, 'bbbbbbbb-0000-0000-0000-00000000000b'::uuid as b;

insert into test.expected
select 'cars_a', count(*) from public.cars, co where company_id = co.a
union all select 'cars_public', count(*) from public.cars where not hidden
union all select 'customers_a', count(*) from public.customers, co where company_id = co.a
union all select 'contracts_a', count(*) from public.contracts, co where company_id = co.a
union all select 'sales_a', count(*) from public.sales, co where company_id = co.a
union all select 'sellers_a', count(*) from public.sellers, co where company_id = co.a
union all select 'expenses_a', count(*) from public.car_expenses, co where company_id = co.a
union all select 'suppliers_a', count(*) from public.suppliers, co where company_id = co.a
union all select 'docs_a', count(*) from public.customer_documents, co where company_id = co.a
union all select 'fin_a', count(*) from public.customer_financings, co where company_id = co.a
union all select 'inst_a', count(*) from public.financing_installments, co where company_id = co.a
union all select 'log_a', count(*) from public.activity_log, co where company_id = co.a
union all select 'templates_a', count(*) from public.contract_templates, co where company_id = co.a;

-- A instalação roda o schema.sql de novo com usuários de outras lojas já
-- cadastrados: ninguém pode ganhar acesso a uma loja que não é a dele
select test.check('schema de novo: admin da loja B continua só na loja B',
  (select count(*) from public.user_company where user_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1);
select test.check('schema de novo: vendedor da loja B continua só na loja B',
  (select count(*) from public.user_company where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 1);
select test.check('schema de novo: vendedor A continua vendedor',
  (select string_agg(role, ',') from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000004') = 'seller');

select test.check('toda tabela do schema public tem RLS ligada',
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  (select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity));

select test.check('funções security definer têm search_path fixo',
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not coalesce(p.proconfig::text like '%search_path%', false)
  ));

-- ===================================================================== anon
select test.login(null);
set role anon;
select test.check('anon: vê só carros não ocultos (site público)', test.count('select id from cars') = test.exp('cars_public'));
select test.check('anon: nenhum carro oculto sai pela API', test.count('select id from cars where hidden') = 0);
select test.check('anon: não lê o preço de compra', test.count('select purchase_price from cars') = -1);
select test.check('anon: não lê data de compra', test.count('select purchase_date from cars') = -1);
select test.check('anon: não lê placa, chassi e renavam', test.count('select plate from cars') = -1 and test.count('select chassis from cars') = -1 and test.count('select renavam from cars') = -1);
select test.check('anon: não lê o comprador do carro', test.count('select customer_id from cars') = -1);
select test.check('anon: não lê documentos do carro', test.count('select documents from cars') = -1);
select test.check('anon: não lê data da venda', test.count('select sold_at from cars') = -1);
select test.check('anon: não lê observações internas, itens nem vistoria do carro', test.count('select internal_notes from cars') = -1
  and test.count('select intake_items from cars') = -1 and test.count('select inspection from cars') = -1);
select test.check('anon: não vê reservas nem financiamentos externos', test.count('select * from car_reservations') <= 0
  and test.count('select * from external_financings') <= 0);
select test.check('anon: não reserva, não cadastra troca nem marca comissão', test.denied($$select reserve_car('{"car_id":"ca000000-0000-0000-0000-0000000000b2"}')$$)
  and test.denied($$select register_trade_in('{"brand":"x","model":"y","year":2020}')$$)
  and test.denied('select mark_commissions_paid(null, null, current_date)'));
select test.check('anon: não vê clientes', test.count('select * from customers') <= 0);
select test.check('anon: não vê contratos', test.count('select * from contracts') <= 0);
select test.check('anon: não vê vendas', test.count('select * from sales') <= 0);
select test.check('anon: não vê equipe', test.count('select * from sellers') <= 0);
select test.check('anon: não vê gastos', test.count('select * from car_expenses') <= 0);
select test.check('anon: não vê fornecedores', test.count('select * from suppliers') <= 0);
select test.check('anon: não vê empresas', test.count('select * from companies') <= 0);
select test.check('anon: não vê vínculos de usuários', test.count('select * from user_company') <= 0);
select test.check('anon: não vê registro de atividades', test.count('select * from activity_log') <= 0);
select test.check('anon: não vê modelos de contrato', test.count('select * from contract_templates') <= 0);
select test.check('anon: não vê documentos de clientes', test.count('select * from customer_documents') <= 0);
select test.check('anon: não vê financiamentos', test.count('select * from customer_financings') <= 0);
select test.check('anon: não vê parcelas', test.count('select * from financing_installments') <= 0);
select test.check('anon: não vê visitas do site', test.count('select * from site_visits_daily') <= 0);
select test.check('anon: não vê visualizações por carro', test.count('select * from car_views_daily') <= 0);
select test.check('anon: não lê a view do vendedor', test.count('select * from seller_cars') <= 0);
select test.check('anon: não lê a view do gerente', test.count('select * from staff_cars') <= 0);
select test.check('anon: não lista arquivos de nenhum bucket', test.count('select * from storage.objects') = 0);
select test.check('anon: não cadastra cliente', test.denied($$insert into customers (company_id, name) select id, 'x' from companies$$)
  and test.denied($$insert into customers (company_id, name) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'x')$$));
select test.check('anon: não altera carro', test.denied('update cars set price = 1'));
select test.check('anon: não exclui carro', test.denied('delete from cars'));
select test.check('anon: não envia arquivo', test.denied($$insert into storage.objects (bucket_id, name) values ('car-photos', 'bbbbbbbb-0000-0000-0000-00000000000b/x.webp')$$));
select test.check('anon: não cria financiamento', test.denied($$select create_customer_financing('{"customer_name":"x","financed_amount":1,"installments_count":1,"installment_amount":1,"first_due_date":"2030-01-01"}')$$));
select test.check('anon: não muda multa e juros', test.denied('select set_customer_finance_defaults(1, 1)'));
select test.check('anon: não aplica aviso de estoque', test.denied('select apply_stock_alert_to_all(10)'));
select test.check('anon: não grava custo de compra', test.denied($$select set_car_purchase('ca000000-0000-0000-0000-0000000000b1', 1, null)$$));
select test.check('anon: não é de nenhuma loja', current_company_id() is null and not is_company_admin() and not is_company_staff());
reset role;

-- ================================================================== admin A
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: vê todos os carros da loja A e só eles', test.count('select * from cars') = test.exp('cars_a'));
select test.check('admin A: lê o custo de compra', test.count('select purchase_price from cars') = test.exp('cars_a'));
select test.check('admin A: vê clientes da loja A', test.count('select * from customers') = test.exp('customers_a'));
select test.check('admin A: vê todos os contratos da loja A', test.count('select * from contracts') = test.exp('contracts_a'));
select test.check('admin A: vê todas as vendas da loja A', test.count('select * from sales') = test.exp('sales_a'));
select test.check('admin A: vê a equipe da loja A', test.count('select * from sellers') = test.exp('sellers_a'));
select test.check('admin A: vê os gastos da loja A', test.count('select * from car_expenses') = test.exp('expenses_a'));
select test.check('admin A: vê fornecedores da loja A', test.count('select * from suppliers') = test.exp('suppliers_a'));
select test.check('admin A: vê documentos de clientes da loja A', test.count('select * from customer_documents') = test.exp('docs_a'));
select test.check('admin A: vê financiamentos e parcelas da loja A', test.count('select * from customer_financings') = test.exp('fin_a') and test.count('select * from financing_installments') = test.exp('inst_a'));
select test.check('admin A: vê todo o registro de atividades da loja A', test.count('select * from activity_log') = test.exp('log_a'));
select test.check('admin A: vê só a própria empresa', test.count('select * from companies') = 1);
select test.check('admin A: nada da loja B aparece', test.count($$
  select id from cars where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
  union all select id from customers where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
  union all select id from contracts where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
  union all select id from sales where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
  union all select id from customer_documents where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'
  union all select id from customer_financings where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$) = 0);
select test.check('admin A: arquivos só da loja A (5 buckets)', test.count($$select * from storage.objects where name like 'bbbbbbbb%'$$) = 0
  and test.count('select * from storage.objects') = 6);
select test.check('admin A: não altera cliente da loja B', test.denied($$update customers set name = 'x' where id = 'c0000000-0000-0000-0000-0000000000b1'$$));
select test.check('admin A: não exclui carro da loja B', test.denied($$delete from cars where id = 'ca000000-0000-0000-0000-0000000000b2'$$));
select test.check('admin A: não cadastra cliente na loja B', test.denied($$insert into customers (company_id, name) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'x')$$));
select test.check('admin A: não move cliente para a loja B', test.denied($$update customers set company_id = 'bbbbbbbb-0000-0000-0000-00000000000b' where id = 'c0000000-0000-0000-0000-0000000000a2'$$));
select test.check('admin A: não registra venda de carro da loja B (bloquearia a venda dela)', test.denied($$
  insert into sales (company_id, car_id, sale_price) select current_company_id(), 'ca000000-0000-0000-0000-0000000000b2', 1$$));
select test.check('admin A: não lança gasto em carro da loja B', test.denied($$
  insert into car_expenses (company_id, car_id, category, amount) select current_company_id(), 'ca000000-0000-0000-0000-0000000000b2', 'outros', 1$$));
select test.check('admin A: não anexa documento a cliente da loja B', test.denied($$
  insert into customer_documents (company_id, customer_id, file_path) select current_company_id(), 'c0000000-0000-0000-0000-0000000000b1', 'x'$$));
select test.check('admin A: não liga contrato a cliente da loja B', test.denied($$
  insert into contracts (company_id, customer_id, company_name, company_document, buyer_name, buyer_document, sale_price)
  select current_company_id(), 'c0000000-0000-0000-0000-0000000000b1', 'x', 'x', 'x', 'x', 1$$));
select test.check('admin A: não liga carro a cliente da loja B', test.denied($$
  update cars set customer_id = 'c0000000-0000-0000-0000-0000000000b1' where id = 'ca000000-0000-0000-0000-0000000000a3'$$));
select test.check('admin A: não cria financiamento com carro da loja B', test.denied($$
  select create_customer_financing(jsonb_build_object('car_id', 'ca000000-0000-0000-0000-0000000000b1', 'customer_name', 'x', 'financed_amount', 1, 'installments_count', 1, 'installment_amount', 1, 'first_due_date', '2030-01-01'))$$));
select test.check('admin A: não pendura parcela em financiamento da loja B', test.denied($$
  insert into financing_installments (company_id, financing_id, number, due_date, amount)
  select current_company_id(), 'f0000000-0000-0000-0000-0000000000b1', 9, current_date, 1$$));
select test.check('admin A: não grava custo de compra de carro da loja B', test.denied($$select set_car_purchase('ca000000-0000-0000-0000-0000000000b1', 1, null)$$));
select test.check('admin A: não envia arquivo para a pasta da loja B', test.denied($$
  insert into storage.objects (bucket_id, name) values ('car-documents', 'bbbbbbbb-0000-0000-0000-00000000000b/x/y.pdf')$$));
select test.check('admin A: não exclui arquivo da loja B', test.denied($$delete from storage.objects where name like 'bbbbbbbb%'$$));
select test.check('admin A: não grava no registro de atividades', test.denied($$
  insert into activity_log (company_id, action, entity) select current_company_id(), 'insert', 'x'$$));
select test.check('admin A: registra venda e financiamento na própria loja', test.allowed($$
  update sales set transfer_status = 'em_andamento' where id = '5a000000-0000-0000-0000-0000000000a2'$$)
  and test.try($$select create_customer_financing(jsonb_build_object('customer_id', 'c0000000-0000-0000-0000-0000000000a2', 'customer_name', 'Cliente A2', 'financed_amount', 1000, 'installments_count', 2, 'installment_amount', 500, 'first_due_date', '2030-01-31'))$$) = 'ok:1');
select test.try('select apply_stock_alert_to_all(45)');
select test.check('admin A: não reserva carro da loja B', test.denied($$select reserve_car('{"car_id":"ca000000-0000-0000-0000-0000000000b2"}')$$));
select test.check('admin A: não cadastra financiamento externo com cliente da loja B', test.denied($$
  insert into external_financings (company_id, customer_id, customer_name, financed_amount) select current_company_id(), 'c0000000-0000-0000-0000-0000000000b1', 'x', 1$$));
select test.check('admin A: carro da troca entra oculto, em manutenção e com o custo', test.try($$select register_trade_in('{"brand":"Fiat","model":"Uno","year":2015,"value":12000}')$$) = 'ok:1'
  and test.count($$select * from cars where brand = 'Fiat' and model = 'Uno' and hidden and status = 'manutencao' and purchase_price = 12000$$) = 1);
select test.check('admin A: marca comissão como paga', test.try($$select mark_commissions_paid(array['5a000000-0000-0000-0000-0000000000a3']::uuid[], null, current_date)$$) = 'ok:1'
  and test.count($$select * from sales where id = '5a000000-0000-0000-0000-0000000000a3' and commission_paid_on is not null$$) = 1);
select test.check('admin A: marcar comissão não mexe em venda da loja B', test.try($$select mark_commissions_paid(array['5a000000-0000-0000-0000-0000000000b1']::uuid[], null, current_date)$$) = 'ok:1');
reset role;
select test.check('comissão da loja B continua em aberto', (select commission_paid_on from public.sales where id = '5a000000-0000-0000-0000-0000000000b1') is null);
select test.check('aviso de estoque "aplicar a todos" da loja A não mexe na loja B',
  not exists (select 1 from public.cars where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and stock_alert_days = 45));

-- ============================================== gerente A (vê valores)
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente V: não lê a tabela de carros (só a view sem custo)', test.count('select * from cars') = 0
  -- + 1: o carro da troca cadastrado pelo admin A nos testes acima
  and test.count('select * from staff_cars') = test.exp('cars_a') + 1);
select test.check('gerente V: a view não tem custo de compra', test.count('select purchase_price from staff_cars') = -1);
select test.check('gerente V: não lê gastos', test.count('select * from car_expenses') = 0);
select test.check('gerente V: lança gasto', test.allowed($$
  insert into car_expenses (company_id, car_id, category, amount) select current_company_id(), 'ca000000-0000-0000-0000-0000000000a1', 'outros', 10$$));
select test.check('gerente V: não altera nem exclui gastos', test.denied('update car_expenses set amount = 1') and test.denied('delete from car_expenses'));
select test.check('gerente V: não vê anexos de gastos', test.count($$select * from storage.objects where bucket_id = 'expense-attachments'$$) = 0);
select test.check('gerente V: não exclui cliente, contrato, venda nem arquivo', test.denied('delete from customers') and test.denied('delete from contracts')
  and test.denied('delete from sales') and test.denied('delete from storage.objects') and test.denied('delete from customer_documents'));
select test.check('gerente V: atualiza a transferência', test.allowed($$update sales set transfer_notes = 'ok' where id = '5a000000-0000-0000-0000-0000000000a2'$$));
select test.check('gerente V: vê financiamentos e parcelas', test.count('select * from customer_financings') = test.exp('fin_a') + 1
  and test.count('select * from financing_installments') = test.exp('inst_a') + 2);
select test.check('gerente V: dá baixa em parcela', test.allowed($$update financing_installments set paid_on = current_date, paid_amount = amount where number = 1 and financing_id = 'f0000000-0000-0000-0000-0000000000a1'$$));
select test.check('gerente V: não exclui financiamento', test.denied('delete from customer_financings'));
select test.check('gerente V: muda multa e juros padrão', test.allowed('select set_customer_finance_defaults(2, 1)'));
select test.check('gerente V: não vê gasto lançado por outra pessoa no registro', test.count($$select * from activity_log where label = 'Gasto do admin'$$) = 0);
select test.check('gerente V: vê registro das parcelas', test.count($$select * from activity_log where entity = 'financing_installments'$$) >= 1);
select test.check('gerente V: edita o checklist da loja', test.allowed($$update companies set sale_checklist = sale_checklist$$));
select test.check('gerente V: não muda nome da loja nem as taxas direto', test.denied($$update companies set name = 'x'$$)
  and test.denied('update companies set late_fee_percent = 50'));
select test.check('gerente V: não vira admin', test.denied($$update user_company set role = 'admin'$$)
  and test.denied($$insert into user_company (user_id, company_id, role) select auth.uid(), current_company_id(), 'admin'$$));
select test.check('gerente V: não altera a equipe', test.denied($$update sellers set commission_value = 99$$));
select test.check('gerente V: custo de compra já informado não muda', test.denied($$select set_car_purchase('ca000000-0000-0000-0000-0000000000a1', 1, null)$$));
select test.check('gerente V: não marca comissão como paga', test.denied($$select mark_commissions_paid(array['5a000000-0000-0000-0000-0000000000a2']::uuid[], null, current_date)$$));
select test.check('gerente V: edita as listas de bancos, itens e vistoria', test.allowed($$update companies set bank_list = bank_list, intake_checklist = intake_checklist, inspection_checklist = inspection_checklist$$));
reset role;

-- ========================================== gerente A (só quantidades)
select test.login('aaaaaaaa-0000-0000-0000-000000000003');
set role authenticated;
select test.check('gerente C: não vê financiamentos nem parcelas', test.count('select * from customer_financings') = 0 and test.count('select * from financing_installments') = 0);
select test.check('gerente C: não cria financiamento', test.denied($$select create_customer_financing('{"customer_name":"x","financed_amount":1,"installments_count":1,"installment_amount":1,"first_due_date":"2030-01-01"}')$$));
select test.check('gerente C: não dá baixa em parcela', test.denied('update financing_installments set paid_on = current_date'));
select test.check('gerente C: não muda multa e juros', test.denied('select set_customer_finance_defaults(9, 9)'));
select test.check('gerente C: não vê registros de financiamento', test.count($$select * from activity_log where entity in ('customer_financings', 'financing_installments')$$) = 0);
select test.check('gerente C: não se libera para ver valores', test.denied($$update sellers set finance_access = 'values' where user_id = auth.uid()$$));
select test.check('gerente C: vê documentos de clientes da loja', test.count('select * from customer_documents') = test.exp('docs_a'));
reset role;

-- ================================================================ vendedor A
select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: não lê a tabela de carros (com custo)', test.count('select * from cars') = 0);
select test.check('vendedor: vê o estoque pela view da equipe, sem custo de compra', test.count('select * from staff_cars') >= test.exp('cars_a')
  and test.count('select purchase_price from staff_cars') = -1);
select test.check('vendedor: cadastra e edita carro', test.allowed($$
  insert into staff_cars (company_id, slug, brand, model, version, year, model_year, transmission, fuel, color, category, price, internal_notes)
  select current_company_id(), 'do-vendedor', 'Ford', 'Ka', 'SE', 2019, '2019/2019', 'Manual', 'Flex', 'Branco', 'hatch', 40000, 'nota interna'$$)
  and test.allowed($$update staff_cars set price = 41000, status = 'manutencao' where slug = 'do-vendedor'$$));
select test.check('vendedor: não exclui carro', test.denied($$delete from cars where slug = 'do-vendedor'$$) and test.denied($$delete from staff_cars where slug = 'do-vendedor'$$));
select test.check('vendedor: não informa custo de compra', test.denied($$select set_car_purchase((select id from staff_cars where slug = 'do-vendedor'), 1, null)$$));
select test.check('vendedor: não muda status de carro vendido', test.denied($$update staff_cars set status = 'disponivel' where id = 'ca000000-0000-0000-0000-0000000000a2'$$));
-- + 2: o carro da troca do admin A e o carro que o vendedor acabou de cadastrar
select test.check('vendedor: vê o estoque pela view dele', test.count('select * from seller_cars') = test.exp('cars_a') + 2);
select test.check('vendedor: a view dele não tem custo nem documentos', test.count('select purchase_price from seller_cars') = -1 and test.count('select documents from seller_cars') = -1);
select test.check('vendedor: não altera carro pela view', test.denied('update seller_cars set price = 1'));
select test.check('vendedor: não vê gastos lançados', test.count('select * from car_expenses') = 0);
select test.check('vendedor: vê os fornecedores (para escolher no gasto)', test.count('select * from suppliers') = test.exp('suppliers_a'));
select test.check('vendedor: lança gasto sem ver os já lançados', test.allowed($$insert into car_expenses (company_id, car_id, category, amount) select current_company_id(), 'ca000000-0000-0000-0000-0000000000a1', 'outros', 1$$));
select test.check('vendedor: não altera nem exclui gasto', test.denied('update car_expenses set amount = 1') and test.denied('delete from car_expenses'));
select test.check('vendedor: vê e cadastra clientes da loja', test.count('select * from customers') = test.exp('customers_a')
  and test.allowed($$insert into customers (company_id, name) select current_company_id(), 'Novo'$$));
select test.check('vendedor: não exclui cliente', test.denied('delete from customers'));
select test.check('vendedor: vê só os contratos que ele gerou', test.count('select * from contracts') = 1);
select test.check('vendedor: não gera contrato em nome de outra pessoa', test.denied($$
  insert into contracts (company_id, company_name, company_document, buyer_name, buyer_document, sale_price, created_by)
  select current_company_id(), 'x', 'x', 'x', 'x', 1, 'aaaaaaaa-0000-0000-0000-000000000001'$$));
select test.check('vendedor: vê só as vendas dele', test.count('select * from sales') = 1);
select test.check('vendedor: não registra venda sem vendedor ou no nome de outro', test.denied($$insert into sales (company_id, car_id, sale_price) select current_company_id(), 'ca000000-0000-0000-0000-0000000000a1', 1$$)
  and test.denied($$insert into sales (company_id, car_id, seller_id, sale_price) select current_company_id(), 'ca000000-0000-0000-0000-0000000000a1', '5e000000-0000-0000-0000-000000000005', 1$$));
select test.check('vendedor: registra venda no nome dele', test.allowed($$insert into sales (company_id, car_id, seller_id, sale_price) select current_company_id(), (select id from staff_cars where slug = 'do-vendedor'), current_seller_id(), 40000$$));
select test.check('vendedor: não altera nem desfaz venda', test.denied('update sales set sale_price = 1') and test.denied('delete from sales'));
select test.check('vendedor: não marca a própria comissão como paga', test.denied($$select mark_commissions_paid(array(select id from sales), null, current_date)$$));
select test.check('vendedor: vê só o próprio cadastro na equipe', test.count('select * from sellers') = 1);
select test.check('vendedor: não vê o registro de atividades', test.count('select * from activity_log') = 0);
select test.check('vendedor: não vê financiamentos', test.count('select * from customer_financings') = 0 and test.count('select * from financing_installments') = 0);
select test.check('vendedor: não vê visitas do site', test.count('select * from site_visits_daily') = 0);
select test.check('vendedor: vê só os documentos de cliente que ele anexou', test.count('select * from customer_documents') = 1);
select test.check('vendedor: arquivo de cliente só o que ele anexou', test.count($$select * from storage.objects where bucket_id = 'customer-documents'$$) = 1);
select test.check('vendedor: não anexa documento em nome de outra pessoa', test.denied($$
  insert into customer_documents (company_id, customer_id, file_path, created_by)
  select current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'x', 'aaaaaaaa-0000-0000-0000-000000000001'$$));
select test.check('vendedor: anexa documento de cliente', test.allowed($$
  insert into customer_documents (company_id, customer_id, file_path) select current_company_id(), 'c0000000-0000-0000-0000-0000000000a2', 'x'$$)
  and test.allowed($$insert into storage.objects (bucket_id, name) select 'customer-documents', current_company_id() || '/c/novo.pdf'$$));
select test.check('vendedor: não exclui documento nem arquivo', test.denied('delete from customer_documents') and test.denied('delete from storage.objects'));
select test.check('vendedor: vê e anexa documentos do carro', test.count($$select * from storage.objects where bucket_id = 'car-documents'$$) = 1
  and test.allowed($$insert into storage.objects (bucket_id, name) select 'car-documents', current_company_id() || '/x/y.pdf'$$));
select test.check('vendedor: anexa nota de gasto, mas não vê as anexadas', test.allowed($$insert into storage.objects (bucket_id, name) select 'expense-attachments', current_company_id() || '/x/n.pdf'$$)
  and test.count($$select * from storage.objects where bucket_id = 'expense-attachments'$$) = 0);
select test.check('vendedor: não vê nem envia fotos pelo storage antigo', test.count($$select * from storage.objects where bucket_id = 'car-photos'$$) = 0
  and test.denied($$insert into storage.objects (bucket_id, name) select 'car-photos', current_company_id() || '/x.webp'$$));
select test.check('vendedor: pode enviar foto pelo site (can_edit_stock)', can_edit_stock());
select test.check('vendedor: reserva no nome dele (mesmo pedindo outro vendedor)', test.try($$
  select reserve_car(jsonb_build_object('car_id', (select id from staff_cars where slug = 'oculto-a'), 'customer_id', 'c0000000-0000-0000-0000-0000000000a2', 'seller_id', '5e000000-0000-0000-0000-000000000005', 'deposit_amount', 500))$$) = 'ok:1'
  and test.count($$select * from car_reservations where seller_id = current_seller_id() and status = 'ativa'$$) = 1
  and test.count($$select * from staff_cars where slug = 'oculto-a' and status = 'reservado'$$) = 1);
select test.check('vendedor: não cancela reserva nem tira o carro de reservado', test.denied($$select close_reservation((select id from car_reservations limit 1), 'cancelada')$$)
  and test.denied($$update staff_cars set status = 'disponivel' where slug = 'oculto-a'$$));
select test.check('vendedor: cadastra financiamento externo no nome dele, sem marcar pago nem retorno', test.allowed($$
  insert into external_financings (company_id, customer_id, customer_name, financed_amount, seller_id, status, store_return)
  select current_company_id(), 'c0000000-0000-0000-0000-0000000000a2', 'Cliente A2', 30000, '5e000000-0000-0000-0000-000000000005', 'pago', 999$$)
  and test.count($$select * from external_financings where seller_id = current_seller_id() and status = 'aprovado' and store_return is null$$) = 1);
select test.check('vendedor: atualiza a situação do externo dele, mas não marca pago', test.allowed($$update external_financings set status = 'em_analise'$$)
  and test.denied($$update external_financings set status = 'pago'$$) and test.denied('update external_financings set store_return = 1'));
select test.check('vendedor: não exclui financiamento externo', test.denied('delete from external_financings'));
select test.check('vendedor: cadastra carro da troca (entra oculto e com o custo)', test.try($$select register_trade_in('{"brand":"VW","model":"Fox","year":2012,"value":15000}')$$) = 'ok:1');
select test.check('vendedor: não sobe modelo de contrato', test.denied($$insert into contract_templates (company_id, name, file_path) select current_company_id(), 'x', 'x'$$));
select test.check('vendedor: não mexe no checklist nem no aviso de estoque da loja', test.denied('update companies set sale_checklist = sale_checklist')
  and test.denied('update companies set stock_alert_days = 1'));
select test.check('vendedor: não vira admin nem entra em outra loja', test.denied($$update user_company set role = 'admin'$$)
  and test.denied($$insert into user_company (user_id, company_id, role) values (auth.uid(), 'bbbbbbbb-0000-0000-0000-00000000000b', 'admin')$$));
select test.check('vendedor: não altera o próprio cadastro/comissão', test.denied('update sellers set commission_value = 99'));
select test.check('vendedor: não aplica aviso de estoque nem grava custo', test.denied('select apply_stock_alert_to_all(3)')
  and test.denied($$select set_car_purchase('ca000000-0000-0000-0000-0000000000a1', 1, null)$$));
select test.check('vendedor: não edita as listas da loja', test.denied('update companies set bank_list = bank_list'));
reset role;
select test.check('comissão de financiamento externo calculada pelo banco', (
  select commission_amount from public.external_financings where customer_name = 'Cliente A2' limit 1) = 0);

-- =============================================== vendedor A2 (outro vendedor)
select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set role authenticated;
select test.check('vendedor A2: não vê reserva nem financiamento externo do outro vendedor',
  test.count('select * from car_reservations') = 0 and test.count('select * from external_financings') = 0);
reset role;

-- ================================================ admin A (depois do vendedor)
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: vê reservas e externos da equipe', test.count('select * from car_reservations') = 1 and test.count('select * from external_financings') = 1);
select test.check('admin A: marca o externo como pago com o retorno (comissão recalculada)', test.allowed($$update external_financings set status = 'pago', store_return = 2000$$)
  and test.count('select * from external_financings where paid_on is not null') = 1);
select test.check('admin A: cancela a reserva e o carro volta a ficar disponível', test.try($$select close_reservation((select id from car_reservations limit 1), 'cancelada')$$) = 'ok:1'
  and test.count($$select * from cars where slug = 'oculto-a' and status = 'disponivel'$$) = 1);
reset role;

-- ======================================================= vendedor desativado
select test.login('aaaaaaaa-0000-0000-0000-000000000006');
set role authenticated;
select test.check('desativado: perde o acesso a tudo', current_company_id() is null
  and test.count('select * from customers') = 0 and test.count('select * from seller_cars') = 0
  and test.count('select * from contracts') = 0 and test.count('select * from contract_templates') = 0
  and test.count('select * from storage.objects') = 0 and test.count('select * from customer_documents') = 0);
select test.check('desativado: não cadastra nada', test.denied($$insert into customers (company_id, name) select company_id, 'x' from user_company where user_id = auth.uid()$$));
reset role;

-- ================================= mesmo login: vendedor na A e admin na B
select test.login('aaaaaaaa-0000-0000-0000-000000000007');
set role authenticated;
select test.check('login em duas lojas: o papel vale só na loja atual',
  is_company_admin() = exists (select 1 from user_company where user_id = auth.uid() and company_id = current_company_id() and role = 'admin')
  and is_company_staff() = exists (select 1 from user_company where user_id = auth.uid() and company_id = current_company_id() and role in ('admin', 'manager')),
  format('loja atual %s, is_company_admin %s', current_company_id(), is_company_admin()));
select test.check('login em duas lojas: vendedor na loja A não vê custos nem gastos da A',
  current_company_id() <> test.company_a() or (test.count('select * from cars') = 0 and test.count('select * from car_expenses') = 0));
reset role;

-- ================================================================== admin B
select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: vê só a loja B', test.count($$select * from cars where company_id <> 'bbbbbbbb-0000-0000-0000-00000000000b'$$) = 0
  and test.count('select * from customers') = 1 and test.count('select * from customer_documents') = 1
  and test.count('select * from customer_financings') = 1 and test.count('select * from activity_log') = 1);
select test.check('admin B: arquivos só da loja B', test.count($$select * from storage.objects where name not like 'bbbbbbbb%'$$) = 0);
select test.check('admin B: não baixa arquivo de cliente da loja A', test.count($$select * from storage.objects where bucket_id = 'customer-documents' and name like '%c-a1%'$$) = 0);
reset role;

-- ============================================================= vendedor B
select test.login('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
select test.check('vendedor B: não enxerga nada da loja A (nem após rodar o schema de novo)',
  test.count($$select id from cars where company_id <> 'bbbbbbbb-0000-0000-0000-00000000000b'$$) <= 0
  and test.count($$select id from customers where company_id <> 'bbbbbbbb-0000-0000-0000-00000000000b'$$) <= 0
  and test.count($$select id from car_expenses$$) <= 0
  and test.count($$select * from storage.objects where name not like 'bbbbbbbb%'$$) = 0);
select test.check('vendedor B: continua vendedor (não vê custos da própria loja)', test.count('select * from cars') = 0 and not is_company_admin());
reset role;

-- ============================== 31) WhatsApp, configurações e atendimento
-- Preparação (sem RLS): loja A em rodízio com o vendedor A, o desativado, um
-- número avulso e o vendedor A2 (inativo no rodízio); loja B em modo fixo com
-- um número no rodízio (que não deve ser usado)
reset role;
update public.sellers set phone = '(98) 91111-0004' where id = '5e000000-0000-0000-0000-000000000004';
update public.sellers set phone = '(98) 91111-0005' where id = '5e000000-0000-0000-0000-000000000005';
update public.sellers set phone = '(98) 91111-0006' where id = '5e000000-0000-0000-0000-000000000006';
update public.companies set whatsapp_mode = 'rodizio', whatsapp_main = '(98) 98888-0000', whatsapp_last_entry = null where id = test.company_a();
update public.companies set whatsapp_mode = 'fixo', whatsapp_main = '98 96666-0000' where slug = 'loja-b';
insert into public.whatsapp_rotation (id, company_id, seller_id, name, phone, active, position)
select v.id::uuid, test.company_a(), v.seller::uuid, v.name, v.phone, v.active, v.pos
from (values
  ('0a000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000004', '', '', true, 1),
  ('0a000000-0000-0000-0000-000000000002', '5e000000-0000-0000-0000-000000000006', '', '', true, 2),
  ('0a000000-0000-0000-0000-000000000003', null, 'Recepção', '(98) 3222-0003', true, 3),
  ('0a000000-0000-0000-0000-000000000004', '5e000000-0000-0000-0000-000000000005', '', '', false, 4)
) v(id, seller, name, phone, active, pos);
insert into public.whatsapp_rotation (id, company_id, name, phone, position)
values ('0b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'B', '(98) 97777-0000', 1);
insert into public.customer_interests (id, company_id, customer_id, kind, brand, model, price_max)
values ('1a000000-0000-0000-0000-000000000001', test.company_a(), 'c0000000-0000-0000-0000-0000000000a2', 'procura', 'TOYOTA', 'corolla', 120000);
insert into public.customer_interests (id, company_id, customer_id, kind, brand)
values ('1b000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-0000000000b1', 'procura', 'Toyota');

-- ======================================================== anônimo (site)
select test.login(null);
set role anon;
select test.check('site: rodízio em sequência, pulando desativado e inativo',
  (select string_agg(right(p, 4), ',' order by g)
   from (select g, whatsapp_contact(test.company_a()) ->> 'phone' as p from generate_series(1, 4) g) s) = '0004,0003,0004,0003');
select test.check('site: o mesmo navegador continua com o mesmo número',
  whatsapp_contact(test.company_a(), null, '0a000000-0000-0000-0000-000000000003') ->> 'entry_id' = '0a000000-0000-0000-0000-000000000003');
select test.check('site: quem foi desativado na Equipe não é mantido',
  whatsapp_contact(test.company_a(), null, '0a000000-0000-0000-0000-000000000002') ->> 'entry_id' = '0a000000-0000-0000-0000-000000000001');
select test.check('site: modo fixo usa o número principal (mesmo com rodízio cadastrado)',
  whatsapp_contact('bbbbbbbb-0000-0000-0000-00000000000b') ->> 'phone' = '5598966660000');
select test.check('site: número principal para o topo e o rodapé', store_contact(test.company_a()) ->> 'main' = '5598988880000');
select test.check('site: não lê rodízio, contatos, interesses, avisos, atendimentos nem pendências',
  test.count('select * from whatsapp_rotation') <= 0 and test.count('select * from whatsapp_leads') <= 0
  and test.count('select * from customer_interests') <= 0 and test.count('select * from customer_interest_matches') <= 0
  and test.count('select * from customer_contacts') <= 0 and test.count('select * from dashboard_dismissals') <= 0);
select test.check('site: não grava contato direto nem configurações',
  test.denied($$insert into whatsapp_leads (company_id) values ('bbbbbbbb-0000-0000-0000-00000000000b')$$)
  and test.denied($$select save_store_settings('{"whatsapp_mode": "fixo"}')$$)
  and test.denied($$select * from team_directory()$$));
reset role;

-- ================================================================= admin A
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: vê o rodízio e os contatos do site só da loja A',
  test.count('select * from whatsapp_rotation') = 4 and test.count('select * from whatsapp_leads') = 6);
select test.check('admin A: edita o rodízio',
  test.allowed($$update whatsapp_rotation set position = 3 where id = '0a000000-0000-0000-0000-000000000003'$$)
  and test.allowed($$insert into whatsapp_rotation (company_id, name, phone, position) values (current_company_id(), 'Extra', '(98) 95555-0000', 9)$$));
select test.check('admin A: não põe vendedor de outra loja no rodízio',
  test.denied($$insert into whatsapp_rotation (company_id, seller_id) values (current_company_id(), '5e000000-0000-0000-0000-0000000000b2')$$));
select test.check('admin A: salva as configurações pela função',
  test.allowed($$select save_store_settings('{"panel_settings": {"hiddenTabs": {"all": [], "manager": [], "seller": ["relatorios"]}, "hiddenBlocks": ["visits"]}, "whatsapp_sticky_days": 15}')$$));
select test.check('admin A: configuração gravada, e não dá para alterar direto na tabela',
  (select whatsapp_sticky_days from companies) = 15 and test.denied($$update companies set whatsapp_mode = 'fixo'$$));
select test.check('admin A: dispensa uma pendência só para si',
  test.allowed($$insert into dashboard_dismissals (company_id, key, dismissed_count) values (current_company_id(), 'car-photo', 3)$$)
  and test.denied($$insert into dashboard_dismissals (user_id, company_id, key) values ('aaaaaaaa-0000-0000-0000-000000000004', current_company_id(), 'car-photo')$$));
select test.check('admin A: carro novo que combina gera aviso para o cliente',
  test.allowed($$insert into cars (company_id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, category, price, status)
    values (current_company_id(), 'corolla-combina', 'Toyota', 'Corolla', 'XEi 2.0', 2021, '2021/2022', 30000, 'Automático', 'Flex', 'Prata', 'sedan', 110000, 'disponivel')$$)
  and test.count($$select * from customer_interest_matches where customer_id = 'c0000000-0000-0000-0000-0000000000a2' and status = 'novo'$$) = 1);
select test.check('admin A: carro oculto ou acima do preço não gera aviso',
  test.allowed($$insert into cars (company_id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, category, price, status)
    values (current_company_id(), 'corolla-caro', 'Toyota', 'Corolla', 'Altis', 2023, '2023/2023', 10000, 'Automático', 'Flex', 'Preto', 'sedan', 150000, 'disponivel')$$)
  and test.allowed($$insert into cars (company_id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, category, price, status, hidden)
    values (current_company_id(), 'corolla-oculto', 'Toyota', 'Corolla', 'GLi', 2020, '2020/2020', 50000, 'Automático', 'Flex', 'Branco', 'sedan', 90000, 'disponivel', true)$$)
  and test.count('select * from customer_interest_matches') = 1);
reset role;

-- ============================================================== vendedor A
select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor A: vê só os próprios contatos do site', test.count('select * from whatsapp_leads') = 3);
select test.check('vendedor A: lê o rodízio, mas não altera',
  test.count('select * from whatsapp_rotation') = 5
  and test.denied($$update whatsapp_rotation set active = false$$) and test.denied($$delete from whatsapp_rotation$$));
select test.check('vendedor A: não salva configurações nem vê as pendências dispensadas pelo admin',
  test.denied($$select save_store_settings('{"whatsapp_mode": "fixo"}')$$) and test.count('select * from dashboard_dismissals') = 0);
select test.check('vendedor A: vê os nomes da equipe (sem comissões)', test.count('select * from team_directory()') >= 6);
select test.check('vendedor A: cadastra interesse e atendimento (com o nome dele)',
  test.allowed($$insert into customer_interests (company_id, customer_id, kind, brand) values (current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'procura', 'Honda')$$)
  and test.allowed($$insert into customer_contacts (company_id, customer_id, notes, follow_up_on) values (current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'Ligar de novo', current_date)$$)
  and test.count($$select * from customer_contacts where author_name = 'Vendedor A'$$) = 1);
select test.check('vendedor A: marca o aviso de carro como avisado',
  test.allowed($$update customer_interest_matches set status = 'avisado'$$)
  and test.count($$select * from customer_interest_matches where handled_by = auth.uid() and handled_at is not null$$) = 1);
reset role;

-- ============================================================= vendedor A2
select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set role authenticated;
select test.check('vendedor A2: não altera nem apaga interesse e atendimento de outro vendedor',
  test.denied($$update customer_interests set notes = 'x' where brand = 'Honda'$$)
  and test.denied($$delete from customer_contacts$$));
reset role;

-- =============================================================== gerente A
select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente A: vê todos os contatos do site, edita interesse de vendedor, não salva configurações',
  test.count('select * from whatsapp_leads') = 6
  and test.allowed($$update customer_interests set notes = 'ok' where brand = 'Honda'$$)
  and test.denied($$select save_store_settings('{"whatsapp_mode": "fixo"}')$$));
reset role;

-- ================================================================= admin B
select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: não vê rodízio, contatos, interesses, avisos nem atendimentos da loja A',
  test.count('select * from whatsapp_rotation') = 1 and test.count('select * from whatsapp_leads') = 1
  and test.count('select * from customer_interests') = 1 and test.count('select * from customer_interest_matches') = 0
  and test.count('select * from customer_contacts') = 0);
select test.check('admin B: não liga interesse a cliente da loja A',
  test.denied($$insert into customer_interests (company_id, customer_id, brand) values (current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'Fiat')$$));
select test.check('admin B: não põe vendedor da loja A como responsável pelo cliente',
  test.denied($$update customers set responsible_seller_id = '5e000000-0000-0000-0000-000000000004'$$));
reset role;

-- ========================================================= plataforma (33)
-- Dono da plataforma (fora de qualquer loja) e a loja B marcada como demonstração
insert into auth.users (id, email, last_sign_in_at) values ('cccccccc-0000-0000-0000-000000000001', 'dono@plataforma', now())
on conflict (id) do nothing;
insert into public.platform_admins (user_id) values ('cccccccc-0000-0000-0000-000000000001') on conflict do nothing;
update public.companies set is_demo = true where slug = 'loja-b';
insert into test.expected select 'companies_total', count(*) from public.companies;
insert into test.expected select 'in_stock_a', count(*) from public.cars where company_id = test.company_a() and status <> 'vendido';

select test.login(null);
set role anon;
select test.check('anon: não usa as funções da plataforma',
  test.denied($$select platform_overview(current_date - 30, current_date)$$)
  and test.denied($$select platform_store_detail(test.company_a(), current_date - 30, current_date)$$)
  and test.denied($$select is_platform_admin()$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: não é dono da plataforma e não vê os números das outras lojas',
  is_platform_admin() = false
  and test.denied($$select platform_overview(current_date - 30, current_date)$$)
  and test.denied($$select platform_store_detail('bbbbbbbb-0000-0000-0000-00000000000b', current_date - 30, current_date)$$));
select test.check('admin A: não lê nem grava a lista de donos da plataforma',
  test.count('select * from platform_admins') = -1
  and test.denied($$insert into platform_admins (user_id) values (auth.uid())$$));
select test.check('admin A: não marca a própria loja como demonstração nem muda o endereço',
  test.denied($$update companies set is_demo = true$$)
  and test.denied($$update companies set site_url = 'x'$$));
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: é reconhecido e vê todas as lojas',
  is_platform_admin()
  and jsonb_array_length(platform_overview(current_date - 30, current_date)) = test.exp('companies_total'));
select test.check('dono da plataforma: a loja de demonstração vem marcada',
  exists (select 1 from jsonb_array_elements(platform_overview(current_date - 30, current_date)) e
          where e ->> 'slug' = 'loja-b' and (e ->> 'is_demo')::boolean)
  and exists (select 1 from jsonb_array_elements(platform_overview(current_date - 30, current_date)) e
              where e ->> 'slug' = 'dom-motors' and not (e ->> 'is_demo')::boolean));
select test.check('dono da plataforma: estoque da loja A confere',
  (select (e -> 'stock' ->> 'in_stock')::bigint from jsonb_array_elements(platform_overview(current_date - 30, current_date)) e
   where e ->> 'slug' = 'dom-motors') = test.exp('in_stock_a'));
select test.check('dono da plataforma: atividades vêm sem rótulo fora de carros',
  jsonb_array_length(platform_store_detail(test.company_a(), current_date - 365, current_date) -> 'activities') > 0
  and not exists (
    select 1 from jsonb_array_elements(platform_store_detail(test.company_a(), current_date - 365, current_date) -> 'activities') e
    where e ->> 'entity' <> 'cars' and (e ->> 'label' is not null or e ->> 'details' is not null)));
select test.check('dono da plataforma: período inválido dá erro',
  test.denied($$select platform_overview(current_date, current_date - 1)$$)
  and test.denied($$select platform_store_detail(test.company_a(), current_date - 500, current_date)$$));
select test.check('dono da plataforma: sem loja própria, não tem aba Desempenho',
  test.denied($$select store_performance(current_date - 30, current_date)$$));
reset role;

-- ========================================================= desempenho (35)
select test.login(null);
set role anon;
select test.check('anon: não vê o desempenho de loja nenhuma',
  test.denied($$select store_performance(current_date - 30, current_date)$$)
  and test.denied($$select platform_rows(current_date - 30, current_date, null)$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: vê o desempenho da própria loja',
  (store_performance(current_date - 30, current_date) ->> 'id')::uuid = test.company_a()
  and (store_performance(current_date - 30, current_date) -> 'stock' ->> 'in_stock')::bigint = test.exp('in_stock_a'));
select test.check('admin A: vê o detalhe da própria loja',
  jsonb_array_length(platform_store_detail(test.company_a(), current_date - 365, current_date) -> 'activities') > 0);
select test.check('admin A: não chama a função interna com todas as lojas',
  test.denied($$select platform_rows(current_date - 30, current_date, null)$$)
  and test.denied($$select platform_rows(current_date - 30, current_date, 'bbbbbbbb-0000-0000-0000-00000000000b')$$));
select test.check('admin A: período inválido dá erro no desempenho',
  test.denied($$select store_performance(current_date, current_date - 1)$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente A: não vê o desempenho (só o admin)',
  test.denied($$select store_performance(current_date - 30, current_date)$$)
  and test.denied($$select platform_store_detail(test.company_a(), current_date - 30, current_date)$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor A: não vê o desempenho (só o admin)',
  test.denied($$select store_performance(current_date - 30, current_date)$$)
  and test.denied($$select platform_store_detail(test.company_a(), current_date - 30, current_date)$$));
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: vê só a loja B, nunca a loja A',
  (store_performance(current_date - 30, current_date) ->> 'id')::uuid = 'bbbbbbbb-0000-0000-0000-00000000000b'
  and test.denied($$select platform_store_detail(test.company_a(), current_date - 30, current_date)$$));
reset role;

-- Vendedor na loja A e admin na loja B: nunca recebe os números da loja A
select test.login('aaaaaaaa-0000-0000-0000-000000000007');
set role authenticated;
select test.check('vendedor A / admin B: nunca vê o desempenho da loja A',
  case when test.denied($$select store_performance(current_date - 30, current_date)$$) then true
       else (store_performance(current_date - 30, current_date) ->> 'id')::uuid <> test.company_a() end
  and test.denied($$select platform_store_detail(test.company_a(), current_date - 30, current_date)$$));
reset role;

-- ============================================================= cargos (37)
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: cria cargo personalizado',
  test.allowed($$insert into custom_roles (id, company_id, name, base_role, tabs) values ('c4000000-0000-0000-0000-0000000000a1', current_company_id(), 'Despachante', 'manager', '{vendas}')$$));
select test.check('admin A: não repete o nome do cargo na loja',
  test.denied($$insert into custom_roles (company_id, name, base_role) values (current_company_id(), ' despachante ', 'seller')$$));
select test.check('admin A: põe o vendedor A2 no cargo Despachante',
  test.allowed($$update sellers set custom_role_id = 'c4000000-0000-0000-0000-0000000000a1' where id = '5e000000-0000-0000-0000-000000000005'$$));
reset role;
select test.check('cargo com acesso de gerente: o login do vendedor A2 vira gerente',
  (select role from public.sellers where id = '5e000000-0000-0000-0000-000000000005') = 'manager'
  and (select role from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000005' and company_id = test.company_a()) = 'manager');
select test.check('troca de cargo aparece no registro de atividades',
  exists (select 1 from public.activity_log where entity = 'sellers' and entity_id = '5e000000-0000-0000-0000-000000000005'
          and details = 'cargo: Vendedor → Despachante'));

select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set role authenticated;
select test.check('despachante: lê o cargo (para o menu) e tem acesso de gerente',
  test.count('select * from custom_roles') = 1 and is_company_staff());
select test.check('despachante: não cria cargo nem muda o próprio cargo',
  test.denied($$insert into custom_roles (company_id, name, base_role) values (current_company_id(), 'Chefe', 'manager')$$)
  and test.denied($$update sellers set custom_role_id = null, role = 'seller' where id = '5e000000-0000-0000-0000-000000000005'$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente A: não muda cargo de ninguém nem edita cargos',
  test.denied($$update sellers set role = 'manager' where id = '5e000000-0000-0000-0000-000000000004'$$)
  and test.denied($$update custom_roles set base_role = 'seller'$$));
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: não vê cargos da loja A nem usa cargo da loja A',
  test.count('select * from custom_roles') = 0
  and test.denied($$update sellers set custom_role_id = 'c4000000-0000-0000-0000-0000000000a1' where id = '5e000000-0000-0000-0000-0000000000b2'$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: promove a gerente o vendedor que é admin em outra loja',
  test.allowed($$update sellers set role = 'manager' where id = '5e000000-0000-0000-0000-000000000007'$$));
select test.check('admin A: não transforma ninguém em admin pela Equipe',
  test.denied($$update sellers set role = 'admin' where id = '5e000000-0000-0000-0000-000000000004'$$));
select test.check('admin A: muda o nível do cargo',
  test.allowed($$update custom_roles set base_role = 'seller' where id = 'c4000000-0000-0000-0000-0000000000a1'$$));
reset role;
select test.check('promoção na loja A não mexe no vínculo de admin da loja B',
  (select role from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000007' and company_id = test.company_a()) = 'manager'
  and (select role from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000007' and company_id = 'bbbbbbbb-0000-0000-0000-00000000000b') = 'admin');
select test.check('cargo virou acesso de vendedor: a pessoa e o login acompanham',
  (select role from public.sellers where id = '5e000000-0000-0000-0000-000000000005') = 'seller'
  and (select role from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000005' and company_id = test.company_a()) = 'seller');

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: exclui o cargo',
  test.allowed($$delete from custom_roles where id = 'c4000000-0000-0000-0000-0000000000a1'$$));
reset role;
select test.check('cargo excluído: a pessoa fica sem cargo, com o nível que tinha',
  (select custom_role_id is null and role = 'seller' from public.sellers where id = '5e000000-0000-0000-0000-000000000005'));

-- ======================================================= painel WB.Dev (39)
-- Conta da loja A com mensalidade de R$ 100 vencendo dia 10 desde janeiro/2026
update public.client_accounts set monthly_price = 100, due_day = 10, billing_start = '2026-01-15'
where company_id = test.company_a();
select test.check('cobrança: início vira o dia 1 do mês',
  (select billing_start from public.client_accounts where company_id = test.company_a()) = '2026-01-01');
select test.check('cobrança: três meses sem pagar = atrasado desde o primeiro vencimento',
  public.client_billing(test.company_a(), '2026-03-12') ->> 'situation' = 'atrasado'
  and (public.client_billing(test.company_a(), '2026-03-12') ->> 'days_late')::int = 61
  and jsonb_array_length(public.client_billing(test.company_a(), '2026-03-12') -> 'open') = 3
  and (public.client_billing(test.company_a(), '2026-03-12') ->> 'open_total')::numeric = 300);
insert into public.client_payments (company_id, reference_month, amount, paid_on) values
  (test.company_a(), '2026-01-01', 100, '2026-01-10'),
  (test.company_a(), '2026-02-01', 100, '2026-02-10');
select test.check('cobrança: pagos janeiro e fevereiro, atraso conta só de março',
  (public.client_billing(test.company_a(), '2026-03-12') ->> 'days_late')::int = 2
  and jsonb_array_length(public.client_billing(test.company_a(), '2026-03-12') -> 'open') = 1);
insert into public.client_payments (company_id, reference_month, amount, paid_on) values (test.company_a(), '2026-03-01', 100, '2026-03-12');
select test.check('cobrança: tudo pago = em dia, próximo vencimento em abril',
  public.client_billing(test.company_a(), '2026-03-12') ->> 'situation' = 'em_dia'
  and public.client_billing(test.company_a(), '2026-03-12') -> 'next' ->> 'due' = '2026-04-10');
select test.check('cobrança: 4 dias antes = vence em breve; no dia = vence hoje',
  public.client_billing(test.company_a(), '2026-04-06') ->> 'situation' = 'vence_em_breve'
  and public.client_billing(test.company_a(), '2026-04-10') ->> 'situation' = 'vence_hoje');
select test.check('cobrança: sem valor ou sem vencimento = sem cobrança',
  public.client_billing('bbbbbbbb-0000-0000-0000-00000000000b', '2026-04-10') ->> 'situation' = 'sem_cobranca');
select test.check('cobrança: o mesmo mês não é pago duas vezes',
  test.denied($$insert into public.client_payments (company_id, reference_month, amount) values (test.company_a(), '2026-03-01', 100)$$));

-- Avisos: um para todas as lojas, um só para o admin da loja A, um para a loja B
insert into public.client_notices (company_id, title, audience) values
  (null, 'Aviso geral', 'equipe'),
  (test.company_a(), 'Só para o admin A', 'admin'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Aviso da loja B', 'equipe');

select test.login(null);
set role anon;
select test.check('anon: não vê planos, contas, pagamentos nem avisos',
  test.count('select * from plans') <= 0 and test.count('select * from client_accounts') <= 0
  and test.count('select * from client_payments') <= 0 and test.count('select * from client_notices') <= 0);
select test.check('anon: vê só se a loja está bloqueada e o nome (para o site)',
  (company_status(test.company_a()) ->> 'blocked')::boolean = false
  and (select array_agg(k order by k) from jsonb_object_keys(company_status(test.company_a())) k) = array['blocked', 'name']);
select test.check('anon: não usa a lista de clientes nem a conta da loja',
  test.denied($$select platform_clients()$$) and test.denied($$select my_account()$$)
  and test.denied($$select client_billing('00000000-0000-0000-0000-000000000000', null)$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: não lê nem grava planos, contas, pagamentos e avisos',
  test.count('select * from plans') <= 0 and test.count('select * from client_accounts') <= 0
  and test.count('select * from client_payments') <= 0 and test.count('select * from client_notices') <= 0
  and test.denied($$update client_accounts set status = 'ativo', monthly_price = 0$$)
  and test.denied($$insert into client_payments (company_id, reference_month, amount) values (current_company_id(), '2026-05-01', 1)$$)
  and test.denied($$select platform_clients()$$));
select test.check('admin A: vê a própria mensalidade, o plano e os avisos dele (não os da loja B)',
  my_account() ->> 'status' = 'ativo'
  and my_account() -> 'billing' ->> 'situation' is not null
  and jsonb_array_length(my_account() -> 'features') > 0
  and (select count(*) from jsonb_array_elements(my_account() -> 'notices') n where n ->> 'title' in ('Aviso geral', 'Só para o admin A')) = 2
  and not exists (select 1 from jsonb_array_elements(my_account() -> 'notices') n where n ->> 'title' = 'Aviso da loja B'));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor A: não vê a mensalidade nem o aviso só para o admin',
  my_account() -> 'billing' = 'null'::jsonb
  and not exists (select 1 from jsonb_array_elements(my_account() -> 'notices') n where n ->> 'title' = 'Só para o admin A')
  and exists (select 1 from jsonb_array_elements(my_account() -> 'notices') n where n ->> 'title' = 'Aviso geral'));
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: lista os clientes com cobrança e checagens',
  jsonb_array_length(platform_clients()) >= 1
  and exists (select 1 from jsonb_array_elements(platform_clients()) c where c ->> 'company_id' = test.company_a()::text
              and c -> 'billing' ->> 'situation' is not null and c -> 'checks' ? 'whatsapp_ok'));
select test.check('dono da plataforma: grava planos, contas, pagamentos e avisos',
  test.allowed($$insert into plans (name, monthly_price, features) values ('Básico', 99, '{estoque,vendas}')$$)
  and test.allowed($$update client_accounts set notes = 'ok' where company_id = test.company_a()$$)
  and test.allowed($$insert into client_payments (company_id, reference_month, amount) values (test.company_a(), '2026-04-01', 100)$$)
  and test.allowed($$insert into client_notices (title) values ('Manutenção programada')$$));
reset role;

-- Bloqueio da loja A
update public.client_accounts set status = 'bloqueado', block_reason = 'teste' where company_id = test.company_a();
select test.check('bloqueio: grava quando a loja foi bloqueada',
  (select blocked_at is not null from public.client_accounts where company_id = test.company_a()));

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('loja bloqueada: o admin perde o acesso a tudo',
  current_company_id() is null and test.count('select * from cars') = 0 and test.count('select * from customers') = 0
  and test.denied($$select my_account()$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('loja bloqueada: o vendedor perde o acesso a tudo',
  current_company_id() is null and test.count('select * from staff_cars') = 0);
reset role;

select test.login(null);
set role anon;
select test.check('loja bloqueada: o site não vê os carros dela e sabe que está bloqueada',
  test.count('select id from cars where company_id = test.company_a()') = 0
  and (company_status(test.company_a()) ->> 'blocked')::boolean);
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('loja bloqueada: as outras lojas continuam normais',
  current_company_id() = 'bbbbbbbb-0000-0000-0000-00000000000b');
reset role;

update public.client_accounts set status = 'ativo' where company_id = test.company_a();
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('loja liberada: o admin volta a ter acesso',
  current_company_id() = test.company_a() and test.count('select * from cars') > 0);
reset role;
select test.check('liberada: a data do bloqueio é apagada',
  (select blocked_at is null from public.client_accounts where company_id = test.company_a()));

select test.check('a loja de demonstração não pode ser bloqueada',
  test.denied($$update public.client_accounts set status = 'bloqueado' where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$));

-- ================================================================ resultado
select case when ok then 'PASS' else 'FAIL' end as resultado, name as teste, coalesce(detail, '') as detalhe
from test.results order by id;

select count(*) filter (where ok) as passaram, count(*) filter (where not ok) as falharam from test.results;
