# Setup Notifikasi Harian PWA Olah Uang

Fitur ini mengirim ringkasan catatan hari ini sebanyak 4 kali sehari:

```text
08.00 WIB
13.00 WIB
18.00 WIB
22.00 WIB
```

Vercel Cron memakai UTC. Jadwal di `vercel.json`:

```text
0 1,6,11,15 * * *
```

Konversinya:

```text
08.00 WIB = 01.00 UTC
13.00 WIB = 06.00 UTC
18.00 WIB = 11.00 UTC
22.00 WIB = 15.00 UTC
```

Environment Variables yang dibutuhkan:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT=mailto:emailkamu@example.com
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_URL=https://uezjncjapumyrkjxzslw.supabase.co
```

Jalankan SQL push notification jika belum:

```text
supabase-push-notifications.sql
```

Setelah ubah jadwal cron, redeploy project ke Vercel.
