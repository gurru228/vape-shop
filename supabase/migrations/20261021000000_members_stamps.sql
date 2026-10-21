-- v3 (3D storefront): members with stamp cards, their sessions, and the extra order columns the
-- new checkout writes. Purely additive: the old site and admin keep working while this is applied.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.

begin;

-- members: an account is a phone number (digits, with country code) or a lower-case email; that string is the id
create table if not exists public.members (
    id              text primary key,
    phone           text,
    email           text,
    name            text not null,
    salt            text not null,
    hash            text not null,
    stamps          jsonb not null default '{}'::jsonb,   -- {"1": 7, "6": 2}: product id -> stamps
    stamp_log       jsonb not null default '[]'::jsonb,   -- last manual changes from Telegram / admin
    temp_pw         boolean not null default false,
    fails           int not null default 0,
    lock_until      timestamptz,
    sessions_after  timestamptz,                          -- sessions older than this are signed out
    auth_uid        uuid,                                 -- set when an old-site (Supabase Auth) account moved over
    created_at      timestamptz not null default now()
);
create index if not exists members_name_idx on public.members (lower(name));

-- sessions: only a sha-256 of the browser's token is stored
create table if not exists public.member_sessions (
    token_hash  text primary key,
    member_id   text not null references public.members(id) on delete cascade,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null
);
create index if not exists member_sessions_member_idx on public.member_sessions (member_id);

-- orders: new columns for the stamp card. payment_status keeps its old values:
--   pending = 待确认, paid = 已确认, shipped = 已发货, delivered = 已完成, cancelled = 已取消
alter table public.orders add column if not exists member_id   text;
alter table public.orders add column if not exists earn        jsonb;     -- stamps this order earns, per product
alter table public.orders add column if not exists gifts       jsonb;     -- free items paid for with 10 stamps
alter table public.orders add column if not exists stamped     boolean not null default false;
alter table public.orders add column if not exists gift_held   boolean not null default false;
alter table public.orders add column if not exists form        jsonb;
alter table public.orders add column if not exists coupon      text;
alter table public.orders add column if not exists tg_message  bigint;
alter table public.orders add column if not exists tg_text     text;
alter table public.orders add column if not exists decided_at  timestamptz;
create index if not exists orders_member_idx on public.orders (member_id, created_at desc);
create unique index if not exists orders_number_idx on public.orders (order_number);

-- add / take stamps in one statement, so two requests can never lose each other's change.
-- p_delta: {"1": 3, "6": -10}. Counts never go below 0. With p_strict, the whole change is refused
-- (returns null) when any count would go below 0 — used to spend a full card on a gift.
create or replace function public.member_add_stamps(p_id text, p_delta jsonb, p_strict boolean default false, p_log jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    cur jsonb;
    k text;
    v int;
    nxt int;
begin
    select stamps into cur from members where id = p_id for update;
    if not found then return null; end if;
    for k, v in select key, value::int from jsonb_each_text(p_delta) loop
        nxt := coalesce((cur ->> k)::int, 0) + v;
        if nxt < 0 then
            if p_strict then return null; end if;
            nxt := 0;
        end if;
        cur := cur || jsonb_build_object(k, nxt);
    end loop;
    update members
       set stamps = cur,
           stamp_log = case when p_log is null then stamp_log
                            else (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
                                    select e from jsonb_array_elements(stamp_log || jsonb_build_array(p_log)) with ordinality t(e, i)
                                    order by i desc limit 30) s) end
     where id = p_id;
    return cur;
end
$$;

-- RLS: nobody but the Netlify functions (service role) touches these
alter table public.members enable row level security;
alter table public.member_sessions enable row level security;
revoke all on public.members, public.member_sessions from anon, authenticated;
revoke execute on function public.member_add_stamps(text, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.member_add_stamps(text, jsonb, boolean, jsonb) to service_role;

commit;
