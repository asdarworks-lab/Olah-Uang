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

Buat tepat 3 insight keuangan dalam bahasa Indonesia berdasarkan DATA RINGKAS KEUANGAN.

GAYA WAJIB:
- Roasting ringan + sindiran halus + emotikon + tetap informatif.
- Gaya seperti teman jahil yang peduli, bukan orang marah.
- Jangan monoton. Jangan terasa seperti template yang hanya ganti angka.
- Gunakan variasi gaya periode ini: ${variasiGaya}.
- Fokus variasi periode ini: ${fokus}.
- Variation seed: ${summary.variation_seed}.

ATURAN PENTING:
- Setiap insight harus membahas ANGLE yang berbeda.
- DILARANG semua insight hanya muter di: tren pengeluaran, potensi tabungan, kategori terbesar.
- Tidak wajib membahas tren, tabungan, dan kategori terbesar kalau ada angle lain yang lebih menarik.
- Pilih 3 angle paling menarik dari daftar ini sesuai data:
  1. pemasukan vs pengeluaran,
  2. surplus/defisit periode,
  3. rasio pengeluaran terhadap pemasukan,
  4. kategori over budget,
  5. kategori hampir habis,
  6. kategori pengeluaran terbesar,
  7. kategori pemasukan terbesar,
  8. target tabungan tercapai/belum,
  9. jumlah transaksi,
  10. perubahan dari periode sebelumnya,
  11. peluang hemat realistis,
  12. prioritas yang perlu dikontrol periode berikutnya.
- Tiap insight maksimal 2 kalimat.
- Tiap insight wajib punya emotikon yang relevan.
- Tetap berdasarkan angka yang ada, jangan mengarang data.
- Jangan memberi saran investasi, pinjaman, atau keputusan finansial berisiko.
- Jangan menyebut kamu AI, Gemini, prompt, JSON, atau sistem.
- Jangan mengulang frasa/pola pembuka antar insight.
- Hindari kalimat generik seperti "ini tanda kebiasaan belanja mulai terkendali" kecuali datanya benar-benar mendukung.
- Kalau ada data kategori_over_budget atau kategori_hampir_habis, prioritaskan salah satunya karena itu lebih actionable.
- Kalau total_pengeluaran lebih besar dari total_pemasukan, bahas defisit/saldo minus dengan roasting ringan.
- Kalau data bulan lalu kosong/null, jangan memaksakan perbandingan bulan lalu.

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
          temperature: 1.0,
          topP: 0.96,
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
    const insights = normalizeInsights(parsed);
    if (insights.length < 3) {
      console.error('[Gemini invalid output]', text);
      return sendJson(res, 502, {
        message: 'Google AI belum mengembalikan 3 insight valid. Coba refresh halaman.'
      });
    }

    return sendJson(res, 200, { insights });
  } catch (error) {
    console.error('[generate-insight]', error);
    return sendJson(res, 500, { message: 'Terjadi kesalahan saat membuat insight AI.' });
  }
};
