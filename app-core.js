// =====================================================================
// QUẢN LÝ CHI TIÊU - MINI APP
// PHẦN 1/5: CORE (header, secureFetch multi-user, helpers, utils, fetchMonthData)
// Bản đầy đủ tính năng (từ bản cá nhân) + GIỮ NGUYÊN lớp dữ liệu multi-user
// của repo: secureFetch qua Cloudflare Worker (tách theo từng user).
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

// HÀM ĐỊNH DẠNG TIỀN: chuẩn quốc tế (K = nghìn, M = triệu, B = tỷ), giữ chế độ đầy đủ
function formatCurrencyWithUnit(value) {
    const format = localStorage.getItem('settingCurrencyFormat') || 'full';
    let num = parseInt(value.toString().replace(/[^0-9-]/g, '')) || 0;
    
    if (format === 'short' && Math.abs(num) >= 1000) {
        const sign = num < 0 ? '-' : '';
        const absNum = Math.abs(num);
        // Giữ tối đa 2 chữ số thập phân (không làm tròn về số nguyên), dùng dấu chấm thập phân chuẩn quốc tế
        const fmt = (n) => (Math.round(n * 100) / 100).toString();
        let val;
        if (absNum >= 1000000000) val = fmt(absNum / 1000000000) + 'B';
        else if (absNum >= 1000000) val = fmt(absNum / 1000000) + 'M';
        else val = fmt(absNum / 1000) + 'K';
        return { val: sign + val, unit: '' };
    }
    
    return { val: num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','), unit: ' ₫' };
}

// Định dạng tiền đầy đủ (dùng cho xuất PDF)
function formatFullCurrency(value) {
    let num = parseInt(value.toString().replace(/[^0-9-]/g, '')) || 0;
    return num.toLocaleString('en-US') + ' ₫';
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
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
    modal.innerHTML = `<div style=\"padding:24px 20px 20px; text-align:center;\"><div class=\"custom-confirm-icon\"><i class=\"fas fa-trash-alt\"></i></div><h3 class=\"custom-confirm-title\">${title}</h3><p class=\"custom-confirm-message\">${messageHtml}</p></div><div class=\"custom-confirm-actions\"><button id=\"customConfirmCancel\" class=\"custom-confirm-cancel\">Hủy</button><button id=\"customConfirmOk\" class=\"custom-confirm-ok\">${confirmText}</button></div>`;
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
  toast.innerHTML = `<i class=\"fas ${icon} toast-icon\"></i><span class=\"toast-message\">${escapeHTML(message)}</span><div class=\"toast-progress\"></div>`;
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
    return parseInt(val, 10).toLocaleString('en-US');
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
    if (!cat) return '<i class=\"fas fa-box-open\"></i>';
    const rawFaIcon = getRawFaIconName(cat);
    if (rawFaIcon) {
        let finalIcon = rawFaIcon;
        if (!finalIcon.includes('fa-')) finalIcon = `fa-${finalIcon}`;
        if (!finalIcon.includes('fas ')) finalIcon = `fas ${finalIcon}`;
        return `<i class=\"${finalIcon}\"></i>`;
    }
    const firstLetter = Array.from(cat.trim())[0].toUpperCase();
    return `<span style=\"font-weight: 900; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 0.9em; line-height: 1;\">${firstLetter}</span>`;
}

// Hàm dựng HTML 1 thẻ giao dịch (dùng chung: Tab 1, chi tiết ngày/danh mục, tìm kiếm).
// Trước đây bị thiếu khi tách file nên app-reports.js gọi tới mà không có định nghĩa
// -> lỗi "renderTxCard is not defined" mỗi khi tải danh sách giao dịch.
// Mẫu HTML lấy đúng theo bản đang chạy tốt ở app-crud.js (displaySearchResults).
function renderTxCard(item, stt) {
    const tCls = item.type === 'Thu nhập' ? 'income' : 'expense';
    const icon = getCategoryIcon(item.category);
    const amtObj = formatCurrencyWithUnit(item.amount);
    return `<div class="tx-icon-wrap ${tCls}">${icon}</div><div class="tx-body"><div class="tx-title">${escapeHTML(item.content)}</div><div class="tx-meta-row"><span class="tx-date">${escapeHTML(formatDate(item.date))}</span><span class="tx-badge tx-badge-neutral">${escapeHTML(item.type)}</span><span class="tx-badge ${tCls}">${escapeHTML(item.category)}</span></div>${item.note ? `<div class="tx-note"><i class="fas fa-tag tx-note-icon"></i>${escapeHTML(item.note)}</div>` : ''}<div class="tx-id-row"><span>STT: ${stt}</span> • <span>#${escapeHTML(item.id)}</span></div></div><div class="tx-right-col"><div class="tx-amount ${tCls}"><span>${item.type === 'Thu nhập' ? '+' : '−'}</span>${amtObj.val}<span>${amtObj.unit}</span></div><div class="tx-actions"><button class="tx-btn edit-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-pen"></i></button><button class="tx-btn delete-btn" data-id="${escapeHTML(item.id)}"><i class="fas fa-trash"></i></button></div></div>`;
}

function getCompareHTML(current, prev, type, text = 'so với kỳ trước') {
    let zeroObj = formatCurrencyWithUnit(0);
    // R18-1: cụm định danh kỳ ("tháng 9", "tuần 42", "ngày 17/10/2026") luôn nằm
    // trên cùng một dòng — không bao giờ tách "tháng" / "9".
    const cmpLabel = (t) => escapeHTML(t).replace(/(\S+\s+\S+)\s*$/, '<span class="cmp-lbl">$1</span>');
    // R18-1: số tiền + ₫ phải ở cùng một dòng (không bao giờ ngắt giữa số và ₫).
    if (prev === 0 && current === 0) return `<span style=\"color: var(--text-2); font-weight: 500;\">− <span class=\"cmp-amt\">${zeroObj.val}${zeroObj.unit}</span> ${cmpLabel(text)}</span>`;
    let diff = current - prev;
    if (diff === 0) return `<span style=\"color: var(--text-2); font-weight: 500;\">− Bằng ${escapeHTML(text)}</span>`;
    let isUp = diff > 0;
    let icon = isUp ? '<i class=\"fas fa-arrow-up\"></i>' : '<i class=\"fas fa-arrow-down\"></i>';
    let arrowText = isUp ? (type === 'balance' ? 'Dư' : 'Tăng') : (type === 'balance' ? 'Âm' : 'Giảm');
    let colorVar = type === 'expense' ? (isUp ? 'var(--expense)' : 'var(--income)') : (isUp ? 'var(--income)' : 'var(--expense)');
    let diffObj = formatCurrencyWithUnit(Math.abs(diff));
    return `<span style=\"color: ${colorVar}; font-weight: 600;\">${icon} ${arrowText} <span class=\"cmp-amt\">${diffObj.val}${diffObj.unit}</span> ${cmpLabel(text)}</span>`;
}

window.openTab = function(tabId) {
  triggerHaptic('light');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const btn = document.querySelector(`.nav-btn[data-tab=\"${tabId}\"]`);
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

// ============================================================================
// REDESIGN (18/10/2026): bấm vào thẻ giao dịch = mở form sửa.
// Giao diện mới ẩn nút sửa/xóa trên từng dòng cho thoáng (giống ảnh tham khảo);
// tính năng CRUD giữ nguyên 100%: bấm vào thẻ kích hoạt đúng handler của nút
// .edit-btn tương ứng (đã được gán trong các hàm render từng vùng).
// Xóa vẫn có trong form sửa (nút Xóa của editModal).
// ============================================================================
(function initTxCardTapToEdit() {
  document.addEventListener('click', function (e) {
    const card = e.target && e.target.closest ? e.target.closest('.tx-card') : null;
    if (!card) return;
    // Bỏ qua khi bấm đúng vào cụm nút hành động (nếu có) hoặc link bên trong thẻ.
    if (e.target.closest('.tx-actions, .tx-btn, a, button')) return;
    const editBtn = card.querySelector('.edit-btn');
    if (editBtn && typeof editBtn.onclick === 'function') {
      try { editBtn.onclick.call(editBtn, e); } catch (err) {}
    }
  });
})();

// ============================================================================
// FIX ROUND 16 (19/10/2026): avatar trên thẻ tím (Tab1) + CROP EDITOR (nâng cấp R13).
// - Vòng tròn 46px ở góc trái thẻ tím: mặc định icon người (fa-user), có ảnh
//   thì img phủ kín (object-fit: cover). BỎ HOÀN TOÀN badge ✕ của R13.
// - Bấm avatar: chưa có ảnh -> mở picker chọn ảnh; đã có ảnh -> mở action
//   sheet (Đổi ảnh / Xóa ảnh / Hủy).
// - Sau khi chọn file -> mở CROP EDITOR (modal-sheet): stage vuông
//   min(78vw,320px), vòng tròn guide trắng + vùng ngoài vòng mờ tối, kéo để
//   pan (pointer events: chuột + touch), thanh trượt zoom 1x–3x, ảnh luôn
//   cover vòng tròn (clamp pan). "Lưu ảnh": render vùng tròn về canvas
//   192x192 JPEG 0.85 -> localStorage 'hmh_hero_avatar'. "Hủy": bỏ thay đổi.
// - Toán pan: ảnh vẽ ở scale = baseZoom * zoom (baseZoom = cover-fit);
//   tâm ảnh đặt tại (S/2 + tx, S/2 + ty); cover -> |tx| <= (imgW - S)/2
//   (tương tự ty). Save: góc trái-trên ảnh trong hệ stage = (S/2+tx-imgW/2),
//   vùng vuông nội tiếp = ((0-x0)/sc, (0-y0)/sc, S/sc) trong tọa độ ảnh gốc.
// - Hết quota -> thử 128px/0.8, vẫn lỗi thì giữ ảnh cho phiên hiện tại.
// ============================================================================
(function initHeroAvatar() {
  var KEY = 'hmh_hero_avatar';
  var btn, img, input, ph;
  var sheet, cropModal, cropStage, cropImg, cropZoom, cropSave;
  var savedUrl = null;
  var crop = { imgEl: null, iw: 0, ih: 0, S: 0, zoom: 1, tx: 0, ty: 0 };

  function els() {
    btn = document.getElementById('heroAvatar');
    img = document.getElementById('heroAvatarImg');
    input = document.getElementById('heroAvatarInput');
    ph = btn ? btn.querySelector('.hero-avatar-ph') : null;
    sheet = document.getElementById('avatarSheet');
    cropModal = document.getElementById('avatarCropModal');
    cropStage = document.getElementById('avatarCropStage');
    cropImg = document.getElementById('avatarCropImg');
    cropZoom = document.getElementById('avatarCropZoom');
    cropSave = document.getElementById('avatarCropSave');
    return !!(btn && img && input);
  }

  function render(url) {
    savedUrl = url || null;
    if (url) {
      img.src = url; img.style.display = 'block';
      if (ph) ph.style.display = 'none';
    } else {
      img.removeAttribute('src'); img.style.display = 'none';
      if (ph) ph.style.display = 'flex';
    }
  }

  function store(dataUrl) {
    try { localStorage.setItem(KEY, dataUrl); return true; }
    catch (e) { return false; }
  }

  function overlayShow(on) {
    var ov = document.getElementById('modalOverlay');
    if (ov) ov.classList.toggle('show', !!on);
  }

  /* ---------------- action sheet ---------------- */
  function openAvatarSheet() {
    if (sheet) sheet.classList.add('show');
    overlayShow(true);
  }
  function closeAvatarSheet() {
    if (sheet) sheet.classList.remove('show');
    if (!cropModal || !cropModal.classList.contains('show')) overlayShow(false);
  }
  window.closeAvatarSheet = function () { closeAvatarSheet(); };

  /* ---------------- crop editor ---------------- */
  function coverScale() {
    if (!crop.iw || !crop.ih || !crop.S) return 1;
    return Math.max(crop.S / crop.iw, crop.S / crop.ih);
  }
  function clampPan() {
    var sc = coverScale() * crop.zoom;
    var mx = Math.max(0, (crop.iw * sc - crop.S) / 2);
    var my = Math.max(0, (crop.ih * sc - crop.S) / 2);
    crop.tx = Math.max(-mx, Math.min(mx, crop.tx));
    crop.ty = Math.max(-my, Math.min(my, crop.ty));
  }
  function applyTransform() {
    clampPan();
    var sc = coverScale() * crop.zoom;
    var w = crop.iw * sc, h = crop.ih * sc;
    cropImg.style.width = w + 'px';
    cropImg.style.height = h + 'px';
    // đặt tâm ảnh tại (S/2 + tx, S/2 + ty)
    cropImg.style.transform = 'translate(' + (crop.S / 2 + crop.tx - w / 2) + 'px,' +
      (crop.S / 2 + crop.ty - h / 2) + 'px)';
  }

  function openCrop(dataUrl) {
    closeAvatarSheet();
    var im = new Image();
    im.onload = function () {
      crop.iw = im.naturalWidth || im.width || 0;
      crop.ih = im.naturalHeight || im.height || 0;
      if (!crop.iw || !crop.ih) return;
      crop.S = (cropStage && cropStage.clientWidth) || Math.min(window.innerWidth * 0.78, 320);
      crop.zoom = 1; crop.tx = 0; crop.ty = 0;
      if (cropZoom) cropZoom.value = 1;
      cropImg.src = dataUrl;
      crop.imgEl = im;
      applyTransform();
      if (cropModal) cropModal.classList.add('show');
      overlayShow(true);
    };
    im.src = dataUrl;
  }

  function closeCrop() {
    if (cropModal) cropModal.classList.remove('show');
    overlayShow(false);
  }
  window.closeAvatarCrop = function (/* cancel */) { closeCrop(); };

  function saveCrop() {
    var im = crop.imgEl; if (!im) return;
    var sc = coverScale() * crop.zoom;
    var x0 = crop.S / 2 + crop.tx - (crop.iw * sc) / 2; // góc trái ảnh (px stage)
    var y0 = crop.S / 2 + crop.ty - (crop.ih * sc) / 2; // góc trên ảnh (px stage)
    // vùng vuông nội tiếp vòng tròn -> tọa độ trong ảnh gốc
    var sx = (0 - x0) / sc, sy = (0 - y0) / sc, sw = crop.S / sc;
    var attempts = [{ s: 192, q: 0.85 }, { s: 128, q: 0.8 }];
    for (var i = 0; i < attempts.length; i++) {
      var cv = document.createElement('canvas');
      cv.width = attempts[i].s; cv.height = attempts[i].s;
      var cx = cv.getContext('2d');
      cx.drawImage(im, sx, sy, sw, sw, 0, 0, attempts[i].s, attempts[i].s);
      var u = cv.toDataURL('image/jpeg', attempts[i].q);
      render(u);
      if (store(u)) break; // lưu được -> thoát vòng, đóng editor bên dưới
      // hết quota: vòng sau thử size nhỏ hơn; vòng cuối vẫn lỗi -> giữ ảnh phiên này
    }
    window.closeAvatarCrop(false);
    pushAvatarServer(lastSavedUrl());
  }

  // FIX ROUND 18 (R18-3): đồng bộ avatar lên máy chủ để đổi thiết bị vẫn thấy.
  // Dùng đúng kênh secureFetch đã có (worker proxy Firebase): GET/PUT đường dẫn
  // /users/<chatId>/profile/avatar.json — cùng cơ chế với keywords (app-core.js).
  // - Lưu local trước rồi mới đẩy lên server (fire-and-forget); không có mạng →
  //   vẫn giữ local, lần mở sau sẽ đẩy lại qua pull.
  // - Xung đột: server thắng khi mở app; khi ghi, lần ghi sau cùng thắng.
  function avatarServerPath() { return '/users/' + chatId + '/profile/avatar.json'; }
  function serverSyncOK() {
    return (typeof chatId !== 'undefined' && chatId) && (typeof window.secureFetch === 'function');
  }
  function lastSavedUrl() { return savedUrl; }
  function pushAvatarServer(dataUrl) {
    if (!serverSyncOK()) return;
    try {
      var p = window.secureFetch(avatarServerPath(), 'PUT', { avatar: dataUrl, updatedAt: Date.now() });
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function pullAvatarServer() {
    if (!serverSyncOK()) return;
    try {
      var p = window.secureFetch(avatarServerPath(), 'GET');
      Promise.resolve(p).then(function (obj) {
        if (!obj || typeof obj !== 'object' || !('avatar' in obj)) {
          // R19: migration — server chưa có node avatar (ảnh đặt trước khi có đồng bộ
          // không tự bay lên được), đẩy ảnh local hiện có lên để thiết bị khác thấy.
          // Chỉ khi node KHÔNG tồn tại; tombstone avatar:null (key có mặt) vẫn đi
          // nhánh dưới để xóa local, tuyệt đối không đẩy lại ở đây.
          var local = null;
          try { local = localStorage.getItem(KEY); } catch (e) {}
          if (local) pushAvatarServer(local);
          return;
        }
        var sv = obj.avatar; // string | null
        var cur = null;
        try { cur = localStorage.getItem(KEY); } catch (e) {}
        if (sv === cur) return;
        if (typeof sv === 'string' && sv) {
          try { localStorage.setItem(KEY, sv); } catch (e) {}
          render(sv);
        } else {
          try { localStorage.removeItem(KEY); } catch (e) {}
          render(null);
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function handleFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var reader = new FileReader();
    reader.onload = function () { openCrop(reader.result); };
    reader.readAsDataURL(file);
  }

  function bind() {
    btn.addEventListener('click', function () {
      if (savedUrl) openAvatarSheet();
      else input.click();
    });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) handleFile(input.files[0]);
      input.value = '';
    });

    var chg = document.getElementById('avatarSheetChange');
    var rem = document.getElementById('avatarSheetRemove');
    var can = document.getElementById('avatarSheetCancel');
    if (chg) chg.addEventListener('click', function () { closeAvatarSheet(); input.click(); });
    if (rem) rem.addEventListener('click', function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      render(null); closeAvatarSheet();
      pushAvatarServer(null); // R18-3: xóa trên server
    });
    if (can) can.addEventListener('click', closeAvatarSheet);

    // drag pan: pointer events (chuột + touch); stage có touch-action:none
    var dragging = false, lx = 0, ly = 0;
    if (cropStage) {
      cropStage.addEventListener('pointerdown', function (e) {
        dragging = true; lx = e.clientX; ly = e.clientY;
        try { cropStage.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      cropStage.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        crop.tx += (e.clientX - lx); crop.ty += (e.clientY - ly);
        lx = e.clientX; ly = e.clientY;
        applyTransform();
      });
      var endDrag = function () { dragging = false; };
      cropStage.addEventListener('pointerup', endDrag);
      cropStage.addEventListener('pointercancel', endDrag);
    }
    if (cropZoom) cropZoom.addEventListener('input', function () {
      crop.zoom = parseFloat(cropZoom.value) || 1;
      applyTransform();
    });
    if (cropSave) cropSave.addEventListener('click', saveCrop);

    // expose cho test harness
    window.__heroAvatarTest = {
      openCrop: openCrop, saveCrop: saveCrop, crop: crop, key: KEY,
      render: render, handleFile: handleFile,
      getSaved: function () { return savedUrl; },
      openSheet: openAvatarSheet, closeSheet: closeAvatarSheet,
      isSheetOpen: function () { return !!(sheet && sheet.classList.contains('show')); },
      isCropOpen: function () { return !!(cropModal && cropModal.classList.contains('show')); },
      // R18-3: đồng bộ server (cho test harness)
      pushServer: pushAvatarServer, pullServer: pullAvatarServer,
      serverPath: function () { return avatarServerPath(); }
    };
  }

  function start() {
    if (!els()) return;
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    render(saved);
    bind();
    pullAvatarServer(); // R18-3: local hiện ngay, server (nếu khác) cập nhật sau
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* ==========================================================================
   FIX ROUND 15 (R15-2b): khôi phục thao tác vuốt ngang để chuyển tab
   (chức năng của app cũ). Vuốt ngang dứt khoát (|dx| >= 56px và
   |dx| > 1.4*|dy|) trên nội dung tab sẽ chuyển sang tab kề theo thứ tự
   nav: Giao dịch -> Báo cáo -> Tìm kiếm -> Cài đặt (vuốt trái = tiếp,
   vuốt phải = lùi, kẹp ở 2 đầu). KHÔNG kích hoạt khi: menu FAB / modal
   khác đang mở, bắt đầu trên phần tử cuộn ngang được, trên input/select/
   textarea, hoặc khi đang cuộn dọc. Chỉ quan sát touch event (không
   preventDefault) nên không ảnh hưởng cuộn dọc.
   ========================================================================== */
(function initTabSwipe() {
  var ORDER = ['tab1', 'tab2', 'search', 'settings'];
  var MIN_DX = 56, RATIO = 1.4;
  var sx = 0, sy = 0, st = null, tracking = false;

  function $(id) { return document.getElementById(id); }

  function isShown(el) {
    if (!el) return false;
    var b = el.getBoundingClientRect();
    return b.width > 0.5 && b.height > 0.5;
  }

  function blockingOverlayOpen() {
    var fm = $('fabMenu');
    if (fm && fm.classList.contains('show')) return true;
    var sheets = document.querySelectorAll('.modal-sheet.show');
    for (var i = 0; i < sheets.length; i++) {
      // NOTE: #confirmDeleteModal .confirm-dialog mang class show trong markup
      // nhưng parent display:none -> rect 0x0, không tính là đang mở
      if (sheets[i].id !== 'searchModal' && isShown(sheets[i])) return true;
    }
    var fps = document.querySelectorAll('.fullscreen-page.show');
    for (var j = 0; j < fps.length; j++) {
      if (fps[j].id !== 'settingsPage') return true;
    }
    return false;
  }

  function currentPos() {
    if (blockingOverlayOpen()) return -1;
    var sm = $('searchModal'), sp = $('settingsPage');
    if (sm && sm.classList.contains('show')) return 2;
    if (sp && sp.classList.contains('show')) return 3;
    var active = document.querySelector('.tab-content.active');
    if (!active) return -1;
    if (active.id === 'tab1') return 0;
    if (active.id === 'tab2') return 1;
    return -1; // tab3 (từ khóa) và các view khác: không vuốt
  }

  function setNavActive(btnId) {
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
    var b = btnId ? $(btnId) : null;
    if (b) b.classList.add('active');
  }

  function goTo(pos) {
    try { triggerHaptic('light'); } catch (e) {}
    var sm = $('searchModal'), sp = $('settingsPage');
    if (pos === 0 || pos === 1) {
      if (sm && sm.classList.contains('show') && typeof window.closeSearchModal === 'function') window.closeSearchModal();
      else if (sm) sm.classList.remove('show');
      if (sp && sp.classList.contains('show') && typeof window.closeFullscreen === 'function') window.closeFullscreen('settingsPage');
      window.openTab(pos === 0 ? 'tab1' : 'tab2');
    } else if (pos === 2) {
      if (sp && sp.classList.contains('show') && typeof window.closeFullscreen === 'function') window.closeFullscreen('settingsPage');
      setNavActive('navSearchBtn');
      if (typeof window.openSearchModal === 'function') window.openSearchModal();
      else if (sm) sm.classList.add('show');
    } else if (pos === 3) {
      if (sm && sm.classList.contains('show') && typeof window.closeSearchModal === 'function') window.closeSearchModal();
      else if (sm) sm.classList.remove('show');
      setNavActive('navSettingsBtn');
      if (typeof window.openFullscreen === 'function') window.openFullscreen('settingsPage');
    }
  }

  // Chỉ tính phần tử CUỘN NGANG ĐƯỢC THẬT (overflow-x auto/scroll) — ví dụ
  // dải lịch tuần nếu cuộn. Không tính block thường bị tràn layout
  // (VD: #tab1 báo scrollWidth 475 do quirk margin âm, nhưng không cuộn được).
  function horizontallyScrollable(el, stop) {
    var n = el;
    while (n && n !== stop && n !== document.body && n !== document.documentElement) {
      var cs = null;
      try { cs = getComputedStyle(n); } catch (e) {}
      if (cs && (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
          n.scrollWidth > n.clientWidth + 4) return true;
      n = n.parentElement;
    }
    return false;
  }

  function positionContainer(pos) {
    if (pos === 0) return $('tab1');
    if (pos === 1) return $('tab2');
    if (pos === 2) return $('searchModal');
    if (pos === 3) return $('settingsPage');
    return null;
  }

  document.addEventListener('touchstart', function (e) {
    if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
    var t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = t.target; tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    if (!e.changedTouches || !e.changedTouches.length) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < MIN_DX) return;
    if (Math.abs(dx) <= RATIO * Math.abs(dy)) return; // cuộn dọc / chéo: bỏ qua
    if (!st) return;
    var el = (st.nodeType === 1) ? st : st.parentElement;
    if (!el) return;
    if (el.closest && el.closest('input, select, textarea')) return;
    var pos = currentPos();
    if (pos < 0) return;
    var box = positionContainer(pos);
    if (!box || !box.contains(el)) return;
    if (horizontallyScrollable(el, box)) return;
    var next = dx < 0 ? Math.min(3, pos + 1) : Math.max(0, pos - 1);
    if (next === pos) return; // kẹp ở 2 đầu
    goTo(next);
    // expose cho test harness
    window.__lastSwipe = { from: ORDER[pos], to: ORDER[next], dx: Math.round(dx) };
  }, { passive: true });

  window.__tabSwipeTest = { currentPos: currentPos, goTo: goTo, ORDER: ORDER };
})();
