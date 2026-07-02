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
        lebih_budget: item?.lebih_budget === null || item?.lebih_budget === undefined ? null : safeNumber(item?.lebih_budget),
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
    sisa_target_tabungan: safeNumber(summary.sisa_target_tabungan),
    target_tabungan_tercapai_persen: summary.target_tabungan_tercapai_persen === null ? null : safeNumber(summary.target_tabungan_tercapai_persen),
    rasio_pengeluaran_terhadap_pemasukan_persen: summary.rasio_pengeluaran_terhadap_pemasukan_persen === null ? null : safeNumber(summary.rasio_pengeluaran_terhadap_pemasukan_persen),
    status_saldo_periode: String(summary.status_saldo_periode || '').slice(0, 40),
    jumlah_transaksi: safeNumber(summary.jumlah_transaksi),
    jumlah_kategori_pengeluaran_aktif: safeNumber(summary.jumlah_kategori_pengeluaran_aktif),
    jumlah_kategori_pemasukan_aktif: safeNumber(summary.jumlah_kategori_pemasukan_aktif),
    variasi_bahasa: variasi,
    variation_seed: String(summary.variation_seed || '').slice(0, 60),
    insight_style_version: String(summary.insight_style_version || '').slice(0, 80),
    perbandingan_bulan_lalu: {
      pemasukan_bulan_lalu: safeNumber(summary.perbandingan_bulan_lalu?.pemasukan_bulan_lalu),
      pengeluaran_bulan_lalu: safeNumber(summary.perbandingan_bulan_lalu?.pengeluaran_bulan_lalu),
      pemasukan_naik_persen: summary.perbandingan_bulan_lalu?.pemasukan_naik_persen === null ? null : safeNumber(summary.perbandingan_bulan_lalu?.pemasukan_naik_persen),
      pengeluaran_naik_persen: summary.perbandingan_bulan_lalu?.pengeluaran_naik_persen === null ? null : safeNumber(summary.perbandingan_bulan_lalu?.pengeluaran_naik_persen)
    },
    kategori_pengeluaran_terbesar: pickList(summary.kategori_pengeluaran_terbesar, 8),
    kategori_pemasukan_terbesar: pickList(summary.kategori_pemasukan_terbesar, 6),
    kategori_over_budget: pickList(summary.kategori_over_budget, 5),
    kategori_hampir_habis: pickList(summary.kategori_hampir_habis, 5)
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

  const firstObj = trimmed.indexOf('{');
  const lastObj = trimmed.lastIndexOf('}');
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    try { return JSON.parse(trimmed.slice(firstObj, lastObj + 1)); } catch (_) {}
  }

  const firstArr = trimmed.indexOf('[');
  const lastArr = trimmed.lastIndexOf(']');
  if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
    try { return JSON.parse(trimmed.slice(firstArr, lastArr + 1)); } catch (_) {}
  }

  return null;
}

function splitTextInsights(text = '') {
  const cleaned = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .replace(/^\s*["'{[]+|["'}\]]+\s*$/g, '')
    .trim();

  return cleaned
    .split(/\n+/)
    .flatMap((line) => line.split(/(?=\b\d+[.)]\s+)/g))
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function normalizeInsights(value) {
  const result = [];
  const seen = new Set();

  const cleanText = (item) => String(item || '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^[-•*\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const push = (item) => {
    const text = cleanText(item);
    if (!text || text.length < 10) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(text);
  };

  const collect = (source) => {
    if (!source) return;

    if (typeof source === 'string') {
      splitTextInsights(source).forEach(push);
      return;
    }

    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (typeof item === 'string') push(item);
        else if (item && typeof item === 'object') {
          push(item.text ?? item.insight ?? item.message ?? item.content ?? item.value ?? item.deskripsi ?? item.keterangan);
        }
      });
      return;
    }

    if (source && typeof source === 'object') {
      [
        source.insights,
        source.insight,
        source.data,
        source.items,
        source.result,
        source.results,
        source.output,
        source.response,
        source.poin,
        source.points
      ].forEach(collect);

      Object.keys(source)
        .filter((key) => /insight|point|poin|item|hasil/i.test(key))
        .sort()
        .forEach((key) => collect(source[key]));
    }
  };

  collect(value);

  return result.slice(0, 3);
}

function dataAwareBackupInsights(summary) {
  const insights = [];
  const overBudget = summary.kategori_over_budget?.[0];
  const nearBudget = summary.kategori_hampir_habis?.[0];
  const topExpense = summary.kategori_pengeluaran_terbesar?.[0];
  const topIncome = summary.kategori_pemasukan_terbesar?.[0];
  const ratio = summary.rasio_pengeluaran_terhadap_pemasukan_persen;
  const change = summary.perbandingan_bulan_lalu?.pengeluaran_naik_persen;

  if (overBudget?.kategori) {
    insights.push(`${overBudget.kategori} sudah lewat budget ${overBudget.persen_budget}% dengan selisih sekitar ${formatRupiah(overBudget.lebih_budget)}. Budgetnya sudah teriak duluan, tinggal kamu pura-pura dengar atau benar-benar rem 😅`);
  }

  if (nearBudget?.kategori && insights.length < 3) {
    insights.push(`${nearBudget.kategori} sudah memakai ${nearBudget.persen_budget}% dari budget. Masih belum jebol, tapi posisinya sudah seperti gelas di pinggir meja: aman sih, tapi bikin waswas 👀`);
  }

  if (summary.potensi_tabungan < 0 && insights.length < 3) {
    insights.push(`Periode ini defisit sekitar ${formatRupiah(Math.abs(summary.potensi_tabungan))}. Ini bukan plot twist yang lucu, saldo kamu sedang minta negosiasi damai 😵`);
  }

  if (Number.isFinite(ratio) && insights.length < 3) {
    if (ratio >= 100) {
      insights.push(`Pengeluaran sudah mencapai ${ratio}% dari pemasukan. Dompetnya bukan capek lagi, ini sudah masuk mode lembur tanpa uang makan 😭`);
    } else if (ratio >= 80) {
      insights.push(`Pengeluaran sudah makan ${ratio}% dari pemasukan. Masih aman tipis, tapi jangan diuji dengan alasan “sekali-sekali” lagi ya 😌`);
    } else {
      insights.push(`Pengeluaran masih sekitar ${ratio}% dari pemasukan. Lumayan rapi, jangan langsung dirayakan dengan checkout mendadak 🛒`);
    }
  }

  if (topIncome?.kategori && insights.length < 3) {
    insights.push(`Pemasukan terbesar datang dari ${topIncome.kategori} sebesar ${formatRupiah(topIncome.nominal)}. Sumber utamanya jelas, sekarang tinggal pengeluarannya jangan ikut merasa punya hak istimewa 😄`);
  }

  if (Number.isFinite(change) && insights.length < 3) {
    if (change > 0) insights.push(`Pengeluaran naik ${change}% dibanding periode sebelumnya. Ada yang makin rajin keluar uang, sayangnya bukan saldo yang makin gemuk 😅`);
    else if (change < 0) insights.push(`Pengeluaran turun ${Math.abs(change)}% dibanding periode sebelumnya. Akhirnya ada kabar baik yang tidak bikin rekening ikut meratap 😌`);
  }

  if (topExpense?.kategori && insights.length < 3) {
    insights.push(`${topExpense.kategori} masih jadi pos terbesar dengan ${formatRupiah(topExpense.nominal)}. Pelakunya sudah kelihatan, tinggal kamu mau ajak evaluasi atau biarkan jadi tokoh utama lagi 🧐`);
  }

  if (summary.target_tabungan > 0 && insights.length < 3) {
    insights.push(`Target tabungan ${formatRupiah(summary.target_tabungan)}, sementara potensi saat ini ${formatRupiah(Math.max(summary.potensi_tabungan, 0))}. Targetnya gagah, realisasinya perlu diajak olahraga sedikit 💪`);
  }

  if (insights.length < 3) {
    insights.push(`Ada ${summary.jumlah_transaksi} transaksi di periode ini. Angkanya sudah cukup buat dibaca polanya, bukan cuma ditatap lalu berharap saldo membaik sendiri 🤓`);
  }

  return insights.slice(0, 3);
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

async function callGemini(apiKey, prompt, { temperature = 0.8, responseMimeType = 'application/json' } = {}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topP: 0.9,
      maxOutputTokens: 1200
    }
  };

  if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Gemini API error]', data);
    throw new Error('Google AI belum bisa membuat insight saat ini.');
  }

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();

  return { text, data };
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

    const variasiGaya = summary.variasi_bahasa?.gaya || 'roasting ringan, sindiran halus, ekspresif, tetap informatif';
    const fokus = summary.variasi_bahasa?.fokus?.length ? summary.variasi_bahasa.fokus.join(', ') : 'pola keuangan yang paling menarik';

    const prompt = `Kamu adalah penulis insight keuangan untuk aplikasi Olah Uang.

Buat tepat 3 insight keuangan dalam bahasa Indonesia berdasarkan DATA RINGKAS KEUANGAN.

GAYA WAJIB:
- Roasting ringan + sindiran halus + emotikon + tetap informatif.
- Gaya seperti teman jahil yang peduli, bukan orang marah.
- Jangan monoton dan jangan terasa seperti template.
- Gunakan variasi gaya periode ini: ${variasiGaya}.
- Fokus variasi periode ini: ${fokus}.
- Variation seed: ${summary.variation_seed}.

ATURAN ISI:
- Setiap insight harus membahas angle yang berbeda.
- Jangan semua insight hanya muter di tren pengeluaran, potensi tabungan, dan kategori terbesar.
- Pilih 3 angle paling menarik dari data: pemasukan vs pengeluaran, surplus/defisit, rasio pengeluaran, over budget, hampir habis, kategori pemasukan, target tabungan, jumlah transaksi, perubahan periode sebelumnya, peluang hemat, atau prioritas periode berikutnya.
- Kalau ada kategori_over_budget atau kategori_hampir_habis, prioritaskan salah satunya.
- Kalau total_pengeluaran lebih besar dari total_pemasukan, bahas defisit/saldo minus dengan sindiran ringan.
- Kalau data bulan lalu kosong/null, jangan memaksakan perbandingan bulan lalu.
- Tiap insight maksimal 2 kalimat.
- Tiap insight wajib punya emotikon yang relevan.
- Tetap berdasarkan angka yang ada, jangan mengarang data.
- Jangan memberi saran investasi, pinjaman, atau keputusan finansial berisiko.
- Jangan menyebut AI, Gemini, prompt, JSON, atau sistem.
- Jangan mengulang pola pembuka antar insight.

FORMAT WAJIB:
Balas hanya JSON valid, tanpa markdown, tanpa penjelasan tambahan:
{"insights":["kalimat insight 1","kalimat insight 2","kalimat insight 3"]}

DATA RINGKAS KEUANGAN:
${JSON.stringify(summary, null, 2)}`;

    let insights = [];

    try {
      const first = await callGemini(apiKey, prompt, { temperature: 0.82, responseMimeType: 'application/json' });
      insights = normalizeInsights(extractJson(first.text) || first.text);

      if (insights.length < 3) {
        console.warn('[Gemini invalid JSON output, retrying plain text]', first.text);

        const retryPrompt = `${prompt}

Respons sebelumnya belum valid:
${first.text}

Tulis ulang SEKARANG sebagai JSON valid persis:
{"insights":["...","...","..."]}`;

        const retry = await callGemini(apiKey, retryPrompt, { temperature: 0.62, responseMimeType: null });
        insights = normalizeInsights(extractJson(retry.text) || retry.text);
      }
    } catch (error) {
      console.error('[Gemini call failed, using backup]', error);
    }

    if (insights.length < 3) {
      // Safety net terakhir agar UI tidak balik ke insight lama yang terasa template.
      // Ini bukan pengganti AI utama, hanya agar dashboard tetap informatif kalau Gemini sedang bandel.
      insights = dataAwareBackupInsights(summary);
    }

    return sendJson(res, 200, { insights: insights.slice(0, 3) });
  } catch (error) {
    console.error('[generate-insight]', error);
    return sendJson(res, 500, { message: 'Terjadi kesalahan saat membuat insight AI.' });
  }
};
