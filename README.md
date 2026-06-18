# Olah Uang — Versi Fixed Multi-User

Isi folder:

- `index.html` — halaman login/register
- `dashboard.html` — dashboard user
- `dashboard-admin.html` — dashboard admin
- `script.js` — semua logic aplikasi
- `supabase-setup.sql` — setup RLS, policy, trigger, index, dan constraint Supabase

## Langkah pemasangan

1. Upload/replace file berikut ke repository GitHub/Netlify:
   - `index.html`
   - `dashboard.html`
   - `dashboard-admin.html`
   - `script.js`

2. Buka Supabase Dashboard → SQL Editor.

3. Jalankan isi file:
   - `supabase-setup.sql`

4. Register akun utama melalui aplikasi.

5. Jadikan akun utama sebagai admin dengan SQL berikut:

```sql
update public.profiles
set role = 'admin'
where email = 'emailkamu@example.com';
```

Ganti `emailkamu@example.com` dengan email akun kamu.

## Catatan penting

- `sb_publishable_...` boleh dipakai di frontend, tetapi RLS wajib aktif.
- Jangan pernah menaruh `sb_secret_...` atau `service_role` di frontend.
- Admin panel hanya aman kalau policy Supabase sudah berjalan.
- Budget masih hardcoded di `script.js`. Tahap berikutnya bisa dibuat tabel `budgets` supaya tiap user punya budget sendiri.


Versi perbaikan: 20260618-v3-cachefix
- HTML memakai /script.js?v=20260618-v3-cachefix agar browser tidak memakai cache lama.
- script.js menulis window.OLAH_UANG_VERSION untuk pengecekan di Console.
