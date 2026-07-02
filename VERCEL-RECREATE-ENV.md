# Olah Uang - Environment Variables untuk Vercel

Masukkan di: Vercel → Project → Settings → Environment Variables

Centang/isi untuk: Production, Preview, dan Development.

## Wajib untuk AI Insight

```text
GEMINI_API_KEY=ISI_API_KEY_GEMINI_KAMU
SUPABASE_URL=https://uezjncjapumyrkjxzslw.supabase.co
SUPABASE_ANON_KEY=sb_publishable_gMbWszjY1XIou5Cj4wDkjg_UlGiuOd5
```

Opsional:

```text
GEMINI_MODEL=gemini-2.5-flash
```

## Wajib untuk notifikasi PWA

```text
SUPABASE_SERVICE_ROLE_KEY=ISI_SERVICE_ROLE_KEY_DARI_SUPABASE
VAPID_PUBLIC_KEY=ISI_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=ISI_VAPID_PRIVATE_KEY
VAPID_CONTACT=mailto:asdar.works@gmail.com
```

## Jangan isi dulu kalau pakai Vercel Cron bawaan

```text
CRON_SECRET=
```

Biarkan kosong. Kalau `CRON_SECRET` diisi, endpoint `/api/daily-push-report` akan meminta:

```text
Authorization: Bearer ISI_CRON_SECRET
```

## Yang sering tertukar

```text
SALAH:
SUPABASE_URL=sb_publishable_gMbWszjY1XIou5Cj4wDkjg_UlGiuOd5

BENAR:
SUPABASE_URL=https://uezjncjapumyrkjxzslw.supabase.co
SUPABASE_ANON_KEY=sb_publishable_gMbWszjY1XIou5Cj4wDkjg_UlGiuOd5
```

## VAPID key

Kalau VAPID key lama hilang, buat baru:

```bash
npx web-push generate-vapid-keys
```

Setelah VAPID key berubah, user perlu mengaktifkan ulang notifikasi dari aplikasi.

## Catatan Vercel Hobby Cron

Paket v128 ini aman untuk Vercel Hobby:

```text
22.00 WIB = 15.00 UTC
schedule = 0 15 * * *
```

Kalau ingin 08.00, 13.00, 18.00, dan 22.00 WIB, pilih salah satu:

1. Upgrade Vercel Pro, lalu gunakan:
```text
0 1,6,11,15 * * *
```

2. Pakai external cron service untuk memanggil:
```text
https://olahuang.vercel.app/api/daily-push-report
```

Kalau pakai external cron, aktifkan `CRON_SECRET` dan kirim header Authorization.
