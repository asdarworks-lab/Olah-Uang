const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uezjncjapumyrkjxzslw.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_gMbWszjY1XIou5Cj4wDkjg_UlGiuOd5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function formatRupiah(value = 0) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(safeNumber(value));
}

function sanitizeSummary(summary = {}) {
  const pickList = (items = [], limit = 8) => Array.isArray(items)
    ? items.slice(0, limit).map((item) => ({
        kategori: String(item?.kategori || '').slice(0, 80),
        nominal: safeNumber(item?.nominal),
        budget: item?.budget === null || item?.budget === undefined ? null : safeNumber(item?.budget),
        persen_budget: item?.persen_budget === null || item?.persen_budget === undefined ? null : safeNumber(item?.persen_budget),
        sisa_budget: item?.sisa_budget === null || item?.sisa_budget === undefined ? null : safeNumber(item?.sisa_budget),
        target: item?.target === null || item?.target === undefined ? null : safeNumber(item?.target)
      })).filter((item) => item.kategori)
    : [];

  const variasi = summary.variasi_bahasa && typeof summary.variasi_bahasa === 'object'
    ? {
        gaya: String(summary.variasi_bahasa.gaya || '').slice(0, 160),
        fokus: Array.isArray(summary.variasi_bahasa.fokus)
          ? summary.variasi_bahasa.fokus.slice(0, 5).map((item) => String(item || '').slice(0, 80))
          : []
      }
    : null;

  return {
    periode: String(summary.periode || '').slice(0, 80),
    bulan: safeNumber(summary.bulan),
    tahun: safeNumber(summary.tahun),
    total_pemasukan: safeNumber(summary.total_pemasukan),
    total_pengeluaran: safeNumber(summary.total_pengeluaran),
    potensi_tabungan: safeNumber(summary.potensi_tabungan),
    target_tabungan: safeNumber(summary.target_tabungan),
    jumlah_transaksi: safeNumber(summary.jumlah_transaksi),
    variation_seed: String(summary.variation_seed || '').slice(0, 80),
    variasi_bahasa: variasi,
    perbandingan_bulan_lalu: {
      pemasukan_bulan_lalu: safeNumber(summary.perbandingan_bulan_lalu?.pemasukan_bulan_lalu),
      pengeluaran_bulan_lalu: safeNumber(summary.perbandingan_bulan_lalu?.pengeluaran_bulan_lalu),
      pemasukan_naik_persen: summary.perbandingan_bulan_lalu?.pemasukan_naik_persen === null ? null : safeNumber(summary.perbandingan_bulan_lalu?.pemasukan_naik_persen),
      pengeluaran_naik_persen: summary.perbandingan_bulan_lalu?.pengeluaran_naik_persen === null ? null : safeNumber(summary.perbandingan_bulan_lalu?.pengeluaran_naik_persen)
    },
    kategori_pengeluaran_terbesar: pickList(summary.kategori_pengeluaran_terbesar, 8),
    kategori_pemasukan_terbesar: pickList(summary.kategori_pemasukan_terbesar, 6)
  };
}

function extractJson(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch (_) {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch (_) {}
  }

  return null;
}

function normalizeInsights(value) {
  const source = Array.isArray(value) ? value : value?.insights;
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => String(item || '').replace(/^[-\d.)\s]+/, '').trim())
    .filter(Boolean)
    .filter((text, index, arr) => arr.findIndex((item) => item.toLowerCase() === text.toLowerCase()) === index)
    .slice(0, 3);
}

function fallbackInsights(summary) {
  const topExpense = summary.kategori_pengeluaran_terbesar?.[0];
  const change = summary.perbandingan_bulan_lalu?.pengeluaran_naik_persen;
  const results = [];

  if (Number.isFinite(change)) {
    if (change > 0) {
      results.push(`Pengeluaran ${summary.periode} naik ${change}% dibanding periode sebelumnya. Dompetmu kerja lembur, kamu malah kasih shift tambahan 😅`);
    } else if (change < 0) {
      results.push(`Pengeluaran ${summary.periode} turun ${Math.abs(change)}% dibanding periode sebelumnya. Akhirnya dompet bisa napas sedikit, jangan langsung diajak marathon belanja lagi 😌`);
    } else {
      results.push(`Pengeluaran ${summary.periode} sama seperti periode sebelumnya. Konsisten sih, tapi dompet juga pengin lihat plot twist yang lebih hemat 😄`);
    }
  }

  if (summary.potensi_tabungan >= 0) {
    results.push(`Potensi tabungan periode ini ${formatRupiah(summary.potensi_tabungan)} dari target ${formatRupiah(summary.target_tabungan)}. Lumayan, tapi jangan sampai berubah jadi dana jajan dadakan ya 👀`);
  } else {
    results.push(`Pengeluaran lebih besar dari pemasukan sekitar ${formatRupiah(Math.abs(summary.potensi_tabungan))}. Ini bukan drama Korea, saldo juga capek kalau dibuat tegang terus 😵`);
  }

  if (topExpense?.kategori) {
    results.push(`Kategori terbesar masih ${topExpense.kategori} sebesar ${formatRupiah(topExpense.nominal)}. Tersangkanya sudah jelas, tinggal kamu mau negosiasi atau pura-pura tidak lihat 😌`);
  }

  return results.slice(0, 3);
}

async function verifyUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader
    }
  });

  if (!response.ok) return null;
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Metode tidak diizinkan.' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 500, { message: 'GEMINI_API_KEY belum diatur di Environment Variables hosting.' });

    const user = await verifyUser(req);
    if (!user?.id) return sendJson(res, 401, { message: 'Sesi login tidak valid. Silakan login ulang.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const summary = sanitizeSummary(body.summary || {});
    if (!summary.periode || !summary.jumlah_transaksi) {
      return sendJson(res, 400, { message: 'Data ringkasan belum lengkap untuk dibuat insight.' });
    }

    const variasiGaya = summary.variasi_bahasa?.gaya || 'roasting ringan, sindiran halus, emotikon, tetap informatif';
    const fokus = summary.variasi_bahasa?.fokus?.length ? summary.variasi_bahasa.fokus.join(', ') : 'tren, budget, kategori terbesar, tabungan';

    const prompt = `Kamu adalah asisten insight keuangan untuk aplikasi Olah Uang.

Buat tepat 3 insight keuangan dalam bahasa Indonesia berdasarkan data ringkas yang diberikan.

GAYA WAJIB:
- Roasting ringan + sindiran halus + emotikon + tetap informatif.
- Gaya seperti teman jahil yang peduli, bukan orang marah.
- Jangan memakai pola yang sama terus. Variasikan pembuka dan struktur kalimat.
- Jangan selalu memakai urutan: tren, tabungan, kategori. Pilih angle sesuai data dan variasi.
- Gunakan variasi gaya ini untuk periode ini: ${variasiGaya}.
- Fokus variasi periode ini: ${fokus}.
- Variation seed: ${summary.variation_seed}.

ATURAN ISI:
- Tetap berdasarkan angka yang ada, jangan mengarang data.
- Setiap insight maksimal 2 kalimat.
- Tiap insight wajib punya emotikon yang relevan.
- Boleh menyindir halus, tapi jangan menghina, merendahkan, atau kasar.
- Jangan memberi saran investasi, pinjaman, atau keputusan finansial berisiko.
- Jangan menyebut kamu AI, Gemini, prompt, JSON, atau sistem.
- Jangan mengulang frasa yang sama antar insight.
- Hindari kalimat generik seperti "ini tanda kebiasaan belanja mulai terkendali" kecuali memang sangat relevan.
- Buat kalimat terasa fresh, ekspresif, dan tidak monoton.

FORMAT BALASAN:
Kembalikan hanya JSON valid:
{"insights":["...","...","..."]}

DATA RINGKAS KEUANGAN:
${JSON.stringify(summary, null, 2)}`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.95,
          topP: 0.92,
          maxOutputTokens: 900,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              insights: {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: { type: 'string' }
              }
            },
            required: ['insights']
          }
        }
      })
    });

    const geminiData = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      console.error('[Gemini API error]', geminiData);
      return sendJson(res, 502, { message: 'Google AI belum bisa membuat insight saat ini.' });
    }

    const text = (geminiData.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('\n')
      .trim();

    const parsed = extractJson(text);
    let insights = normalizeInsights(parsed);
    if (insights.length < 3) {
      console.warn('[Gemini invalid output, fallback used]', text);
      insights = fallbackInsights(summary);
    }

    return sendJson(res, 200, { insights });
  } catch (error) {
    console.error('[generate-insight]', error);
    return sendJson(res, 500, { message: 'Terjadi kesalahan saat membuat insight AI.' });
  }
};
