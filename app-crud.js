// =====================================================================
// PHẦN 3/5: TÌM KIẾM + TỪ KHÓA + MODALS & CRUD (submitTx / deleteTransaction)
// =====================================================================

// ---------------- TÌM KIẾM MODAL ----------------
window.openSearchModal = function() { triggerHaptic('light'); document.getElementById('modalOverlay').classList.add('show'); setTimeout(() => document.getElementById('searchModal').classList.add('show'), 10); };
window.closeSearchModal = function() { triggerHaptic('light'); document.getElementById('searchModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300); // R20-2: đóng modal Tìm kiếm -> nav highlight phải quay về tab đang hiển thị (trước đây kẹt ở "Tìm kiếm")
  try { if (typeof window.__syncNavToActiveTab === 'function') window.__syncNavToActiveTab(); } catch (e) {} };

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
// R28: CTA dưới trạng thái rỗng.
// - Tab1: mở form thêm giao dịch, điền sẵn NGÀY ĐANG XEM (không phải hôm nay).
// - Keywords: focus ô nhập từ khóa.
window.emptyAddTxPrefill = async function () {
  try { await window.openAddForm(); } catch (e) {}
  try {
    var v = document.getElementById('transactionDate');
    var addDate = document.getElementById('addDate');
    if (v && v.value && addDate) {
      addDate.value = v.value;
      if (typeof window.__syncDateDisplay === 'function') window.__syncDateDisplay('addDate', 'addDateDisplay');
    }
  } catch (e) {}
  triggerHaptic('light');
};
window.emptyFocusKeyword = function () {
  triggerHaptic('light');
  var inp = document.getElementById('keywordInput');
  if (inp) { try { inp.focus({ preventScroll: false }); } catch (e) { inp.focus(); } inp.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
};
window.closeAddForm = function() { document.getElementById('addModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300); };
window.openEditForm = async function(tx) { if(!tx) return; triggerHaptic('light'); document.getElementById('modalOverlay').classList.add('show'); setTimeout(() => document.getElementById('editModal').classList.add('show'), 10); const pills = document.querySelectorAll('#editModal .type-pill'); pills.forEach(p => { if(p.textContent.includes('Thu nhập')) p.innerHTML = '<i class="fas fa-hand-holding-dollar" style="margin-right: 5px;"></i>Thu nhập'; else if(p.textContent.includes('Chi tiêu')) p.innerHTML = '<i class="fas fa-money-bill-transfer" style="margin-right: 5px;"></i>Chi tiêu'; }); document.getElementById('editTransactionId').value = tx.id; document.getElementById('editContent').value = tx.content; document.getElementById('editAmount').value = formatNumberWithCommas(tx.amount.toString()); document.getElementById('editNote').value = tx.note || ''; const [d,m,y] = tx.date.split('/'); document.getElementById('editDate').value = `${y}-${m}-${d}`; pills.forEach(p => { if(tx.type === 'Thu nhập' && p.textContent.includes('Thu nhập')) p.click(); if(tx.type === 'Chi tiêu' && p.textContent.includes('Chi tiêu')) p.click(); }); const catSel = document.getElementById('editCategory'); catSel.innerHTML = ''; const cats = await fetchCategories(); cats.forEach(c => { const opt = new Option(c, c); if(c === tx.category) opt.selected = true; catSel.appendChild(opt); }); };
window.closeEditForm = function() { document.getElementById('editModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300); };
window.closeAllModals = function() { closeAddForm(); closeEditForm(); closeSearchModal(); closeDetailModal(); if (typeof window.closePeriodPicker === 'function') window.closePeriodPicker(); if (document.getElementById('iconPickerModal')) document.getElementById('iconPickerModal').classList.remove('show'); if (document.getElementById('pdfPreviewModal')) document.getElementById('pdfPreviewModal').classList.remove('show'); };

async function submitTx(tx) {
  try {
    showToast("Đang lưu giao dịch...", "info");
    if (tx.action === 'addTransaction') {
      let maxNum = 0;
      try {
        const allData = await secureFetch(`/transactions/users/${chatId}.json`);
        if (allData && typeof allData === 'object') {
          Object.values(allData).forEach(monthObj => {
            if (monthObj && typeof monthObj === 'object') {
              Object.values(monthObj).forEach(item => {
                if (item && item.id) { const mm = /^GD(\d+)$/.exec(String(item.id)); if (mm) { const nn = parseInt(mm[1], 10); if (nn > maxNum) maxNum = nn; } }
              });
            }
          });
        }
      } catch (e) {}
      tx.id = 'GD' + String(maxNum + 1).padStart(3, '0');
    }
    const month = parseInt(tx.date.split('/')[1], 10); const fbTx = { id: tx.id, date: tx.date, type: tx.type, content: tx.content, amount: tx.amount, category: tx.category, note: tx.note };
    if (tx.action === 'addTransaction') { if (cachedTransactions?.data) cachedTransactions.data.unshift(fbTx); } else { [cachedTransactions?.data, cachedChartData?.txs, cachedSearchResults].forEach(arr => { if (!arr) return; const idx = arr.findIndex(i => String(i.id) === String(tx.id)); if (idx !== -1) arr[idx] = { ...arr[idx], ...fbTx }; }); }
    if(document.getElementById('tab1').classList.contains('active')) displayTransactions(); else if(document.getElementById('tab2').classList.contains('active')) updateTimeNavUI(); else if(document.getElementById('tab3').classList.contains('active')) displaySearchResults();
    await secureFetch(`/transactions/users/${chatId}/month_${month}/${tx.id}.json`, 'PUT', { ...fbTx, _action: tx.action }); triggerHapticNotification('success'); showToast("Đã lưu giao dịch!", "success"); tab2NeedsReload = true; window.apiTxCache = {};
    return true; // R54: sheet nhập nhanh cần biết lưu thành công để dọn input nhập tiếp (caller cũ bỏ qua giá trị trả về nên không đổi hành vi).
  } catch(e) { showToast(e.message, "error"); return false; }
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


// ================= R54: NHẬP NHANH KIỂU TIN NHẮN =================
// Nhập một dòng chữ kiểu nhắn tin Telegram ("ăn trưa 50k") thành giao dịch.
// NGUYÊN TẮC: (1) parser là hàm thuần, test được độc lập; (2) không bao giờ
// lưu lặng — luôn qua bước xem trước để user xác nhận; (3) không tự bịa
// danh mục khi không khớp từ khóa; (4) số tiền mơ hồ thì báo lỗi, giữ lại
// nội dung đã gõ để sửa, không lưu.
// QUY TẮC SỐ TIỀN (ghi rõ để khỏi đoán mò):
// - Hậu tố: k/K/nghìn -> x1.000; tr/triệu -> x1.000.000; đ/₫ -> x1.
// - "1,5tr"/"1.5tr" -> 1.500.000 (dấu phân cách đơn + hậu tố = thập phân).
// - Nhóm 3 chữ số ("50.000", "50,000") -> số nguyên, có hậu tố thì nhân tiếp
//   ("2.500k" -> 2.500.000).
// - Số nguyên trần không hậu tố ("50") -> tính là đồng.
// - Thập phân không hậu tố ("1,5", "50.5") -> KHÔNG phải số tiền hợp lệ,
//   parser bỏ qua token đó; nếu không còn token nào thì báo lỗi.
// - Nhiều số: ưu tiên token mạnh đầu tiên (có hậu tố k/tr hoặc nhóm 3 chữ
//   số); nếu chỉ toàn số trần thì lấy SỐ CUỐI CÙNG ("mua 2 vé 100" -> 100).
// - Dấu "-" dính trước số ("-50k") được bỏ, vì chiều lấy theo loại.
// QUY TẮC LOẠI: "+" đầu dòng -> Thu nhập; "thu"/"thu nhập" đầu dòng ->
// Thu nhập (bỏ từ đánh dấu); "chi"/"chi tiêu" đầu dòng -> Chi tiêu (bỏ
// từ đánh dấu); "lương"/"nhận" đầu dòng -> Thu nhập NHƯNG giữ lại trong
// nội dung (vì đó là nội dung thật: "lương 15tr" -> nội dung "lương").
// Mặc định còn lại là Chi tiêu.
// QUY TẮC DANH MỤC: khớp chuỗi con trên chuỗi đã thường hoá (không dấu,
// không phân biệt hoa thường) với từ khóa của user; từ khóa dài nhất thắng.
// Không khớp -> danh mục để trống, preview bắt user chọn mới cho lưu.

function __qeNorm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');
}

// Trả về số đồng (số nguyên) hoặc null nếu token không phải số tiền hợp lệ.
function __qeParseNumberToken(numStr, suffix) {
  var mult = 1;
  if (suffix === 'k' || suffix === 'nghìn') mult = 1000;
  else if (suffix === 'tr' || suffix === 'triệu') mult = 1000000;
  var s = numStr;
  if (/^[.,]/.test(s) || /[.,]$/.test(s)) return null;
  if (/[.,]/.test(s)) {
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      var grouped = parseInt(s.replace(/[.,]/g, ''), 10);
      if (!grouped) return null;
      return grouped * mult;
    }
    var dm = /^(\d+)[.,](\d{1,2})$/.exec(s);
    if (dm && mult > 1) {
      var dec = Math.round(parseFloat(dm[1] + '.' + dm[2]) * mult);
      return dec > 0 ? dec : null;
    }
    return null;
  }
  var v = parseInt(s, 10);
  if (!v) return null;
  return v * mult;
}

// Tìm token số tiền trong text. Trả về { value, token, index } hoặc null.
// token là đúng đoạn cần cắt khỏi nội dung (khi hậu tố bị loại vì dính chữ
// sau, token chỉ còn phần số, để khỏi ăn mất chữ của từ sau).
function __qeFindAmount(text) {
  var re = /-?\d[\d.,]*\s*(nghìn|triệu|k|tr|đ|₫)?/gi;
  var lastBare = null, m;
  while ((m = re.exec(text)) !== null) {
    var raw = m[0];
    var numMatch = /-?[\d.,]+/.exec(raw);
    var numPart = numMatch[0];
    var sufRaw = raw.slice(numPart.length).trim().toLowerCase();
    var after = text.charAt(m.index + raw.length);
    var suffix = sufRaw;
    var token = raw;
    // Hậu tố 1-2 chữ mà dính ngay vào chữ sau ("50 trà sữa" -> "50 tr")
    // thì không phải hậu tố: loại hậu tố, token chỉ còn phần số.
    if ((suffix === 'k' || suffix === 'tr' || suffix === 'đ') && /[a-zà-ỹ]/i.test(after)) {
      suffix = '';
      token = numPart;
    }
    var numDigits = numPart.charAt(0) === '-' ? numPart.slice(1) : numPart;
    var val = __qeParseNumberToken(numDigits, suffix);
    if (val === null) continue;
    var strong = (suffix === 'k' || suffix === 'nghìn' || suffix === 'tr' || suffix === 'triệu')
      || /^\d{1,3}([.,]\d{3})+$/.test(numDigits);
    var cand = { value: val, token: token, index: m.index };
    if (strong) return cand;
    lastBare = cand;
  }
  return lastBare;
}

function __qeDetectType(text) {
  var t = text.trim();
  if (t.charAt(0) === '+') return { type: 'Thu nhập', rest: t.slice(1).trim() };
  var m = /^(thu nhập|thu|chi tiêu|chi)(?=\s|:|$)\s*:?\s*/i.exec(t);
  if (m) {
    var w = m[1].toLowerCase();
    return { type: (w === 'thu' || w === 'thu nhập') ? 'Thu nhập' : 'Chi tiêu', rest: t.slice(m[0].length) };
  }
  if (/^(luong|nhan)\b/.test(__qeNorm(t))) return { type: 'Thu nhập', rest: t };
  return { type: 'Chi tiêu', rest: t };
}

function __qeMatchCategory(content, entries) {
  var norm = __qeNorm(content);
  if (!norm) return '';
  var best = '', bestLen = 0;
  (entries || []).forEach(function (e) {
    if (!e || !e.category) return;
    var kws = (e.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean);
    kws.forEach(function (kw) {
      var nk = __qeNorm(kw);
      if (nk && norm.indexOf(nk) !== -1 && nk.length > bestLen) { best = e.category.trim(); bestLen = nk.length; }
    });
  });
  return best;
}

// Hàm thuần chính. entries: mảng { category, keywords } từ keywords.json.
// Trả về { ok: true, amount, type, category, content, date } hoặc
// { ok: false, error }.
function parseQuickMessage(text, entries) {
  var raw = (text || '').trim().replace(/\s+/g, ' ');
  if (!raw) return { ok: false, error: 'Chưa nhập nội dung' };
  var det = __qeDetectType(raw);
  var work = det.rest;
  var amt = __qeFindAmount(work);
  if (!amt) return { ok: false, error: 'Chưa thấy số tiền trong tin nhắn' };
  var content = (work.slice(0, amt.index) + work.slice(amt.index + amt.token.length)).replace(/\s+/g, ' ').trim();
  content = content.replace(/\s+-\s*$/, '').replace(/^\s*-\s+/, '').trim();
  var category = __qeMatchCategory(content, entries);
  if (!content && category) content = category;
  return { ok: true, amount: amt.value, type: det.type, category: category, content: content, date: formatDateToDDMMYYYY(new Date()) };
}

// ---- Lớp giao diện R55: khung chat nhập hàng loạt (thay sheet xem trước từng dòng của R54) ----
// Parser phía trên giữ nguyên R54, không đổi quy tắc. Nguyên tắc R55: gửi tin
// KHÔNG BAO GIỜ mở modal chặn luồng; mỗi tin hiện ngay trong thread kèm dòng
// phân tích gọn; xem trước TỔNG duy nhất một lần rồi "Lưu tất cả" ghi tuần tự
// qua submitTx. Dòng chưa hợp lệ không bị mất — vẫn giữ trong thread để sửa.

var __qeThread = [];
var __qeNextId = 1;
var __qeCatCache = null;
var __qePreviewOpen = false;
var __qeSaving = false;

// --- Logic thuần (không chạm DOM) — test được trong VM ---
function __qeNewMessage(text, entries) {
  var r = parseQuickMessage(text, entries);
  var m = { id: __qeNextId++, text: text, editing: false, saveError: false };
  if (r.ok) { m.ok = true; m.error = ''; m.amount = r.amount; m.type = r.type; m.category = r.category; m.content = r.content; m.date = r.date; }
  else { m.ok = false; m.error = r.error; m.amount = 0; m.type = 'Chi tiêu'; m.category = ''; m.content = ''; m.date = formatDateToDDMMYYYY(new Date()); }
  return m;
}
function __qeAddMessage(text, entries) { var m = __qeNewMessage(text, entries); __qeThread.push(m); return m; }
function __qeValid(m) { return !!(m.ok && m.amount > 0 && m.content && m.category); }
function __qeCounts() {
  var v = 0;
  __qeThread.forEach(function (m) { if (__qeValid(m)) v++; });
  return { total: __qeThread.length, valid: v, invalid: __qeThread.length - v };
}
function __qeRemoveMessage(id) { __qeThread = __qeThread.filter(function (m) { return m.id !== id; }); }
function __qeBuildTx(m) { return { content: m.content, amount: m.amount, type: m.type, category: m.category, note: '', date: m.date, action: 'addTransaction' }; }
function __qeReparseMessage(m, entries) {
  var r = parseQuickMessage(m.text, entries);
  if (r.ok) { m.ok = true; m.error = ''; m.amount = r.amount; m.type = r.type; m.category = r.category; m.content = r.content; m.date = r.date; }
  else { m.ok = false; m.error = r.error; m.amount = 0; m.category = ''; m.content = ''; }
  m.saveError = false;
  return m;
}

// --- Lớp DOM ---
function __qeAmtText(amount) {
  if (typeof isPrivacyActive !== 'undefined' && isPrivacyActive) return '***';
  return formatNumberWithCommas(String(amount)) + ' ₫';
}
function __qeCatOptions(selected) {
  var opts = '<option value="">— Chọn danh mục —</option>';
  (__qeCatCache || []).forEach(function (c) {
    opts += '<option value="' + escapeHTML(c) + '"' + (c === selected ? ' selected' : '') + '>' + escapeHTML(c) + '</option>';
  });
  return opts;
}
function __qeEnsureCats() {
  if (__qeCatCache) return;
  try {
    fetchCategories().then(function (cats) {
      __qeCatCache = cats || [];
      if (!__qeThread.some(function (m) { return m.editing; })) {
        __qeRenderThread();
        if (__qePreviewOpen) __qeRenderPreview();
      }
    });
  } catch (e) {}
}
function __qeParseLine(m) {
  if (!m.ok) return '<div class="qe-parseline qe-flag">⚠ ' + escapeHTML(m.error) + '</div>';
  var line = escapeHTML(m.type) + ' · ' + __qeAmtText(m.amount) + (m.category ? ' · ' + escapeHTML(m.category) : '') + (m.content ? ' · ' + escapeHTML(m.content) : '');
  var flag = '';
  if (!m.category) flag = '<div class="qe-parseline qe-flag">⚠ Chưa có danh mục — chọn bên dưới để lưu được.</div>';
  if (m.saveError) flag += '<div class="qe-parseline qe-flag">⚠ Lưu lỗi — vẫn giữ trong khung chat, bấm Lưu tất cả để thử lại.</div>';
  return '<div class="qe-parseline">' + line + '</div>' + flag;
}
function __qeRenderMsg(m) {
  var bubble;
  if (m.editing) {
    bubble = '<div class="qe-bubble-edit"><input type="text" id="qeEditInput_' + m.id + '" class="field-input" style="margin:0;" value="' + escapeHTML(m.text) + '">'
      + '<div style="display:flex;gap:8px;margin-top:8px;"><button type="button" class="btn-save flex-1 m-0" onclick="quickEntrySaveEdit(' + m.id + ')">Lưu sửa</button>'
      + '<button type="button" class="btn-cancel flex-1 m-0" onclick="quickEntryCancelEdit(' + m.id + ')">Hủy</button></div></div>';
  } else {
    bubble = '<div class="qe-bubble">' + escapeHTML(m.text) + '</div>'
      + '<div class="qe-msg-actions"><button type="button" onclick="quickEntryEditMsg(' + m.id + ')">Sửa</button>'
      + '<button type="button" onclick="quickEntryRemoveMsg(' + m.id + ')">✕ Xóa</button></div>';
  }
  var catSel = '';
  if (m.ok && !m.category) {
    catSel = '<select class="field-input qe-cat-select" onchange="quickEntrySetMsgCategory(' + m.id + ', this.value)">' + __qeCatOptions('') + '</select>';
  }
  return '<div class="qe-msg">' + bubble + __qeParseLine(m) + catSel + '</div>';
}
function __qeRenderThread() {
  var th = document.getElementById('quickEntryThread'); if (!th) return;
  var btn = document.getElementById('quickEntryPreviewBtn');
  if (btn) btn.textContent = 'Xem trước (' + __qeThread.length + ')';
  if (!__qeThread.length) {
    th.innerHTML = '<div class="qe-empty">Gõ tin nhắn như chat Telegram — ví dụ: ăn trưa 50k.<br>Gửi nhiều dòng liên tiếp, xem trước một lần rồi Lưu tất cả.</div>';
    return;
  }
  th.innerHTML = __qeThread.map(__qeRenderMsg).join('');
  th.scrollTop = th.scrollHeight;
}

window.openQuickEntry = function () {
  try { triggerHaptic('light'); } catch (e) {}
  __qePreviewOpen = false;
  var tv = document.getElementById('quickEntryThreadView'); if (tv) tv.style.display = 'flex';
  var pv = document.getElementById('quickEntryPreviewView'); if (pv) pv.style.display = 'none';
  var ov = document.getElementById('modalOverlay'); if (ov) ov.classList.add('show');
  setTimeout(function () { var s = document.getElementById('quickEntryModal'); if (s) s.classList.add('show'); }, 10);
  __qeRenderThread();
  var inp = document.getElementById('quickEntryInput'); if (inp) setTimeout(function () { inp.focus(); }, 350);
};

window.closeQuickEntry = function (force) {
  if (!force && __qeThread.length) {
    showCustomConfirm('Đóng khung nhập nhanh',
      'Còn <strong>' + __qeThread.length + ' dòng</strong> chưa lưu, đóng sẽ mất. Bạn có muốn đóng không?',
      'Đóng', function () { window.closeQuickEntry(true); });
    return;
  }
  __qeThread = []; __qePreviewOpen = false; __qeSaving = false;
  var tv = document.getElementById('quickEntryThreadView'); if (tv) tv.style.display = 'flex';
  var pv = document.getElementById('quickEntryPreviewView'); if (pv) pv.style.display = 'none';
  var s = document.getElementById('quickEntryModal'); if (s) s.classList.remove('show');
  setTimeout(function () { var ov = document.getElementById('modalOverlay'); if (ov) ov.classList.remove('show'); }, 300);
  var inp = document.getElementById('quickEntryInput'); if (inp) inp.value = '';
};

// Đóng sheet nhập nhanh cùng mọi modal khác (nút overlay gọi closeAllModals).
(function () {
  var prevCloseAllModals = window.closeAllModals;
  window.closeAllModals = function () {
    try { if (typeof prevCloseAllModals === 'function') prevCloseAllModals(); } catch (e) {}
    try { window.closeQuickEntry(); } catch (e) {}
  };
})();

async function __qeLoadKeywordEntries() {
  try {
    if (cachedKeywords && cachedKeywords.length) return cachedKeywords;
    if (typeof window.loadKeywords === 'function') { await window.loadKeywords(true); return cachedKeywords || []; }
  } catch (e) {}
  return [];
}

// Gửi 1 tin: KHÔNG mở modal, chỉ thêm vào thread và dọn ô gõ để nhập tiếp.
window.quickEntrySend = async function () {
  var inp = document.getElementById('quickEntryInput');
  var text = inp ? inp.value.trim() : '';
  if (!text) return;
  var entries = await __qeLoadKeywordEntries();
  __qeAddMessage(text, entries);
  if (inp) inp.value = '';
  __qeRenderThread();
  __qeEnsureCats();
  if (inp) inp.focus();
};

window.quickEntryRemoveMsg = function (id) {
  __qeRemoveMessage(id);
  __qeRenderThread();
};
window.quickEntrySetMsgCategory = function (id, category) {
  var m = null;
  __qeThread.forEach(function (x) { if (x.id === id) m = x; });
  if (m) { m.category = category; m.saveError = false; }
  __qeRenderThread();
};
window.quickEntryEditMsg = function (id) {
  __qeThread.forEach(function (m) { m.editing = (m.id === id); });
  __qeRenderThread();
  var el = document.getElementById('qeEditInput_' + id);
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
};
window.quickEntryCancelEdit = function (id) {
  __qeThread.forEach(function (m) { if (m.id === id) m.editing = false; });
  __qeRenderThread();
};
window.quickEntrySaveEdit = async function (id) {
  var el = document.getElementById('qeEditInput_' + id);
  var m = null;
  __qeThread.forEach(function (x) { if (x.id === id) m = x; });
  if (!m) return;
  var text = el ? el.value.trim() : '';
  if (text) m.text = text;
  m.editing = false;
  var entries = await __qeLoadKeywordEntries();
  __qeReparseMessage(m, entries);
  __qeRenderThread();
  __qeEnsureCats();
};

// --- Xem trước TỔNG duy nhất ---
function __qeRenderPreview() {
  var list = document.getElementById('quickEntryPreviewList'); if (!list) return;
  var btn = document.getElementById('quickEntrySaveAllBtn');
  var c = __qeCounts();
  if (btn) btn.textContent = 'Lưu tất cả (' + c.valid + ')';
  var prog = document.getElementById('quickEntrySaveProgress'); if (prog) prog.textContent = '';
  if (!__qeThread.length) { list.innerHTML = '<div class="qe-empty">Chưa có dòng nào.</div>'; return; }
  list.innerHTML = __qeThread.map(function (m) {
    var flag = '';
    if (!m.ok) flag = '<div class="qe-flag">⚠ ' + escapeHTML(m.error) + ' — dòng này sẽ không được lưu.</div>';
    else if (!m.category) flag = '<div class="qe-flag">⚠ Chưa có danh mục — chọn danh mục để lưu được.</div>';
    else if (!m.content) flag = '<div class="qe-flag">⚠ Chưa có nội dung — sửa nội dung để lưu được.</div>';
    else if (m.saveError) flag = '<div class="qe-flag">⚠ Lần lưu trước bị lỗi.</div>';
    return '<div class="qe-pv-row">'
      + '<div class="qe-pv-head"><div class="type-row" style="margin:0;">'
      + '<div id="qpvTypeChi_' + m.id + '" class="type-pill' + (m.type === 'Chi tiêu' ? ' expense-active' : '') + '" onclick="quickEntryPreviewSetType(' + m.id + ', \'Chi tiêu\')">⬆ Chi tiêu</div>'
      + '<div id="qpvTypeThu_' + m.id + '" class="type-pill' + (m.type === 'Thu nhập' ? ' income-active' : '') + '" onclick="quickEntryPreviewSetType(' + m.id + ', \'Thu nhập\')">⬇ Thu nhập</div>'
      + '</div><button type="button" class="qe-x" onclick="quickEntryPreviewRemove(' + m.id + ')">✕</button></div>'
      + '<div class="field-group" style="margin-bottom:8px;"><div class="field-label">Số tiền</div>'
      + '<input type="text" id="qpvAmt_' + m.id + '" class="field-input" oninput="quickEntryPreviewTouch()" value="' + escapeHTML(m.amount ? formatNumberWithCommas(String(m.amount)) : '') + '"></div>'
      + '<div class="field-group" style="margin-bottom:8px;"><div class="field-label">Nội dung</div>'
      + '<input type="text" id="qpvCon_' + m.id + '" class="field-input" oninput="quickEntryPreviewTouch()" value="' + escapeHTML(m.content) + '"></div>'
      + '<div class="field-group" style="margin-bottom:0;"><div class="field-label">Danh mục</div>'
      + '<select id="qpvCat_' + m.id + '" class="field-input" onchange="quickEntryPreviewSetCategory(' + m.id + ', this.value)">' + __qeCatOptions(m.category) + '</select></div>'
      + '<div style="font-size:12px;color:var(--text-2);margin-top:6px;">Tin gốc: ' + escapeHTML(m.text) + '</div>'
      + flag + '</div>';
  }).join('');
}
window.quickEntryShowPreview = function () {
  if (!__qeThread.length) return;
  __qePreviewOpen = true;
  var tv = document.getElementById('quickEntryThreadView'); if (tv) tv.style.display = 'none';
  var pv = document.getElementById('quickEntryPreviewView'); if (pv) pv.style.display = 'flex';
  __qeEnsureCats();
  __qeRenderPreview();
};
window.quickEntryBackToThread = function () {
  __qeSyncPreviewToThread();
  __qePreviewOpen = false;
  var pv = document.getElementById('quickEntryPreviewView'); if (pv) pv.style.display = 'none';
  var tv = document.getElementById('quickEntryThreadView'); if (tv) tv.style.display = 'flex';
  __qeRenderThread();
};
window.quickEntryPreviewSetType = function (id, type) {
  var m = null;
  __qeThread.forEach(function (x) { if (x.id === id) m = x; });
  if (!m) return;
  m.type = type; m.saveError = false;
  ['Chi tiêu', 'Thu nhập'].forEach(function (t) {
    var el = document.getElementById(t === 'Chi tiêu' ? 'qpvTypeChi_' + id : 'qpvTypeThu_' + id);
    if (!el) return;
    el.classList.remove('expense-active', 'income-active');
    if (t === type) el.classList.add(t === 'Chi tiêu' ? 'expense-active' : 'income-active');
  });
};
window.quickEntryPreviewSetCategory = function (id, category) {
  __qeThread.forEach(function (m) { if (m.id === id) { m.category = category; m.saveError = false; } });
  window.quickEntryPreviewTouch();
};
// Đồng bộ input xem trước vào thread rồi cập nhật nhãn nút Lưu tất cả.
window.quickEntryPreviewTouch = function () {
  __qeSyncPreviewToThread();
  var btn = document.getElementById('quickEntrySaveAllBtn');
  if (btn) btn.textContent = 'Lưu tất cả (' + __qeCounts().valid + ')';
};
window.quickEntryPreviewRemove = function (id) {
  __qeSyncPreviewToThread();
  __qeRemoveMessage(id);
  if (!__qeThread.length) { window.quickEntryBackToThread(); return; }
  __qeRenderPreview();
};
function __qeSyncPreviewToThread() {
  __qeThread.forEach(function (m) {
    var a = document.getElementById('qpvAmt_' + m.id);
    var c = document.getElementById('qpvCon_' + m.id);
    var s = document.getElementById('qpvCat_' + m.id);
    if (a) { try { m.amount = parseNumber(a.value) || 0; } catch (e) {} }
    if (c) m.content = c.value.trim();
    if (s) m.category = s.value;
  });
}

// Lưu tất cả: ghi TUẦN TỰ (cấp id toàn cục bắt buộc tuần tự, không song song).
window.quickEntrySaveAll = async function () {
  if (__qeSaving) return;
  __qeSyncPreviewToThread();
  var rows = __qeThread.filter(__qeValid);
  if (!rows.length) { try { showToast('Chưa có dòng hợp lệ để lưu', 'info'); } catch (e) {} return; }
  __qeSaving = true;
  var btn = document.getElementById('quickEntrySaveAllBtn'); if (btn) btn.disabled = true;
  var prog = document.getElementById('quickEntrySaveProgress');
  var saved = 0, failed = 0;
  for (var i = 0; i < rows.length; i++) {
    if (prog) prog.textContent = 'Đang lưu ' + (i + 1) + '/' + rows.length + '…';
    var ok = false;
    try { ok = await submitTx(__qeBuildTx(rows[i])); } catch (e) { ok = false; }
    if (ok) { saved++; rows[i]._saved = true; } else { failed++; rows[i].saveError = true; }
  }
  __qeThread = __qeThread.filter(function (m) { return !m._saved; });
  __qeThread.forEach(function (m) { delete m._saved; });
  __qeSaving = false; if (btn) btn.disabled = false;
  var c = __qeCounts();
  try {
    showToast('Đã lưu ' + saved + ' dòng'
      + (failed ? ', lỗi ' + failed + ' dòng (vẫn giữ trong khung chat)' : '')
      + (c.invalid ? ', còn ' + c.invalid + ' dòng chưa hợp lệ' : ''),
      failed ? 'error' : 'success');
  } catch (e) {}
  __qePreviewOpen = false;
  var pv = document.getElementById('quickEntryPreviewView'); if (pv) pv.style.display = 'none';
  var tv = document.getElementById('quickEntryThreadView'); if (tv) tv.style.display = 'flex';
  __qeRenderThread();
};

// Hook cho test Node (không ảnh hưởng hành vi production).
window.__quickEntryTest = {
  parseQuickMessage: parseQuickMessage,
  __qeParseNumberToken: __qeParseNumberToken,
  __qeFindAmount: __qeFindAmount,
  __qeDetectType: __qeDetectType,
  __qeMatchCategory: __qeMatchCategory,
  addMessage: __qeAddMessage,
  reparseMessage: __qeReparseMessage,
  removeMessage: __qeRemoveMessage,
  buildTx: __qeBuildTx,
  isValid: __qeValid,
  counts: __qeCounts,
  getThread: function () { return __qeThread; },
  clearThread: function () { __qeThread = []; __qeNextId = 1; },
};

// ================= END R54 =================
