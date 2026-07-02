import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uezjncjapumyrkjxzslw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT = process.env.VAPID_CONTACT || 'mailto:admin@olahuang.app';
const CRON_SECRET = process.env.CRON_SECRET || '';

function rupiah(value = 0) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(value) || 0);
}

function getJakartaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

function getJakartaDayRange(date = new Date()) {
  const dateString = getJakartaDateString(date);
  const start = new Date(`${dateString}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateString, startIso: start.toISOString(), endIso: end.toISOString() };
}

async function supabaseFetch(path, options = {}) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum disetel.');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || body?.error || `Supabase request failed: ${response.status}`);
  return body;
}

function groupTransactionsByUser(transactions = []) {
  return transactions.reduce((acc, row) => {
    if (!row.user_id) return acc;
    if (!acc[row.user_id]) acc[row.user_id] = [];
    acc[row.user_id].push(row);
    return acc;
  }, {});
}

function buildDailySummary(userTransactions = [], dateString = '') {
  let pemasukan = 0;
  let pengeluaran = 0;
  const kategoriKeluar = {};

  userTransactions.forEach((row) => {
    const nominal = Number(row.nominal) || 0;

    if (row.jenis === 'masuk') {
      pemasukan += nominal;
    }

    if (row.jenis === 'keluar') {
      pengeluaran += nominal;
      const kategori = (row.kategori || 'Lainnya').trim();
      kategoriKeluar[kategori] = (kategoriKeluar[kategori] || 0) + nominal;
    }
  });

  const expenseEntries = Object.entries(kategoriKeluar)
    .sort((a, b) => b[1] - a[1]);

  const topExpense = expenseEntries[0];
  const selisih = pemasukan - pengeluaran;

  const expenseList = expenseEntries.length
    ? expenseEntries
        .map(([kategori, nominal]) => `${kategori} ${rupiah(nominal)}`)
        .join(' • ')
    : 'Tidak ada pengeluaran';

  const summaryLine = `Keluar ${rupiah(pengeluaran)} • Masuk ${rupiah(pemasukan)}`;
  const topLine = topExpense
    ? `Selisih ${rupiah(selisih)} • Terbesar: ${topExpense[0]}`
    : `Selisih ${rupiah(selisih)} • Terbesar: -`;
  const expenseLine = `Pengeluaran: ${expenseList}`;

  return {
    title: 'Ringkasan Harian Olah Uang',
    body: `${summaryLine}
${topLine}
${expenseLine}`,
    url: '/dashboard.html',
    tag: `olah-uang-daily-${dateString}`
  };
}

async function markSubscriptionInactive(endpoint) {
  try {
    await supabaseFetch(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() })
    });
  } catch (error) {
    console.warn('[Push inactive failed]', error);
  }
}

export default async function handler(req, res) {
  try {
    if (CRON_SECRET) {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (token !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({ error: 'VAPID_PUBLIC_KEY atau VAPID_PRIVATE_KEY belum disetel.' });
    }

    webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const range = getJakartaDayRange();
    const subscriptions = await supabaseFetch('push_subscriptions?is_active=eq.true&select=user_id,endpoint,p256dh,auth');
    const transactions = await supabaseFetch(`transaksi?created_at=gte.${encodeURIComponent(range.startIso)}&created_at=lt.${encodeURIComponent(range.endIso)}&select=user_id,jenis,kategori,nominal,keterangan,created_at`);
    const groupedTransactions = groupTransactionsByUser(transactions || []);

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions || []) {
      const payload = buildDailySummary(groupedTransactions[sub.user_id] || [], range.dateString);

      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, JSON.stringify(payload));
        sent += 1;
      } catch (error) {
        failed += 1;
        console.error('[Push send failed]', error?.statusCode, error?.message);
        if (error?.statusCode === 404 || error?.statusCode === 410) await markSubscriptionInactive(sub.endpoint);
      }
    }

    return res.status(200).json({ ok: true, date: range.dateString, subscriptions: subscriptions?.length || 0, transactions: transactions?.length || 0, sent, failed });
  } catch (error) {
    console.error('[Daily push report]', error);
    return res.status(500).json({ error: error?.message || 'Daily push report failed' });
  }
}
