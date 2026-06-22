export default async function handler(req, res) {
  try {
    const userAgent = req.headers['user-agent'] || '';
    const isVercelCron = userAgent.includes('vercel-cron/1.0');
    const secretFromQuery = req.query?.secret;
    const cronSecret = process.env.CRON_SECRET;

    // Biar endpoint tidak sembarang dipanggil orang iseng.
    // Vercel Cron boleh lewat, test manual wajib pakai ?secret=...
    if (!isVercelCron && cronSecret && secretFromQuery !== cronSecret) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({
        success: false,
        message: 'Environment variables belum lengkap.'
      });
    }

    const now = new Date();

    // Konversi tanggal hari ini berdasarkan WIB.
    const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const year = wibNow.getUTCFullYear();
    const month = wibNow.getUTCMonth();
    const day = wibNow.getUTCDate();

    // Awal hari WIB dikonversi ke UTC.
    const startUtc = new Date(Date.UTC(year, month, day, -7, 0, 0));
    const endUtc = new Date(Date.UTC(year, month, day + 1, -7, 0, 0));

    const params = new URLSearchParams();
    params.append('select', 'jenis,nominal,kategori,created_at');
    params.append('created_at', `gte.${startUtc.toISOString()}`);
    params.append('created_at', `lt.${endUtc.toISOString()}`);
    params.append('order', 'created_at.asc');

    const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/transaksi?${params.toString()}`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!supabaseResponse.ok) {
      const errorText = await supabaseResponse.text();
      throw new Error(`Gagal mengambil data Supabase: ${errorText}`);
    }

    const transaksi = await supabaseResponse.json();

    const totalMasuk = transaksi
      .filter((item) => item.jenis === 'masuk')
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);

    const totalKeluar = transaksi
      .filter((item) => item.jenis === 'keluar')
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);

    const selisih = totalMasuk - totalKeluar;

    const kategoriKeluar = {};
    transaksi
      .filter((item) => item.jenis === 'keluar')
      .forEach((item) => {
        const kategori = item.kategori || 'Lainnya';
        kategoriKeluar[kategori] = (kategoriKeluar[kategori] || 0) + Number(item.nominal || 0);
      });

    const topKategori = Object.entries(kategoriKeluar)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const tanggalWib = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    }).format(now);

    const formatRupiah = (value) => {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(Number(value || 0));
    };

    const formatSelisih = selisih >= 0
      ? `+ ${formatRupiah(selisih)}`
      : `- ${formatRupiah(Math.abs(selisih))}`;

    let topKategoriText = 'Tidak ada pengeluaran hari ini.';
    if (topKategori.length) {
      topKategoriText = topKategori
        .map(([kategori, nominal], index) => `${index + 1}. ${kategori}: ${formatRupiah(nominal)}`)
        .join('\n');
    }

    const catatan = transaksi.length === 0
      ? 'Hari ini belum ada transaksi. Dompet sedang hening, semoga bukan karena lupa dicatat.'
      : selisih >= 0
        ? 'Hari ini masih aman. Dompet belum teriak, baru menghela napas kecil.'
        : 'Pengeluaran lebih besar dari pemasukan hari ini. Dompet tampaknya sedang mengajukan cuti sakit.';

    const message =
`📊 Laporan Harian Olah Uang
${tanggalWib}

💰 Pemasukan Hari Ini
${formatRupiah(totalMasuk)}

💸 Pengeluaran Hari Ini
${formatRupiah(totalKeluar)}

📌 Selisih Hari Ini
${formatSelisih}

🏷️ Pengeluaran Terbesar
${topKategoriText}

🧾 Jumlah Transaksi
${transaksi.length} transaksi

Catatan:
${catatan}`;

    const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message
      })
    });

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramResult.ok) {
      throw new Error(`Gagal kirim Telegram: ${JSON.stringify(telegramResult)}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Laporan harian berhasil dikirim.',
      total_transaksi: transaksi.length,
      total_masuk: totalMasuk,
      total_keluar: totalKeluar,
      selisih
    });
  } catch (error) {
    console.error('[daily-telegram-report]', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan.'
    });
  }
}
