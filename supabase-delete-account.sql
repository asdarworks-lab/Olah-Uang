-- Olah Uang v104 - SQL pendukung fitur final
-- Jalankan di Supabase SQL Editor setelah deploy kode ini.
-- File ini idempotent: aman dijalankan ulang.

-- ============================================================
-- PROFILES: kolom tambahan aplikasi
-- ============================================================
alter table public.profiles
  add column if not exists nomor_hp text,
  add column if not exists budget_config jsonb,
  add column if not exists income_target_config jsonb,
  add column if not exists target_tabungan_bulanan bigint not null default 5000000,
  add column if not exists onboarding_seen boolean not null default false,
  add column if not exists account_status text not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'suspended', 'deleted'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_account_status_idx on public.profiles(account_status);

-- Helper admin untuk RLS.
create or replace function public.is_olah_uang_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(account_status, 'active') = 'active'
  );
$$;

grant execute on function public.is_olah_uang_admin() to anon, authenticated;

-- ============================================================
-- USER ACTIVITY: status pengguna aktif
-- ============================================================
create table if not exists public.user_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_page text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_activity enable row level security;

create index if not exists user_activity_last_seen_idx on public.user_activity(last_seen desc);

-- ============================================================
-- ACCOUNT RECOVERY REQUESTS: bantuan lupa email/akun
-- ============================================================
create table if not exists public.account_recovery_requests (
  id bigint generated always as identity primary key,
  nama text not null,
  nomor_hp text not null,
  catatan text,
  status text not null default 'baru',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_recovery_requests_status_check'
  ) then
    alter table public.account_recovery_requests
      add constraint account_recovery_requests_status_check
      check (status in ('baru', 'diproses', 'selesai', 'ditolak'));
  end if;
end $$;

alter table public.account_recovery_requests enable row level security;

create index if not exists account_recovery_requests_created_at_idx on public.account_recovery_requests(created_at desc);
create index if not exists account_recovery_requests_status_idx on public.account_recovery_requests(status);

-- ============================================================
-- AI MONTHLY INSIGHTS: cache insight bulanan
-- ============================================================
create table if not exists public.ai_monthly_insights (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bulan integer not null check (bulan between 0 and 11),
  tahun integer not null check (tahun between 2000 and 2100),
  summary_hash text not null,
  summary jsonb,
  insights jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_monthly_insights_unique_period unique (user_id, bulan, tahun)
);

alter table public.ai_monthly_insights enable row level security;

create index if not exists ai_monthly_insights_user_period_idx
  on public.ai_monthly_insights(user_id, tahun desc, bulan desc);

-- ============================================================
-- RLS POLICIES
-- Dibuat aman dengan drop/create agar tidak bentrok saat dijalankan ulang.
-- ============================================================

drop policy if exists "user_activity_select_own_or_admin" on public.user_activity;
create policy "user_activity_select_own_or_admin"
  on public.user_activity
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_olah_uang_admin());

drop policy if exists "user_activity_insert_own" on public.user_activity;
create policy "user_activity_insert_own"
  on public.user_activity
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_activity_update_own" on public.user_activity;
create policy "user_activity_update_own"
  on public.user_activity
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_activity_delete_own_or_admin" on public.user_activity;
create policy "user_activity_delete_own_or_admin"
  on public.user_activity
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_olah_uang_admin());

-- Permintaan lupa email dibuat dari halaman publik, jadi anon perlu insert.
drop policy if exists "account_recovery_insert_public" on public.account_recovery_requests;
create policy "account_recovery_insert_public"
  on public.account_recovery_requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "account_recovery_admin_select" on public.account_recovery_requests;
create policy "account_recovery_admin_select"
  on public.account_recovery_requests
  for select
  to authenticated
  using (public.is_olah_uang_admin());

drop policy if exists "account_recovery_admin_update" on public.account_recovery_requests;
create policy "account_recovery_admin_update"
  on public.account_recovery_requests
  for update
  to authenticated
  using (public.is_olah_uang_admin())
  with check (public.is_olah_uang_admin());

drop policy if exists "ai_monthly_insights_select_own_or_admin" on public.ai_monthly_insights;
create policy "ai_monthly_insights_select_own_or_admin"
  on public.ai_monthly_insights
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_olah_uang_admin());

drop policy if exists "ai_monthly_insights_insert_own" on public.ai_monthly_insights;
create policy "ai_monthly_insights_insert_own"
  on public.ai_monthly_insights
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "ai_monthly_insights_update_own" on public.ai_monthly_insights;
create policy "ai_monthly_insights_update_own"
  on public.ai_monthly_insights
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "ai_monthly_insights_delete_own_or_admin" on public.ai_monthly_insights;
create policy "ai_monthly_insights_delete_own_or_admin"
  on public.ai_monthly_insights
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_olah_uang_admin());

-- Supabase PostgREST perlu reload schema agar kolom baru langsung terbaca.
notify pgrst, 'reload schema';
