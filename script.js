// ============================================================
// Olah Uang — Single Script Multi-User + Admin
// Netlify + Supabase
// ============================================================

const SUPABASE_URL = 'https://uezjncjapumyrkjxzslw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gMbWszjY1XIou5Cj4wDkjg_UlGiuOd5';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
window.db = db;
const APP_VERSION = '20260630-v112-help-account-delete-align';
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
let activeSettingsSection = 'profile';
let totalBalanceHidden = localStorage.getItem('olahUangTotalBalanceHidden') === '1';
let lastTotalSaldo = 0;
let activeAdminView = 'overview';
let quickJenisAktif = 'keluar';
const AI_INSIGHT_STYLE_VERSION = 'numbered-roast-v6-robust-gemini';
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
let allUserActivity = [];
let userPresenceTimer = null;
let allRecoveryRequests = [];

let adminUserSearchTerm = '';
let adminUserRoleFilter = 'all';
let adminUserStatusFilter = 'all';

let adminTrxSearchTerm = '';
let adminTrxTypeFilter = 'all';
let adminTrxUserFilter = 'all';

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


function getBalanceVisibleIcon() {
  return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 15.25A3.25 3.25 0 1012 8.75a3.25 3.25 0 000 6.5z"/></svg>`;
}

function getBalanceHiddenIcon() {
  return `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18"/><path stroke-linecap="round" stroke-linejoin="round" d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.88 5.42A8.8 8.8 0 0112 5.25c6 0 9.75 6.75 9.75 6.75a18.4 18.4 0 01-2.47 3.08"/><path stroke-linecap="round" stroke-linejoin="round" d="M6.17 6.85C3.68 8.64 2.25 12 2.25 12s3.75 6.75 9.75 6.75c1.76 0 3.3-.58 4.6-1.39"/></svg>`;
}

function renderTotalBalance(totalSaldo = lastTotalSaldo) {
  lastTotalSaldo = Number(totalSaldo) || 0;

  const balanceEl = $('totalBalance');
  const button = $('balanceVisibilityBtn');
  const icon = $('balanceVisibilityIcon');
  const privacyText = $('balancePrivacyText');

  if (balanceEl) {
    balanceEl.textContent = totalBalanceHidden ? 'Rp ••••••' : formatRupiah(lastTotalSaldo);
    balanceEl.classList.toggle('balance-hidden', totalBalanceHidden);
  }

  if (button) {
    const label = totalBalanceHidden ? 'Tampilkan saldo' : 'Sembunyikan saldo';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', totalBalanceHidden ? 'true' : 'false');
  }

  if (icon) {
    icon.innerHTML = totalBalanceHidden ? getBalanceHiddenIcon() : getBalanceVisibleIcon();
  }

  if (privacyText) {
    privacyText.textContent = totalBalanceHidden
      ? 'Saldo disembunyikan untuk menjaga privasi tampilan.'
      : 'Akumulasi seluruh transaksi yang sudah dicatat.';
  }
}

function toggleTotalBalanceVisibility() {
  totalBalanceHidden = !totalBalanceHidden;
  localStorage.setItem('olahUangTotalBalanceHidden', totalBalanceHidden ? '1' : '0');
  renderTotalBalance(lastTotalSaldo);
}




function onlyDigits(value = '') {
  return String(value ?? '').replace(/\D/g, '');
}

function formatNominalDots(value = '') {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseNominalInput(value = '') {
  const digits = onlyDigits(value);
  return Number(digits || 0);
}

function formatNominalInputElement(input) {
  if (!input) return;

  const cursorAtEnd = input.selectionStart === input.value.length;
  input.value = formatNominalDots(input.value);

  if (cursorAtEnd && typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function setupNominalInputFormatter(root = document) {
  root.querySelectorAll('[data-format="nominal"]').forEach((input) => {
    input.setAttribute('type', 'text');
    input.setAttribute('inputmode', 'numeric');

    if (input.dataset.nominalFormatterReady === '1') {
      formatNominalInputElement(input);
      return;
    }

    input.dataset.nominalFormatterReady = '1';

    input.addEventListener('input', () => formatNominalInputElement(input));
    input.addEventListener('blur', () => formatNominalInputElement(input));
    formatNominalInputElement(input);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupNominalInputFormatter();
});


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



async function showSettingsSection(section = 'profile', options = {}) {
  const allowedSections = ['profile', 'expense', 'income', 'help'];
  const targetSection = allowedSections.includes(section) ? section : 'profile';

  if (targetSection !== activeSettingsSection && !options.skipGuard && hasUnsavedSettings()) {
    const canContinue = await confirmUnsavedSettingsBeforeContinue();
    if (!canContinue) return false;
  }

  activeSettingsSection = targetSection;

  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.settingsPanel !== targetSection);
  });

  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    const isActive = button.dataset.settingsTab === targetSection;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  if (targetSection === 'expense' || targetSection === 'income') {
    renderFinanceSettings();
  }

  setupNominalInputFormatter();
  if (targetSection === 'help') syncDailyPushStatus();
  localStorage.setItem('olahUangSettingsSection', targetSection);
  return true;
}

function initSettingsSectionMenu() {
  const savedSection = localStorage.getItem('olahUangSettingsSection') || 'profile';
  showSettingsSection(savedSection, { skipGuard: true, silent: true });
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
  updateUserPresence(getCurrentPresencePageLabel()).catch((error) => console.warn('[Presence view]', error));

  if (targetView === 'analisis' && grafikKeuangan) {
    setTimeout(() => grafikKeuangan?.resize?.(), 80);
  }

  if (targetView === 'setting') {
    initSettingsSectionMenu();
    syncDailyPushStatus();
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
  if (enabled) showSettingsSection('profile', { skipGuard: true });
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
    const amount = parseNominalInput(row.querySelector('[data-field="amount"]')?.value);
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
      <div class="rupiah-field is-compact">
        <span class="rupiah-prefix">Rp</span>
        <input data-field="amount" data-format="nominal" type="text" inputmode="numeric" value="${formatNominalDots(nominal)}" ${editable ? '' : 'disabled'} class="rupiah-input w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-right" />
      </div>
      <button type="button" onclick="removeFinanceCategoryRow(this)" ${editable ? '' : 'disabled'} class="h-10 rounded-xl bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" title="Hapus kategori" aria-label="Hapus kategori">
        <svg class="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3m-9 0h12"/></svg>
      </button>
    </div>`).join('');
}

function renderFinanceSettings() {
  if (!$('financeSettingsPanel')) return;
  if ($('settingTargetSavings')) {
    $('settingTargetSavings').value = formatNominalDots(targetTabunganBulanan);
    $('settingTargetSavings').disabled = !financeEditState.keluar;
  }
  renderSettingsRows('budgetSettingList', rencanaBudget, 'keluar');
  renderSettingsRows('incomeSettingList', targetPemasukan, 'masuk');
  setupNominalInputFormatter();
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
  if (enabled) showSettingsSection(type === 'masuk' ? 'income' : 'expense', { skipGuard: true });
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
  const amount = parseNominalInput(amountInput?.value);

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
    const targetValue = parseNominalInput($('settingTargetSavings')?.value);
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



async function deleteMyAccount() {
  if (!currentUser?.id) {
    return showWarning('Akun belum terbaca', 'Silakan login ulang sebelum menghapus akun.');
  }

  const firstConfirm = await Swal.fire({
    icon: 'warning',
    title: 'Hapus akun?',
    html:
      'Tindakan ini akan menonaktifkan akun, menghapus transaksi, dan mengosongkan data profil yang bisa dikosongkan.<br>',
    showCancelButton: true,
    confirmButtonText: 'Lanjutkan',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#9ca3af'
  });

  if (!firstConfirm.isConfirmed) return false;

  const typedConfirm = await Swal.fire({
    icon: 'error',
    title: 'Konfirmasi Terakhir!',
    html: 'Ketik <b>HAPUS</b> untuk melanjutkan.',
    input: 'text',
    inputPlaceholder: 'Ketik HAPUS',
    showCancelButton: true,
    confirmButtonText: 'Hapus Akun',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#be123c',
    cancelButtonColor: '#9ca3af',
    preConfirm: (value) => {
      if (String(value || '').trim().toUpperCase() !== 'HAPUS') {
        Swal.showValidationMessage('Ketik HAPUS dengan benar untuk melanjutkan.');
        return false;
      }
      return true;
    }
  });

  if (!typedConfirm.isConfirmed) return false;

  try {
    Swal.fire({
      title: 'Menghapus akun...',
      text: 'Proses sedang berjalan. Jangan tutup halaman dulu.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading()
    });

    const userId = currentUser.id;
    const now = new Date().toISOString();

    // Langkah pertama: blokir akses akun di level aplikasi.
    // Tidak ada fallback palsu. Kalau kolom belum ada, proses dihentikan agar akun tidak tetap aktif.
    const { data: profileData, error: profileError } = await db
      .from('profiles')
      .update({
        nama: 'Akun Dihapus',
        nomor_hp: null,
        account_status: 'deleted',
        deleted_at: now,
        suspended_at: null
      })
      .eq('id', userId)
      .select('id, account_status')
      .single();

    if (profileError) {
      throw new Error(
        `${translateErrorMessage(profileError)} Pastikan file supabase-delete-account.sql terbaru sudah dijalankan di Supabase.`
      );
    }

    if (profileData?.account_status !== 'deleted') {
      throw new Error('Status akun gagal diubah menjadi deleted. Proses dibatalkan agar tidak memberi sukses palsu.');
    }

    const optionalDeletes = [
      db.from('transaksi').delete().eq('user_id', userId),
      db.from('user_activity').delete().eq('user_id', userId),
      db.from('ai_monthly_insights').delete().eq('user_id', userId)
    ];

    const deleteResults = await Promise.allSettled(optionalDeletes);
    deleteResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value?.error) {
        console.warn('[Delete account] sebagian data gagal dihapus', result.value.error);
      }
      if (result.status === 'rejected') {
        console.warn('[Delete account] sebagian data dilewati', result.reason);
      }
    });

    await db.auth.signOut();

    await Swal.fire({
      icon: 'success',
      title: 'Akun dihapus',
      text: 'Akun sudah ditandai terhapus dan tidak bisa digunakan lagi untuk masuk ke aplikasi.',
      confirmButtonColor: '#059669'
    });

    window.location.href = 'index.html';
    return true;
  } catch (error) {
    console.error('[Delete account]', error);
    return showError('Gagal menghapus akun', error);
  }
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


async function fetchAllUserActivity({ maxRows = 1000 } = {}) {
  let allRows = [];
  let from = 0;

  while (from < maxRows) {
    const to = Math.min(from + DATA_PAGE_SIZE - 1, maxRows - 1);

    const { data, error } = await db
      .from('user_activity')
      .select('*')
      .order('last_seen', { ascending: false })
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


function updateAppPwaThemeColor(enabled = isDarkMode()) {
  const color = enabled ? '#020617' : '#f7fbf9';

  let themeMeta = document.querySelector('meta[name="theme-color"]');
  let navMeta = document.querySelector('meta[name="msapplication-navbutton-color"]');

  if (!themeMeta) {
    themeMeta = document.createElement('meta');
    themeMeta.setAttribute('name', 'theme-color');
    document.head.appendChild(themeMeta);
  }

  if (!navMeta) {
    navMeta = document.createElement('meta');
    navMeta.setAttribute('name', 'msapplication-navbutton-color');
    document.head.appendChild(navMeta);
  }

  themeMeta.setAttribute('content', color);
  navMeta.setAttribute('content', color);
  document.documentElement.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;
}


function applyDarkMode(enabled) {
  const root = document.documentElement;
  const body = document.body;
  root.classList.toggle('dark', enabled);
  body?.classList.toggle('dark', enabled);
  localStorage.setItem('olahUangDarkMode', enabled ? '1' : '0');
  const toggle = $('darkModeToggle');
  if (toggle) toggle.textContent = enabled ? '☀️' : '🌕';
  updateAppPwaThemeColor(enabled);

  requestAnimationFrame(() => updateMovingNavIndicators(activeAppView));

  // Redraw chart agar warna grid/label ikut mode terbaru. Ya, chart juga butuh diajak refresh.
  if (currentUser && $('monthlyChart')) updateUI();
  if ($('adminChart') && Array.isArray(allTrxData) && allTrxData.length) {
    requestAnimationFrame(() => renderAdminChart(allTrxData));
  }
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


function getAccountStatus(profile) {
  return String(profile?.account_status || 'active').toLowerCase();
}

function isAccountBlocked(profile) {
  return ['suspended', 'deleted'].includes(getAccountStatus(profile));
}

function getBlockedAccountMessage(profile) {
  const status = getAccountStatus(profile);
  if (status === 'deleted') {
    return 'Akun ini sudah dihapus oleh admin. Hubungi admin jika menurut kamu ini keliru.';
  }
  if (status === 'suspended') {
    return 'Akun ini sedang disuspend oleh admin. Hubungi admin untuk membuka akses kembali.';
  }
  return 'Akun ini belum bisa digunakan.';
}

async function handleBlockedAccount(profile) {
  const message = getBlockedAccountMessage(profile);
  await db.auth.signOut().catch(() => {});
  await Swal.fire({
    icon: 'warning',
    title: 'Akses akun dibatasi',
    text: message,
    confirmButtonColor: '#059669'
  });
  window.location.replace('index.html');
}

function getProfileStatusLabel(profile) {
  const status = getAccountStatus(profile);
  if (status === 'suspended') return 'Suspend';
  if (status === 'deleted') return 'Dihapus';
  return 'Aktif';
}

function getProfileStatusBadge(profile) {
  const status = getAccountStatus(profile);
  if (status === 'suspended') {
    return '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-extrabold">Suspend</span>';
  }
  if (status === 'deleted') {
    return '<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-extrabold">Dihapus</span>';
  }
  return '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-extrabold">Aktif</span>';
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

  if (isAccountBlocked(profile)) {
    await handleBlockedAccount(profile);
    return;
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

  if (isAccountBlocked(currentProfile)) {
    await handleBlockedAccount(currentProfile);
    return false;
  }

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

    markOnboardingPendingForUser(data?.user, email);

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
    markOnboardingPendingForUser(currentUser, email);

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

async function ensurePasswordResetSession() {
  const cleanUrl = () => {
    if (window.history?.replaceState) {
      window.history.replaceState({}, document.title, `${window.location.origin}${window.location.pathname}`);
    }
  };

  const searchParams = new URLSearchParams(window.location.search || '');
  const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const code = searchParams.get('code') || hashParams.get('code');
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  let { data: sessionData, error: sessionError } = await db.auth.getSession();
  if (sessionError) throw sessionError;
  let session = sessionData?.session || null;

  if (!session && code) {
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (error) throw error;
    session = data?.session || null;
    cleanUrl();
  }

  if (!session && accessToken && refreshToken) {
    const { data, error } = await db.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) throw error;
    session = data?.session || null;
    cleanUrl();
  }

  if (!session) {
    throw new Error('Link reset password tidak valid atau sudah kedaluwarsa. Minta link baru dari halaman login. Begitulah link sekali pakai, dramanya pendek tapi tegas.');
  }

  return session;
}

async function initResetPasswordPage() {
  const notice = $('resetPasswordNotice');
  const saveBtn = $('resetPasswordSaveBtn');

  try {
    await ensurePasswordResetSession();
    if (notice) notice.textContent = 'Link valid. Silakan buat password baru.';
    if (saveBtn) saveBtn.disabled = false;
    $('resetNewPassword')?.focus();
  } catch (error) {
    console.warn('[Reset password init]', error);
    if (notice) notice.textContent = error?.message || 'Link reset password tidak valid atau sudah kedaluwarsa.';
    if (saveBtn) saveBtn.disabled = true;
  }
}

async function doUpdatePassword() {
  const password = $('resetNewPassword')?.value || '';
  const confirmPassword = $('resetConfirmPassword')?.value || '';
  const btn = $('resetPasswordSaveBtn') || globalThis.event?.target;

  if (password.length < 6) {
    return showWarning('Password terlalu pendek', 'Minimal 6 karakter. Password super pendek itu undangan terbuka untuk masalah.');
  }

  if (password !== confirmPassword) {
    return showWarning('Password tidak sama', 'Password baru dan ulangi password harus sama. Typo memang musuh lintas generasi.');
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
  }

  try {
    await ensurePasswordResetSession();
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;

    await db.auth.signOut().catch(() => {});

    await Swal.fire({
      icon: 'success',
      title: 'Password diperbarui',
      text: 'Silakan masuk kembali memakai password baru.',
      confirmButtonColor: '#059669'
    });

    window.location.replace('index.html');
    return true;
  } catch (error) {
    return showError('Gagal memperbarui password', error);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Simpan Password Baru';
    }
  }
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
    .channel(`user-session-${currentUser.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'transaksi',
      filter: `user_id=eq.${currentUser.id}`
    }, () => updateUI())
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'profiles',
      filter: `id=eq.${currentUser.id}`
    }, async (payload) => {
      if (payload?.new) currentProfile = payload.new;
      if (isAccountBlocked(currentProfile)) {
        await handleBlockedAccount(currentProfile);
        return;
      }
      applyFinanceSettingsFromProfile(currentProfile);
      fillProfileSettings();
      renderFinanceSettings();
      setJenis(jenisAktif);
      updateUI();
    })
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
  const nominal = parseNominalInput($('amount')?.value);
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
  setupNominalInputFormatter(modal);
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
  const nominal = parseNominalInput($('quickAmount')?.value);
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

  const overBudgetCategories = topPengeluaran
    .filter((item) => Number(item.persen_budget) >= 100)
    .map((item) => ({
      kategori: item.kategori,
      nominal: Math.round(Number(item.nominal) || 0),
      budget: Math.round(Number(item.budget) || 0),
      persen_budget: Math.round(Number(item.persen_budget) || 0),
      lebih_budget: Math.max(Math.round((Number(item.nominal) || 0) - (Number(item.budget) || 0)), 0)
    }))
    .slice(0, 5);

  const nearBudgetCategories = topPengeluaran
    .filter((item) => Number(item.persen_budget) >= 80 && Number(item.persen_budget) < 100)
    .map((item) => ({
      kategori: item.kategori,
      nominal: Math.round(Number(item.nominal) || 0),
      budget: Math.round(Number(item.budget) || 0),
      persen_budget: Math.round(Number(item.persen_budget) || 0),
      sisa_budget: Math.max(Math.round(Number(item.sisa_budget) || 0), 0)
    }))
    .slice(0, 5);

  const totalMasukNumber = Number(totalMasuk) || 0;
  const totalKeluarNumber = Number(totalKeluar) || 0;
  const potensiTabunganNumber = totalMasukNumber - totalKeluarNumber;
  const targetTabunganNumber = Number(targetTabunganBulanan) || 0;
  const rasioPengeluaranPemasukan = totalMasukNumber > 0
    ? Math.round((totalKeluarNumber / totalMasukNumber) * 100)
    : null;
  const targetTabunganTercapaiPersen = targetTabunganNumber > 0
    ? Math.round((Math.max(potensiTabunganNumber, 0) / targetTabunganNumber) * 100)
    : null;

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
      fokus: ['anomali angka periode ini', 'budget yang paling perlu diawasi', 'saldo akhir periode']
    },
    {
      gaya: 'roasting ringan seperti teman dekat, tidak kasar, emotikon secukupnya',
      fokus: ['pemasukan vs pengeluaran', 'kategori over budget', 'target tabungan']
    },
    {
      gaya: 'satir lembut, lucu, tetap solutif',
      fokus: ['kategori hampir habis', 'pola belanja yang paling mencolok', 'peluang hemat realistis']
    },
    {
      gaya: 'komentar tajam tapi hangat, ringkas, ekspresif',
      fokus: ['perubahan dari periode sebelumnya', 'jumlah transaksi', 'kategori pemasukan terbesar']
    },
    {
      gaya: 'humor receh finansial, tetap informatif',
      fokus: ['rasio pengeluaran terhadap pemasukan', 'sisa target tabungan', 'prioritas bulan depan']
    },
    {
      gaya: 'teman realistis yang suka nyindir halus',
      fokus: ['pengeluaran kecil yang menumpuk', 'kategori yang aman', 'peringatan ringan tanpa menggurui']
    }
  ];
  const variantKey = `${tahun}-${bulan}-${Math.round(totalMasuk || 0)}-${Math.round(totalKeluar || 0)}-${topPengeluaran.map((item) => `${item.kategori}:${item.nominal}`).join('|')}-${AI_INSIGHT_STYLE_VERSION}`;
  const variantIndex = parseInt(simpleHash(variantKey), 36) % insightVariants.length;
  const selectedVariant = insightVariants[variantIndex];

  const summary = {
    periode: namaPeriodeRingkasan,
    bulan,
    tahun,
    total_pemasukan: Math.round(totalMasukNumber),
    total_pengeluaran: Math.round(totalKeluarNumber),
    potensi_tabungan: Math.round(potensiTabunganNumber),
    target_tabungan: Math.round(targetTabunganNumber),
    sisa_target_tabungan: Math.max(Math.round(targetTabunganNumber - Math.max(potensiTabunganNumber, 0)), 0),
    target_tabungan_tercapai_persen: targetTabunganTercapaiPersen,
    rasio_pengeluaran_terhadap_pemasukan_persen: rasioPengeluaranPemasukan,
    status_saldo_periode: potensiTabunganNumber >= 0 ? 'surplus' : 'defisit',
    jumlah_transaksi: Number(jumlahTransaksiPeriode) || 0,
    jumlah_kategori_pengeluaran_aktif: topPengeluaran.length,
    jumlah_kategori_pemasukan_aktif: topPemasukan.length,
    variasi_bahasa: selectedVariant,
    variation_seed: simpleHash(variantKey),
    perbandingan_bulan_lalu: {
      pemasukan_bulan_lalu: Math.round(previousMasuk),
      pengeluaran_bulan_lalu: Math.round(previousKeluar),
      pemasukan_naik_persen: pemasukanChangePercent,
      pengeluaran_naik_persen: pengeluaranChangePercent
    },
    kategori_pengeluaran_terbesar: topPengeluaran,
    kategori_pemasukan_terbesar: topPemasukan,
    kategori_over_budget: overBudgetCategories,
    kategori_hampir_habis: nearBudgetCategories
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

  renderTotalBalance(totalSaldo);

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


function getSelectedOptionText(selectEl, fallback = '') {
  if (!selectEl) return fallback;
  return selectEl.options?.[selectEl.selectedIndex]?.textContent?.trim() || fallback || selectEl.value || '';
}

function getRiwayatFilterState() {
  const now = new Date();
  const monthSelect = $('filterBulan');
  const yearSelect = $('filterTahunRiwayat');

  const monthValue = monthSelect?.value || String(now.getMonth());
  const yearValue = yearSelect?.value || filterTahunAktif || String(now.getFullYear());

  const monthLabel = monthValue === 'Semua'
    ? 'Semua Bulan'
    : getSelectedOptionText(monthSelect, new Date(2026, Number(monthValue), 1).toLocaleDateString('id-ID', { month: 'long' }));

  const yearLabel = yearValue === 'Semua'
    ? 'Semua Tahun'
    : String(yearValue);

  let filePeriod = 'semua';
  if (monthValue === 'Semua' && yearValue !== 'Semua') {
    filePeriod = String(yearValue);
  } else if (monthValue !== 'Semua' && yearValue !== 'Semua') {
    filePeriod = `${yearValue}-${String(Number(monthValue) + 1).padStart(2, '0')}`;
  } else if (monthValue !== 'Semua' && yearValue === 'Semua') {
    filePeriod = `bulan-${String(Number(monthValue) + 1).padStart(2, '0')}-semua-tahun`;
  }

  return {
    monthValue,
    yearValue,
    monthLabel,
    yearLabel,
    label: `${monthLabel} ${yearLabel}`.trim(),
    filePeriod
  };
}

function filterTransactionsByRiwayat(data = [], filterState = getRiwayatFilterState()) {
  return (data || []).filter((item) => {
    const date = new Date(item.created_at);
    if (Number.isNaN(date.getTime())) return false;

    const matchMonth =
      filterState.monthValue === 'Semua' ||
      String(date.getMonth()) === String(filterState.monthValue);

    const matchYear =
      filterState.yearValue === 'Semua' ||
      String(date.getFullYear()) === String(filterState.yearValue);

    return matchMonth && matchYear;
  });
}

function buildExportRows(data = []) {
  return data.map((row, index) => {
    const date = new Date(row.created_at);
    const isValidDate = !Number.isNaN(date.getTime());

    return {
      No: index + 1,
      Tanggal: isValidDate ? date.toLocaleDateString('id-ID') : row.created_at,
      Jam: isValidDate ? date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '',
      Jenis: row.jenis === 'masuk' ? 'Pemasukan' : 'Pengeluaran',
      Kategori: row.kategori || '-',
      Nominal: Number(row.nominal) || 0
    };
  });
}

function getExportTotals(data = []) {
  return data.reduce((acc, row) => {
    const nominal = Number(row.nominal) || 0;
    if (row.jenis === 'masuk') acc.pemasukan += nominal;
    if (row.jenis === 'keluar') acc.pengeluaran += nominal;
    acc.selisih = acc.pemasukan - acc.pengeluaran;
    return acc;
  }, { pemasukan: 0, pengeluaran: 0, selisih: 0 });
}

function safeSheetName(name = 'Transaksi') {
  return String(name)
    .replace(/[\\/*?:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Transaksi';
}



function sumNominalByCategoryForExport(data = [], jenis = 'keluar') {
  return (data || []).reduce((acc, row) => {
    if (row.jenis !== jenis) return acc;
    const kategori = (row.kategori || '-').trim();
    acc[kategori] = (acc[kategori] || 0) + (Number(row.nominal) || 0);
    return acc;
  }, {});
}

function buildExpenseCategoryExportRows(data = []) {
  const terpakaiMap = sumNominalByCategoryForExport(data, 'keluar');
  const categoryNames = new Set([
    ...Object.keys(rencanaBudget || {}),
    ...Object.keys(terpakaiMap || {})
  ]);

  return Array.from(categoryNames).map((kategori, index) => {
    const budget = Number(rencanaBudget?.[kategori] || 0);
    const terpakai = Number(terpakaiMap?.[kategori] || 0);
    const sisa = budget - terpakai;
    const persen = budget > 0 ? Math.round((terpakai / budget) * 100) : (terpakai > 0 ? 100 : 0);

    return {
      No: index + 1,
      'Kategori Pengeluaran': kategori,
      'Budget': budget,
      'Terpakai Periode Filter': terpakai,
      'Sisa Budget': sisa,
      'Persentase Terpakai': `${persen}%`,
      'Status': budget <= 0
        ? (terpakai > 0 ? 'Belum ada budget' : 'Tanpa budget')
        : (terpakai > budget ? 'Over budget' : 'Aman')
    };
  });
}

function buildIncomeCategoryExportRows(data = []) {
  const terkumpulMap = sumNominalByCategoryForExport(data, 'masuk');
  const categoryNames = new Set([
    ...Object.keys(targetPemasukan || {}),
    ...Object.keys(terkumpulMap || {})
  ]);

  return Array.from(categoryNames).map((kategori, index) => {
    const target = Number(targetPemasukan?.[kategori] || 0);
    const terkumpul = Number(terkumpulMap?.[kategori] || 0);
    const selisih = target - terkumpul;
    const persen = target > 0 ? Math.round((terkumpul / target) * 100) : (terkumpul > 0 ? 100 : 0);

    return {
      No: index + 1,
      'Kategori Pemasukan': kategori,
      'Target': target,
      'Terkumpul Periode Filter': terkumpul,
      'Selisih Target': selisih,
      'Persentase Tercapai': `${persen}%`,
      'Status': target <= 0
        ? (terkumpul > 0 ? 'Belum ada target' : 'Tanpa target')
        : (terkumpul >= target ? 'Target tercapai' : 'Belum tercapai')
    };
  });
}

function appendJsonSheet(workbook, rows, sheetName, columns = []) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  if (columns.length) worksheet['!cols'] = columns;
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
  return worksheet;
}


async function exportToExcel() {
  if (!currentUser) return;

  let data = [];
  try {
    data = await fetchUserTransactions({ ascending: true });
  } catch (error) {
    return showError('Gagal export Excel', error);
  }

  const filterState = getRiwayatFilterState();
  const filteredData = filterTransactionsByRiwayat(data, filterState)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const rows = buildExportRows(filteredData);

  if (!rows.length) {
    return showWarning(
      'Belum ada data',
      `Tidak ada transaksi pada filter ${filterState.label}. File Excel kosong itu bukan laporan, itu cuma spreadsheet yang sedang merenung.`
    );
  }

  if (typeof XLSX === 'undefined') {
    return showWarning('Library Excel belum siap', 'XLSX belum termuat. Coba refresh halaman atau cek koneksi internet.');
  }

  const totals = getExportTotals(filteredData);
  const exportedAt = new Date();

  const expenseCategoryRows = buildExpenseCategoryExportRows(filteredData);
  const incomeCategoryRows = buildIncomeCategoryExportRows(filteredData);

  const summaryRows = [
    ['Laporan Riwayat Keuangan Olah Uang'],
    ['Periode', filterState.label],
    ['Tanggal Export', exportedAt.toLocaleString('id-ID')],
    ['Jumlah Transaksi', rows.length],
    ['Jumlah Kategori Pengeluaran', expenseCategoryRows.length],
    ['Jumlah Kategori Pemasukan', incomeCategoryRows.length],
    [],
    ['Total Pemasukan', totals.pemasukan],
    ['Total Pengeluaran', totals.pengeluaran],
    ['Selisih', totals.selisih]
  ];

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan');

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 24 },
    { wch: 16 }
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(`Transaksi ${filterState.filePeriod}`));

  appendJsonSheet(workbook, expenseCategoryRows, 'Kategori Pengeluaran', [
    { wch: 6 },
    { wch: 28 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 }
  ]);

  appendJsonSheet(workbook, incomeCategoryRows, 'Kategori Pemasukan', [
    { wch: 6 },
    { wch: 28 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 }
  ]);

  XLSX.writeFile(workbook, `riwayat-keuangan-${filterState.filePeriod}.xlsx`);
}



// ============================================================
// WEB PUSH NOTIFICATION — Ringkasan Harian Jam 22.00 WIB
// ============================================================
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function getVapidPublicKey() {
  const response = await fetch('/api/push-public-key');
  if (!response.ok) throw new Error('Gagal mengambil VAPID public key.');
  const data = await response.json();
  if (!data?.publicKey) throw new Error('VAPID_PUBLIC_KEY belum disetel di Environment Variables Vercel.');
  return data.publicKey;
}

function isPushNotificationSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function setDailyPushUiState(state = 'inactive', message = '') {
  const status = $('dailyPushStatus');
  const enableBtn = $('dailyPushEnableBtn');
  const disableBtn = $('dailyPushDisableBtn');

  if (status) {
    status.classList.toggle('is-active', state === 'active');
    status.classList.toggle('is-blocked', state === 'blocked' || state === 'unsupported');
    status.textContent = message || (
      state === 'active'
        ? 'Status: aktif setiap 22.00 WIB'
        : state === 'blocked'
          ? 'Status: izin diblokir'
          : state === 'unsupported'
            ? 'Status: tidak didukung'
            : 'Status: belum aktif'
    );
  }

  const showEnable = state === 'inactive';
  const showDisable = state === 'active';

  if (enableBtn) {
    enableBtn.classList.toggle('hidden', !showEnable);
    enableBtn.style.display = showEnable ? 'inline-flex' : 'none';
  }

  if (disableBtn) {
    disableBtn.classList.toggle('hidden', !showDisable);
    disableBtn.style.display = showDisable ? 'inline-flex' : 'none';
  }
}

async function syncDailyPushStatus() {
  if (!$('dailyPushStatus')) return;
  if (!isPushNotificationSupported()) return setDailyPushUiState('unsupported', 'Status: browser tidak mendukung');
  if (Notification.permission === 'denied') return setDailyPushUiState('blocked', 'Status: izin diblokir');

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') return setDailyPushUiState('active', 'Status: aktif setiap 22.00 WIB');
    return setDailyPushUiState('inactive', 'Status: belum aktif');
  } catch (error) {
    console.warn('[Daily push status]', error);
    return setDailyPushUiState('inactive', 'Status: belum aktif');
  }
}

async function savePushSubscription(subscription) {
  if (!currentUser?.id || !subscription) throw new Error('Akun atau subscription belum terbaca.');
  const subscriptionJson = subscription.toJSON();
  const keys = subscriptionJson.keys || {};

  const { error } = await db
    .from('push_subscriptions')
    .upsert({
      user_id: currentUser.id,
      endpoint: subscriptionJson.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent,
      is_active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });

  if (error) throw error;
}

async function enableDailyPushNotification() {
  if (!currentUser?.id) return showWarning('Akun belum terbaca', 'Silakan login ulang sebelum mengaktifkan notifikasi.');
  if (!isPushNotificationSupported()) return showWarning('Notifikasi tidak didukung', 'Browser/perangkat ini belum mendukung Web Push Notification.');

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      await syncDailyPushStatus();
      return showWarning('Izin notifikasi belum diberikan', 'Aktifkan izin notifikasi di browser agar ringkasan harian bisa dikirim.');
    }

    const publicKey = await getVapidPublicKey();
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();

    if (existingSubscription) {
      await savePushSubscription(existingSubscription);
      await syncDailyPushStatus();
      return Swal.fire({ icon: 'success', title: 'Notifikasi sudah aktif', text: 'Ringkasan harian akan dikirim setiap pukul 22.00 WIB.', timer: 1600, showConfirmButton: false });
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await savePushSubscription(subscription);
    await syncDailyPushStatus();

    return Swal.fire({ icon: 'success', title: 'Notifikasi aktif', text: 'Ringkasan harian akan dikirim setiap pukul 22.00 WIB.', timer: 1600, showConfirmButton: false });
  } catch (error) {
    console.error('[Enable daily push]', error);
    return showError('Gagal mengaktifkan notifikasi', error);
  }
}

async function disableDailyPushNotification() {
  if (!isPushNotificationSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      if (currentUser?.id) {
        await db
          .from('push_subscriptions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('user_id', currentUser.id)
          .eq('endpoint', endpoint);
      }
    }

    await syncDailyPushStatus();

    return Swal.fire({ icon: 'success', title: 'Notifikasi dimatikan', text: 'Ringkasan harian tidak akan dikirim ke perangkat ini.', timer: 1400, showConfirmButton: false });
  } catch (error) {
    console.error('[Disable daily push]', error);
    return showError('Gagal mematikan notifikasi', error);
  }
}

// ============================================================
// USER ONBOARDING / PANDUAN AWAL
// ============================================================
let onboardingStepIndex = 0;
let onboardingOpenedFromAuto = false;

const onboardingSteps = [
  {
    icon: '👋',
    visualTitle: 'Mulai dari gambaran besar',
    visualSubtitle: 'Olah Uang membantu pengguna memahami alur catat, pantau, dan evaluasi.',
    phoneLabel: 'Kenalan Singkat',
    title: 'Selamat datang di Olah Uang',
    description: 'Kenali alurnya: catat transaksi, pantau budget, lalu evaluasi uangmu.',
    highlights: [
      { icon: '💡', title: 'Dipakai untuk apa?', text: 'Catat transaksi, budget, dan kondisi uang harian.' },
      { icon: '🧭', title: 'Mulai dari mana?', text: 'Mulai dari Catat, lalu cek Riwayat dan Analisis.' }
    ],
    tip: 'Tips: catat saat transaksi terjadi, jangan tunggu akhir bulan.'
  },
  {
    icon: '✍️',
    visualTitle: 'Catat transaksi pertama',
    visualSubtitle: 'Pilih masuk atau keluar, tentukan kategori, isi nominal, lalu simpan.',
    phoneLabel: 'Menu Catat',
    title: 'Catat uang masuk dan keluar',
    description: 'Masukkan uang masuk dan keluar agar saldo serta laporan tetap akurat.',
    highlights: [
      { icon: '⬆️', title: 'Pemasukan', text: 'Contoh: gaji, bonus, atau sisa uang sebelumnya.' },
      { icon: '⬇️', title: 'Pengeluaran', text: 'Contoh: belanja, bensin, makan luar, atau paylater.' }
    ],
    tip: 'Alur cepat: jenis transaksi → kategori → nominal → simpan.'
  },
  {
    icon: '🎯',
    visualTitle: 'Budget jadi pagar pembatas',
    visualSubtitle: 'Atur batas tiap kategori supaya pengeluaran tidak liar seperti notifikasi grup keluarga.',
    phoneLabel: 'Budget Bulanan',
    title: 'Atur budget sesuai kebiasaanmu',
    description: 'Atur kategori, budget, target pemasukan, dan target tabungan di Setting.',
    highlights: [
      { icon: '🛒', title: 'Budget kategori', text: 'Contoh: Belanja Rp1.500.000 dan Bensin Rp200.000.' },
      { icon: '🔔', title: 'Peringatan otomatis', text: 'Aplikasi memberi peringatan saat budget hampir habis.' }
    ],
    tip: 'Budget itu pagar supaya saldo tidak kabur tanpa pamit.'
  },
  {
    icon: '📊',
    visualTitle: 'Pantau pola uangmu',
    visualSubtitle: 'Riwayat dan grafik membantu melihat uang paling banyak pergi ke mana.',
    phoneLabel: 'Analisis',
    title: 'Lihat riwayat dan analisis',
    description: 'Riwayat dan Analisis membantu membaca pola uangmu.',
    highlights: [
      { icon: '🗂️', title: 'Riwayat transaksi', text: 'Pakai filter bulan dan tahun untuk cek periode tertentu.' },
      { icon: '📈', title: 'Grafik keuangan', text: 'Lihat tren uang masuk, uang keluar, dan kategori terbesar.' }
    ],
    tip: 'Kalau pengeluaran lebih besar dari pemasukan, itu sinyal untuk evaluasi.'
  },
  {
    icon: '🚀',
    visualTitle: 'Siap dipakai',
    visualSubtitle: 'Mulai dari satu transaksi hari ini. Konsistensi kecil yang bikin data jadi berguna.',
    phoneLabel: 'Mulai Sekarang',
    title: 'Sekarang kamu siap mulai',
    description: 'Gunakan rutin agar analisis dan budget makin berguna.',
    highlights: [
      { icon: '✅', title: 'Langkah pertama', text: 'Klik Selesai untuk menutup panduan, lalu mulai dari menu Catat.' },
      { icon: '🔁', title: 'Kebiasaan terbaik', text: 'Catat setiap hari agar tidak menebak di akhir bulan.' }
    ],
    tip: 'Data rapi bikin keputusan keuangan lebih mudah.'
  }
]


function getOnboardingSeenKey(userId = currentUser?.id) {
  return userId ? `olahUangOnboardingSeen:${userId}` : '';
}

function getOnboardingPendingKey(userId = currentUser?.id) {
  return userId ? `olahUangOnboardingPending:${userId}` : '';
}

function getOnboardingPendingEmailKey(email = currentUser?.email) {
  return email ? `olahUangOnboardingPendingEmail:${String(email).toLowerCase()}` : '';
}

function markOnboardingPendingForUser(user = currentUser, email = '') {
  try {
    const pendingKey = getOnboardingPendingKey(user?.id);
    const pendingEmailKey = getOnboardingPendingEmailKey(email || user?.email);

    if (pendingKey) localStorage.setItem(pendingKey, '1');
    if (pendingEmailKey) localStorage.setItem(pendingEmailKey, '1');
  } catch (error) {
    console.warn('[Onboarding pending]', error);
  }
}

function clearOnboardingPendingForUser() {
  try {
    const pendingKey = getOnboardingPendingKey();
    const pendingEmailKey = getOnboardingPendingEmailKey();

    if (pendingKey) localStorage.removeItem(pendingKey);
    if (pendingEmailKey) localStorage.removeItem(pendingEmailKey);
  } catch (error) {
    console.warn('[Onboarding clear pending]', error);
  }
}

function hasOnboardingPendingForUser() {
  try {
    const pendingKey = getOnboardingPendingKey();
    const pendingEmailKey = getOnboardingPendingEmailKey();

    return Boolean(
      (pendingKey && localStorage.getItem(pendingKey) === '1') ||
      (pendingEmailKey && localStorage.getItem(pendingEmailKey) === '1')
    );
  } catch (error) {
    return false;
  }
}

function isProfileRecentlyCreated(profile = currentProfile) {
  const createdAt = profile?.created_at || currentUser?.created_at;
  if (!createdAt) return false;

  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) return false;

  return Date.now() - createdTime <= 1000 * 60 * 60 * 24;
}

function shouldShowOnboardingGuide() {
  const seenKey = getOnboardingSeenKey();
  const localSeen = seenKey ? localStorage.getItem(seenKey) === '1' : false;
  const forcedByRegistration = hasOnboardingPendingForUser();

  if (forcedByRegistration) return true;
  if (currentProfile?.onboarding_seen === false) return true;
  if (currentProfile?.onboarding_seen === true) return false;

  // Fallback kalau kolom onboarding_seen belum kebaca karena schema cache,
  // tapi akun benar-benar baru. Browser dan database kadang kompak bikin bingung.
  return !localSeen && isProfileRecentlyCreated(currentProfile);
}



function renderOnboardingGuide() {
  const modal = $('onboardingModal');
  if (!modal) return;

  const step = onboardingSteps[onboardingStepIndex] || onboardingSteps[0];
  const totalSteps = onboardingSteps.length;
  const progress = Math.round(((onboardingStepIndex + 1) / totalSteps) * 100);

  const visualIcon = $('onboardingVisualIcon');
  if (visualIcon) visualIcon.textContent = step.icon;

  if ($('onboardingEyebrow')) $('onboardingEyebrow').textContent = `Langkah ${onboardingStepIndex + 1} dari ${totalSteps}`;
  if ($('onboardingTitle')) $('onboardingTitle').textContent = step.title;
  if ($('onboardingDescription')) $('onboardingDescription').textContent = step.description;

  if ($('onboardingVisualTitle')) $('onboardingVisualTitle').textContent = step.visualTitle || step.title;
  if ($('onboardingVisualSubtitle')) $('onboardingVisualSubtitle').textContent = step.visualSubtitle || step.description;
  if ($('onboardingPhoneLabel')) $('onboardingPhoneLabel').textContent = step.phoneLabel || 'Panduan';
  if ($('onboardingPhoneBadge')) $('onboardingPhoneBadge').textContent = `Step ${onboardingStepIndex + 1}`;

  const highlights = $('onboardingHighlights');
  if (highlights) {
    highlights.innerHTML = (step.highlights || [])
      .map((item) => `
        <div class="onboarding-highlight">
          <div class="onboarding-highlight-icon">${escapeHTML(item.icon || '•')}</div>
          <div>
            <strong>${escapeHTML(item.title || '')}</strong>
            <span>${escapeHTML(item.text || '')}</span>
          </div>
        </div>
      `)
      .join('');
  }

  const tip = $('onboardingTip');
  if (tip) {
    tip.textContent = step.tip || '';
    tip.classList.toggle('hidden', !step.tip);
  }

  const dots = $('onboardingDots');
  if (dots) {
    dots.innerHTML = onboardingSteps
      .map((_, index) => `<span class="onboarding-dot ${index === onboardingStepIndex ? 'is-active' : ''}" aria-hidden="true"></span>`)
      .join('');
  }

  const backBtn = $('onboardingBackBtn');
  if (backBtn) backBtn.disabled = onboardingStepIndex === 0;

  const nextBtn = $('onboardingNextBtn');
  if (nextBtn) nextBtn.textContent = onboardingStepIndex === totalSteps - 1
    ? 'Selesai'
    : 'Lanjut';

  const skipBtn = $('onboardingSkipBtn');
  if (skipBtn) skipBtn.textContent = onboardingOpenedFromAuto ? 'Lewati' : 'Tutup';
}

function openOnboardingGuide(auto = false) {
  onboardingOpenedFromAuto = Boolean(auto);
  onboardingStepIndex = 0;
  renderOnboardingGuide();

  const modal = $('onboardingModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
}

function closeOnboardingGuide(markSeen = false) {
  const modal = $('onboardingModal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');

  if (markSeen) markOnboardingSeen().catch((error) => console.warn('[Onboarding seen]', error));
}

function nextOnboardingStep() {
  if (onboardingStepIndex < onboardingSteps.length - 1) {
    onboardingStepIndex += 1;
    renderOnboardingGuide();
    return;
  }

  finishOnboardingGuide(false);
}

function previousOnboardingStep() {
  if (onboardingStepIndex <= 0) return;
  onboardingStepIndex -= 1;
  renderOnboardingGuide();
}

async function markOnboardingSeen() {
  if (!currentUser) return;

  try {
    const seenKey = getOnboardingSeenKey();
    if (seenKey) localStorage.setItem(seenKey, '1');
    clearOnboardingPendingForUser();
  } catch (error) {
    console.warn('[Onboarding local seen]', error);
  }

  const { data, error } = await db
    .from('profiles')
    .update({ onboarding_seen: true })
    .eq('id', currentUser.id)
    .select('*')
    .single();

  if (error) {
    console.warn('[Onboarding] Gagal menyimpan status panduan. Pastikan SQL onboarding sudah dijalankan.', error);
    return;
  }

  if (data) currentProfile = data;
}

async function finishOnboardingGuide(goToCatat = true) {
  closeOnboardingGuide(false);

  if (onboardingOpenedFromAuto || currentProfile?.onboarding_seen === false) {
    await markOnboardingSeen();
  }

  if (goToCatat) {
    await showAppView('catat');
    setTimeout(() => {
      const nominalInput = $('amount');
      if (nominalInput) nominalInput.focus();
    }, 120);
  }
}

function maybeShowOnboardingGuide() {
  if (shouldShowOnboardingGuide()) {
    setTimeout(() => openOnboardingGuide(true), 500);
  }
}


async function initUserDashboard() {
  const ok = await requireAuth();
  if (!ok) return;

  // Baca ulang profile dari database agar perubahan role terbaru langsung dipakai,
  // bukan mengandalkan state lama di browser. Karena cache dan state lama itu
  // tampaknya punya cita-cita menjadi sumber kekacauan.
  const freshProfile = await waitForProfile(currentUser.id, 1);
  if (freshProfile) currentProfile = freshProfile;

  if (isAccountBlocked(currentProfile)) {
    await handleBlockedAccount(currentProfile);
    return;
  }

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
  startUserPresence();
  await updateUI();
  localStorage.removeItem('olahUangActiveView');
  showAppView('beranda');
  maybeShowOnboardingGuide();
}



// ============================================================
// ADMIN VIEW NAVIGATION
// ============================================================
function getAdminViewLabel(view = activeAdminView) {
  const labels = {
    overview: 'Ringkasan',
    users: 'Pengguna',
    activity: 'Aktivitas',
    recovery: 'Bantuan Akun',
    transactions: 'Transaksi'
  };
  return labels[view] || 'Ringkasan';
}

function showAdminView(view = 'overview') {
  const available = ['overview', 'users', 'activity', 'recovery', 'transactions'];
  const targetView = available.includes(view) ? view : 'overview';
  activeAdminView = targetView;

  document.querySelectorAll('[data-admin-view]').forEach((section) => {
    section.classList.toggle('hidden', section.dataset.adminView !== targetView);
  });

  document.querySelectorAll('[data-admin-nav]').forEach((button) => {
    const isActive = button.dataset.adminNav === targetView;
    button.classList.toggle('admin-nav-active', isActive);
    button.classList.toggle('admin-nav-idle', !isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  const title = $('adminPageTitle');
  const subtitle = $('adminPageSubtitle');

  const subtitles = {
    overview: 'Pantau ringkasan performa aplikasi dan data keuangan seluruh user.',
    users: 'Kelola akun user, role, status akses, suspend, dan hapus akun.',
    activity: 'Lihat user aktif, pendaftaran terbaru, dan aktivitas transaksi per user.',
    recovery: 'Tangani permintaan bantuan akun dari pengguna yang lupa email atau akses.',
    transactions: 'Pantau seluruh transaksi terbaru dari semua akun pengguna.'
  };

  if (title) title.textContent = getAdminViewLabel(targetView);
  if (subtitle) subtitle.textContent = subtitles[targetView] || subtitles.overview;

  localStorage.setItem('olahUangAdminView', targetView);
  if (window.location.hash !== `#${targetView}`) {
    history.replaceState(null, '', `#${targetView}`);
  }

  updateUserPresence(`Dashboard Admin - ${getAdminViewLabel(targetView)}`).catch((error) => console.warn('[Presence admin view]', error));

  if (targetView === 'overview') {
    setTimeout(() => {
      renderStatCards(allProfiles, allTrxData, allRecoveryRequests, allUserActivity);
      renderUserActivity(allProfiles, allTrxData);
      renderAdminChart(allTrxData);
    }, 120);
  }

  if (targetView === 'activity') {
    renderActiveUsers(allUserActivity);
    renderNewUsers(allProfiles);
  }

  if (targetView === 'users') {
    updateAdminUserFilterStateFromUI();
    renderUserTable(allProfiles, allTrxData);
  }

  if (targetView === 'recovery') {
    renderAccountRecoveryRequests(allRecoveryRequests);
  }

  if (targetView === 'transactions') {
    updateAdminTrxFilterStateFromUI();
    renderAllTrx();
  }
}

function getInitialAdminView() {
  const hash = String(window.location.hash || '').replace('#', '').trim();
  const stored = localStorage.getItem('olahUangAdminView');
  const available = ['overview', 'users', 'activity', 'recovery', 'transactions'];

  if (available.includes(hash)) return hash;
  if (available.includes(stored)) return stored;
  return 'overview';
}



// ============================================================
// ADMIN FILTER / SEARCH
// ============================================================
function normalizeAdminSearch(value = '') {
  return String(value || '').trim().toLowerCase();
}

function setTextIfExists(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function updateAdminUserFilterStateFromUI() {
  adminUserSearchTerm = normalizeAdminSearch($('adminUserSearch')?.value || '');
  adminUserRoleFilter = $('adminUserRoleFilter')?.value || 'all';
  adminUserStatusFilter = $('adminUserStatusFilter')?.value || 'all';
}

function updateAdminTrxFilterStateFromUI() {
  adminTrxSearchTerm = normalizeAdminSearch($('adminTrxSearch')?.value || '');
  adminTrxTypeFilter = $('adminTrxTypeFilter')?.value || 'all';
  adminTrxUserFilter = $('adminTrxUserFilter')?.value || 'all';
}

function getFilteredAdminProfiles(profiles = allProfiles) {
  const q = adminUserSearchTerm;
  return [...(profiles || [])].filter((profile) => {
    const status = getAccountStatus(profile);
    const role = profile.role || 'user';
    const searchText = [
      profile.nama,
      profile.email,
      profile.nomor_hp,
      role,
      status
    ].map((item) => String(item || '').toLowerCase()).join(' ');

    const matchSearch = !q || searchText.includes(q);
    const matchRole = adminUserRoleFilter === 'all' || role === adminUserRoleFilter;
    const matchStatus = adminUserStatusFilter === 'all' || status === adminUserStatusFilter;

    return matchSearch && matchRole && matchStatus;
  });
}

function getFilteredAdminTrx(trx = allTrxData) {
  const q = adminTrxSearchTerm;
  return [...(trx || [])].filter((item) => {
    const profile = allProfiles.find((p) => p.id === item.user_id);
    const userText = [
      profile?.nama,
      profile?.email,
      item.kategori,
      item.jenis,
      formatTanggal(item.created_at, { day: 'numeric', month: 'short', year: 'numeric' }),
      Number(item.nominal) || 0
    ].map((value) => String(value || '').toLowerCase()).join(' ');

    const matchSearch = !q || userText.includes(q);
    const matchType = adminTrxTypeFilter === 'all' || item.jenis === adminTrxTypeFilter;
    const matchUser = adminTrxUserFilter === 'all' || item.user_id === adminTrxUserFilter;

    return matchSearch && matchType && matchUser;
  });
}

function populateAdminTrxUserFilter() {
  const select = $('adminTrxUserFilter');
  if (!select) return;

  const previous = select.value || adminTrxUserFilter || 'all';
  const profiles = [...(allProfiles || [])]
    .filter((profile) => getAccountStatus(profile) !== 'deleted')
    .sort((a, b) => String(a.nama || a.email || '').localeCompare(String(b.nama || b.email || ''), 'id-ID'));

  select.innerHTML = [
    '<option value="all">Semua user</option>',
    ...profiles.map((profile) => `<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.nama || profile.email || 'Pengguna')}</option>`)
  ].join('');

  select.value = profiles.some((profile) => profile.id === previous) ? previous : 'all';
  adminTrxUserFilter = select.value;
}

function updateAdminUserFilterSummary(filteredCount, totalCount) {
  setTextIfExists('adminUserFilterCount', `${filteredCount} dari ${totalCount} akun`);
}

function updateAdminTrxFilterSummary(filteredCount, totalCount) {
  setTextIfExists('adminTrxFilterCount', `${filteredCount} dari ${totalCount} transaksi`);
}

function applyAdminUserFilters() {
  updateAdminUserFilterStateFromUI();
  renderUserTable(allProfiles, allTrxData);
}

function resetAdminUserFilters() {
  if ($('adminUserSearch')) $('adminUserSearch').value = '';
  if ($('adminUserRoleFilter')) $('adminUserRoleFilter').value = 'all';
  if ($('adminUserStatusFilter')) $('adminUserStatusFilter').value = 'all';
  updateAdminUserFilterStateFromUI();
  renderUserTable(allProfiles, allTrxData);
}

function applyAdminTrxFilters() {
  updateAdminTrxFilterStateFromUI();
  adminTrxPage = 1;
  renderAllTrx();
}

function resetAdminTrxFilters() {
  if ($('adminTrxSearch')) $('adminTrxSearch').value = '';
  if ($('adminTrxTypeFilter')) $('adminTrxTypeFilter').value = 'all';
  if ($('adminTrxUserFilter')) $('adminTrxUserFilter').value = 'all';
  updateAdminTrxFilterStateFromUI();
  adminTrxPage = 1;
  renderAllTrx();
}


// ============================================================
// USER PRESENCE / AKTIVITAS ONLINE
// ============================================================
function getCurrentPresencePageLabel() {
  const page = document.body?.dataset?.page || detectPageFromPath();

  if (page === 'dashboard-admin') return `Dashboard Admin - ${getAdminViewLabel(activeAdminView)}`;

  const map = {
    beranda: 'Beranda',
    riwayat: 'Riwayat',
    catat: 'Catat Transaksi',
    analisis: 'Analisis',
    setting: 'Pengaturan'
  };

  if (page === 'dashboard-user') return map[activeAppView] || 'Dashboard User';
  if (page === 'login') return 'Halaman Login';
  return 'Website';
}

async function updateUserPresence(pageLabel = getCurrentPresencePageLabel()) {
  if (!currentUser) return false;

  const now = new Date().toISOString();

  const { error } = await db
    .from('user_activity')
    .upsert({
      user_id: currentUser.id,
      current_page: pageLabel,
      last_seen: now,
      updated_at: now
    }, { onConflict: 'user_id' });

  if (error) {
    console.warn('[User presence gagal]', error);
    return false;
  }

  return true;
}

function startUserPresence() {
  if (!currentUser) return;

  if (userPresenceTimer) clearInterval(userPresenceTimer);

  updateUserPresence().catch((error) => console.warn('[Presence init]', error));

  userPresenceTimer = setInterval(() => {
    updateUserPresence().catch((error) => console.warn('[Presence interval]', error));
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      updateUserPresence().catch((error) => console.warn('[Presence visible]', error));
    }
  });

  window.addEventListener('focus', () => {
    updateUserPresence().catch((error) => console.warn('[Presence focus]', error));
  });
}

function getLastSeenInfo(lastSeenValue) {
  const date = new Date(lastSeenValue);
  if (Number.isNaN(date.getTime())) {
    return { online: false, label: '-', minutes: Infinity };
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(Math.floor(diffMs / 60000), 0);
  const online = diffMs <= 120000;

  if (diffMs < 15000) return { online, label: 'baru saja', minutes };
  if (minutes < 1) return { online, label: 'kurang dari 1 menit lalu', minutes };
  if (minutes < 60) return { online, label: `${minutes} menit lalu`, minutes };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { online, label: `${hours} jam lalu`, minutes };

  return {
    online,
    label: date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
    minutes
  };
}

function renderActiveUsers(activity = [], error = null) {
  const container = $('activeUsersBody');
  if (!container) return;

  if (error) {
    container.innerHTML = `
      <div class="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm text-amber-700">
        Fitur pengguna aktif belum bisa dibaca. Jalankan SQL terbaru dulu di Supabase.
      </div>`;
    if ($('statActiveUsers')) $('statActiveUsers').textContent = '—';
    return;
  }

  const rows = (activity || [])
    .map((item) => {
      const profile = allProfiles.find((p) => p.id === item.user_id);
      const seen = getLastSeenInfo(item.last_seen);
      return {
        ...item,
        profile,
        seen,
        nama: profile?.nama || profile?.email || item.user_id || 'Pengguna',
        email: profile?.email || '-',
        role: profile?.role || 'user'
      };
    })
    .filter((item) => item.seen.online && getAccountStatus(item.profile) === 'active')
    .sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen))
    .slice(0, 10);

  if ($('statActiveUsers')) $('statActiveUsers').textContent = rows.length;

  if (!rows.length) {
    container.innerHTML = `
      <div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
        Belum ada pengguna yang sedang aktif.
      </div>`;
    return;
  }

  container.innerHTML = rows.map((item) => {
    const roleBadge = item.role === 'admin'
      ? '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">Admin</span>'
      : '<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">User</span>';

    return `
      <div class="admin-activity-list-card flex items-start justify-between gap-3 rounded-2xl px-4 py-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="admin-activity-dot h-2.5 w-2.5 rounded-full"></span>
            <p class="admin-activity-name truncate font-extrabold">${escapeHTML(item.nama)}</p>
            ${roleBadge}
          </div>
          <p class="admin-activity-email mt-1 truncate text-xs">${escapeHTML(item.email)}</p>
          <p class="admin-activity-page mt-1 text-xs font-bold">${escapeHTML(item.current_page || 'Website')}</p>
        </div>
        <p class="admin-activity-time shrink-0 text-right text-[11px] font-bold">${escapeHTML(item.seen.label)}</p>
      </div>`;
  }).join('');
}

function renderNewUsers(profiles = []) {
  const container = $('newUsersBody');
  if (!container) return;

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  const sorted = [...(profiles || [])]
    .filter((profile) => profile.created_at && getAccountStatus(profile) !== 'deleted')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const todayCount = sorted.filter((profile) => {
    const date = new Date(profile.created_at);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === todayKey;
  }).length;

  if ($('statNewUsersToday')) $('statNewUsersToday').textContent = todayCount;

  const latest = sorted.slice(0, 8);

  if (!latest.length) {
    container.innerHTML = `
      <div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
        Belum ada data pengguna baru.
      </div>`;
    return;
  }

  container.innerHTML = latest.map((profile) => {
    const joined = new Date(profile.created_at);
    const tanggal = Number.isNaN(joined.getTime())
      ? '-'
      : joined.toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

    const roleBadge = profile.role === 'admin'
      ? '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">Admin</span>'
      : '<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">User</span>';

    return `
      <div class="admin-activity-list-card flex items-start justify-between gap-3 rounded-2xl px-4 py-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <p class="admin-activity-name truncate font-extrabold">${escapeHTML(profile.nama || profile.email || 'Pengguna')}</p>
            ${roleBadge}
          </div>
          <p class="admin-activity-email mt-1 truncate text-xs">${escapeHTML(profile.email || '-')}</p>
          <p class="admin-activity-page mt-1 text-xs font-bold">${escapeHTML(tanggal)}</p>
        </div>
        ${new Date(profile.created_at).toISOString().slice(0, 10) === todayKey ? '<span class="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-extrabold text-violet-700">Hari ini</span>' : ''}
      </div>`;
  }).join('');
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_activity' }, () => muatData(false))
    .subscribe();
}

async function muatData(showLoading = true) {
  if (showLoading && $('userTableBody')) {
    $('userTableBody').innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400"><div class="inline-flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold">⏳ Memuat data pengguna...</div></td></tr>';
  }
  if (showLoading && $('accountRecoveryBody')) {
    $('accountRecoveryBody').innerHTML = '<tr><td colspan="7" class="px-6 py-6 text-center text-gray-400">Memuat permintaan bantuan akun...</td></tr>';
  }
  if (showLoading && $('activeUsersBody')) {
    $('activeUsersBody').innerHTML = '<div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">Memuat pengguna aktif...</div>';
  }
  if (showLoading && $('newUsersBody')) {
    $('newUsersBody').innerHTML = '<div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">Memuat pengguna baru...</div>';
  }
  if (showLoading && $('allTrxBody')) {
    $('allTrxBody').innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400"><div class="inline-flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold">⏳ Memuat transaksi semua user...</div></td></tr>';
  }
  if (showLoading && $('allTrxCardsBody')) {
    $('allTrxCardsBody').innerHTML = '<div class="rounded-3xl border border-gray-100 bg-gray-50 px-5 py-6 text-center text-sm font-bold text-gray-400">⏳ Memuat transaksi...</div>';
  }

  let profilesData = [];
  let trxData = [];
  let recoveryData = [];
  let recoveryError = null;
  let activityData = [];
  let activityError = null;

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

  try {
    activityData = await fetchAllUserActivity();
  } catch (error) {
    activityError = error;
    console.error('[Gagal mengambil aktivitas pengguna]', error);
  }

  allProfiles = profilesData || [];
  allTrxData = trxData || [];
  allRecoveryRequests = recoveryData || [];
  allUserActivity = activityData || [];

  populateAdminTrxUserFilter();

  renderStatCards(allProfiles, allTrxData, allRecoveryRequests, allUserActivity);
  renderAccountRecoveryRequests(allRecoveryRequests, recoveryError);
  renderActiveUsers(allUserActivity, activityError);
  renderNewUsers(allProfiles);
  renderUserTable(allProfiles, allTrxData);
  renderUserActivity(allProfiles, allTrxData);
  renderAllTrx();
  renderAdminChart(allTrxData);
}

function renderStatCards(profiles, trx, recoveryRequests = [], userActivity = []) {
  const totalMasuk = trx
    .filter((item) => item.jenis === 'masuk')
    .reduce((acc, item) => acc + (Number(item.nominal) || 0), 0);

  const totalKeluar = trx
    .filter((item) => item.jenis === 'keluar')
    .reduce((acc, item) => acc + (Number(item.nominal) || 0), 0);

  const totalRecoveryNew = recoveryRequests.filter((item) => (item.status || 'baru') === 'baru').length;
  const totalActiveUsers = (userActivity || []).filter((item) => getLastSeenInfo(item.last_seen).online).length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const totalNewToday = (profiles || []).filter((profile) => {
    const date = new Date(profile.created_at);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === todayKey;
  }).length;

  if ($('statTotalUser')) $('statTotalUser').textContent = profiles.filter((profile) => getAccountStatus(profile) !== 'deleted').length;
  if ($('statTotalTrx')) $('statTotalTrx').textContent = trx.length;
  if ($('statTotalMasuk')) $('statTotalMasuk').textContent = formatRupiah(totalMasuk);
  if ($('statTotalKeluar')) $('statTotalKeluar').textContent = formatRupiah(totalKeluar);
  if ($('statNetBalance')) {
    const netBalance = totalMasuk - totalKeluar;
    $('statNetBalance').textContent = formatRupiah(netBalance);
    $('statNetBalance').classList.toggle('text-emerald-600', netBalance >= 0);
    $('statNetBalance').classList.toggle('text-rose-500', netBalance < 0);
    $('statNetBalance').classList.toggle('text-gray-900', false);
  }
  if ($('statRecoveryNew')) $('statRecoveryNew').textContent = totalRecoveryNew;
  if ($('statActiveUsers')) $('statActiveUsers').textContent = totalActiveUsers;
  if ($('statNewUsersToday')) $('statNewUsersToday').textContent = totalNewToday;
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


function recoveryActionIcon(type) {
  const icons = {
    process: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    done: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75l2.25 2.25L15 9.75"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 3.75a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5z"/></svg>',
    reject: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 3.75a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5z"/></svg>'
  };

  return icons[type] || '';
}

function renderRecoveryActionButtons(request) {
  const status = request.status || 'baru';
  const id = escapeHTML(request.id);

  const buttons = [
    status !== 'diproses'
      ? `<button onclick="updateRecoveryStatus('${id}','diproses')" class="admin-icon-btn admin-icon-process" title="Proses bantuan" aria-label="Proses bantuan">${recoveryActionIcon('process')}</button>`
      : '',
    status !== 'selesai'
      ? `<button onclick="updateRecoveryStatus('${id}','selesai')" class="admin-icon-btn admin-icon-success" title="Tandai selesai" aria-label="Tandai selesai">${recoveryActionIcon('done')}</button>`
      : '',
    status !== 'ditolak'
      ? `<button onclick="updateRecoveryStatus('${id}','ditolak')" class="admin-icon-btn admin-icon-danger" title="Tolak bantuan" aria-label="Tolak bantuan">${recoveryActionIcon('reject')}</button>`
      : ''
  ].filter(Boolean).join('');

  return `<div class=\"admin-actions-wrap\">${buttons || '<span class=\"text-xs text-gray-400\">Tidak ada aksi</span>'}</div>`;
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
        <td class="admin-actions-cell px-6 py-4">
          ${renderRecoveryActionButtons(request)}
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

function adminActionIcon(type) {
  const icons = {
    edit: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L9.38 17.273a4.5 4.5 0 01-1.897 1.13l-2.685.805.805-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 7.125L16.875 4.5"/></svg>',
    suspend: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636A9 9 0 115.636 18.364 9 9 0 0118.364 5.636z"/><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75l10.5 10.5"/></svg>',
    active: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75l2.25 2.25L15 9.75"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 3.75a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5z"/></svg>',
    delete: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M19.228 5.79L18.16 19.673A2.25 2.25 0 0115.916 21.75H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .563c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>'
  };

  return icons[type] || '';
}

function renderUserActionButtons(profile, isSuspended, isSelf, isDeleted) {
  const id = escapeHTML(profile.id);
  const editDisabled = isDeleted ? 'disabled' : '';
  const suspendDisabled = (isSelf || isDeleted) ? 'disabled' : '';
  const deleteDisabled = isSelf || isDeleted ? 'disabled' : '';
  const suspendClass = isSuspended ? 'admin-icon-success' : 'admin-icon-warning';
  const suspendTitle = isSuspended ? 'Aktifkan akun' : 'Suspend akun';
  const suspendIcon = isSuspended ? adminActionIcon('active') : adminActionIcon('suspend');

  return `
    <div class="admin-actions-wrap">
      <button onclick="editAdminUser('${id}')" ${editDisabled}
        class="admin-icon-btn admin-icon-edit" title="Edit akun" aria-label="Edit akun">
        ${adminActionIcon('edit')}
      </button>
      <button onclick="setUserSuspended('${id}', ${isSuspended ? 'false' : 'true'})" ${suspendDisabled}
        class="admin-icon-btn ${suspendClass}" title="${suspendTitle}" aria-label="${suspendTitle}">
        ${suspendIcon}
      </button>
      <button onclick="deleteAdminUser('${id}')" ${deleteDisabled}
        class="admin-icon-btn admin-icon-danger" title="Hapus akun" aria-label="Hapus akun">
        ${adminActionIcon('delete')}
      </button>
    </div>`;
}

function renderUserTable(profiles, trx) {
  const body = $('userTableBody');
  const cards = $('userCardsBody');
  if (!body && !cards) return;

  const all = [...(profiles || [])];
  const filteredProfiles = getFilteredAdminProfiles(all);
  updateAdminUserFilterSummary(filteredProfiles.length, all.length);

  const emptyState = (icon, title, desc) => `
    <div class="mx-auto max-w-md rounded-3xl border border-gray-100 bg-gray-50 px-5 py-6 text-center">
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl">${icon}</div>
      <p class="font-extrabold text-gray-800">${title}</p>
      <p class="mt-1 text-sm text-gray-400">${desc}</p>
    </div>`;

  if (!all.length) {
    if (body) body.innerHTML = `<tr><td colspan="6" class="px-6 py-10">${emptyState('👥', 'Belum ada pengguna', 'Data akun akan muncul setelah user berhasil daftar.')}</td></tr>`;
    if (cards) cards.innerHTML = emptyState('👥', 'Belum ada pengguna', 'Data akun akan muncul setelah user berhasil daftar.');
    return;
  }

  if (!filteredProfiles.length) {
    if (body) body.innerHTML = `<tr><td colspan="6" class="px-6 py-10">${emptyState('🔎', 'Tidak ada user yang cocok', 'Coba ubah kata kunci, role, atau status filter.')}</td></tr>`;
    if (cards) cards.innerHTML = emptyState('🔎', 'Tidak ada user yang cocok', 'Coba ubah kata kunci, role, atau status filter.');
    return;
  }

  const rows = filteredProfiles.map((profile) => {
    const jumlahTrx = trx.filter((item) => item.user_id === profile.id).length;
    const tanggal = formatTanggal(profile.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    const isAdmin = profile.role === 'admin';
    const isSelf = profile.id === currentUser?.id;
    const status = getAccountStatus(profile);
    const isDeleted = status === 'deleted';
    const isSuspended = status === 'suspended';
    const initial = escapeHTML(String(profile.nama || profile.email || '?').slice(0, 1).toUpperCase());
    const roleBadge = isAdmin
      ? '<span class="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-700">Admin</span>'
      : '<span class="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-extrabold text-blue-700">User</span>';

    return `
      <tr class="border-b border-gray-50 transition hover:bg-gray-50 ${isDeleted ? 'opacity-70' : ''}">
        <td class="px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-extrabold text-emerald-700">${initial}</div>
            <div class="min-w-0">
              <p class="truncate font-extrabold text-gray-900" title="${escapeHTML(profile.nama || '')}">${escapeHTML(profile.nama || '—')}</p>
              ${isSelf ? '<p class="mt-1 text-[10px] font-bold text-emerald-600">Akun kamu</p>' : ''}
            </div>
          </div>
        </td>
        <td class="px-5 py-4">
          <span class="admin-user-email text-sm font-semibold text-gray-500" title="${escapeHTML(profile.email || '—')}">${escapeHTML(profile.email || '—')}</span>
        </td>
        <td class="px-5 py-4">${roleBadge}</td>
        <td class="px-5 py-4">${getProfileStatusBadge(profile)}</td>
        <td class="px-5 py-4">
          <div>
            <p class="whitespace-nowrap font-bold text-gray-600">${escapeHTML(tanggal)}</p>
            <p class="mt-1 text-[11px] text-gray-400">${jumlahTrx} transaksi</p>
          </div>
        </td>
        <td class="admin-actions-cell px-5 py-4">${renderUserActionButtons(profile, isSuspended, isSelf, isDeleted)}</td>
      </tr>`;
  }).join('');

  const cardItems = filteredProfiles.map((profile) => {
    const jumlahTrx = trx.filter((item) => item.user_id === profile.id).length;
    const tanggal = formatTanggal(profile.created_at, { day: 'numeric', month: 'short', year: 'numeric' });
    const isAdmin = profile.role === 'admin';
    const isSelf = profile.id === currentUser?.id;
    const status = getAccountStatus(profile);
    const isDeleted = status === 'deleted';
    const isSuspended = status === 'suspended';
    const initial = escapeHTML(String(profile.nama || profile.email || '?').slice(0, 1).toUpperCase());

    const roleBadge = isAdmin
      ? '<span class="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-700">Admin</span>'
      : '<span class="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-extrabold text-blue-700">User</span>';

    const statusBadge = getProfileStatusBadge(profile);

    return `
      <article class="mobile-user-card ${isDeleted ? 'opacity-70' : ''}">
        <div class="mobile-user-head">
          <div class="mobile-user-avatar">${initial}</div>

          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <p class="mobile-user-name">${escapeHTML(profile.nama || '—')}</p>
              ${isSelf ? '<span class="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Kamu</span>' : ''}
            </div>

            <span class="mobile-user-email" title="${escapeHTML(profile.email || '—')}">${escapeHTML(profile.email || '—')}</span>

            <div class="mobile-user-badges">
              ${statusBadge}
              ${roleBadge}
            </div>

            <div class="mobile-user-info">
              <p><b>Bergabung:</b> ${escapeHTML(tanggal)}</p>
              <p><b>Total Transaksi:</b> ${jumlahTrx} transaksi</p>
            </div>

            <div class="mobile-user-actions">
              ${renderUserActionButtons(profile, isSuspended, isSelf, isDeleted)}
            </div>
          </div>
        </div>
      </article>`;
  }).join('');

  if (body) body.innerHTML = rows;
  if (cards) cards.innerHTML = cardItems;
}

function renderUserActivity(profiles, trx) {
  const container = $('userActivity');
  if (!container) return;

  const activeProfiles = (profiles || []).filter((profile) => getAccountStatus(profile) !== 'deleted');

  const aktivitas = activeProfiles
    .map((profile) => {
      const userTrx = (trx || []).filter((item) => item.user_id === profile.id);
      const jumlah = userTrx.length;
      const saldo = userTrx.reduce((acc, item) => {
        const nominal = Number(item.nominal) || 0;
        return item.jenis === 'masuk' ? acc + nominal : acc - nominal;
      }, 0);

      return {
        nama: profile.nama || profile.email || 'Pengguna',
        email: profile.email || '-',
        jumlah,
        saldo,
        status: getAccountStatus(profile)
      };
    })
    .sort((a, b) => b.jumlah - a.jumlah || b.saldo - a.saldo)
    .slice(0, 6);

  if (!aktivitas.length) {
    container.innerHTML = `
      <div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
        Belum ada data aktivitas user.
      </div>`;
    return;
  }

  const maxJumlah = Math.max(...aktivitas.map((user) => user.jumlah), 1);

  container.innerHTML = aktivitas.map((user, index) => {
    const pct = user.jumlah > 0 ? Math.max((user.jumlah / maxJumlah) * 100, 3) : 0;
    const barClass = user.jumlah > 0 ? 'bg-emerald-500' : 'bg-gray-200';
    const statusBadge = user.status === 'suspended'
      ? '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">Suspend</span>'
      : '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Aktif</span>';

    return `
      <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div class="mb-2 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-gray-500">${index + 1}</span>
              <p class="truncate font-extrabold text-gray-900">${escapeHTML(user.nama)}</p>
              ${statusBadge}
            </div>
            <p class="mt-1 truncate text-xs text-gray-400">${escapeHTML(user.email)}</p>
          </div>
          <p class="shrink-0 text-right text-xs font-bold text-gray-400">${user.jumlah} transaksi</p>
        </div>
        <div class="mb-2 flex items-center justify-between gap-3 text-xs">
          <span class="font-bold text-gray-400">Saldo</span>
          <span class="font-extrabold ${user.saldo >= 0 ? 'text-emerald-600' : 'text-rose-500'}">${formatRupiah(user.saldo)}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-gray-200">
          <div class="${barClass} h-full rounded-full transition-all" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderAllTrx() {
  const body = $('allTrxBody');
  const cards = $('allTrxCardsBody');
  if (!body && !cards) return;

  const filteredTrx = getFilteredAdminTrx(allTrxData);
  const total = filteredTrx.length;
  updateAdminTrxFilterSummary(total, allTrxData.length);

  const totalPages = Math.ceil(total / adminTrxPerPage) || 1;
  adminTrxPage = Math.min(Math.max(adminTrxPage, 1), totalPages);
  const pageData = filteredTrx.slice((adminTrxPage - 1) * adminTrxPerPage, adminTrxPage * adminTrxPerPage);

  const emptyState = (icon, title, desc) => `
    <div class="mx-auto max-w-md rounded-3xl border border-gray-100 bg-gray-50 px-5 py-6 text-center">
      <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl">${icon}</div>
      <p class="font-extrabold text-gray-800">${title}</p>
      <p class="mt-1 text-sm text-gray-400">${desc}</p>
    </div>`;

  if (!allTrxData.length) {
    const empty = emptyState('🧾', 'Belum ada transaksi', 'Transaksi seluruh user akan muncul di sini.');
    if (body) body.innerHTML = `<tr><td colspan="4" class="px-6 py-10">${empty}</td></tr>`;
    if (cards) cards.innerHTML = empty;
    renderAdminPagination(totalPages);
    return;
  }

  if (!pageData.length) {
    const empty = emptyState('🔎', 'Tidak ada transaksi yang cocok', 'Coba ubah kata kunci, jenis transaksi, atau user.');
    if (body) body.innerHTML = `<tr><td colspan="4" class="px-6 py-10">${empty}</td></tr>`;
    if (cards) cards.innerHTML = empty;
    renderAdminPagination(totalPages);
    return;
  }

  const rows = pageData.map((item) => {
    const profile = allProfiles.find((p) => p.id === item.user_id);
    const namaUser = profile ? (profile.nama || profile.email) : '(tidak diketahui)';
    const warna = item.jenis === 'masuk' ? 'text-emerald-600' : 'text-rose-500';
    const simbol = item.jenis === 'masuk' ? '+' : '-';
    const typeBadge = item.jenis === 'masuk'
      ? '<span class="trx-type-pill trx-type-in">Masuk</span>'
      : '<span class="trx-type-pill trx-type-out">Keluar</span>';

    return `
      <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
        <td class="px-4 py-3 text-gray-400 whitespace-nowrap">${escapeHTML(formatTanggal(item.created_at, { day: 'numeric', month: 'short', year: 'numeric' }))}</td>
        <td class="px-4 py-3">
          <p class="max-w-[220px] truncate font-extrabold text-gray-700" title="${escapeHTML(namaUser)}">${escapeHTML(namaUser)}</p>
          <p class="mt-1">${typeBadge}</p>
        </td>
        <td class="px-4 py-3">
          <p class="max-w-[240px] truncate font-bold text-gray-700" title="${escapeHTML(item.kategori || '-')}">${escapeHTML(item.kategori || '-')}</p>
        </td>
        <td class="px-4 py-3 text-right font-extrabold ${warna} whitespace-nowrap">${simbol} ${formatRupiah(item.nominal)}</td>
      </tr>`;
  }).join('');

  const cardItems = pageData.map((item) => {
    const profile = allProfiles.find((p) => p.id === item.user_id);
    const namaUser = profile ? (profile.nama || profile.email) : '(tidak diketahui)';
    const isIn = item.jenis === 'masuk';
    const warna = isIn ? 'text-emerald-600' : 'text-rose-500';
    const simbol = isIn ? '+' : '-';
    const typeBadge = isIn
      ? '<span class="trx-type-pill trx-type-in">Masuk</span>'
      : '<span class="trx-type-pill trx-type-out">Keluar</span>';
    const tanggal = formatTanggal(item.created_at, { day: 'numeric', month: 'short', year: 'numeric' });

    return `
      <article class="mobile-trx-card">
        <div class="mobile-trx-main">
          <div class="min-w-0 flex-1">
            <p class="mobile-trx-category" title="${escapeHTML(item.kategori || '-')}">${escapeHTML(item.kategori || '-')}</p>
            <span class="mobile-trx-user mt-1" title="${escapeHTML(namaUser)}">${escapeHTML(namaUser)}</span>
          </div>
          <p class="mobile-trx-amount ${warna}">${simbol} ${formatRupiah(item.nominal)}</p>
        </div>
        <div class="mobile-trx-meta">
          ${typeBadge}
          <span class="mobile-trx-dot"></span>
          <span>${escapeHTML(tanggal)}</span>
        </div>
      </article>`;
  }).join('');

  if (body) body.innerHTML = rows;
  if (cards) cards.innerHTML = cardItems;

  renderAdminPagination(totalPages);
}

function renderAdminPagination(totalPages) {
  const pag = $('trxPagination');
  if (!pag) return;

  pag.innerHTML = '';
  if (totalPages <= 1) return;

  if (adminTrxPage > 1) {
    pag.innerHTML += `<button onclick="changeAdminTrxPage(${adminTrxPage - 1})" class="admin-page-btn">&laquo;</button>`;
  }

  let startPage = Math.max(1, adminTrxPage - 3);
  let endPage = Math.min(totalPages, startPage + 6);
  if (endPage - startPage < 6) startPage = Math.max(1, endPage - 6);

  for (let page = startPage; page <= endPage; page += 1) {
    pag.innerHTML += `<button onclick="changeAdminTrxPage(${page})"
      class="admin-page-btn ${page === adminTrxPage ? 'is-active' : ''}">${page}</button>`;
  }

  if (adminTrxPage < totalPages) {
    pag.innerHTML += `<button onclick="changeAdminTrxPage(${adminTrxPage + 1})" class="admin-page-btn">&raquo;</button>`;
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
  const sortedTrx = [...(trx || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  sortedTrx.forEach((item) => {
    const tgl = new Date(item.created_at);
    if (Number.isNaN(tgl.getTime())) return;

    const label = tgl.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
    if (!dataBulanan[label]) dataBulanan[label] = { masuk: 0, keluar: 0 };
    if (item.jenis === 'masuk') dataBulanan[label].masuk += Number(item.nominal) || 0;
    if (item.jenis === 'keluar') dataBulanan[label].keluar += Number(item.nominal) || 0;
  });

  const labels = Object.keys(dataBulanan).slice(-12);
  const masukArr = labels.map((label) => dataBulanan[label].masuk);
  const keluarArr = labels.map((label) => dataBulanan[label].keluar);

  if (adminChart) {
    adminChart.destroy();
    adminChart = null;
  }

  const dark = isDarkMode();
  const textColor = dark ? '#cbd5e1' : '#64748b';
  const gridColor = dark ? 'rgba(148, 163, 184, .14)' : 'rgba(148, 163, 184, .22)';

  adminChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: masukArr,
          backgroundColor: '#059669',
          borderRadius: 8,
          maxBarThickness: 34
        },
        {
          label: 'Pengeluaran',
          data: keluarArr,
          backgroundColor: '#e11d48',
          borderRadius: 8,
          maxBarThickness: 34
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: { size: 11, weight: '700' },
            boxWidth: 28,
            boxHeight: 10
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatRupiah(context.raw)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11, weight: '700' } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: textColor,
            font: { size: 11, weight: '700' },
            callback: (value) => `Rp ${(Number(value) / 1000000).toFixed(1)}jt`
          },
          grid: { color: gridColor }
        }
      }
    }
  });
}

function getAdminTargetProfile(userId) {
  return allProfiles.find((profile) => profile.id === userId);
}

async function editAdminUser(userId) {
  const profile = getAdminTargetProfile(userId);
  if (!profile) return showWarning('User tidak ditemukan', 'Data user belum terbaca. Coba refresh data dulu.');

  if (getAccountStatus(profile) === 'deleted') {
    return showWarning('Akun sudah dihapus', 'Akun yang sudah dihapus tidak bisa diedit.');
  }

  const { value: formValue } = await Swal.fire({
    title: 'Edit Akun User',
    html: `
      <div class="space-y-3 text-left">
        <label class="block">
          <span class="mb-1 block text-xs font-bold text-gray-500">Nama</span>
          <input id="adminEditNama" class="swal2-input !mx-0 !w-full" value="${escapeHTML(profile.nama || '')}" placeholder="Nama user">
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-bold text-gray-500">Email profil</span>
          <input id="adminEditEmail" class="swal2-input !mx-0 !w-full" value="${escapeHTML(profile.email || '')}" placeholder="email@domain.com">
          <span class="mt-1 block text-[11px] text-gray-400">Catatan: ini mengubah email di profil aplikasi, bukan email login Auth Supabase.</span>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-bold text-gray-500">Role</span>
          <select id="adminEditRole" class="swal2-select !mx-0 !w-full">
            <option value="user" ${profile.role !== 'admin' ? 'selected' : ''}>User</option>
            <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </label>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Simpan Perubahan',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#059669',
    cancelButtonColor: '#9ca3af',
    preConfirm: () => {
      const nama = document.getElementById('adminEditNama')?.value.trim();
      const email = document.getElementById('adminEditEmail')?.value.trim();
      const role = document.getElementById('adminEditRole')?.value === 'admin' ? 'admin' : 'user';

      if (!nama) {
        Swal.showValidationMessage('Nama tidak boleh kosong.');
        return false;
      }

      if (email && !isValidEmailFormat(email)) {
        Swal.showValidationMessage('Format email tidak valid.');
        return false;
      }

      if (profile.id === currentUser?.id && role !== 'admin') {
        Swal.showValidationMessage('Kamu tidak bisa menurunkan role admin akun sendiri.');
        return false;
      }

      return { nama, email, role };
    }
  });

  if (!formValue) return;

  const { error } = await db
    .from('profiles')
    .update({
      nama: formValue.nama,
      email: formValue.email,
      role: formValue.role
    })
    .eq('id', userId);

  if (error) return showError('Gagal mengedit user', error);

  await Swal.fire({
    icon: 'success',
    title: 'User diperbarui',
    timer: 1200,
    showConfirmButton: false
  });

  await muatData(false);
}

async function setUserSuspended(userId, shouldSuspend = true) {
  const profile = getAdminTargetProfile(userId);
  if (!profile) return showWarning('User tidak ditemukan', 'Data user belum terbaca. Coba refresh data dulu.');
  if (profile.id === currentUser?.id) return showWarning('Tidak bisa suspend diri sendiri', 'Admin yang mengunci dirinya sendiri itu bukan fitur, itu plot komedi.');
  if (getAccountStatus(profile) === 'deleted') return showWarning('Akun sudah dihapus', 'Akun yang sudah dihapus tidak bisa disuspend.');

  const actionText = shouldSuspend ? 'suspend' : 'aktifkan kembali';
  const result = await Swal.fire({
    icon: shouldSuspend ? 'warning' : 'question',
    title: shouldSuspend ? 'Suspend akun ini?' : 'Aktifkan akun ini?',
    text: shouldSuspend
      ? `User ${profile.nama || profile.email || 'ini'} tidak akan bisa masuk ke aplikasi.`
      : `User ${profile.nama || profile.email || 'ini'} akan bisa mengakses aplikasi lagi.`,
    showCancelButton: true,
    confirmButtonText: shouldSuspend ? 'Ya, Suspend' : 'Ya, Aktifkan',
    cancelButtonText: 'Batal',
    confirmButtonColor: shouldSuspend ? '#d97706' : '#059669',
    cancelButtonColor: '#9ca3af'
  });

  if (!result.isConfirmed) return;

  const { error } = await db
    .from('profiles')
    .update({
      account_status: shouldSuspend ? 'suspended' : 'active',
      suspended_at: shouldSuspend ? new Date().toISOString() : null,
      deleted_at: null
    })
    .eq('id', userId);

  if (error) return showError(`Gagal ${actionText} akun`, error);

  await Swal.fire({
    icon: 'success',
    title: shouldSuspend ? 'Akun disuspend' : 'Akun aktif kembali',
    timer: 1200,
    showConfirmButton: false
  });

  await muatData(false);
}

async function deleteAdminUser(userId) {
  const profile = getAdminTargetProfile(userId);
  if (!profile) return showWarning('User tidak ditemukan', 'Data user belum terbaca. Coba refresh data dulu.');
  if (profile.id === currentUser?.id) return showWarning('Tidak bisa hapus diri sendiri', 'Admin yang menghapus akunnya sendiri itu bukan admin, itu pesulap gagal.');
  if (getAccountStatus(profile) === 'deleted') return showWarning('Akun sudah dihapus', 'Status akun ini sudah dihapus.');

  const result = await Swal.fire({
    icon: 'warning',
    title: 'Hapus akun user?',
    html: `
      <p class="text-sm text-gray-500">
        Akun <b>${escapeHTML(profile.nama || profile.email || 'user ini')}</b> akan ditandai sebagai dihapus dan tidak bisa login.
      </p>
      <p class="mt-2 text-xs text-gray-400">
        Ini soft delete. Data Auth Supabase tidak dihapus permanen dari frontend karena butuh service role server.
      </p>
    `,
    showCancelButton: true,
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#9ca3af'
  });

  if (!result.isConfirmed) return;

  const { error } = await db
    .from('profiles')
    .update({
      account_status: 'deleted',
      deleted_at: new Date().toISOString(),
      suspended_at: null
    })
    .eq('id', userId);

  if (error) return showError('Gagal menghapus akun', error);

  await Swal.fire({
    icon: 'success',
    title: 'Akun dihapus',
    text: 'Akses user sudah diblokir dari aplikasi.',
    timer: 1300,
    showConfirmButton: false
  });

  await muatData(false);
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

  startUserPresence();
  setupAdminRealtime();
  showAdminView(getInitialAdminView());
  await muatData();
  showAdminView(activeAdminView);
}


function detectPageFromPath() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('dashboard-admin')) return 'dashboard-admin';
  if (path.includes('dashboard')) return 'dashboard-user';
  if (path.includes('reset-password')) return 'reset-password';
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
    else if (page === 'reset-password') await initResetPasswordPage();
    else if (page === 'dashboard-user') await initUserDashboard();
    else if (page === 'dashboard-admin') await initAdminDashboard();
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
window.doUpdatePassword = doUpdatePassword;
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
window.toggleTotalBalanceVisibility = toggleTotalBalanceVisibility;
window.syncDailyPushStatus = syncDailyPushStatus;
window.disableDailyPushNotification = disableDailyPushNotification;
window.enableDailyPushNotification = enableDailyPushNotification;
window.muatData = muatData;
window.toggleRole = toggleRole;
window.changeAdminTrxPage = changeAdminTrxPage;
window.updateRecoveryStatus = updateRecoveryStatus;
window.showAdminView = showAdminView;
window.editAdminUser = editAdminUser;
window.setUserSuspended = setUserSuspended;
window.deleteAdminUser = deleteAdminUser;
window.applyAdminUserFilters = applyAdminUserFilters;
window.resetAdminUserFilters = resetAdminUserFilters;
window.applyAdminTrxFilters = applyAdminTrxFilters;
window.resetAdminTrxFilters = resetAdminTrxFilters;
window.showAppView = showAppView;
window.showSettingsSection = showSettingsSection;
window.deleteMyAccount = deleteMyAccount;
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

window.openOnboardingGuide = openOnboardingGuide;
window.closeOnboardingGuide = closeOnboardingGuide;
window.nextOnboardingStep = nextOnboardingStep;
window.previousOnboardingStep = previousOnboardingStep;
window.finishOnboardingGuide = finishOnboardingGuide;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
