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

async function submitTx(tx, opts) {
  // R58: opts.quiet tắt toast + haptic từng dòng — dùng cho lưu hàng loạt
  // trong khung chat (chỉ giữ tiến trình + tổng kết của khung chat). Form
  // thường gọi không opts nên giữ nguyên toast/haptic cũ.
  var quiet = !!(opts && opts.quiet);
  try {
    if (!quiet) showToast("Đang lưu giao dịch...", "info");
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
    await secureFetch(`/transactions/users/${chatId}/month_${month}/${tx.id}.json`, 'PUT', { ...fbTx, _action: tx.action }); if (!quiet) { triggerHapticNotification('success'); showToast("Đã lưu giao dịch!", "success"); } tab2NeedsReload = true; window.apiTxCache = {};
    return true; // R54: sheet nhập nhanh cần biết lưu thành công để dọn input nhập tiếp (caller cũ bỏ qua giá trị trả về nên không đổi hành vi).
  } catch(e) { if (!quiet) showToast(e.message, "error"); return false; }
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
// QUY TẮC DANH MỤC (R60 — ĐÚNG LUẬT WEBHOOK Worker v3.1, sửa sai R54):
// chỉ lowercase, GIỮ NGUYÊN dấu (R54 strip dấu nên "sữa" thành "sua" =
// "sửa", làm "sữa chua" bị nhận nhầm thành "Dịch vụ sửa chữa"); từ khóa
// phải khớp nguyên cụm từ với ranh giới từ (?:^|\s)kw(?:\s|$) như webhook;
// điểm = số từ của từ khóa, điểm cao thắng, hòa thì từ khóa gặp trước thắng.
// Không khớp -> danh mục để trống, khung chat bắt user chọn mới cho lưu.

function __qeNorm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd');
}

// Trả về số đồng (số nguyên) hoặc null nếu token không phải số tiền hợp lệ.
function __qeParseNumberToken(numStr, suffix) {
  var mult = 1;
  if (suffix === 'k' || suffix === 'nghìn') mult = 1000;
  else if (suffix === 'tr' || suffix === 'triệu') mult = 1000000;
  else if (suffix === 'm') mult = 1000000;
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
  // R58: hậu tố m/M = triệu như bot (vd "15m" = 15.000.000; dạng XmY
  // "1m5" = 1,5 triệu; "1,5m"/"1.5m" qua đường thập phân sẵn có).
  var re = /-?(?:\d+m\d+|\d[\d.,]*\s*(nghìn|triệu|k|tr|m|đ|₫)?)/gi;
  var lastBare = null, m;
  while ((m = re.exec(text)) !== null) {
    var raw = m[0];
    var after = text.charAt(m.index + raw.length);
    var afterNext = text.charAt(m.index + raw.length + 1);
    // Dạng XmY của bot: token phải đứng riêng — sau nó không được là
    // chữ/số, cũng không được là dấu . , rồi tới số (để khỏi ăn mất
    // phần thập phân của số khác). Không đạt thì bỏ qua token này.
    var xm = /^(-?)(\d+)m(\d+)$/i.exec(raw);
    if (xm) {
      if (/[a-zà-ỹ0-9]/i.test(after) || ((after === '.' || after === ',') && /[0-9]/.test(afterNext))) continue;
      var xv = parseFloat(xm[2] + '.' + xm[3]) * 1000000;
      if (xv > 0) return { value: Math.round(xv), token: raw, index: m.index };
      continue;
    }
    var numMatch = /-?[\d.,]+/.exec(raw);
    var numPart = numMatch[0];
    var sufRaw = raw.slice(numPart.length).trim().toLowerCase();
    var suffix = sufRaw;
    var token = raw;
    // Hậu tố 1-2 chữ mà dính ngay vào chữ sau ("50 trà sữa" -> "50 tr",
    // "15mua" -> "15 m") thì không phải hậu tố: loại hậu tố, token chỉ
    // còn phần số.
    if ((suffix === 'k' || suffix === 'tr' || suffix === 'm' || suffix === 'đ') && /[a-zà-ỹ]/i.test(after)) {
      suffix = '';
      token = numPart;
    }
    var numDigits = numPart.charAt(0) === '-' ? numPart.slice(1) : numPart;
    var val = __qeParseNumberToken(numDigits, suffix);
    if (val === null) continue;
    var strong = (suffix === 'k' || suffix === 'nghìn' || suffix === 'tr' || suffix === 'triệu' || suffix === 'm')
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

// R60: escape ký tự regex trong từ khóa, đúng như webhook làm
// (kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).
function __qeEscapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// R60: khớp danh mục đúng luật webhook — lowercase giữ dấu, ranh giới từ,
// điểm = số từ, cao thắng, hòa thì gặp trước thắng. Không khớp -> ''.
function __qeMatchCategory(content, entries) {
  var desc = (content || '').toLowerCase().trim();
  if (!desc) return '';
  var best = '', bestScore = 0;
  (entries || []).forEach(function (e) {
    if (!e || !e.category) return;
    var kws = (e.keywords || '').split(',').map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean);
    kws.forEach(function (kw) {
      var re = new RegExp('(?:^|\\s)' + __qeEscapeRegExp(kw) + '(?:\\s|$)', 'i');
      if (re.test(desc)) {
        var score = kw.split(/\s+/).length;
        if (score > bestScore) { best = e.category.trim(); bestScore = score; }
      }
    });
  });
  return best;
}

// Hàm thuần cho MỘT đoạn. entries: mảng { category, keywords }.
// Trả về { ok: true, amount, type, category, content, date } hoặc
// { ok: false, error }. dateStr: 'dd/mm/yyyy' (mặc định hôm nay).
function __qeParseSegment(seg, entries, dateStr) {
  var raw = (seg || '').trim().replace(/\s+/g, ' ');
  if (!raw) return { ok: false, error: 'Chưa nhập nội dung' };
  var det = __qeDetectType(raw);
  var work = det.rest;
  var amt = __qeFindAmount(work);
  if (!amt) return { ok: false, error: 'Chưa thấy số tiền trong tin nhắn' };
  var content = (work.slice(0, amt.index) + work.slice(amt.index + amt.token.length)).replace(/\s+/g, ' ').trim();
  content = content.replace(/\s+-\s*$/, '').replace(/^\s*-\s+/, '').trim();
  var category = __qeMatchCategory(content, entries);
  if (!content && category) content = category;
  // R57: viết hoa chữ cái đầu của nội dung như webhook làm với description
  // (description.charAt(0).toUpperCase() + description.slice(1)); chữ số /
  // ký tự đặc biệt ở đầu giữ nguyên; bong bóng tin vẫn giữ văn bản gốc.
  if (content) content = content.charAt(0).toUpperCase() + content.slice(1);
  return { ok: true, amount: amt.value, type: det.type, category: category, content: content, date: dateStr || formatDateToDDMMYYYY(new Date()) };
}

// Giữ tương thích R54: parse 1 đoạn duy nhất, ngày hôm nay.
function parseQuickMessage(text, entries) {
  return __qeParseSegment(text, entries, formatDateToDDMMYYYY(new Date()));
}

// R56: TÁCH TRƯỚC, rồi parse từng đoạn riêng — đúng luật bot trong file
// webhook (Cloudflare Worker v3.1): tách tin theo xuống dòng, rồi tách mỗi
// dòng theo /\.(?=\s|$)/ (chấm + khoảng trắng hoặc cuối chuỗi — nên
// "50.000" không bị tách, "50k ăn trưa.7k gửi xe" không bị tách vì chấm
// không kèm khoảng trắng). Đoạn mở đầu bằng dd/mm đặt ngày-context cho
// chính nó và các đoạn sau trong cùng tin (miniapp nới thêm: đoạn chỉ có
// ngày thì chỉ đặt context, không sinh khoản).
function __qeSplitMessage(text) {
  var segs = [];
  (text || '').split('\n').forEach(function (line) {
    line.split(/\.(?=\s|$)/).forEach(function (p) {
      var s = p.trim();
      if (s) segs.push(s);
    });
  });
  return segs;
}
function __qeParseMessageMulti(text, entries, defaultDate) {
  var segs = __qeSplitMessage(text);
  if (!segs.length) segs = [(text || '').trim()];
  var today = formatDateToDDMMYYYY(new Date());
  var base = defaultDate || today;
  var year = String(new Date().getFullYear());
  var ctxDate = null;
  var items = [];
  segs.forEach(function (seg) {
    var dm = /^(\d{1,2})\/(\d{1,2})(?:\s+(.*))?$/.exec(seg);
    if (dm) {
      var d = parseInt(dm[1], 10), mo = parseInt(dm[2], 10);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        ctxDate = String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0') + '/' + year;
        var rest = (dm[3] || '').trim();
        if (!rest) return; // đoạn chỉ có ngày: đặt context, không sinh khoản
        seg = rest;
      }
    }
    var r = __qeParseSegment(seg, entries, ctxDate || base);
    r.segment = seg;
    items.push(r);
  });
  if (!items.length) items.push({ ok: false, error: 'Chưa thấy số tiền trong tin nhắn', segment: (text || '').trim() });
  return items;
}

// ---- Lớp giao diện R55/R57: khung chat nhập hàng loạt (thay sheet xem trước từng dòng của R54) ----
// R56: mỗi tin nhắn tách thành N khoản (theo luật bot) — thread giữ nhóm tin,
// lưu chạy theo khoản. Parser từng đoạn giữ nguyên quy tắc R54.
// R57: BỎ hẳn màn xem trước tổng — thread CHÍNH LÀ bản xem trước; nút đầu
// là "Lưu (M)" ghi tuần tự qua submitTx. Dòng chưa hợp lệ không bị mất —
// vẫn giữ trong thread để sửa.
// Nguyên tắc R55: gửi tin
// KHÔNG BAO GIỜ mở modal chặn luồng; mỗi tin hiện ngay trong thread kèm dòng
// phân tích gọn; dòng chưa hợp lệ không bị mất — vẫn giữ trong thread để sửa.

var __qeThread = [];
var __qeNextId = 1;
var __qeNextItemId = 1;
var __qeCatCache = null;
var __qeSaving = false;
// R59: KHÔNG còn ngày tham chiếu phiên chat — chip R57 đã bị gỡ vì sai.
// Webhook (Worker v3.1) khởi tạo contextDate = hôm nay trong TỪNG message
// handler, nên mỗi tin nhắn mới đều bắt đầu ở hôm nay; ngày chỉ lan sang
// các đoạn SAU trong CÙNG tin (luật R56). Không có state ngày nào sống
// qua ranh giới tin nhắn.
var __qeNotices = [];

// --- Logic thuần (không chạm DOM) — test được trong VM ---
// R56: mỗi tin nhắn là một NHÓM chứa N khoản (items) sau khi tách.
// Item: { id, segment, ok, error, amount, type, category, content, date, saveError }.
function __qeNewMessage(text, entries) {
  var m = { id: __qeNextId++, text: text, editing: false, items: [] };
  // R59: mỗi tin nhắn mới bắt đầu ngày-context ở HÔM NAY — đúng webhook,
  // bất kể tin trước đó mang ngày nào. Ngày chỉ lan trong cùng tin (R56).
  var base = formatDateToDDMMYYYY(new Date());
  __qeParseMessageMulti(text, entries, base).forEach(function (r) {
    m.items.push({ id: __qeNextItemId++, segment: r.segment || text, ok: !!r.ok, error: r.error || '', amount: r.ok ? r.amount : 0, type: r.ok ? r.type : 'Chi tiêu', category: r.ok ? r.category : '', content: r.ok ? r.content : '', date: r.ok ? r.date : base, saveError: false });
  });
  return m;
}
function __qeAddMessage(text, entries) { var m = __qeNewMessage(text, entries); __qeThread.push(m); return m; }
function __qeValid(it) { return !!(it.ok && it.amount > 0 && it.content && it.category); }
function __qeFlatItems() { var out = []; __qeThread.forEach(function (m) { m.items.forEach(function (it) { out.push(it); }); }); return out; }
function __qeCounts() {
  var items = __qeFlatItems(), v = 0;
  items.forEach(function (it) { if (__qeValid(it)) v++; });
  return { total: items.length, valid: v, invalid: items.length - v };
}
function __qeFindItem(id) { var found = null; __qeThread.forEach(function (m) { m.items.forEach(function (it) { if (it.id === id) found = it; }); }); return found; }
function __qeRemoveMessage(id) { __qeThread = __qeThread.filter(function (m) { return m.id !== id; }); }
function __qeRemoveItem(id) {
  __qeThread.forEach(function (m) { m.items = m.items.filter(function (it) { return it.id !== id; }); });
  __qeThread = __qeThread.filter(function (m) { return m.items.length; });
}
function __qeBuildTx(it) { return { content: it.content, amount: it.amount, type: it.type, category: it.category, note: '', date: it.date, action: 'addTransaction' }; }
function __qeReparseMessage(m, entries) {
  var fresh = __qeNewMessage(m.text, entries);
  m.items = fresh.items;
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
      }
    });
  } catch (e) {}
}
function __qeParseLine(it) {
  if (!it.ok) return '<div class="qe-parseline qe-flag">⚠ ' + escapeHTML(it.error) + '</div>';
  var today = formatDateToDDMMYYYY(new Date());
  var line = escapeHTML(it.type) + ' · ' + __qeAmtText(it.amount) + (it.category ? ' · ' + escapeHTML(it.category) : '') + (it.content ? ' · ' + escapeHTML(it.content) : '') + (it.date !== today ? ' · ' + escapeHTML(it.date) : '');
  var flag = '';
  if (!it.category) flag = '<div class="qe-parseline qe-flag">⚠ Chưa có danh mục — chọn bên dưới để lưu được.</div>';
  if (it.saveError) flag += '<div class="qe-parseline qe-flag">⚠ Lưu lỗi — vẫn giữ trong khung chat, bấm Lưu tất cả để thử lại.</div>';
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
  var body = '';
  m.items.forEach(function (it) {
    body += __qeParseLine(it);
    if (it.ok && !it.category) {
      body += '<select class="field-input qe-cat-select" onchange="quickEntrySetMsgCategory(' + it.id + ', this.value)">' + __qeCatOptions('') + '</select>';
    }
  });
  return '<div class="qe-msg">' + bubble + body + '</div>';
}
function __qeRenderThread() {
  var th = document.getElementById('quickEntryThread'); if (!th) return;
  // R57: thread CHÍNH LÀ bản xem trước — nút đầu là Lưu, đếm khoản HỢP LỆ.
  // R59: nút Lưu giữ trạng thái khóa trong lúc đang lưu (đề phòng render
  // chen ngang khi fetch danh mục xong) — chống bấm đúp.
  var btn = document.getElementById('quickEntrySaveBtn');
  var c0 = __qeCounts();
  if (btn) { btn.textContent = 'Lưu (' + c0.valid + ')'; btn.disabled = __qeSaving || c0.valid === 0; }
  // R59: dòng hệ thống (thông báo kết quả lưu kiểu webhook) luôn vẽ sau
  // các tin nhắn, kể cả khi thread đã trống sau khi lưu xong.
  var notices = __qeNotices.map(function (n) { return '<div class="qe-system">' + escapeHTML(n) + '</div>'; }).join('');
  if (!__qeThread.length) {
    th.innerHTML = '<div class="qe-empty">Gõ tin nhắn như chat Telegram — ví dụ: ăn trưa 50k.<br>Một tin có thể chứa nhiều khoản, ngăn cách bằng dấu chấm — ví dụ: 50k ăn trưa. 7k gửi xe.<br>Gửi nhiều dòng liên tiếp rồi bấm Lưu để lưu tất cả.</div>' + notices;
    return;
  }
  th.innerHTML = __qeThread.map(__qeRenderMsg).join('') + notices;
  th.scrollTop = th.scrollHeight;
}

window.openQuickEntry = function () {
  try { triggerHaptic('light'); } catch (e) {}
  var tv = document.getElementById('quickEntryThreadView'); if (tv) tv.style.display = 'flex';
  var ov = document.getElementById('modalOverlay'); if (ov) ov.classList.add('show');
  setTimeout(function () { var s = document.getElementById('quickEntryModal'); if (s) s.classList.add('show'); }, 10);
  __qeRenderThread();
  var inp = document.getElementById('quickEntryInput'); if (inp) setTimeout(function () { inp.focus(); }, 350);
};

window.closeQuickEntry = function (force) {
  var remaining = __qeCounts().total;
  if (!force && remaining) {
    showCustomConfirm('Đóng khung nhập nhanh',
      'Còn <strong>' + remaining + ' dòng</strong> chưa lưu, đóng sẽ mất. Bạn có muốn đóng không?',
      'Đóng', function () { window.closeQuickEntry(true); });
    return;
  }
  __qeThread = []; __qeSaving = false; __qeNotices = [];
  // R60: đóng khung cũng giấu popup lưu nếu còn hiện (phòng trường hợp
  // đóng bằng đường khác ngoài nút "Đã hiểu").
  try { var sp = document.getElementById('quickEntrySavePopup'); if (sp) sp.style.display = 'none'; } catch (e) {}
  // R58: vẽ lại thread sau khi dọn để DOM khớp dữ liệu (trước đây DOM cũ
  // vẫn còn cho tới lần mở sau, dù dữ liệu đã trống).
  try { __qeRenderThread(); } catch (e) {}
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
  var it = __qeFindItem(id);
  if (it) { it.category = category; it.saveError = false; }
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

// R60: popup lưu GIỮA MÀN HÌNH thay cho spin/đếm trong thread của R59
// (Hùng: "Spin lúc chờ lưu nó là show popup giữa màn hình chứ. Icon tick
// phải dạng flat."). Popup z-index 2500: trên sheet chat (2000) và overlay
// (1500), dưới trang fullscreen (3000) và sheet nhập CSV (3500); lớp phủ
// chặn tương tác trong lúc lưu nên không bấm đúp được. Xong: CÙNG popup
// chuyển sang tick FLAT (SVG 1 màu, không emoji, không gradient, không
// bóng) + "Đã lưu N giao dịch" (+ dòng lỗi/chưa hợp lệ nếu có) và ĐỨNG
// YÊN tới khi user bấm "Đã hiểu" — không tự tắt để khỏi giấu dòng lỗi.
// Popup này LÀ thông báo lưu nên dòng hệ thống trong thread của R59 bị gỡ
// để khỏi thông báo trùng 2 lần cho cùng 1 lần lưu (dòng lỗi/chưa hợp lệ
// vẫn giữ trong thread, gắn cờ như trước).
function __qeShowSavePopup() {
  var p = document.getElementById('quickEntrySavePopup'); if (!p) return;
  var ic = document.getElementById('quickEntrySavePopupIcon');
  var tx = document.getElementById('quickEntrySavePopupText');
  var btn = document.getElementById('quickEntrySavePopupBtn');
  if (ic) ic.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
  if (tx) tx.textContent = '';
  if (btn) btn.style.display = 'none';
  p.style.display = 'flex';
}
function __qeUpdateSavePopupCount(i, n) {
  var tx = document.getElementById('quickEntrySavePopupText');
  if (tx) tx.textContent = 'Đang lưu ' + i + '/' + n + '…';
}
function __qeShowSavePopupDone(saved, failed, invalid) {
  var p = document.getElementById('quickEntrySavePopup'); if (!p) return;
  var ic = document.getElementById('quickEntrySavePopupIcon');
  var tx = document.getElementById('quickEntrySavePopupText');
  var btn = document.getElementById('quickEntrySavePopupBtn');
  // Tick FLAT: SVG 1 màu #10B981, không emoji, không gradient, không bóng.
  if (ic) ic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" stroke="#10B981" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (tx) {
    var lines = [];
    if (saved > 0) lines.push('Đã lưu ' + saved + ' giao dịch');
    if (failed > 0) lines.push('⚠️ ' + failed + ' dòng lưu lỗi, vẫn giữ trong khung chat để sửa');
    if (invalid > 0) lines.push('⚠️ ' + invalid + ' dòng chưa hợp lệ chưa được lưu');
    tx.textContent = lines.join('\n');
  }
  if (btn) btn.style.display = 'block';
  p.style.display = 'flex';
}
window.quickEntryDismissSavePopup = function () {
  var p = document.getElementById('quickEntrySavePopup'); if (p) p.style.display = 'none';
};

// R60 (FIX 3): submitTx unshift khoản mới vào cache ngày Tab 1 đang hiển
// thị BẤT KỂ ngày thật của khoản — lưu khoản 27/10 trong khi Tab 1 đang ở
// 31/10 sẽ nhiễm cache ngày 31/10, chỉ load lại mới sạch (BUG Hùng báo).
// Sau khi lưu xong, lọc khỏi cache ngày đang hiển thị mọi khoản có ngày
// khác ngày đó; khoản cùng ngày giữ lại (đúng ngày, submitTx đã thêm
// đúng). Không đụng #transactionDate nên ngày hiển thị của Tab 1 không
// đổi. Chạy cả khi Tab 1 không phải tab đang mở (lúc quay lại Tab 1,
// openTab gọi fetchTransactions(false) đi đường cache nên cache đã lọc
// sẵn là đủ đúng). LƯU Ý: khoản lưu LỖI cùng ngày vẫn để lại "bóng ma"
// trong cache do submitTx unshift trước PUT và không rollback — đó là hành
// vi sẵn có của submitTx (form thêm lẻ cũng vậy), ngoài phạm vi R60.
function __qePurgeWrongDateFromTab1Cache() {
  try {
    var ct = (typeof cachedTransactions !== 'undefined') ? cachedTransactions : null;
    if (!ct || !ct.cacheKey || !Array.isArray(ct.data)) return;
    var ck = ct.cacheKey;
    var keep = function (t) { return !t || !t.date || t.date === ck; };
    ct.data = ct.data.filter(keep);
    // dayTxCache thường giữ cùng object, nhưng lọc luôn nếu là object khác.
    if (typeof window !== 'undefined' && window.dayTxCache && window.dayTxCache[ck] && window.dayTxCache[ck] !== ct && Array.isArray(window.dayTxCache[ck].data)) {
      window.dayTxCache[ck].data = window.dayTxCache[ck].data.filter(keep);
    }
  } catch (e) {}
}

// R57: Lưu từ thread (không còn màn xem trước tổng). Ghi TUẦN TỰ các
// khoản hợp lệ (cấp id toàn cục bắt buộc tuần tự, không song song).
// R59: nút Lưu khóa chống bấm đúp; KHÔNG toast tổng kết.
// R60: tiến trình + kết quả qua popup giữa màn hình (xem trên).
window.quickEntrySave = async function () {
  if (__qeSaving) return;
  var rows = __qeFlatItems().filter(__qeValid);
  if (!rows.length) { try { showToast('Chưa có dòng hợp lệ để lưu', 'info'); } catch (e) {} return; }
  __qeSaving = true;
  var btn = document.getElementById('quickEntrySaveBtn'); if (btn) btn.disabled = true;
  __qeShowSavePopup();
  var saved = 0, failed = 0;
  for (var i = 0; i < rows.length; i++) {
    __qeUpdateSavePopupCount(i + 1, rows.length);
    var ok = false;
    try { ok = await submitTx(__qeBuildTx(rows[i]), { quiet: true }); } catch (e) { ok = false; }
    if (ok) { saved++; rows[i]._saved = true; } else { failed++; rows[i].saveError = true; }
  }
  __qeThread.forEach(function (m) { m.items = m.items.filter(function (it) { return !it._saved; }); });
  __qeThread = __qeThread.filter(function (m) { return m.items.length; });
  __qeThread.forEach(function (m) { m.items.forEach(function (it) { delete it._saved; }); });
  // R60 FIX 3: lọc khoản sai ngày khỏi cache Tab 1 trước khi vẽ lại.
  __qePurgeWrongDateFromTab1Cache();
  // R58: lưu hàng loạt chỉ rung 1 lần cuối khi có dòng lưu thành công
  // (submitTx quiet đã tắt haptic từng dòng).
  if (saved > 0) { try { triggerHapticNotification('success'); } catch (e) {} }
  __qeSaving = false;
  var c = __qeCounts();
  __qeShowSavePopupDone(saved, failed, c.invalid);
  __qeRenderThread();
  // R60 FIX 3: vẽ lại Tab 1 từ cache đã lọc (ngày hiển thị không đổi).
  try {
    var t1 = document.getElementById('tab1');
    if (t1 && t1.classList.contains('active') && typeof displayTransactions === 'function') displayTransactions();
  } catch (e) {}
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
  splitQuickMessage: __qeSplitMessage,
  parseMessageMulti: __qeParseMessageMulti,
  getThread: function () { return __qeThread; },
  getItems: __qeFlatItems,
  removeItem: __qeRemoveItem,
  findItem: __qeFindItem,
  clearThread: function () { __qeThread = []; __qeNextId = 1; __qeNextItemId = 1; __qeNotices = []; },
  getNotices: function () { return __qeNotices.slice(); },
  renderThread: __qeRenderThread,
  purgeWrongDateFromTab1Cache: __qePurgeWrongDateFromTab1Cache,
  getSavePopup: function () {
    var p = document.getElementById('quickEntrySavePopup');
    var t = document.getElementById('quickEntrySavePopupText');
    var ic = document.getElementById('quickEntrySavePopupIcon');
    var b = document.getElementById('quickEntrySavePopupBtn');
    return { display: p ? p.style.display : undefined, text: t ? t.textContent : undefined,
      icon: ic ? ic.innerHTML : undefined, btnDisplay: b ? b.style.display : undefined };
  },
};

// ================= END R54 =================
