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

  return {
    periode: String(summary.periode || '').slice(0, 80),
    bulan: safeNumber(summary.bulan),
    tahun: safeNumber(summary.tahun),
    total_pemasukan: safeNumber(summary.total_pemasukan),
    total_pengeluaran: safeNumber(summary.total_pengeluaran),
    potensi_tabungan: safeNumber(summary.potensi_tabungan),
    target_tabungan: safeNumber(summary.target_tabungan),
    jumlah_transaksi: safeNumber(summary.jumlah_transaksi),
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

function cleanInsightText(value = '') {
  return String(value || '')
    .replace(/^[\s\-•*\d.)]+/, '')
    .replace(/^insight\s*\d+\s*[:\-.]?\s*/i, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function extractTextInsights(text = '') {
  const cleaned = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  if (!cleaned) return [];

  // Tangkap format umum: 1. ..., 2. ..., 3. ...
  const numbered = cleaned.match(/(?:^|\n)\s*\d+[.)]\s+([^\n]+(?:\n(?!\s*\d+[.)]\s+).+)*)/g);
  if (numbered?.length) {
    return numbered.map((item) => cleanInsightText(item.replace(/^\s*\d+[.)]\s+/, ''))).filter(Boolean).slice(0, 3);
  }

  // Tangkap format bullet biasa.
  const bullets = cleaned
    .split(/\n+/)
    .map(cleanInsightText)
    .filter((line) => line && !/^\{?\s*"?insights"?\s*:?\s*\[?/i.test(line) && !/^\}?\]?$/i.test(line));

  return bullets.slice(0, 3);
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

  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
    try { return JSON.parse(trimmed.slice(firstArray, lastArray + 1)); } catch (_) {}
  }

  return null;
}

function normalizeInsights(value, rawText = '') {
  let source = Array.isArray(value) ? value : value?.insights;

  if (!Array.isArray(source) && value && typeof value === 'object') {
    source = [value.insight1, value.insight2, value.insight3, value.one, value.two, value.three].filter(Boolean);
  }

  if (typeof source === 'string') {
    source = extractTextInsights(source);
  }

  if (!Array.isArray(source) || source.length < 3) {
    source = extractTextInsights(rawText);
  }

  return (source || [])
    .map(cleanInsightText)
    .filter(Boolean)
    .slice(0, 3);
}

function buildFallbackInsights(summary = {}) {
  const rupiah = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(safeNumber(value));

  const insights = [];
  const totalMasuk = safeNumber(summary.total_pemasukan);
  const totalKeluar = safeNumber(summary.total_pengeluaran);
  const potensi = safeNumber(summary.potensi_tabungan);
  const targetTabungan = safeNumber(summary.target_tabungan);
  const topExpense = Array.isArray(summary.kategori_pengeluaran_terbesar) ? summary.kategori_pengeluaran_terbesar[0] : null;
  const pengeluaranNaik = summary.perbandingan_bulan_lalu?.pengeluaran_naik_persen;

  if (pengeluaranNaik !== null && pengeluaranNaik !== undefined && Number.isFinite(Number(pengeluaranNaik))) {
    const persen = Math.abs(Math.round(Number(pengeluaranNaik)));
    insights.push(Number(pengeluaranNaik) > 0
      ? `Pengeluaran periode ini naik ${persen}% dibandingkan bulan lalu, jadi area pengeluaran harian perlu lebih dipantau.`
      : `Pengeluaran periode ini turun ${persen}% dibandingkan bulan lalu, ini tanda kebiasaan belanja mulai lebih terkendali.`);
  } else if (totalKeluar > 0) {
    insights.push(`Pengeluaran periode ini sudah mencapai ${rupiah(totalKeluar)}, jadi pantau kategori terbesar agar tidak melewati batas nyaman.`);
  }

  if (potensi >= 0) {
    const targetText = targetTabungan > 0 ? ` dari target ${rupiah(targetTabungan)}` : '';
    insights.push(`Potensi tabungan periode ini sekitar ${rupiah(potensi)}${targetText}. Pertahankan sisa saldo ini sampai akhir bulan.`);
  } else {
    insights.push(`Pengeluaran sudah lebih besar dari pemasukan sebesar ${rupiah(Math.abs(potensi))}. Prioritaskan pengeluaran wajib dan tunda yang belum mendesak.`);
  }

  if (topExpense?.kategori) {
    insights.push(`Kategori terbesar adalah ${topExpense.kategori} sebesar ${rupiah(topExpense.nominal)}. Kategori ini paling berpengaruh terhadap kondisi saldo periode ini.`);
  }

  if (insights.length < 3 && totalMasuk > 0) {
    insights.push(`Pemasukan periode ini tercatat ${rupiah(totalMasuk)}. Gunakan angka ini sebagai batas utama saat menentukan pengeluaran berikutnya.`);
  }

  while (insights.length < 3) {
    insights.push('Data transaksi sudah cukup untuk dipantau. Lanjutkan pencatatan rutin agar pola keuangan berikutnya semakin mudah dibaca.');
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

    const prompt = `Kamu adalah asisten keuangan pribadi berbahasa Indonesia untuk aplikasi Olah Uang.\n\nBuat tepat 3 insight bulanan yang singkat, jelas, dan mudah dipahami pengguna awam.\n\nAturan:\n- Jangan menghakimi pengguna.\n- Jangan memberi saran investasi, pinjaman, atau keputusan finansial berisiko.\n- Fokus pada pemasukan, pengeluaran, budget, dan kebiasaan transaksi.\n- Setiap insight maksimal 2 kalimat.\n- Nada profesional, sederhana, suportif, dan praktis.\n- Jangan menyebut bahwa kamu AI.\n- Kembalikan hanya JSON valid. Jangan pakai markdown, jangan pakai teks pembuka/penutup. Format wajib: {"insights":["insight pertama","insight kedua","insight ketiga"]}.\n\nData ringkas keuangan:\n${JSON.stringify(summary, null, 2)}`;

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 700,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              insights: {
                type: 'ARRAY',
                items: { type: 'STRING' },
                minItems: 3,
                maxItems: 3
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
    let insights = normalizeInsights(parsed, text);
    if (insights.length < 3) {
      console.warn('[Gemini invalid output, using fallback]', text);
      insights = buildFallbackInsights(summary);
    }

    return sendJson(res, 200, { insights });
  } catch (error) {
    console.error('[generate-insight]', error);
    return sendJson(res, 500, { message: 'Terjadi kesalahan saat membuat insight AI.' });
  }
};
