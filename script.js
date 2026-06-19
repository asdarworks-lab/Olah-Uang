// ============================================================
// Olah Uang — Single Script Multi-User + Admin
// Netlify + Supabase
// ============================================================

const SUPABASE_URL = 'https://uezjncjapumyrkjxzslw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gMbWszjY1XIou5Cj4wDkjg_UlGiuOd5';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const APP_VERSION = '20260619-v50-ai-variasi-insight';
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
let filterTahunAktif = String(new Date().getFullYear());
let currentPage = 1;
let itemsPerPage = 10;
let pengeluaranBulanIni = {};
let filterRiwayatInitialized = false;
const DEFAULT_TARGET_TABUNGAN_BULANAN = 5000000;
let targetTabunganBulanan = DEFAULT_TARGET_TABUNGAN_BULANAN;
let profileEditEnabled = false;
let financeEditState = { keluar: false, masuk: false };
let activeAppView = 'beranda';
let quickJenisAktif = 'keluar';
const AI_INSIGHT_STYLE_VERSION = 'numbered-roast-v3-variasi';
let currentInsightSummary = null;
let currentInsightKey = '';
let currentStaticInsights = [];
let currentAiInsights = null;
let aiInsightLoading = false;
let aiInsightError = '';
let aiInsightErrorKey = '';
const autoAiInsightAttemptedKeys = new Set();

// Supabase REST API default hanya mengembalikan 1.000 baris per request.
// Untuk data besar, aplikasi mengambil data bertahap.
// Target praktis versi ini: sampai ±20.000 transaksi per user/admin.
const DATA_PAGE_SIZE = 1000;
const MAX_FETCH_ROWS = 25000;

let adminTrxPage = 1;
const adminTrxPerPage = 15;
let allProfiles = [];
let allTrxData = [];
let allRecoveryRequests = [];

// ============================================================
// DATA DEFAULT
// Catatan: versi berikut masih hardcoded. Tahap berikutnya bisa
// dipindahkan ke tabel budget per user.
// ============================================================
const DEFAULT_BUDGET_CONFIG = {
  'Belanja Bulanan': 1500000,
  'Tempat Tinggal': 0,
  'Listrik': 300000,
  'Internet & Pulsa': 400000,
  'Makan Luar': 200000,
  'Jajan': 150000,
  'Transportasi': 200000,
  'Bensin': 200000,
  'Kesehatan': 250000,
  'Donasi & Berbagi': 800000,
  'Cicilan / Paylater': 250000,
  'Belanja Online': 250000,
  'Hiburan & Pribadi': 150000,
  'Investasi': 0,
  'Rumah & Perabotan': 200000,
  'Operasional / Kantor': 150000,
  'Keluarga': 250000,
  'Darurat': 200000,
  'Lainnya': 0
};

const DEFAULT_INCOME_TARGET_CONFIG = {
  'Gaji Utama': 4000000,
  'Gaji Pasangan / Pemasukan Kedua': 4300000,
  'Sisa Sebelumnya': 0,
  'Penghasilan Tambahan': 0,
  'Lainnya': 0
};

let rencanaBudget = { ...DEFAULT_BUDGET_CONFIG };
let targetPemasukan = { ...DEFAULT_INCOME_TARGET_CONFIG };

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

function isValidEmailFormat(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function getRawErrorParts(error) {
  if (!error) return [];
  if (typeof error === 'string') return [error];

  return [
    error.message,
    error.error_description,
    error.description,
    error.details,
    error.hint,
    error.code
  ].filter(Boolean).map(String);
}

function translateErrorMessage(error) {
  const parts = getRawErrorParts(error);
  const rawText = parts.join(' | ');
  const text = rawText.toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (!parts.length) return 'Terjadi kesalahan tanpa pesan dari server.';

  const translations = [
    {
      match: () => text.includes('unable to validate email address') || (code === 'validation_failed' && text.includes('email')),
      message: 'Format email tidak valid. Periksa kembali alamat email, contoh: nama@email.com.'
    },
    {
      match: () => text.includes('invalid login credentials'),
      message: 'Email atau password salah. Periksa kembali data login kamu.'
    },
    {
      match: () => text.includes('email not confirmed') || text.includes('email confirmation'),
      message: 'Email belum diverifikasi. Silakan cek kotak masuk email kamu terlebih dahulu.'
    },
    {
      match: () => text.includes('user already registered') || text.includes('already registered') || text.includes('already exists'),
      message: 'Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.'
    },
    {
      match: () => text.includes('password should be at least') || text.includes('weak password'),
      message: 'Password terlalu lemah. Gunakan minimal 6 karakter atau kombinasi yang lebih aman.'
    },
    {
      match: () => text.includes('signup is disabled') || text.includes('signups not allowed'),
      message: 'Pendaftaran akun sedang ditutup. Silakan hubungi admin untuk dibuatkan akun.'
    },
    {
      match: () => text.includes('rate limit') || text.includes('too many requests'),
      message: 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.'
    },
    {
      match: () => text.includes('failed to fetch') || text.includes('networkerror') || text.includes('network request failed'),
      message: 'Gagal terhubung ke server. Periksa koneksi internet kamu, lalu coba lagi.'
    },
    {
      match: () => text.includes('jwt') && text.includes('expired'),
      message: 'Sesi login sudah berakhir. Silakan masuk kembali.'
    },
    {
      match: () => text.includes('permission denied') || text.includes('row-level security') || text.includes('violates row-level security'),
      message: 'Akses ditolak. Akun ini tidak memiliki izin untuk melakukan tindakan tersebut.'
    },
    {
      match: () => text.includes('duplicate key') || code === '23505',
      message: 'Data yang sama sudah ada. Gunakan data lain atau periksa kembali input kamu.'
    },
    {
      match: () => text.includes('invalid input') || code === '22p02',
      message: 'Data yang dimasukkan belum sesuai format. Periksa kembali isian kamu.'
    }
  ];

  const matched = translations.find((item) => item.match());
  if (matched) return matched.message;

  // Jangan tampilkan pesan mentah dari server ke user karena sering berbahasa Inggris.
  // Detail teknis tetap dicatat di console lewat showError.
  return 'Terjadi kesalahan. Periksa kembali data yang dimasukkan, lalu coba lagi.';
}

function getErrorMessage(error) {
  return translateErrorMessage(error);
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


function normalizeMoneyConfig(source, fallback) {
  const normalizeAmount = (nominal) => {
    const angka = Number(nominal);
    return Number.isFinite(angka) && angka > 0 ? Math.round(angka) : 0;
  };

  const addEntry = (acc, kategori, nominal) => {
    const nama = String(kategori || '').trim();
    if (!nama || Object.prototype.hasOwnProperty.call(acc, nama)) return acc;
    acc[nama] = normalizeAmount(nominal);
    return acc;
  };

  // Format baru: array agar urutan kategori tetap stabil saat disimpan ke jsonb Supabase.
  // Format lama object tetap didukung supaya data user lama tidak rusak.
  if (Array.isArray(source) && source.length) {
    return source.reduce((acc, item) => {
      if (Array.isArray(item)) return addEntry(acc, item[0], item[1]);
      if (item && typeof item === 'object') {
        return addEntry(
          acc,
          item.kategori ?? item.nama ?? item.name ?? item.label,
          item.nominal ?? item.amount ?? item.target ?? item.value
        );
      }
      return acc;
    }, {});
  }

  if (source && typeof source === 'object' && Object.keys(source).length) {
    const result = {};
    const fallbackKeys = Object.keys(fallback || {});
    const sourceKeys = Object.keys(source);

    // Kategori default diposisikan sesuai urutan default agar tampilan tidak terasa acak
    // ketika data lama masih tersimpan sebagai object jsonb.
    fallbackKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(source, key)) addEntry(result, key, source[key]);
    });

    sourceKeys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(result, key)) addEntry(result, key, source[key]);
    });

    return result;
  }

  return Object.entries(fallback || {}).reduce((acc, [kategori, nominal]) => addEntry(acc, kategori, nominal), {});
}

function applyFinanceSettingsFromProfile(profile) {
  rencanaBudget = normalizeMoneyConfig(profile?.budget_config, DEFAULT_BUDGET_CONFIG);
  targetPemasukan = normalizeMoneyConfig(profile?.income_target_config, DEFAULT_INCOME_TARGET_CONFIG);

  const savedTarget = Number(profile?.target_tabungan_bulanan);
  targetTabunganBulanan = Number.isFinite(savedTarget) && savedTarget >= 0
    ? Math.round(savedTarget)
    : DEFAULT_TARGET_TABUNGAN_BULANAN;

  updateTargetSavingsLabel();
}

function updateTargetSavingsLabel() {
  const label = $('targetSavingsLabel');
  if (label) label.textContent = `Target: ${formatRupiah(targetTabunganBulanan)} / bulan`;
}

function getOpenEditSections() {
  const sections = [];
  if (profileEditEnabled) sections.push('profile');
  if (financeEditState.keluar) sections.push('keluar');
  if (financeEditState.masuk) sections.push('masuk');
  return sections;
}

function hasUnsavedSettings() {
  return getOpenEditSections().length > 0;
}

function discardOpenSettingsEdits() {
  if (profileEditEnabled) toggleProfileEdit(false, { silent: false });
  if (financeEditState.keluar) toggleFinanceEdit('keluar', false, { silent: true });
  if (financeEditState.masuk) toggleFinanceEdit('masuk', false, { silent: true });
}

async function saveOpenSettingsEdits() {
  if (profileEditEnabled) await saveProfileSettings({ silentSuccess: true });
  if (financeEditState.keluar) await saveFinanceSettings('keluar', { silentSuccess: true });
  if (financeEditState.masuk) await saveFinanceSettings('masuk', { silentSuccess: true });
}

async function confirmUnsavedSettingsBeforeContinue() {
  if (!hasUnsavedSettings()) return true;

  const result = await Swal.fire({
    icon: 'warning',
    title: 'Data belum disimpan',
    text: 'Simpan data terlebih dahulu atau batalkan perubahan sebelum melakukan hal lain.',
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: 'Simpan Data',
    denyButtonText: 'Batalkan Perubahan',
    cancelButtonText: 'Tetap Edit',
    confirmButtonColor: '#059669',
    denyButtonColor: '#e11d48',
    cancelButtonColor: '#9ca3af'
  });

  if (result.isConfirmed) {
    await saveOpenSettingsEdits();
    return !hasUnsavedSettings();
  }

  if (result.isDenied) {
    discardOpenSettingsEdits();
    return true;
  }

  return false;
}


function animateNavIndicator(container, indicator, targetX, targetY, targetW, targetH) {
  const hasPosition = Number.isFinite(Number(indicator.dataset.x)) && Number.isFinite(Number(indicator.dataset.w));

  if (!container.classList.contains('ready') || !hasPosition) {
    indicator.style.setProperty('--nav-travel-duration', '520ms');
    indicator.style.width = `${targetW}px`;
    indicator.style.height = `${targetH}px`;
    indicator.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    indicator.dataset.x = String(targetX);
    indicator.dataset.y = String(targetY);
    indicator.dataset.w = String(targetW);
    indicator.dataset.h = String(targetH);
    container.classList.add('ready');
    return;
  }

  const startX = Number(indicator.dataset.x);
  const startY = Number(indicator.dataset.y || targetY);
  const startW = Number(indicator.dataset.w);
  const startH = Number(indicator.dataset.h || targetH);
  const distance = Math.abs(targetX - startX) + (Math.abs(targetY - startY) * 0.6);

  if (distance < 4 && Math.abs(targetW - startW) < 4) {
    indicator.style.width = `${targetW}px`;
    indicator.style.height = `${targetH}px`;
    indicator.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    indicator.dataset.x = String(targetX);
    indicator.dataset.y = String(targetY);
    indicator.dataset.w = String(targetW);
    indicator.dataset.h = String(targetH);
    return;
  }

  const stretchLeft = Math.min(startX, targetX);
  const stretchTop = Math.min(startY, targetY);
  const stretchRight = Math.max(startX + startW, targetX + targetW);
  const stretchBottom = Math.max(startY + startH, targetY + targetH);
  const travelMs = Math.min(940, Math.max(560, Math.round(distance * 2.1)));
  const shrinkMs = Math.min(430, Math.max(300, Math.round(travelMs * 0.45)));

  clearTimeout(indicator._navShrinkTimer);
  indicator.style.setProperty('--nav-travel-duration', `${travelMs}ms`);
  indicator.style.width = `${stretchRight - stretchLeft}px`;
  indicator.style.height = `${stretchBottom - stretchTop}px`;
  indicator.style.transform = `translate3d(${stretchLeft}px, ${stretchTop}px, 0)`;

  indicator._navShrinkTimer = setTimeout(() => {
    indicator.style.setProperty('--nav-travel-duration', `${shrinkMs}ms`);
    indicator.style.width = `${targetW}px`;
    indicator.style.height = `${targetH}px`;
    indicator.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
  }, Math.round(travelMs * 0.48));

  indicator.dataset.x = String(targetX);
  indicator.dataset.y = String(targetY);
  indicator.dataset.w = String(targetW);
  indicator.dataset.h = String(targetH);
}

function updateMovingNavIndicators(targetView = activeAppView) {
  const desktopNav = document.getElementById('desktopNav');
  const desktopIndicator = document.getElementById('desktopNavIndicator');
  const desktopActive = desktopNav?.querySelector(`[data-nav="${targetView}"]`);

  if (desktopNav && desktopIndicator && desktopActive) {
    const navRect = desktopNav.getBoundingClientRect();
    const itemRect = desktopActive.getBoundingClientRect();
    animateNavIndicator(
      desktopNav,
      desktopIndicator,
      itemRect.left - navRect.left,
      itemRect.top - navRect.top,
      itemRect.width,
      itemRect.height
    );
  }

  const mobileShell = document.getElementById('mobileNavShell');
  const mobileIndicator = document.getElementById('mobileNavIndicator');
  const mobileActive = mobileShell?.querySelector(`[data-nav="${targetView}"]`);

  if (mobileShell && mobileIndicator && mobileActive) {
    const shellRect = mobileShell.getBoundingClientRect();
    const itemRect = mobileActive.getBoundingClientRect();
    const indicatorSize = targetView === 'catat' ? 52 : 48;
    const x = itemRect.left - shellRect.left + (itemRect.width / 2) - (indicatorSize / 2);
    const y = itemRect.top - shellRect.top + (itemRect.height / 2) - (indicatorSize / 2);

    animateNavIndicator(mobileShell, mobileIndicator, x, y, indicatorSize, indicatorSize);
    mobileShell.dataset.active = targetView;
  }
}

window.addEventListener('resize', () => updateMovingNavIndicators(activeAppView));

async function showAppView(view = 'beranda') {
  const validViews = ['beranda', 'riwayat', 'catat', 'analisis', 'setting'];
  const targetView = validViews.includes(view) ? view : 'beranda';

  if (targetView !== activeAppView) {
    const canContinue = await confirmUnsavedSettingsBeforeContinue();
    if (!canContinue) return;
  }

  const previousView = activeAppView;

  document.querySelectorAll('.app-view').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.view !== targetView);
  });

  document.querySelectorAll('[data-nav]').forEach((item) => {
    const isActive = item.dataset.nav === targetView;
    item.classList.toggle('active', isActive);
    if (isActive && targetView !== previousView) {
      item.classList.add('nav-changing');
      setTimeout(() => item.classList.remove('nav-changing'), 560);
    }
  });

  activeAppView = targetView;
  requestAnimationFrame(() => updateMovingNavIndicators(targetView));
  localStorage.setItem('olahUangActiveView', targetView);

  if (targetView === 'analisis' && grafikKeuangan) {
    setTimeout(() => grafikKeuangan?.resize?.(), 80);
  }
}

window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedSettings()) return;
  event.preventDefault();
  event.returnValue = '';
});

function fillProfileSettings() {
  if (!$('profileSettingsPanel')) return;
  if ($('profileNama')) $('profileNama').value = currentProfile?.nama || '';
  if ($('profileEmail')) $('profileEmail').value = currentProfile?.email || currentUser?.email || '';
  if ($('profilePhone')) $('profilePhone').value = currentProfile?.nomor_hp || '';
  if ($('profilePassword')) $('profilePassword').value = '';
  if ($('profilePasswordConfirm')) $('profilePasswordConfirm').value = '';
  toggleProfileEdit(false, { silent: true });
}

async function toggleProfileEdit(enabled, options = {}) {
  if (enabled && !profileEditEnabled && (financeEditState.keluar || financeEditState.masuk) && !options.skipGuard) {
    const canContinue = await confirmUnsavedSettingsBeforeContinue();
    if (!canContinue) return;
  }

  profileEditEnabled = Boolean(enabled);
  ['profileNama', 'profilePhone', 'profilePassword', 'profilePasswordConfirm'].forEach((id) => {
    const input = $(id);
    if (input) input.disabled = !profileEditEnabled;
  });
  if ($('profileEmail')) $('profileEmail').disabled = true;
  $('profileEditBtn')?.classList.toggle('hidden', profileEditEnabled);
  $('profileCancelBtn')?.classList.toggle('hidden', !profileEditEnabled);
  $('profileSaveBtn')?.classList.toggle('hidden', !profileEditEnabled);
  $('profileSettingsPanel')?.classList.toggle('is-editing', profileEditEnabled);

  if (!enabled && !options.silent) fillProfileSettings();
}

async function saveProfileSettings(options = {}) {
  if (!currentUser || !currentProfile) return;

  const nama = $('profileNama')?.value.trim() || 'Pengguna';
  const nomorHp = $('profilePhone')?.value.trim() || null;
  const password = $('profilePassword')?.value || '';
  const passwordConfirm = $('profilePasswordConfirm')?.value || '';

  if (password || passwordConfirm) {
    if (password.length < 6) return showWarning('Password terlalu pendek', 'Minimal 6 karakter. Tolong jangan bikin password yang bahkan kucing bisa tebak.');
    if (password !== passwordConfirm) return showWarning('Password tidak sama', 'Ulangi password baru harus sama. Teknologi masih belum bisa berdamai dengan typo.');
  }

  const { data: profileData, error: profileError } = await db
    .from('profiles')
    .update({ nama, nomor_hp: nomorHp })
    .eq('id', currentUser.id)
    .select('*')
    .single();

  if (profileError) return showError('Gagal menyimpan profil', profileError);

  if (password) {
    const { error: passError } = await db.auth.updateUser({ password });
    if (passError) return showError('Profil tersimpan, password gagal diganti', passError);
  }

  currentProfile = profileData;
  if ($('userNama')) $('userNama').textContent = currentProfile?.nama || 'Pengguna';
  toggleProfileEdit(false, { silent: true });
  fillProfileSettings();

  if (options.silentSuccess) return true;

  return Swal.fire({
    icon: 'success',
    title: 'Profil tersimpan',
    text: password ? 'Profil dan password berhasil diperbarui.' : 'Profil berhasil diperbarui.',
    timer: 1300,
    showConfirmButton: false
  });
}

function getSettingsListFromUI(type) {
  const rows = document.querySelectorAll(`[data-setting-type="${type}"]`);
  const result = [];
  const usedNames = new Set();

  rows.forEach((row) => {
    const name = row.querySelector('[data-field="name"]')?.value.trim();
    const amount = Number(row.querySelector('[data-field="amount"]')?.value || 0);
    const lookup = name?.toLowerCase();
    if (!name || usedNames.has(lookup)) return;
    usedNames.add(lookup);
    result.push({
      kategori: name,
      nominal: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0
    });
  });

  return result;
}

function mapFromSettingsList(list) {
  return list.reduce((acc, item) => {
    acc[item.kategori] = item.nominal;
    return acc;
  }, {});
}

function getSettingsMapFromUI(type) {
  return mapFromSettingsList(getSettingsListFromUI(type));
}

function renderSettingsRows(containerId, map, type) {
  const container = $(containerId);
  if (!container) return;

  const editable = Boolean(financeEditState[type]);
  const entries = Object.entries(map || {});

  if (!entries.length) {
    container.innerHTML = `
      <div class="rounded-2xl bg-gray-50 border border-dashed border-gray-200 p-4 text-center">
        <p class="font-bold text-gray-700">Belum ada kategori</p>
        <p class="text-xs text-gray-400 mt-1">Klik Edit untuk menambahkan kategori.</p>
      </div>`;
    return;
  }

  container.innerHTML = entries.map(([kategori, nominal]) => `
    <div data-setting-type="${type}" class="setting-row rounded-2xl bg-gray-50 border border-gray-100 p-3">
      <input data-field="name" type="text" value="${escapeHTML(kategori)}" ${editable ? '' : 'disabled'} class="min-w-0 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm" />
      <input data-field="amount" type="number" min="0" inputmode="numeric" value="${Number(nominal) || 0}" ${editable ? '' : 'disabled'} class="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-right" />
      <button type="button" onclick="removeFinanceCategoryRow(this)" ${editable ? '' : 'disabled'} class="h-10 rounded-xl bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title="Hapus kategori" aria-label="Hapus kategori">
        <svg class="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3m-9 0h12"/></svg>
      </button>
    </div>`).join('');
}

function renderFinanceSettings() {
  if (!$('financeSettingsPanel')) return;
  if ($('settingTargetSavings')) {
    $('settingTargetSavings').value = targetTabunganBulanan;
    $('settingTargetSavings').disabled = !financeEditState.keluar;
  }
  renderSettingsRows('budgetSettingList', rencanaBudget, 'keluar');
  renderSettingsRows('incomeSettingList', targetPemasukan, 'masuk');
  updateFinanceEditUI('keluar');
  updateFinanceEditUI('masuk');
}

function updateFinanceEditUI(type) {
  const isIncome = type === 'masuk';
  const editable = Boolean(financeEditState[type]);
  const prefix = isIncome ? 'income' : 'expense';
  $(prefix + 'EditBtn')?.classList.toggle('hidden', editable);
  $(prefix + 'CancelBtn')?.classList.toggle('hidden', !editable);
  $(prefix + 'SaveBtn')?.classList.toggle('hidden', !editable);
  $(prefix + 'AddRow')?.classList.toggle('hidden', !editable);
  $(isIncome ? 'incomeSettingsPanel' : 'expenseSettingsPanel')?.classList.toggle('is-editing', editable);
  if (!isIncome && $('settingTargetSavings')) $('settingTargetSavings').disabled = !editable;
}

async function toggleFinanceEdit(type, enabled, options = {}) {
  if (enabled && !financeEditState[type] && hasUnsavedSettings() && !options.skipGuard) {
    const canContinue = await confirmUnsavedSettingsBeforeContinue();
    if (!canContinue) return;
  }

  financeEditState[type] = Boolean(enabled);
  if (!enabled) {
    if (type === 'keluar') {
      if ($('newExpenseCategoryName')) $('newExpenseCategoryName').value = '';
      if ($('newExpenseCategoryAmount')) $('newExpenseCategoryAmount').value = '';
    } else {
      if ($('newIncomeCategoryName')) $('newIncomeCategoryName').value = '';
      if ($('newIncomeCategoryAmount')) $('newIncomeCategoryAmount').value = '';
    }
  }
  renderFinanceSettings();
}

function removeFinanceCategoryRow(button) {
  const row = button?.closest('[data-setting-type]');
  const type = row?.dataset?.settingType;
  if (!financeEditState[type]) return;
  row?.remove();
}

function addFinanceCategory(type) {
  if (!financeEditState[type]) return;
  const isIncome = type === 'masuk';
  const nameInput = $(isIncome ? 'newIncomeCategoryName' : 'newExpenseCategoryName');
  const amountInput = $(isIncome ? 'newIncomeCategoryAmount' : 'newExpenseCategoryAmount');
  const currentMap = getSettingsMapFromUI(type);

  const name = nameInput?.value.trim();
  const amount = Number(amountInput?.value || 0);

  if (!name) return showWarning('Nama kategori kosong', 'Isi nama kategori dulu. Kategori tanpa nama itu mirip nota tanpa tanggal: bikin curiga.');
  if (Object.keys(currentMap).some((item) => item.toLowerCase() === name.toLowerCase())) return showWarning('Kategori sudah ada', 'Nama kategori ini sudah dipakai. Gunakan nama lain agar laporan tidak ambigu.');

  currentMap[name] = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;

  if (isIncome) {
    targetPemasukan = currentMap;
    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';
  } else {
    rencanaBudget = currentMap;
    if (nameInput) nameInput.value = '';
    if (amountInput) amountInput.value = '';
  }

  renderFinanceSettings();
}

async function saveFinanceSettings(type = 'all', options = {}) {
  if (!currentUser || !currentProfile) return;

  const payload = {};
  if (type === 'keluar' || type === 'all') {
    payload.budget_config = getSettingsListFromUI('keluar');
    const targetValue = Number($('settingTargetSavings')?.value || 0);
    payload.target_tabungan_bulanan = Number.isFinite(targetValue) && targetValue >= 0 ? Math.round(targetValue) : 0;
  }
  if (type === 'masuk' || type === 'all') {
    payload.income_target_config = getSettingsListFromUI('masuk');
  }

  const { data, error } = await db
    .from('profiles')
    .update(payload)
    .eq('id', currentUser.id)
    .select('*')
    .single();

  if (error) return showError('Gagal menyimpan pengaturan', error);

  currentProfile = data;
  applyFinanceSettingsFromProfile(currentProfile);
  if (type === 'keluar' || type === 'all') financeEditState.keluar = false;
  if (type === 'masuk' || type === 'all') financeEditState.masuk = false;
  renderFinanceSettings();
  setJenis(jenisAktif);
  await updateUI();

  if (options.silentSuccess) return true;

  return Swal.fire({
    icon: 'success',
    title: 'Pengaturan tersimpan',
    text: 'Kategori dan budget berhasil diperbarui.',
    timer: 1300,
    showConfirmButton: false
  });
}


async function fetchAllTransaksi({ userId = null, ascending = true, maxRows = MAX_FETCH_ROWS } = {}) {
  let allRows = [];
  let from = 0;

  while (from < maxRows) {
    const to = Math.min(from + DATA_PAGE_SIZE - 1, maxRows - 1);

    let query = db
      .from('transaksi')
      .select('*')
      .order('created_at', { ascending })
      .range(from, to);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = data || [];
    allRows = allRows.concat(batch);

    if (batch.length < DATA_PAGE_SIZE) break;
    from += DATA_PAGE_SIZE;
  }

  return allRows;
}

async function fetchAllProfiles({ maxRows = MAX_FETCH_ROWS } = {}) {
  let allRows = [];
  let from = 0;

  while (from < maxRows) {
    const to = Math.min(from + DATA_PAGE_SIZE - 1, maxRows - 1);

    const { data, error } = await db
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = data || [];
    allRows = allRows.concat(batch);

    if (batch.length < DATA_PAGE_SIZE) break;
    from += DATA_PAGE_SIZE;
  }

  return allRows;
}

async function fetchAllAccountRecoveryRequests({ maxRows = 1000 } = {}) {
  let allRows = [];
  let from = 0;

  while (from < maxRows) {
    const to = Math.min(from + DATA_PAGE_SIZE - 1, maxRows - 1);

    const { data, error } = await db
      .from('account_recovery_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = data || [];
    allRows = allRows.concat(batch);

    if (batch.length < DATA_PAGE_SIZE) break;
    from += DATA_PAGE_SIZE;
  }

  return allRows;
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function applyDarkMode(enabled) {
  const root = document.documentElement;
  const body = document.body;
  root.classList.toggle('dark', enabled);
  body?.classList.toggle('dark', enabled);
  localStorage.setItem('olahUangDarkMode', enabled ? '1' : '0');
  const toggle = $('darkModeToggle');
  if (toggle) toggle.textContent = enabled ? '☀️' : '🌕';

  requestAnimationFrame(() => updateMovingNavIndicators(activeAppView));

  // Redraw chart agar warna grid/label ikut mode terbaru. Ya, chart juga butuh diajak refresh.
  if (currentUser && $('monthlyChart')) updateUI();
}

function initDarkMode() {
  const saved = localStorage.getItem('olahUangDarkMode') === '1';
  applyDarkMode(saved);
}

function toggleDarkMode() {
  const enabled = !document.documentElement.classList.contains('dark');
  applyDarkMode(enabled);
}

function isDarkMode() {
  return document.documentElement.classList.contains('dark');
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

  if (!isValidEmailFormat(email)) {
    return showWarning('Email tidak valid', 'Masukkan email dengan format yang benar, contoh: nama@email.com.');
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

  if (!isValidEmailFormat(email)) {
    return showWarning('Email tidak valid', 'Masukkan email dengan format yang benar, contoh: nama@email.com.');
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
  const canContinue = await confirmUnsavedSettingsBeforeContinue();
  if (!canContinue) return;

  const result = await Swal.fire({
    icon: 'question',
    title: 'Keluar dari akun?',
    text: 'Pastikan semua data sudah tersimpan sebelum keluar.',
    showCancelButton: true,
    confirmButtonText: 'Ya, keluar',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#9ca3af'
  });

  if (!result.isConfirmed) return;

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

function setDefaultFilterBulanBerjalan() {
  if (filterRiwayatInitialized) return;

  const sekarang = new Date();
  const bulanSekarang = String(sekarang.getMonth());
  const tahunSekarang = String(sekarang.getFullYear());

  const selectBulan = $('filterBulan');
  const selectTahun = $('filterTahunRiwayat');

  if (selectBulan) selectBulan.value = bulanSekarang;

  // Tahun biasanya baru diisi setelah data transaksi dibaca.
  // Jadi simpan dulu sebagai default sementara.
  if (selectTahun) selectTahun.setAttribute('data-default-year', tahunSekarang);

  filterRiwayatInitialized = true;
}

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
  const selectedYear = $('filterTahunChart')?.value || String(new Date().getFullYear());
  filterTahunAktif = selectedYear;

  // Sinkronkan filter tahun grafik dengan filter tahun riwayat.
  const riwayatYear = $('filterTahunRiwayat');
  if (riwayatYear && riwayatYear.value !== selectedYear) {
    riwayatYear.value = selectedYear;
  }

  currentPage = 1;
  updateUI();
}

function syncYearFilterFromRiwayat() {
  const selectedYear = $('filterTahunRiwayat')?.value || String(new Date().getFullYear());
  filterTahunAktif = selectedYear;

  const chartYear = $('filterTahunChart');
  if (chartYear && chartYear.value !== selectedYear) {
    chartYear.value = selectedYear;
  }

  currentPage = 1;
  updateUI();
}

async function saveTransactionRecord({ jenis, kategori, nominal }) {
  if (!currentUser) return false;

  if (!kategori) {
    await Swal.fire({
      icon: 'warning',
      title: 'Kategori belum dipilih',
      text: 'Pilih kategori transaksi dulu.',
      confirmButtonColor: '#111827'
    });
    return false;
  }

  if (!Number.isFinite(nominal) || nominal <= 0) {
    await Swal.fire({
      icon: 'warning',
      title: 'Nominal tidak valid',
      text: 'Masukkan nominal angka yang benar.',
      confirmButtonColor: '#111827'
    });
    return false;
  }

  const { error } = await db.from('transaksi').insert({
    jenis,
    kategori,
    nominal: Math.round(nominal),
    user_id: currentUser.id
  });

  if (error) {
    await showError('Gagal simpan', error);
    return false;
  }

  // Update UI dulu supaya hitungan budget periode aktif sudah memasukkan transaksi terbaru.
  await updateUI();

  const limitBudget = Number(rencanaBudget[kategori] || 0);
  const totalTerpakaiPeriodeAktif = Number(pengeluaranBulanIni[kategori.trim()] || 0);

  if (jenis === 'keluar' && limitBudget > 0) {
    const percentUsed = Math.round((totalTerpakaiPeriodeAktif / limitBudget) * 100);
    const sisaBudget = Math.max(limitBudget - totalTerpakaiPeriodeAktif, 0);
    const lebihBudget = Math.max(totalTerpakaiPeriodeAktif - limitBudget, 0);

    if (totalTerpakaiPeriodeAktif > limitBudget) {
      await Swal.fire({
        title: 'Over Budget!',
        html:
          `Pengeluaran untuk <b>${escapeHTML(kategori)}</b> sudah melewati budget periode ini.<br><br>` +
          `Budget: <b>${formatRupiah(limitBudget)}</b><br>` +
          `Total Terpakai: <b class="text-rose-600">${formatRupiah(totalTerpakaiPeriodeAktif)}</b><br>` +
          `Lebih: <b class="text-rose-600">${formatRupiah(lebihBudget)}</b>`,
        icon: 'warning',
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'Oke, Saya Mengerti'
      });
    } else if (percentUsed >= 80) {
      await Swal.fire({
        title: 'Budget Hampir Habis',
        html:
          `Kategori <b>${escapeHTML(kategori)}</b> sudah terpakai ` +
          `<b>${percentUsed}%</b> dari budget.<br><br>` +
          `Sisa: <b>${formatRupiah(sisaBudget)}</b>`,
        icon: 'info',
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'Oke, saya mengerti'
      });
    } else {
      await Swal.fire({
        title: 'Pantau Budget Kamu!',
        html:
          `Kategori <b>${escapeHTML(kategori)}</b> sudah terpakai ` +
          `<b>${percentUsed}%</b> dari budget.<br><br>` +
          `Sisa: <b>${formatRupiah(sisaBudget)}</b>`,
        icon: 'info',
        confirmButtonColor: '#059669',
        confirmButtonText: 'Oke, saya mengerti'
      });
    }
  }

  await Swal.fire({
    title: 'Berhasil!',
    text: 'Data transaksi tersimpan.',
    icon: 'success',
    timer: 1200,
    showConfirmButton: false
  });

  return true;
}

async function addTransaction() {
  const kategori = $('kategori')?.value;
  const nominal = Number($('amount')?.value);
  const saved = await saveTransactionRecord({ jenis: jenisAktif, kategori, nominal });
  if (saved && $('amount')) $('amount').value = '';
  return saved;
}

function setQuickJenis(jenis) {
  quickJenisAktif = jenis === 'masuk' ? 'masuk' : 'keluar';

  const btnMasuk = $('quickBtnMasuk');
  const btnKeluar = $('quickBtnKeluar');
  const selectKategori = $('quickKategori');
  if (!btnMasuk || !btnKeluar || !selectKategori) return;

  if (quickJenisAktif === 'masuk') {
    btnMasuk.className = 'w-1/2 py-2.5 text-sm font-bold rounded-xl bg-emerald-600 text-white shadow-md transition cursor-pointer';
    btnKeluar.className = 'w-1/2 py-2.5 text-sm font-bold rounded-xl text-gray-500 hover:bg-gray-200 transition cursor-pointer';
    selectKategori.innerHTML = Object.keys(targetPemasukan)
      .map((k) => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`)
      .join('');
  } else {
    btnKeluar.className = 'w-1/2 py-2.5 text-sm font-bold rounded-xl bg-rose-600 text-white shadow-md transition cursor-pointer';
    btnMasuk.className = 'w-1/2 py-2.5 text-sm font-bold rounded-xl text-gray-500 hover:bg-gray-200 transition cursor-pointer';
    selectKategori.innerHTML = Object.keys(rencanaBudget)
      .map((k) => `<option value="${escapeHTML(k)}">${escapeHTML(k)}</option>`)
      .join('');
  }
}

function handleCatatSekarang() {
  if (window.matchMedia('(min-width: 768px)').matches) {
    openCatatModal();
    return;
  }
  showAppView('catat');
}

function openCatatModal() {
  const modal = $('quickCatatModal');
  if (!modal) return showAppView('catat');
  modal.classList.remove('hidden');
  setQuickJenis(jenisAktif || 'keluar');
  setTimeout(() => $('quickAmount')?.focus(), 80);
}

function closeCatatModal() {
  const modal = $('quickCatatModal');
  if (!modal) return;
  modal.classList.add('hidden');
  if ($('quickAmount')) $('quickAmount').value = '';
}

async function submitQuickTransaction() {
  const kategori = $('quickKategori')?.value;
  const nominal = Number($('quickAmount')?.value);
  const saved = await saveTransactionRecord({ jenis: quickJenisAktif, kategori, nominal });
  if (saved) closeCatatModal();
  return saved;
}

async function fetchUserTransactions(options = {}) {
  if (!currentUser?.id) return [];

  const { ascending = true } = options;
  return fetchAllTransaksi({
    userId: currentUser.id,
    ascending,
    maxRows: MAX_FETCH_ROWS
  });
}

function fillYearSelects(daftarTahun) {
  const selectTahunChart = $('filterTahunChart');
  const selectTahunRiwayat = $('filterTahunRiwayat');
  if (!selectTahunChart || !selectTahunRiwayat) return;

  const tahunSekarang = String(new Date().getFullYear());
  daftarTahun.add(tahunSekarang);

  const defaultYear = selectTahunRiwayat.getAttribute('data-default-year');
  const requestedYear =
    defaultYear ||
    selectTahunRiwayat.value ||
    filterTahunAktif ||
    tahunSekarang;

  const years = Array.from(daftarTahun).sort((a, b) => Number(b) - Number(a));
  const optionsHTML = ['<option value="Semua">Semua Tahun</option>']
    .concat(years.map((year) => `<option value="${escapeHTML(year)}">${escapeHTML(year)}</option>`))
    .join('');

  selectTahunChart.innerHTML = optionsHTML;
  selectTahunRiwayat.innerHTML = optionsHTML;

  const finalYear = requestedYear === 'Semua' || years.includes(requestedYear)
    ? requestedYear
    : tahunSekarang;

  // Tahun riwayat dan tahun grafik selalu sama.
  selectTahunRiwayat.value = finalYear;
  selectTahunChart.value = finalYear;
  filterTahunAktif = finalYear;

  // Setelah tahun default dipakai sekali, jangan paksa lagi pilihan user berikutnya.
  selectTahunRiwayat.removeAttribute('data-default-year');
}

function renderBudgetList(pengeluaranTerpakai, namaPeriodeRingkasan) {
  const budgetList = $('budgetList');
  if (!budgetList) return;

  budgetList.innerHTML = `<p class="text-xs text-gray-400 mb-3">Periode: ${escapeHTML(namaPeriodeRingkasan)}</p>`;

  const items = Object.entries(rencanaBudget)
    .map(([kategori, target]) => {
      const terpakai = Number(pengeluaranTerpakai[kategori] || 0);
      const safeTarget = Number(target || 0);
      const rawPercent = safeTarget > 0 ? (terpakai / safeTarget) * 100 : (terpakai > 0 ? 100 : 0);
      return { kategori, target: safeTarget, terpakai, rawPercent, shownPercent: Math.min(Math.max(rawPercent, 0), 100) };
    })
    .sort((a, b) => b.terpakai - a.terpakai);

  if (!items.some((item) => item.terpakai > 0)) {
    budgetList.innerHTML += `
      <div class="rounded-2xl bg-gray-50 border border-dashed border-gray-200 p-5 text-center">
        <p class="text-3xl mb-2">🧾</p>
        <p class="font-bold text-gray-700">Belum ada pengeluaran periode ini</p>
        <p class="text-sm text-gray-400 mt-1">Catat pengeluaran pertama agar progress budget mulai berjalan.</p>
      </div>`;
    return;
  }

  items.forEach(({ kategori, target, terpakai, rawPercent, shownPercent }) => {
    const sisa = Math.max(target - terpakai, 0);
    const colorClass = rawPercent >= 100 ? 'bg-rose-600' : (rawPercent >= 80 ? 'bg-amber-400' : 'bg-emerald-500');
    const badgeClass = rawPercent >= 100 ? 'bg-rose-100 text-rose-700' : (rawPercent >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700');

    budgetList.innerHTML += `
      <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div class="flex justify-between items-start gap-3 mb-2">
          <div>
            <p class="font-extrabold text-gray-800">${escapeHTML(kategori)}</p>
            <p class="text-xs text-gray-400">Sisa ${target > 0 ? formatRupiah(sisa) : 'tanpa target'}</p>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-extrabold ${badgeClass}">${Math.round(rawPercent)}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div class="${colorClass} h-3 rounded-full transition-all" style="width:${shownPercent}%"></div>
        </div>
        <div class="flex justify-between text-xs text-gray-500 mt-2">
          <span>${formatRupiah(terpakai)}</span>
          <span>${target > 0 ? formatRupiah(target) : 'Tidak dibatasi'}</span>
        </div>
      </div>`;
  });
}

function renderIncomeList(pemasukanTerkumpul, namaPeriodeRingkasan) {
  const incomeList = $('incomeList');
  if (!incomeList) return;

  incomeList.innerHTML = `<p class="text-xs text-gray-400 mb-3">Periode: ${escapeHTML(namaPeriodeRingkasan)}</p>`;

  const items = Object.entries(targetPemasukan).map(([kategori, target]) => {
    const terkumpul = Number(pemasukanTerkumpul[kategori] || 0);
    const safeTarget = Number(target || 0);
    const rawPercent = safeTarget > 0 ? (terkumpul / safeTarget) * 100 : (terkumpul > 0 ? 100 : 0);
    return { kategori, target: safeTarget, terkumpul, rawPercent, shownPercent: Math.min(Math.max(rawPercent, 0), 100) };
  });

  if (!items.some((item) => item.terkumpul > 0)) {
    incomeList.innerHTML += `
      <div class="rounded-2xl bg-gray-50 border border-dashed border-gray-200 p-5 text-center">
        <p class="text-3xl mb-2">🌱</p>
        <p class="font-bold text-gray-700">Belum ada pemasukan periode ini</p>
        <p class="text-sm text-gray-400 mt-1">Masukkan gaji atau pemasukan lain agar pantauan mulai bergerak.</p>
      </div>`;
    return;
  }

  items.forEach(({ kategori, target, terkumpul, rawPercent, shownPercent }) => {
    incomeList.innerHTML += `
      <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div class="flex justify-between items-start gap-3 mb-2">
          <div>
            <p class="font-extrabold text-gray-800">${escapeHTML(kategori)}</p>
            <p class="text-xs text-gray-400">${target > 0 ? `Target ${formatRupiah(target)}` : 'Tidak ada target tetap'}</p>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-700">${Math.round(rawPercent)}%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div class="bg-emerald-500 h-3 rounded-full transition-all" style="width:${shownPercent}%"></div>
        </div>
        <p class="text-xs text-gray-500 mt-2">Terkumpul ${formatRupiah(terkumpul)}</p>
      </div>`;
  });
}

function renderUserChart(dataBulanan) {
  const canvas = $('monthlyChart');
  const empty = $('monthlyChartEmpty');
  const wrap = $('monthlyChartWrap');
  if (!canvas) return;

  const labels = Object.keys(dataBulanan);
  const hasData = labels.some((label) => (dataBulanan[label].masuk || 0) > 0 || (dataBulanan[label].keluar || 0) > 0);

  if (!hasData) {
    if (grafikKeuangan) grafikKeuangan.destroy();
    if (empty) empty.classList.remove('hidden');
    if (wrap) wrap.classList.add('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (wrap) wrap.classList.remove('hidden');

  const datasetMasuk = labels.map((label) => dataBulanan[label].masuk);
  const datasetKeluar = labels.map((label) => dataBulanan[label].keluar);
  const dark = isDarkMode();

  if (grafikKeuangan) grafikKeuangan.destroy();
  grafikKeuangan = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: datasetMasuk, backgroundColor: '#059669', borderRadius: 8 },
        { label: 'Pengeluaran', data: datasetKeluar, backgroundColor: '#e11d48', borderRadius: 8 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 12, color: dark ? '#e5e7eb' : '#374151' } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatRupiah(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: dark ? '#cbd5e1' : '#64748b' }, grid: { display: false } },
        y: {
          ticks: { color: dark ? '#cbd5e1' : '#64748b', callback: (value) => formatRupiah(value).replace('Rp', 'Rp ') },
          grid: { color: dark ? '#1e293b' : '#e5e7eb' }
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
        <td colspan="4" class="py-6 text-center text-gray-400">Belum ada transaksi di periode ini. Saatnya catat yang pertama, sebelum dompet pura-pura baik-baik saja.</td>
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


function getPreviousMonthYear(month, year) {
  if (month === 0) return { month: 11, year: year - 1 };
  return { month: month - 1, year };
}

function sumByTypeForPeriod(data, month, year) {
  return data.reduce((acc, item) => {
    const date = new Date(item.created_at);
    if (Number.isNaN(date.getTime())) return acc;
    if (date.getMonth() !== month || date.getFullYear() !== year) return acc;
    const nominal = Number(item.nominal) || 0;
    if (item.jenis === 'masuk') acc.masuk += nominal;
    if (item.jenis === 'keluar') acc.keluar += nominal;
    return acc;
  }, { masuk: 0, keluar: 0 });
}

function renderSummaryCards(totalMasukAkumulasi, totalKeluarAkumulasi, namaPeriodeRingkasan) {
  if ($('summaryIncomePeriod')) $('summaryIncomePeriod').textContent = formatRupiah(totalMasukAkumulasi);
  if ($('summaryExpensePeriod')) $('summaryExpensePeriod').textContent = formatRupiah(totalKeluarAkumulasi);
  if ($('summaryNetPeriod')) $('summaryNetPeriod').textContent = 'Akumulasi semua transaksi pengeluaran.';
  if ($('currentPeriodLabel')) $('currentPeriodLabel').textContent = `Ringkasan ${namaPeriodeRingkasan}`;
}

function renderSavingsTarget(totalMasuk, totalKeluar) {
  updateTargetSavingsLabel();
  const potensi = totalMasuk - totalKeluar;
  const progress = targetTabunganBulanan > 0 ? Math.max(0, Math.min((potensi / targetTabunganBulanan) * 100, 100)) : 0;
  if ($('targetSavingsAmount')) $('targetSavingsAmount').textContent = formatRupiah(Math.max(potensi, 0));
  if ($('targetSavingsProgress')) $('targetSavingsProgress').style.width = `${progress}%`;
  if ($('targetSavingsStatus')) {
    $('targetSavingsStatus').textContent = `${Math.round(progress)}%`;
    $('targetSavingsStatus').className = progress >= 100
      ? 'px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold'
      : progress >= 50
        ? 'px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold'
        : 'px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold';
  }
}

function renderBudgetAlerts(pengeluaranTerpakai) {
  const container = $('budgetAlertList');
  if (!container) return;

  const alerts = Object.entries(rencanaBudget)
    .map(([kategori, target]) => {
      const used = Number(pengeluaranTerpakai[kategori] || 0);
      const safeTarget = Number(target || 0);
      const percent = safeTarget > 0 ? (used / safeTarget) * 100 : 0;
      return { kategori, used, target: safeTarget, percent };
    })
    .filter((item) => item.target > 0 && item.percent >= 80)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);

  if (!alerts.length) {
    container.innerHTML = `
      <div class="rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 p-3 text-sm">
        Budget masih aman. Keajaiban kecil yang patut dipertahankan.
      </div>`;
    return;
  }

  container.innerHTML = alerts.map((item) => {
    const over = item.percent >= 100;
    return `
      <div class="rounded-2xl ${over ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-700'} border p-3 text-sm mb-2">
        <b>${escapeHTML(item.kategori)}</b> ${over ? 'sudah over budget' : 'hampir habis'}: ${Math.round(item.percent)}% terpakai.
      </div>`;
  }).join('');
}

function renderCategorySummary(pengeluaranTerpakai) {
  const container = $('categorySummaryList');
  if (!container) return;

  const items = Object.entries(pengeluaranTerpakai)
    .map(([kategori, nominal]) => ({ kategori, nominal: Number(nominal) || 0 }))
    .filter((item) => item.nominal > 0)
    .sort((a, b) => b.nominal - a.nominal)
    .slice(0, 6);

  const total = items.reduce((acc, item) => acc + item.nominal, 0);

  if (!items.length) {
    container.innerHTML = `
      <div class="rounded-2xl bg-gray-50 border border-dashed border-gray-200 p-5 text-center">
        <p class="text-3xl mb-2">🗂️</p>
        <p class="font-bold text-gray-700">Kategori masih kosong</p>
        <p class="text-sm text-gray-400 mt-1">Data kategori muncul setelah ada pengeluaran.</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const percent = total > 0 ? Math.round((item.nominal / total) * 100) : 0;
    return `
      <div class="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 border border-gray-100 p-3">
        <div class="min-w-0">
          <p class="font-bold text-gray-800 truncate">${escapeHTML(item.kategori)}</p>
          <p class="text-xs text-gray-400">${percent}% dari top kategori</p>
        </div>
        <p class="font-extrabold text-gray-900 whitespace-nowrap">${formatRupiah(item.nominal)}</p>
      </div>`;
  }).join('');
}

function buildStaticInsights({ totalMasuk, totalKeluar, previousKeluar, pengeluaranTerpakai }) {
  const insights = [];

  if (previousKeluar > 0) {
    const diff = totalKeluar - previousKeluar;
    const percent = Math.round((diff / previousKeluar) * 100);
    if (percent > 0) insights.push(`Pengeluaran kamu naik ${percent}% dibandingkan bulan lalu. Tuh iya shopping terus😒`);
    if (percent < 0) insights.push(`Pengeluaran kamu turun ${Math.abs(percent)}% dibandingkan bulan lalu. Kok bisa?🤔`);
    if (percent === 0) insights.push('Pengeluaran Anda sama dengan bulan lalu. Konsisten, meski semesta tetap kacau.');
  } else if (totalKeluar > 0) {
    insights.push('Pengeluaran bulan ini sudah mulai tercatat. Tenang, kamu tidak ada yang membandingkan🤣');
  }

  const potensiTabungan = totalMasuk - totalKeluar;
  insights.push(`Jadi cuman segini kamu bisa nabung ${formatRupiah(Math.max(potensiTabungan, 0))}.🙄`);

  const topExpense = Object.entries(pengeluaranTerpakai)
    .map(([kategori, nominal]) => ({ kategori, nominal: Number(nominal) || 0 }))
    .sort((a, b) => b.nominal - a.nominal)[0];
  if (topExpense?.nominal > 0) insights.push(`Ini dia penyumbang pengeluaran kamu, "${topExpense.kategori}" sebesar ${formatRupiah(topExpense.nominal)}.😘`);

  if (!insights.length) insights.push('Belum ada data transaksi bulan ini. Catat transaksi dulu agar insight mulai muncul.');

  return insights.slice(0, 3);
}

function simpleHash(input = '') {
  let hash = 0;
  const text = String(input);
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildAIInsightSummary({
  bulan,
  tahun,
  namaPeriodeRingkasan,
  totalMasuk,
  totalKeluar,
  previousTotals,
  pengeluaranTerpakai,
  pemasukanTerkumpul,
  jumlahTransaksiPeriode
}) {
  const topPengeluaran = Object.entries(pengeluaranTerpakai || {})
    .map(([kategori, nominal]) => {
      const budget = Number(rencanaBudget[kategori] || 0);
      const value = Number(nominal) || 0;
      return {
        kategori,
        nominal: value,
        budget,
        persen_budget: budget > 0 ? Math.round((value / budget) * 100) : null,
        sisa_budget: budget > 0 ? Math.max(budget - value, 0) : null
      };
    })
    .filter((item) => item.nominal > 0)
    .sort((a, b) => b.nominal - a.nominal)
    .slice(0, 8);

  const topPemasukan = Object.entries(pemasukanTerkumpul || {})
    .map(([kategori, nominal]) => ({
      kategori,
      nominal: Number(nominal) || 0,
      target: Number(targetPemasukan[kategori] || 0)
    }))
    .filter((item) => item.nominal > 0)
    .sort((a, b) => b.nominal - a.nominal)
    .slice(0, 6);

  const previousKeluar = Number(previousTotals?.keluar || 0);
  const previousMasuk = Number(previousTotals?.masuk || 0);
  const pengeluaranChangePercent = previousKeluar > 0
    ? Math.round(((totalKeluar - previousKeluar) / previousKeluar) * 100)
    : null;
  const pemasukanChangePercent = previousMasuk > 0
    ? Math.round(((totalMasuk - previousMasuk) / previousMasuk) * 100)
    : null;

  const insightVariants = [
    {
      gaya: 'teman jahil yang peduli, sindiran halus, tetap memberi arah',
      fokus: ['tren naik/turun', 'kategori paling boros', 'tabungan vs target']
    },
    {
      gaya: 'roasting ringan seperti teman dekat, tidak kasar, banyak emotikon secukupnya',
      fokus: ['saldo akhir periode', 'pengeluaran yang perlu direm', 'kebiasaan transaksi']
    },
    {
      gaya: 'satir lembut, lucu, tetap solutif',
      fokus: ['budget terlewati', 'pengeluaran tersembunyi', 'prioritas bulan depan']
    },
    {
      gaya: 'komentar tajam tapi hangat, ringkas, ekspresif',
      fokus: ['perbandingan bulan lalu', 'kategori tersangka utama', 'peluang hemat']
    },
    {
      gaya: 'humor receh finansial, tetap sopan dan informatif',
      fokus: ['pemasukan vs pengeluaran', 'potensi tabungan', 'budget yang aman/berbahaya']
    }
  ];
  const variantKey = `${tahun}-${bulan}-${Math.round(totalMasuk || 0)}-${Math.round(totalKeluar || 0)}-${topPengeluaran.map((item) => `${item.kategori}:${item.nominal}`).join('|')}-${AI_INSIGHT_STYLE_VERSION}`;
  const variantIndex = parseInt(simpleHash(variantKey), 36) % insightVariants.length;
  const selectedVariant = insightVariants[variantIndex];

  const summary = {
    periode: namaPeriodeRingkasan,
    bulan,
    tahun,
    total_pemasukan: Math.round(Number(totalMasuk) || 0),
    total_pengeluaran: Math.round(Number(totalKeluar) || 0),
    potensi_tabungan: Math.round((Number(totalMasuk) || 0) - (Number(totalKeluar) || 0)),
    target_tabungan: Math.round(Number(targetTabunganBulanan) || 0),
    jumlah_transaksi: Number(jumlahTransaksiPeriode) || 0,
    variasi_bahasa: selectedVariant,
    variation_seed: simpleHash(variantKey),
    perbandingan_bulan_lalu: {
      pemasukan_bulan_lalu: Math.round(previousMasuk),
      pengeluaran_bulan_lalu: Math.round(previousKeluar),
      pemasukan_naik_persen: pemasukanChangePercent,
      pengeluaran_naik_persen: pengeluaranChangePercent
    },
    kategori_pengeluaran_terbesar: topPengeluaran,
    kategori_pemasukan_terbesar: topPemasukan
  };

  // Versi gaya insight ikut masuk hash agar cache insight lama tidak dipakai
  // ketika gaya bahasa/tampilan AI berubah. Ya, cache kadang terlalu setia.
  summary.insight_style_version = AI_INSIGHT_STYLE_VERSION;
  summary.summary_hash = simpleHash(JSON.stringify(summary));
  return summary;
}

function normalizeInsightArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
  if (value && Array.isArray(value.insights)) return normalizeInsightArray(value.insights);
  return [];
}

function renderInsightList(insights, { source = 'static', cached = false } = {}) {
  const container = $('insightList');
  if (!container) return;

  const safeInsights = normalizeInsightArray(insights);
  const isAI = source === 'ai';
  const dark = isDarkMode();
  const hasPeriodData = Number(currentInsightSummary?.jumlah_transaksi || 0) > 0;
  const hasError = Boolean(aiInsightError && aiInsightErrorKey === currentInsightKey && !isAI);
  const statusText = aiInsightLoading
    ? 'Insight sedang dibuat otomatis dari ringkasan data periode ini. Sabar, angka-angkanya lagi diinterogasi dulu 😌'
    : isAI
      ? (cached ? 'Insight otomatis tersimpan untuk data periode ini.' : 'Insight otomatis dibuat dari ringkasan data periode ini.')
      : hasError
        ? `Insight AI belum berhasil dibuat otomatis: ${aiInsightError}`
        : hasPeriodData
          ? 'Insight otomatis sedang disiapkan. Jika belum muncul, tunggu beberapa detik lalu refresh halaman.'
          : 'Insight otomatis akan dibuat saat data periode ini tersedia.';

  const statusClass = aiInsightLoading
    ? (dark ? 'bg-slate-900 border-emerald-900 text-emerald-200' : 'bg-emerald-50 border-emerald-100 text-emerald-700')
    : hasError
      ? (dark ? 'bg-slate-900 border-rose-900 text-rose-200' : 'bg-rose-50 border-rose-100 text-rose-700')
      : isAI
        ? (dark ? 'bg-slate-900 border-emerald-900 text-emerald-200' : 'bg-emerald-50 border-emerald-100 text-emerald-700')
        : (dark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-gray-50 border-gray-100 text-gray-400');

  const statusStyle = dark
    ? 'style="background:#020617;border-color:#1e3a34;box-shadow:inset 0 1px 0 rgba(255,255,255,.03);"'
    : '';

  container.innerHTML = `
    <div class="space-y-3">
      ${safeInsights.map((text, index) => {
        const cardClass = isAI
          ? (dark
            ? 'bg-slate-900 border-emerald-900 shadow-lg'
            : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100 shadow-[0_10px_24px_rgba(5,150,105,.08)]')
          : (dark ? 'bg-slate-900 border-slate-800' : 'bg-gray-50 border-gray-100');
        const cardStyle = dark
          ? (isAI
            ? 'style="background:linear-gradient(135deg,#0f172a 0%,#052e2b 100%);border-color:#14532d;box-shadow:0 12px 28px rgba(0,0,0,.28);"'
            : 'style="background:#0f172a;border-color:#1e293b;"')
          : '';
        const numberClass = isAI
          ? (dark
            ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg'
            : 'bg-emerald-600 text-white border-emerald-500 shadow-[0_8px_18px_rgba(5,150,105,.18)]')
          : (dark ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-white text-gray-500 border-gray-100');
        const textClass = isAI ? (dark ? 'text-emerald-50' : 'text-emerald-950') : (dark ? 'text-slate-200' : 'text-gray-700');
        return `
          <div class="flex gap-3 rounded-3xl ${cardClass} border p-4" ${cardStyle}>
            <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${numberClass} border text-xs font-extrabold">${index + 1}</span>
            <p class="${textClass} leading-7 text-[15px] md:text-base">${escapeHTML(text)}</p>
          </div>`;
      }).join('')}
    </div>
    <div class="mt-4 rounded-2xl ${statusClass} border px-3 py-2 text-[11px] leading-5" ${statusStyle}>
      <span class="mr-1">${aiInsightLoading ? '⏳' : (isAI ? '✨' : (hasError ? '⚠️' : '💡'))}</span>${escapeHTML(statusText)}
    </div>`;
}
async function loadCachedAIInsights(summary) {
  if (!currentUser?.id || !summary?.summary_hash) return null;

  try {
    const { data, error } = await db
      .from('ai_monthly_insights')
      .select('insights, summary_hash, updated_at')
      .eq('user_id', currentUser.id)
      .eq('bulan', summary.bulan)
      .eq('tahun', summary.tahun)
      .eq('summary_hash', summary.summary_hash)
      .maybeSingle();

    if (error) {
      console.warn('[AI Insight cache] Gagal membaca cache:', error);
      return null;
    }

    const cachedInsights = normalizeInsightArray(data?.insights);
    return cachedInsights.length ? cachedInsights : null;
  } catch (error) {
    console.warn('[AI Insight cache] Error:', error);
    return null;
  }
}

async function renderInsights(context) {
  const container = $('insightList');
  if (!container) return;

  const previousInsightKey = currentInsightKey;
  currentStaticInsights = buildStaticInsights(context);
  currentAiInsights = null;
  currentInsightSummary = buildAIInsightSummary(context);
  currentInsightKey = `${currentUser?.id || 'guest'}-${currentInsightSummary.tahun}-${currentInsightSummary.bulan}-${currentInsightSummary.summary_hash}`;
  if (currentInsightKey !== previousInsightKey) {
    aiInsightError = '';
    aiInsightErrorKey = '';
  }

  renderInsightList(currentStaticInsights, { source: 'static' });

  const insightKeyBeforeLoad = currentInsightKey;
  const cachedInsights = await loadCachedAIInsights(currentInsightSummary);
  if (cachedInsights && currentInsightKey === insightKeyBeforeLoad) {
    currentAiInsights = cachedInsights;
    renderInsightList(cachedInsights, { source: 'ai', cached: true });
    return;
  }

  if (
    currentInsightKey === insightKeyBeforeLoad &&
    Number(currentInsightSummary.jumlah_transaksi || 0) > 0 &&
    !aiInsightLoading &&
    !autoAiInsightAttemptedKeys.has(currentInsightKey)
  ) {
    autoAiInsightAttemptedKeys.add(currentInsightKey);
    setTimeout(() => {
      if (currentInsightKey === insightKeyBeforeLoad) {
        generateAIInsights({ silent: true, auto: true });
      }
    }, 150);
  }
}

async function generateAIInsights(options = {}) {
  const { silent = false } = options;
  if (!currentUser) {
    if (silent) return false;
    return showWarning('Belum login', 'Masuk akun dulu sebelum membuat insight AI.');
  }
  if (!currentInsightSummary) {
    if (silent) return false;
    return showWarning('Data belum siap', 'Data ringkasan belum siap. Refresh halaman lalu coba lagi.');
  }
  if (Number(currentInsightSummary.jumlah_transaksi || 0) <= 0) {
    if (silent) return false;
    return showWarning('Belum ada transaksi', 'Catat transaksi bulan ini dulu agar AI punya bahan untuk dianalisis. AI belum bisa membaca dompet kosong dari kejauhan.');
  }

  aiInsightLoading = true;
  aiInsightError = '';
  aiInsightErrorKey = '';
  renderInsightList(currentAiInsights || currentStaticInsights, { source: currentAiInsights ? 'ai' : 'static' });

  try {
    const session = await getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Sesi login tidak ditemukan.');

    const response = await fetch('/api/generate-insight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ summary: currentInsightSummary })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.message || result?.error || 'Gagal membuat insight AI.');
    }

    const insights = normalizeInsightArray(result?.insights);
    if (!insights.length) throw new Error('AI tidak mengembalikan insight yang valid.');

    currentAiInsights = insights;
    renderInsightList(insights, { source: 'ai', cached: false });

    try {
      const { error: saveError } = await db
        .from('ai_monthly_insights')
        .upsert({
          user_id: currentUser.id,
          bulan: currentInsightSummary.bulan,
          tahun: currentInsightSummary.tahun,
          summary_hash: currentInsightSummary.summary_hash,
          summary: currentInsightSummary,
          insights,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,bulan,tahun' });

      if (saveError) console.warn('[AI Insight] Insight berhasil dibuat tapi gagal disimpan:', saveError);
    } catch (saveError) {
      console.warn('[AI Insight] Insight berhasil dibuat tapi gagal disimpan:', saveError);
    }

    if (silent) return true;

    return Swal.fire({
      icon: 'success',
      title: 'Insight AI dibuat',
      text: 'Insight bulanan berhasil diperbarui.',
      timer: 1300,
      showConfirmButton: false
    });
  } catch (error) {
    console.error('[AI Insight] Gagal membuat insight:', error);
    aiInsightError = error?.message || 'Terjadi kesalahan saat membuat insight AI.';
    aiInsightErrorKey = currentInsightKey;
    if (silent) return false;
    return Swal.fire({
      icon: 'error',
      title: 'Gagal membuat insight AI',
      text: aiInsightError,
      confirmButtonColor: '#059669'
    });
  } finally {
    aiInsightLoading = false;
    renderInsightList(currentAiInsights || currentStaticInsights, { source: currentAiInsights ? 'ai' : 'static' });
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

  const sekarang = new Date();
  const selectBulanRiwayat = $('filterBulan');
  const selectTahunRiwayat = $('filterTahunRiwayat');

  const tahunSekarang = String(sekarang.getFullYear());
  const bulanSekarang = String(sekarang.getMonth());

  const filterBulanVal = selectBulanRiwayat?.value || bulanSekarang;
  const defaultYearRiwayat = selectTahunRiwayat?.getAttribute('data-default-year');
  const filterTahunVal =
    defaultYearRiwayat ||
    selectTahunRiwayat?.value ||
    filterTahunAktif ||
    tahunSekarang;

  // Grafik Pemasukan vs Pengeluaran memakai tahun yang sama dengan filter Riwayat Transaksi.
  filterTahunAktif = filterTahunVal;
  const selectTahunChartAwal = $('filterTahunChart');
  if (selectTahunChartAwal && selectTahunChartAwal.value !== filterTahunVal) {
    selectTahunChartAwal.value = filterTahunVal;
  }

  const filteredData = data.filter((item) => {
    const tgl = new Date(item.created_at);
    if (Number.isNaN(tgl.getTime())) return false;

    const cocokBulan = filterBulanVal === 'Semua' || String(tgl.getMonth()) === filterBulanVal;
    const cocokTahun = filterTahunVal === 'Semua' || String(tgl.getFullYear()) === filterTahunVal;
    return cocokBulan && cocokTahun;
  });

  // Periode ringkasan:
  // - Jika user memilih bulan tertentu, Budget dan Pantauan Pemasukan mengikuti bulan itu.
  // - Jika user memilih Semua Bulan, Budget dan Pantauan Pemasukan kembali ke bulan berjalan.
  const bulanUntukRingkasan = filterBulanVal === 'Semua'
    ? sekarang.getMonth()
    : Number(filterBulanVal);

  const tahunUntukRingkasan = filterBulanVal === 'Semua'
    ? sekarang.getFullYear()
    : (filterTahunVal === 'Semua' ? sekarang.getFullYear() : Number(filterTahunVal));

  const tanggalPeriodeRingkasan = new Date(tahunUntukRingkasan, bulanUntukRingkasan, 1);
  const namaPeriodeRingkasan = tanggalPeriodeRingkasan.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric'
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

    if (
      tanggalObj.getMonth() === bulanUntukRingkasan &&
      tanggalObj.getFullYear() === tahunUntukRingkasan
    ) {
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

  const totalMasukPeriode = Object.values(pemasukanTerkumpul).reduce((acc, value) => acc + Number(value || 0), 0);
  const totalKeluarPeriode = Object.values(pengeluaranTerpakai).reduce((acc, value) => acc + Number(value || 0), 0);
  const previousPeriod = getPreviousMonthYear(bulanUntukRingkasan, tahunUntukRingkasan);
  const previousTotals = sumByTypeForPeriod(data, previousPeriod.month, previousPeriod.year);

  const totalMasukAkumulasi = data.reduce((acc, item) => {
    const nominal = Number(item.nominal) || 0;
    return item.jenis === 'masuk' ? acc + nominal : acc;
  }, 0);

  const totalKeluarAkumulasi = data.reduce((acc, item) => {
    const nominal = Number(item.nominal) || 0;
    return item.jenis === 'keluar' ? acc + nominal : acc;
  }, 0);

  const totalSaldo = totalMasukAkumulasi - totalKeluarAkumulasi;

  if ($('totalBalance')) $('totalBalance').textContent = formatRupiah(totalSaldo);

  fillYearSelects(daftarTahun);
  renderSummaryCards(totalMasukAkumulasi, totalKeluarAkumulasi, namaPeriodeRingkasan);
  renderSavingsTarget(totalMasukPeriode, totalKeluarPeriode);
  renderBudgetAlerts(pengeluaranTerpakai);
  renderBudgetList(pengeluaranTerpakai, namaPeriodeRingkasan);
  renderIncomeList(pemasukanTerkumpul, namaPeriodeRingkasan);
  renderCategorySummary(pengeluaranTerpakai);
  await renderInsights({
    bulan: bulanUntukRingkasan + 1,
    tahun: tahunUntukRingkasan,
    namaPeriodeRingkasan,
    totalMasuk: totalMasukPeriode,
    totalKeluar: totalKeluarPeriode,
    previousTotals,
    previousKeluar: previousTotals.keluar,
    pengeluaranTerpakai,
    pemasukanTerkumpul,
    jumlahTransaksiPeriode: data.filter((item) => {
      const date = new Date(item.created_at);
      return !Number.isNaN(date.getTime()) &&
        date.getMonth() === bulanUntukRingkasan &&
        date.getFullYear() === tahunUntukRingkasan;
    }).length
  });
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

async function exportToExcel() {
  if (!currentUser) return;

  let data = [];
  try {
    data = await fetchUserTransactions({ ascending: false });
  } catch (error) {
    return showError('Gagal export Excel', error);
  }

  const rows = (data || []).map((row) => ({
    Tanggal: row.created_at,
    Jenis: row.jenis,
    Kategori: row.kategori,
    Nominal: Number(row.nominal) || 0,
    User_ID: row.user_id
  }));

  if (!rows.length) {
    return showWarning('Belum ada data', 'Belum ada transaksi untuk diexport ke Excel. File kosong itu bukan laporan, itu harapan.');
  }

  if (typeof XLSX === 'undefined') {
    return showWarning('Library Excel belum siap', 'XLSX belum termuat. Coba refresh halaman atau cek koneksi internet.');
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaksi');
  XLSX.writeFile(workbook, `riwayat-keuangan-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

  if ($('userNama')) $('userNama').textContent = currentProfile?.nama || currentUser.email?.split('@')[0] || 'Pengguna';

  applyFinanceSettingsFromProfile(currentProfile);
  fillProfileSettings();
  renderFinanceSettings();
  setJenis('keluar');
  setDefaultFilterBulanBerjalan();
  setupUserRealtime();
  await updateUI();
  localStorage.removeItem('olahUangActiveView');
  showAppView('beranda');
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'account_recovery_requests' }, () => muatData(false))
    .subscribe();
}

async function muatData(showLoading = true) {
  if (showLoading && $('userTableBody')) {
    $('userTableBody').innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">Memuat data...</td></tr>';
  }
  if (showLoading && $('accountRecoveryBody')) {
    $('accountRecoveryBody').innerHTML = '<tr><td colspan="7" class="px-6 py-6 text-center text-gray-400">Memuat permintaan bantuan akun...</td></tr>';
  }

  let profilesData = [];
  let trxData = [];
  let recoveryData = [];
  let recoveryError = null;

  try {
    [profilesData, trxData] = await Promise.all([
      fetchAllProfiles(),
      fetchAllTransaksi({ ascending: false, maxRows: MAX_FETCH_ROWS })
    ]);
  } catch (error) {
    return showError('Gagal mengambil data admin', error);
  }

  try {
    recoveryData = await fetchAllAccountRecoveryRequests();
  } catch (error) {
    recoveryError = error;
    console.error('[Gagal mengambil permintaan bantuan akun]', error);
  }

  allProfiles = profilesData || [];
  allTrxData = trxData || [];
  allRecoveryRequests = recoveryData || [];

  renderStatCards(allProfiles, allTrxData, allRecoveryRequests);
  renderAccountRecoveryRequests(allRecoveryRequests, recoveryError);
  renderUserTable(allProfiles, allTrxData);
  renderUserActivity(allProfiles, allTrxData);
  renderAllTrx();
  renderAdminChart(allTrxData);
}

function renderStatCards(profiles, trx, recoveryRequests = []) {
  const totalMasuk = trx
    .filter((item) => item.jenis === 'masuk')
    .reduce((acc, item) => acc + (Number(item.nominal) || 0), 0);

  const totalKeluar = trx
    .filter((item) => item.jenis === 'keluar')
    .reduce((acc, item) => acc + (Number(item.nominal) || 0), 0);

  const totalRecoveryNew = recoveryRequests.filter((item) => (item.status || 'baru') === 'baru').length;

  if ($('statTotalUser')) $('statTotalUser').textContent = profiles.length;
  if ($('statTotalTrx')) $('statTotalTrx').textContent = trx.length;
  if ($('statTotalMasuk')) $('statTotalMasuk').textContent = formatRupiah(totalMasuk);
  if ($('statTotalKeluar')) $('statTotalKeluar').textContent = formatRupiah(totalKeluar);
  if ($('statRecoveryNew')) $('statRecoveryNew').textContent = totalRecoveryNew;
}

function normalizeRecoveryPhone(value = '') {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return digits;
}

function getRecoveryStatusBadge(status = 'baru') {
  const safeStatus = String(status || 'baru').toLowerCase();
  const map = {
    baru: 'bg-amber-100 text-amber-700',
    diproses: 'bg-blue-100 text-blue-700',
    selesai: 'bg-emerald-100 text-emerald-700',
    ditolak: 'bg-rose-100 text-rose-700'
  };
  const label = {
    baru: 'Baru',
    diproses: 'Diproses',
    selesai: 'Selesai',
    ditolak: 'Ditolak'
  }[safeStatus] || 'Baru';

  return `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${map[safeStatus] || map.baru}">${label}</span>`;
}

function getLikelyRecoveryMatches(request) {
  const requestName = String(request?.nama || '').trim().toLowerCase();
  const requestPhone = normalizeRecoveryPhone(request?.nomor_hp || '');

  return allProfiles
    .map((profile) => {
      const profileName = String(profile.nama || '').trim().toLowerCase();
      const profilePhone = normalizeRecoveryPhone(profile.nomor_hp || '');
      let score = 0;

      if (requestPhone && profilePhone && requestPhone === profilePhone) score += 4;
      if (requestName && profileName && profileName === requestName) score += 3;
      if (requestName && profileName && profileName.includes(requestName)) score += 1;
      if (requestName && profileName && requestName.includes(profileName)) score += 1;

      return { profile, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.profile);
}

function renderAccountRecoveryRequests(requests, error = null) {
  const body = $('accountRecoveryBody');
  if (!body) return;

  if (error) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-6 text-center text-amber-600">
          Fitur bantuan akun belum bisa dibaca. Pastikan SQL terbaru sudah dijalankan di Supabase.
        </td>
      </tr>`;
    if ($('recoveryNewBadge')) $('recoveryNewBadge').textContent = 'SQL belum aktif';
    if ($('statRecoveryNew')) $('statRecoveryNew').textContent = '—';
    return;
  }

  const newCount = requests.filter((item) => (item.status || 'baru') === 'baru').length;
  if ($('recoveryNewBadge')) $('recoveryNewBadge').textContent = `${newCount} baru`;

  if (!requests.length) {
    body.innerHTML = '<tr><td colspan="7" class="px-6 py-6 text-center text-gray-400">Belum ada permintaan bantuan akun.</td></tr>';
    return;
  }

  body.innerHTML = requests.map((request) => {
    const status = request.status || 'baru';
    const phone = normalizeRecoveryPhone(request.nomor_hp || '');
    const waLink = phone ? `https://wa.me/${phone}` : '#';
    const tanggal = formatTanggal(request.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    const matches = getLikelyRecoveryMatches(request);
    const matchText = matches.length
      ? matches.map((profile) => `<div class="font-bold text-gray-700">${escapeHTML(profile.nama || profile.email || 'Pengguna')}</div><div class="text-[11px] text-gray-400">${escapeHTML(profile.email || '-')}</div>`).join('<div class="my-1 border-t border-gray-100"></div>')
      : '<span class="text-gray-400">Belum ditemukan</span>';
    const actions = [
      status !== 'diproses' ? `<button onclick="updateRecoveryStatus('${escapeHTML(request.id)}','diproses')" class="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100">Proses</button>` : '',
      status !== 'selesai' ? `<button onclick="updateRecoveryStatus('${escapeHTML(request.id)}','selesai')" class="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100">Selesai</button>` : '',
      status !== 'ditolak' ? `<button onclick="updateRecoveryStatus('${escapeHTML(request.id)}','ditolak')" class="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100">Tolak</button>` : ''
    ].filter(Boolean).join(' ');

    return `
      <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
        <td class="px-6 py-4 font-bold text-gray-800">${escapeHTML(request.nama || '-')}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${phone ? `<a href="${waLink}" target="_blank" rel="noopener" class="font-bold text-emerald-600 hover:text-emerald-700">${escapeHTML(request.nomor_hp || phone)}</a>` : '<span class="text-gray-400">-</span>'}
        </td>
        <td class="px-6 py-4 max-w-[240px] text-gray-500">${escapeHTML(request.catatan || '-')}</td>
        <td class="px-6 py-4 text-gray-500">${matchText}</td>
        <td class="px-6 py-4 whitespace-nowrap text-gray-400">${escapeHTML(tanggal)}</td>
        <td class="px-6 py-4 whitespace-nowrap">${getRecoveryStatusBadge(status)}</td>
        <td class="px-6 py-4">
          <div class="flex flex-wrap gap-2">${actions || '<span class="text-xs text-gray-400">Tidak ada aksi</span>'}</div>
        </td>
      </tr>`;
  }).join('');
}

async function updateRecoveryStatus(requestId, statusBaru) {
  if (!currentUser || currentProfile?.role !== 'admin') return;

  const label = { diproses: 'diproses', selesai: 'selesai', ditolak: 'ditolak' }[statusBaru] || statusBaru;
  const result = await Swal.fire({
    icon: 'question',
    title: `Ubah status ke ${label}?`,
    text: 'Status permintaan bantuan akun akan diperbarui di dashboard admin.',
    showCancelButton: true,
    confirmButtonText: 'Ya, ubah',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#059669',
    cancelButtonColor: '#9ca3af'
  });

  if (!result.isConfirmed) return;

  const { error } = await db
    .from('account_recovery_requests')
    .update({ status: statusBaru })
    .eq('id', requestId);

  if (error) return showError('Gagal memperbarui bantuan akun', error);

  await Swal.fire({
    icon: 'success',
    title: 'Status diperbarui',
    timer: 1100,
    showConfirmButton: false
  });

  await muatData(false);
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
  initDarkMode();
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
window.exportToExcel = exportToExcel;
window.toggleDarkMode = toggleDarkMode;
window.muatData = muatData;
window.toggleRole = toggleRole;
window.changeAdminTrxPage = changeAdminTrxPage;
window.updateRecoveryStatus = updateRecoveryStatus;
window.showAppView = showAppView;
window.openCatatModal = openCatatModal;
window.handleCatatSekarang = handleCatatSekarang;
window.closeCatatModal = closeCatatModal;
window.setQuickJenis = setQuickJenis;
window.submitQuickTransaction = submitQuickTransaction;
window.toggleProfileEdit = toggleProfileEdit;
window.saveProfileSettings = saveProfileSettings;
window.toggleFinanceEdit = toggleFinanceEdit;
window.saveFinanceSettings = saveFinanceSettings;
window.addFinanceCategory = addFinanceCategory;
window.removeFinanceCategoryRow = removeFinanceCategoryRow;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
