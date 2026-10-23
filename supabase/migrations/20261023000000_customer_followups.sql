-- Follow-ups for the 复购 (repeat purchase) page in admin.html: the real reason a customer gave for not coming
-- back, a note, and when the shop last contacted them. One row per customer. The analysis itself is computed in
-- the browser from the orders; this table only keeps what the shop types in.
-- customer_key is the id admin.html gives a customer: 'm:<member id>' for members, 'p:<phone digits>' for guests.
-- Purely additive. Paste into Supabase → SQL Editor → Run. Safe to run more than once.

begin;

create table if not exists public.customer_followups (
    customer_key  text primary key check (char_length(customer_key) between 3 and 170),
    reason        text check (reason is null or char_length(reason) <= 40),
    note          text check (note is null or char_length(note) <= 500),
    contacted_at  timestamptz,
    updated_at    timestamptz not null default now()
);

-- RLS: only the Netlify functions (service role, behind ADMIN_PASSWORD) read or write it
alter table public.customer_followups enable row level security;
revoke all on public.customer_followups from anon, authenticated;
grant select, insert, update, delete on public.customer_followups to service_role;

commit;

-- let the REST API see the new table right away
notify pgrst, 'reload schema';

-- Verification (run after applying): rls_enabled should be true, and anon / authenticated should have no rows here
--
--   select relname, relrowsecurity as rls_enabled from pg_class where relname = 'customer_followups';
--   select grantee, privilege_type from information_schema.role_table_grants where table_name = 'customer_followups';
