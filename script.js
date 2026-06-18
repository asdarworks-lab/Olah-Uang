// ============================================================
// Olah Uang — Single Script Multi-User + Admin
// Netlify + Supabase
// ============================================================

const SUPABASE_URL = 'https://uezjncjapumyrkjxzslw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gMbWszjY1XIou5Cj4wDkjg_UlGiuOd5';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const APP_VERSION = '20260618-v3-cachefix';
console.log(`Olah Uang script loaded: ${APP_VERSION}`);
window.OLAH_UANG_VERSION = APP_VERSION;
document.documentElement.setAttribute('data-olah-uang-version', APP_VERSION);

let currentUser = null;
let currentProfile = null;
let userRealtimeChannel = null;
let adminRealtimeChannel = null;

let jenisAktif = 'keluar';
let grafikKeuangan = null;
let adminChart = null;
let filterTahunAktif = 'Semua';
let currentPage = 1;
let itemsPerPage = 10;
let pengeluaranBulanIni = {};

let adminTrxPage = 1;
const adminTrxPerPage = 15;
let allProfiles = [];
let allTrxData = [];

// ============================================================
// DATA DEFAULT
// Catatan: versi berikut masih hardcoded. Tahap berikutnya bisa
// dipindahkan ke tabel budget per user.
// ============================================================
const rencanaBudget = {
  'Belanja': 1500000,
  'Rumah': 200000,
  'Listrik': 300000,
  'Internet & Pulsa': 400000,
  'Furniture': 0,
  'Makan Luar': 200000,
  'Jajan': 150000,
  'Berbagi': 800000,
  'Transportasi': 200000,
  'Bensin': 200000,
  'Kontrol Gigi': 250000,
  'Aplikasi': 100000,
  'Investasi': 0,
  'Self Reward': 150000,
  'Toko Online': 250000,
  'Paylater': 250000,
  'Bumil': 250000,
  "Jum'at": 200000,
  'Infaq Shubuh': 150000,
  'Kantor': 150000,
  'Lauk': 100000,
  'Darurat': 200000,
  'Maxim': 0,
  'Utang': 0
};

const targetPemasukan = {
  'Gaji Mas': 4000000,
  'Gaji Adek': 4300000,
  'Sisa Sebelumnya': 0,
  'Maxim': 0,
  'Lainnya': 0
};

// ============================================================
// HELPER UMUM
// ============================================================
function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function formatRupiah(angka = 0) {
  const value = Number(angka) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(value);
}

function formatTanggal(value, options = { day: 'numeric', month: 'short' }) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', options);
}

function getErrorMessage(error) {
  if (!error) return 'Terjadi kesalahan tanpa pesan dari server.';
  if (typeof error === 'string') return error;

  const candidates = [
    error.message,
    error.error_description,
    error.description,
    error.details,
    error.hint,
    error.code ? `Kode error: ${error.code}` : ''
  ].filter(Boolean);

  if (candidates.length) return candidates.join(' | ');

  try {
    const json = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
    return json && json !== '{}' ? json : 'Server mengembalikan error kosong. Cek Console browser dan Log Supabase.';
  } catch {
    return String(error);
  }
}

function showError(title, error) {
  const message = getErrorMessage(error);
  console.error(`[${title}]`, error);

  return Swal.fire({
    icon: 'error',
    title,
    text: message,
    confirmButtonColor: '#059669'
  });
}

function showWarning(title, text) {
  return Swal.fire({
    icon: 'warning',
    title,
    text,
    confirmButtonColor: '#059669'
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

async function getSession() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function waitForProfile(userId, maxAttempts = 8) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data: profile, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (profile) return profile;

    await delay(350);
  }

  return null;
}

async function ensureProfile(user, { allowFallback = true } = {}) {
  if (!user) return null;

  let profile = await waitForProfile(user.id, 2);
  if (profile) return profile;

  // Fallback jika trigger database belum aktif.
  // Catatan: ini hanya bisa berhasil kalau user sudah punya session aktif
  // dan policy RLS mengizinkan insert profile sendiri.
  if (!allowFallback) return null;

  const nama = user.user_metadata?.nama || user.email?.split('@')[0] || 'Pengguna';
  const { data: insertedProfile, error: insertError } = await db
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      nama,
      role: 'user'
    }, { onConflict: 'id' })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return insertedProfile;
}

async function redirectByRole(userId) {
  let profile = null;

  try {
    profile = await waitForProfile(userId, 8);
  } catch (error) {
    return showError('Gagal membaca role', error);
  }

  if (!profile) {
    return showError(
      'Profile belum dibuat',
      'Akun Auth berhasil dibuat, tapi data di tabel profiles belum muncul. Jalankan SQL trigger handle_new_user atau cek RLS policy profiles.'
    );
  }

  if (profile.role === 'admin') {
    window.location.replace('dashboard-admin.html');
  } else {
    window.location.replace('dashboard.html');
  }
}

async function requireAuth({ adminOnly = false } = {}) {
  const session = await getSession();
  if (!session) {
    window.location.replace('index.html');
    return false;
  }

  currentUser = session.user;
  currentProfile = await ensureProfile(currentUser);

  if (adminOnly && currentProfile?.role !== 'admin') {
    window.location.replace('dashboard.html');
    return false;
  }

  return true;
}

// ============================================================
// LOGIN / REGISTER
// ============================================================
function gantitab(tab) {
  const isLogin = tab === 'masuk';
  $('formMasuk')?.classList.toggle('hidden', !isLogin);
  $('formDaftar')?.classList.toggle('hidden', isLogin);

  if ($('tabMasuk')) {
    $('tabMasuk').className = isLogin
      ? 'tab-active flex-1 py-4 text-sm transition-all'
      : 'tab-inactive flex-1 py-4 text-sm transition-all';
  }

  if ($('tabDaftar')) {
    $('tabDaftar').className = !isLogin
      ? 'tab-active flex-1 py-4 text-sm transition-all'
      : 'tab-inactive flex-1 py-4 text-sm transition-all';
  }
}

async function doLogin() {
  const email = $('loginEmail')?.value.trim();
  const password = $('loginPassword')?.value;

  if (!email || !password) {
    return showWarning('Lengkapi dulu', 'Email dan password wajib diisi. Database saja butuh identitas, masa manusia tidak.');
  }

  const btn = globalThis.event?.target;
  if (btn) btn.disabled = true;

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) return showError('Gagal masuk', error);

    await redirectByRole(data.user.id);
  } catch (error) {
    return showError('Gagal masuk', error);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function doRegister() {
  const nama = $('daftarNama')?.value.trim();
  const email = $('daftarEmail')?.value.trim();
  const password = $('daftarPassword')?.value;

  if (!nama || !email || !password) {
    return showWarning('Lengkapi dulu', 'Nama, email, dan password wajib diisi. Form kosong belum bisa menjadi akun, sayangnya.');
  }

  if (password.length < 6) {
    return showWarning('Password terlalu pendek', 'Minimal 6 karakter. Jangan bikin password yang bahkan semut pun bisa tebak.');
  }

  const btn = globalThis.event?.target;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Membuat akun...';
  }

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { nama } }
    });

    if (error) return showError('Gagal daftar', error);

    // Kalau email confirmation aktif, Supabase biasanya tidak memberi session.
    // User ada di Authentication, tapi belum bisa masuk sampai verifikasi email.
    if (!data?.session) {
      await Swal.fire({
        icon: 'success',
        title: 'Akun dibuat',
        text: 'Silakan cek email untuk verifikasi. Setelah itu login memakai email dan password tadi.',
        confirmButtonColor: '#059669'
      });
      gantitab('masuk');
      return;
    }

    currentUser = data.user;

    // Tunggu trigger database membuat row di profiles.
    // Kalau trigger belum ada, fallback insert profile sendiri akan dicoba.
    let profile = null;
    try {
      profile = await ensureProfile(data.user);
    } catch (profileError) {
      return showError('Akun dibuat, tapi profile gagal dibuat', profileError);
    }

    await Swal.fire({
      icon: 'success',
      title: 'Akun dibuat!',
      text: profile?.role === 'admin'
        ? 'Akun pertama berhasil dibuat sebagai admin.'
        : 'Akun berhasil dibuat sebagai user.',
      confirmButtonColor: '#059669',
      timer: 1600,
      showConfirmButton: false
    });

    await redirectByRole(data.user.id);
  } catch (error) {
    return showError('Gagal daftar', error);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Buat Akun';
    }
  }
}

async function doLogout() {
  if (userRealtimeChannel) await db.removeChannel(userRealtimeChannel);
  if (adminRealtimeChannel) await db.removeChannel(adminRealtimeChannel);
  await db.auth.signOut();
  window.location.replace('index.html');
}

async function initLoginPage() {
  const session = await getSession();
  if (session) await redirectByRole(session.user.id);
}

// ============================================================
// DASHBOARD USER
// ============================================================
function setupUserRealtime() {
  if (!currentUser || userRealtimeChannel) return;

  userRealtimeChannel = db
    .channel(`transaksi-user-${currentUser.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'transaksi',
      filter: `user_id=eq.${currentUser.id}`
    }, () => updateUI())
    .subscribe();
}

function setJenis(jenis) {
  jenisAktif = jenis === 'masuk' ? 'masuk' : 'keluar';

  const btnMasuk = $('btnMasuk');
  const btnKeluar = $('btnKeluar');
  const selectKategori = $('kategori');
  if (!btnMasuk || !btnKeluar || !selectKategori) return;

  if (jenisAktif === 'masuk') {
    btnMasuk.className = 'w-1/2 py-2 text-sm font-bold rounded-lg bg-emerald-600 text-white shadow-md transition cursor-pointer';
    btnKeluar.className = 'w-1/2 py-2 text-sm font-bold rounded-lg text-gray-500 hover:bg-gray-200 transition cursor-pointer';
    selectKategori.innerHTML = Object.keys(targetPemasukan)
      .map((k) => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`)
      .join('');
  } else {
    btnKeluar.className = 'w-1/2 py-2 text-sm font-bold rounded-lg bg-rose-600 text-white shadow-md transition cursor-pointer';
    btnMasuk.className = 'w-1/2 py-2 text-sm font-bold rounded-lg text-gray-500 hover:bg-gray-200 transition cursor-pointer';
    selectKategori.innerHTML = Object.keys(rencanaBudget)
      .map((k) => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`)
      .join('');
  }
}

function changeItemsPerPage() {
  const value = Number($('itemsPerPage')?.value || 10);
  itemsPerPage = Number.isFinite(value) && value > 0 ? value : 10;
  currentPage = 1;
  updateUI();
}

function changePage(page) {
  currentPage = Number(page) || 1;
  updateUI();
}

function resetUserPageAndUpdate() {
  currentPage = 1;
  updateUI();
}

function ubahFilterTahun() {
  filterTahunAktif = $('filterTahunChart')?.value || 'Semua';
  updateUI();
}

async function addTransaction() {
  if (!currentUser) return;

  const kategori = $('kategori')?.value;
  const nominalInput = $('amount')?.value;
  const nominal = Number(nominalInput);

  if (!kategori) {
    return Swal.fire({
      icon: 'warning',
      title: 'Kategori belum dipilih',
      text: 'Pilih kategori transaksi dulu.',
      confirmButtonColor: '#111827'
    });
  }

  if (!Number.isFinite(nominal) || nominal <= 0) {
    return Swal.fire({
      icon: 'warning',
      title: 'Nominal tidak valid',
      text: 'Masukkan nominal angka yang benar.',
      confirmButtonColor: '#111827'
    });
  }

  const { error } = await db.from('transaksi').insert({
    jenis: jenisAktif,
    kategori,
    nominal: Math.round(nominal),
    user_id: currentUser.id
  });

  if (error) return showError('Gagal simpan', error);

  if ($('amount')) $('amount').value = '';
  await updateUI();

  const limitBudget = rencanaBudget[kategori];
  const totalTerpakaiBulanIni = pengeluaranBulanIni[kategori.trim()] || 0;

  if (jenisAktif === 'keluar' && limitBudget > 0 && totalTerpakaiBulanIni > limitBudget) {
    return Swal.fire({
      title: 'Over Budget!',
      html:
        `Pengeluaran untuk <b>${escapeHTML(kategori)}</b> sudah melewati budget bulanan.<br><br>` +
        `Budget: <b>${formatRupiah(limitBudget)}</b><br>` +
        `Total Bulan Ini: <b class="text-rose-600">${formatRupiah(totalTerpakaiBulanIni)}</b>`,
      icon: 'warning',
      confirmButtonColor: '#e11d48'
    });
  }

  return Swal.fire({
    title: 'Berhasil!',
    text: 'Data transaksi tersimpan.',
    icon: 'success',
    timer: 1200,
    showConfirmButton: false
  });
}

async function fetchUserTransactions() {
  const { data, error } = await db
    .from('transaksi')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

function fillYearSelects(daftarTahun) {
  const selectTahunChart = $('filterTahunChart');
  const selectTahunRiwayat = $('filterTahunRiwayat');
  if (!selectTahunChart || !selectTahunRiwayat) return;

  const currentRiwayatVal = selectTahunRiwayat.value || 'Semua';
  const years = Array.from(daftarTahun).sort((a, b) => Number(b) - Number(a));
  const optionsHTML = ['<option value="Semua">Semua Tahun</option>']
    .concat(years.map((year) => `<option value="${escapeHTML(year)}">${escapeHTML(year)}</option>`))
    .join('');

  selectTahunChart.innerHTML = optionsHTML;
  selectTahunRiwayat.innerHTML = optionsHTML;

  selectTahunChart.value = years.includes(filterTahunAktif) ? filterTahunAktif : 'Semua';
  selectTahunRiwayat.value = years.includes(currentRiwayatVal) ? currentRiwayatVal : 'Semua';
}

function renderBudgetList(pengeluaranTerpakai, sekarang) {
  const budgetList = $('budgetList');
  if (!budgetList) return;

  const namaBulanIni = sekarang.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  budgetList.innerHTML = `<p class="text-xs text-gray-400 mb-3">Periode: ${escapeHTML(namaBulanIni)}</p>`;

  Object.entries(rencanaBudget).forEach(([kategori, target]) => {
    const terpakai = pengeluaranTerpakai[kategori] || 0;
    let persentase = target > 0 ? (terpakai / target) * 100 : (terpakai > 0 ? 100 : 0);
    persentase = Math.min(Math.max(persentase, 0), 100);
    const colorClass = persentase >= 90 ? 'bg-rose-500' : (persentase >= 70 ? 'bg-amber-400' : 'bg-emerald-500');

    budgetList.innerHTML += `
      <div class="mb-4">
        <div class="flex justify-between text-sm mb-1 gap-3">
          <span class="font-semibold text-gray-700">${escapeHTML(kategori)}</span>
          <span class="text-gray-500 whitespace-nowrap">${formatRupiah(terpakai)} / ${formatRupiah(target)}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div class="${colorClass} h-2.5 rounded-full" style="width:${persentase}%"></div>
        </div>
      </div>`;
  });
}

function renderIncomeList(pemasukanTerkumpul) {
  const incomeList = $('incomeList');
  if (!incomeList) return;

  incomeList.innerHTML = '';
  Object.entries(targetPemasukan).forEach(([kategori, target]) => {
    const terkumpul = pemasukanTerkumpul[kategori] || 0;
    let persentase = target > 0 ? (terkumpul / target) * 100 : (terkumpul > 0 ? 100 : 0);
    persentase = Math.min(Math.max(persentase, 0), 100);

    incomeList.innerHTML += `
      <div class="mb-4">
        <div class="flex justify-between text-sm mb-1 gap-3">
          <span class="font-semibold text-gray-700">${escapeHTML(kategori)}</span>
          <span class="text-gray-500 whitespace-nowrap">${formatRupiah(terkumpul)} / ${formatRupiah(target)}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2.5">
          <div class="bg-emerald-500 h-2.5 rounded-full" style="width:${persentase}%"></div>
        </div>
      </div>`;
  });
}

function renderUserChart(dataBulanan) {
  const canvas = $('monthlyChart');
  if (!canvas) return;

  const labels = Object.keys(dataBulanan);
  const datasetMasuk = labels.map((label) => dataBulanan[label].masuk);
  const datasetKeluar = labels.map((label) => dataBulanan[label].keluar);

  if (grafikKeuangan) grafikKeuangan.destroy();
  grafikKeuangan = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: datasetMasuk, backgroundColor: '#059669', borderRadius: 6 },
        { label: 'Pengeluaran', data: datasetKeluar, backgroundColor: '#e11d48', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 12 } } },
      scales: {
        y: {
          ticks: {
            callback: (value) => formatRupiah(value).replace('Rp', 'Rp ')
          }
        }
      }
    }
  });
}

function renderHistoryTable(filteredData) {
  const historyBody = $('historyBody');
  if (!historyBody) return;

  let totalMasukRiwayat = 0;
  let totalKeluarRiwayat = 0;

  filteredData.forEach((item) => {
    const nominal = Number(item.nominal) || 0;
    if (item.jenis === 'masuk') totalMasukRiwayat += nominal;
    if (item.jenis === 'keluar') totalKeluarRiwayat += nominal;
  });

  if ($('totalPemasukanRiwayat')) $('totalPemasukanRiwayat').textContent = formatRupiah(totalMasukRiwayat);
  if ($('totalPengeluaranRiwayat')) $('totalPengeluaranRiwayat').textContent = formatRupiah(totalKeluarRiwayat);

  const sortedData = [...filteredData].reverse();
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const pageData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (!pageData.length) {
    historyBody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-gray-400">Belum ada transaksi pada filter ini.</td>
      </tr>`;
  } else {
    historyBody.innerHTML = pageData.map((item) => {
      const warnaNominal = item.jenis === 'masuk' ? 'text-emerald-600' : 'text-rose-600';
      const simbol = item.jenis === 'masuk' ? '+' : '-';
      return `
        <tr class="group hover:bg-gray-50 transition-colors border-b border-gray-50">
          <td class="py-3 text-gray-400">${escapeHTML(formatTanggal(item.created_at))}</td>
          <td class="py-3 font-medium">${escapeHTML(item.kategori || '-')}</td>
          <td class="py-3 text-right ${warnaNominal} font-bold">${simbol} ${formatRupiah(item.nominal)}</td>
          <td class="py-3 text-center align-middle">
            <button onclick="hapusTransaksi('${escapeHTML(item.id)}')" class="text-gray-300 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-md transition-all opacity-60 hover:opacity-100 cursor-pointer" title="Hapus">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  renderUserPagination(totalPages);
}

function renderUserPagination(totalPages) {
  const container = $('paginationContainer');
  if (!container) return;

  container.innerHTML = '';
  if (totalPages <= 1) return;

  if (currentPage > 1) {
    container.innerHTML += `<button onclick="changePage(${currentPage - 1})" class="px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 transition">&laquo;</button>`;
  }

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  for (let page = startPage; page <= endPage; page += 1) {
    container.innerHTML += page === currentPage
      ? `<button class="px-2 py-1 rounded-md bg-emerald-600 text-white font-bold shadow-sm">${page}</button>`
      : `<button onclick="changePage(${page})" class="px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 transition">${page}</button>`;
  }

  if (currentPage < totalPages) {
    container.innerHTML += `<button onclick="changePage(${currentPage + 1})" class="px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 transition">&raquo;</button>`;
  }
}

async function updateUI() {
  if (!currentUser) return;

  let data = [];
  try {
    data = await fetchUserTransactions();
  } catch (error) {
    return showError('Gagal mengambil data', error);
  }

  const filterBulanVal = $('filterBulan')?.value || 'Semua';
  const filterTahunVal = $('filterTahunRiwayat')?.value || 'Semua';
  const sekarang = new Date();
  const bulanSekarang = sekarang.getMonth();
  const tahunSekarang = sekarang.getFullYear();

  const filteredData = data.filter((item) => {
    const tgl = new Date(item.created_at);
    if (Number.isNaN(tgl.getTime())) return false;

    const cocokBulan = filterBulanVal === 'Semua' || String(tgl.getMonth()) === filterBulanVal;
    const cocokTahun = filterTahunVal === 'Semua' || String(tgl.getFullYear()) === filterTahunVal;
    return cocokBulan && cocokTahun;
  });

  const pengeluaranTerpakai = {};
  const pemasukanTerkumpul = {};
  const dataBulanan = {};
  const daftarTahun = new Set();
  pengeluaranBulanIni = {};

  data.forEach((item) => {
    const tanggalObj = new Date(item.created_at);
    if (Number.isNaN(tanggalObj.getTime())) return;

    const tahun = String(tanggalObj.getFullYear());
    daftarTahun.add(tahun);

    const kategori = (item.kategori || '-').trim();
    const nominal = Number(item.nominal) || 0;

    if (tanggalObj.getMonth() === bulanSekarang && tanggalObj.getFullYear() === tahunSekarang) {
      if (item.jenis === 'masuk') {
        pemasukanTerkumpul[kategori] = (pemasukanTerkumpul[kategori] || 0) + nominal;
      }
      if (item.jenis === 'keluar') {
        pengeluaranTerpakai[kategori] = (pengeluaranTerpakai[kategori] || 0) + nominal;
        pengeluaranBulanIni[kategori] = (pengeluaranBulanIni[kategori] || 0) + nominal;
      }
    }

    if (filterTahunAktif === 'Semua' || filterTahunAktif === tahun) {
      const namaBulan = tanggalObj.toLocaleDateString('id-ID', { month: 'short' });
      const labelGrafik = filterTahunAktif === 'Semua' ? `${namaBulan} ${tahun}` : namaBulan;
      if (!dataBulanan[labelGrafik]) dataBulanan[labelGrafik] = { masuk: 0, keluar: 0 };
      if (item.jenis === 'masuk') dataBulanan[labelGrafik].masuk += nominal;
      if (item.jenis === 'keluar') dataBulanan[labelGrafik].keluar += nominal;
    }
  });

  const totalSaldo = data.reduce((acc, item) => {
    const nominal = Number(item.nominal) || 0;
    return item.jenis === 'masuk' ? acc + nominal : acc - nominal;
  }, 0);

  if ($('totalBalance')) $('totalBalance').textContent = formatRupiah(totalSaldo);

  fillYearSelects(daftarTahun);
  renderBudgetList(pengeluaranTerpakai, sekarang);
  renderIncomeList(pemasukanTerkumpul);
  renderUserChart(dataBulanan);
  renderHistoryTable(filteredData);
}

async function hapusTransaksi(id) {
  if (!currentUser) return;

  const result = await Swal.fire({
    title: 'Hapus transaksi ini?',
    text: 'Data yang dihapus tidak bisa dikembalikan.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#9ca3af',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (!result.isConfirmed) return;

  const { error } = await db
    .from('transaksi')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) return showError('Gagal hapus', error);

  await updateUI();
  return Swal.fire({
    title: 'Terhapus!',
    text: 'Transaksi berhasil dihapus.',
    icon: 'success',
    timer: 1200,
    showConfirmButton: false
  });
}

async function exportToCSV() {
  if (!currentUser) return;

  const { data, error } = await db
    .from('transaksi')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) return showError('Gagal export', error);

  const rows = [
    ['Tanggal', 'Kategori', 'Jenis', 'Nominal'],
    ...(data || []).map((row) => [row.created_at, row.kategori, row.jenis, row.nominal])
  ];

  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `riwayat-keuangan-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function initUserDashboard() {
  const ok = await requireAuth();
  if (!ok) return;

  // Baca ulang profile dari database agar perubahan role terbaru langsung dipakai,
  // bukan mengandalkan state lama di browser. Karena cache dan state lama itu
  // tampaknya punya cita-cita menjadi sumber kekacauan.
  const freshProfile = await waitForProfile(currentUser.id, 1);
  if (freshProfile) currentProfile = freshProfile;

  if (currentProfile?.role === 'admin') {
    window.location.replace('dashboard-admin.html');
    return;
  }

  if ($('userNama')) $('userNama').textContent = currentProfile?.nama || currentUser.email || 'Pengguna';

  setJenis('keluar');
  setupUserRealtime();
  await updateUI();
}

// ============================================================
// DASHBOARD ADMIN
// ============================================================
function setupAdminRealtime() {
  if (adminRealtimeChannel) return;

  adminRealtimeChannel = db
    .channel('admin-dashboard-watch')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => muatData(false))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => muatData(false))
    .subscribe();
}

async function muatData(showLoading = true) {
  if (showLoading && $('userTableBody')) {
    $('userTableBody').innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">Memuat data...</td></tr>';
  }

  const [profilesResult, trxResult] = await Promise.all([
    db.from('profiles').select('*').order('created_at', { ascending: false }),
    db.from('transaksi').select('*').order('created_at', { ascending: false })
  ]);

  if (profilesResult.error) return showError('Gagal mengambil profil', profilesResult.error);
  if (trxResult.error) return showError('Gagal mengambil transaksi', trxResult.error);

  allProfiles = profilesResult.data || [];
  allTrxData = trxResult.data || [];

  renderStatCards(allProfiles, allTrxData);
  renderUserTable(allProfiles, allTrxData);
  renderUserActivity(allProfiles, allTrxData);
  renderAllTrx();
  renderAdminChart(allTrxData);
}

function renderStatCards(profiles, trx) {
  const totalMasuk = trx
    .filter((item) => item.jenis === 'masuk')
    .reduce((acc, item) => acc + (Number(item.nominal) || 0), 0);

  const totalKeluar = trx
    .filter((item) => item.jenis === 'keluar')
    .reduce((acc, item) => acc + (Number(item.nominal) || 0), 0);

  if ($('statTotalUser')) $('statTotalUser').textContent = profiles.length;
  if ($('statTotalTrx')) $('statTotalTrx').textContent = trx.length;
  if ($('statTotalMasuk')) $('statTotalMasuk').textContent = formatRupiah(totalMasuk);
  if ($('statTotalKeluar')) $('statTotalKeluar').textContent = formatRupiah(totalKeluar);
}

function renderUserTable(profiles, trx) {
  const body = $('userTableBody');
  if (!body) return;

  if (!profiles.length) {
    body.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">Belum ada pengguna.</td></tr>';
    return;
  }

  body.innerHTML = profiles.map((profile) => {
    const jumlahTrx = trx.filter((item) => item.user_id === profile.id).length;
    const tanggal = formatTanggal(profile.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    const isAdmin = profile.role === 'admin';
    const roleBadge = isAdmin
      ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">Admin</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">User</span>';

    return `
      <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
        <td class="px-6 py-4 font-medium text-gray-800">${escapeHTML(profile.nama || '—')}</td>
        <td class="px-6 py-4 text-gray-500">${escapeHTML(profile.email || '—')}</td>
        <td class="px-6 py-4">${roleBadge}</td>
        <td class="px-6 py-4 text-gray-400">${escapeHTML(tanggal)} <span class="text-gray-300 ml-1">(${jumlahTrx} trx)</span></td>
        <td class="px-6 py-4 text-center">
          <button onclick="toggleRole('${escapeHTML(profile.id)}', '${escapeHTML(profile.role || 'user')}')"
            class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition text-gray-600 cursor-pointer">
            ${isAdmin ? 'Jadikan User' : 'Jadikan Admin'}
          </button>
        </td>
      </tr>`;
  }).join('');
}

function renderUserActivity(profiles, trx) {
  const container = $('userActivity');
  if (!container) return;

  const aktivitas = profiles.map((profile) => ({
    nama: profile.nama || profile.email || 'Pengguna',
    jumlah: trx.filter((item) => item.user_id === profile.id).length,
    saldo: trx
      .filter((item) => item.user_id === profile.id)
      .reduce((acc, item) => item.jenis === 'masuk' ? acc + (Number(item.nominal) || 0) : acc - (Number(item.nominal) || 0), 0)
  })).sort((a, b) => b.jumlah - a.jumlah).slice(0, 5);

  if (!aktivitas.length) {
    container.innerHTML = '<p class="text-gray-400 text-xs">Belum ada data.</p>';
    return;
  }

  const maxJumlah = aktivitas[0]?.jumlah || 1;
  container.innerHTML = aktivitas.map((user) => {
    const pct = Math.min((user.jumlah / maxJumlah) * 100, 100);
    return `
      <div>
        <div class="flex justify-between gap-3 mb-1">
          <span class="text-gray-700 font-medium truncate max-w-[170px]">${escapeHTML(user.nama)}</span>
          <span class="text-gray-400 text-xs whitespace-nowrap">${user.jumlah} transaksi</span>
        </div>
        <div class="flex justify-between text-[11px] text-gray-400 mb-1">
          <span>Saldo</span><span>${formatRupiah(user.saldo)}</span>
        </div>
        <div class="w-full bg-gray-100 rounded-full h-1.5">
          <div class="bg-emerald-500 h-1.5 rounded-full" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderAllTrx() {
  const body = $('allTrxBody');
  if (!body) return;

  const total = allTrxData.length;
  const totalPages = Math.ceil(total / adminTrxPerPage) || 1;
  adminTrxPage = Math.min(Math.max(adminTrxPage, 1), totalPages);
  const pageData = allTrxData.slice((adminTrxPage - 1) * adminTrxPerPage, adminTrxPage * adminTrxPerPage);

  if (!pageData.length) {
    body.innerHTML = '<tr><td colspan="4" class="px-6 py-6 text-center text-gray-400">Belum ada transaksi.</td></tr>';
  } else {
    body.innerHTML = pageData.map((item) => {
      const profile = allProfiles.find((p) => p.id === item.user_id);
      const namaUser = profile ? (profile.nama || profile.email) : '(tidak diketahui)';
      const warna = item.jenis === 'masuk' ? 'text-emerald-600' : 'text-rose-500';
      const simbol = item.jenis === 'masuk' ? '+' : '-';

      return `
        <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
          <td class="px-6 py-3 text-gray-400 whitespace-nowrap">${escapeHTML(formatTanggal(item.created_at))}</td>
          <td class="px-6 py-3 text-gray-600">${escapeHTML(namaUser)}</td>
          <td class="px-6 py-3 text-gray-700">${escapeHTML(item.kategori || '-')}</td>
          <td class="px-6 py-3 text-right font-semibold ${warna} whitespace-nowrap">${simbol} ${formatRupiah(item.nominal)}</td>
        </tr>`;
    }).join('');
  }

  renderAdminPagination(totalPages);
}

function renderAdminPagination(totalPages) {
  const pag = $('trxPagination');
  if (!pag) return;

  pag.innerHTML = '';
  if (totalPages <= 1) return;

  if (adminTrxPage > 1) {
    pag.innerHTML += `<button onclick="changeAdminTrxPage(${adminTrxPage - 1})" class="px-2.5 py-1 rounded-lg text-xs bg-gray-100 hover:bg-gray-200 text-gray-600">&laquo;</button>`;
  }

  let startPage = Math.max(1, adminTrxPage - 3);
  let endPage = Math.min(totalPages, startPage + 6);
  if (endPage - startPage < 6) startPage = Math.max(1, endPage - 6);

  for (let page = startPage; page <= endPage; page += 1) {
    pag.innerHTML += `<button onclick="changeAdminTrxPage(${page})"
      class="px-2.5 py-1 rounded-lg text-xs transition cursor-pointer ${page === adminTrxPage ? 'bg-emerald-600 text-white font-bold' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}">${page}</button>`;
  }

  if (adminTrxPage < totalPages) {
    pag.innerHTML += `<button onclick="changeAdminTrxPage(${adminTrxPage + 1})" class="px-2.5 py-1 rounded-lg text-xs bg-gray-100 hover:bg-gray-200 text-gray-600">&raquo;</button>`;
  }
}

function changeAdminTrxPage(page) {
  adminTrxPage = Number(page) || 1;
  renderAllTrx();
}

function renderAdminChart(trx) {
  const canvas = $('adminChart');
  if (!canvas) return;

  const dataBulanan = {};
  const sortedTrx = [...trx].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  sortedTrx.forEach((item) => {
    const tgl = new Date(item.created_at);
    if (Number.isNaN(tgl.getTime())) return;

    const label = tgl.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
    if (!dataBulanan[label]) dataBulanan[label] = { masuk: 0, keluar: 0 };
    if (item.jenis === 'masuk') dataBulanan[label].masuk += Number(item.nominal) || 0;
    if (item.jenis === 'keluar') dataBulanan[label].keluar += Number(item.nominal) || 0;
  });

  const labels = Object.keys(dataBulanan);
  const masukArr = labels.map((label) => dataBulanan[label].masuk);
  const keluarArr = labels.map((label) => dataBulanan[label].keluar);

  if (adminChart) adminChart.destroy();
  adminChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: masukArr, backgroundColor: '#059669', borderRadius: 5 },
        { label: 'Pengeluaran', data: keluarArr, backgroundColor: '#e11d48', borderRadius: 5 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 } } } },
      scales: {
        y: {
          ticks: {
            callback: (value) => `Rp ${(Number(value) / 1000000).toFixed(1)}jt`
          }
        }
      }
    }
  });
}

async function toggleRole(userId, roleSekarang) {
  if (!currentUser || currentProfile?.role !== 'admin') return;

  if (userId === currentUser.id && roleSekarang === 'admin') {
    return Swal.fire({
      icon: 'warning',
      title: 'Jangan demote akun sendiri',
      text: 'Kalau akun admin sendiri dijadikan user, kamu bisa kehilangan akses admin. Manusia memang suka mengunci diri dari rumah sendiri.',
      confirmButtonColor: '#059669'
    });
  }

  const roleBaru = roleSekarang === 'admin' ? 'user' : 'admin';
  const result = await Swal.fire({
    icon: 'question',
    title: `Ubah role ke ${roleBaru}?`,
    text: 'Perubahan ini langsung memengaruhi akses pengguna.',
    showCancelButton: true,
    confirmButtonText: 'Ya, ubah',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#059669',
    cancelButtonColor: '#9ca3af'
  });

  if (!result.isConfirmed) return;

  const { error } = await db
    .from('profiles')
    .update({ role: roleBaru })
    .eq('id', userId);

  if (error) return showError('Gagal mengubah role', error);

  await Swal.fire({
    icon: 'success',
    title: `Role diubah ke ${roleBaru}`,
    timer: 1200,
    showConfirmButton: false
  });

  await muatData(false);
}

async function initAdminDashboard() {
  const ok = await requireAuth({ adminOnly: true });
  if (!ok) return;

  if ($('adminNama')) $('adminNama').textContent = currentProfile?.nama || currentProfile?.email || currentUser.email;

  setupAdminRealtime();
  await muatData();
}


function detectPageFromPath() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('dashboard-admin')) return 'dashboard-admin';
  if (path.includes('dashboard')) return 'dashboard-user';
  return 'login';
}

// ============================================================
// INIT PAGE
// ============================================================
async function initApp() {
  const page = document.body.dataset.page || detectPageFromPath();

  try {
    if (page === 'login') await initLoginPage();
    if (page === 'dashboard-user') await initUserDashboard();
    if (page === 'dashboard-admin') await initAdminDashboard();
  } catch (error) {
    console.error(error);
    showError('Aplikasi bermasalah', error);
  }
}

// expose untuk inline onclick HTML
window.gantitab = gantitab;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.doLogout = doLogout;
window.setJenis = setJenis;
window.addTransaction = addTransaction;
window.updateUI = updateUI;
window.changeItemsPerPage = changeItemsPerPage;
window.changePage = changePage;
window.resetUserPageAndUpdate = resetUserPageAndUpdate;
window.ubahFilterTahun = ubahFilterTahun;
window.hapusTransaksi = hapusTransaksi;
window.exportToCSV = exportToCSV;
window.muatData = muatData;
window.toggleRole = toggleRole;
window.changeAdminTrxPage = changeAdminTrxPage;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
