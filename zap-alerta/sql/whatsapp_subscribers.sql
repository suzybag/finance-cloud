create extension if not exists pgcrypto;

create table if not exists public.whatsapp_subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null unique,
  name text,
  alert_days int not null default 3 check (alert_days between 1 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_subscribers_user on public.whatsapp_subscribers(user_id);
create index if not exists idx_whatsapp_subscribers_active on public.whatsapp_subscribers(active);

create or replace function public.set_updated_at_whatsapp_subscribers()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_whatsapp_subscribers_updated_at on public.whatsapp_subscribers;
create trigger trg_whatsapp_subscribers_updated_at
before update on public.whatsapp_subscribers
for each row execute function public.set_updated_at_whatsapp_subscribers();

alter table public.whatsapp_subscribers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_subscribers'
      and policyname = 'whatsapp_subscribers_crud_own'
  ) then
    create policy whatsapp_subscribers_crud_own
    on public.whatsapp_subscribers
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end
$$;

