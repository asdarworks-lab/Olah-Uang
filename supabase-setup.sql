-- ============================================================
-- Supabase Setup — Olah Uang Multi-User + Admin
-- Jalankan file ini di Supabase SQL Editor.
-- ============================================================

-- 1) Pastikan kolom penting punya default yang aman.
alter table public.profiles
  alter column role set default 'user';

alter table public.transaksi
  alter column created_at set default now();

-- 2) Rapikan foreign key transaksi agar ikut terhapus jika user auth dihapus.
alter table public.transaksi
  drop constraint if exists transaksi_user_id_fkey;

alter table public.transaksi
  add constraint transaksi_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- 3) Constraint validasi data.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('admin', 'user'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transaksi_jenis_check'
  ) then
    alter table public.transaksi
      add constraint transaksi_jenis_check check (jenis in ('masuk', 'keluar'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transaksi_nominal_positive'
  ) then
    alter table public.transaksi
      add constraint transaksi_nominal_positive check (nominal > 0);
  end if;
end $$;

-- 4) Index untuk performa.
create index if not exists profiles_role_idx
  on public.profiles(role);

create index if not exists transaksi_user_id_idx
  on public.transaksi(user_id);

create index if not exists transaksi_created_at_idx
  on public.transaksi(created_at desc);

create index if not exists transaksi_user_created_idx
  on public.transaksi(user_id, created_at desc);

-- 5) Aktifkan Row Level Security.
alter table public.profiles enable row level security;
alter table public.transaksi enable row level security;

-- 6) Helper cek admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 7) Trigger otomatis membuat profile saat user register.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_profile integer;
begin
  select count(*) into total_profile from public.profiles;

  insert into public.profiles (id, email, nama, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nama', split_part(new.email, '@', 1)),
    case when total_profile = 0 then 'admin' else 'user' end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    nama = coalesce(public.profiles.nama, excluded.nama);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 8) Trigger mencegah user biasa mengubah role/email/id sendiri.
create or replace function public.prevent_profile_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.created_at is distinct from old.created_at then
    raise exception 'User biasa tidak boleh mengubah kolom sensitif profile.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_sensitive_change_trigger on public.profiles;

create trigger prevent_profile_sensitive_change_trigger
before update on public.profiles
for each row execute function public.prevent_profile_sensitive_change();

-- 9) Bersihkan policy lama agar hasilnya tidak tabrakan.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

drop policy if exists "transaksi_select_own_or_admin" on public.transaksi;
drop policy if exists "transaksi_insert_own" on public.transaksi;
drop policy if exists "transaksi_update_own" on public.transaksi;
drop policy if exists "transaksi_delete_own_or_admin" on public.transaksi;

-- 10) Policy profiles.
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.is_admin()
);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and role = 'user'
);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
)
with check (
  id = (select auth.uid())
);

create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_delete_admin"
on public.profiles
for delete
to authenticated
using (public.is_admin());

-- 11) Policy transaksi.
create policy "transaksi_select_own_or_admin"
on public.transaksi
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
);

create policy "transaksi_insert_own"
on public.transaksi
for insert
to authenticated
with check (
  user_id = (select auth.uid())
);

create policy "transaksi_update_own"
on public.transaksi
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

create policy "transaksi_delete_own_or_admin"
on public.transaksi
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_admin()
);

-- 12) Opsional setelah data lama sudah bersih:
-- Cek dulu data bermasalah.
-- select * from public.transaksi where user_id is null or nominal is null or created_at is null;
-- Kalau sudah tidak ada data null, boleh aktifkan:
-- alter table public.transaksi alter column user_id set not null;
-- alter table public.transaksi alter column nominal set not null;
-- alter table public.transaksi alter column created_at set not null;

-- 13) Catatan: trigger di atas membuat profile pertama sebagai admin. Jika perlu ubah manual:
-- update public.profiles set role = 'admin' where email = 'emailkamu@example.com';
