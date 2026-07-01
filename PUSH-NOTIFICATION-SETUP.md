# Setup Notifikasi Harian PWA Olah Uang

Fitur ini mengirim ringkasan harian setiap pukul 22.00 WIB memakai Vercel Cron + Web Push.

## 1. Buat VAPID key

```bash
npx web-push generate-vapid-keys
```

Simpan ke Environment Variables Vercel:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT=mailto:emailkamu@example.com
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_URL=https://uezjncjapumyrkjxzslw.supabase.co
```

## 2. Jalankan SQL

```text
supabase-push-notifications.sql
```

## 3. Deploy ke Vercel

Pastikan file berikut ikut ter-upload:

```text
vercel.json
package.json
api/push-public-key.js
api/daily-push-report.js
service-worker.js
```

Cron:

```text
0 15 * * *
```

Itu setara 22.00 WIB karena WIB adalah UTC+7.

## 4. Aktifkan dari aplikasi

Buka:

```text
Pengaturan → Bantuan & Akun → Notifikasi Harian
```

Klik:

```text
Aktifkan Notifikasi
```
