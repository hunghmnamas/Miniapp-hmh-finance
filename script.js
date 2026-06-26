// Báo cho Telegram biết App đã sẵn sàng để hiển thị ngay lập tức
if (window.Telegram && window.Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
}

// Flag đánh dấu tab 2 cần reload khi có thay đổi giao dịch
let tab2NeedsReload = false;

const urlParams = new URLSearchParams(window.location.search);
const apiUrl = urlParams.get('api');        // (TÙY CHỌN) backup Google Sheet - có thể null
const workerUrl = urlParams.get('workerUrl'); // BẮT BUỘC - máy chủ bảo mật Cloudflare
const proxyUrl = '/api/proxy?url=';

let chatId = null;
let sheetId = null;

// Lấy chatId an toàn từ Telegram
if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe?.user) {
    chatId = window.Telegram.WebApp.initDataUnsafe.user.id;
}

// ==========================================
// HÀM BẢO MẬT: GIAO TIẾP VỚI CLOUDFLARE WORKER
// (Thay cho việc gọi thẳng Firebase REST như bản cũ)
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

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Lỗi máy chủ: ${errText}`);
    }
    const responseText = await res.text();
    return responseText ? JSON.parse(responseText) : null;
}

// Lưu toàn bộ mảng từ khóa lên server + đồng bộ sang Google Sheet qua Worker
async function saveKeywordsToServer() {
    await secureFetch(`/users/${chatId}/keywords.json`, 'PUT', cachedKeywords);
    if (workerUrl) {
        fetch(`${workerUrl}/api/update_sheet_keywords`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: chatId, keywordsData: cachedKeywords })
        }).catch(e => console.log('Lỗi đồng bộ từ khóa sang Sheet:', e));
    }
}
// ==========================================

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

// [ĐÃ ĐỔI] Lấy dữ liệu tháng qua máy chủ bảo mật, theo từng người dùng
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
async function loadCustomReport(startMonth, endMonth, year) { showLoading(true, 'tab2'); document.querySelector('#tab2 .chart-container').style.display='none'; document.getElementById('placeholderTab2').style.display='none'; try { const startDate = new Date(year, startMonth - 1, 1); const endDate = new Date(year, endMonth, 0); const prevStartDate = new Date(year - 1, startMonth - 1, 1); const prevEndDate = new Date(year - 1, endMonth, 0); const [currentTx, prevTx] = await Promise.all([ getTransactionsInRange(startDate, endDate), getTransactionsInRange(prevStartDate, prevEndDate) ]); document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (T${startMonth} - T${endMonth} / ${year})`; const labels = [], incs = [], exps = []; for(let m=startMonth; m<=endMonth; m++) { labels.push(`Tháng ${m}`); const mTx = currentTx.filter(t => parseInt(t.date.split('/')[1]) === m && parseInt(t.date.split('/')[2]) === year); let inc=0, exp=0; mTx.forEach(t => { if(t.type==='Thu nhập') inc+=t.amount; else exp+=t.amount; }); incs.push(inc); exps.push(exp); } document.getElementById('calendarStatbox').style.display = 'none'; processReportData(currentTx, prevTx, labels, incs, exps); cachedChartData = { mode: 'custom', txs: currentTx, periodStr: `${startMonth}-${endMonth}-${year}` }; } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab2'); } }

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
// [ĐÃ ĐỔI] Đọc icon + từ khóa qua máy chủ bảo mật theo từng người dùng
window.loadKeywords = async function(isInit = false) {
    if(!isInit) showLoading(true, 'tab3');
    if(!isInit) document.getElementById('keywordsContainer').innerHTML = '';
    try {
        const iconData = await secureFetch(`/users/${chatId}/categoryIcons.json`);
        if(iconData) window.customCategoryIcons = iconData;

        let data = await secureFetch(`/users/${chatId}/keywords.json`);

        // Cứu cánh: nếu Firebase trả về Object thì chuyển thành Array
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
// [ĐÃ ĐỔI] Lấy danh mục TỪ chính mảng cachedKeywords (không gọi /categories nữa)
async function fetchCategories() {
    if (!cachedKeywords || cachedKeywords.length === 0) await window.loadKeywords(true);
    let cats = cachedKeywords.map(k => k.category).filter(c => c);
    cats = [...new Set(cats)];
    cats.sort((a, b) => { if (a.toLowerCase() === 'khác') return 1; if (b.toLowerCase() === 'khác') return -1; return a.localeCompare(b, 'vi'); });
    return cats.length > 0 ? cats : ["Ăn uống", "Đi lại", "Mua sắm", "Khác"];
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
document.getElementById('addForm').onsubmit = async function(e) { e.preventDefault(); closeAddForm(); const [y,m,d] = document.getElementById('addDate').value.split('-'); const tx = { content: document.getElementById('addContent').value, amount: parseNumber(document.getElementById('addAmount').value), type: document.getElementById('addType').value, category: document.getElementById('addCategory').value, note: document.getElementById('addNote').value, date: `${d}/${m}/${y}`, action: 'addTransaction', sheetId }; await submitTx(tx); };
document.getElementById('editForm').onsubmit = async function(e) { e.preventDefault(); closeEditForm(); const [y,m,d] = document.getElementById('editDate').value.split('-'); const tx = { id: document.getElementById('editTransactionId').value, content: document.getElementById('editContent').value, amount: parseNumber(document.getElementById('editAmount').value), type: document.getElementById('editType').value, category: document.getElementById('editCategory').value, note: document.getElementById('editNote').value, date: `${d}/${m}/${y}`, month: m, action: 'updateTransaction', sheetId }; await submitTx(tx); };

// [ĐÃ ĐỔI] Lưu giao dịch qua máy chủ bảo mật; Worker tự thông báo về Bot (không cần notifyTelegram)
async function submitTx(tx) {
  try {
    showToast("Đang lưu giao dịch...", "info");
    if (tx.action === 'addTransaction') { let maxId = 0; const allLoadedTxs = [...(cachedTransactions?.data || []), ...(cachedChartData?.txs || []), ...(cachedSearchResults || [])]; allLoadedTxs.forEach(item => { if (item.id && String(item.id).startsWith('GD') && !String(item.id).includes('_')) { let num = parseInt(String(item.id).replace('GD', ''), 10); if (!isNaN(num) && num > maxId) maxId = num; } }); tx.id = "GD" + String(maxId + 1).padStart(3, '0'); }
    const month = parseInt(tx.date.split('/')[1], 10); const fbTx = { id: tx.id, date: tx.date, type: tx.type, content: tx.content, amount: tx.amount, category: tx.category, note: tx.note };
    if (tx.action === 'addTransaction') { if (cachedTransactions?.data) cachedTransactions.data.unshift(fbTx); } else { [cachedTransactions?.data, cachedChartData?.txs, cachedSearchResults].forEach(arr => { if (!arr) return; const idx = arr.findIndex(i => String(i.id) === String(tx.id)); if (idx !== -1) arr[idx] = { ...arr[idx], ...fbTx }; }); }
    if(document.getElementById('tab1').classList.contains('active')) displayTransactions(); else if(document.getElementById('tab2').classList.contains('active')) updateTimeNavUI(); else if(document.getElementById('tab3').classList.contains('active')) displaySearchResults();

    await secureFetch(`/transactions/users/${chatId}/month_${month}/${tx.id}.json`, 'PUT', fbTx);
    triggerHapticNotification('success'); showToast("Đã lưu giao dịch!", "success"); tab2NeedsReload = true;

    // (TÙY CHỌN) Backup sang Google Sheet nếu có cấu hình apiUrl
    if (apiUrl) fetch(proxyUrl + encodeURIComponent(apiUrl), { method: 'POST', body: JSON.stringify(tx) }).catch(e => console.log("Lỗi backup Sheet:", e));
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
              await secureFetch(`/transactions/users/${chatId}/month_${monthToUpdate}/${id}.json`, 'DELETE'); triggerHapticNotification('success'); showToast("Đã xóa giao dịch!", "success"); tab2NeedsReload = true; 

              // (TÙY CHỌN) Backup xóa sang Google Sheet nếu có apiUrl
              if (apiUrl) fetch(proxyUrl + encodeURIComponent(apiUrl), { method: 'POST', body: JSON.stringify({action: 'deleteTransaction', id, month: monthToUpdate, sheetId}) }).catch(e => console.log("Lỗi xóa Sheet:", e)); 
          } catch(e) { showToast(e.message, "error"); }
      }
  );
};
// ---------------- XUẤT PDF ----------------
window.exportToPDF = async function() {
    triggerHaptic('medium');
    if (!cachedChartData || !cachedChartData.txs || cachedChartData.txs.length === 0) {
        showToast("Chưa có dữ liệu để xuất báo cáo!", "error");
        return;
    }

    showLoading(true, 'tab2');
    showToast("Đang tạo báo cáo PDF...", "info");

    try {
        const txs = cachedChartData.txs;
        let totalInc = 0, totalExp = 0;
        txs.forEach(t => { if (t.type === 'Thu nhập') totalInc += t.amount; else totalExp += t.amount; });
        const totalBal = totalInc - totalExp;

        // Tiêu đề kỳ báo cáo
        let periodTitle = '';
        if (cachedChartData.mode === 'weekly') { const sd = getDateFromWeekString(cachedChartData.periodStr); const ed = new Date(sd); ed.setDate(ed.getDate() + 6); periodTitle = `Tuần (${formatDateToDDMMYYYY(sd)} - ${formatDateToDDMMYYYY(ed)})`; }
        else if (cachedChartData.mode === 'monthly') { const [y, m] = cachedChartData.periodStr.split('-'); periodTitle = `Tháng ${m}/${y}`; }
        else if (cachedChartData.mode === 'custom') { const [sm, em, y] = cachedChartData.periodStr.split('-'); periodTitle = `Từ tháng ${sm} đến tháng ${em} năm ${y}`; }

        // Gom nhóm theo danh mục (chi tiêu)
        const catMap = {};
        txs.forEach(t => { if (t.type === 'Chi tiêu') catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
        const catData = Object.keys(catMap).map(k => ({ category: k, amount: catMap[k] })).sort((a, b) => b.amount - a.amount);

        // Tạo bảng giao dịch dạng HTML
        const sortedTxs = [...txs].sort((a, b) => {
            const [da, ma, ya] = a.date.split('/').map(Number);
            const [db, mb, yb] = b.date.split('/').map(Number);
            return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
        });

        let rowsHTML = '';
        sortedTxs.forEach((t, i) => {
            const sign = t.type === 'Thu nhập' ? '+' : '-';
            const color = t.type === 'Thu nhập' ? '#10B981' : '#F43F5E';
            rowsHTML += `<tr style="border-bottom:1px solid #E2E8F0;">
                <td style="padding:8px 6px; font-size:11px; color:#475569;">${i + 1}</td>
                <td style="padding:8px 6px; font-size:11px; color:#475569;">${escapeHTML(t.date)}</td>
                <td style="padding:8px 6px; font-size:11px; color:#1E293B; font-weight:600;">${escapeHTML(t.content)}</td>
                <td style="padding:8px 6px; font-size:11px; color:#475569;">${escapeHTML(t.category)}</td>
                <td style="padding:8px 6px; font-size:11px; text-align:right; color:${color}; font-weight:700;">${sign}${formatNumberWithCommas(t.amount.toString())}</td>
            </tr>`;
        });

        let catRowsHTML = '';
        catData.forEach((c, i) => {
            const pct = totalExp > 0 ? ((c.amount / totalExp) * 100).toFixed(1) : 0;
            const color = getColorByIndex(i);
            catRowsHTML += `<tr style="border-bottom:1px solid #E2E8F0;">
                <td style="padding:8px 6px; font-size:11px;"><span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${color}; margin-right:6px;"></span>${escapeHTML(c.category)}</td>
                <td style="padding:8px 6px; font-size:11px; text-align:right; color:#F43F5E; font-weight:700;">${formatNumberWithCommas(c.amount.toString())}</td>
                <td style="padding:8px 6px; font-size:11px; text-align:right; color:#475569;">${pct}%</td>
            </tr>`;
        });

        // Khung báo cáo (render ngoài màn hình rồi chụp bằng html2canvas)
        const reportEl = document.createElement('div');
        reportEl.style.cssText = 'position:absolute; left:-9999px; top:0; width:794px; background:#fff; padding:40px; font-family:\"Plus Jakarta Sans\", Arial, sans-serif; color:#1E293B;';
        reportEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #6366F1; padding-bottom:16px; margin-bottom:24px;">
                <div>
                    <h1 style="margin:0; font-size:24px; color:#1E293B;">BÁO CÁO TÀI CHÍNH</h1>
                    <p style="margin:4px 0 0; font-size:13px; color:#64748B;">${periodTitle}</p>
                </div>
                <div style="text-align:right; font-size:11px; color:#94A3B8;">
                    Ngày xuất: ${formatDateToDDMMYYYY(new Date())}<br>HMH Finance
                </div>
            </div>

            <div style="display:flex; gap:12px; margin-bottom:28px;">
                <div style="flex:1; background:#ECFDF5; border-radius:12px; padding:16px;">
                    <div style="font-size:11px; color:#059669; font-weight:600;">TỔNG THU</div>
                    <div style="font-size:18px; font-weight:800; color:#10B981; margin-top:4px;">+${formatNumberWithCommas(totalInc.toString())}</div>
                </div>
                <div style="flex:1; background:#FEF2F2; border-radius:12px; padding:16px;">
                    <div style="font-size:11px; color:#DC2626; font-weight:600;">TỔNG CHI</div>
                    <div style="font-size:18px; font-weight:800; color:#F43F5E; margin-top:4px;">-${formatNumberWithCommas(totalExp.toString())}</div>
                </div>
                <div style="flex:1; background:${totalBal >= 0 ? '#EFF6FF' : '#FEF2F2'}; border-radius:12px; padding:16px;">
                    <div style="font-size:11px; color:${totalBal >= 0 ? '#2563EB' : '#DC2626'}; font-weight:600;">SỐ DƯ</div>
                    <div style="font-size:18px; font-weight:800; color:${totalBal >= 0 ? '#3B82F6' : '#F43F5E'}; margin-top:4px;">${totalBal >= 0 ? '+' : '−'}${formatNumberWithCommas(Math.abs(totalBal).toString())}</div>
                </div>
            </div>

            ${catData.length > 0 ? `
            <h2 style="font-size:16px; color:#1E293B; margin:0 0 12px;">Chi tiêu theo danh mục</h2>
            <table style="width:100%; border-collapse:collapse; margin-bottom:28px;">
                <thead><tr style="background:#F8FAFC;">
                    <th style="padding:10px 6px; font-size:11px; text-align:left; color:#64748B;">Danh mục</th>
                    <th style="padding:10px 6px; font-size:11px; text-align:right; color:#64748B;">Số tiền</th>
                    <th style="padding:10px 6px; font-size:11px; text-align:right; color:#64748B;">Tỷ lệ</th>
                </tr></thead>
                <tbody>${catRowsHTML}</tbody>
            </table>` : ''}

            <h2 style="font-size:16px; color:#1E293B; margin:0 0 12px;">Chi tiết giao dịch (${sortedTxs.length})</h2>
            <table style="width:100%; border-collapse:collapse;">
                <thead><tr style="background:#F8FAFC;">
                    <th style="padding:10px 6px; font-size:11px; text-align:left; color:#64748B;">#</th>
                    <th style="padding:10px 6px; font-size:11px; text-align:left; color:#64748B;">Ngày</th>
                    <th style="padding:10px 6px; font-size:11px; text-align:left; color:#64748B;">Nội dung</th>
                    <th style="padding:10px 6px; font-size:11px; text-align:left; color:#64748B;">Danh mục</th>
                    <th style="padding:10px 6px; font-size:11px; text-align:right; color:#64748B;">Số tiền</th>
                </tr></thead>
                <tbody>${rowsHTML}</tbody>
            </table>

            <div style="margin-top:32px; padding-top:16px; border-top:1px solid #E2E8F0; text-align:center; font-size:10px; color:#94A3B8;">
                Báo cáo được tạo tự động bởi HMH Finance • ${formatDateToDDMMYYYY(new Date())}
            </div>
        `;
        document.body.appendChild(reportEl);

        // Chụp bằng html2canvas
        const canvas = await html2canvas(reportEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        document.body.removeChild(reportEl);

        // Dựng PDF nhiều trang bằng jsPDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;
        const imgData = canvas.toDataURL('image/png');

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
            position -= pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        // Bản xem trước trong modal (nếu có), nếu không thì tải luôn
        const fileName = `BaoCao_${periodTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        const previewModal = document.getElementById('pdfPreviewModal');
        const previewFrame = document.getElementById('pdfPreviewFrame');

        if (previewModal && previewFrame) {
            const blobUrl = pdf.output('bloburl');
            previewFrame.src = blobUrl;
            document.getElementById('modalOverlay').classList.add('show');
            setTimeout(() => previewModal.classList.add('show'), 10);
            const dlBtn = document.getElementById('downloadPdfBtn');
            if (dlBtn) dlBtn.onclick = () => { triggerHaptic('light'); pdf.save(fileName); };
        } else {
            pdf.save(fileName);
        }

        triggerHapticNotification('success');
        showToast("Đã tạo báo cáo PDF!", "success");
    } catch (e) {
        showToast("Lỗi tạo PDF: " + e.message, "error");
    } finally {
        showLoading(false, 'tab2');
    }
};

window.closePdfPreview = function() {
    triggerHaptic('light');
    const previewModal = document.getElementById('pdfPreviewModal');
    const previewFrame = document.getElementById('pdfPreviewFrame');
    if (previewModal) previewModal.classList.remove('show');
    setTimeout(() => { if (previewFrame) previewFrame.src = ''; document.getElementById('modalOverlay').classList.remove('show'); }, 300);
};

// ---------------- XUẤT CSV ----------------
window.exportToCSV = function() {
    triggerHaptic('medium');
    if (!cachedChartData || !cachedChartData.txs || cachedChartData.txs.length === 0) {
        showToast("Chưa có dữ liệu để xuất file!", "error");
        return;
    }
    try {
        const txs = [...cachedChartData.txs].sort((a, b) => {
            const [da, ma, ya] = a.date.split('/').map(Number);
            const [db, mb, yb] = b.date.split('/').map(Number);
            return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
        });

        let csv = '\uFEFF'; // BOM để Excel đọc đúng tiếng Việt
        csv += 'STT,Ngày,Loại,Nội dung,Danh mục,Số tiền,Ghi chú\n';
        txs.forEach((t, i) => {
            const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
            csv += [ i + 1, esc(t.date), esc(t.type), esc(t.content), esc(t.category), t.amount, esc(t.note || '') ].join(',') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GiaoDich_${formatDateToDDMMYYYY(new Date()).replace(/\//g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        triggerHapticNotification('success');
        showToast("Đã xuất file CSV!", "success");
    } catch (e) {
        showToast("Lỗi xuất CSV: " + e.message, "error");
    }
};
// ---------------- ICON PICKER ----------------
window.openIconPickerModal = function() {
    triggerHaptic('light');
    const currentCat = document.getElementById('keywordCategory').value || '';
    document.getElementById('iconPickerCategory').value = currentCat;
    document.getElementById('iconPickerNewCategory').value = currentCat;

    // Hiển thị icon đang chọn của danh mục (nếu có)
    const curIcon = currentCat && window.categoryIconMap[currentCat.trim()] ? window.categoryIconMap[currentCat.trim()] : 'fa-tag';
    renderIconGrid(curIcon);

    document.getElementById('modalOverlay').classList.add('show');
    setTimeout(() => document.getElementById('iconPickerModal').classList.add('show'), 10);
};

window.closeIconPickerModal = function() {
    triggerHaptic('light');
    document.getElementById('iconPickerModal').classList.remove('show');
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

function renderIconGrid(selectedIcon) {
    const grid = document.getElementById('iconPickerGrid');
    if (!grid) return;
    grid.innerHTML = '';
    AVAILABLE_ICONS.forEach(icon => {
        const div = document.createElement('div');
        div.className = 'icon-pick-cell' + (icon === selectedIcon ? ' selected' : '');
        div.innerHTML = `<i class="fas ${icon}"></i>`;
        div.onclick = () => {
            triggerHaptic('light');
            grid.querySelectorAll('.icon-pick-cell').forEach(c => c.classList.remove('selected'));
            div.classList.add('selected');
            document.getElementById('iconPickerSelected').value = icon;
        };
        grid.appendChild(div);
    });
    document.getElementById('iconPickerSelected').value = selectedIcon;
}

// [ĐÃ ĐỔI] Lưu icon danh mục qua máy chủ bảo mật + đồng bộ vào keywords
document.getElementById('saveIconBtn').onclick = async function() {
    triggerHaptic('medium');
    const cat = (document.getElementById('iconPickerNewCategory').value || '').trim();
    const icon = (document.getElementById('iconPickerSelected').value || '').trim();
    if (!cat) { showToast("Vui lòng nhập tên danh mục!", "error"); return; }
    if (!icon) { showToast("Vui lòng chọn một biểu tượng!", "error"); return; }

    closeIconPickerModal();
    showToast("Đang lưu danh mục...", "info");
    try {
        // 1) Cập nhật map icon trong bộ nhớ + lưu lên /users/{chatId}/categoryIcons
        window.customCategoryIcons = window.customCategoryIcons || {};
        window.customCategoryIcons[cat] = icon;
        window.categoryIconMap[cat] = icon;
        await secureFetch(`/users/${chatId}/categoryIcons.json`, 'PATCH', { [cat]: icon });

        // 2) Đảm bảo danh mục tồn tại trong cachedKeywords (kèm icon) rồi đồng bộ
        let entry = cachedKeywords.find(k => k && k.category && k.category.trim() === cat);
        if (!entry) { entry = { category: cat, keywords: '', icon: icon }; cachedKeywords.push(entry); }
        else { entry.icon = icon; }
        await saveKeywordsToServer();

        triggerHapticNotification('success');
        showToast("Đã lưu danh mục & biểu tượng!", "success");
        await initCategories(true);
        if (document.getElementById('tab3').classList.contains('active')) displayKeywords();
    } catch (e) { showToast(e.message, "error"); }
};

// [ĐÃ ĐỔI] Xóa danh mục/icon qua máy chủ bảo mật
document.getElementById('deleteIconCategoryBtn').onclick = function() {
    triggerHaptic('medium');
    const cat = (document.getElementById('iconPickerCategory').value || '').trim();
    if (!cat) { showToast("Không có danh mục để xóa!", "error"); return; }

    showCustomConfirm(
        'Xóa danh mục',
        `Xóa danh mục <strong>${escapeHTML(cat)}</strong> cùng toàn bộ từ khóa của nó? Hành động này không thể hoàn tác.`,
        'Xóa',
        async () => {
            closeIconPickerModal();
            showToast("Đang xóa danh mục...", "info");
            try {
                // 1) Xóa icon trên máy chủ
                if (window.customCategoryIcons && window.customCategoryIcons[cat]) delete window.customCategoryIcons[cat];
                if (window.categoryIconMap[cat]) delete window.categoryIconMap[cat];
                await secureFetch(`/users/${chatId}/categoryIcons/${encodeURIComponent(cat)}.json`, 'DELETE');

                // 2) Bỏ danh mục khỏi cachedKeywords rồi đồng bộ
                cachedKeywords = cachedKeywords.filter(k => !(k && k.category && k.category.trim() === cat));
                await saveKeywordsToServer();

                triggerHapticNotification('success');
                showToast("Đã xóa danh mục!", "success");
                await initCategories(true);
                if (document.getElementById('tab3').classList.contains('active')) displayKeywords();
            } catch (e) { showToast(e.message, "error"); }
        }
    );
};

// ---------------- KHỞI ĐỘNG APP ----------------
document.addEventListener('DOMContentLoaded', async function() {
    // Áp dụng giao diện & quyền riêng tư đã lưu
    applyTheme(localStorage.getItem('settingTheme') || 'auto');
    applyPrivacyMode();
    initSettingsUI();

    // ----- Tab Từ khóa: Thêm / Sửa / Xóa (đồng bộ qua saveKeywordsToServer) -----
    document.getElementById('addKeywordBtn').onclick = async function() {
        triggerHaptic('light');
        const kw = (document.getElementById('keywordInput').value || '').trim();
        const cat = (document.getElementById('keywordCategory').value || '').trim();
        if (!kw) { showToast("Vui lòng nhập từ khóa!", "error"); return; }
        if (!cat) { showToast("Vui lòng chọn phân loại!", "error"); return; }

        showToast("Đang lưu từ khóa...", "info");
        try {
            let entry = cachedKeywords.find(k => k && k.category && k.category.trim() === cat);
            if (!entry) {
                entry = { category: cat, keywords: kw, icon: window.categoryIconMap[cat] || 'fa-tag' };
                cachedKeywords.push(entry);
            } else {
                const list = (entry.keywords || '').split(',').map(s => s.trim()).filter(Boolean);
                // Nếu đang sửa: bỏ từ khóa cũ trước
                if (currentEditKeyword) {
                    cachedKeywords.forEach(e => {
                        if (!e || !e.keywords) return;
                        e.keywords = e.keywords.split(',').map(s => s.trim()).filter(s => s && s !== currentEditKeyword).join(', ');
                    });
                }
                if (!list.includes(kw)) list.push(kw);
                entry.keywords = list.join(', ');
            }
            await saveKeywordsToServer();
            triggerHapticNotification('success');
            showToast(currentEditKeyword ? "Đã cập nhật từ khóa!" : "Đã thêm từ khóa!", "success");
            cancelEditKeyword();
            await loadKeywords(true);
            displayKeywords();
            await initCategories(true);
        } catch (e) { showToast(e.message, "error"); }
    };

    document.getElementById('deleteEditKeywordBtn').onclick = function() {
        triggerHaptic('medium');
        if (!currentEditKeyword) return;
        const kwToDelete = currentEditKeyword;
        showCustomConfirm('Xóa từ khóa', `Xóa từ khóa <strong>${escapeHTML(kwToDelete)}</strong>?`, 'Xóa', async () => {
            showToast("Đang xóa từ khóa...", "info");
            try {
                cachedKeywords.forEach(e => {
                    if (!e || !e.keywords) return;
                    e.keywords = e.keywords.split(',').map(s => s.trim()).filter(s => s && s !== kwToDelete).join(', ');
                });
                await saveKeywordsToServer();
                triggerHapticNotification('success');
                showToast("Đã xóa từ khóa!", "success");
                cancelEditKeyword();
                await loadKeywords(true);
                displayKeywords();
            } catch (e) { showToast(e.message, "error"); }
        });
    };

    document.getElementById('fetchKeywordsBtn').onclick = () => { triggerHaptic('light'); loadKeywords(false); };

    // ----- Ô tìm kiếm -----
    document.getElementById('searchBtn').onclick = async function() {
        triggerHaptic('light');
        const kw = (document.getElementById('searchInput').value || '').trim().toLowerCase();
        const cat = document.getElementById('searchCategory').value || '';
        const type = document.getElementById('searchType')?.value || '';
        showLoading(true, 'tab3');
        try {
            // Tìm theo khoảng ngày đang chọn (mặc định: cả năm hiện tại)
            const now = new Date();
            const startDate = new Date(now.getFullYear(), 0, 1);
            const endDate = new Date(now.getFullYear(), 11, 31);
            let results = await getTransactionsInRange(startDate, endDate);
            results = results.filter(t => {
                let ok = true;
                if (kw) ok = ok && ((t.content || '').toLowerCase().includes(kw) || (t.note || '').toLowerCase().includes(kw));
                if (cat) ok = ok && t.category === cat;
                if (type) ok = ok && t.type === type;
                return ok;
            });
            cachedSearchResults = results;
            currentPageSearch = 1;
            displaySearchResults();
        } catch (e) { showToast(e.message, "error"); } finally { showLoading(false, 'tab3'); }
    };

    // ----- Bộ lọc thời gian Tab Báo cáo -----
    document.querySelectorAll('.filter-mode-btn').forEach(btn => {
        btn.onclick = function() {
            triggerHaptic('light');
            document.querySelectorAll('.filter-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilterMode = btn.getAttribute('data-mode');
            activePeriodDate = new Date();
            updateTimeNavUI();
        };
    });
    document.getElementById('prevPeriodBtn').onclick = () => { triggerHaptic('light'); if (currentFilterMode === 'weekly') activePeriodDate.setDate(activePeriodDate.getDate() - 7); else activePeriodDate.setMonth(activePeriodDate.getMonth() - 1); updateTimeNavUI(); };
    document.getElementById('nextPeriodBtn').onclick = () => { triggerHaptic('light'); if (currentFilterMode === 'weekly') activePeriodDate.setDate(activePeriodDate.getDate() + 7); else activePeriodDate.setMonth(activePeriodDate.getMonth() + 1); updateTimeNavUI(); };
    document.getElementById('weekPicker').onchange = (e) => { const d = getDateFromWeekString(e.target.value); if (d) { activePeriodDate = d; updateTimeNavUI(); } };
    document.getElementById('monthPicker').onchange = (e) => { const [y, m] = e.target.value.split('-').map(Number); activePeriodDate = new Date(y, m - 1, 1); updateTimeNavUI(); };
    document.getElementById('applyCustomBtn')?.addEventListener('click', () => { triggerHaptic('light'); const sm = parseInt(document.getElementById('startMonth').value, 10); const em = parseInt(document.getElementById('endMonth').value, 10); if (sm > em) { showToast("Tháng bắt đầu phải nhỏ hơn tháng kết thúc!", "error"); return; } loadCustomReport(sm, em, new Date().getFullYear()); });

    // ----- Nút xuất báo cáo -----
    document.getElementById('exportPdfBtn')?.addEventListener('click', exportToPDF);
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportToCSV);

    // ----- Chuyển đổi loại biểu đồ cột / đường -----
    const toggleChartBtn = document.getElementById('toggleChartBtn');
    if (toggleChartBtn) {
        window.currentChartType = localStorage.getItem('chartType') || 'bar';
        toggleChartBtn.onclick = () => {
            triggerHaptic('light');
            window.currentChartType = window.currentChartType === 'bar' ? 'line' : 'bar';
            localStorage.setItem('chartType', window.currentChartType);
            toggleChartBtn.innerHTML = window.currentChartType === 'bar' ? '<i class="fas fa-chart-line"></i>' : '<i class="fas fa-chart-column"></i>';
            updateTimeNavUI();
        };
        toggleChartBtn.innerHTML = window.currentChartType === 'bar' ? '<i class="fas fa-chart-line"></i>' : '<i class="fas fa-chart-column"></i>';
    }

    // ----- Định dạng số tiền khi nhập (hỗ trợ hậu tố K) -----
    ['addAmount', 'editAmount'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', (e) => { e.target.value = formatNumberWithCommas(e.target.value); });
    });

    // ----- Cài đặt (Tab 4) -----
    document.getElementById('settingTheme')?.addEventListener('change', (e) => { localStorage.setItem('settingTheme', e.target.value); applyTheme(e.target.value); });
    document.getElementById('settingDefaultTab')?.addEventListener('change', (e) => { localStorage.setItem('settingDefaultTab', e.target.value); });
    document.getElementById('settingStartOfWeek')?.addEventListener('change', (e) => { localStorage.setItem('settingStartOfWeek', e.target.value); if (document.getElementById('tab2').classList.contains('active')) updateTimeNavUI(); });
    document.getElementById('settingCurrencyFormat')?.addEventListener('change', (e) => { localStorage.setItem('settingCurrencyFormat', e.target.value); showToast("Đã đổi định dạng hiển thị!", "success"); });
    document.getElementById('settingPrivacyMode')?.addEventListener('change', (e) => { localStorage.setItem('settingPrivacyMode', e.target.checked ? '1' : '0'); applyPrivacyMode(); });
    document.getElementById('settingHaptic')?.addEventListener('change', (e) => { localStorage.setItem('settingHaptic', e.target.checked ? '1' : '0'); });

    // [ĐÃ ĐỔI] Backup sang Telegram/Sheet: chỉ chạy nếu có cấu hình apiUrl
    document.getElementById('backupTelegramBtn')?.addEventListener('click', async function() {
        triggerHaptic('medium');
        if (!apiUrl) { showToast("Chưa cấu hình Google Sheet để backup.", "error"); return; }
        showToast("Đang gửi yêu cầu backup...", "info");
        try {
            await fetch(proxyUrl + encodeURIComponent(apiUrl), { method: 'POST', body: JSON.stringify({ action: 'backup', chatId, sheetId }) });
            triggerHapticNotification('success');
            showToast("Đã gửi yêu cầu backup!", "success");
        } catch (e) { showToast(e.message, "error"); }
    });

    // [ĐÃ ĐỔI] Xóa toàn bộ dữ liệu theo chatId (đa người dùng)
    document.getElementById('hardResetBtn')?.addEventListener('click', function() {
        triggerHaptic('heavy');
        showCustomConfirm(
            '⚠️ Xóa toàn bộ dữ liệu',
            'Toàn bộ giao dịch, từ khóa và danh mục của bạn sẽ bị xóa vĩnh viễn. Bạn có chắc chắn không?',
            'Xóa tất cả',
            async () => {
                showToast("Đang xóa toàn bộ dữ liệu...", "info");
                try {
                    await Promise.all([
                        secureFetch(`/transactions/users/${chatId}.json`, 'DELETE'),
                        secureFetch(`/users/${chatId}/keywords.json`, 'DELETE'),
                        secureFetch(`/users/${chatId}/categoryIcons.json`, 'DELETE')
                    ]);
                    // Dọn cache cục bộ
                    cachedTransactions = null; cachedChartData = null; cachedSearchResults = [];
                    cachedKeywords = []; window.customCategoryIcons = {}; window.categoryIconMap = {}; window.apiTxCache = {};
                    triggerHapticNotification('success');
                    showToast("Đã xóa toàn bộ dữ liệu!", "success");
                    setTimeout(() => location.reload(), 1200);
                } catch (e) { showToast(e.message, "error"); }
            }
        );
    });

    // ----- Khởi tạo phiên đăng nhập an toàn -----
    try {
        if (!chatId) { showToast("Không lấy được thông tin Telegram. Hãy mở app từ Bot.", "error"); showLoading(false, 'tab1'); return; }

        // Lấy sheetId của người dùng (nếu đã cấu hình Google Sheet)
        try {
            const info = await fetch(`${workerUrl}/api/get_user_info?chatId=${chatId}`).then(r => r.json());
            if (info && info.sheetId) sheetId = info.sheetId;
        } catch (e) { /* không có sheet cũng không sao */ }

        // Tải từ khóa + danh mục trước (cần cho icon & dropdown)
        await loadKeywords(true);
        await initCategories(true);

        // Mở tab mặc định
        const defTab = localStorage.getItem('settingDefaultTab') || 'tab1';
        const defBtn = document.querySelector(`.nav-btn[onclick*="${defTab}"]`);
        openTab(defTab, defBtn);

        // Tải dữ liệu cho tab tương ứng
        if (defTab === 'tab2') updateTimeNavUI();
        else fetchTransactions(false);

        // Cấu hình nút menu của Mini App (nếu Telegram hỗ trợ)
        if (window.Telegram && Telegram.WebApp) { Telegram.WebApp.ready(); Telegram.WebApp.expand(); }
    } catch (e) {
        showToast("Lỗi khởi động: " + e.message, "error");
        showLoading(false, 'tab1');
    }
});
