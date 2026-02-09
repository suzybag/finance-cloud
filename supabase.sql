create extension if not exists pgcrypto;

-- enum types (safe to run multiple times)
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'tx_type'
  ) then
    create type public.tx_type as enum (
      'income',
      'expense',
      'transfer',
      'adjustment',
      'card_payment'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'alert_type'
  ) then
    create type public.alert_type as enum (
      'card_closing_soon',
      'card_due_soon'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'whatsapp_status'
  ) then
    create type public.whatsapp_status as enum (
      'pending',
      'processed',
      'ignored'
    );
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  avatar_path text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists avatar_path text;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  currency text not null default 'BRL',
  opening_balance numeric not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  issuer text,
  limit_total numeric not null default 0,
  closing_day int not null default 1,
  due_day int not null default 10,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at date not null default current_date,
  type public.tx_type not null,
  description text not null,
  category text,
  amount numeric not null,
  account_id uuid references public.accounts(id) on delete set null,
  to_account_id uuid references public.accounts(id) on delete set null,
  card_id uuid references public.cards(id) on delete set null,
  tags text[],
  note text,
  external_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  type public.alert_type not null,
  title text not null,
  body text not null,
  due_at date,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message_id text,
  from_number text,
  body text,
  parsed jsonb,
  status public.whatsapp_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.cards enable row level security;
alter table public.transactions enable row level security;
alter table public.alerts enable row level security;
alter table public.whatsapp_messages enable row level security;

-- policies (safe to run multiple times)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
    on public.profiles
    for select
    using (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert_own'
  ) then
    create policy profiles_insert_own
    on public.profiles
    for insert
    with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
    on public.profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'accounts' and policyname = 'accounts_crud_own'
  ) then
    create policy accounts_crud_own
    on public.accounts
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cards' and policyname = 'cards_crud_own'
  ) then
    create policy cards_crud_own
    on public.cards
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transactions' and policyname = 'transactions_crud_own'
  ) then
    create policy transactions_crud_own
    on public.transactions
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'alerts' and policyname = 'alerts_crud_own'
  ) then
    create policy alerts_crud_own
    on public.alerts
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'whatsapp_messages' and policyname = 'whatsapp_crud_own'
  ) then
    create policy whatsapp_crud_own
    on public.whatsapp_messages
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists idx_accounts_user on public.accounts(user_id);
create index if not exists idx_cards_user on public.cards(user_id);
create index if not exists idx_tx_user_date on public.transactions(user_id, occurred_at desc);
create index if not exists idx_alerts_user_date on public.alerts(user_id, created_at desc);
create index if not exists idx_whatsapp_user_date on public.whatsapp_messages(user_id, created_at desc);
