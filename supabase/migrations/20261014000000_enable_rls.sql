-- Lock down the public schema: enable Row-Level Security everywhere and only
-- allow what the site actually needs through the anon/authenticated keys.
--
-- Who talks to the database:
--   * Netlify functions (netlify/functions/*) use SUPABASE_SERVICE_KEY
--     (service_role). service_role bypasses RLS, so checkout, the Stripe
--     webhook, the admin panel, stats and inventory keep working unchanged.
--   * The browser (script.js) uses the public anon key only for Supabase Auth
--     and for the "My orders" panel, which reads the logged-in user's orders.
--
-- Safe to run more than once.

begin;

-- 1. Enable RLS on every table in the public schema (orders, inventory and any
--    other table that exists). With RLS on and no matching policy, anon and
--    authenticated get zero rows and cannot insert/update/delete.
do $$
declare
    t record;
begin
    for t in
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
    loop
        execute format('alter table public.%I enable row level security', t.relname);
    end loop;
end
$$;

-- 2. orders: contains customer names, phones and addresses.
--    anon: nothing. authenticated: read only their own orders.
--    All writes happen server-side with the service role.
--    user_id is compared as text so this works whether the column is uuid or text.
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
    on public.orders
    for select
    to authenticated
    using (user_id is not null and user_id::text = (select auth.uid())::text);

revoke insert, update, delete, truncate on public.orders from anon, authenticated;

-- 3. inventory: the storefront and admin read/write it through Netlify
--    functions (service role), so no client-side policies are needed.
revoke insert, update, delete, truncate on public.inventory from anon, authenticated;

-- 4. Stock RPCs: callable through /rest/v1/rpc/* by anyone holding the anon
--    key unless execute is revoked. Restrict them to the service role.
do $$
declare
    f record;
begin
    for f in
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('increment_stock', 'decrement_stock')
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
        execute format('grant execute on function %s to service_role', f.sig);
    end loop;
end
$$;

commit;

-- Verification (run after applying; every row should show rls_enabled = true):
--
--   select c.relname as table_name, c.relrowsecurity as rls_enabled
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind in ('r', 'p')
--   order by 1;
--
--   select tablename, policyname, roles, cmd, qual
--   from pg_policies where schemaname = 'public';
