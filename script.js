// =====================================================================
// QUẢN LÝ CHI TIÊU - MINI APP (script.js) - BẢN HOÀN CHỈNH KHỚP HTML
// Kiến trúc: secureFetch qua Cloudflare Worker (an toàn, tách theo user)
// Tab 2: Lịch thống kê + Modal chi tiết (theo file mẫu). Tìm kiếm: modal.
// =====================================================================

if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
}

const urlParams = new URLSearchParams(window.location.search);
const apiUrl = urlParams.get('api');
const workerUrl = urlParams.get('workerUrl');
const proxyUrl = '/api/proxy?url=';

let chatId = null;
let sheetId = null;

if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user) {
    chatId = window.Telegram.WebApp.initDataUnsafe.user.id;
}

// ==========================================
// HÀM BẢO MẬT: GIAO TIẾP VỚI CLOUDFLARE WORKER
// ==========================================
async function secureFetch(path, method = 'GET', data = null) {
    if (!workerUrl) throw new Error("Lỗi: Không tìm thấy máy chủ bảo mật (workerUrl).");
    const tgInitData = window.Telegram?.WebApp?.initData;
    if (!tgInitData) throw new Error("Từ chối truy cập: Không có chữ ký bảo mật của Telegram!");

    const payload = { path: path, method: method };
    if (data) payload.data = data;

    const res = await fetch(`${workerUrl}/api/secure_firebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': tgInitData },
        body: JSON.stringify(payload)
    });
    if (!res.ok) { const errText = await res.text(); throw new Error(`Lỗi máy chủ: ${errText}`); }
    const responseText = await res.text();
    return responseText ? JSON.parse(responseText) : null;
}

// ==========================================
// QUẢN LÝ TRẠNG THÁI
// ==========================================
let cachedTransactions = null, cachedChartData = null;
let filterModeCache = { monthly: {}, yearly: {}, custom: {} };
let cachedSearchResults = [], cachedKeywords = [];
window.categoryIconMap = {};
window.customCategoryIcons = {};

let tab2NeedsReload = false;
window.currentChartType = 'bar';
let isPrivacyActive = localStorage.getItem('settingPrivacyMode') === 'true';

let toastQueue = [], isShowingToast = false, currentEditKeyword = null;

const itemsPerPage = 10;
let currentPageTab1 = 1, currentPageCategory = 1, currentPageSearch = 1;
window.apiTxCache = {};
let currentFilterMode = 'weekly', activePeriodDate = new Date();
let savedScrollPositionTab2 = 0;

// ---------------- DICT EMOJI <-> FA ICON ----------------
const EMOJI_TO_FA_MAP = {
    '🍔': 'fa-burger', '🍽️': 'fa-utensils', '🍜': 'fa-bowl-food', '☕': 'fa-mug-hot', '🍺': 'fa-beer-mug-empty', '🍕': 'fa-pizza-slice',
    '🚗': 'fa-car', '🛵': 'fa-motorcycle', '🚕': 'fa-taxi', '🚌': 'fa-bus', '✈️': 'fa-plane', '⛽': 'fa-gas-pump', '🚆': 'fa-train',
    '🏠': 'fa-house', '🏢': 'fa-building', '🛒': 'fa-cart-shopping', '🛍️': 'fa-bag-shopping', '👕': 'fa-shirt', '👗': 'fa-shirt', '👟': 'fa-shoe-prints', '👓': 'fa-glasses',
    '💻': 'fa-laptop', '📱': 'fa-mobile-screen', '🎮': 'fa-gamepad', '🎧': 'fa-headphones', '📺': 'fa-tv',
    '💡': 'fa-bolt', '💧': 'fa-droplet', '🔥': 'fa-fire', '📶': 'fa-wifi',
    '💊': 'fa-pills', '🩺': 'fa-stethoscope', '🏥': 'fa-house-medical', '💪': 'fa-dumbbell', '🦷': 'fa-tooth', '💓': 'fa-heart-pulse',
    '🎓': 'fa-graduation-cap', '📚': 'fa-book', '💼': 'fa-briefcase', '🖊️': 'fa-pen',
    '📈': 'fa-chart-line', '💰': 'fa-money-bill-wave', '🏦': 'fa-building-columns', '💳': 'fa-credit-card', '🐷': 'fa-piggy-bank', '🪙': 'fa-coins', '👛': 'fa-wallet',
    '🎁': 'fa-gift', '🎂': 'fa-cake-candles', '🐶': 'fa-paw', '🐱': 'fa-cat', '👶': 'fa-baby', '🧒': 'fa-child', '👥': 'fa-user-group',
    '🎬': 'fa-film', '🎵': 'fa-music', '⚽': 'fa-futbol', '🎫': 'fa-ticket', '🥂': 'fa-champagne-glasses',
    '🛡️': 'fa-shield-halved', '🧾': 'fa-file-invoice-dollar', '💅': 'fa-spa', '🔧': 'fa-wrench', '🔨': 'fa-hammer', '✂️': 'fa-scissors',
    '💬': 'fa-comments', '📦': 'fa-box', '🏷️': 'fa-tag', '✨': 'fa-star'
};
const FA_TO_EMOJI_MAP = {};
for (let emoji in EMOJI_TO_FA_MAP) { FA_TO_EMOJI_MAP[EMOJI_TO_FA_MAP[emoji]] = emoji; }

// ---------------- UTILITIES ----------------
function triggerHaptic(style = 'light') {
    if (localStorage.getItem('settingHaptic') === 'false') return;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.impactOccurred(style);
}
function triggerHapticNotification(type = 'success') {
    if (localStorage.getItem('settingHaptic') === 'false') return;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred(type);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

window.togglePrivacy = function() { triggerHaptic('light'); isPrivacyActive = !isPrivacyActive; updatePrivacyUI(false); };

function updatePrivacyUI(syncSettings = false) {
    if (syncSettings) { const c = document.getElementById('settingPrivacyMode'); if (c) c.checked = isPrivacyActive; }
    if (isPrivacyActive) {
        document.body.classList.add('privacy-on');
        document.querySelectorAll('.privacy-toggle-btn').forEach(btn => { btn.classList.remove('fa-eye'); btn.classList.add('fa-eye-slash'); });
    } else {
        document.body.classList.remove('privacy-on');
        document.querySelectorAll('.privacy-toggle-btn').forEach(btn => { btn.classList.remove('fa-eye-slash'); btn.classList.add('fa-eye'); });
    }
    if (window.mChart) window.mChart.update();
    if (window.pChart) window.pChart.update();
    if (window.dChart) window.dChart.update();
}

function applyPrivacyMode() { isPrivacyActive = localStorage.getItem('settingPrivacyMode') === 'true'; updatePrivacyUI(true); }

function formatCurrencyWithUnit(value) {
    const format = localStorage.getItem('settingCurrencyFormat') || 'full';
    let num = parseInt(value.toString().replace(/[^0-9-]/g, '')) || 0;
    if (format === 'short' && Math.abs(num) >= 1000) {
        let shortNum = Math.round(num / 1000);
        let formattedShort = shortNum.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return { val: formattedShort + 'K', unit: '' };
    }
    return { val: num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'), unit: 'đ' };
}

function formatDate(dateStr) { const parts = dateStr.split('/'); if (parts.length !== 3) return dateStr; return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`; }
function formatDateToYYYYMMDD(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDateToDDMMYYYY(date) { return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth() + 1).padStart(2,'0')}/${date.getFullYear()}`; }
function formatNumberWithCommas(value) { if (!value) return ''; let val = value.toString().replace(/[^0-9]/g, ''); if (!val) return ''; return parseInt(val, 10).toLocaleString('vi-VN'); }
function parseNumber(value) { let str = value.toString().toUpperCase(); let multiplier = 1; if (str.includes('K')) { multiplier = 1000; str = str.replace('K', ''); } return (parseInt(str.replace(/[^0-9-]/g, '')) || 0) * multiplier; }
function getColorByIndex(i) {
    const c = ['#6366F1', '#F43F5E', '#10B981', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16', '#8B5CF6', '#F97316', '#14B8A6', '#EAB308', '#D946EF', '#22C55E', '#0EA5E9', '#A855F7', '#EF4444', '#64748B', '#059669', '#DC2626', '#4F46E5', '#C026D3'];
    return c[i % c.length];
}

function getRawFaIconName(catName) {
    if (!catName) return null;
    const categoryName = catName.trim();
    let iconVal = null;
    if (window.customCategoryIcons && window.customCategoryIcons[categoryName]) { iconVal = window.customCategoryIcons[categoryName].trim(); }
    else if (window.categoryIconMap && window.categoryIconMap[categoryName]) { iconVal = window.categoryIconMap[categoryName].trim(); }
    if (iconVal) {
        const firstChar = Array.from(iconVal)[0];
        if (EMOJI_TO_FA_MAP[firstChar]) return EMOJI_TO_FA_MAP[firstChar];
        if (EMOJI_TO_FA_MAP[iconVal]) return EMOJI_TO_FA_MAP[iconVal];
        if (!/[^\x00-\x7F]/.test(iconVal)) return iconVal;
    }
    const faMapFallback = {
        'ăn uống': 'fa-utensils', 'bảo hiểm': 'fa-shield-halved', 'công nghệ': 'fa-laptop', 'công việc': 'fa-briefcase', 'giặt ủi': 'fa-shirt', 'sửa chữa': 'fa-screwdriver-wrench',
        'đi lại': 'fa-car-side', 'giải trí': 'fa-clapperboard', 'giáo dục': 'fa-graduation-cap', 'gia đình': 'fa-house-user', 'hóa đơn': 'fa-file-invoice-dollar', 'chăm sóc': 'fa-spa',
        'làm đẹp': 'fa-spa', 'mua sắm': 'fa-bag-shopping', 'quà tặng': 'fa-gift', 'sức khỏe': 'fa-dumbbell', 'tiết kiệm': 'fa-chart-line', 'đầu tư': 'fa-chart-line', 'y tế': 'fa-pills',
        'nhà cửa': 'fa-house', 'xăng': 'fa-gas-pump', 'lương': 'fa-money-bill-wave', 'thưởng': 'fa-gift', 'khác': 'fa-layer-group'
    };
    for (let key in faMapFallback) { if (categoryName.toLowerCase().includes(key)) return faMapFallback[key]; }
    return null;
}

function getCategoryIcon(cat) {
    if (!cat) return '<i class="fas fa-box-open"></i>';
    const rawFaIcon = getRawFaIconName(cat);
    if (rawFaIcon) {
        let finalIcon = rawFaIcon;
        if (!finalIcon.includes('fa-')) finalIcon = `fa-${finalIcon}`;
        if (!finalIcon.includes('fas ')) finalIcon = `fas ${finalIcon}`;
        return `<i class="${finalIcon}"></i>`;
    }
    const firstLetter = Array.from(cat.trim())[0].toUpperCase();
    return `<span style="font-weight: 900; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 0.9em; line-height: 1;">${firstLetter}</span>`;
}

function getCompareHTML(current, prev, type, text = 'so với kỳ trước') {
    const zeroObj = formatCurrencyWithUnit(0);
    if (prev === 0 && current === 0) return `<span style="color: var(--text-2); font-weight: 500;">− ${zeroObj.val}${zeroObj.unit} ${escapeHTML(text)}</span>`;
    let diff = current - prev;
    if (diff === 0) return `<span style="color: var(--text-2); font-weight: 500;">− Bằng ${escapeHTML(text)}</span>`;
    let isUp = diff > 0;
    let icon = isUp ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
    let arrowText = isUp ? (type === 'balance' ? 'Dư' : 'Tăng') : (type === 'balance' ? 'Âm' : 'Giảm');
    let colorVar = type === 'expense' ? (isUp ? 'var(--expense)' : 'var(--income)') : (isUp ? 'var(--income)' : 'var(--expense)');
    const diffObj = formatCurrencyWithUnit(Math.abs(diff));
    return `<span style="color: ${colorVar}; font-weight: 600;">${icon} ${arrowText} ${diffObj.val}${diffObj.unit} ${escapeHTML(text)}</span>`;
}

window.showCustomConfirm = function(title, messageHtml, confirmText, onConfirm) {
    let overlay = document.getElementById('customConfirmOverlay');
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'customConfirmOverlay'; overlay.className = 'custom-confirm-overlay'; document.body.appendChild(overlay); }
    const modal = document.createElement('div');
    modal.className = 'custom-confirm-modal';
    modal.innerHTML = `
        <div style="padding:24px 20px 20px; text-align:center;">
            <div class="custom-confirm-icon"><i class="fas fa-trash-alt"></i></div>
            <h3 class="custom-confirm-title">${title}</h3>
            <p class="custom-confirm-message">${messageHtml}</p>
        </div>
        <div class="custom-confirm-actions">
            <button id="customConfirmCancel" class="custom-confirm-cancel">Hủy</button>
            <button id="customConfirmOk" class="custom-confirm-ok">${confirmText}</button>
        </div>`;
    overlay.innerHTML = ''; overlay.appendChild(modal); overlay.style.display = 'flex';
    void overlay.offsetWidth; overlay.style.opacity = '1'; modal.style.transform = 'scale(1)'; modal.style.opacity = '1';
    const closeModal = () => { overlay.style.opacity = '0'; modal.style.transform = 'scale(0.9)'; modal.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; }, 200); };
    document.getElementById('customConfirmCancel').onclick = () => { triggerHaptic('light'); closeModal(); };
    document.getElementById('customConfirmOk').onclick = () => { triggerHaptic('medium'); closeModal(); onConfirm(); };
};

function showToast(message, type = "info") { toastQueue.push({ message, type }); if (!isShowingToast) processToastQueue(); }
function processToastQueue() {
  if (toastQueue.length === 0) { isShowingToast = false; return; }
  isShowingToast = true;
  const { message, type } = toastQueue.shift();
  const toast = document.createElement('div');
  toast.className = `premium-toast toast-${type}`;
  let icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
  toast.innerHTML = `<i class="fas ${icon} toast-icon"></i><span class="toast-message">${escapeHTML(message)}</span><div class="toast-progress"></div>`;
  document.body.appendChild(toast); void toast.offsetWidth; toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => { toast.remove(); processToastQueue(); }, 400); }, 3000);
}

function showLoading(show, tabId) {
  const el = document.getElementById(`loading${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  if (el) el.style.display = show ? 'block' : 'none';
}

window.openTab = function(tabId) {
  triggerHaptic('light');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if(btn) btn.classList.add('active');
};

// Đọc dữ liệu tháng (an toàn) + chuẩn hóa ngày DD/MM/YYYY để lịch & biểu đồ khớp
async function fetchMonthData(month) {
    try {
        const data = await secureFetch(`/transactions/users/${chatId}/month_${parseInt(month, 10)}.json`);
        if (data) {
            return Object.values(data).filter(item => item !== null).map(item => {
                if (item && item.date) {
                    const p = item.date.split('/');
                    if (p.length === 3) item.date = `${String(parseInt(p[0], 10)).padStart(2, '0')}/${String(parseInt(p[1], 10)).padStart(2, '0')}/${p[2]}`;
                }
                return item;
            });
        }
    } catch (e) {} return [];
}
// ---------------- TAB 1: GIAO DỊCH ----------------
window.fetchTransactions = async function(forceRefresh = false) {
  const tDate = document.getElementById('transactionDate').value;
  if (!tDate) return;
  const [y, m, d] = tDate.split('-');

  const selectedDateObj = new Date(y, m - 1, d); const todayObj = new Date(); todayObj.setHours(0,0,0,0); selectedDateObj.setHours(0,0,0,0);
  const diffDays = Math.round((selectedDateObj - todayObj) / (1000 * 60 * 60 * 24));
  let prefixText = "Ngày "; if (diffDays === 0) prefixText = "Hôm nay, "; else if (diffDays === -1) prefixText = "Hôm qua, "; else if (diffDays === 1) prefixText = "Ngày mai, ";

  document.getElementById('displayCurrentDate').textContent = `${prefixText}${d}/${m}/${y}`;
  const cacheKey = `${d}/${m}/${y}`;
  const currDateObj = new Date(y, m - 1, d); currDateObj.setDate(currDateObj.getDate() - 1);
  const prevDateStr = formatDateToDDMMYYYY(currDateObj); const prevM = String(currDateObj.getMonth() + 1).padStart(2, '0');
  let compareSuffix = diffDays !== 0 ? `so với ngày ${prevDateStr}` : "so với hôm qua";

  if (!forceRefresh && cachedTransactions && cachedTransactions.cacheKey === cacheKey) { displayTransactions(); return; }

  showLoading(true, 'tab1');
  try {
    const currDateStr = `${d}/${m}/${y}`;
    let dataCurrMonth, dataPrevMonth;
    if (m === prevM) { dataCurrMonth = await fetchMonthData(m); dataPrevMonth = dataCurrMonth; }
    else { [dataCurrMonth, dataPrevMonth] = await Promise.all([ fetchMonthData(m), fetchMonthData(prevM) ]); }

    let dataCurr = dataCurrMonth.filter(t => t.date === currDateStr);
    let dataPrev = dataPrevMonth.filter(t => t.date === prevDateStr);
    dataCurr.sort((a,b) => b.id.localeCompare(a.id)); dataPrev.sort((a,b) => b.id.localeCompare(a.id));

    cachedTransactions = { cacheKey, data: dataCurr, prevData: dataPrev, compareSuffix: compareSuffix };
    currentPageTab1 = 1; displayTransactions();
  } catch (err) { cachedTransactions = { cacheKey, data: [], prevData: [], compareSuffix: compareSuffix }; displayTransactions(); }
  finally { showLoading(false, 'tab1'); }
};

function displayTransactions() {
  const data = cachedTransactions?.data || [];
  const prevData = cachedTransactions?.prevData || [];
  const compSuffix = cachedTransactions?.compareSuffix || 'so với hôm qua';
  const container = document.getElementById('transactionsContainer'); container.innerHTML = '';

  let tInc = 0, tExp = 0; if (Array.isArray(data)) data.forEach(i => { if (i.type === 'Thu nhập') tInc += i.amount; else tExp += i.amount; });
  const tBal = tInc - tExp;
  let pInc = 0, pExp = 0; if (Array.isArray(prevData)) prevData.forEach(i => { if (i.type === 'Thu nhập') pInc += i.amount; else pExp += i.amount; });

  const tExpObj = formatCurrencyWithUnit(tExp);
  const heroExpMain = document.getElementById('heroExpenseMain');
  if(heroExpMain) heroExpMain.innerHTML = `${tExpObj.val}<span>${tExpObj.unit}</span>`;

  const tIncObj = formatCurrencyWithUnit(tInc);
  const heroInc = document.getElementById('heroIncome');
  if(heroInc) heroInc.innerHTML = `${tIncObj.val}<span>${tIncObj.unit}</span>`;

  const tBalObj = formatCurrencyWithUnit(Math.abs(tBal));
  const heroBalSub = document.getElementById('heroBalanceSub');
  if(heroBalSub) { let sign = tBal > 0 ? '+' : (tBal < 0 ? '−' : ''); heroBalSub.innerHTML = `<span>${sign}</span>${tBalObj.val}<span>${tBalObj.unit}</span>`; }

  const heroExpCompare = document.getElementById('heroExpenseCompare');
  if(heroExpCompare) heroExpCompare.innerHTML = getCompareHTML(tExp, pExp, 'expense', compSuffix);

  const headerTitle = document.querySelector('#tab1 .section-title');
  if(headerTitle) headerTitle.innerHTML = `GIAO DỊCH TRONG NGÀY <span style="font-size: 0.75rem; color: var(--text-2); text-transform: none;">(Tổng: ${data.length})</span>`;

  if (data.length === 0) {
    document.getElementById('placeholderTab1').style.display = 'block';
    document.getElementById('pagination').style.display = 'none'; return;
  }
  document.getElementById('placeholderTab1').style.display = 'none';
  document.getElementById('pagination').style.display = 'flex';

  const tPages = Math.ceil(data.length / itemsPerPage);
  const pData = data.slice((currentPageTab1 - 1) * itemsPerPage, currentPageTab1 * itemsPerPage);

  pData.forEach((item, index) => {
    const isInc = item.type === 'Thu nhập'; const tCls = isInc ? 'income' : 'expense';
    const icon = getCategoryIcon(item.category);
    const stt = (currentPageTab1 - 1) * itemsPerPage + index + 1;
    const amtObj = formatCurrencyWithUnit(item.amount);

    const card = document.createElement('div'); card.className = `tx-card ${tCls}`;
    card.innerHTML = `
      <div class="tx-icon-wrap ${tCls}">${icon}</div>
      <div class="tx-body">
        <div class="tx-title">${escapeHTML(item.content)}</div>
        <div class="tx-meta-row">
           <span class="tx-date">${escapeHTML(formatDate(item.date))}</span>
           <span class="tx-badge tx-badge-neutral">${escapeHTML(item.type)}</span>
           <span class="tx-badge ${tCls}">${escapeHTML(item.category)}</span>
        </div>
        ${item.note ? `<div class="tx-note"><i class="fas fa-tag tx-note-icon"></i>${escapeHTML(item.note)}</div>` : ''}
        <div class="tx-id-row"><span>STT: ${stt}</span> • <span>#${escapeHTML(item.id)}</span></div>
      </div>
      <div class="tx-right-col">
        <div class="tx-amount ${tCls}"><span>${isInc ? '+' : '−'}</span>${amtObj.val}<span>${amtObj.unit}</span></div>
        <div class="tx-actions">
           <button class="tx-btn edit-btn" data-id="${escapeHTML(item.id)}" title="Sửa"><i class="fas fa-pen"></i></button>
           <button class="tx-btn delete-btn" data-id="${escapeHTML(item.id)}" title="Xóa"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    container.appendChild(card);
  });

  document.getElementById('pageInfo').textContent = `${currentPageTab1} / ${tPages}`;
  document.getElementById('prevPage').disabled = currentPageTab1 === 1;
  document.getElementById('nextPage').disabled = currentPageTab1 === tPages;
  document.getElementById('prevPage').onclick = () => { triggerHaptic('light'); if(currentPageTab1 > 1) { currentPageTab1--; displayTransactions(); } };
  document.getElementById('nextPage').onclick = () => { triggerHaptic('light'); if(currentPageTab1 < tPages) { currentPageTab1++; displayTransactions(); } };
  document.querySelectorAll('#transactionsContainer .edit-btn').forEach(btn => btn.onclick = () => openEditForm(data.find(i => String(i.id) === btn.getAttribute('data-id'))));
  document.querySelectorAll('#transactionsContainer .delete-btn').forEach(btn => btn.onclick = () => deleteTransaction(btn.getAttribute('data-id')));
}
// ---------------- CÁC BÁO CÁO (TAB 2) ----------------
function getWeekNumber(d) {
    const startOfWeek = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = d.getUTCDay() || 7;
    if (startOfWeek === 1) d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    else d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() + 1));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function formatWeekInput(date) { return `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}`; }
function getDateFromWeekString(weekStr) {
    const startDay = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    if (!weekStr) return null;
    const [yearStr, weekPart] = weekStr.split('-W');
    if (!yearStr || !weekPart) return null;
    const year = parseInt(yearStr); const week = parseInt(weekPart);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const start = new Date(simple);
    if (startDay === 1) {
        if (dow <= 4) start.setDate(simple.getDate() - simple.getDay() + 1);
        else start.setDate(simple.getDate() + 8 - simple.getDay());
    } else { start.setDate(simple.getDate() - simple.getDay()); }
    return start;
}

async function getTransactionsInRange(startDate, endDate) {
    const startStr = formatDateToYYYYMMDD(startDate); const endStr = formatDateToYYYYMMDD(endDate); const cacheKey = startStr + '_' + endStr;
    if (window.apiTxCache[cacheKey]) return window.apiTxCache[cacheKey];
    try {
        const sY = startDate.getFullYear(), eY = endDate.getFullYear(); let txs = []; let fetchPromises = [];
        for (let y = sY; y <= eY; y++) { let sM = (y === sY) ? startDate.getMonth() + 1 : 1; let eM = (y === eY) ? endDate.getMonth() + 1 : 12;
            for (let m = sM; m <= eM; m++) { fetchPromises.push((async () => { let monthData = await fetchMonthData(m); return { y, m, data: monthData }; })()); }
        }
        const monthsResults = await Promise.all(fetchPromises);
        monthsResults.forEach(res => { res.data.forEach(t => { const dParts = t.date.split('/'); const txDate = new Date(res.y, parseInt(dParts[1], 10) - 1, parseInt(dParts[0], 10)); if (txDate >= startDate && txDate <= endDate) txs.push(t); }); });
        window.apiTxCache[cacheKey] = txs; return txs;
    } catch (e) { return []; }
}

function processReportData(currentTx, prevTx, labels, incs, exps) {
    let tInc = 0, tExp = 0; currentTx.forEach(i => { if(i.type==='Thu nhập') tInc += i.amount; else tExp += i.amount; });
    const tBal = tInc - tExp;
    let pInc = 0, pExp = 0; prevTx.forEach(i => { if(i.type==='Thu nhập') pInc += i.amount; else pExp += i.amount; });
    const pBal = pInc - pExp;

    const tIncObj = formatCurrencyWithUnit(tInc);
    document.getElementById('tab2Income').innerHTML = `${tIncObj.val}<span>${tIncObj.unit}</span>`;
    const tExpObj = formatCurrencyWithUnit(tExp);
    document.getElementById('tab2Expense').innerHTML = `${tExpObj.val}<span>${tExpObj.unit}</span>`;
    const tBalObj = formatCurrencyWithUnit(Math.abs(tBal));
    let sign = tBal > 0 ? '+' : (tBal < 0 ? '−' : '');
    document.getElementById('tab2Balance').innerHTML = `<span>${sign}</span>${tBalObj.val}<span>${tBalObj.unit}</span>`;

    let compareText = currentFilterMode === 'weekly' ? 'so với tuần trước' : (currentFilterMode === 'monthly' ? 'so với tháng trước' : 'so với năm trước');
    document.getElementById('tab2IncomeCompare').innerHTML = getCompareHTML(tInc, pInc, 'income', compareText);
    document.getElementById('tab2ExpenseCompare').innerHTML = getCompareHTML(tExp, pExp, 'expense', compareText);
    document.getElementById('tab2BalanceCompare').innerHTML = getCompareHTML(tBal, pBal, 'balance', compareText);

    const ctx = document.getElementById('monthlyChart').getContext('2d');
    if (window.mChart) window.mChart.destroy();

    const chartHeight = 250;
    let incGradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    incGradient.addColorStop(0, 'rgba(16, 185, 129, 0.8)'); incGradient.addColorStop(1, 'rgba(16, 185, 129, 0.1)');
    let expGradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    expGradient.addColorStop(0, 'rgba(244, 63, 94, 0.8)'); expGradient.addColorStop(1, 'rgba(244, 63, 94, 0.1)');

    let dsInc = { label: 'Thu nhập', data: incs, backgroundColor: incGradient, borderColor: '#10B981', borderWidth: 0, borderRadius: 4, maxBarThickness: 20 };
    let dsExp = { label: 'Chi tiêu', data: exps, backgroundColor: expGradient, borderColor: '#F43F5E', borderWidth: 0, borderRadius: 4, maxBarThickness: 20 };

    if (window.currentChartType === 'line') {
        dsInc.tension = 0.4; dsInc.fill = true; dsInc.borderWidth = 2; dsInc.pointRadius = 4;
        dsExp.tension = 0.4; dsExp.fill = true; dsExp.borderWidth = 2; dsExp.pointRadius = 4;
    }

    window.mChart = new Chart(ctx, {
        type: window.currentChartType || 'bar',
        data: { labels: labels, datasets: [ dsInc, dsExp ]},
        options: {
            devicePixelRatio: 4, responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10, family: 'Plus Jakarta Sans' } } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: { size: 10, family: 'Plus Jakarta Sans' }, callback: v => { if (isPrivacyActive) return '***'; const vObj = formatCurrencyWithUnit(v); return vObj.val + vObj.unit; } } }
            },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => { if (isPrivacyActive) return `${ctx.dataset.label}: ***`; const cObj = formatCurrencyWithUnit(ctx.raw); return `${ctx.dataset.label}: ${cObj.val}${cObj.unit}`; } } } }
        }
    });

    const catMap = {}; currentTx.forEach(t => { if(t.type==='Chi tiêu') catMap[t.category] = (catMap[t.category]||0)+t.amount; });
    drawMonthlyPieChart(Object.keys(catMap).map(k => ({category: k, amount: catMap[k]})));
    document.querySelector('#tab2 .chart-container').style.display = 'block';
}

function drawMonthlyPieChart(data) {
  const ctx = document.getElementById('monthlyPieChart').getContext('2d');
  if(window.pChart) window.pChart.destroy();
  data.sort((a,b) => b.amount - a.amount);
  const amts = data.map(i=>i.amount); const lbls = data.map(i=>i.category); const bg = data.map((_,i)=>getColorByIndex(i));
  const total = amts.reduce((a,b)=>a+b,0);

  window.pChart = new Chart(ctx, { type: 'doughnut', data: { labels:lbls, datasets: [{data:amts, backgroundColor:bg, borderWidth: 0, hoverOffset: 4}] }, options: { devicePixelRatio: 4, cutout:'75%', layout: {padding: 8}, plugins: { legend: {display:false}, tooltip: { enabled: false } }, onClick: (event, activeEls) => { if (activeEls && activeEls.length > 0) { const activeIdx = activeEls[0].index; const catName = lbls[activeIdx]; showCategoryDetail(catName); } } }, plugins: [{ id:'cText', afterDraw(c) { const {ctx} = c; ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; const activeEls = c.getActiveElements(); if (activeEls && activeEls.length > 0) { const activeIdx = activeEls[0].index; const catName = c.data.labels[activeIdx]; const catAmt = c.data.datasets[0].data[activeIdx]; const color = c.data.datasets[0].backgroundColor[activeIdx]; const pct = total > 0 ? ((catAmt/total)*100).toFixed(1) : 0; let shortName = catName.length > 14 ? catName.substring(0, 14) + '...' : catName; ctx.fillStyle = '#94A3B8'; ctx.font = '600 9px Plus Jakarta Sans'; ctx.fillText(shortName, c.width/2, c.height/2 - 12); ctx.fillStyle = color; ctx.font = '800 12px Plus Jakarta Sans'; const catObj = formatCurrencyWithUnit(catAmt); const displayAmt = isPrivacyActive ? '***' : catObj.val + catObj.unit; ctx.fillText(displayAmt, c.width/2, c.height/2 + 4); ctx.fillStyle = '#94A3B8'; ctx.font = '500 9px Plus Jakarta Sans'; ctx.fillText(`(${pct}%)`, c.width/2, c.height/2 + 16); } else { ctx.fillStyle='#94A3B8'; ctx.font='500 10px Plus Jakarta Sans'; ctx.fillText('Tổng chi', c.width/2, c.height/2 - 10); ctx.fillStyle='#F43F5E'; ctx.font='800 13px Plus Jakarta Sans'; const totalObj = formatCurrencyWithUnit(total); const displayTotal = isPrivacyActive ? '***' : totalObj.val + totalObj.unit; ctx.fillText(displayTotal, c.width/2, c.height/2 + 8); } ctx.restore(); } }] });

  const leg = document.getElementById('monthlyCustomLegend'); if(leg) leg.innerHTML = '';
  const progList = document.getElementById('monthlyCategoryProgressList'); if(progList) progList.innerHTML = '';

  data.forEach((i, idx) => {
    const pct = total>0 ? ((i.amount/total)*100).toFixed(1) : 0; const c = bg[idx];
    const catIconHTML = getCategoryIcon(i.category);
    if (leg) {
        const divLeg = document.createElement('div'); divLeg.className = 'legend-item';
        divLeg.innerHTML = `<div class="legend-item-left"><span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex-shrink:0; color:${c}; font-size:13px; margin-right: 8px;">${catIconHTML}</span><span class="legend-name" title="${escapeHTML(i.category)}">${escapeHTML(i.category)}</span></div><div class="legend-value-col"><span class="legend-pct" style="color:${c};">${pct}%</span></div>`;
        divLeg.onclick = () => { triggerHaptic('light'); showCategoryDetail(i.category); };
        leg.appendChild(divLeg);
    }
    if (progList) {
        const iAmtObj = formatCurrencyWithUnit(i.amount);
        const divProg = document.createElement('div'); divProg.className = 'cat-progress-card';
        divProg.innerHTML = `<div class="cat-progress-header"><div class="cat-progress-info"><div class="cat-progress-icon" style="background:${c}22; color:${c};">${catIconHTML}</div><span class="cat-progress-title">${escapeHTML(i.category)}</span></div><div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;"><span class="cat-progress-amt" style="color:${c}">${iAmtObj.val}<span>${iAmtObj.unit}</span></span><span style="font-size: 0.65rem; color: var(--text-3); font-weight: 600;">${pct}%</span></div></div><div class="cat-progress-bar-bg"><div class="cat-progress-bar-fill" style="width:${pct}%; background:${c}"></div></div>`;
        divProg.onclick = () => { triggerHaptic('light'); showCategoryDetail(i.category); };
        progList.appendChild(divProg);
    }
  });
}

async function loadWeeklyReport(weekStr) {
  showLoading(true, 'tab2'); document.querySelector('#tab2 .chart-container').style.display='none'; document.getElementById('placeholderTab2').style.display='none';
  try {
    const startDate = getDateFromWeekString(weekStr); if (!startDate) throw new Error("Dữ liệu tuần không hợp lệ");
    const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 6);
    const prevStartDate = new Date(startDate); prevStartDate.setDate(prevStartDate.getDate() - 7);
    const prevEndDate = new Date(endDate); prevEndDate.setDate(prevEndDate.getDate() - 7);
    const [currentTx, prevTx] = await Promise.all([ getTransactionsInRange(startDate, endDate), getTransactionsInRange(prevStartDate, prevEndDate) ]);
    document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (${formatDateToDDMMYYYY(startDate).substring(0,5)} - ${formatDateToDDMMYYYY(endDate).substring(0,5)})`;
    const dayNames = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7']; const labels = [], incs = [], exps = [];
    for(let i=0; i<7; i++) { const d = new Date(startDate); d.setDate(d.getDate() + i); labels.push(`${dayNames[d.getDay()]}\nNgày ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`); const dateStr = formatDateToDDMMYYYY(d); const dayTx = currentTx.filter(t => t.date === dateStr); let inc = 0, exp = 0; dayTx.forEach(t => { if(t.type==='Thu nhập') inc+=t.amount; else exp+=t.amount; }); incs.push(inc); exps.push(exp); }
    renderCalendar(currentTx, startDate, 'weekly');
    processReportData(currentTx, prevTx, labels, incs, exps);
    cachedChartData = { mode: 'weekly', txs: currentTx, periodStr: weekStr };
  } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab2'); }
}

async function loadMonthlyReport(monthStr) {
  showLoading(true, 'tab2'); document.querySelector('#tab2 .chart-container').style.display='none'; document.getElementById('placeholderTab2').style.display='none';
  try {
    const [year, month] = monthStr.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1); const endDate = new Date(year, month, 0);
    let prevM = month - 1; let prevY = year; if(prevM === 0) { prevM = 12; prevY = year - 1; }
    const prevStartDate = new Date(prevY, prevM - 1, 1); const prevEndDate = new Date(prevY, prevM, 0);
    const [currentTx, prevTx] = await Promise.all([ getTransactionsInRange(startDate, endDate), getTransactionsInRange(prevStartDate, prevEndDate) ]);
    document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (Tháng ${month}/${year})`;
    const labels = [`Tháng ${month}`], incs = [0], exps = [0];
    currentTx.forEach(t => { if(t.type==='Thu nhập') incs[0]+=t.amount; else exps[0]+=t.amount; });
    renderCalendar(currentTx, startDate, 'monthly');
    processReportData(currentTx, prevTx, labels, incs, exps);
    cachedChartData = { mode: 'monthly', txs: currentTx, periodStr: monthStr };
  } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab2'); }
}

async function loadCustomReport(startMonth, endMonth, year) {
  showLoading(true, 'tab2'); document.querySelector('#tab2 .chart-container').style.display='none'; document.getElementById('placeholderTab2').style.display='none';
  try {
    const startDate = new Date(year, startMonth - 1, 1); const endDate = new Date(year, endMonth, 0);
    const prevStartDate = new Date(year - 1, startMonth - 1, 1); const prevEndDate = new Date(year - 1, endMonth, 0);
    const [currentTx, prevTx] = await Promise.all([ getTransactionsInRange(startDate, endDate), getTransactionsInRange(prevStartDate, prevEndDate) ]);
    document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (T${startMonth} - T${endMonth} / ${year})`;
    const labels = [], incs = [], exps = [];
    for(let m=startMonth; m<=endMonth; m++) { labels.push(`Tháng ${m}`); const mTx = currentTx.filter(t => parseInt(t.date.split('/')[1]) === m && parseInt(t.date.split('/')[2]) === year); let inc=0, exp=0; mTx.forEach(t => { if(t.type==='Thu nhập') inc+=t.amount; else exp+=t.amount; }); incs.push(inc); exps.push(exp); }
    const calBox = document.getElementById('calendarStatbox'); if (calBox) calBox.style.display = 'none';
    processReportData(currentTx, prevTx, labels, incs, exps);
    cachedChartData = { mode: 'custom', txs: currentTx, periodStr: `${startMonth}-${endMonth}-${year}` };
  } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab2'); }
}

function updateTimeNavUI() {
   const label = document.getElementById('currentPeriodLabel'); const weekP = document.getElementById('weekPicker'); const monthP = document.getElementById('monthPicker'); const timeNav = document.getElementById('timeNavContainer'); const customNav = document.getElementById('customFilterContainer');
   if (currentFilterMode === 'weekly') { timeNav.style.display = 'flex'; customNav.style.display = 'none'; weekP.style.display = 'block'; monthP.style.display = 'none'; const wStr = formatWeekInput(activePeriodDate); weekP.value = wStr; label.textContent = `Tuần ${getWeekNumber(activePeriodDate)}, ${activePeriodDate.getFullYear()}`; loadWeeklyReport(wStr); }
   else if (currentFilterMode === 'monthly') { timeNav.style.display = 'flex'; customNav.style.display = 'none'; weekP.style.display = 'none'; monthP.style.display = 'block'; const mStr = `${activePeriodDate.getFullYear()}-${String(activePeriodDate.getMonth()+1).padStart(2,'0')}`; monthP.value = mStr; label.textContent = `Tháng ${activePeriodDate.getMonth()+1}/${activePeriodDate.getFullYear()}`; loadMonthlyReport(mStr); }
   else if (currentFilterMode === 'yearly') { timeNav.style.display = 'none'; customNav.style.display = 'none'; loadCustomReport(1, 12, new Date().getFullYear()); }
   else if (currentFilterMode === 'custom') { timeNav.style.display = 'none'; customNav.style.display = 'flex'; const curM = new Date().getMonth() + 1; document.getElementById('startMonth').value = '1'; document.getElementById('endMonth').value = curM.toString(); }
}

// ===== LỊCH THỐNG KÊ =====
function renderCalendar(txs, dateObj, mode) {
    const grid = document.getElementById('calendarGrid');
    const box = document.getElementById('calendarStatbox');
    if (!grid || !box) return;
    if (mode !== 'monthly' && mode !== 'weekly') { box.style.display = 'none'; return; }
    box.style.display = 'block'; grid.innerHTML = '';

    const dailyData = {};
    txs.forEach(t => {
        if (!t || !t.date) return;
        const parts = t.date.split('/'); if (parts.length !== 3) return;
        const tDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10)-1, parseInt(parts[0], 10));
        const dayKey = formatDateToYYYYMMDD(tDate);
        if (!dailyData[dayKey]) dailyData[dayKey] = { inc: 0, exp: 0 };
        if (t.type === 'Thu nhập') dailyData[dayKey].inc += t.amount; else dailyData[dayKey].exp += t.amount;
    });

    const header = document.querySelector('.calendar-header');
    const startOfWeek = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);

    if (mode === 'weekly') {
        if (header) header.style.display = 'none';
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        for (let i = 0; i < 7; i++) {
            const d = new Date(dateObj); d.setDate(d.getDate() + i);
            const dayKey = formatDateToYYYYMMDD(d);
            const data = dailyData[dayKey] || { inc: 0, exp: 0 };
            let balHTML = `<span class="calendar-balance neutral">0</span>`;
            if (data.inc > 0 || data.exp > 0) {
                const incObj = data.inc > 0 ? formatCurrencyWithUnit(data.inc) : null;
                const expObj = data.exp > 0 ? formatCurrencyWithUnit(data.exp) : null;
                let incStr = incObj ? `<span class="calendar-balance positive cal-row-amt">+${incObj.val}${incObj.unit}</span>` : '';
                let expStr = expObj ? `<span class="calendar-balance negative cal-row-amt">-${expObj.val}${expObj.unit}</span>` : '';
                balHTML = `<div class="cal-amt-col">${incStr}${expStr}</div>`;
            }
            const dayDiv = document.createElement('div'); dayDiv.className = 'calendar-day';
            dayDiv.innerHTML = `<span style="font-size:0.65rem; color:var(--text-3); font-weight:600;">${dayNames[d.getDay()]}</span><span class="calendar-date">${d.getDate()}</span>${balHTML}`;
            dayDiv.onclick = () => { triggerHaptic('light'); document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected-day')); dayDiv.classList.add('selected-day'); openDailyDetailView(d.getDate(), d.getMonth() + 1, d.getFullYear(), txs); };
            grid.appendChild(dayDiv);
        }
    } else {
        if (header) {
            header.style.display = 'grid';
            if (startOfWeek === 1) header.innerHTML = `<span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>`;
            else header.innerHTML = `<span>CN</span><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span>`;
        }
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        const year = dateObj.getFullYear(); const month = dateObj.getMonth();
        let firstDay = new Date(year, month, 1).getDay();
        if (startOfWeek === 1) firstDay = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-day empty"></div>`;

        const today = new Date(); const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i); const dayKey = formatDateToYYYYMMDD(d);
            const data = dailyData[dayKey] || { inc: 0, exp: 0 };
            let balHTML = `<span class="calendar-balance neutral">0</span>`;
            if (data.inc > 0 || data.exp > 0) {
                const incObj2 = data.inc > 0 ? formatCurrencyWithUnit(data.inc) : null;
                const expObj2 = data.exp > 0 ? formatCurrencyWithUnit(data.exp) : null;
                let incStr2 = incObj2 ? `<span class="calendar-balance positive cal-row-amt">+${incObj2.val}${incObj2.unit}</span>` : '';
                let expStr2 = expObj2 ? `<span class="calendar-balance negative cal-row-amt">-${expObj2.val}${expObj2.unit}</span>` : '';
                balHTML = `<div class="cal-amt-col">${incStr2}${expStr2}</div>`;
            }
            let classes = ['calendar-day']; if (isCurrentMonth && today.getDate() === i) classes.push('today');
            const dayDiv = document.createElement('div'); dayDiv.className = classes.join(' ');
            dayDiv.innerHTML = `<span class="calendar-date">${i}</span>${balHTML}`;
            dayDiv.onclick = () => { triggerHaptic('light'); document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected-day')); dayDiv.classList.add('selected-day'); openDailyDetailView(i, month + 1, year, txs); };
            grid.appendChild(dayDiv);
        }
    }
}

// ===== MODAL CHI TIẾT THEO DANH MỤC =====
function showCategoryDetail(cat) {
  if (!cachedChartData || !Array.isArray(cachedChartData.txs)) { showToast("Chưa có dữ liệu báo cáo.", "warning"); return; }
  savedScrollPositionTab2 = window.scrollY || document.documentElement.scrollTop;
  const detailModal = document.getElementById('detailModal');
  document.getElementById('modalOverlay').classList.add('show');
  setTimeout(() => detailModal.classList.add('show'), 10);

  document.getElementById('detailModalTitle').textContent = cat.toUpperCase();
  document.getElementById('detailModalTitle').style.color = 'var(--primary)';

  const txs = cachedChartData.txs.filter(t => t.category === cat);
  let totalInc = 0, totalExp = 0;
  txs.forEach(t => { if(t.type === 'Thu nhập') totalInc += t.amount; else totalExp += t.amount; });

  const incObj = formatCurrencyWithUnit(totalInc);
  document.getElementById('detailTotalIncome').innerHTML = `<span>+</span>${incObj.val}<span>${incObj.unit}</span>`;
  const expObj = formatCurrencyWithUnit(totalExp);
  document.getElementById('detailTotalExpense').innerHTML = `<span>-</span>${expObj.val}<span>${expObj.unit}</span>`;

  const chartContainer = document.getElementById('detailChartContainer'); if(chartContainer) chartContainer.style.display = 'none';
  const pieContainer = document.getElementById('dailyPieChartContainer'); if(pieContainer) pieContainer.style.display = 'none';

  const listTitle = document.getElementById('detailListTitle');
  if (listTitle) listTitle.innerHTML = `Giao dịch chi tiết <span style="font-size:0.75rem; color:var(--text-2); text-transform:none;">(Tổng: ${txs.length})</span>`;

  currentPageCategory = 1;
  displayDetailTransactionsList(txs);
}

// ===== MODAL CHI TIẾT THEO NGÀY (bấm vào ô lịch) =====
function openDailyDetailView(d, m, y, allTxs) {
    const dNum = parseInt(d, 10); const mNum = parseInt(m, 10); const yNum = parseInt(y, 10);
    const dayTxs = allTxs.filter(t => { if (!t || !t.date) return false; const parts = t.date.split('/'); if (parts.length !== 3) return false; return parseInt(parts[0], 10) === dNum && parseInt(parts[1], 10) === mNum && parseInt(parts[2], 10) === yNum; });

    const detailModal = document.getElementById('detailModal');
    document.getElementById('modalOverlay').classList.add('show');
    setTimeout(() => detailModal.classList.add('show'), 10);

    document.getElementById('detailModalTitle').textContent = `NGÀY ${String(dNum).padStart(2,'0')}/${String(mNum).padStart(2,'0')}/${yNum}`;
    document.getElementById('detailModalTitle').style.color = 'var(--text-1)';

    let totalExp = 0, totalInc = 0;
    dayTxs.forEach(t => { if(t.type === 'Chi tiêu') totalExp += t.amount; else totalInc += t.amount; });

    const incObj = formatCurrencyWithUnit(totalInc);
    document.getElementById('detailTotalIncome').innerHTML = `<span>+</span>${incObj.val}<span>${incObj.unit}</span>`;
    const expObj = formatCurrencyWithUnit(totalExp);
    document.getElementById('detailTotalExpense').innerHTML = `<span>-</span>${expObj.val}<span>${expObj.unit}</span>`;

    const chartContainer = document.getElementById('detailChartContainer'); if(chartContainer) chartContainer.style.display = 'none';
    const pieContainer = document.getElementById('dailyPieChartContainer');
    if (totalExp > 0 && pieContainer) {
        pieContainer.style.display = 'flex'; const catMap = {};
        dayTxs.forEach(t => { if(t.type==='Chi tiêu') catMap[t.category] = (catMap[t.category]||0)+t.amount; });
        const data = Object.keys(catMap).map(k => ({category: k, amount: catMap[k]})).sort((a,b) => b.amount - a.amount);
        drawDailyPieChart(data, totalExp);
    } else if (pieContainer) { pieContainer.style.display = 'none'; }

    const listTitle = document.getElementById('detailListTitle');
    if (listTitle) listTitle.innerHTML = `Giao dịch trong ngày <span style="font-size:0.75rem; color:var(--text-2); text-transform:none;">(Tổng: ${dayTxs.length})</span>`;

    currentPageCategory = 1; displayDetailTransactionsList(dayTxs);
}

function drawDailyPieChart(data, totalExp) {
    const ctx = document.getElementById('dailyPieChart').getContext('2d');
    if(window.dChart) window.dChart.destroy();
    const amts = data.map(i=>i.amount); const lbls = data.map(i=>i.category); const bg = data.map((_,i)=>getColorByIndex(i));

    window.dChart = new Chart(ctx, {
        type: 'doughnut', data: { labels:lbls, datasets: [{data:amts, backgroundColor:bg, borderWidth: 0, hoverOffset: 4}] },
        options: { devicePixelRatio: 4, cutout:'75%', layout: {padding: 8}, plugins: { legend: {display:false}, tooltip: { enabled: false } } },
        plugins: [{ id:'cText2', afterDraw(c) { const {ctx} = c; ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#94A3B8'; ctx.font='500 9px Plus Jakarta Sans'; ctx.fillText('Tổng chi', c.width/2, c.height/2 - 8); ctx.fillStyle='#F43F5E'; ctx.font='800 11px Plus Jakarta Sans'; const tObj = formatCurrencyWithUnit(totalExp); const displayTotal = isPrivacyActive ? '***' : tObj.val + tObj.unit; ctx.fillText(displayTotal, c.width/2, c.height/2 + 6); ctx.restore(); } }]
    });

    const leg = document.getElementById('dailyCustomLegend'); if(leg) leg.innerHTML = '';
    data.forEach((i, idx) => {
      const pct = totalExp>0 ? ((i.amount/totalExp)*100).toFixed(1) : 0; const c = bg[idx]; const catIconHTML = getCategoryIcon(i.category);
      const divLeg = document.createElement('div'); divLeg.className = 'legend-item';
      divLeg.innerHTML = `<div class="legend-item-left"><span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex-shrink:0; color:${c}; font-size:13px; margin-right: 8px;">${catIconHTML}</span><span class="legend-name" title="${escapeHTML(i.category)}">${escapeHTML(i.category)}</span></div><div class="legend-value-col"><span class="legend-pct" style="color:${c};">${pct}%</span></div>`;
      if(leg) leg.appendChild(divLeg);
    });
}

function displayDetailTransactionsList(txs) {
  const list = document.getElementById('detailTransactionsContainer'); list.innerHTML = '';
  if(txs.length === 0) { list.innerHTML = '<div class="empty-state">Không có giao dịch nào</div>'; document.getElementById('paginationDetail').style.display = 'none'; return; }
  document.getElementById('paginationDetail').style.display = 'flex';
  const tPages = Math.ceil(txs.length / itemsPerPage); const pData = txs.slice((currentPageCategory - 1) * itemsPerPage, currentPageCategory * itemsPerPage);
  pData.forEach((item, index) => {
    const tCls = item.type === 'Thu nhập' ? 'income' : 'expense'; const icon = getCategoryIcon(item.category); const stt = (currentPageCategory - 1) * itemsPerPage + index + 1;
    const amtObj = formatCurrencyWithUnit(item.amount);
    const card = document.createElement('div'); card.className = `tx-card ${tCls}`;
    card.innerHTML = `<div class="tx-icon-wrap ${tCls}">${icon}</div><div class="tx-body"><div class="tx-title">${escapeHTML(item.content)}</div><div class="tx-meta-row"><span class="tx-date">${escapeHTML(formatDate(item.date))}</span><span class="tx-badge tx-badge-neutral">${escapeHTML(item.type)}</span><span class="tx-badge ${tCls}">${escapeHTML(item.category)}</span></div>${item.note ? `<div class="tx-note"><i class="fas fa-tag tx-note-icon"></i>${escapeHTML(item.note)}</div>` : ''}<div class="tx-id-row"><span>STT: ${stt}</span> • <span>#${escapeHTML(item.id)}</span></div></div><div class="tx-right-col"><div class="tx-amount ${tCls}"><span>${item.type==='Thu nhập'?'+':'−'}</span>${amtObj.val}<span>${amtObj.unit}</span></div><div class="tx-actions"><button class="tx-btn edit-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-pen"></i></button><button class="tx-btn delete-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-trash"></i></button></div></div>`;
    list.appendChild(card);
  });
  document.getElementById('pageInfoDetail').textContent = `${currentPageCategory} / ${tPages}`;
  document.getElementById('prevPageDetail').disabled = currentPageCategory === 1;
  document.getElementById('nextPageDetail').disabled = currentPageCategory === tPages;
  document.getElementById('prevPageDetail').onclick = () => { triggerHaptic('light'); if(currentPageCategory > 1) { currentPageCategory--; displayDetailTransactionsList(txs); } };
  document.getElementById('nextPageDetail').onclick = () => { triggerHaptic('light'); if(currentPageCategory < tPages) { currentPageCategory++; displayDetailTransactionsList(txs); } };
  document.querySelectorAll('#detailTransactionsContainer .edit-btn').forEach(btn => btn.onclick = () => { closeDetailModal(); setTimeout(() => openEditForm(txs.find(i => String(i.id) === btn.getAttribute('data-id'))), 350); });
  document.querySelectorAll('#detailTransactionsContainer .delete-btn').forEach(btn => btn.onclick = () => { closeDetailModal(); setTimeout(() => deleteTransaction(btn.getAttribute('data-id')), 350); });
}

window.closeDetailModal = function() {
    triggerHaptic('light');
    document.getElementById('detailModal').classList.remove('show');
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};
// ---------------- TÌM KIẾM (MODAL) ----------------
window.openSearchModal = function() {
    triggerHaptic('light');
    document.getElementById('searchContent').value = '';
    document.getElementById('searchAmount').value = '';
    const sCat = document.getElementById('searchCategory'); if (sCat) sCat.value = '';
    cachedSearchResults = []; currentPageSearch = 1;
    document.getElementById('searchResultsContainer').innerHTML = '';
    const ph = document.getElementById('placeholderSearch'); if (ph) ph.style.display = 'none';
    const pg = document.getElementById('paginationSearch'); if (pg) pg.style.display = 'none';
    document.getElementById('modalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('searchModal').classList.add('show'), 10);
};

window.closeSearchModal = function() {
    document.getElementById('searchModal').classList.remove('show');
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

function displaySearchResults() {
    const list = document.getElementById('searchResultsContainer'); list.innerHTML='';
    const data = cachedSearchResults;
    if(!data || data.length === 0) { document.getElementById('placeholderSearch').style.display = 'block'; document.getElementById('paginationSearch').style.display = 'none'; return; }
    document.getElementById('placeholderSearch').style.display = 'none';
    document.getElementById('paginationSearch').style.display = 'flex';
    const tPages = Math.ceil(data.length / itemsPerPage); const pData = data.slice((currentPageSearch - 1) * itemsPerPage, currentPageSearch * itemsPerPage);
    pData.forEach((item, index) => { const tCls = item.type==='Thu nhập'?'income':'expense'; const icon = getCategoryIcon(item.category); const stt = (currentPageSearch - 1) * itemsPerPage + index + 1; const amtObj = formatCurrencyWithUnit(item.amount); const card = document.createElement('div'); card.className = `tx-card ${tCls}`; card.innerHTML = `<div class="tx-icon-wrap ${tCls}">${icon}</div><div class="tx-body"><div class="tx-title">${escapeHTML(item.content)}</div><div class="tx-meta-row"><span class="tx-date">${escapeHTML(formatDate(item.date))}</span><span class="tx-badge tx-badge-neutral">${escapeHTML(item.type)}</span><span class="tx-badge ${tCls}">${escapeHTML(item.category)}</span></div>${item.note ? `<div class="tx-note"><i class="fas fa-tag tx-note-icon"></i>${escapeHTML(item.note)}</div>` : ''}<div class="tx-id-row"><span>STT: ${stt}</span> • <span>#${escapeHTML(item.id)}</span></div></div><div class="tx-right-col"><div class="tx-amount ${tCls}"><span>${item.type==='Thu nhập'?'+':'−'}</span>${amtObj.val}<span>${amtObj.unit}</span></div><div class="tx-actions"><button class="tx-btn edit-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-pen"></i></button><button class="tx-btn delete-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-trash"></i></button></div></div>`; list.appendChild(card); });
    document.getElementById('pageInfoSearch').textContent = `${currentPageSearch} / ${tPages}`; document.getElementById('prevPageSearch').disabled = currentPageSearch === 1; document.getElementById('nextPageSearch').disabled = currentPageSearch === tPages; document.getElementById('prevPageSearch').onclick = () => { triggerHaptic('light'); if(currentPageSearch > 1) { currentPageSearch--; displaySearchResults(); } }; document.getElementById('nextPageSearch').onclick = () => { triggerHaptic('light'); if(currentPageSearch < tPages) { currentPageSearch++; displaySearchResults(); } };
    document.querySelectorAll('#searchResultsContainer .edit-btn').forEach(btn => btn.onclick = () => openEditForm(data.find(i => String(i.id) === btn.getAttribute('data-id')))); document.querySelectorAll('#searchResultsContainer .delete-btn').forEach(btn => btn.onclick = () => deleteTransaction(btn.getAttribute('data-id')));
}

// ---------------- TAB 3: QUẢN LÝ TỪ KHÓA ----------------
window.loadKeywords = async function(isInit = false) {
    if(!isInit) showLoading(true, 'tab3');
    if(!isInit) document.getElementById('keywordsContainer').innerHTML = '';
    try {
        const iconData = await secureFetch(`/users/${chatId}/categoryIcons.json`);
        if(iconData) window.customCategoryIcons = iconData;
        let data = await secureFetch(`/users/${chatId}/keywords.json`);
        if (data && !Array.isArray(data) && typeof data === 'object') { data = Object.values(data).filter(item => item !== null); }
        cachedKeywords = data || [];
        window.categoryIconMap = {};
        cachedKeywords.forEach(kw => { if (kw && kw.category && kw.icon) window.categoryIconMap[kw.category.trim()] = kw.icon.trim(); });
        if(!isInit) displayKeywords();
    } catch(e) { if(!isInit) showToast(e.message, 'error'); } finally { if(!isInit) showLoading(false, 'tab3'); }
};

window.startEditKeyword = function(kw, category) {
    triggerHaptic('light');
    document.getElementById('keywordInput').value = kw;
    document.getElementById('keywordCategory').value = category;
    currentEditKeyword = kw;
    const btnAdd = document.getElementById('addKeywordBtn');
    btnAdd.innerHTML = '<i class="fas fa-save"></i> Lưu sửa';
    btnAdd.classList.add('btn-edit-kw');
    document.getElementById('cancelKeywordBtn').style.display = 'flex';
    document.getElementById('deleteEditKeywordBtn').style.display = 'flex';
    document.getElementById('fetchKeywordsBtn').style.display = 'none';
};

window.cancelEditKeyword = function() {
    triggerHaptic('light');
    document.getElementById('keywordInput').value = '';
    currentEditKeyword = null;
    const btnAdd = document.getElementById('addKeywordBtn');
    btnAdd.innerHTML = '<i class="fas fa-plus"></i> Thêm';
    btnAdd.classList.remove('btn-edit-kw');
    document.getElementById('cancelKeywordBtn').style.display = 'none';
    document.getElementById('deleteEditKeywordBtn').style.display = 'none';
    document.getElementById('fetchKeywordsBtn').style.display = 'flex';
};

function displayKeywords() {
   const container = document.getElementById('keywordsContainer'); container.innerHTML = '';
   if(!cachedKeywords || cachedKeywords.length === 0) { document.getElementById('placeholderTab3').style.display = 'block'; return; }
   document.getElementById('placeholderTab3').style.display = 'none';
   const groupedKeywords = {}; cachedKeywords.forEach(item => { const category = item.category || 'Khác'; if (!groupedKeywords[category]) groupedKeywords[category] = { keywords: [] }; if (item.keywords && typeof item.keywords === 'string') { const kwsArray = item.keywords.split(',').map(k => k.trim()).filter(k => k !== ''); kwsArray.forEach(kw => { if (!groupedKeywords[category].keywords.includes(kw)) groupedKeywords[category].keywords.push(kw); }); } });
   Object.keys(groupedKeywords).sort((a,b) => { if (a.toLowerCase() === 'khác') return 1; if (b.toLowerCase() === 'khác') return -1; return a.localeCompare(b, 'vi'); }).forEach(category => {
       const group = groupedKeywords[category]; let tagsHTML = '';
       group.keywords.sort((a,b) => a.localeCompare(b, 'vi')).forEach(kw => { tagsHTML += `<span class="keyword-tag" onclick="startEditKeyword('${escapeHTML(kw)}', '${escapeHTML(category)}')">${escapeHTML(kw)}</span>`; });
       const div = document.createElement('div'); div.className = 'tx-card keyword-group-card';
       div.innerHTML = `<div class="accordion-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display==='none'?'flex':'none'; this.querySelector('.chevron').style.transform = this.nextElementSibling.style.display==='none'?'rotate(0deg)':'rotate(180deg)';"><div class="flex-row-gap-10" style="align-items:center;"><div class="tx-icon-wrap expense">${getCategoryIcon(category)}</div><div class="tx-body"><div class="tx-title">${escapeHTML(category)}</div><div class="tx-id-row">${group.keywords.length} từ khóa</div></div></div><i class="fas fa-chevron-down chevron" style="color: var(--text-3); transition: 0.3s;"></i></div><div class="accordion-body" style="display:none;">${tagsHTML || '<span class="tx-note">Chưa có từ khóa</span>'}</div>`;
       container.appendChild(div);
   });
}
// ---------------- DANH MỤC (CATEGORIES) ----------------
window.fetchCategories = async function() {
    try {
        let data = await secureFetch(`/users/${chatId}/keywords.json`);
        if (data && !Array.isArray(data) && typeof data === 'object') { data = Object.values(data).filter(item => item !== null); }
        const cats = (data || []).map(item => item.category).filter(c => c);
        availableCategories = [...new Set(cats)].sort((a, b) => a.localeCompare(b, 'vi'));
    } catch(e) { availableCategories = []; }
    populateCategoryDropdowns();
};

function populateCategoryDropdowns() {
    const selects = [
        { el: document.getElementById('addCategory'), placeholder: '-- Chọn danh mục --' },
        { el: document.getElementById('editCategory'), placeholder: '-- Chọn danh mục --' },
        { el: document.getElementById('keywordCategory'), placeholder: '-- Chọn / nhập danh mục --' },
        { el: document.getElementById('searchCategory'), placeholder: 'Tất cả danh mục' }
    ];
    selects.forEach(({ el, placeholder }) => {
        if (!el) return;
        const current = el.value;
        el.innerHTML = `<option value="">${placeholder}</option>`;
        availableCategories.forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.textContent = cat; el.appendChild(opt); });
        if (current && availableCategories.includes(current)) el.value = current;
    });
}

// ---------------- CHỌN LOẠI (Thu/Chi) ----------------
window.selectType = function(formPrefix, type) {
    triggerHaptic('light');
    const incBtn = document.getElementById(`${formPrefix}TypeIncome`);
    const expBtn = document.getElementById(`${formPrefix}TypeExpense`);
    const hidden = document.getElementById(`${formPrefix}Type`);
    if (type === 'Thu nhập') { incBtn.classList.add('active'); expBtn.classList.remove('active'); }
    else { expBtn.classList.add('active'); incBtn.classList.remove('active'); }
    if (hidden) hidden.value = type;
};

// ---------------- MỞ / ĐÓNG FORM ----------------
window.openAddForm = function() {
    triggerHaptic('medium');
    document.getElementById('addForm').reset();
    document.getElementById('addType').value = 'Chi tiêu';
    selectType('add', 'Chi tiêu');
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    document.getElementById('addDate').value = `${today.getFullYear()}-${mm}-${dd}`;
    document.getElementById('modalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('addModal').classList.add('show'), 10);
};

window.closeAddForm = function() {
    document.getElementById('addModal').classList.remove('show');
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

window.openEditForm = function(tx) {
    if (!tx) return;
    triggerHaptic('medium');
    document.getElementById('editId').value = tx.id;
    document.getElementById('editContent').value = tx.content || '';
    document.getElementById('editAmount').value = tx.amount || '';
    document.getElementById('editCategory').value = tx.category || '';
    document.getElementById('editNote').value = tx.note || '';
    document.getElementById('editType').value = tx.type || 'Chi tiêu';
    selectType('edit', tx.type || 'Chi tiêu');
    const parts = (tx.date || '').split('/');
    if (parts.length === 3) document.getElementById('editDate').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
    document.getElementById('modalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('editModal').classList.add('show'), 10);
};

window.closeEditForm = function() {
    document.getElementById('editModal').classList.remove('show');
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

window.closeAllModals = function() {
    document.getElementById('addModal').classList.remove('show');
    document.getElementById('editModal').classList.remove('show');
    if (document.getElementById('iconPickerModal')) document.getElementById('iconPickerModal').classList.remove('show');
    closeSearchModal();
    closeDetailModal();
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

// ---------------- SUBMIT FORM ----------------
document.getElementById('addForm').onsubmit = function(e) {
    e.preventDefault();
    const dRaw = document.getElementById('addDate').value;
    const dParts = dRaw.split('-');
    const tx = {
        id: generateSafeTransactionId(),
        date: dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : dRaw,
        type: document.getElementById('addType').value,
        content: document.getElementById('addContent').value.trim(),
        amount: parseFloat(document.getElementById('addAmount').value) || 0,
        category: document.getElementById('addCategory').value.trim(),
        note: document.getElementById('addNote').value.trim()
    };
    submitTx(tx, 'addTransaction');
};

document.getElementById('editForm').onsubmit = function(e) {
    e.preventDefault();
    const dRaw = document.getElementById('editDate').value;
    const dParts = dRaw.split('-');
    const tx = {
        id: document.getElementById('editId').value,
        date: dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : dRaw,
        type: document.getElementById('editType').value,
        content: document.getElementById('editContent').value.trim(),
        amount: parseFloat(document.getElementById('editAmount').value) || 0,
        category: document.getElementById('editCategory').value.trim(),
        note: document.getElementById('editNote').value.trim()
    };
    submitTx(tx, 'updateTransaction');
};

// ---------------- TẠO ID AN TOÀN ----------------
function generateSafeTransactionId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GD${ts}${rand}`;
}

// ---------------- LƯU GIAO DỊCH ----------------
async function submitTx(tx, action) {
    if (!tx.content || !tx.amount || !tx.category) { showToast('Vui lòng nhập đủ Nội dung, Số tiền, Danh mục!', 'error'); return; }
    triggerHaptic('medium');
    showButtonLoading(action === 'addTransaction' ? 'addSubmitBtn' : 'editSubmitBtn', true);
    try {
        const dParts = tx.date.split('/');
        const m = dParts.length === 3 ? parseInt(dParts[1], 10) : (new Date().getMonth() + 1);
        const payload = { ...tx, _action: action };
        await secureFetch(`/transactions/users/${chatId}/month_${m}/${tx.id}.json`, 'PUT', payload);
        showToast(action === 'addTransaction' ? 'Đã thêm giao dịch!' : 'Đã cập nhật giao dịch!', 'success');
        if (action === 'addTransaction') closeAddForm(); else closeEditForm();
        window.apiTxCache = {};
        await fetchTransactions();
        tab2NeedsReload = true;
    } catch (e) {
        showToast(e.message || 'Lỗi khi lưu giao dịch', 'error');
    } finally {
        showButtonLoading(action === 'addTransaction' ? 'addSubmitBtn' : 'editSubmitBtn', false);
    }
}

// ---------------- XÓA GIAO DỊCH ----------------
window.deleteTransaction = function(id) {
    const tx = (cachedTransactions || []).find(t => String(t.id) === String(id)) || (cachedSearchResults || []).find(t => String(t.id) === String(id));
    showCustomConfirm(`Bạn có chắc muốn xóa giao dịch <b>#${escapeHTML(id)}</b>?`, async () => {
        triggerHaptic('heavy');
        try {
            let m;
            if (tx && tx.date) { const dParts = tx.date.split('/'); m = dParts.length === 3 ? parseInt(dParts[1], 10) : null; }
            if (!m) { showToast('Không xác định được tháng của giao dịch', 'error'); return; }
            await secureFetch(`/transactions/users/${chatId}/month_${m}/${id}.json`, 'DELETE');
            showToast('Đã xóa giao dịch!', 'success');
            window.apiTxCache = {};
            await fetchTransactions();
            tab2NeedsReload = true;
            if (document.getElementById('searchModal').classList.contains('show')) { cachedSearchResults = cachedSearchResults.filter(t => String(t.id) !== String(id)); displaySearchResults(); }
        } catch (e) { showToast(e.message || 'Lỗi khi xóa', 'error'); }
    });
};

window.closeConfirmDeleteModal = function() {
    const m = document.getElementById('confirmDeleteModal');
    if (m) m.classList.remove('show');
};

// ---------------- XUẤT CSV ----------------
window.exportToCSV = function() {
    triggerHaptic('medium');
    if (!cachedTransactions || cachedTransactions.length === 0) { showToast('Không có dữ liệu để xuất!', 'error'); return; }
    const header = ['STT', 'ID', 'Ngày', 'Loại', 'Nội dung', 'Số tiền', 'Danh mục', 'Ghi chú'];
    const rows = cachedTransactions.map((t, i) => [i + 1, t.id, t.date, t.type, `"${(t.content || '').replace(/"/g, '""')}"`, t.amount, `"${(t.category || '').replace(/"/g, '""')}"`, `"${(t.note || '').replace(/"/g, '""')}"`]);
    let csv = '\uFEFF' + header.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `giao_dich_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Đã xuất CSV!', 'success');
};

// ---------------- XUẤT PDF ----------------
window.exportToPDF = async function() {
    triggerHaptic('medium');
    if (!cachedTransactions || cachedTransactions.length === 0) { showToast('Không có dữ liệu để xuất!', 'error'); return; }
    showToast('Đang tạo PDF...', 'info');
    try {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;color:#111;padding:30px;font-family:sans-serif;';
        let totalInc = 0, totalExp = 0;
        cachedTransactions.forEach(t => { if (t.type === 'Thu nhập') totalInc += Number(t.amount) || 0; else totalExp += Number(t.amount) || 0; });
        let rowsHTML = cachedTransactions.map((t, i) => `<tr><td style="border:1px solid #ddd;padding:6px;">${i + 1}</td><td style="border:1px solid #ddd;padding:6px;">${escapeHTML(t.date)}</td><td style="border:1px solid #ddd;padding:6px;">${escapeHTML(t.content)}</td><td style="border:1px solid #ddd;padding:6px;">${escapeHTML(t.category)}</td><td style="border:1px solid #ddd;padding:6px;text-align:right;color:${t.type === 'Thu nhập' ? 'green' : 'red'};">${t.type === 'Thu nhập' ? '+' : '−'}${formatFullCurrency(t.amount)}</td></tr>`).join('');
        wrap.innerHTML = `<h2 style="text-align:center;">Báo cáo giao dịch</h2><p style="text-align:center;color:#666;">Xuất ngày ${new Date().toLocaleDateString('vi-VN')}</p><div style="display:flex;justify-content:space-around;margin:20px 0;"><div><b>Thu nhập:</b> <span style="color:green;">${formatFullCurrency(totalInc)}</span></div><div><b>Chi tiêu:</b> <span style="color:red;">${formatFullCurrency(totalExp)}</span></div><div><b>Số dư:</b> ${formatFullCurrency(totalInc - totalExp)}</div></div><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f0f0f0;"><th style="border:1px solid #ddd;padding:6px;">STT</th><th style="border:1px solid #ddd;padding:6px;">Ngày</th><th style="border:1px solid #ddd;padding:6px;">Nội dung</th><th style="border:1px solid #ddd;padding:6px;">Danh mục</th><th style="border:1px solid #ddd;padding:6px;text-align:right;">Số tiền</th></tr></thead><tbody>${rowsHTML}</tbody></table>`;
        document.body.appendChild(wrap);
        const canvas = await html2canvas(wrap, { scale: 2 });
        document.body.removeChild(wrap);
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const imgH = (canvas.height * pdfW) / canvas.width;
        let heightLeft = imgH; let position = 0;
        pdf.addImage(imgData, 'PNG', 0, position, pdfW, imgH);
        heightLeft -= pdfH;
        while (heightLeft > 0) { position -= pdfH; pdf.addPage(); pdf.addImage(imgData, 'PNG', 0, position, pdfW, imgH); heightLeft -= pdfH; }
        pdf.save(`bao_cao_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('Đã xuất PDF!', 'success');
    } catch (e) { showToast('Lỗi khi tạo PDF: ' + e.message, 'error'); }
};
// ---------------- ICON PICKER (TAB 3) ----------------
window.openIconPickerModal = async function() {
    triggerHaptic('light');
    const catSelect = document.getElementById('iconPickerCategory');
    const grid = document.getElementById('iconPickerGrid');
    if (!catSelect || !grid) return;

    // Nạp danh mục vào dropdown của icon picker
    catSelect.innerHTML = '<option value="">-- Chọn danh mục --</option>';
    availableCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        catSelect.appendChild(opt);
    });

    // Render lưới icon từ EMOJI_TO_FA_MAP
    grid.innerHTML = '';
    Object.keys(EMOJI_TO_FA_MAP).forEach(emoji => {
        const faClass = EMOJI_TO_FA_MAP[emoji];
        const cell = document.createElement('div');
        cell.className = 'icon-picker-cell';
        cell.innerHTML = `<i class="${faClass}"></i>`;
        cell.onclick = () => {
            document.querySelectorAll('.icon-picker-cell').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            selectedIconClass = faClass;
        };
        grid.appendChild(cell);
    });

    selectedIconClass = null;

    catSelect.onchange = function() {
        const cat = catSelect.value;
        const currentFa = (cat && window.categoryIconMap && window.categoryIconMap[cat]) ? window.categoryIconMap[cat] : null;
        document.querySelectorAll('.icon-picker-cell').forEach(c => {
            const ic = c.querySelector('i');
            if (currentFa && ic && ic.className === currentFa) { c.classList.add('selected'); selectedIconClass = currentFa; }
            else c.classList.remove('selected');
        });
    };

    // Lưu icon đã chọn cho danh mục
    const saveBtn = document.getElementById('saveIconBtn');
    if (saveBtn) saveBtn.onclick = async function() {
        const cat = catSelect.value;
        if (!cat) { showToast('Hãy chọn danh mục!', 'error'); return; }
        if (!selectedIconClass) { showToast('Hãy chọn một biểu tượng!', 'error'); return; }
        triggerHaptic('medium');
        showButtonLoading('saveIconBtn', true);
        try {
            if (!window.customCategoryIcons || typeof window.customCategoryIcons !== 'object') window.customCategoryIcons = {};
            const emoji = FA_TO_EMOJI_MAP[selectedIconClass] || selectedIconClass;
            window.customCategoryIcons[cat] = emoji;
            await secureFetch(`/users/${chatId}/categoryIcons.json`, 'PUT', window.customCategoryIcons);
            window.categoryIconMap[cat] = selectedIconClass;
            showToast('Đã lưu biểu tượng!', 'success');
            closeIconPickerModal();
            await loadKeywords();
            displayKeywords();
        } catch (e) { showToast(e.message || 'Lỗi khi lưu biểu tượng', 'error'); }
        finally { showButtonLoading('saveIconBtn', false); }
    };

    document.getElementById('modalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('iconPickerModal').classList.add('show'), 10);
};

window.closeIconPickerModal = function() {
    document.getElementById('iconPickerModal').classList.remove('show');
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

// ==================================================================
//                  KHỞI TẠO ỨNG DỤNG (BOOT)
// ==================================================================
document.addEventListener('DOMContentLoaded', function() {

    // --- Áp dụng cài đặt đã lưu ---
    applyPrivacyMode();
    const savedTheme = localStorage.getItem('settingTheme') || 'auto';
    document.body.className = 'theme-' + savedTheme;

    // --- Điều hướng các tab (nav) ---
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            triggerHaptic('light');
            const tabId = this.getAttribute('data-tab');

            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            const tabEl = document.getElementById(tabId);
            if (tabEl) tabEl.classList.add('active');

            // Tải dữ liệu theo từng tab
            if (tabId === 'tab2') {
                if (tab2NeedsReload) {
                    if (currentFilterMode === 'weekly') loadWeekly();
                    else if (currentFilterMode === 'monthly') loadMonthly();
                    else if (currentFilterMode === 'custom') loadCustom();
                    else loadMonthly();
                    tab2NeedsReload = false;
                }
                if (savedScrollPositionTab2) setTimeout(() => window.scrollTo(0, savedScrollPositionTab2), 50);
            } else if (tabId === 'tab3') {
                displayKeywords();
            }
        });
    });

    // --- Chọn loại trong form Thêm / Sửa ---
    const addInc = document.getElementById('addTypeIncome'); if (addInc) addInc.onclick = () => selectType('add', 'Thu nhập');
    const addExp = document.getElementById('addTypeExpense'); if (addExp) addExp.onclick = () => selectType('add', 'Chi tiêu');
    const editInc = document.getElementById('editTypeIncome'); if (editInc) editInc.onclick = () => selectType('edit', 'Thu nhập');
    const editExp = document.getElementById('editTypeExpense'); if (editExp) editExp.onclick = () => selectType('edit', 'Chi tiêu');

    // --- Bộ lọc thời gian TAB 2 ---
    const fW = document.getElementById('filterWeeklyBtn'); if (fW) fW.onclick = () => loadWeekly();
    const fM = document.getElementById('filterMonthlyBtn'); if (fM) fM.onclick = () => loadMonthly();
    const fC = document.getElementById('filterCustomBtn'); if (fC) fC.onclick = () => loadCustom();
    const pPrev = document.getElementById('prevPeriodBtn'); if (pPrev) pPrev.onclick = () => navigatePeriod(-1);
    const pNext = document.getElementById('nextPeriodBtn'); if (pNext) pNext.onclick = () => navigatePeriod(1);
    const tChart = document.getElementById('toggleChartBtn'); if (tChart) tChart.onclick = () => toggleChartType();
    const fCustomData = document.getElementById('fetchCustomDataBtn'); if (fCustomData) fCustomData.onclick = () => loadCustom();

    // --- TÌM KIẾM (modal) ---
    document.querySelectorAll('#searchModal .period-pill').forEach(pill => {
        pill.addEventListener('click', function() {
            triggerHaptic('light');
            document.querySelectorAll('#searchModal .period-pill').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            const mode = this.getAttribute('data-mode');
            const customC = document.getElementById('searchCustomFilterContainer');
            if (customC) customC.style.display = (mode === 'custom') ? 'block' : 'none';
        });
    });

    const searchBtn = document.getElementById('searchTransactionsBtn');
    if (searchBtn) searchBtn.onclick = async function() {
        triggerHaptic('medium');
        const content = document.getElementById('searchContent').value.trim().toLowerCase();
        const amount = parseFloat(document.getElementById('searchAmount').value) || null;
        const cat = document.getElementById('searchCategory') ? document.getElementById('searchCategory').value : '';
        const activePill = document.querySelector('#searchModal .period-pill.active');
        const mode = activePill ? activePill.getAttribute('data-mode') : 'monthly';

        if (!content && !amount && !cat) { showToast('Nhập ít nhất một điều kiện tìm kiếm!', 'error'); return; }

        showLoading(true, 'search');
        try {
            // Xác định các tháng cần quét
            let months = [];
            const now = new Date();
            if (mode === 'monthly') {
                months = [now.getMonth() + 1];
            } else if (mode === 'yearly') {
                months = Array.from({ length: 12 }, (_, i) => i + 1);
            } else if (mode === 'custom') {
                const sM = parseInt(document.getElementById('searchStartMonth').value, 10);
                const eM = parseInt(document.getElementById('searchEndMonth').value, 10);
                if (!sM || !eM || sM > eM) { showToast('Khoảng tháng không hợp lệ!', 'error'); showLoading(false, 'search'); return; }
                for (let m = sM; m <= eM; m++) months.push(m);
            }

            // Lấy giao dịch các tháng
            let allTx = [];
            for (const m of months) { const txs = await fetchMonthData(m); allTx = allTx.concat(txs); }

            // Lọc theo điều kiện
            cachedSearchResults = allTx.filter(t => {
                let ok = true;
                if (content) ok = ok && ((t.content || '').toLowerCase().includes(content) || (t.note || '').toLowerCase().includes(content));
                if (amount) ok = ok && (Number(t.amount) === amount);
                if (cat) ok = ok && (t.category === cat);
                return ok;
            }).sort((a, b) => parseDate(b.date) - parseDate(a.date));

            currentPageSearch = 1;
            displaySearchResults();
            showToast(`Tìm thấy ${cachedSearchResults.length} kết quả`, cachedSearchResults.length ? 'success' : 'info');
        } catch (e) {
            showToast(e.message || 'Lỗi khi tìm kiếm', 'error');
        } finally {
            showLoading(false, 'search');
        }
    };

    // --- TAB 3: Từ khóa ---
    const addKwBtn = document.getElementById('addKeywordBtn'); if (addKwBtn) addKwBtn.onclick = () => saveKeyword();
    const fetchKwBtn = document.getElementById('fetchKeywordsBtn'); if (fetchKwBtn) fetchKwBtn.onclick = () => loadKeywords();
    const cancelKwBtn = document.getElementById('cancelKeywordBtn'); if (cancelKwBtn) cancelKwBtn.onclick = () => cancelEditKeyword();
    const delEditKwBtn = document.getElementById('deleteEditKeywordBtn'); if (delEditKwBtn) delEditKwBtn.onclick = () => deleteKeyword();
    const openIconBtn = document.getElementById('openIconPickerBtn'); if (openIconBtn) openIconBtn.onclick = () => openIconPickerModal();

    // --- CÀI ĐẶT (TAB 4) ---
    const setTheme = document.getElementById('settingTheme');
    if (setTheme) { setTheme.value = savedTheme; setTheme.onchange = function() { const v = this.value; document.body.className = 'theme-' + v; localStorage.setItem('settingTheme', v); triggerHaptic('light'); }; }

    const setDefaultTab = document.getElementById('settingDefaultTab');
    if (setDefaultTab) { setDefaultTab.value = localStorage.getItem('settingDefaultTab') || 'tab1'; setDefaultTab.onchange = function() { localStorage.setItem('settingDefaultTab', this.value); triggerHaptic('light'); }; }

    const setStartOfWeek = document.getElementById('settingStartOfWeek');
    if (setStartOfWeek) { setStartOfWeek.value = localStorage.getItem('settingStartOfWeek') || '1'; setStartOfWeek.onchange = function() { localStorage.setItem('settingStartOfWeek', this.value); triggerHaptic('light'); tab2NeedsReload = true; showToast('Đã đổi ngày bắt đầu tuần', 'success'); }; }

    const setCurrency = document.getElementById('settingCurrencyFormat');
    if (setCurrency) { setCurrency.value = localStorage.getItem('settingCurrencyFormat') || 'full'; setCurrency.onchange = function() { localStorage.setItem('settingCurrencyFormat', this.value); triggerHaptic('light'); if (typeof displayTransactions === 'function') displayTransactions(); tab2NeedsReload = true; }; }

    const setPrivacy = document.getElementById('settingPrivacyMode');
    if (setPrivacy) { setPrivacy.checked = localStorage.getItem('settingPrivacyMode') === 'true'; setPrivacy.onchange = function() { localStorage.setItem('settingPrivacyMode', this.checked); applyPrivacyMode(); triggerHaptic('light'); }; }

    const setHaptic = document.getElementById('settingHaptic');
    if (setHaptic) { setHaptic.checked = localStorage.getItem('settingHaptic') !== 'false'; setHaptic.onchange = function() { localStorage.setItem('settingHaptic', this.checked); triggerHaptic('light'); }; }

    // Chat ID (chỉ hiển thị)
    const setChatId = document.getElementById('settingChatId');
    if (setChatId) setChatId.value = chatId || '(chưa có)';

    // Sao lưu toàn bộ dữ liệu ra CSV (client-side)
    const backupBtn = document.getElementById('backupTelegramBtn');
    if (backupBtn) backupBtn.onclick = async function() {
        triggerHaptic('medium');
        showButtonLoading('backupTelegramBtn', true);
        try {
            let allTx = [];
            for (let m = 1; m <= 12; m++) { const txs = await fetchMonthData(m); allTx = allTx.concat(txs); }
            if (allTx.length === 0) { showToast('Không có dữ liệu để sao lưu!', 'error'); return; }
            allTx.sort((a, b) => parseDate(a.date) - parseDate(b.date));
            const header = ['STT', 'ID', 'Ngày', 'Loại', 'Nội dung', 'Số tiền', 'Danh mục', 'Ghi chú'];
            const rows = allTx.map((t, i) => [i + 1, t.id, t.date, t.type, `"${(t.content || '').replace(/"/g, '""')}"`, t.amount, `"${(t.category || '').replace(/"/g, '""')}"`, `"${(t.note || '').replace(/"/g, '""')}"`]);
            const csv = '\uFEFF' + header.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `sao_luu_toan_bo_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`Đã sao lưu ${allTx.length} giao dịch!`, 'success');
        } catch (e) { showToast(e.message || 'Lỗi khi sao lưu', 'error'); }
        finally { showButtonLoading('backupTelegramBtn', false); }
    };

    // Xóa toàn bộ dữ liệu (nguy hiểm)
    const hardResetBtn = document.getElementById('hardResetBtn');
    if (hardResetBtn) hardResetBtn.onclick = function() {
        showCustomConfirm('⚠️ <b>CẢNH BÁO:</b> Thao tác này sẽ <b>xóa TOÀN BỘ</b> giao dịch của bạn và không thể hoàn tác. Tiếp tục?', async () => {
            triggerHaptic('heavy');
            showButtonLoading('hardResetBtn', true);
            try {
                await secureFetch(`/transactions/users/${chatId}.json`, 'DELETE');
                window.apiTxCache = {};
                cachedTransactions = [];
                showToast('Đã xóa toàn bộ dữ liệu!', 'success');
                await fetchTransactions();
                tab2NeedsReload = true;
            } catch (e) { showToast(e.message || 'Lỗi khi xóa dữ liệu', 'error'); }
            finally { showButtonLoading('hardResetBtn', false); }
        });
    };

    // --- TRÌNH TỰ BOOT ---
    (async function boot() {
        try {
            // Lấy thông tin kết nối Drive
            const res = await fetch(`${workerUrl}/api/get_user_info?chatId=${chatId}`);
            const info = await res.json();
            if (info && info.sheetId) {
                sheetId = info.sheetId;
            } else {
                showToast('Bạn chưa kết nối Drive! Quay lại chat gõ /ketnoi', 'error');
            }
        } catch (e) {
            showToast('Không lấy được thông tin người dùng', 'error');
        }

        // Nạp danh mục + từ khóa + icon (ngầm)
        await loadKeywords(true);
        await fetchCategories();

        // Nạp giao dịch Tab 1
        await fetchTransactions();

        // Mở tab mặc định
        const defaultTab = localStorage.getItem('settingDefaultTab') || 'tab1';
        if (defaultTab !== 'tab1') {
            const navItem = document.querySelector(`.nav-item[data-tab="${defaultTab}"]`);
            if (navItem) navItem.click();
        }
    })();
});
