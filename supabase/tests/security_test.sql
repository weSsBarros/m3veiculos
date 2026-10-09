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
-- Desde a seção 69 o admin promove a administrador pela Equipe (e volta)
select test.check('admin A: promove o vendedor a administrador e volta para vendedor',
  test.allowed($$update sellers set role = 'admin' where id = '5e000000-0000-0000-0000-000000000004'$$)
  and test.allowed($$update sellers set role = 'seller' where id = '5e000000-0000-0000-0000-000000000004'$$)
  and (select role from sellers where id = '5e000000-0000-0000-0000-000000000004') = 'seller');
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
-- As lojas de teste nascem "Em implantação" (seção 43); aqui fazem o papel das
-- lojas que já existiam, ativas
update public.client_accounts set status = 'ativo';
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
select test.check('cobrança: 3 dias antes = vence em breve (4 dias antes ainda em dia); no dia = vence hoje',
  public.client_billing(test.company_a(), '2026-04-07') ->> 'situation' = 'vence_em_breve'
  and public.client_billing(test.company_a(), '2026-04-06') ->> 'situation' = 'em_dia'
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
select test.check('loja bloqueada: no login, o admin vê a cobrança e o PIX para pagar',
  (suspended_account(test.company_a()) ->> 'admin')::boolean
  and suspended_account(test.company_a()) ? 'billing'
  and suspended_account(test.company_a()) ? 'pix_key'
  and suspended_account(test.company_a()) ->> 'name' is not null);
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('loja bloqueada: o vendedor perde o acesso a tudo',
  current_company_id() is null and test.count('select * from staff_cars') = 0);
select test.check('loja bloqueada: o vendedor não vê a cobrança nem o PIX no login',
  (suspended_account(test.company_a()) ->> 'admin')::boolean = false
  and not (suspended_account(test.company_a()) ? 'billing')
  and not (suspended_account(test.company_a()) ? 'pix_key'));
reset role;

select test.login(null);
set role anon;
select test.check('loja bloqueada: o site não vê os carros dela e sabe que está bloqueada',
  test.count('select id from cars where company_id = test.company_a()') = 0
  and (company_status(test.company_a()) ->> 'blocked')::boolean);
select test.check('loja bloqueada: sem login, não vê a cobrança',
  test.denied($$select suspended_account(test.company_a())$$));
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('loja bloqueada: as outras lojas continuam normais',
  current_company_id() = 'bbbbbbbb-0000-0000-0000-00000000000b');
select test.check('loja bloqueada: o admin de outra loja não vê a cobrança dela; a própria loja, liberada, não tem nada',
  (suspended_account(test.company_a()) ->> 'admin')::boolean = false
  and not (suspended_account(test.company_a()) ? 'billing')
  and suspended_account('bbbbbbbb-0000-0000-0000-00000000000b') is null);
reset role;

update public.client_accounts set status = 'ativo' where company_id = test.company_a();
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('loja liberada: o admin volta a ter acesso',
  current_company_id() = test.company_a() and test.count('select * from cars') > 0
  and suspended_account(test.company_a()) is null);
reset role;
select test.check('liberada: a data do bloqueio é apagada',
  (select blocked_at is null from public.client_accounts where company_id = test.company_a()));

select test.check('a loja de demonstração não pode ser bloqueada',
  test.denied($$update public.client_accounts set status = 'bloqueado' where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$));

-- ================================================ despesas da plataforma (41)
select test.login(null);
set role anon;
select test.check('anon: não vê nem lança despesas da plataforma',
  test.count('select * from platform_expenses') <= 0
  and test.denied($$insert into platform_expenses (description, amount) values ('x', 1)$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: não vê nem lança despesas da plataforma',
  test.count('select * from platform_expenses') <= 0
  and test.denied($$insert into platform_expenses (description, amount) values ('x', 1)$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor A: não vê nem lança despesas da plataforma',
  test.count('select * from platform_expenses') <= 0
  and test.denied($$insert into platform_expenses (description, amount) values ('x', 1)$$));
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: lança, edita e apaga despesas (com ou sem cliente)',
  test.allowed($$insert into platform_expenses (description, category, amount, company_id) values ('Domínio da loja A', 'dominios', 59.99, test.company_a())$$)
  and test.allowed($$insert into platform_expenses (description, category, amount) values ('Hospedagem', 'hospedagem', 120)$$)
  and test.allowed($$update platform_expenses set amount = 60 where description = 'Domínio da loja A'$$)
  and test.count('select * from platform_expenses') = 2
  and test.allowed($$delete from platform_expenses where description = 'Hospedagem'$$));
select test.check('despesa: valor zero, sem descrição ou categoria inválida são recusados',
  test.denied($$insert into platform_expenses (description, amount) values ('x', 0)$$)
  and test.denied($$insert into platform_expenses (description, amount) values ('  ', 10)$$)
  and test.denied($$insert into platform_expenses (description, category, amount) values ('x', 'festa', 10)$$));
reset role;

-- ================================== implantação, ativação e novo cliente (43)
-- Loja nova entra sozinha "Em implantação", sem cobrança
insert into public.companies (id, slug, name) values ('dddddddd-0000-0000-0000-00000000000d', 'loja-nova-teste', 'Loja Nova Teste');
select test.check('loja nova: ganha a conta "Em implantação" no plano Completo, contando desde hoje',
  (select status = 'implantacao' and implantation_started_on is not null and activated_on is null and plan_id is not null
   from public.client_accounts where company_id = 'dddddddd-0000-0000-0000-00000000000d'));
update public.client_accounts set monthly_price = 150 where company_id = 'dddddddd-0000-0000-0000-00000000000d';
select test.check('implantação: não cobra (mesmo com valor) e não bloqueia a loja',
  public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-10') ->> 'situation' = 'implantacao'
  and not public.company_blocked('dddddddd-0000-0000-0000-00000000000d'));

-- Ativou em 10/10/2026: vence no próprio dia e depois todo dia 10 (seção 65)
update public.client_accounts set status = 'ativo', activated_on = '2026-10-10' where company_id = 'dddddddd-0000-0000-0000-00000000000d';
select test.check('ativação: grava a data escolhida; 1º vencimento no dia da ativação e todo mês no mesmo dia',
  (select activated_on = '2026-10-10' from public.client_accounts where company_id = 'dddddddd-0000-0000-0000-00000000000d')
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-06') ->> 'situation' = 'em_dia'
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-08') ->> 'situation' = 'vence_em_breve'
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-08') -> 'next' ->> 'due' = '2026-10-10'
  and (public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-08') ->> 'due_day')::int = 10
  and (public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-08') ->> 'due_day_auto')::boolean
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-10') ->> 'situation' = 'vence_hoje'
  and (public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-13') ->> 'days_late')::int = 3);
insert into public.client_payments (company_id, reference_month, amount, paid_on) values ('dddddddd-0000-0000-0000-00000000000d', '2026-10-01', 150, '2026-10-10');
select test.check('ativação: pago o mês da ativação, o próximo vence no mesmo dia do mês seguinte',
  public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-20') ->> 'situation' = 'em_dia'
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-20') -> 'next' ->> 'due' = '2026-11-10');

-- Ativou dia 31: nos meses mais curtos, vence no último dia do mês
update public.client_accounts set activated_on = '2027-01-31' where company_id = 'dddddddd-0000-0000-0000-00000000000d';
select test.check('ativação no dia 31: vence no último dia dos meses mais curtos',
  (public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2027-01-31') ->> 'due_day')::int = 31
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2027-01-31') -> 'next' ->> 'due' = '2027-01-31'
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2027-02-01') -> 'next' ->> 'due' = '2027-02-28'
  and exists (select 1 from jsonb_array_elements(public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2027-05-01') -> 'open') o
              where o ->> 'due' = '2027-04-30'));

-- O dia escolhido à mão vale no lugar do automático
update public.client_accounts set due_day = 5, activated_on = '2026-10-10' where company_id = 'dddddddd-0000-0000-0000-00000000000d';
select test.check('vencimento escolhido à mão se sobrepõe ao automático',
  public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-20') -> 'next' ->> 'due' = '2026-11-05'
  and not (public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-10-20') ->> 'due_day_auto')::boolean);

-- Voltar para implantação recomeça a contagem e para de cobrar
update public.client_accounts set status = 'implantacao' where company_id = 'dddddddd-0000-0000-0000-00000000000d';
select test.check('voltar para implantação: recomeça a contagem, apaga a ativação e para de cobrar',
  (select activated_on is null and implantation_started_on = (now() at time zone 'America/Fortaleza')::date
   from public.client_accounts where company_id = 'dddddddd-0000-0000-0000-00000000000d')
  and public.client_billing('dddddddd-0000-0000-0000-00000000000d', '2026-12-20') ->> 'situation' = 'implantacao');
update public.client_accounts set status = 'ativo' where company_id = 'dddddddd-0000-0000-0000-00000000000d';
select test.check('ativação sem data: usa o dia de hoje',
  (select activated_on = (now() at time zone 'America/Fortaleza')::date
   from public.client_accounts where company_id = 'dddddddd-0000-0000-0000-00000000000d'));
select test.check('situação inválida é recusada',
  test.denied($$update public.client_accounts set status = 'pausado' where company_id = 'dddddddd-0000-0000-0000-00000000000d'$$));

-- Botão "Novo cliente"
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin de loja: não cria cliente na plataforma',
  test.denied($$select platform_create_client('Loja X', 'loja-x')$$));
reset role;

select test.login(null);
set role anon;
select test.check('anon: não cria cliente na plataforma',
  test.denied($$select platform_create_client('Loja Y', 'loja-y')$$));
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
-- cria numa consulta e confere na seguinte (a mesma consulta não enxerga o que criou)
select platform_create_client('Auto Teste', 'auto-teste', 'Fulano', '(98) 90000-0000', 'fulano@exemplo.com', null, 180, null) ->> 'slug' as criado;
select test.check('dono da plataforma: cria o cliente já em implantação, com responsável e valor',
  exists (select 1 from jsonb_array_elements(platform_clients()) c
              where c ->> 'slug' = 'auto-teste' and c -> 'account' ->> 'status' = 'implantacao'
                and c -> 'account' ->> 'responsible_name' = 'Fulano'
                and (c -> 'account' ->> 'monthly_price')::numeric = 180
                and c -> 'billing' ->> 'situation' = 'implantacao'));
select test.check('novo cliente: endereço interno repetido ou inválido e nome vazio são recusados',
  test.denied($$select platform_create_client('Outra', 'auto-teste')$$)
  and test.denied($$select platform_create_client('Outra', 'Com Espaco')$$)
  and test.denied($$select platform_create_client('', 'nome-vazio')$$));
reset role;

-- ============================ lembretes de mensalidade por e-mail (45)
-- Cliente ativo com mensalidade de R$ 100 vencendo dia 10 desde outubro/2026
insert into public.companies (id, slug, name) values ('eeeeeeee-0000-0000-0000-00000000000e', 'lembrete-teste', 'Lembrete Teste');
update public.client_accounts
set status = 'ativo', monthly_price = 100, due_day = 10, billing_start = '2026-10-01', responsible_email = ' Dono@Lembrete.Teste '
where company_id = 'eeeeeeee-0000-0000-0000-00000000000e';

-- Tipos de lembrete que saem para essa loja num dia (como a Edge Function, com a chave de serviço)
create function test.lembrete(p_day date) returns text language sql as $$
  select coalesce(string_agg(x ->> 'kind', ',' order by x ->> 'kind'), '')
  from jsonb_array_elements(public.billing_reminders_due(p_day)) x
  where x ->> 'company_id' = 'eeeeeeee-0000-0000-0000-00000000000e'
$$;
select set_config('request.jwt.claim.role', 'service_role', false);

select test.check('lembretes: de 3 a 1 dia antes, no dia e com 1, 3 e 7 dias de atraso',
  test.lembrete('2026-10-06') = ''
  and test.lembrete('2026-10-07') = 'antes_3'
  and test.lembrete('2026-10-09') = 'antes_3'
  and test.lembrete('2026-10-10') = 'no_dia'
  and test.lembrete('2026-10-11') = 'atraso_1'
  and test.lembrete('2026-10-13') = 'atraso_3'
  and test.lembrete('2026-10-17') = 'atraso_7'
  and test.lembrete('2026-10-24') = ''
  and test.lembrete('2026-11-07') = 'antes_3');
select test.check('lembretes: vão para o e-mail do responsável (minúsculo, sem espaços), com valor, vencimento e o site da loja',
  exists (select 1 from jsonb_array_elements(public.billing_reminders_due('2026-10-07')) x
          where x ->> 'company_id' = 'eeeeeeee-0000-0000-0000-00000000000e'
            and x -> 'to' = '["dono@lembrete.teste"]'::jsonb
            and (x ->> 'amount')::numeric = 100 and x ->> 'due' = '2026-10-10' and (x ->> 'days')::int = 3
            and x ? 'site_url'));

-- Lembrete já enviado não sai de novo; com erro, tenta de novo
insert into public.client_reminders (company_id, kind, reference_month, sent_to, status) values
  ('eeeeeeee-0000-0000-0000-00000000000e', 'antes_3', '2026-10-01', 'dono@lembrete.teste', 'enviado'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'no_dia', '2026-10-01', 'dono@lembrete.teste', 'erro');
select test.check('lembretes: o mesmo lembrete do mesmo mês sai uma vez só (o que deu erro tenta de novo)',
  test.lembrete('2026-10-08') = ''
  and test.lembrete('2026-10-10') = 'no_dia'
  and test.denied($$insert into public.client_reminders (company_id, kind, reference_month, status)
                    values ('eeeeeeee-0000-0000-0000-00000000000e', 'antes_3', '2026-10-01', 'enviado')$$));

-- Pagou outubro: nada de atraso
insert into public.client_payments (company_id, reference_month, amount, paid_on) values ('eeeeeeee-0000-0000-0000-00000000000e', '2026-10-01', 100, '2026-10-10');
select test.check('lembretes: mês pago não gera aviso de atraso',
  test.lembrete('2026-10-11') = '' and test.lembrete('2026-10-17') = '');

update public.client_accounts set reminders_enabled = false where company_id = 'eeeeeeee-0000-0000-0000-00000000000e';
select test.check('lembretes: desligados na ficha, não sai nada', test.lembrete('2026-11-07') = '');
update public.client_accounts set reminders_enabled = true, status = 'implantacao' where company_id = 'eeeeeeee-0000-0000-0000-00000000000e';
select test.check('lembretes: cliente em implantação não recebe', test.lembrete('2026-11-07') = '');

select test.check('lembretes: sem e-mail do responsável, vão para os admins da loja (fora o dono da plataforma)',
  'admin@loja-a' = any(public.client_reminder_recipients(test.company_a()))
  and not exists (select 1 from unnest(public.client_reminder_recipients(test.company_a())) e
                  join auth.users u on lower(u.email) = e join public.platform_admins pa on pa.user_id = u.id));

-- Login da equipe WB.Dev como admin da loja A: fica fora da lista
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-0000000000e1', 'suporte@wbdev');
insert into public.user_company (user_id, company_id, role) values ('cccccccc-0000-0000-0000-0000000000e1', test.company_a(), 'admin');
select test.check('lembretes: sem a tabela da equipe, o login de suporte receberia',
  'suporte@wbdev' = any(public.client_reminder_recipients(test.company_a())));
insert into public.platform_team (user_id) values ('cccccccc-0000-0000-0000-0000000000e1');
select test.check('lembretes: logins da equipe WB.Dev (platform_team) não recebem; o admin da loja continua',
  not ('suporte@wbdev' = any(public.client_reminder_recipients(test.company_a())))
  and 'admin@loja-a' = any(public.client_reminder_recipients(test.company_a())));
delete from public.user_company where user_id = 'cccccccc-0000-0000-0000-0000000000e1';
delete from auth.users where id = 'cccccccc-0000-0000-0000-0000000000e1';
select set_config('request.jwt.claim.role', '', false);

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin de loja: não vê a lista de lembretes nem o histórico',
  test.denied($$select billing_reminders_due()$$)
  and test.denied($$select client_reminder_recipients(current_company_id())$$)
  and test.denied($$select * from platform_team$$)
  and test.count('select * from client_reminders') <= 0);
reset role;

select test.login(null);
set role anon;
select test.check('anon: não vê lembretes', test.denied($$select billing_reminders_due()$$) and test.count('select * from client_reminders') <= 0);
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: vê a prévia dos lembretes e o histórico, mas não grava no histórico',
  test.allowed($$select billing_reminders_due()$$)
  and test.count('select * from client_reminders') >= 2
  and test.denied($$insert into client_reminders (company_id, kind, reference_month) values ('eeeeeeee-0000-0000-0000-00000000000e', 'atraso_1', '2026-12-01')$$));
reset role;

-- ============================ modelos de contrato: edição e versões (47)
select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: não edita modelo de contrato nem vê as versões',
  test.denied($$select save_contract_template_file((select id from contract_templates where name = 'Modelo A'), current_company_id() || '/vendedor.docx')$$)
  and test.denied($$update contract_templates set name = 'x'$$)
  and test.count('select * from contract_template_versions') = 0);
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente: não edita modelo de contrato',
  test.denied($$select save_contract_template_file((select id from contract_templates where name = 'Modelo A'), current_company_id() || '/gerente.docx')$$)
  and test.denied($$update contract_templates set name = 'x'$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: salva o arquivo novo do modelo',
  test.allowed($$select save_contract_template_file((select id from contract_templates where name = 'Modelo A'), current_company_id() || '/modelo-v2.docx')$$));
select test.check('admin A: o modelo aponta para o arquivo novo e o anterior vira versão',
  (select file_path from contract_templates where name = 'Modelo A') = current_company_id() || '/modelo-v2.docx'
  and (select updated_at from contract_templates where name = 'Modelo A') is not null
  and test.count($$select * from contract_template_versions where file_path = current_company_id() || '/modelo.docx'$$) = 1);
select test.check('admin A: não aponta o modelo para arquivo de outra loja nem para o mesmo arquivo',
  test.denied($$select save_contract_template_file((select id from contract_templates where name = 'Modelo A'), 'bbbbbbbb-0000-0000-0000-00000000000b/modelo.docx')$$)
  and test.denied($$select save_contract_template_file((select id from contract_templates where name = 'Modelo A'), current_company_id() || '/modelo-v2.docx')$$));
select test.check('admin A: renomeia o modelo',
  test.allowed($$update contract_templates set name = 'Modelo A' where name = 'Modelo A'$$));
select test.check('admin A: restaura a versão anterior (a atual vira versão)',
  test.allowed($$select restore_contract_template_version((select id from contract_template_versions where file_path = current_company_id() || '/modelo.docx'))$$));
select test.check('admin A: depois de restaurar, volta ao arquivo antigo e guarda o que estava',
  (select file_path from contract_templates where name = 'Modelo A') = current_company_id() || '/modelo.docx'
  and test.count($$select * from contract_template_versions where file_path = current_company_id() || '/modelo-v2.docx'$$) = 1
  and test.count($$select * from contract_template_versions where file_path = current_company_id() || '/modelo.docx'$$) = 0);
select test.check('admin A: o contrato guarda o modelo e a versão usados',
  test.allowed($$insert into contracts (company_id, company_name, company_document, buyer_name, buyer_document, sale_price, template_id, template_file_path)
                 select current_company_id(), 'Loja A', '1', 'Cliente', '2', 1000, id, file_path from contract_templates where name = 'Modelo A'$$));
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: não vê as versões nem edita o modelo da loja A',
  test.count('select * from contract_template_versions') = 0
  and test.denied($$select save_contract_template_file((select id from contract_templates where name = 'Modelo A' limit 1), current_company_id() || '/x.docx')$$)
  and test.denied($$select restore_contract_template_version(id) from contract_template_versions$$)
  and (select file_path from public.contract_templates where name = 'Modelo B') = current_company_id() || '/modelo.docx');
reset role;

select test.login(null);
set role anon;
select test.check('anon: não edita modelos nem vê versões',
  test.denied($$select save_contract_template_file('00000000-0000-0000-0000-000000000000', 'x/y.docx')$$)
  and test.count('select * from contract_template_versions') <= 0);
reset role;

-- ============================ estoque: tipo de entrada, dono e WhatsApp do carro (49)
update public.sellers set phone = '(98) 95555-0004' where id = '5e000000-0000-0000-0000-000000000004';
insert into public.cars (id, company_id, slug, brand, model, version, year, model_year, km, transmission, fuel, color, category, price, status, entry_type, owner_customer_id, whatsapp_seller_id)
values
  ('ca000000-0000-0000-0000-0000000000a5', test.company_a(), 'repasse-a', 'Marca', 'Modelo', 'V', 2020, '2020/2020', 1000, 'Manual', 'Flex', 'Preto', 'hatch', 30000, 'disponivel', 'repasse', 'c0000000-0000-0000-0000-0000000000a1', null),
  ('ca000000-0000-0000-0000-0000000000a6', test.company_a(), 'consignado-a', 'Marca', 'Modelo', 'V', 2021, '2021/2021', 1000, 'Manual', 'Flex', 'Preto', 'moto', 30000, 'disponivel', 'consignado', 'c0000000-0000-0000-0000-0000000000a2', '5e000000-0000-0000-0000-000000000004');

select test.check('estoque: tipo de entrada só showroom, consignado ou repasse (padrão showroom)',
  test.denied($$update public.cars set entry_type = 'outro' where id = 'ca000000-0000-0000-0000-0000000000a6'$$)
  and (select entry_type from public.cars where id = 'ca000000-0000-0000-0000-0000000000a2') = 'showroom');
select test.check('estoque: o dono e o WhatsApp do carro têm que ser desta loja',
  test.denied($$update public.cars set owner_customer_id = 'c0000000-0000-0000-0000-0000000000b1' where id = 'ca000000-0000-0000-0000-0000000000a6'$$)
  and test.denied($$update public.cars set whatsapp_seller_id = '5e000000-0000-0000-0000-0000000000b2' where id = 'ca000000-0000-0000-0000-0000000000a6'$$));

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: escolhe o tipo de entrada, o dono e o WhatsApp do carro',
  test.allowed($$update staff_cars set entry_type = 'consignado', owner_customer_id = 'c0000000-0000-0000-0000-0000000000a2',
                 whatsapp_seller_id = '5e000000-0000-0000-0000-000000000004' where id = 'ca000000-0000-0000-0000-0000000000a6'$$)
  and test.count($$select * from staff_cars where entry_type = 'repasse'$$) = 1);
reset role;

select test.login(null);
set role anon;
select test.check('site: carro de repasse não aparece; consignado aparece',
  test.count($$select id from cars where slug = 'repasse-a'$$) = 0
  and test.count($$select id from cars where slug = 'consignado-a'$$) = 1);
select test.check('site: WhatsApp do carro vai para a pessoa definida, passando por cima do rodízio',
  right(whatsapp_contact(test.company_a(), 'consignado-a') ->> 'phone', 4) = '0004'
  and whatsapp_contact(test.company_a(), 'consignado-a') ->> 'mode' = 'carro');
reset role;

update public.sellers set phone = '' where id = '5e000000-0000-0000-0000-000000000004';
set role anon;
select test.check('site: pessoa do carro sem telefone, segue o rodízio da loja',
  whatsapp_contact(test.company_a(), 'consignado-a') ->> 'mode' = 'rodizio');
reset role;

-- ============================ modelos de contrato da entrada (51)
select test.check('modelos: tipo venda por padrão e só venda ou entrada',
  (select kind from public.contract_templates where name = 'Modelo A') = 'venda'
  and test.denied($$update public.contract_templates set kind = 'outro' where name = 'Modelo A'$$));

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: vê os modelos, mas não muda o tipo',
  test.count('select * from contract_templates') >= 1
  and test.denied($$update contract_templates set kind = 'entrada'$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: marca um modelo como de entrada',
  test.allowed($$update contract_templates set kind = 'entrada' where name = 'Modelo A'$$)
  and test.allowed($$update contract_templates set kind = 'venda' where name = 'Modelo A'$$));
reset role;

-- ============================ assinatura digital (53)
insert into public.signature_requests (company_id, kind, contract_id, car_id, customer_id, title, external_id, sent_by)
select test.company_a(), 'venda', (select id from public.contracts where created_by = 'aaaaaaaa-0000-0000-0000-000000000004' limit 1),
       null::uuid, 'c0000000-0000-0000-0000-0000000000a1'::uuid, 'Contrato do vendedor', 'doc-a-vendedor', 'aaaaaaaa-0000-0000-0000-000000000004'::uuid
union all select test.company_a(), 'entrada', null, 'ca000000-0000-0000-0000-0000000000a6', 'c0000000-0000-0000-0000-0000000000a2',
       'Consignação', 'doc-a-admin', 'aaaaaaaa-0000-0000-0000-000000000001'
union all select 'bbbbbbbb-0000-0000-0000-00000000000b', 'venda', null, null, 'c0000000-0000-0000-0000-0000000000b1',
       'Contrato B', 'doc-b', 'bbbbbbbb-0000-0000-0000-000000000001';

select test.check('assinaturas: contrato e cliente têm que ser da mesma loja; situação só as previstas',
  test.denied($$insert into public.signature_requests (company_id, contract_id)
                select test.company_a(), id from public.contracts where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$)
  and test.denied($$insert into public.signature_requests (company_id, customer_id) values (test.company_a(), 'c0000000-0000-0000-0000-0000000000b1')$$)
  and test.denied($$insert into public.signature_requests (company_id, status) values (test.company_a(), 'outro')$$)
  and test.denied($$insert into public.signature_requests (company_id, external_id) values (test.company_a(), 'doc-b')$$));
select test.check('documentos do cliente: aceita o tipo entrada (via assinada da entrada do carro)',
  test.allowed($$update public.customer_documents set doc_type = 'entrada' where file_path like '%/c-a1/admin.pdf'$$)
  and test.allowed($$update public.customer_documents set doc_type = 'garantia' where file_path like '%/c-a1/admin.pdf'$$));
select test.check('plataforma: conta os envios para assinar de cada loja',
  (public.platform_rows(current_date - 1, current_date, test.company_a()) -> 0 -> 'features' -> 'signatures' ->> 'total')::int = 2
  and (public.platform_rows(current_date - 1, current_date, 'bbbbbbbb-0000-0000-0000-00000000000b') -> 0 -> 'features' -> 'signatures' ->> 'period')::int = 1);

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.platform_team (user_id) values ('aaaaaaaa-0000-0000-0000-000000000003');
select test.check('assinaturas: login da equipe WB.Dev não aparece para assinar pela loja',
  not exists (select 1 from public.signature_team() where email = 'gerente-quantidades@loja-a')
  and exists (select 1 from public.signature_team() where email = 'admin@loja-a'));
delete from public.platform_team where user_id = 'aaaaaaaa-0000-0000-0000-000000000003';

set role authenticated;
select test.check('admin A: vê todos os envios da loja A e nenhum da B',
  test.count('select * from signature_requests') = 2
  and test.count($$select * from signature_requests where company_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$) = 0);
select test.check('admin A: nem o admin grava ou muda a situação pela API',
  test.denied($$update signature_requests set status = 'assinado'$$)
  and test.denied($$delete from signature_requests$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente: vê todos os envios da loja',
  test.count('select * from signature_requests') = 2);
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: vê só os envios que ele mandou',
  test.count('select * from signature_requests') = 1
  and (select title from signature_requests limit 1) = 'Contrato do vendedor');
select test.check('vendedor: não grava, não marca assinado nem apaga envios',
  test.denied($$insert into signature_requests (company_id, title) values (current_company_id(), 'x')$$)
  and test.denied($$update signature_requests set status = 'assinado'$$)
  and test.denied($$delete from signature_requests$$));
select test.check('vendedor: vê quem pode assinar pela loja (só da loja dele, sem os desativados)',
  exists (select 1 from signature_team() where email = 'admin@loja-a' and role = 'admin')
  and exists (select 1 from signature_team() where email = 'vendedor@loja-a' and name = 'Vendedor A')
  and not exists (select 1 from signature_team() where email = 'desativado@loja-a')
  and not exists (select 1 from signature_team() where email like '%@loja-b'));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000006');
set role authenticated;
select test.check('vendedor desativado: não vê envios nem a equipe',
  test.count('select * from signature_requests') = 0
  and test.count('select * from signature_team()') = 0);
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: vê só o envio da loja B',
  test.count('select * from signature_requests') = 1
  and not exists (select 1 from signature_team() where email like '%@loja-a'));
reset role;

select test.login(null);
set role anon;
select test.check('anon: não vê envios para assinar nem a equipe',
  test.count('select * from signature_requests') <= 0
  and test.denied('select * from signature_team()'));
reset role;

-- ============================ RENAVE por carro (55)
select test.check('renave: carro novo começa pendente; situação só pendente, registrado ou dispensado',
  (select renave_entry_status from public.cars where id = 'ca000000-0000-0000-0000-0000000000a1') = 'pendente'
  and test.denied($$update public.cars set renave_entry_status = 'feito' where id = 'ca000000-0000-0000-0000-0000000000a1'$$)
  and test.denied($$update public.cars set renave_exit_status = 'outro' where id = 'ca000000-0000-0000-0000-0000000000a1'$$));

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: marca a entrada no RENAVE com data e protocolo',
  test.allowed($$update staff_cars set renave_entry_status = 'registrado', renave_entry_on = current_date,
                 renave_entry_protocol = 'PROT-1' where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
select test.check('vendedor: lê o que marcou no RENAVE',
  (select renave_entry_protocol from staff_cars where id = 'ca000000-0000-0000-0000-0000000000a1') = 'PROT-1'
  and (select renave_entry_status from staff_cars where id = 'ca000000-0000-0000-0000-0000000000a1') = 'registrado');
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: não muda o RENAVE de carro da loja A',
  test.denied($$update cars set renave_entry_status = 'dispensado' where id = 'ca000000-0000-0000-0000-0000000000a1'$$)
  and test.denied($$update staff_cars set renave_entry_status = 'dispensado' where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
reset role;

select test.login(null);
set role anon;
select test.check('anon: o site não lê o RENAVE dos carros',
  test.count('select renave_entry_status from cars') = -1
  and test.count('select renave_exit_protocol from cars') = -1);
reset role;

-- ============================ dados fiscais e endereço em partes (57)
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: grava os dados fiscais (só números no CNPJ e no CEP, UF em maiúscula)',
  test.allowed($$select save_company_fiscal('{"legal_name": " Loja A Ltda ", "cnpj": "12.345.678/0001-90", "ie": "12.345.678-9",
                  "crt": "1", "zip": "65000-000", "state": "ma", "city_code": "2111300", "extra": "x"}')$$));
reset role;
select test.check('admin A: os dados ficaram normalizados e sem chave estranha',
  (select fiscal from public.companies where id = test.company_a())
    = '{"legal_name": "Loja A Ltda", "cnpj": "12345678000190", "ie": "123456789", "crt": "1", "zip": "65000000",
        "state": "MA", "city_code": "2111300"}'::jsonb);

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: CNPJ, CEP, UF, regime e código IBGE errados são recusados',
  test.denied($$select save_company_fiscal('{"cnpj": "123"}')$$)
  and test.denied($$select save_company_fiscal('{"zip": "6500"}')$$)
  and test.denied($$select save_company_fiscal('{"state": "Maranhão"}')$$)
  and test.denied($$select save_company_fiscal('{"crt": "9"}')$$)
  and test.denied($$select save_company_fiscal('{"city_code": "21"}')$$));
select test.check('admin A: não grava os dados fiscais direto na tabela',
  test.denied($$update companies set fiscal = '{}' where id = current_company_id()$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente: lê os dados fiscais, mas não altera',
  (select fiscal ->> 'cnpj' from companies where id = current_company_id()) = '12345678000190'
  and test.denied($$select save_company_fiscal('{"legal_name": "Outra"}')$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: lê os dados fiscais (contratos) e grava o endereço em partes do cliente',
  (select fiscal ->> 'legal_name' from companies where id = current_company_id()) = 'Loja A Ltda'
  and test.denied($$select save_company_fiscal('{"legal_name": "Outra"}')$$)
  and test.allowed($$update customers set address_parts = '{"zip": "65000000", "number": "10"}' where id = 'c0000000-0000-0000-0000-0000000000a1'$$));
select test.check('vendedor: endereço em partes tem que ser um objeto',
  test.denied($$update customers set address_parts = '[]' where id = 'c0000000-0000-0000-0000-0000000000a1'$$));
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: não vê os dados fiscais da loja A',
  test.count($$select fiscal from companies where id = test.company_a()$$) = 0);
reset role;

select test.login(null);
set role anon;
select test.check('anon: não lê dados fiscais nem grava',
  test.count('select fiscal from companies') <= 0
  and test.denied($$select save_company_fiscal('{"legal_name": "x"}')$$));
reset role;

-- ============================ publicação na OLX (59)
insert into public.olx_accounts (company_id, access_token, user_name, user_email, settings)
values (test.company_a(), 'token-secreto-a', 'Loja A na OLX', 'olx@loja-a', '{"publish_default": true}');
insert into public.olx_oauth_states (state, company_id) values ('state-secreto-a', test.company_a());
insert into public.olx_catalog (path, data) values ('car_info', '{"TOYOTA": 51}');
insert into public.olx_ads (company_id, car_id, ad_id, status, list_id, url)
values (test.company_a(), 'ca000000-0000-0000-0000-0000000000a1', 'ca00000000000000000', 'publicado', '8000001', 'https://www.olx.com.br/vi/8000001.htm'),
       ('bbbbbbbb-0000-0000-0000-00000000000b', 'ca000000-0000-0000-0000-0000000000b1', 'ca00000000000000001', 'aguardando', null, '');

select test.check('olx: carro vem marcado para a OLX; a versão da OLX tem que ser um objeto',
  (select olx_publish from public.cars where id = 'ca000000-0000-0000-0000-0000000000a1')
  and test.denied($$update public.cars set olx_catalog = '[]' where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
select test.check('olx: anúncio com carro de outra loja, id fora do formato ou situação desconhecida é recusado',
  test.denied($$insert into public.olx_ads (company_id, car_id, ad_id) values (test.company_a(), 'ca000000-0000-0000-0000-0000000000b1', 'x1')$$)
  and test.denied($$insert into public.olx_ads (company_id, ad_id) values (test.company_a(), 'id inválido!')$$)
  and test.denied($$insert into public.olx_ads (company_id, ad_id) values (test.company_a(), 'abc12345678901234567')$$)
  and test.denied($$insert into public.olx_ads (company_id, ad_id, status) values (test.company_a(), 'x2', 'outro')$$));
-- (o plano "Básico" foi criado pelos testes depois do schema.sql)
select test.check('olx: a aba Portais fica fora dos planos até a Webmotors ficar pronta (seção 65)',
  (select not ('portais' = any(features)) and 'estoque' = any(features) from public.plans where name = 'Completo')
  and (select not ('portais' = any(features)) from public.plans where name = 'Básico'));
select test.check('plataforma: conta os anúncios no ar na OLX de cada loja',
  (public.platform_rows(current_date - 1, current_date, test.company_a()) -> 0 -> 'features' -> 'olx' ->> 'total')::int = 1
  and (public.platform_rows(current_date - 1, current_date, 'bbbbbbbb-0000-0000-0000-00000000000b') -> 0 -> 'features' -> 'olx' ->> 'total')::int = 1);

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: não lê o token, o state, o catálogo nem a trava da OLX',
  test.count('select * from olx_accounts') <= 0
  and test.count('select access_token from olx_accounts') <= 0
  and test.count('select * from olx_oauth_states') <= 0
  and test.count('select * from olx_catalog') <= 0
  and test.count('select * from olx_state') <= 0);
select test.check('admin A: vê a situação da conta OLX sem o token',
  (olx_account_info() ->> 'connected')::boolean
  and olx_account_info() ->> 'user_name' = 'Loja A na OLX'
  and olx_account_info()::text not like '%token-secreto-a%');
select test.check('admin A: grava os ajustes da OLX e liga a publicação automática',
  test.allowed($$select save_olx_settings('{"footer": " Aceitamos troca ", "exchange": "sim", "publish_default": false, "auto_publish": true, "extra": 1}')$$));
select test.check('admin A: ajustes errados da OLX são recusados',
  test.denied($$select save_olx_settings('{"exchange": "talvez"}')$$)
  and test.denied($$select save_olx_settings('{"auto_publish": "sim"}')$$)
  and test.denied($$select save_olx_settings('{"publish_default": 1}')$$)
  and test.denied($$select save_olx_settings(jsonb_build_object('footer', repeat('x', 1001)))$$));
select test.check('admin A: vê só os anúncios da loja A e não grava neles pela API',
  test.count('select * from olx_ads') = 1
  and test.denied($$update olx_ads set status = 'publicado'$$)
  and test.denied($$insert into olx_ads (company_id, ad_id) values (current_company_id(), 'x3')$$)
  and test.denied($$delete from olx_ads$$));
select test.check('admin A: muda "Publicar na OLX" e a versão da OLX do carro',
  test.allowed($$update cars set olx_publish = false, olx_catalog = '{"brandId": 51}' where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
reset role;
select test.check('admin A: ajustes da OLX gravados sem chave estranha e com registro em Atividades',
  (select settings from public.olx_accounts where company_id = test.company_a())
    = '{"publish_default": false, "footer": "Aceitamos troca", "exchange": "sim"}'::jsonb
  and (select auto_publish from public.olx_accounts where company_id = test.company_a())
  and exists (select 1 from public.activity_log where company_id = test.company_a() and entity = 'olx'
              and label = 'Ligou a publicação automática na OLX'));

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente: vê a conta e os anúncios da OLX, mas não muda os ajustes',
  (olx_account_info() ->> 'connected')::boolean
  and test.count('select * from olx_ads') = 1
  and test.denied($$select save_olx_settings('{"auto_publish": false}')$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: vê os anúncios e muda "Publicar na OLX" e a versão pela staff_cars',
  test.count('select * from olx_ads') = 1
  and test.allowed($$update staff_cars set olx_publish = true, olx_catalog = '{"brandId": 1, "modelId": 2}'
                    where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
select test.check('vendedor: lê o que marcou e não lê o token da OLX',
  (select olx_catalog ->> 'modelId' from staff_cars where id = 'ca000000-0000-0000-0000-0000000000a1') = '2'
  and test.count('select * from olx_accounts') <= 0
  and test.denied($$select save_olx_settings('{"auto_publish": false}')$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000006');
set role authenticated;
select test.check('vendedor desativado: não vê a conta nem os anúncios da OLX',
  olx_account_info() is null
  and test.count('select * from olx_ads') = 0);
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: sem conta OLX própria, não vê a da loja A nem os anúncios dela',
  olx_account_info() ->> 'connected' = 'false'
  and test.count('select * from olx_ads') = 1
  and test.count($$select * from olx_ads where company_id = test.company_a()$$) = 0
  and test.denied($$select save_olx_settings('{"auto_publish": true}')$$)
  and test.denied($$update cars set olx_publish = false where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
reset role;

select test.login(null);
set role anon;
select test.check('anon: não lê nada da OLX nem as colunas novas do carro',
  test.count('select * from olx_accounts') <= 0
  and test.count('select * from olx_ads') <= 0
  and test.count('select olx_publish from cars') = -1
  and test.count('select olx_catalog from cars') = -1
  and test.denied('select olx_account_info()')
  and test.denied($$select save_olx_settings('{"auto_publish": true}')$$));
reset role;

-- ============================ publicação na Webmotors (61)
insert into public.wm_accounts (company_id, cnpj, email, session_hash, gateway_token, modalities, settings)
values (test.company_a(), '12345678000190', 'integracao@loja-a', 'hash-secreto-a', 'token-gw-a',
        '[{"code": 2943, "name": "Usados", "type": "U", "total": 30, "used": 2, "photos": true}]', '{"publish_default": true}');
select public.wm_save_password(test.company_a(), 'senha-secreta-a');
insert into public.wm_catalog (path, data) values ('marcas', '[{"id": 26, "name": "TOYOTA"}]');
insert into public.wm_ads (company_id, car_id, ad_code, status, photos)
values (test.company_a(), 'ca000000-0000-0000-0000-0000000000a1', 123456, 'publicado', '[{"url": "https://x/1.jpg", "code": 9}]'),
       ('bbbbbbbb-0000-0000-0000-00000000000b', 'ca000000-0000-0000-0000-0000000000b1', 123457, 'publicado', '[]');

select test.check('webmotors: carro vem marcado para a Webmotors; o catálogo da Webmotors tem que ser um objeto',
  (select webmotors_publish from public.cars where id = 'ca000000-0000-0000-0000-0000000000a1')
  and test.denied($$update public.cars set webmotors_catalog = '[]' where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
select test.check('webmotors: anúncio com carro de outra loja, código repetido ou inválido e situação desconhecida são recusados; CNPJ com 14 números',
  test.denied($$insert into public.wm_ads (company_id, car_id) values (test.company_a(), 'ca000000-0000-0000-0000-0000000000b1')$$)
  and test.denied($$insert into public.wm_ads (company_id, ad_code) values (test.company_a(), 0)$$)
  and test.denied($$insert into public.wm_ads (company_id, ad_code) values (test.company_a(), 123456)$$)
  and test.denied($$insert into public.wm_ads (company_id, status) values (test.company_a(), 'outro')$$)
  and test.denied($$insert into public.wm_accounts (company_id, cnpj) values ('bbbbbbbb-0000-0000-0000-00000000000b', '123')$$));
select test.check('webmotors: a senha fica no Vault e só volta pela função',
  public.wm_password(test.company_a()) = 'senha-secreta-a'
  and (select count(*) from vault.secrets where name = 'webmotors-' || test.company_a()::text) = 1
  and not exists (select 1 from public.wm_accounts a where to_jsonb(a)::text like '%senha-secreta-a%'));
select public.wm_save_password(test.company_a(), 'senha-nova-a');
select test.check('webmotors: trocar a senha não cria outro segredo; senha vazia é recusada',
  public.wm_password(test.company_a()) = 'senha-nova-a'
  and (select count(*) from vault.secrets where name = 'webmotors-' || test.company_a()::text) = 1
  and test.denied($$select public.wm_save_password(test.company_a(), '')$$));
select test.check('plataforma: conta os anúncios no ar na Webmotors de cada loja',
  (public.platform_rows(current_date - 1, current_date, test.company_a()) -> 0 -> 'features' -> 'webmotors' ->> 'total')::int = 1
  and (public.platform_rows(current_date - 1, current_date, 'bbbbbbbb-0000-0000-0000-00000000000b') -> 0 -> 'features' -> 'webmotors' ->> 'total')::int = 1);

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: não lê a conta, a senha, o catálogo nem a trava da Webmotors',
  test.count('select * from wm_accounts') <= 0
  and test.count('select session_hash from wm_accounts') <= 0
  and test.count('select * from wm_catalog') <= 0
  and test.count('select * from wm_state') <= 0
  and test.count('select * from vault.decrypted_secrets') <= 0
  and test.denied($$select wm_password(current_company_id())$$)
  and test.denied($$select wm_save_password(current_company_id(), 'x')$$)
  and test.denied($$select wm_delete_password(current_company_id())$$));
select test.check('admin A: vê a situação da conta Webmotors sem a senha, o hash e o token',
  (webmotors_account_info() ->> 'connected')::boolean
  and webmotors_account_info() ->> 'cnpj' = '12345678000190'
  and jsonb_array_length(webmotors_account_info() -> 'modalities') = 1
  and webmotors_account_info()::text not like '%hash-secreto-a%'
  and webmotors_account_info()::text not like '%token-gw-a%'
  and webmotors_account_info()::text not like '%senha%');
select test.check('admin A: grava os ajustes da Webmotors, a modalidade e liga a publicação automática',
  test.allowed($$select save_webmotors_settings('{"footer": " Aceitamos troca ", "exchange": "nao", "publish_default": false, "auto_publish": true, "modality_code": "2943", "extra": 1}')$$));
select test.check('admin A: ajustes errados da Webmotors são recusados',
  test.denied($$select save_webmotors_settings('{"exchange": "talvez"}')$$)
  and test.denied($$select save_webmotors_settings('{"auto_publish": "sim"}')$$)
  and test.denied($$select save_webmotors_settings('{"publish_default": 1}')$$)
  and test.denied($$select save_webmotors_settings('{"modality_code": "9999"}')$$)
  and test.denied($$select save_webmotors_settings(jsonb_build_object('footer', repeat('x', 1001)))$$));
select test.check('admin A: vê só os anúncios da loja A na Webmotors e não grava neles pela API',
  test.count('select * from wm_ads') = 1
  and test.denied($$update wm_ads set status = 'publicado'$$)
  and test.denied($$insert into wm_ads (company_id) values (current_company_id())$$)
  and test.denied($$delete from wm_ads$$));
select test.check('admin A: muda "Publicar na Webmotors" e a versão da Webmotors do carro',
  test.allowed($$update cars set webmotors_publish = false, webmotors_catalog = '{"brandId": 26}' where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
reset role;
select test.check('admin A: ajustes da Webmotors gravados sem chave estranha e com registro em Atividades',
  (select settings from public.wm_accounts where company_id = test.company_a())
    = '{"publish_default": false, "footer": "Aceitamos troca", "exchange": "nao"}'::jsonb
  and (select auto_publish and modality_code = '2943' from public.wm_accounts where company_id = test.company_a())
  and exists (select 1 from public.activity_log where company_id = test.company_a() and entity = 'webmotors'
              and label = 'Ligou a publicação automática na Webmotors')
  and exists (select 1 from public.activity_log where company_id = test.company_a() and entity = 'webmotors'
              and label = 'Trocou a modalidade do plano da Webmotors' and details = 'Usados'));

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente: vê a conta e os anúncios da Webmotors, mas não muda os ajustes',
  (webmotors_account_info() ->> 'connected')::boolean
  and test.count('select * from wm_ads') = 1
  and test.denied($$select save_webmotors_settings('{"auto_publish": false}')$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: vê os anúncios e muda "Publicar na Webmotors" e a versão pela staff_cars',
  test.count('select * from wm_ads') = 1
  and test.allowed($$update staff_cars set webmotors_publish = true, webmotors_catalog = '{"brandId": 26, "modelId": 730}'
                    where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
select test.check('vendedor: lê o que marcou e não lê a conta da Webmotors',
  (select webmotors_catalog ->> 'modelId' from staff_cars where id = 'ca000000-0000-0000-0000-0000000000a1') = '730'
  and test.count('select * from wm_accounts') <= 0
  and test.denied($$select save_webmotors_settings('{"auto_publish": false}')$$)
  and test.denied($$select wm_password(current_company_id())$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000006');
set role authenticated;
select test.check('vendedor desativado: não vê a conta nem os anúncios da Webmotors',
  webmotors_account_info() is null
  and test.count('select * from wm_ads') = 0);
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: sem conta Webmotors própria, não vê a da loja A nem os anúncios dela',
  webmotors_account_info() ->> 'connected' = 'false'
  and test.count('select * from wm_ads') = 1
  and test.count($$select * from wm_ads where company_id = test.company_a()$$) = 0
  and test.denied($$select save_webmotors_settings('{"auto_publish": true}')$$)
  and test.denied($$update cars set webmotors_publish = false where id = 'ca000000-0000-0000-0000-0000000000a1'$$));
reset role;

select test.login(null);
set role anon;
select test.check('anon: não lê nada da Webmotors nem as colunas novas do carro',
  test.count('select * from wm_accounts') <= 0
  and test.count('select * from wm_ads') <= 0
  and test.count('select webmotors_publish from cars') = -1
  and test.count('select webmotors_catalog from cars') = -1
  and test.denied('select webmotors_account_info()')
  and test.denied($$select save_webmotors_settings('{"auto_publish": true}')$$)
  and test.denied($$select wm_password('aaaaaaaa-0000-0000-0000-00000000000a')$$));
reset role;

select public.wm_delete_password(test.company_a());
select test.check('webmotors: ao desconectar, a senha sai do Vault',
  public.wm_password(test.company_a()) is null
  and (select count(*) from vault.secrets where name = 'webmotors-' || test.company_a()::text) = 0);

-- ============================ despesas da empresa (63)
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: lança despesa da empresa e uma que se repete todo mês (cria o modelo junto)',
  test.allowed($$insert into company_expenses (category, description, amount, due_on) values ('agua', 'Conta de água', 87.53, current_date - 40)$$)
  and (create_company_expense('{"category": "aluguel", "description": "Aluguel do galpão", "amount": 2000, "due_on": "2026-07-31"}', true)).recurrence_id is not null
  and test.count('select * from company_expense_recurrences') = 1);
select test.check('admin A: despesa com categoria vazia, valor negativo, fornecedor de outra loja ou modelo de outra loja é recusada',
  test.denied($$insert into company_expenses (category, amount, due_on) values ('', 1, current_date)$$)
  and test.denied($$insert into company_expenses (category, amount, due_on) values ('agua', -1, current_date)$$)
  and test.denied($$insert into company_expenses (category, amount, due_on, supplier_id) select 'agua', 1, current_date, id from suppliers where company_id <> current_company_id() limit 1$$)
  and test.denied($$insert into company_expenses (company_id, category, amount, due_on) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'agua', 1, current_date)$$));
reset role;
select test.check('despesas: lançar fica no registro de atividades com o rótulo da despesa',
  exists (select 1 from public.activity_log where company_id = test.company_a() and entity = 'company_expenses'
          and label like 'Despesa da empresa: Conta de água — R$ 87.53'));

-- Modelo de dia 31 que já criou até três meses atrás: criar os meses que faltam
insert into public.company_expense_recurrences (id, company_id, category, description, amount, day, starts_on, last_generated_month)
values ('ce000000-0000-0000-0000-0000000000a1', test.company_a(), 'internet', 'Internet', 99.9, 31,
        (date_trunc('month', now() at time zone 'America/Fortaleza') - interval '3 months')::date,
        (date_trunc('month', now() at time zone 'America/Fortaleza') - interval '3 months')::date);
insert into public.company_expense_recurrences (id, company_id, category, description, amount, day, starts_on, last_generated_month)
values ('ce000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'aluguel', 'Aluguel B', 500, 5,
        (date_trunc('month', now() at time zone 'America/Fortaleza') - interval '1 month')::date,
        (date_trunc('month', now() at time zone 'America/Fortaleza') - interval '1 month')::date);

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select company_expenses_generate() as criadas;
select test.check('despesas: "Repetir todo mês" cria os meses que faltam até o atual, no último dia nos meses curtos, só da loja de quem abriu',
  test.count($$select * from company_expenses where recurrence_id = 'ce000000-0000-0000-0000-0000000000a1'$$) = 3
  and not exists (select 1 from company_expenses
                  where recurrence_id = 'ce000000-0000-0000-0000-0000000000a1'
                    and due_on <> (date_trunc('month', due_on) + interval '1 month - 1 day')::date)
  and test.count($$select * from company_expenses where description = 'Aluguel do galpão'$$) >= 1);
select test.check('despesas: rodar de novo não duplica',
  company_expenses_generate() = 0
  and test.count($$select * from company_expenses where recurrence_id = 'ce000000-0000-0000-0000-0000000000a1'$$) = 3);
select test.check('despesas: excluir a despesa de um mês não faz ela voltar',
  test.allowed($$delete from company_expenses where recurrence_id = 'ce000000-0000-0000-0000-0000000000a1' and due_on = (select min(due_on) from company_expenses where recurrence_id = 'ce000000-0000-0000-0000-0000000000a1')$$)
  and company_expenses_generate() = 0
  and test.count($$select * from company_expenses where recurrence_id = 'ce000000-0000-0000-0000-0000000000a1'$$) = 2);
select test.check('despesas: marcar como paga, parar de repetir e não ver o modelo da loja B',
  test.allowed($$update company_expenses set paid_on = current_date where description = 'Conta de água'$$)
  and test.allowed($$update company_expense_recurrences set active = false where id = 'ce000000-0000-0000-0000-0000000000a1'$$)
  and test.count($$select * from company_expense_recurrences where id = 'ce000000-0000-0000-0000-0000000000b1'$$) = 0);
reset role;
select test.login(null);
select public.company_expenses_generate() as criadas_pelo_cron;
select test.check('despesas: o cron (sem login) cria as das outras lojas; criadas pelo sistema não vão para Atividades',
  exists (select 1 from public.company_expenses where recurrence_id = 'ce000000-0000-0000-0000-0000000000b1')
  and not exists (select 1 from public.activity_log where entity = 'company_expenses' and action = 'insert' and label like '%Internet%'));

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente: não vê nem lança despesas da empresa',
  test.count('select * from company_expenses') <= 0
  and test.count('select * from company_expense_recurrences') <= 0
  and test.denied($$insert into company_expenses (category, amount, due_on) values ('agua', 1, current_date)$$)
  and test.denied($$select company_expenses_generate()$$)
  and test.denied($$select create_company_expense('{"category": "agua", "amount": 1, "due_on": "2026-10-01"}', false)$$));
reset role;
select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: não vê nem lança despesas da empresa',
  test.count('select * from company_expenses') <= 0
  and test.denied($$insert into company_expenses (category, amount, due_on) values ('agua', 1, current_date)$$));
reset role;
select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: vê só as despesas da loja B',
  test.count($$select * from company_expenses where company_id = test.company_a()$$) = 0
  and test.count('select * from company_expenses') >= 1
  and test.denied($$update company_expenses set amount = 1 where company_id = test.company_a()$$));
reset role;
select test.login(null);
set role anon;
select test.check('anon: nada das despesas da empresa',
  test.count('select * from company_expenses') <= 0
  and test.count('select * from company_expense_recurrences') <= 0
  and test.denied($$select company_expenses_generate()$$));
reset role;

-- ============================ mensalidade, PIX, contrato e suporte (65)
select test.check('mensalidade: dia de vencimento de 1 a 31 (29 a 31 viram o último dia nos meses curtos)',
  test.allowed($$update public.client_accounts set due_day = 31 where company_id = 'eeeeeeee-0000-0000-0000-00000000000e'$$)
  and test.denied($$update public.client_accounts set due_day = 32 where company_id = 'eeeeeeee-0000-0000-0000-00000000000e'$$)
  and test.denied($$update public.client_accounts set due_day = 0 where company_id = 'eeeeeeee-0000-0000-0000-00000000000e'$$));
update public.client_accounts set due_day = 10 where company_id = 'eeeeeeee-0000-0000-0000-00000000000e';
select test.check('plataforma: a aba Portais saiu dos planos (fica só na WB.AUTO até a Webmotors ficar pronta)',
  not exists (select 1 from public.plans where 'portais' = any(features)));

-- Loja A ativa com mensalidade (para a página Mensalidade e o "Já paguei")
update public.client_accounts set status = 'ativo', monthly_price = 100, due_day = 10, billing_start = '2026-01-01' where company_id = test.company_a();

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: preenche os dados do PIX e do suporte',
  test.allowed($$update platform_settings set pix_key = 'chave@pix.teste', pix_name = 'WB DEV TESTE', pix_city = 'SAO LUIS',
                 bank_name = 'Banco Teste', support_email = 'suporte@teste', support_hours = 'Seg a sex, 8h às 18h' where id = 1$$)
  and test.denied($$update platform_settings set pix_name = repeat('x', 26) where id = 1$$)
  and test.denied($$insert into platform_settings (id) values (2)$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: não lê nem muda os dados da plataforma direto; vê o PIX e o suporte pelo my_account',
  test.count('select * from platform_settings') <= 0
  and test.denied($$update platform_settings set pix_key = 'x'$$)
  and my_account() -> 'payment' ->> 'pix_key' = 'chave@pix.teste'
  and my_account() -> 'payment' ->> 'pix_name' = 'WB DEV TESTE'
  and my_account() -> 'support' ->> 'email' = 'suporte@teste'
  and my_account() -> 'support' ->> 'phone' = '5598981295577');
select test.check('admin A: informa o pagamento ("Já paguei"); mês já pago, sem mês ou comprovante de outra loja é recusado',
  (inform_payment(array['2027-03-15'::date, '2027-04-01'::date], 200, current_date, jsonb_build_object('path', current_company_id()::text || '/r.pdf', 'name', 'r.pdf'), 'pago pelo PIX')).status = 'pendente'
  and test.denied($$select inform_payment(array['2026-01-01'::date], 100, current_date)$$)
  and test.denied($$select inform_payment(array[]::date[], 100, current_date)$$)
  and test.denied($$select inform_payment(array['2027-06-01'::date], 100, current_date, '{"path": "bbbbbbbb-0000-0000-0000-00000000000b/r.pdf"}')$$)
  and test.denied($$insert into client_payment_claims (company_id, months, amount, paid_on) values (current_company_id(), array['2027-06-01'::date], 1, current_date)$$));
select test.check('admin A: vê o pagamento informado (meses no dia 1) e o histórico de pagamentos da loja',
  test.count($$select * from client_payment_claims where months = array['2027-03-01'::date, '2027-04-01'::date]$$) = 1
  and jsonb_array_length(my_account() -> 'payment' -> 'claims') = 1
  and jsonb_array_length(my_payments()) >= 3
  and test.denied($$update client_payment_claims set status = 'confirmado'$$)
  and test.denied($$select platform_review_payment_claim((select id from client_payment_claims limit 1), true)$$));
select test.check('admin A: envia comprovante na pasta da loja A e não na da loja B',
  test.allowed($$insert into storage.objects (bucket_id, name) select 'payment-receipts', current_company_id() || '/comprovante.pdf'$$)
  and test.denied($$insert into storage.objects (bucket_id, name) values ('payment-receipts', 'bbbbbbbb-0000-0000-0000-00000000000b/x.pdf')$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: não informa pagamento nem vê a mensalidade, o PIX ou os comprovantes',
  test.denied($$select inform_payment(array['2027-06-01'::date], 100, current_date)$$)
  and test.count('select * from client_payment_claims') <= 0
  and my_account() -> 'payment' = 'null'::jsonb
  and my_account() -> 'billing' = 'null'::jsonb
  and test.denied($$select my_payments()$$)
  and test.count($$select * from storage.objects where bucket_id = 'payment-receipts'$$) = 0);
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: não vê o pagamento informado nem o comprovante da loja A',
  test.count('select * from client_payment_claims') = 0
  and test.count($$select * from storage.objects where bucket_id = 'payment-receipts'$$) = 0);
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select platform_review_payment_claim((select id from client_payment_claims where company_id = test.company_a()), true) ->> 'status' as conferido;
select test.check('dono da plataforma: confirma o pagamento informado (vira o pagamento de cada mês) e não confere duas vezes',
  (select status from client_payment_claims where company_id = test.company_a()) = 'confirmado'
  and test.count($$select * from client_payments where company_id = test.company_a() and reference_month in ('2027-03-01', '2027-04-01') and method = 'PIX'$$) = 2
  and (select sum(amount) from client_payments where company_id = test.company_a() and reference_month in ('2027-03-01', '2027-04-01')) = 200
  and test.denied($$select platform_review_payment_claim((select id from client_payment_claims where company_id = test.company_a()), false, 'x')$$)
  and test.count($$select * from storage.objects where bucket_id = 'payment-receipts'$$) = 1);
reset role;

-- Contrato de adesão: a minuta entra como rascunho e não bloqueia ninguém
select test.check('contrato: a minuta entra como rascunho; sem versão publicada não há aceite pendente',
  exists (select 1 from public.platform_terms where status = 'rascunho' and body like '%CONTRATO DE ADESÃO%')
  and not exists (select 1 from public.platform_terms where status = 'publicada'));

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: sem versão publicada, o painel não pede aceite; não lê nem publica o rascunho',
  my_account() -> 'terms' = 'null'::jsonb
  and test.count('select * from platform_terms') <= 0
  and test.denied('select publish_platform_terms()')
  and test.denied($$update platform_terms set body = 'x'$$));
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: edita o rascunho e publica (versão 1); a versão publicada não muda',
  test.allowed($$update platform_terms set title = 'Contrato de Adesão e Termos de Uso do WB.AUTO' where status = 'rascunho'$$)
  and (publish_platform_terms() ->> 'version')::int = 1
  and test.denied($$update platform_terms set body = 'outro' where version = 1$$)
  and test.denied($$delete from platform_terms where version = 1$$)
  and test.denied('select publish_platform_terms()'));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: vê que há termos pendentes, sem o texto, e não aceita pela loja',
  (my_account() -> 'terms' ->> 'accepted')::boolean = false
  and my_account() -> 'terms' -> 'body' = 'null'::jsonb
  and test.denied('select accept_platform_terms(1)'));
reset role;

-- Login da equipe WB.Dev como admin da loja A não aceita pelo cliente
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-0000000000e2', 'suporte2@wbdev') on conflict (id) do nothing;
insert into public.user_company (user_id, company_id, role) values ('cccccccc-0000-0000-0000-0000000000e2', test.company_a(), 'admin');
insert into public.platform_team (user_id) values ('cccccccc-0000-0000-0000-0000000000e2') on conflict do nothing;
select test.login('cccccccc-0000-0000-0000-0000000000e2');
set role authenticated;
select test.check('equipe WB.Dev (admin na loja A): vê que é da equipe e não aceita os termos pelo cliente',
  (my_account() ->> 'platform_team')::boolean
  and test.denied('select accept_platform_terms(1)'));
reset role;
delete from public.platform_team where user_id = 'cccccccc-0000-0000-0000-0000000000e2';
delete from public.user_company where user_id = 'cccccccc-0000-0000-0000-0000000000e2';
delete from auth.users where id = 'cccccccc-0000-0000-0000-0000000000e2';

-- Dono da plataforma ligado como admin da loja A: também não aceita pelo cliente
insert into public.user_company (user_id, company_id, role) values ('cccccccc-0000-0000-0000-000000000001', test.company_a(), 'admin');
select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma (admin na loja A): conta como equipe WB.Dev, não vê o texto e não aceita pelo cliente',
  (my_account() ->> 'platform_team')::boolean
  and my_account() -> 'terms' -> 'body' = 'null'::jsonb
  and test.denied('select accept_platform_terms(1)'));
reset role;
delete from public.user_company where user_id = 'cccccccc-0000-0000-0000-000000000001';

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: vê o texto pendente; aceitar outra versão é recusado',
  (my_account() -> 'terms' ->> 'accepted')::boolean = false
  and my_account() -> 'terms' ->> 'body' like '%CONTRATO DE ADESÃO%'
  and test.denied('select accept_platform_terms(2)'));
select accept_platform_terms(1) ->> 'user_email' as aceitou;
select test.check('admin A: aceita a versão publicada (fica registrado quem aceitou) e baixa o comprovante',
  (select user_email from client_terms_acceptances where version = 1) = 'admin@loja-a'
  and (my_account() -> 'terms' ->> 'accepted')::boolean
  and my_account() -> 'terms' -> 'body' = 'null'::jsonb
  and terms_receipt() ->> 'version' = '1'
  and length(terms_receipt() ->> 'body_sha256') = 64
  and test.denied($$insert into client_terms_acceptances (company_id, terms_id, version, body_sha256) select current_company_id(), id, 1, 'x' from platform_terms$$)
  and test.denied($$select terms_receipt('bbbbbbbb-0000-0000-0000-00000000000b')$$));
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B (loja de demonstração): não pede aceite, não aceita e não vê o aceite da A',
  my_account() -> 'terms' = 'null'::jsonb
  and (my_account() ->> 'platform_team')::boolean = false
  and test.denied('select accept_platform_terms(1)')
  and test.count('select * from client_terms_acceptances') = 0);
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: vê quem aceitou e o comprovante de cada loja',
  exists (select 1 from jsonb_array_elements(platform_terms_overview()) c
          where (c ->> 'company_id')::uuid = test.company_a() and (c -> 'acceptance' ->> 'version')::int = 1)
  and terms_receipt(test.company_a()) ->> 'user_email' = 'admin@loja-a');
reset role;

-- Suporte
select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select (open_support_ticket('Não consigo enviar foto', 'problema', 'Dá erro ao enviar a foto do carro')).id as chamado;
select test.check('vendedor A: abre chamado (com a primeira mensagem); não grava direto nas tabelas',
  test.count('select * from support_tickets') = 1
  and test.count('select * from support_messages') = 1
  and test.denied($$insert into support_tickets (company_id, subject) values (current_company_id(), 'x')$$)
  and test.denied($$update support_tickets set status = 'resolvido'$$)
  and test.denied($$select open_support_ticket('', 'duvida', 'x')$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000005');
set role authenticated;
select test.check('vendedor A2: não vê o chamado do outro vendedor',
  test.count('select * from support_tickets') = 0
  and test.count('select * from support_messages') = 0
  and test.denied($$select post_support_message((select id from public.support_tickets limit 1), 'oi')$$));
reset role;

select test.login('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin B: não vê os chamados da loja A',
  test.count('select * from support_tickets') = 0 and test.count('select * from support_messages') = 0);
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: vê o chamado não lido, responde (fica "respondido" e a loja vê a resposta)',
  test.count('select * from support_tickets where wbdev_unread') = 1
  and (post_support_message((select id from support_tickets limit 1), 'Pode me mandar um print?')).author_kind = 'wbdev'
  and test.count($$select * from support_tickets where status = 'respondido' and store_unread and not wbdev_unread$$) = 1
  and test.allowed($$insert into client_contact_notes (company_id, channel, note) values (test.company_a(), 'whatsapp', 'Liguei para combinar o treinamento')$$)
  and test.count('select * from client_contact_notes') = 1);
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: vê o chamado da equipe com a resposta; não lê as anotações de atendimento da WB.Dev',
  test.count('select * from support_tickets') = 1
  and test.count('select * from support_messages') = 2
  and (my_account() -> 'support' ->> 'unread')::int = 1
  and test.count('select * from client_contact_notes') <= 0);
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor A: vê a resposta não lida', (my_account() -> 'support' ->> 'unread')::int = 1);
select mark_support_ticket_read((select id from support_tickets limit 1));
select test.check('vendedor A: lida a resposta, sai o "não lido"', (my_account() -> 'support' ->> 'unread')::int = 0);
select (post_support_message((select id from support_tickets limit 1), 'Segue o print')).author_kind as autor;
select test.check('vendedor A: responder reabre o chamado; marca resolvido; não muda para outra situação; anexa arquivo',
  (select author_kind from support_messages order by created_at desc limit 1) = 'loja'
  and test.count($$select * from support_tickets where status = 'aberto' and wbdev_unread$$) = 1
  and test.denied($$select set_support_ticket_status((select id from support_tickets limit 1), 'respondido')$$)
  and test.try($$select set_support_ticket_status((select id from support_tickets limit 1), 'resolvido')$$) like 'ok%'
  and test.allowed($$insert into storage.objects (bucket_id, name) select 'support-files', current_company_id() || '/print.png'$$));
reset role;

select test.login(null);
set role anon;
select test.check('anon: nada do contrato, dos pagamentos informados, do suporte e das anotações',
  test.count('select * from platform_terms') <= 0
  and test.count('select * from client_terms_acceptances') <= 0
  and test.count('select * from client_payment_claims') <= 0
  and test.count('select * from support_tickets') <= 0
  and test.count('select * from client_contact_notes') <= 0
  and test.count('select * from platform_settings') <= 0
  and test.denied('select accept_platform_terms(1)')
  and test.denied($$select inform_payment(array['2027-06-01'::date], 1, current_date)$$)
  and test.denied($$select open_support_ticket('x', 'duvida', 'x')$$));
reset role;

-- ============================================ documentos pessoais e domínio (67)
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: anexa CNH, RG e comprovantes de residência e de renda; tipo fora da lista é recusado',
  test.allowed($$insert into customer_documents (company_id, customer_id, doc_type, file_path)
                select current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'cnh', current_company_id() || '/c-a1/cnh.jpg'$$)
  and test.allowed($$insert into customer_documents (company_id, customer_id, doc_type, file_path)
                select current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'rg', current_company_id() || '/c-a1/rg.jpg'$$)
  and test.allowed($$insert into customer_documents (company_id, customer_id, doc_type, file_path)
                select current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'comprovante_residencia', current_company_id() || '/c-a1/luz.pdf'$$)
  and test.allowed($$insert into customer_documents (company_id, customer_id, doc_type, file_path)
                select current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'comprovante_renda', current_company_id() || '/c-a1/renda.pdf'$$)
  and test.denied($$insert into customer_documents (company_id, customer_id, doc_type, file_path)
                select current_company_id(), 'c0000000-0000-0000-0000-0000000000a1', 'passaporte', current_company_id() || '/c-a1/x.jpg'$$));
select test.check('admin A: não mexe nos dados do domínio da própria conta',
  test.denied($$update client_accounts set domain_years = 1, domain_registrar = 'registro_br'$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor A: anexa a CNH do cliente e não vê a que o admin anexou',
  test.allowed($$insert into customer_documents (company_id, customer_id, doc_type, file_path)
                select current_company_id(), 'c0000000-0000-0000-0000-0000000000a2', 'cnh', current_company_id() || '/c-a2/cnh.jpg'$$)
  and test.count($$select * from customer_documents where doc_type = 'cnh'$$) = 1);
reset role;

select test.login('cccccccc-0000-0000-0000-000000000001');
set role authenticated;
select test.check('dono da plataforma: grava a compra do domínio, os anos, onde está e quem paga; valores fora da lista são recusados',
  test.allowed($$update client_accounts set domain_registered_on = '2026-10-07', domain_years = 2, domain_expires_on = '2028-10-07',
                 domain_registrar = 'registro_br', domain_paid_by = 'cliente' where company_id = test.company_a()$$)
  and test.denied($$update client_accounts set domain_years = 11 where company_id = test.company_a()$$)
  and test.denied($$update client_accounts set domain_registrar = 'outro lugar' where company_id = test.company_a()$$)
  and test.denied($$update client_accounts set domain_paid_by = 'loja' where company_id = test.company_a()$$));
-- Em outra consulta: platform_clients() é stable e não enxerga o que mudou dentro da mesma consulta
select test.check('dono da plataforma: a lista de clientes traz os dados do domínio',
  (select x -> 'account' ->> 'domain_registrar' from jsonb_array_elements(platform_clients()) x where x ->> 'company_id' = test.company_a()::text) = 'registro_br'
  and (select (x -> 'account' ->> 'domain_years')::int from jsonb_array_elements(platform_clients()) x where x ->> 'company_id' = test.company_a()::text) = 2
  and (select x -> 'account' ->> 'domain_paid_by' from jsonb_array_elements(platform_clients()) x where x ->> 'company_id' = test.company_a()::text) = 'cliente');
reset role;

-- ============================ administradores na Equipe (69)
select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: vê os administradores da loja fora da Equipe (ele mesmo)',
  jsonb_array_length(store_admins_outside_team()) = 1
  and store_admins_outside_team() -> 0 ->> 'user_id' = 'aaaaaaaa-0000-0000-0000-000000000001');
select test.check('admin A: entra na Equipe como administrador, com telefone',
  test.allowed($$select add_admin_to_team('aaaaaaaa-0000-0000-0000-000000000001', 'Admin A', '(98) 90000-0001')$$));
select test.check('admin A: não entra duas vezes; vendedor não entra como admin; nome vazio é recusado',
  test.denied($$select add_admin_to_team('aaaaaaaa-0000-0000-0000-000000000001', 'Admin A')$$)
  and test.denied($$select add_admin_to_team('aaaaaaaa-0000-0000-0000-000000000004', 'Vendedor A')$$)
  and test.denied($$select add_admin_to_team('aaaaaaaa-0000-0000-0000-000000000001', '  ')$$));
select test.check('admin A: na Equipe com o nível de administrador (a lista de fora fica vazia)',
  jsonb_array_length(store_admins_outside_team()) = 0
  and (select role from sellers where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'admin');
select test.check('admin A: promove o Vendedor A2 a administrador',
  test.allowed($$update sellers set role = 'admin' where id = '5e000000-0000-0000-0000-000000000005'$$));
reset role;
select test.check('Vendedor A2 virou administrador no login também, com registro em Atividades',
  (select role from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000005' and company_id = test.company_a()) = 'admin'
  and exists (select 1 from public.activity_log where entity = 'sellers' and entity_id = '5e000000-0000-0000-0000-000000000005'
              and details like '%Administrador%'));

select test.login('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
select test.check('admin A: não muda o próprio nível',
  test.denied($$update sellers set role = 'manager' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));
select test.check('admin A: rebaixa o A2 para vendedor (a loja continua com outro administrador)',
  test.allowed($$update sellers set role = 'seller' where id = '5e000000-0000-0000-0000-000000000005'$$));
reset role;
select test.check('A2 voltou a vendedor no login',
  (select role from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000005' and company_id = test.company_a()) = 'seller');

select test.login('aaaaaaaa-0000-0000-0000-000000000004');
set role authenticated;
select test.check('vendedor: não vira administrador sozinho nem inclui ninguém na Equipe',
  test.denied($$update sellers set role = 'admin' where id = '5e000000-0000-0000-0000-000000000004'$$)
  and test.denied($$select add_admin_to_team('aaaaaaaa-0000-0000-0000-000000000004', 'Eu')$$)
  and test.denied($$select store_admins_outside_team()$$));
reset role;

select test.login('aaaaaaaa-0000-0000-0000-000000000002');
set role authenticated;
select test.check('gerente: não promove ninguém a administrador',
  test.denied($$update sellers set role = 'admin' where id = '5e000000-0000-0000-0000-000000000004'$$)
  and test.denied($$select add_admin_to_team('aaaaaaaa-0000-0000-0000-000000000001', 'Admin A')$$));
reset role;

-- A função manage-sellers (chave de serviço) também não deixa a loja sem administrador
select set_config('request.jwt.claim.role', 'service_role', false);
select test.check('chave de serviço: rebaixar o único administrador da loja é recusado',
  test.denied($$update public.sellers set role = 'seller' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$)
  and (select role from public.user_company where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and company_id = test.company_a()) = 'admin');
select set_config('request.jwt.claim.role', '', false);

-- ================================================================ resultado
select case when ok then 'PASS' else 'FAIL' end as resultado, name as teste, coalesce(detail, '') as detalhe
from test.results order by id;

select count(*) filter (where ok) as passaram, count(*) filter (where not ok) as falharam from test.results;
