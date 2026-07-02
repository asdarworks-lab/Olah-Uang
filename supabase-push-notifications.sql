-- Olah Uang v109 - Web Push Notification Ringkasan Harian
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_active_idx on public.push_subscriptions(is_active);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;

create policy "push_subscriptions_select_own"
on public.push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "push_subscriptions_insert_own"
on public.push_subscriptions
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "push_subscriptions_update_own"
on public.push_subscriptions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "push_subscriptions_delete_own"
on public.push_subscriptions
for delete
to authenticated
using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

notify pgrst, 'reload schema';
