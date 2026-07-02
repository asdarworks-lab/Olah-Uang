-- Olah Uang v114 - Tambah kolom keterangan transaksi
-- Jalankan di Supabase SQL Editor sebelum memakai field Keterangan.

alter table public.transaksi
add column if not exists keterangan text;

notify pgrst, 'reload schema';
