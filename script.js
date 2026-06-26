// =====================================================================
// QUẢN LÝ CHI TIÊU - MINI APP (script.js)
// Bản đầy đủ tính năng (từ bản cá nhân) + GIỮ NGUYÊN lớp dữ liệu multi-user
// của repo: secureFetch qua Cloudflare Worker (tách theo từng user).
// Mọi thao tác đọc/ghi đều đi qua secureFetch (KHÔNG gọi Firebase trực tiếp,
// KHÔNG gọi GAS proxy). Tx writes mang theo _action để Worker đồng bộ Sheet/Bot.
// =====================================================================

// Báo cho Telegram biết App đã sẵn sàng để hiển thị ngay lập tức
if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
}

// Flag đánh dấu tab 2 cần reload khi có thay đổi giao dịch
let tab2NeedsReload = false;

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
// HÀM BẢO MẬT: GIAO TIẾP VỚI CLOUDFLARE WORKER (GIỮ NGUYÊN BẢN REPO)
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

// ---------------- HELPER GHI TỪ KHÓA / DANH MỤC QUA secureFetch ----------------
async function readKeywordsArray() {
    let data = await secureFetch(`/users/${chatId}/keywords.json`);
    if (data && !Array.isArray(data) && typeof data === 'object') data = Object.values(data).filter(i => i !== null);
    return Array.isArray(data) ? data : [];
}
async function upsertKeywordCategory(cat, icon, newKeywordsCsv) {
    cat = (cat || '').trim();
    if (!cat) return;
    let data = await readKeywordsArray();
    let entry = data.find(e => e && e.category && e.category.trim() === cat);
    if (!entry) { entry = { category: cat, keywords: '', icon: icon || '' }; data.push(entry); }
    if (icon) entry.icon = icon;
    if (newKeywordsCsv) {
        const existing = (entry.keywords || '').split(',').map(s => s.trim()).filter(Boolean);
        newKeywordsCsv.split(',').map(s => s.trim()).filter(Boolean).forEach(k => { if (!existing.includes(k)) existing.push(k); });
        entry.keywords = existing.join(', ');
    }
    await secureFetch(`/users/${chatId}/keywords.json`, 'PUT', data);
}
async function removeKeywordFromCategory(cat, keyword) {
    cat = (cat || '').trim();
    let data = await readKeywordsArray();
    const entry = data.find(e => e && e.category && e.category.trim() === cat);
    if (entry && entry.keywords) {
        const arr = entry.keywords.split(',').map(s => s.trim()).filter(Boolean).filter(k => k !== (keyword || '').trim());
        entry.keywords = arr.join(', ');
        await secureFetch(`/users/${chatId}/keywords.json`, 'PUT', data);
    }
}
async function removeKeywordCategory(cat) {
    cat = (cat || '').trim();
    let data = await readKeywordsArray();
    data = data.filter(e => !(e && e.category && e.category.trim() === cat));
    await secureFetch(`/users/${chatId}/keywords.json`, 'PUT', data);
}

// ---------------- TẠO ID AN TOÀN (GIỮ NGUYÊN BẢN REPO) ----------------
function generateSafeTransactionId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GD${ts}${rand}`;
}

// Quản lý trạng thái
let cachedTransactions = null, cachedChartData = null; 
let filterModeCache = { monthly: {}, yearly: {}, custom: {} };
let cachedSearchResults = [], cachedKeywords = []; 
window.categoryIconMap = {}; 
window.customCategoryIcons = {}; 
window.currentChartType = 'bar'; // Mặc định biểu đồ cột

let toastQueue = [], isShowingToast = false, currentEditKeyword = null;

const itemsPerPage = 10;
let currentPageTab1 = 1, currentPageCategory = 1, currentPageSearch = 1;
window.apiTxCache = {}; 
let currentFilterMode = 'weekly', activePeriodDate = new Date();
let savedScrollPositionTab2 = 0;

let isPrivacyActive = localStorage.getItem('settingPrivacyMode') === 'true';

// ---------------- BỘ TỪ ĐIỂN DỊCH EMOJI SANG ICON VECTOR (VÀ NGƯỢC LẠI) ----------------
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
for (let emoji in EMOJI_TO_FA_MAP) {
    FA_TO_EMOJI_MAP[EMOJI_TO_FA_MAP[emoji]] = emoji;
}

// ---------------- UTILITIES & LẮNG NGHE MẮT THẦN ----------------
function triggerHaptic(style = 'light') { 
    if (localStorage.getItem('settingHaptic') === 'false') return;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.impactOccurred(style); 
}
function triggerHapticNotification(type = 'success') { 
    if (localStorage.getItem('settingHaptic') === 'false') return;
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback) Telegram.WebApp.HapticFeedback.notificationOccurred(type); 
}

// Chạm vào mắt ngoài màn hình -> Chỉ đổi tạm thời cho phiên làm việc hiện tại
window.togglePrivacy = function() {
    triggerHaptic('light');
    isPrivacyActive = !isPrivacyActive;
    updatePrivacyUI(false); 
};

function updatePrivacyUI(syncSettings = false) {
    if (syncSettings) {
        const settingCheckbox = document.getElementById('settingPrivacyMode');
        if (settingCheckbox) settingCheckbox.checked = isPrivacyActive;
    }
    if (isPrivacyActive) {
        document.body.classList.add('privacy-on');
        document.querySelectorAll('.privacy-toggle-btn').forEach(btn => {
            btn.classList.remove('fa-eye');
            btn.classList.add('fa-eye-slash');
        });
    } else {
        document.body.classList.remove('privacy-on');
        document.querySelectorAll('.privacy-toggle-btn').forEach(btn => {
            btn.classList.remove('fa-eye-slash');
            btn.classList.add('fa-eye');
        });
    }
    if (window.mChart) window.mChart.update();
    if (window.pChart) window.pChart.update();
    if (window.dChart) window.dChart.update();
}

function applyPrivacyMode() {
    isPrivacyActive = localStorage.getItem('settingPrivacyMode') === 'true';
    updatePrivacyUI(true);
}

// HÀM ĐỊNH DẠNG TIỀN NÂNG CẤP: Chống lỗi 50Kđ
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

// Định dạng tiền đầy đủ (dùng cho xuất PDF)
function formatFullCurrency(value) {
    let num = parseInt(value.toString().replace(/[^0-9-]/g, '')) || 0;
    return num.toLocaleString('vi-VN') + 'đ';
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

window.showCustomConfirm = function(title, messageHtml, confirmText, onConfirm) {
    let overlay = document.getElementById('customConfirmOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'customConfirmOverlay';
        overlay.className = 'custom-confirm-overlay';
        document.body.appendChild(overlay);
    }
    const modal = document.createElement('div');
    modal.className = 'custom-confirm-modal';
    modal.innerHTML = `<div style="padding:24px 20px 20px; text-align:center;"><div class="custom-confirm-icon"><i class="fas fa-trash-alt"></i></div><h3 class="custom-confirm-title">${title}</h3><p class="custom-confirm-message">${messageHtml}</p></div><div class="custom-confirm-actions"><button id="customConfirmCancel" class="custom-confirm-cancel">Hủy</button><button id="customConfirmOk" class="custom-confirm-ok">${confirmText}</button></div>`;
    overlay.innerHTML = ''; overlay.appendChild(modal); overlay.style.display = 'flex';
    void overlay.offsetWidth; overlay.style.opacity = '1'; modal.style.transform = 'scale(1)'; modal.style.opacity = '1';
    const closeModal = () => { overlay.style.opacity = '0'; modal.style.transform = 'scale(0.9)'; modal.style.opacity = '0'; setTimeout(() => { overlay.style.display = 'none'; }, 200); };
    document.getElementById('customConfirmCancel').onclick = () => { triggerHaptic('light'); closeModal(); };
    document.getElementById('customConfirmOk').onclick = () => { triggerHaptic('medium'); closeModal(); onConfirm(); };
};

function showToast(message, type = "info") { toastQueue.push({ message, type }); if (!isShowingToast) processToastQueue(); }
function processToastQueue() {
  if (toastQueue.length === 0) { isShowingToast = false; return; }
  isShowingToast = true; const { message, type } = toastQueue.shift();
  const toast = document.createElement('div'); toast.className = `premium-toast toast-${type}`;
  let icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
  toast.innerHTML = `<i class="fas ${icon} toast-icon"></i><span class="toast-message">${escapeHTML(message)}</span><div class="toast-progress"></div>`;
  document.body.appendChild(toast); void toast.offsetWidth; toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => { toast.remove(); processToastQueue(); }, 400); }, 3000);
}

function showLoading(show, tabId) {
  const el = document.getElementById(`loading${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
  if (el) el.style.display = show ? 'block' : 'none';
}

function formatDate(dateStr) { const parts = dateStr.split('/'); if (parts.length !== 3) return dateStr; return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`; }
function formatDateToYYYYMMDD(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDateToDDMMYYYY(date) { return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth() + 1).padStart(2,'0')}/${date.getFullYear()}`; }
function parseNumber(value) { 
    let str = value.toString().toUpperCase(); let multiplier = 1;
    if (str.includes('K')) { multiplier = 1000; str = str.replace('K', ''); }
    return (parseInt(str.replace(/[^0-9-]/g, '')) || 0) * multiplier; 
}
function formatNumberWithCommas(value) {
    if (!value) return '';
    let val = value.toString().replace(/[^0-9]/g, '');
    if (!val) return '';
    return parseInt(val, 10).toLocaleString('vi-VN');
}
function getColorByIndex(i) { const c = ['#6366F1', '#F43F5E', '#10B981', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16', '#8B5CF6', '#F97316', '#14B8A6', '#EAB308', '#D946EF', '#22C55E', '#0EA5E9', '#A855F7', '#EF4444', '#64748B', '#059669', '#DC2626', '#4F46E5', '#C026D3']; return c[i % c.length]; }

function getRawFaIconName(catName) {
    if (!catName) return null;
    const categoryName = catName.trim(); let iconVal = null;
    if (window.customCategoryIcons && window.customCategoryIcons[categoryName]) { iconVal = window.customCategoryIcons[categoryName].trim(); } 
    else if (window.categoryIconMap && window.categoryIconMap[categoryName]) { iconVal = window.categoryIconMap[categoryName].trim(); }
    if (iconVal) {
        const firstChar = Array.from(iconVal)[0];
        if (EMOJI_TO_FA_MAP[firstChar]) return EMOJI_TO_FA_MAP[firstChar];
        if (EMOJI_TO_FA_MAP[iconVal]) return EMOJI_TO_FA_MAP[iconVal];
        if (!/[^\x00-\x7F]/.test(iconVal)) return iconVal;
    }
    const faMapFallback = { 'ăn uống': 'fa-utensils', 'bảo hiểm': 'fa-shield-halved', 'công nghệ': 'fa-laptop', 'công việc': 'fa-briefcase', 'giặt ủi': 'fa-shirt', 'sửa chữa': 'fa-screwdriver-wrench', 'đi lại': 'fa-car-side', 'giải trí': 'fa-clapperboard', 'giáo dục': 'fa-graduation-cap', 'gia đình': 'fa-house-user', 'hóa đơn': 'fa-file-invoice-dollar', 'chăm sóc': 'fa-spa', 'làm đẹp': 'fa-spa', 'mua sắm': 'fa-bag-shopping', 'quà tặng': 'fa-gift', 'sức khỏe': 'fa-dumbbell', 'tiết kiệm': 'fa-chart-line', 'đầu tư': 'fa-chart-line', 'y tế': 'fa-pills', 'nhà cửa': 'fa-house', 'xăng': 'fa-gas-pump', 'lương': 'fa-money-bill-wave', 'thưởng': 'fa-gift', 'khác': 'fa-layer-group' };
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
    let zeroObj = formatCurrencyWithUnit(0);
    if (prev === 0 && current === 0) return `<span style="color: var(--text-2); font-weight: 500;">− ${zeroObj.val}${zeroObj.unit} ${escapeHTML(text)}</span>`;
    let diff = current - prev;
    if (diff === 0) return `<span style="color: var(--text-2); font-weight: 500;">− Bằng ${escapeHTML(text)}</span>`;
    let isUp = diff > 0;
    let icon = isUp ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
    let arrowText = isUp ? (type === 'balance' ? 'Dư' : 'Tăng') : (type === 'balance' ? 'Âm' : 'Giảm');
    let colorVar = type === 'expense' ? (isUp ? 'var(--expense)' : 'var(--income)') : (isUp ? 'var(--income)' : 'var(--expense)');
    let diffObj = formatCurrencyWithUnit(Math.abs(diff));
    return `<span style="color: ${colorVar}; font-weight: 600;">${icon} ${arrowText} ${diffObj.val}${diffObj.unit} ${escapeHTML(text)}</span>`;
}

window.openTab = function(tabId) {
  triggerHaptic('light');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if(btn) btn.classList.add('active');
};

// Đọc dữ liệu tháng qua secureFetch (multi-user) + chuẩn hóa ngày DD/MM/YYYY
async function fetchMonthData(month) {
    try {
        const data = await secureFetch(`/transactions/users/${chatId}/month_${parseInt(month, 10)}.json`);
        if(data) {
            return Object.values(data).filter(item => item !== null).map(item => {
                if (item && item.date) {
                    const p = item.date.split('/');
                    if(p.length === 3) item.date = `${String(parseInt(p[0], 10)).padStart(2, '0')}/${String(parseInt(p[1], 10)).padStart(2, '0')}/${p[2]}`;
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
    const dNum = parseInt(d, 10); const mNum = parseInt(m, 10); const yNum = parseInt(y, 10);
    const pdNum = currDateObj.getDate(); const pmNum = currDateObj.getMonth() + 1; const pyNum = currDateObj.getFullYear();
    
    let dataCurrMonth, dataPrevMonth;
    if (mNum === pmNum) { dataCurrMonth = await fetchMonthData(mNum); dataPrevMonth = dataCurrMonth; } 
    else { [dataCurrMonth, dataPrevMonth] = await Promise.all([ fetchMonthData(mNum), fetchMonthData(pmNum) ]); }

    let dataCurr = dataCurrMonth.filter(t => { if(!t || !t.date) return false; const pts = t.date.split('/'); return parseInt(pts[0], 10) === dNum && parseInt(pts[1], 10) === mNum && parseInt(pts[2], 10) === yNum; });
    let dataPrev = dataPrevMonth.filter(t => { if(!t || !t.date) return false; const pts = t.date.split('/'); return parseInt(pts[0], 10) === pdNum && parseInt(pts[1], 10) === pmNum && parseInt(pts[2], 10) === pyNum; });
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
  const pBal = pInc - pExp;

  const tExpObj = formatCurrencyWithUnit(tExp);
  const heroExpMain = document.getElementById('heroExpenseMain');
  if(heroExpMain) heroExpMain.innerHTML = `${tExpObj.val}<span>${tExpObj.unit}</span>`;
  
  const tIncObj = formatCurrencyWithUnit(tInc);
  const heroInc = document.getElementById('heroIncome'); 
  if(heroInc) heroInc.innerHTML = `${tIncObj.val}<span>${tIncObj.unit}</span>`;
  
  const tBalObj = formatCurrencyWithUnit(Math.abs(tBal));
  const heroBalSub = document.getElementById('heroBalanceSub');
  if(heroBalSub) { 
      let sign = tBal > 0 ? '+' : (tBal < 0 ? '−' : ''); 
      heroBalSub.innerHTML = `<span>${sign}</span>${tBalObj.val}<span>${tBalObj.unit}</span>`; 
  }
  
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
      </div>
    `;
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

// ---------------- CÁC BÁO CÁO ----------------
function getWeekNumber(d) { 
    const startOfWeek = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); 
    const dayNum = d.getUTCDay() || 7;
    if (startOfWeek === 1) d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    else d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() + 1));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1)); 
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7); 
}

function formatWeekInput(date) { return `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}`; }

function getDateFromWeekString(weekStr) { 
    const startDay = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    if (!weekStr) return null;
    const [yearStr, weekPart] = weekStr.split('-W'); 
    if(!yearStr || !weekPart) return null; 
    const year = parseInt(yearStr); const week = parseInt(weekPart); 
    const simple = new Date(year, 0, 1 + (week - 1) * 7); 
    const dow = simple.getDay(); 
    const start = new Date(simple); 
    if (startDay === 1) {
        if (dow <= 4) start.setDate(simple.getDate() - simple.getDay() + 1);
        else start.setDate(simple.getDate() + 8 - simple.getDay());
    } else {
        start.setDate(simple.getDate() - simple.getDay());
    }
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
        monthsResults.forEach(res => { 
            res.data.forEach(t => { 
                if (!t || !t.date) return;
                const dParts = t.date.split('/'); 
                if(dParts.length !== 3) return;
                const txDate = new Date(res.y, parseInt(dParts[1], 10) - 1, parseInt(dParts[0], 10)); 
                if (txDate >= startDate && txDate <= endDate) txs.push(t); 
            }); 
        });
        window.apiTxCache[cacheKey] = txs; return txs;
    } catch (e) { return []; }
}

function renderCalendar(txs, dateObj, mode) {
    const grid = document.getElementById('calendarGrid');
    const box = document.getElementById('calendarStatbox');
    
    if (mode !== 'monthly' && mode !== 'weekly') { box.style.display = 'none'; return; }
    box.style.display = 'block'; grid.innerHTML = '';

    const dailyData = {};
    txs.forEach(t => {
        if (!t || !t.date) return;
        const parts = t.date.split('/');
        if (parts.length !== 3) return;
        const tDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10)-1, parseInt(parts[0], 10));
        const dayKey = formatDateToYYYYMMDD(tDate);
        if (!dailyData[dayKey]) dailyData[dayKey] = { inc: 0, exp: 0 };
        if (t.type === 'Thu nhập') dailyData[dayKey].inc += t.amount;
        else dailyData[dayKey].exp += t.amount;
    });

    const header = document.querySelector('.calendar-header');
    const startOfWeek = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    
    if (mode === 'weekly') {
        if (header) header.style.display = 'none';
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        grid.style.borderTop = '1px solid var(--border-color)';
        grid.style.borderRadius = '10px';
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        for (let i = 0; i < 7; i++) {
            const d = new Date(dateObj); d.setDate(d.getDate() + i);
            const dayKey = formatDateToYYYYMMDD(d);
            const data = dailyData[dayKey] || { inc: 0, exp: 0 };
            const bal = data.inc - data.exp;
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
            if (startOfWeek === 1) { header.innerHTML = `<span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>`; } 
            else { header.innerHTML = `<span>CN</span><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span>`; }
        }
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        grid.style.borderTop = 'none';
        grid.style.borderRadius = '0 0 10px 10px';

        const year = dateObj.getFullYear(); const month = dateObj.getMonth();
        let firstDay = new Date(year, month, 1).getDay();
        if (startOfWeek === 1) firstDay = firstDay === 0 ? 6 : firstDay - 1;
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) { grid.innerHTML += `<div class="calendar-day empty"></div>`; }

        const today = new Date(); const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i); const dayKey = formatDateToYYYYMMDD(d);
            const data = dailyData[dayKey] || { inc: 0, exp: 0 }; const bal = data.inc - data.exp;
            let balHTML = `<span class="calendar-balance neutral">0</span>`;
            if (data.inc > 0 || data.exp > 0) {
                const incObj2 = data.inc > 0 ? formatCurrencyWithUnit(data.inc) : null;
                const expObj2 = data.exp > 0 ? formatCurrencyWithUnit(data.exp) : null;
                let incStr2 = incObj2 ? `<span class="calendar-balance positive cal-row-amt">+${incObj2.val}${incObj2.unit}</span>` : '';
                let expStr2 = expObj2 ? `<span class="calendar-balance negative cal-row-amt">-${expObj2.val}${expObj2.unit}</span>` : '';
                balHTML = `<div class="cal-amt-col">${incStr2}${expStr2}</div>`;
            }

            let classes = ['calendar-day'];
            if (isCurrentMonth && today.getDate() === i) classes.push('today');

            const dayDiv = document.createElement('div'); dayDiv.className = classes.join(' ');
            dayDiv.innerHTML = `<span class="calendar-date">${i}</span>${balHTML}`;
            
            dayDiv.onclick = () => { triggerHaptic('light'); document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected-day')); dayDiv.classList.add('selected-day'); openDailyDetailView(i, month + 1, year, txs); };
            grid.appendChild(dayDiv);
        }
    }
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
    
    document.querySelector('#tab2 .chart-container').style.display = 'block';
    
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
            scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10, family: 'Plus Jakarta Sans' } } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: { size: 10, family: 'Plus Jakarta Sans' }, callback: v => {
                if (isPrivacyActive) return '***';
                const vObj = formatCurrencyWithUnit(v); return vObj.val + vObj.unit;
            } } } }, 
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => {
                if (isPrivacyActive) return `${ctx.dataset.label}: ***`;
                const cObj = formatCurrencyWithUnit(ctx.raw);
                return `${ctx.dataset.label}: ${cObj.val}${cObj.unit}`;
            } } } } 
        } 
    });

    const catMap = {}; currentTx.forEach(t => { if(t.type==='Chi tiêu') catMap[t.category] = (catMap[t.category]||0)+t.amount; });
    drawMonthlyPieChart(Object.keys(catMap).map(k => ({category: k, amount: catMap[k]})));
}

function drawMonthlyPieChart(data) {
  const ctx = document.getElementById('monthlyPieChart').getContext('2d');
  if(window.pChart) window.pChart.destroy();
  data.sort((a,b) => b.amount - a.amount);
  const amts = data.map(i=>i.amount); const lbls = data.map(i=>i.category); const bg = data.map((_,i)=>getColorByIndex(i));
  const total = amts.reduce((a,b)=>a+b,0);
  
  window.pChart = new Chart(ctx, { type: 'doughnut', data: { labels:lbls, datasets: [{data:amts, backgroundColor:bg, borderWidth: 0, hoverOffset: 4}] }, options: { devicePixelRatio: 4, cutout:'75%', layout: {padding: 8}, plugins: { legend: {display:false}, tooltip: { enabled: false } }, onClick: (event, activeEls) => { if (activeEls && activeEls.length > 0) { const activeIdx = activeEls[0].index; const catName = lbls[activeIdx]; showCategoryDetail(catName); } } }, plugins: [{ id:'cText', afterDraw(c) { const {ctx} = c; ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; const activeEls = c.getActiveElements(); if (activeEls && activeEls.length > 0) { const activeIdx = activeEls[0].index; const catName = c.data.labels[activeIdx]; const catAmt = c.data.datasets[0].data[activeIdx]; const color = c.data.datasets[0].backgroundColor[activeIdx]; const pct = total > 0 ? ((catAmt/total)*100).toFixed(1) : 0; let shortName = catName.length > 14 ? catName.substring(0, 14) + '...' : catName; ctx.fillStyle = '#94A3B8'; ctx.font = '600 9px Plus Jakarta Sans'; ctx.fillText(shortName, c.width/2, c.height/2 - 12); ctx.fillStyle = color; ctx.font = '800 12px Plus Jakarta Sans'; 
  const catObj = formatCurrencyWithUnit(catAmt);
  const displayAmt = isPrivacyActive ? '***' : catObj.val + catObj.unit;
  ctx.fillText(displayAmt, c.width/2, c.height/2 + 4); ctx.fillStyle = '#94A3B8'; ctx.font = '500 9px Plus Jakarta Sans'; ctx.fillText(`(${pct}%)`, c.width/2, c.height/2 + 16); } else { ctx.fillStyle='#94A3B8'; ctx.font='500 10px Plus Jakarta Sans'; ctx.fillText('Tổng chi', c.width/2, c.height/2 - 10); ctx.fillStyle='#F43F5E'; ctx.font='800 13px Plus Jakarta Sans'; 
  const totalObj = formatCurrencyWithUnit(total);
  const displayTotal = isPrivacyActive ? '***' : totalObj.val + totalObj.unit;
  ctx.fillText(displayTotal, c.width/2, c.height/2 + 8); } ctx.restore(); } }] });

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

  const chartContainer = document.getElementById('detailChartContainer');
  if(chartContainer) chartContainer.style.display = 'none';
  const pieContainer = document.getElementById('dailyPieChartContainer');
  if(pieContainer) pieContainer.style.display = 'none';

  const listTitle = document.getElementById('detailListTitle');
  if (listTitle) listTitle.innerHTML = `Giao dịch chi tiết <span style="font-size:0.75rem; color:var(--text-2); text-transform:none;">(Tổng: ${txs.length})</span>`;
  
  currentPageCategory = 1;
  displayDetailTransactionsList(txs);
}

function openDailyDetailView(d, m, y, allTxs) {
    const dNum = parseInt(d, 10); const mNum = parseInt(m, 10); const yNum = parseInt(y, 10);
    
    const dayTxs = allTxs.filter(t => { 
        if (!t || !t.date) return false; 
        const parts = t.date.split('/'); 
        if (parts.length !== 3) return false; 
        return parseInt(parts[0], 10) === dNum && parseInt(parts[1], 10) === mNum && parseInt(parts[2], 10) === yNum; 
    });

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

    const chartContainer = document.getElementById('detailChartContainer');
    if(chartContainer) chartContainer.style.display = 'none';

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
        plugins: [{ id:'cText2', afterDraw(c) { const {ctx} = c; ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#94A3B8'; ctx.font='500 9px Plus Jakarta Sans'; ctx.fillText('Tổng chi', c.width/2, c.height/2 - 8); ctx.fillStyle='#F43F5E'; ctx.font='800 11px Plus Jakarta Sans'; 
        const tObj = formatCurrencyWithUnit(totalExp);
        const displayTotal = isPrivacyActive ? '***' : tObj.val + tObj.unit;
        ctx.fillText(displayTotal, c.width/2, c.height/2 + 6); ctx.restore(); } }]
    });

    const leg = document.getElementById('dailyCustomLegend'); if(leg) leg.innerHTML = '';
    data.forEach((i, idx) => {
      const pct = totalExp>0 ? ((i.amount/totalExp)*100).toFixed(1) : 0; const c = bg[idx]; const catIconHTML = getCategoryIcon(i.category);
      const divLeg = document.createElement('div'); divLeg.className = 'legend-item'; 
      divLeg.innerHTML = `<div class="legend-item-left"><span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; flex-shrink:0; color:${c}; font-size:13px; margin-right: 8px;">${catIconHTML}</span><span class="legend-name" title="${escapeHTML(i.category)}">${escapeHTML(i.category)}</span></div><div class="legend-value-col"><span class="legend-pct" style="color:${c};">${pct}%</span></div>`; 
      leg.appendChild(divLeg); 
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
    card.innerHTML = `<div class="tx-icon-wrap ${tCls}">${icon}</div><div class="tx-body"><div class="tx-title">${escapeHTML(item.content)}</div><div class="tx-meta-row"><span class="tx-date">${escapeHTML(formatDate(item.date))}</span><span class="tx-badge tx-badge-neutral">${escapeHTML(item.type)}</span><span class="tx-badge ${tCls}">${escapeHTML(item.category)}</span></div>${item.note ? `<div class="tx-note"><i class="fas fa-tag tx-note-icon"></i>${escapeHTML(item.note)}</div>` : ''}<div class="tx-id-row"><span>STT: ${stt}</span> • <span>#${escapeHTML(item.id)}</span></div></div><div class="tx-right-col"><div class="tx-amount ${tCls}"><span>${item.type==='Thu nhập'?'+':'−'}</span>${amtObj.val}<span>${amtObj.unit}</span></div><div class="tx-actions"><button class="tx-btn edit-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-pen"></i></button><button class="tx-btn delete-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-trash"></i></button></div></div>`; list.appendChild(card); 
  });
  document.getElementById('pageInfoDetail').textContent = `${currentPageCategory} / ${tPages}`; document.getElementById('prevPageDetail').disabled = currentPageCategory === 1; document.getElementById('nextPageDetail').disabled = currentPageCategory === tPages; document.getElementById('prevPageDetail').onclick = () => { triggerHaptic('light'); if(currentPageCategory > 1) { currentPageCategory--; displayDetailTransactionsList(txs); } }; document.getElementById('nextPageDetail').onclick = () => { triggerHaptic('light'); if(currentPageCategory < tPages) { currentPageCategory++; displayDetailTransactionsList(txs); } };
  document.querySelectorAll('#detailTransactionsContainer .edit-btn').forEach(btn => btn.onclick = () => { closeDetailModal(); setTimeout(() => openEditForm(txs.find(i => String(i.id) === btn.getAttribute('data-id'))), 350); }); 
  document.querySelectorAll('#detailTransactionsContainer .delete-btn').forEach(btn => btn.onclick = () => { closeDetailModal(); setTimeout(() => deleteTransaction(btn.getAttribute('data-id')), 350); });
}

window.closeDetailModal = function() {
    triggerHaptic('light'); document.getElementById('detailModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

async function loadWeeklyReport(weekStr) { showLoading(true, 'tab2'); document.querySelector('#tab2 .chart-container').style.display='none'; document.getElementById('placeholderTab2').style.display='none'; try { const startDate = getDateFromWeekString(weekStr); if (!startDate) throw new Error("Dữ liệu tuần không hợp lệ"); const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 6); const prevStartDate = new Date(startDate); prevStartDate.setDate(prevStartDate.getDate() - 7); const prevEndDate = new Date(endDate); prevEndDate.setDate(prevEndDate.getDate() - 7); const [currentTx, prevTx] = await Promise.all([ getTransactionsInRange(startDate, endDate), getTransactionsInRange(prevStartDate, prevEndDate) ]); document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (${formatDateToDDMMYYYY(startDate).substring(0,5)} - ${formatDateToDDMMYYYY(endDate).substring(0,5)})`; const dayNames = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7']; const labels = [], incs = [], exps = []; for(let i=0; i<7; i++) { const d = new Date(startDate); d.setDate(d.getDate() + i); labels.push(`${dayNames[d.getDay()]}\nNgày ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`); const dateStr = formatDateToDDMMYYYY(d); const dayTx = currentTx.filter(t => t.date === dateStr); let inc = 0, exp = 0; dayTx.forEach(t => { if(t.type==='Thu nhập') inc+=t.amount; else exp+=t.amount; }); incs.push(inc); exps.push(exp); } renderCalendar(currentTx, startDate, 'weekly'); processReportData(currentTx, prevTx, labels, incs, exps); cachedChartData = { mode: 'weekly', txs: currentTx, periodStr: weekStr }; } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab2'); } }
async function loadMonthlyReport(monthStr) { showLoading(true, 'tab2'); document.querySelector('#tab2 .chart-container').style.display='none'; document.getElementById('placeholderTab2').style.display='none'; try { const [year, month] = monthStr.split('-').map(Number); const startDate = new Date(year, month - 1, 1); const endDate = new Date(year, month, 0); let prevM = month - 1; let prevY = year; if(prevM === 0) { prevM = 12; prevY = year - 1; } const prevStartDate = new Date(prevY, prevM - 1, 1); const prevEndDate = new Date(prevY, prevM, 0); const [currentTx, prevTx] = await Promise.all([ getTransactionsInRange(startDate, endDate), getTransactionsInRange(prevStartDate, prevEndDate) ]); document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (Tháng ${month}/${year})`; const labels = [`Tháng ${month}`], incs = [0], exps = [0]; currentTx.forEach(t => { if(t.type==='Thu nhập') incs[0]+=t.amount; else exps[0]+=t.amount; }); renderCalendar(currentTx, startDate, 'monthly'); processReportData(currentTx, prevTx, labels, incs, exps); cachedChartData = { mode: 'monthly', txs: currentTx, periodStr: monthStr }; } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab2'); } }
async function loadCustomReport(startMonth, endMonth, year) { showLoading(true, 'tab2'); document.querySelector('#tab2 .chart-container').style.display='none'; document.getElementById('placeholderTab2').style.display='none'; try { const startDate = new Date(year, startMonth - 1, 1); const endDate = new Date(year, endMonth, 0); const prevStartDate = new Date(year - 1, startMonth - 1, 1); const prevEndDate = new Date(year - 1, endMonth, 0); const [currentTx, prevTx] = await Promise.all([ getTransactionsInRange(startDate, endDate), getTransactionsInRange(prevStartDate, prevEndDate) ]); document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (T${startMonth} - T${endMonth} / ${year})`; const labels = [], incs = [], exps = []; for(let m=startMonth; m<=endMonth; m++) { labels.push(`Tháng ${m}`); const mTx = currentTx.filter(t => parseInt(t.date.split('/')[1]) === m && parseInt(t.date.split('/')[2]) === year); let inc=0, exp=0; mTx.forEach(t => { if(t.type==='Thu nhập') inc+=t.amount; else exp+=t.amount; }); incs.push(inc); exps.push(exp); } const calBox = document.getElementById('calendarStatbox'); if (calBox) calBox.style.display = 'none'; processReportData(currentTx, prevTx, labels, incs, exps); cachedChartData = { mode: 'custom', txs: currentTx, periodStr: `${startMonth}-${endMonth}-${year}` }; } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab2'); } }

function updateTimeNavUI() {
   const label = document.getElementById('currentPeriodLabel'); const weekP = document.getElementById('weekPicker'); const monthP = document.getElementById('monthPicker'); const timeNav = document.getElementById('timeNavContainer'); const customNav = document.getElementById('customFilterContainer');
   if (currentFilterMode === 'weekly') { timeNav.style.display = 'flex'; customNav.style.display = 'none'; weekP.style.display = 'block'; monthP.style.display = 'none'; const wStr = formatWeekInput(activePeriodDate); weekP.value = wStr; label.textContent = `Tuần ${getWeekNumber(activePeriodDate)}, ${activePeriodDate.getFullYear()}`; loadWeeklyReport(wStr); } 
   else if (currentFilterMode === 'monthly') { timeNav.style.display = 'flex'; customNav.style.display = 'none'; weekP.style.display = 'none'; monthP.style.display = 'block'; const mStr = `${activePeriodDate.getFullYear()}-${String(activePeriodDate.getMonth()+1).padStart(2,'0')}`; monthP.value = mStr; label.textContent = `Tháng ${activePeriodDate.getMonth()+1}/${activePeriodDate.getFullYear()}`; loadMonthlyReport(mStr); } 
   else if (currentFilterMode === 'yearly') { timeNav.style.display = 'none'; customNav.style.display = 'none'; loadCustomReport(1, 12, new Date().getFullYear()); } 
   else if (currentFilterMode === 'custom') { timeNav.style.display = 'none'; customNav.style.display = 'flex'; const curM = new Date().getMonth() + 1; document.getElementById('startMonth').value = '1'; document.getElementById('endMonth').value = curM.toString(); }
}

// ---------------- TÌM KIẾM MODAL ----------------
window.openSearchModal = function() { triggerHaptic('light'); document.getElementById('modalOverlay').classList.add('show'); setTimeout(() => document.getElementById('searchModal').classList.add('show'), 10); };
window.closeSearchModal = function() { triggerHaptic('light'); document.getElementById('searchModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300); };

function displaySearchResults() {
    const list = document.getElementById('searchResultsContainer'); list.innerHTML=''; const data = cachedSearchResults;
    if(!data || data.length === 0) { document.getElementById('placeholderSearch').style.display = 'block'; document.getElementById('paginationSearch').style.display = 'none'; return; }
    document.getElementById('placeholderSearch').style.display = 'none'; document.getElementById('paginationSearch').style.display = 'flex';
    const tPages = Math.ceil(data.length / itemsPerPage); const pData = data.slice((currentPageSearch - 1) * itemsPerPage, currentPageSearch * itemsPerPage);
    pData.forEach((item, index) => { 
        const tCls = item.type==='Thu nhập'?'income':'expense'; const icon = getCategoryIcon(item.category); const stt = (currentPageSearch - 1) * itemsPerPage + index + 1; 
        const amtObj = formatCurrencyWithUnit(item.amount);
        const card = document.createElement('div'); card.className = `tx-card ${tCls}`; 
        card.innerHTML = `<div class="tx-icon-wrap ${tCls}">${icon}</div><div class="tx-body"><div class="tx-title">${escapeHTML(item.content)}</div><div class="tx-meta-row"><span class="tx-date">${escapeHTML(formatDate(item.date))}</span><span class="tx-badge tx-badge-neutral">${escapeHTML(item.type)}</span><span class="tx-badge ${tCls}">${escapeHTML(item.category)}</span></div>${item.note ? `<div class="tx-note"><i class="fas fa-tag tx-note-icon"></i>${escapeHTML(item.note)}</div>` : ''}<div class="tx-id-row"><span>STT: ${stt}</span> • <span>#${escapeHTML(item.id)}</span></div></div><div class="tx-right-col"><div class="tx-amount ${tCls}"><span>${item.type==='Thu nhập'?'+':'−'}</span>${amtObj.val}<span>${amtObj.unit}</span></div><div class="tx-actions"><button class="tx-btn edit-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-pen"></i></button><button class="tx-btn delete-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-trash"></i></button></div></div>`; list.appendChild(card); 
    });
    document.getElementById('pageInfoSearch').textContent = `${currentPageSearch} / ${tPages}`; document.getElementById('prevPageSearch').disabled = currentPageSearch === 1; document.getElementById('nextPageSearch').disabled = currentPageSearch === tPages; document.getElementById('prevPageSearch').onclick = () => { triggerHaptic('light'); if(currentPageSearch > 1) { currentPageSearch--; displaySearchResults(); } }; document.getElementById('nextPageSearch').onclick = () => { triggerHaptic('light'); if(currentPageSearch < tPages) { currentPageSearch++; displaySearchResults(); } };
    document.querySelectorAll('#searchResultsContainer .edit-btn').forEach(btn => btn.onclick = () => { closeSearchModal(); setTimeout(() => openEditForm(data.find(i => String(i.id) === btn.getAttribute('data-id'))), 350); }); 
    document.querySelectorAll('#searchResultsContainer .delete-btn').forEach(btn => btn.onclick = () => { closeSearchModal(); setTimeout(() => deleteTransaction(btn.getAttribute('data-id')), 350); });
}

// ---------------- TAB TỪ KHÓA ----------------
window.loadKeywords = async function(isInit = false) {
    if(!isInit) showLoading(true, 'tab3');
    if(!isInit) document.getElementById('keywordsContainer').innerHTML = '';
    try {
        const iconData = await secureFetch(`/users/${chatId}/categoryIcons.json`); if(iconData) window.customCategoryIcons = iconData;
        let data = await secureFetch(`/users/${chatId}/keywords.json`);
        
        // Cứu cánh cho dữ liệu Firebase: Chuyển Object thành Array
        if (data && !Array.isArray(data) && typeof data === 'object') {
            data = Object.values(data).filter(item => item !== null);
        }
        
        cachedKeywords = data || []; window.categoryIconMap = {}; cachedKeywords.forEach(kw => { if (kw && kw.category && kw.icon) window.categoryIconMap[kw.category.trim()] = kw.icon.trim(); });
        if(!isInit) displayKeywords();
    } catch(e) { if(!isInit) showToast(e.message, 'error'); } finally { if(!isInit) showLoading(false, 'tab3'); }
};

window.startEditKeyword = function(kw, category) { 
    triggerHaptic('light'); document.getElementById('keywordInput').value = kw; document.getElementById('keywordCategory').value = category; currentEditKeyword = kw; 
    const btnAdd = document.getElementById('addKeywordBtn'); btnAdd.innerHTML = '<i class="fas fa-save"></i> Lưu sửa'; btnAdd.classList.add('btn-edit-kw'); 
    document.getElementById('cancelKeywordBtn').style.display = 'flex'; document.getElementById('deleteEditKeywordBtn').style.display = 'flex'; document.getElementById('fetchKeywordsBtn').style.display = 'none';
};

window.cancelEditKeyword = function() { 
    triggerHaptic('light'); document.getElementById('keywordInput').value = ''; currentEditKeyword = null; 
    const btnAdd = document.getElementById('addKeywordBtn'); btnAdd.innerHTML = '<i class="fas fa-plus"></i> Thêm'; btnAdd.classList.remove('btn-edit-kw'); 
    document.getElementById('cancelKeywordBtn').style.display = 'none'; document.getElementById('deleteEditKeywordBtn').style.display = 'none'; document.getElementById('fetchKeywordsBtn').style.display = 'flex';
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

// ---------------- MODALS & CRUD ----------------
async function fetchCategories() { 
    try { 
        let data = await secureFetch(`/users/${chatId}/keywords.json`);
        if (data && !Array.isArray(data) && typeof data === 'object') data = Object.values(data).filter(i => i !== null);
        const set = new Set();
        (Array.isArray(data) ? data : []).forEach(item => { if (item && item.category) set.add(item.category.trim()); });
        try { const icons = await secureFetch(`/users/${chatId}/categoryIcons.json`); if (icons && typeof icons === 'object') Object.keys(icons).forEach(c => set.add(c.trim())); } catch(e) {}
        let cats = [...set];
        cats.sort((a, b) => { if (a.toLowerCase() === 'khác') return 1; if (b.toLowerCase() === 'khác') return -1; return a.localeCompare(b, 'vi'); });
        return cats; 
    } catch(e) { return []; } 
}

window.initCategories = async function(preserveValues = false) {
    try {
      const cats = await fetchCategories();
      const sCat = document.getElementById('searchCategory'), kCat = document.getElementById('keywordCategory'), addCat = document.getElementById('addCategory'), editCat = document.getElementById('editCategory');
      const sVal = sCat?.value, kVal = kCat?.value, addVal = addCat?.value, editVal = editCat?.value;

      if(sCat) { sCat.innerHTML = '<option value="">Tất cả danh mục</option>'; cats.forEach(c => sCat.appendChild(new Option(c, c))); if(preserveValues && sVal) sCat.value = sVal; }
      if(kCat) { kCat.innerHTML = '<option value="">Chọn phân loại</option>'; cats.forEach(c => kCat.appendChild(new Option(c, c))); if(preserveValues && kVal) { kCat.value = kVal; } else if (preserveValues && document.getElementById('iconPickerCategory').value) { const newVal = document.getElementById('iconPickerCategory').value.trim(); if (cats.includes(newVal)) kCat.value = newVal; } }
      if(addCat) { addCat.innerHTML = ''; cats.forEach(c => addCat.appendChild(new Option(c, c))); if(preserveValues && addVal) addCat.value = addVal; }
      if(editCat) { editCat.innerHTML = ''; cats.forEach(c => editCat.appendChild(new Option(c, c))); if(preserveValues && editVal) editCat.value = editVal; }
      
      if (kCat && !document.getElementById('openIconPickerBtn')) {
          const btn = document.createElement('button'); 
          btn.id = 'openIconPickerBtn'; 
          btn.type = 'button'; 
          btn.innerHTML = '<i class="fas fa-cog"></i>'; 
          btn.className = 'btn-icon-picker';
          btn.onclick = window.openIconPickerModal;
          
          const parent = kCat.parentElement; 
          const wrapper = document.createElement('div'); 
          wrapper.className = 'input-with-btn-wrapper';
          
          parent.insertBefore(wrapper, kCat); 
          wrapper.appendChild(kCat); 
          wrapper.appendChild(btn); 
          kCat.classList.add('flex-1');
      }
    } catch(e) {}
}

window.selectType = function(formId, type, el) { triggerHaptic('light'); document.getElementById(formId + 'Type').value = type; const pills = el.parentElement.querySelectorAll('.type-pill'); pills.forEach(p => p.classList.remove('income-active', 'expense-active')); if(type === 'Chi tiêu') el.classList.add('expense-active'); else el.classList.add('income-active'); };
window.openAddForm = async function() { triggerHaptic('light'); document.getElementById('modalOverlay').classList.add('show'); setTimeout(() => document.getElementById('addModal').classList.add('show'), 10); document.querySelectorAll('#addModal .type-pill').forEach(p => { if(p.textContent.includes('Thu nhập')) p.innerHTML = '<i class="fas fa-hand-holding-dollar" style="margin-right: 5px;"></i>Thu nhập'; else if(p.textContent.includes('Chi tiêu')) p.innerHTML = '<i class="fas fa-money-bill-transfer" style="margin-right: 5px;"></i>Chi tiêu'; }); document.getElementById('addDate').value = formatDateToYYYYMMDD(new Date()); document.getElementById('addContent').value = ''; document.getElementById('addAmount').value = ''; document.getElementById('addNote').value = ''; document.querySelectorAll('#addModal .type-pill').forEach(p => { if(p.textContent.includes('Chi tiêu')) p.click(); }); const catSel = document.getElementById('addCategory'); catSel.innerHTML = ''; const cats = await fetchCategories(); cats.forEach(c => catSel.appendChild(new Option(c, c))); };
window.closeAddForm = function() { document.getElementById('addModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300); };
window.openEditForm = async function(tx) { if(!tx) return; triggerHaptic('light'); document.getElementById('modalOverlay').classList.add('show'); setTimeout(() => document.getElementById('editModal').classList.add('show'), 10); const pills = document.querySelectorAll('#editModal .type-pill'); pills.forEach(p => { if(p.textContent.includes('Thu nhập')) p.innerHTML = '<i class="fas fa-hand-holding-dollar" style="margin-right: 5px;"></i>Thu nhập'; else if(p.textContent.includes('Chi tiêu')) p.innerHTML = '<i class="fas fa-money-bill-transfer" style="margin-right: 5px;"></i>Chi tiêu'; }); document.getElementById('editTransactionId').value = tx.id; document.getElementById('editContent').value = tx.content; document.getElementById('editAmount').value = formatNumberWithCommas(tx.amount.toString()); document.getElementById('editNote').value = tx.note || ''; const [d,m,y] = tx.date.split('/'); document.getElementById('editDate').value = `${y}-${m}-${d}`; pills.forEach(p => { if(tx.type === 'Thu nhập' && p.textContent.includes('Thu nhập')) p.click(); if(tx.type === 'Chi tiêu' && p.textContent.includes('Chi tiêu')) p.click(); }); const catSel = document.getElementById('editCategory'); catSel.innerHTML = ''; const cats = await fetchCategories(); cats.forEach(c => { const opt = new Option(c, c); if(c === tx.category) opt.selected = true; catSel.appendChild(opt); }); };
window.closeEditForm = function() { document.getElementById('editModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300); };
window.closeAllModals = function() { closeAddForm(); closeEditForm(); closeSearchModal(); closeDetailModal(); if (document.getElementById('iconPickerModal')) document.getElementById('iconPickerModal').classList.remove('show'); if (document.getElementById('pdfPreviewModal')) document.getElementById('pdfPreviewModal').classList.remove('show'); };
window.closeConfirmDeleteModal = function() { const m = document.getElementById('confirmDeleteModal'); if (m) m.classList.remove('show'); };

async function submitTx(tx) {
  try {
    showToast("Đang lưu giao dịch...", "info");
    if (tx.action === 'addTransaction') { tx.id = generateSafeTransactionId(); }
    const month = parseInt(tx.date.split('/')[1], 10); const fbTx = { id: tx.id, date: tx.date, type: tx.type, content: tx.content, amount: tx.amount, category: tx.category, note: tx.note };
    if (tx.action === 'addTransaction') { if (cachedTransactions?.data) cachedTransactions.data.unshift(fbTx); } else { [cachedTransactions?.data, cachedChartData?.txs, cachedSearchResults].forEach(arr => { if (!arr) return; const idx = arr.findIndex(i => String(i.id) === String(tx.id)); if (idx !== -1) arr[idx] = { ...arr[idx], ...fbTx }; }); }
    if(document.getElementById('tab1').classList.contains('active')) displayTransactions(); else if(document.getElementById('tab2').classList.contains('active')) updateTimeNavUI(); else if(document.getElementById('tab3').classList.contains('active')) displaySearchResults();
    await secureFetch(`/transactions/users/${chatId}/month_${month}/${tx.id}.json`, 'PUT', { ...fbTx, _action: tx.action }); triggerHapticNotification('success'); showToast("Đã lưu giao dịch!", "success"); tab2NeedsReload = true; window.apiTxCache = {};
  } catch(e) { showToast(e.message, "error"); }
}

window.deleteTransaction = function(id) {
  closeEditForm(); triggerHaptic('medium'); 
  
  showCustomConfirm(
      'Xóa giao dịch',
      `Bạn có chắc chắn muốn xóa giao dịch <strong>#${escapeHTML(id)}</strong> này không?`,
      'Xóa',
      async () => {
          let tx = null; if (cachedTransactions?.data) tx = cachedTransactions.data.find(i => String(i.id) === String(id)); if (!tx && cachedSearchResults) tx = cachedSearchResults.find(i => String(i.id) === String(id)); if (!tx && cachedChartData?.txs) tx = cachedChartData.txs.find(i => String(i.id) === String(id)); const monthToUpdate = tx ? parseInt(tx.date.split('/')[1], 10) : 1;
          [cachedTransactions?.data, cachedChartData?.txs, cachedSearchResults].forEach(arr => { if (!arr) return; const idx = arr.findIndex(i => String(i.id) === String(id)); if (idx !== -1) arr.splice(idx, 1); });
          if(document.getElementById('tab1').classList.contains('active')) displayTransactions(); else if(document.getElementById('tab2').classList.contains('active')) updateTimeNavUI(); else if(document.getElementById('tab3').classList.contains('active')) displaySearchResults(); 
          showToast("Đang xóa giao dịch...", "info");
          try { 
              await secureFetch(`/transactions/users/${chatId}/month_${monthToUpdate}/${id}.json`, 'DELETE'); triggerHapticNotification('success'); showToast("Đã xóa giao dịch!", "success"); tab2NeedsReload = true; window.apiTxCache = {};
          } catch(e) { showToast(e.message, "error"); }
      }
  );
};

// ==========================================
// XUẤT BÁO CÁO PDF (BẢN FIX CHUẨN: TẮT OVERFLOW ĐỂ CHỐNG CẮT XÉN + CHỐNG RỚT DÒNG)
// ==========================================
window.exportToPDF = function() {
    if (isPrivacyActive) {
        return showToast("Số tiền đang bị ẩn! Vui lòng bấm vào biểu tượng con mắt để hiển thị số dư trước khi xuất báo cáo PDF.", "warning");
    }

    const isTab2 = document.getElementById('tab2').classList.contains('active');
    const data = isTab2 ? (cachedChartData?.txs || []) : (cachedTransactions?.data || []);
    
    if (data.length === 0) {
        return showToast("Không có dữ liệu giao dịch để tạo file PDF!", "warning");
    }
    if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
        return showToast("Thư viện xuất PDF chưa sẵn sàng, vui lòng thử lại sau!", "error");
    }
    
    triggerHaptic('medium');
    showToast("Đang chuẩn bị bản xem trước...", "info");

    let reportTitle = isTab2 ? document.getElementById('chartTitleTab2')?.textContent : "GIAO DỊCH TRONG NGÀY";
    if (!reportTitle) reportTitle = "BÁO CÁO TÀI CHÍNH";
    const reportNameForFile = isTab2 ? (cachedChartData?.periodStr || "Bao_Cao") : formatDateToYYYYMMDD(new Date());

    const element = document.createElement('div');
    
    element.style.width = '720px';
    element.style.minWidth = '720px'; 
    element.style.maxWidth = '720px'; 
    element.style.boxSizing = 'border-box'; 
    element.style.padding = '10px 15px';
    element.style.color = '#0F172A';
    element.style.backgroundColor = '#FFFFFF';
    element.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
    element.style.overflow = 'visible'; 
    
    let tablesHTML = '';
    let totalIncome = 0, totalExpense = 0;
    
    const catMapForColor = {};
    data.forEach(t => { if(t.type === 'Chi tiêu') catMapForColor[t.category] = (catMapForColor[t.category]||0) + t.amount; });
    const catArrForColor = Object.keys(catMapForColor).map(k => ({category: k, amount: catMapForColor[k]})).sort((a,b) => b.amount - a.amount);
    
    const categoryColorMap = {};
    catArrForColor.forEach((c, idx) => { categoryColorMap[c.category] = getColorByIndex(idx); });

    const groupedData = {};
    data.forEach(t => {
        const parts = t.date.split('/');
        const monthYear = parts.length === 3 ? `${parts[1]}/${parts[2]}` : 'Khác';
        if (!groupedData[monthYear]) groupedData[monthYear] = [];
        groupedData[monthYear].push(t);
    });

    const sortedKeys = Object.keys(groupedData).sort((a, b) => {
        if (a === 'Khác') return 1; if (b === 'Khác') return -1;
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        if (yA !== yB) return yA - yB;
        return mA - mB;
    });

    const showMonthHeader = isTab2 && sortedKeys.length >= 1;
    const hasIncome = data.some(t => t.type === 'Thu nhập');
    const hasExpense = data.some(t => t.type === 'Chi tiêu');

    let globalSTT = 0;

    sortedKeys.forEach(key => {
        let monthRows = '';
        let monthInc = 0, monthExp = 0;
        
        groupedData[key].forEach((t) => {
            globalSTT++;
            const isInc = t.type === 'Thu nhập';
            if (isInc) { totalIncome += t.amount; monthInc += t.amount; }
            else { totalExpense += t.amount; monthExp += t.amount; }
            
            const catColor = categoryColorMap[t.category] || (isInc ? '#10B981' : '#64748B');
            const catIconHTML = getCategoryIcon(t.category);
            
            let tdAmountHTML = '';
            
            if (hasIncome && hasExpense) {
                tdAmountHTML = `
                    <td style="padding: 12px 6px; font-size: 11px; font-weight: 800; color: #00D26A; text-align: right; white-space: nowrap;">${isInc ? '+' + t.amount.toLocaleString('vi-VN') + 'đ' : ''}</td>
                    <td style="padding: 12px 14px 12px 6px; font-size: 11px; font-weight: 800; color: #FF4444; text-align: right; white-space: nowrap;">${!isInc ? '-' + t.amount.toLocaleString('vi-VN') + 'đ' : ''}</td>
                `;
            } else {
                tdAmountHTML = `<td style="padding: 12px 14px 12px 6px; font-size: 11px; font-weight: 800; color: ${isInc ? '#00D26A' : '#FF4444'}; text-align: right; white-space: nowrap;">
                    ${isInc ? '+' : '-'}${t.amount.toLocaleString('vi-VN')}đ
                </td>`;
            }

            monthRows += `
                <tr style="border-bottom: 1px solid #E2E8F0; page-break-inside: avoid;">
                    <td style="padding: 12px 6px; font-size: 11px; text-align: center; font-weight: 700;">${globalSTT}</td>
                    <td style="padding: 12px 6px; font-size: 11px; text-align: center; color: #475569; font-weight: 700;">${t.id || '---'}</td>
                    <td style="padding: 12px 10px; font-size: 11px; font-weight: 700; text-align: left;">${t.content}</td>
                    <td style="padding: 12px 10px; font-size: 11px; color: ${catColor}; font-weight: 700; text-align: left;">
                        <span style="display:inline-block; width:16px; text-align:center; margin-right:4px; font-size:12px;">${catIconHTML}</span>${t.category}
                    </td>
                    <td style="padding: 12px 6px; font-size: 11px; color: #94A3B8; text-align: center;">${t.date.substring(0,5)}</td>
                    ${tdAmountHTML}
                </tr>
            `;
        });

        let thAmountHTML = '';
        if (hasIncome && hasExpense) {
            thAmountHTML = `
                <th style="padding: 12px 6px; width: 14%; text-align: right;">Thu nhập</th>
                <th style="padding: 12px 14px 12px 6px; width: 14%; text-align: right; border-top-right-radius: 6px; border-bottom-right-radius: 6px;">Chi tiêu</th>
            `;
        } else {
            const singleColLabel = hasIncome ? 'Thu nhập' : 'Chi tiêu';
            thAmountHTML = `<th style="padding: 12px 14px 12px 6px; width: 28%; text-align: right; border-top-right-radius: 6px; border-bottom-right-radius: 6px;">${singleColLabel}</th>`;
        }

        const theadHTML = `
            <thead>
                <tr style="background: #0891B2; color: #FFFFFF;">
                    <th style="padding: 12px 6px; width: 6%; text-align: center; border-top-left-radius: 6px; border-bottom-left-radius: 6px;">STT</th>
                    <th style="padding: 12px 6px; width: 12%; text-align: center;">Mã GD</th>
                    <th style="padding: 12px 10px; width: 26%; text-align: left;">Nội dung</th>
                    <th style="padding: 12px 10px; width: 18%; text-align: left;">Danh mục</th>
                    <th style="padding: 12px 6px; width: 10%; text-align: center;">Ngày</th>
                    ${thAmountHTML}
                </tr>
            </thead>
        `;

        if (showMonthHeader) {
            tablesHTML += `
                <div style="margin-bottom: 24px; page-break-inside: auto; width: 100%; box-sizing: border-box;">
                    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 8px 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; page-break-inside: avoid; width: 100%; box-sizing: border-box;">
                        <span style="font-weight: 800; color: #0F172A; font-size: 12px; text-transform: uppercase;">Tháng ${key}</span>
                        <span style="font-size: 11px; color: #64748B; font-weight: 600;">
                            THU NHẬP: <span style="color: #00D26A; font-weight: 800;">+${monthInc.toLocaleString('vi-VN')}đ</span> 
                            <span style="margin: 0 6px; color: #CBD5E1;">|</span> 
                            CHI TIÊU: <span style="color: #FF4444; font-weight: 800;">-${monthExp.toLocaleString('vi-VN')}đ</span>
                        </span>
                    </div>
                    <table class="pdf-table">
                        ${theadHTML}
                        <tbody>
                            ${monthRows}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            tablesHTML += `
                <table class="pdf-table" style="margin-top: 10px;">
                    ${theadHTML}
                    <tbody>
                        ${monthRows}
                    </tbody>
                </table>
            `;
        }
    });

    let chartsHTML = '';
    if (isTab2 && window.mChart && window.pChart) {
        const barChartImg = window.mChart.toBase64Image();
        const pieChartImg = window.pChart.toBase64Image();
        
        const catMap = {};
        data.forEach(t => { if(t.type === 'Chi tiêu') catMap[t.category] = (catMap[t.category]||0) + t.amount; });
        const catArr = Object.keys(catMap).map(k => ({category: k, amount: catMap[k]})).sort((a,b) => b.amount - a.amount);
        
        let pieLegendHTML = '';
        catArr.forEach((c, idx) => {
            const pct = totalExpense > 0 ? ((c.amount/totalExpense)*100).toFixed(1) : 0;
            const color = getColorByIndex(idx);
            const catIconHTML = getCategoryIcon(c.category);
            
            pieLegendHTML += `
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; align-items: center; width: 100%;">
                    <span style="color: #475569; display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%;">
                        <span style="display:inline-block; width:16px; text-align:center; flex-shrink:0; color:${color}; font-size