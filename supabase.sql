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

-- Notes + attachments (cloud-synced)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes add column if not exists title text not null default '';
alter table public.notes add column if not exists content text not null default '';
alter table public.notes add column if not exists created_at timestamptz not null default now();
alter table public.notes add column if not exists updated_at timestamptz not null default now();

create table if not exists public.note_files (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.note_files add column if not exists file_name text not null default '';
alter table public.note_files add column if not exists file_path text;
alter table public.note_files add column if not exists mime_type text;
alter table public.note_files add column if not exists size_bytes bigint;
alter table public.note_files add column if not exists created_at timestamptz not null default now();
alter table public.note_files alter column file_path set not null;

create or replace function public.set_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_notes_set_updated_at on public.notes;
create trigger trg_notes_set_updated_at
before update on public.notes
for each row execute function public.set_notes_updated_at();

alter table public.notes enable row level security;
alter table public.note_files enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notes' and policyname = 'notes_crud_own'
  ) then
    create policy notes_crud_own
    on public.notes
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'note_files' and policyname = 'note_files_crud_own'
  ) then
    create policy note_files_crud_own
    on public.note_files
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists idx_notes_user_updated on public.notes(user_id, updated_at desc);
create index if not exists idx_note_files_note on public.note_files(note_id, created_at desc);
create index if not exists idx_note_files_user on public.note_files(user_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('note-files', 'note-files', false)
on conflict (id) do update set public = false;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'note_files_storage_select_own'
  ) then
    create policy note_files_storage_select_own
    on storage.objects
    for select
    using (
      bucket_id = 'note-files'
      and split_part(name, '/', 1) = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'note_files_storage_insert_own'
  ) then
    create policy note_files_storage_insert_own
    on storage.objects
    for insert
    with check (
      bucket_id = 'note-files'
      and auth.role() = 'authenticated'
      and split_part(name, '/', 1) = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'note_files_storage_update_own'
  ) then
    create policy note_files_storage_update_own
    on storage.objects
    for update
    using (
      bucket_id = 'note-files'
      and split_part(name, '/', 1) = auth.uid()::text
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'note_files_storage_delete_own'
  ) then
    create policy note_files_storage_delete_own
    on storage.objects
    for delete
    using (
      bucket_id = 'note-files'
      and split_part(name, '/', 1) = auth.uid()::text
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
alter table public.profiles add column if not exists display_name text;

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
  color text,
  note text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.cards add column if not exists color text;
alter table public.cards add column if not exists note text;

create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo text,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  symbol text,
  category text not null,
  logo text,
  type_id uuid references public.investment_types(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.banks add column if not exists name text;
alter table public.banks add column if not exists logo text;
alter table public.banks add column if not exists created_at timestamptz not null default now();
alter table public.banks alter column name set not null;

alter table public.investment_types add column if not exists name text;
alter table public.investment_types add column if not exists category text;
alter table public.investment_types add column if not exists created_at timestamptz not null default now();
alter table public.investment_types alter column name set not null;
alter table public.investment_types alter column category set not null;

alter table public.assets add column if not exists name text;
alter table public.assets add column if not exists symbol text;
alter table public.assets add column if not exists category text;
alter table public.assets add column if not exists logo text;
alter table public.assets add column if not exists type_id uuid;
alter table public.assets add column if not exists created_at timestamptz not null default now();
alter table public.assets alter column name set not null;
alter table public.assets alter column category set not null;

do $$
begin
  if not exists (select 1 from public.banks where lower(name) = 'nubank') then
    insert into public.banks(name, logo) values ('Nubank', 'https://logo.clearbit.com/nubank.com.br');
  end if;
  if not exists (select 1 from public.banks where lower(name) = 'inter') then
    insert into public.banks(name, logo) values ('Inter', 'https://logo.clearbit.com/bancointer.com.br');
  end if;
  if not exists (select 1 from public.banks where lower(name) = 'xp') then
    insert into public.banks(name, logo) values ('XP', 'https://logo.clearbit.com/xpi.com.br');
  end if;
  if not exists (select 1 from public.banks where lower(name) = 'rico') then
    insert into public.banks(name, logo) values ('Rico', 'https://logo.clearbit.com/rico.com.vc');
  end if;
  if not exists (select 1 from public.banks where lower(name) = 'clear') then
    insert into public.banks(name, logo) values ('Clear', 'https://logo.clearbit.com/clear.com.br');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.investment_types where lower(name) = lower('CDB 100% CDI')) then
    insert into public.investment_types(name, category) values ('CDB 100% CDI', 'renda_fixa');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('CDB 110% CDI')) then
    insert into public.investment_types(name, category) values ('CDB 110% CDI', 'renda_fixa');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('CDB 115% CDI')) then
    insert into public.investment_types(name, category) values ('CDB 115% CDI', 'renda_fixa');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('CDB 120% CDI')) then
    insert into public.investment_types(name, category) values ('CDB 120% CDI', 'renda_fixa');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('Tesouro Selic')) then
    insert into public.investment_types(name, category) values ('Tesouro Selic', 'renda_fixa');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('Tesouro IPCA+')) then
    insert into public.investment_types(name, category) values ('Tesouro IPCA+', 'renda_fixa');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('Caixinha Nubank')) then
    insert into public.investment_types(name, category) values ('Caixinha Nubank', 'renda_fixa');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('Ouro')) then
    insert into public.investment_types(name, category) values ('Ouro', 'commodities');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('Acoes')) then
    insert into public.investment_types(name, category) values ('Acoes', 'renda_variavel');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('FIIs')) then
    insert into public.investment_types(name, category) values ('FIIs', 'renda_variavel');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('ETFs')) then
    insert into public.investment_types(name, category) values ('ETFs', 'renda_variavel');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('Bitcoin (BTC)')) then
    insert into public.investment_types(name, category) values ('Bitcoin (BTC)', 'cripto');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('Ethereum (ETH)')) then
    insert into public.investment_types(name, category) values ('Ethereum (ETH)', 'cripto');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('XRP')) then
    insert into public.investment_types(name, category) values ('XRP', 'cripto');
  end if;
  if not exists (select 1 from public.investment_types where lower(name) = lower('USDC')) then
    insert into public.investment_types(name, category) values ('USDC', 'cripto');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.assets where lower(name) = lower('Bitcoin (BTC)')) then
    insert into public.assets(name, symbol, category, logo, type_id)
    values (
      'Bitcoin (BTC)',
      'BTC',
      'cripto',
      'https://assets.coincap.io/assets/icons/btc@2x.png',
      (select id from public.investment_types where name = 'Bitcoin (BTC)' limit 1)
    );
  end if;
  if not exists (select 1 from public.assets where lower(name) = lower('Ethereum (ETH)')) then
    insert into public.assets(name, symbol, category, logo, type_id)
    values (
      'Ethereum (ETH)',
      'ETH',
      'cripto',
      'https://assets.coincap.io/assets/icons/eth@2x.png',
      (select id from public.investment_types where name = 'Ethereum (ETH)' limit 1)
    );
  end if;
  if not exists (select 1 from public.assets where lower(name) = lower('XRP')) then
    insert into public.assets(name, symbol, category, logo, type_id)
    values (
      'XRP',
      'XRP',
      'cripto',
      'https://assets.coincap.io/assets/icons/xrp@2x.png',
      (select id from public.investment_types where name = 'XRP' limit 1)
    );
  end if;
  if not exists (select 1 from public.assets where lower(name) = lower('USDC')) then
    insert into public.assets(name, symbol, category, logo, type_id)
    values (
      'USDC',
      'USDC',
      'cripto',
      'https://assets.coincap.io/assets/icons/usdc@2x.png',
      (select id from public.investment_types where name = 'USDC' limit 1)
    );
  end if;
  if not exists (select 1 from public.assets where lower(name) = lower('Tesouro Selic')) then
    insert into public.assets(name, symbol, category, logo, type_id)
    values (
      'Tesouro Selic',
      'SELIC',
      'renda_fixa',
      null,
      (select id from public.investment_types where name = 'Tesouro Selic' limit 1)
    );
  end if;
  if not exists (select 1 from public.assets where lower(name) = lower('Tesouro IPCA+')) then
    insert into public.assets(name, symbol, category, logo, type_id)
    values (
      'Tesouro IPCA+',
      'IPCA',
      'renda_fixa',
      null,
      (select id from public.investment_types where name = 'Tesouro IPCA+' limit 1)
    );
  end if;
  if not exists (select 1 from public.assets where lower(name) = lower('Ouro')) then
    insert into public.assets(name, symbol, category, logo, type_id)
    values (
      'Ouro',
      'XAU',
      'commodities',
      null,
      (select id from public.investment_types where name = 'Ouro' limit 1)
    );
  end if;
end
$$;

insert into public.assets(name, symbol, category, logo, type_id)
select
  t.name,
  null,
  t.category,
  null,
  t.id
from public.investment_types t
where not exists (
  select 1
  from public.assets a
  where lower(a.name) = lower(t.name)
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_id uuid references public.banks(id) on delete set null,
  type_id uuid references public.investment_types(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  broker text not null,
  operation text not null default 'compra',
  costs numeric not null default 0,
  category text not null default 'Outros',
  investment_type text not null,
  asset_name text not null default '',
  asset_logo_url text,
  quantity numeric not null default 1,
  average_price numeric not null default 0,
  current_price numeric not null default 0,
  dividends_received numeric not null default 0,
  invested_amount numeric not null,
  current_amount numeric not null,
  price_history jsonb,
  annual_rate numeric,
  created_at timestamp default now(),
  start_date date not null
);

alter table public.investments add column if not exists bank_id uuid;
alter table public.investments add column if not exists type_id uuid;
alter table public.investments add column if not exists asset_id uuid;
alter table public.investments add column if not exists broker text not null default '';
alter table public.investments add column if not exists operation text not null default 'compra';
alter table public.investments add column if not exists costs numeric not null default 0;
alter table public.investments add column if not exists category text not null default 'Outros';
alter table public.investments add column if not exists investment_type text not null default '';
alter table public.investments add column if not exists asset_name text not null default '';
alter table public.investments add column if not exists asset_logo_url text;
alter table public.investments add column if not exists quantity numeric not null default 1;
alter table public.investments add column if not exists average_price numeric not null default 0;
alter table public.investments add column if not exists current_price numeric not null default 0;
alter table public.investments add column if not exists dividends_received numeric not null default 0;
alter table public.investments add column if not exists invested_amount numeric not null default 0;
alter table public.investments add column if not exists current_amount numeric not null default 0;
alter table public.investments add column if not exists price_history jsonb;
alter table public.investments add column if not exists annual_rate numeric;
alter table public.investments add column if not exists created_at timestamp default now();
alter table public.investments add column if not exists start_date date default current_date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assets_type_id_fkey'
      and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
    add constraint assets_type_id_fkey
    foreign key (type_id) references public.investment_types(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'investments_bank_id_fkey'
      and conrelid = 'public.investments'::regclass
  ) then
    alter table public.investments
    add constraint investments_bank_id_fkey
    foreign key (bank_id) references public.banks(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'investments_type_id_fkey'
      and conrelid = 'public.investments'::regclass
  ) then
    alter table public.investments
    add constraint investments_type_id_fkey
    foreign key (type_id) references public.investment_types(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'investments_asset_id_fkey'
      and conrelid = 'public.investments'::regclass
  ) then
    alter table public.investments
    add constraint investments_asset_id_fkey
    foreign key (asset_id) references public.assets(id) on delete set null;
  end if;
end
$$;

update public.investments
set asset_name = coalesce(nullif(trim(asset_name), ''), investment_type, 'Ativo')
where coalesce(trim(asset_name), '') = '';

update public.investments
set category = case
  when lower(coalesce(investment_type, '')) like '%cripto%'
    or lower(coalesce(investment_type, '')) like '%btc%'
    or lower(coalesce(investment_type, '')) like '%bitcoin%'
    or lower(coalesce(investment_type, '')) like '%eth%' then 'Criptomoedas'
  when lower(coalesce(investment_type, '')) like '%tesouro%' then 'Tesouro Direto'
  when lower(coalesce(investment_type, '')) like '%acao%'
    or lower(coalesce(investment_type, '')) like '%ações%' then 'Acoes'
  when lower(coalesce(investment_type, '')) like '%fii%' then 'FIIs'
  when lower(coalesce(investment_type, '')) like '%cdb%'
    or lower(coalesce(investment_type, '')) like '%lci%'
    or lower(coalesce(investment_type, '')) like '%lca%'
    or lower(coalesce(investment_type, '')) like '%ipca%'
    or lower(coalesce(investment_type, '')) like '%selic%'
    or lower(coalesce(investment_type, '')) like '%caixinha%'
    or lower(coalesce(investment_type, '')) like '%poup%' then 'Renda Fixa'
  else 'Outros'
end
where coalesce(trim(category), '') = '';

update public.investments i
set bank_id = b.id
from public.banks b
where i.bank_id is null
  and coalesce(trim(i.broker), '') <> ''
  and lower(trim(i.broker)) = lower(trim(b.name));

update public.investments i
set type_id = t.id
from public.investment_types t
where i.type_id is null
  and coalesce(trim(i.investment_type), '') <> ''
  and lower(trim(i.investment_type)) = lower(trim(t.name));

update public.investments i
set asset_id = a.id
from public.assets a
where i.asset_id is null
  and coalesce(trim(i.asset_name), '') <> ''
  and lower(trim(i.asset_name)) = lower(trim(a.name));

update public.investments i
set broker = coalesce(nullif(trim(i.broker), ''), b.name)
from public.banks b
where i.bank_id = b.id;

update public.investments i
set investment_type = coalesce(nullif(trim(i.investment_type), ''), t.name),
    category = coalesce(nullif(trim(i.category), ''), case
      when lower(coalesce(t.category, '')) = 'renda_fixa' then 'Renda Fixa'
      when lower(coalesce(t.category, '')) = 'renda_variavel' then 'Acoes'
      when lower(coalesce(t.category, '')) = 'cripto' then 'Criptomoedas'
      when lower(coalesce(t.category, '')) = 'commodities' then 'Commodities'
      else 'Outros'
    end)
from public.investment_types t
where i.type_id = t.id;

update public.investments i
set asset_name = coalesce(nullif(trim(i.asset_name), ''), a.name),
    asset_logo_url = coalesce(nullif(trim(i.asset_logo_url), ''), a.logo)
from public.assets a
where i.asset_id = a.id;

update public.investments
set operation = case
  when lower(coalesce(operation, '')) = 'venda' then 'venda'
  else 'compra'
end
where coalesce(trim(operation), '') = '' or lower(coalesce(operation, '')) not in ('compra', 'venda');

update public.investments set costs = 0 where costs is null or costs < 0;
update public.investments set dividends_received = 0 where dividends_received is null or dividends_received < 0;

update public.investments set quantity = 1 where quantity is null or quantity <= 0;
update public.investments set average_price = 0 where average_price is null;
update public.investments set current_price = 0 where current_price is null;
update public.investments
set average_price = invested_amount / nullif(quantity, 0)
where average_price <= 0 and invested_amount > 0 and quantity > 0;
update public.investments
set current_price = current_amount / nullif(quantity, 0)
where current_price <= 0 and current_amount > 0 and quantity > 0;
update public.investments
set invested_amount = quantity * average_price
where invested_amount is null or invested_amount = 0;
update public.investments
set current_amount = quantity * current_price
where current_amount is null or current_amount = 0;
update public.investments set start_date = current_date where start_date is null;
alter table public.investments alter column start_date set not null;

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

alter table public.transactions add column if not exists transaction_type text;

update public.transactions
set transaction_type = case
  when type = 'transfer' then 'pix'
  when type in ('income', 'adjustment') then 'receita'
  when type = 'expense' then 'despesa'
  when type = 'card_payment' then 'cartao'
  else 'despesa'
end
where transaction_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_transaction_type_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
    add constraint transactions_transaction_type_check
    check (transaction_type in ('pix', 'receita', 'despesa', 'cartao'));
  end if;
end
$$;

create or replace function public.set_transaction_type_default()
returns trigger
language plpgsql
as $$
begin
  if new.transaction_type is null or btrim(new.transaction_type) = '' then
    new.transaction_type := case
      when new.type = 'transfer' then 'pix'
      when new.type in ('income', 'adjustment') then 'receita'
      when new.type = 'expense' then 'despesa'
      when new.type = 'card_payment' then 'cartao'
      else 'despesa'
    end;
  end if;
  return new;
end
$$;

drop trigger if exists trg_transactions_set_transaction_type on public.transactions;
create trigger trg_transactions_set_transaction_type
before insert or update on public.transactions
for each row execute function public.set_transaction_type_default();

alter table public.transactions alter column transaction_type set not null;

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
alter table public.banks enable row level security;
alter table public.investment_types enable row level security;
alter table public.assets enable row level security;
alter table public.investments enable row level security;
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
    where schemaname = 'public' and tablename = 'banks' and policyname = 'banks_read_authenticated'
  ) then
    create policy banks_read_authenticated
    on public.banks
    for select
    using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'investment_types' and policyname = 'investment_types_read_authenticated'
  ) then
    create policy investment_types_read_authenticated
    on public.investment_types
    for select
    using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assets' and policyname = 'assets_read_authenticated'
  ) then
    create policy assets_read_authenticated
    on public.assets
    for select
    using (auth.role() = 'authenticated');
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
    where schemaname = 'public' and tablename = 'investments' and policyname = 'investments_crud_own'
  ) then
    create policy investments_crud_own
    on public.investments
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
create index if not exists idx_banks_name on public.banks(lower(name));
create index if not exists idx_investment_types_category on public.investment_types(category, name);
create index if not exists idx_assets_category_name on public.assets(category, name);
create index if not exists idx_investments_user_date on public.investments(user_id, created_at desc);
create index if not exists idx_investments_bank_id on public.investments(bank_id);
create index if not exists idx_investments_type_id on public.investments(type_id);
create index if not exists idx_investments_asset_id on public.investments(asset_id);
create index if not exists idx_tx_user_date on public.transactions(user_id, occurred_at desc);
create index if not exists idx_alerts_user_date on public.alerts(user_id, created_at desc);
create index if not exists idx_whatsapp_user_date on public.whatsapp_messages(user_id, created_at desc);

-- backfill optional institution/issuer labels so bank icons render on UI
update public.accounts
set institution = case
  when lower(coalesce(name, '')) like '%inter%' then 'Inter'
  when lower(coalesce(name, '')) like '%nubank%' then 'Nubank'
  when lower(coalesce(name, '')) like '%bradesco%' then 'Bradesco'
  when lower(coalesce(name, '')) like '%mercado pago%' or lower(coalesce(name, '')) like '%mercadopago%' then 'Mercado Pago'
  when lower(coalesce(name, '')) like '%xp%' then 'XP'
  when lower(coalesce(name, '')) like '%btg%' then 'BTG'
  else institution
end
where coalesce(trim(institution), '') = '';

update public.cards
set issuer = case
  when lower(coalesce(name, '')) like '%inter%' then 'Inter'
  when lower(coalesce(name, '')) like '%nubank%' then 'Nubank'
  when lower(coalesce(name, '')) like '%bradesco%' then 'Bradesco'
  when lower(coalesce(name, '')) like '%mercado pago%' or lower(coalesce(name, '')) like '%mercadopago%' then 'Mercado Pago'
  when lower(coalesce(name, '')) like '%xp%' then 'XP'
  when lower(coalesce(name, '')) like '%btg%' then 'BTG'
  else issuer
end
where coalesce(trim(issuer), '') = '';

-- Storage bucket for avatars (public)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Storage policies for avatars
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_read_public'
  ) then
    create policy avatars_read_public
    on storage.objects
    for select
    using (bucket_id = 'avatars');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_insert_auth'
  ) then
    create policy avatars_insert_auth
    on storage.objects
    for insert
    with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_update_own'
  ) then
    create policy avatars_update_own
    on storage.objects
    for update
    using (bucket_id = 'avatars' and auth.uid() = owner);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_delete_own'
  ) then
    create policy avatars_delete_own
    on storage.objects
    for delete
    using (bucket_id = 'avatars' and auth.uid() = owner);
  end if;
end
$$;
