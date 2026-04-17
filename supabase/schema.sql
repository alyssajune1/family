create extension if not exists pgcrypto;

create schema if not exists app;

create type app.category_kind as enum ('expense', 'income');
create type app.bill_cadence as enum ('weekly', 'monthly', 'quarterly', 'annual', 'custom');
create type app.bill_status as enum ('paid', 'unpaid');
create type app.billing_cycle as enum ('monthly', 'annual');
create type app.account_type as enum ('asset', 'liability');
create type app.member_role as enum ('owner', 'member');

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure app.handle_new_user();

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  tagline text,
  emergency_fund_target numeric(12,2) not null default 20000,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role app.member_role not null default 'member',
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind app.category_kind not null,
  monthly_budget numeric(12,2) not null default 0,
  color text not null default '#a35d3d',
  created_at timestamptz not null default now(),
  unique (household_id, name, kind)
);

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  current_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  entered_by uuid not null references public.profiles(user_id) on delete restrict,
  cash_account_id uuid references public.cash_accounts(id) on delete set null,
  type app.category_kind not null,
  amount numeric(12,2) not null check (amount >= 0),
  transaction_date date not null,
  merchant text not null,
  notes text,
  receipt_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  entered_by uuid not null references public.profiles(user_id) on delete restrict,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  cadence app.bill_cadence not null default 'monthly',
  status app.bill_status not null default 'unpaid',
  autopay boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  current_amount numeric(12,2) not null default 0,
  target_amount numeric(12,2) not null default 0,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0,
  billing_cycle app.billing_cycle not null default 'monthly',
  next_charge_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.net_worth_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  account_type app.account_type not null default 'asset',
  current_balance numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  current_balance numeric(12,2) not null default 0,
  interest_rate numeric(6,2) not null default 0,
  minimum_payment numeric(12,2) not null default 0,
  target_payment numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sinking_funds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  current_amount numeric(12,2) not null default 0,
  target_amount numeric(12,2) not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);

create or replace function app.is_household_member(target_household uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.household_members members
    where members.household_id = target_household
      and members.user_id = auth.uid()
  );
$$;

create or replace function app.make_invite_code()
returns text
language sql
stable
as $$
  select 'HELM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.create_household_with_owner(household_name text, household_tagline text, member_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into public.profiles (user_id, full_name)
  values (auth.uid(), member_display_name)
  on conflict (user_id) do update
  set full_name = excluded.full_name;

  insert into public.households (name, tagline, invite_code)
  values (household_name, household_tagline, app.make_invite_code())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (new_household_id, auth.uid(), 'owner', member_display_name);

  insert into public.categories (household_id, name, kind, color, monthly_budget)
  values
    (new_household_id, 'Housing', 'expense', '#9d6143', 0),
    (new_household_id, 'Groceries', 'expense', '#2c7a64', 0),
    (new_household_id, 'Dining Out', 'expense', '#b27b22', 0),
    (new_household_id, 'Utilities', 'expense', '#6b7a99', 0),
    (new_household_id, 'Transport', 'expense', '#875a85', 0),
    (new_household_id, 'Insurance', 'expense', '#5d7b8e', 0),
    (new_household_id, 'Kids and Family', 'expense', '#d16d66', 0),
    (new_household_id, 'Shopping', 'expense', '#8d6a55', 0),
    (new_household_id, 'Subscriptions', 'expense', '#7d6e55', 0),
    (new_household_id, 'Medical', 'expense', '#b24d48', 0),
    (new_household_id, 'Travel', 'expense', '#3d7fa3', 0),
    (new_household_id, 'Other', 'expense', '#6f6258', 0),
    (new_household_id, 'Helm Income', 'income', '#2c7a64', 0),
    (new_household_id, 'June Income', 'income', '#4f9d84', 0),
    (new_household_id, 'Side Income', 'income', '#5d7b8e', 0),
    (new_household_id, 'Refunds', 'income', '#a35d3d', 0),
    (new_household_id, 'Other Income', 'income', '#6f6258', 0);

  return new_household_id;
end;
$$;

create or replace function public.join_household_with_code(invite_code_input text, member_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_household_id uuid;
begin
  select id into target_household_id
  from public.households
  where invite_code = invite_code_input;

  if target_household_id is null then
    raise exception 'Invite code not found';
  end if;

  insert into public.profiles (user_id, full_name)
  values (auth.uid(), member_display_name)
  on conflict (user_id) do update
  set full_name = excluded.full_name;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (target_household_id, auth.uid(), 'member', member_display_name)
  on conflict (household_id, user_id) do update
  set display_name = excluded.display_name;

  return target_household_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.bills enable row level security;
alter table public.savings_goals enable row level security;
alter table public.subscriptions enable row level security;
alter table public.net_worth_accounts enable row level security;
alter table public.debts enable row level security;
alter table public.sinking_funds enable row level security;

create policy "profiles self select"
on public.profiles for select
using (auth.uid() = user_id);

create policy "profiles self insert"
on public.profiles for insert
with check (auth.uid() = user_id);

create policy "profiles self update"
on public.profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "households members select"
on public.households for select
using (app.is_household_member(id));

create policy "households members update"
on public.households for update
using (app.is_household_member(id))
with check (app.is_household_member(id));

create policy "household_members members select"
on public.household_members for select
using (app.is_household_member(household_id));

create policy "household_members self update"
on public.household_members for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "categories members all"
on public.categories for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "cash_accounts members all"
on public.cash_accounts for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "transactions members all"
on public.transactions for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "bills members all"
on public.bills for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "savings goals members all"
on public.savings_goals for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "subscriptions members all"
on public.subscriptions for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "net worth members all"
on public.net_worth_accounts for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "debts members all"
on public.debts for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

create policy "sinking funds members all"
on public.sinking_funds for all
using (app.is_household_member(household_id))
with check (app.is_household_member(household_id));

grant execute on function public.create_household_with_owner(text, text, text) to authenticated;
grant execute on function public.join_household_with_code(text, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

create policy "receipt images household members read"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and app.is_household_member((storage.foldername(name))[1]::uuid)
);

create policy "receipt images household members write"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and app.is_household_member((storage.foldername(name))[1]::uuid)
);

create policy "receipt images household members update"
on storage.objects for update
using (
  bucket_id = 'receipts'
  and app.is_household_member((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'receipts'
  and app.is_household_member((storage.foldername(name))[1]::uuid)
);

create policy "receipt images household members delete"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and app.is_household_member((storage.foldername(name))[1]::uuid)
);
