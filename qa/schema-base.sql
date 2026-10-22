-- Local copy of the production tables as they were before v3 (read from Supabase's REST schema), for qa/run.sh only.
-- local replica of the production schema (from the PostgREST OpenAPI), roles as on Supabase
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create extension if not exists pgcrypto;
create table public.orders (
  id uuid primary key default gen_random_uuid(), order_number text not null, customer_name text not null, customer_phone text not null,
  items jsonb not null, total numeric not null, payment_method text not null, payment_status text not null default 'pending',
  stripe_session_id text, created_at timestamptz default now(), agent_ref text, address text default '', delivery_type text default 'pickup',
  delivery_time text default '', shipping_fee numeric default 0, user_id uuid);
create table public.inventory (id serial primary key, product_id int not null, product_name text not null, flavor_name text not null,
  stock int default 0, updated_at timestamptz default now(), unique (product_id, flavor_name));
create function public.decrement_stock(p_product_id int, p_flavor_name text, p_qty int) returns void language sql as
  $$ update inventory set stock = greatest(stock - p_qty, 0), updated_at = now() where product_id = p_product_id and flavor_name = p_flavor_name $$;
create function public.increment_stock(p_product_id int, p_flavor_name text, p_qty int) returns void language sql as
  $$ update inventory set stock = stock + p_qty, updated_at = now() where product_id = p_product_id and flavor_name = p_flavor_name $$;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- a couple of old-site orders, so the admin page shows mixed history
insert into orders (order_number, customer_name, customer_phone, items, total, payment_method, payment_status, created_at, delivery_type, address)
values ('ORD-1780087066767','Lucía','+34 611 222 333','[{"id":"1-Floral Oolong","name":"鸭嘴兽 (Dash) - 花香乌龙","price":17.9,"quantity":2}]',35.8,'bizum','delivered', now() - interval '3 days','pickup',''),
       ('ORD-1780087099999','王先生','+34 622 333 444','[{"id":"6-Mojito","name":"RELX 悦刻幻五代烟弹 (3支装) - 莫吉托","price":14.9,"quantity":3}]',44.7,'cash','pending', now() - interval '1 day','delivery','Calle Alcalá 100\n3B');
-- an old-site order from the Supabase Auth account the fake auth knows (old@example.com)
insert into orders (order_number, customer_name, customer_phone, items, total, payment_method, payment_status, created_at, user_id)
values ('ORD-1780000000001','Old Customer','+34 633 444 555','[{"id":"3-Mango","name":"小黑条 (Quik) - 芒果","price":17.9,"quantity":1}]',17.9,'bizum','delivered', now() - interval '20 days','11111111-2222-3333-4444-555555555555');
-- stock: one Dash flavor sold out, one tracked with plenty
insert into inventory (product_id, product_name, flavor_name, stock) values (1,'鸭嘴兽 (Dash)','Mineral Water',0),(1,'鸭嘴兽 (Dash)','Lemon Tea',30),(6,'RELX','Mojito',12);
