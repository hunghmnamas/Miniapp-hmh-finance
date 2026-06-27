// =====================================================================
// PHẦN 5/5: ICON PICKER + SETTINGS + BACKUP/RESET + KEYWORD HANDLERS + BOOT
// (đã chuyển sang lớp dữ liệu đa người dùng qua secureFetch / chatId)
// =====================================================================

// ==========================================
// TÍNH NĂNG CỬA SỔ "ICON PICKER"
// ==========================================
let pendingTags = [];
window.openIconPickerModal = function() {
    triggerHaptic('light');
    const modal = document.getElementById('iconPickerModal');
    const container = document.getElementById('iconGridContainer');
    
    const catSelect = document.getElementById('iconPickerSelect');
    const catInputGroup = document.getElementById('newCategoryInputGroup');
    const catInput = document.getElementById('iconPickerCategory');
    const tagArea = document.getElementById('tagInputArea');
    const tagInputField = document.getElementById('tagInputField');
    const tagsWrapper = document.getElementById('tagsWrapper');
    const hiddenKeywords = document.getElementById('iconPickerNewKeywords');
    const delBtn = document.getElementById('deleteCategoryBtn');
    
    if (container.innerHTML === '') {
        const flatEmojis = [
            '🍽️', '🛡️', '💄', '📱', '💼', '👕', '🛠️', '🚗', '👨‍👩‍👧‍👦', '🎉', '📚', '🧾', '🛍️', '🎁', '🌱', '💰', '💊', '❗',
            '☕', '🍔', '🍕', '🍜', '🥩', '🛒', '🛵', '🚌', '🚆', '✈️', '⛽',
            '🏠', '🏢', '👗', '👟', '👓', '💻', '📺', '🎮', '🎧',
            '💡', '💧', '🔥', '📶', '🩺', '🦷', '💪', '🎓', '🧸',
            '📈', '💳', '🪙', '👛', '🎂', '🥂', '🐶', '🐱',
            '👶', '👥', '🔧', '🔨', '✂️', '🎬', '🎫', '🎵',
            '📦', '🏷️', '✨', '❤️'
        ];
        container.innerHTML = flatEmojis.map(emoji => `<div class=\"icon-item\" data-icon=\"${emoji}\">${emoji}</div>`).join('');
        
        const bindIconClick = (item) => {
            item.onclick = function() {
                triggerHaptic('light');
                modal.querySelectorAll('.icon-item').forEach(i => i.classList.remove('selected'));
                this.classList.add('selected');
                modal.setAttribute('data-selected-icon', this.getAttribute('data-icon'));
            };
        };
        modal.querySelectorAll('.icon-item').forEach(bindIconClick);

        window.renderTags = function() {
            tagsWrapper.innerHTML = '';
            pendingTags.forEach((tag, idx) => {
                const span = document.createElement('span');
                span.className = 'tag-badge';
                span.innerHTML = `${escapeHTML(tag)} <i class=\"fas fa-times\" onclick=\"removeTag(${idx})\"></i>`;
                tagsWrapper.appendChild(span);
            });
            hiddenKeywords.value = pendingTags.join(', ');
        }
        window.removeTag = function(idx) { triggerHaptic('light'); pendingTags.splice(idx, 1); window.renderTags(); }
        
        if (tagInputField) {
            tagInputField.addEventListener('keydown', (e) => {
                if (e.key === ',' || e.key === 'Enter') {
                    e.preventDefault();
                    const val = tagInputField.value.trim().replace(/,/g, '');
                    if (val && !pendingTags.includes(val)) { pendingTags.push(val); tagInputField.value = ''; window.renderTags(); }
                } else if (e.key === 'Backspace' && tagInputField.value === '' && pendingTags.length > 0) {
                    pendingTags.pop(); window.renderTags();
                }
            });
        }
        
        // [ĐA NGƯỜI DÙNG] Lưu icon + từ khóa qua secureFetch
        document.getElementById('saveIconPickerBtn').onclick = async () => {
            const cat = catInput.value.trim();
            const selectedIcon = modal.getAttribute('data-selected-icon');
            const newKws = hiddenKeywords ? hiddenKeywords.value : "";
            
            if (!cat) return showToast('Vui lòng nhập tên danh mục!', 'warning');
            if (!selectedIcon) return showToast('Vui lòng chọn 1 icon!', 'warning');
            
            triggerHaptic('medium'); showLoading(true, 'tab3');
            try {
                window.customCategoryIcons[cat] = selectedIcon;
                await secureFetch(`/users/${chatId}/categoryIcons.json`, 'PUT', window.customCategoryIcons);
                await upsertKeywordCategory(cat, selectedIcon, newKws);

                showToast('Đã lưu cấu hình danh mục!', 'success'); closeIconPickerModal();
                await window.initCategories(true); window.loadKeywords(false); 
                if(document.getElementById('tab1').classList.contains('active')) displayTransactions();
                if(document.getElementById('tab2').classList.contains('active')) updateTimeNavUI();
            } catch(e) { showToast('Lỗi cập nhật icon: ' + e.message, 'error'); } finally { showLoading(false, 'tab3'); }
        };

        // [ĐA NGƯỜI DÙNG] Xóa danh mục qua secureFetch
        document.getElementById('deleteCategoryBtn').onclick = () => {
            const cat = catInput.value.trim();
            if (!cat) return;
            triggerHaptic('medium');
            
            showCustomConfirm(
                'Xóa danh mục',
                `Bạn có chắc chắn muốn xóa hoàn toàn danh mục <strong>${escapeHTML(cat)}</strong> và tất cả từ khóa của nó không?`,
                'Xóa',
                async () => {
                    showLoading(true, 'tab3');
                    try {
                        delete window.customCategoryIcons[cat];
                        await secureFetch(`/users/${chatId}/categoryIcons.json`, 'PUT', window.customCategoryIcons);
                        await removeKeywordCategory(cat);
                        
                        showToast('Đã xóa danh mục thành công!', 'success'); closeIconPickerModal();
                        await window.initCategories(false); window.loadKeywords(false);
                    } catch(e) { showToast('Lỗi xóa danh mục: ' + e.message, 'error'); } finally { showLoading(false, 'tab3'); }
                }
            );
        };
    }
    
    catSelect.innerHTML = '<option value=\"\">-- Chọn danh mục hiện có --</option>';
    const cats = Array.from(document.getElementById('keywordCategory').options).map(opt => opt.value).filter(v => v);
    const uniqueCats = [...new Set(cats)]; 
    uniqueCats.forEach(c => { catSelect.appendChild(new Option(c, c)); });
    
    const newOpt = document.createElement('option');
    newOpt.value = "__NEW__";
    newOpt.innerHTML = "➕ Tạo danh mục mới...";
    newOpt.style.fontWeight = "bold";
    catSelect.appendChild(newOpt);

    const updateIconState = (val) => {
        let usedEmojis = [];
        uniqueCats.forEach(c => {
            if (c !== val) {
                let iconStr = window.customCategoryIcons[c] || window.categoryIconMap[c];
                if (iconStr) {
                    iconStr = iconStr.trim();
                    let emoji = iconStr;
                    if (iconStr.includes('fa-')) {
                        let faClass = iconStr.replace('fas ', '').trim();
                        if (!faClass.startsWith('fa-')) faClass = 'fa-' + faClass;
                        emoji = FA_TO_EMOJI_MAP[faClass];
                    }
                    if (emoji) usedEmojis.push(emoji);
                }
            }
        });

        modal.querySelectorAll('.icon-item').forEach(item => {
            item.classList.remove('selected');
            const itemEmoji = item.getAttribute('data-icon');
            if (usedEmojis.includes(itemEmoji)) {
                item.classList.add('disabled-icon');
            } else {
                item.classList.remove('disabled-icon');
            }
        });

        modal.removeAttribute('data-selected-icon');
        
        if (!val) return;

        let currentIconVal = null;
        if (window.customCategoryIcons && window.customCategoryIcons[val]) {
            currentIconVal = window.customCategoryIcons[val].trim();
        } else if (window.categoryIconMap && window.categoryIconMap[val]) {
            currentIconVal = window.categoryIconMap[val].trim();
        }

        if (currentIconVal) {
            let targetEmoji = currentIconVal.includes('fa-') ? FA_TO_EMOJI_MAP[currentIconVal.replace('fas ', '').trim().startsWith('fa-') ? currentIconVal.replace('fas ', '').trim() : 'fa-' + currentIconVal.replace('fas ', '').trim()] : currentIconVal;
            if (targetEmoji) {
                let item = Array.from(modal.querySelectorAll('.icon-item')).find(el => el.getAttribute('data-icon') === targetEmoji);
                if (!item) {
                    const newDiv = document.createElement('div');
                    newDiv.className = 'icon-item';
                    newDiv.setAttribute('data-icon', targetEmoji);
                    newDiv.innerHTML = targetEmoji;
                    newDiv.onclick = function() {
                        triggerHaptic('light');
                        modal.querySelectorAll('.icon-item').forEach(i => i.classList.remove('selected'));
                        this.classList.add('selected');
                        modal.setAttribute('data-selected-icon', this.getAttribute('data-icon'));
                    };
                    item = newDiv;
                }
                if (item) {
                    item.classList.add('selected');
                    item.classList.remove('disabled-icon');
                    modal.setAttribute('data-selected-icon', item.getAttribute('data-icon'));
                    if (container.firstChild !== item) container.insertBefore(item, container.firstChild);
                    container.scrollTop = 0;
                }
            }
        }
    };

    catSelect.onchange = (e) => {
        triggerHaptic('light');
        if (e.target.value === '__NEW__') {
            catInputGroup.style.display = 'block';
            tagArea.style.display = 'block';
            delBtn.style.display = 'none';
            catInput.value = '';
            catInput.focus();
            updateIconState(''); 
        } else {
            catInputGroup.style.display = 'none';
            tagArea.style.display = 'none';
            delBtn.style.display = e.target.value ? 'flex' : 'none';
            catInput.value = e.target.value;
            updateIconState(e.target.value);
        }
    };

    catInput.addEventListener('input', (e) => updateIconState(e.target.value.trim()));

    const currentSelected = document.getElementById('keywordCategory').value;
    if(currentSelected) {
        catSelect.value = currentSelected;
        catInput.value = currentSelected;
        catInputGroup.style.display = 'none';
        tagArea.style.display = 'none';
        delBtn.style.display = 'flex';
        updateIconState(currentSelected);
    } else {
        catSelect.value = '';
        catInput.value = '';
        catInputGroup.style.display = 'none';
        tagArea.style.display = 'none';
        delBtn.style.display = 'none';
        updateIconState('');
    }
    
    pendingTags = []; window.renderTags();

    document.getElementById('modalOverlay').classList.add('show');
    setTimeout(() => modal.classList.add('show'), 10);
};

window.closeIconPickerModal = function() {
    const modal = document.getElementById('iconPickerModal');
    if (modal) modal.classList.remove('show');
    setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

// ---------------- LƯU & ÁP DỤNG CÀI ĐẶT NGƯỜI DÙNG ----------------
function applyTheme(v) {
  document.body.className = `theme-${v || 'auto'}`;
  if (isPrivacyActive) document.body.classList.add('privacy-on');
}

function initSettings() {
  const themeVal = localStorage.getItem('settingTheme') || 'auto';
  const tabVal = localStorage.getItem('settingDefaultTab') || 'tab1';
  const sowVal = localStorage.getItem('settingStartOfWeek') || '1';
  const curVal = localStorage.getItem('settingCurrencyFormat') || 'full';
  const hapticVal = localStorage.getItem('settingHaptic');
  const privacyVal = localStorage.getItem('settingPrivacyMode');
  const chatIdVal = localStorage.getItem('settingChatId');
  const elTheme = document.getElementById('settingTheme'); if (elTheme) elTheme.value = themeVal;
  const elTab = document.getElementById('settingDefaultTab'); if (elTab) elTab.value = tabVal;
  const elSow = document.getElementById('settingStartOfWeek'); if (elSow) elSow.value = sowVal;
  const elCur = document.getElementById('settingCurrencyFormat'); if (elCur) elCur.value = curVal;
  const elHaptic = document.getElementById('settingHaptic'); if (elHaptic) elHaptic.checked = (hapticVal === null ? true : hapticVal === 'true');
  const elPrivacy = document.getElementById('settingPrivacyMode'); if (elPrivacy) elPrivacy.checked = (privacyVal === 'true');
  const elChatId = document.getElementById('settingChatId'); if (elChatId && chatIdVal) elChatId.value = chatIdVal;
  applyTheme(themeVal);
}

function showWhatsNew() {
  if (localStorage.getItem('whatsnew_v1') === 'dismissed') return;
  const features = [
    ['🛡️', 'Chế Độ Riêng Tư', 'Ẩn toàn bộ số tiền chỉ với 1 chạm.'],
    ['📅', 'Giao Diện Lịch', 'Xem thu chi từng ngày trực quan theo tuần/tháng.'],
    ['📈', 'Biểu Đồ Kép', 'Chuyển nhanh giữa biểu đồ cột và đường.'],
    ['📄', 'Xuất PDF Chuẩn Layout', 'Báo cáo PDF đẹp, đúng bố cục.'],
    ['🏷️', 'Quản Lý Từ Khóa & Icon', 'Tự tạo danh mục, gắn icon và từ khóa riêng.'],
    ['💱', 'Định Dạng Tiền Siêu Gọn', 'Hiển thị gọn kiểu 50K / 1m520.'],
    ['☁️', 'Sao Lưu & Cài Đặt Sâu', 'Sao lưu toàn bộ dữ liệu ra CSV.'],
    ['🔒', 'Bảo Mật Đa Người Dùng', 'Dữ liệu mỗi người được tách riêng an toàn.']
  ];
  let itemsHTML = '';
  features.forEach(f => {
    itemsHTML += `<div style='display:flex; gap:12px; align-items:flex-start; padding:10px 0; border-bottom:1px solid var(--border-color);'><div style='font-size:22px; line-height:1;'>${f[0]}</div><div style='flex:1;'><div style='font-weight:700; color:var(--text-1); font-size:0.9rem;'>${f[1]}</div><div style='color:var(--text-2); font-size:0.8rem; margin-top:2px;'>${f[2]}</div></div></div>`;
  });
  const overlay = document.createElement('div');
  overlay.id = 'whatsNewOverlay';
  overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';
  overlay.innerHTML = `<div style='background:var(--bg-card); border-radius:18px; max-width:420px; width:100%; max-height:85vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.4);'><div style='padding:20px 20px 12px; text-align:center;'><div style='font-size:30px;'>🎉</div><div style='font-weight:800; color:var(--text-1); font-size:1.15rem; margin-top:6px;'>Có Gì Mới?</div><div style='color:var(--text-2); font-size:0.82rem; margin-top:4px;'>Cập nhật các tính năng mới nhất của ứng dụng</div></div><div style='padding:0 20px; overflow-y:auto; flex:1;'>${itemsHTML}</div><div style='padding:14px 20px 18px;'><label style='display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-2); margin-bottom:12px; cursor:pointer;'><input type='checkbox' id='whatsNewDontShow' style='width:16px; height:16px;'> Không hiển thị lại lần sau</label><button id='whatsNewCloseBtn' class='btn-save' style='width:100%;'>Đã hiểu</button></div></div>`;
  document.body.appendChild(overlay);
  document.getElementById('whatsNewCloseBtn').onclick = () => {
    triggerHaptic('light');
    if (document.getElementById('whatsNewDontShow').checked) {
      localStorage.setItem('whatsnew_v1', 'dismissed');
    }
    overlay.remove();
  };
}

// ---------------- INIT LẮNG NGHE SỰ KIỆN CHÍNH ----------------
document.addEventListener('DOMContentLoaded', async () => {
  applyPrivacyMode(); 
    
  document.querySelectorAll('.modal-title').forEach(title => { title.style.textTransform = 'uppercase'; });
  const currentMonthValue = new Date().getMonth() + 1;
  if (document.getElementById('searchStartMonth')) document.getElementById('searchStartMonth').value = '1';
  if (document.getElementById('searchEndMonth')) document.getElementById('searchEndMonth').value = currentMonthValue.toString();

  const heroCardTab1 = document.querySelector('#tab1 .hero-card');
  if(heroCardTab1) { heroCardTab1.style.cursor = 'pointer'; heroCardTab1.onclick = (e) => { if (e.target.closest('.date-nav-btn') || e.target.closest('.quick-actions') || e.target.closest('.tx-btn') || e.target.closest('.privacy-toggle-btn')) return; const dateInput = document.getElementById('transactionDate'); if (dateInput) { dateInput.value = formatDateToYYYYMMDD(new Date()); window.fetchTransactions(true); triggerHaptic('light'); showToast("Đã quay về dữ liệu ngày hôm nay", "info"); } }; }

  let startY = 0; const tab1Content = document.getElementById('tab1');
  if (tab1Content) { tab1Content.addEventListener('touchstart', e => { if (window.scrollY === 0) startY = e.touches[0].clientY; }, { passive: true }); tab1Content.addEventListener('touchend', e => { if (startY === 0) return; let endY = e.changedTouches[0].clientY; if (endY - startY > 80 && window.scrollY === 0) { triggerHaptic('medium'); showToast("Đang làm mới giao dịch...", "info"); window.fetchTransactions(true); } startY = 0; }, { passive: true }); }

  document.querySelectorAll('.nav-btn').forEach(b => { b.onclick = () => { const targetTab = b.dataset.tab; window.openTab(targetTab); if (targetTab === 'tab1') window.fetchTransactions(false); if (targetTab === 'tab2') { if (tab2NeedsReload) { tab2NeedsReload = false; cachedChartData = null; } updateTimeNavUI(); } }; });
  
  const kwActionContainer = document.getElementById('keywordActionContainer');
  if(kwActionContainer) {
      const deleteBtn = document.createElement('button'); deleteBtn.id = 'deleteEditKeywordBtn'; deleteBtn.className = 'btn-danger-outline flex-1 m-0'; deleteBtn.style.display = 'none'; deleteBtn.innerHTML = '<i class=\"fas fa-trash\"></i> Xóa';
      deleteBtn.onclick = () => { 
          if(!currentEditKeyword) return showToast('Vui lòng chọn từ khóa cần xóa', 'warning'); 
          triggerHaptic('medium');
          const cat = document.getElementById('keywordCategory').value;
          
          showCustomConfirm(
              'Xóa từ khóa',
              `Bạn có chắc chắn muốn xóa từ khóa <strong>${escapeHTML(currentEditKeyword)}</strong> khỏi danh mục <strong>${escapeHTML(cat)}</strong> không?`,
              'Xóa',
              async () => {
                  showLoading(true, 'tab3'); 
                  try { 
                      await removeKeywordFromCategory(cat, currentEditKeyword); 
                      triggerHapticNotification('success'); 
                      showToast('Đã xóa từ khóa thành công!', 'success'); window.cancelEditKeyword(); window.loadKeywords(false); 
                  } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab3'); }
              }
          );
      }; 
      kwActionContainer.appendChild(deleteBtn);

      const cancelBtn = document.createElement('button'); cancelBtn.id = 'cancelKeywordBtn'; cancelBtn.className = 'btn-cancel flex-1 m-0'; cancelBtn.style.display = 'none'; cancelBtn.innerHTML = '<i class=\"fas fa-times\"></i> Hủy';
      cancelBtn.onclick = window.cancelEditKeyword; kwActionContainer.appendChild(cancelBtn);
  }

  const tDate = document.getElementById('transactionDate'); if(tDate) { tDate.value = formatDateToYYYYMMDD(new Date()); tDate.onchange = () => { triggerHaptic('light'); window.fetchTransactions(true); }; }
  const prevDayBtn = document.getElementById('prevDayBtn'); if(prevDayBtn) { prevDayBtn.onclick = (e) => { e.stopPropagation(); triggerHaptic('light'); const dateInput = document.getElementById('transactionDate'); if (!dateInput.value) return; const [y, m, d] = dateInput.value.split('-'); const currDate = new Date(y, m - 1, d); currDate.setDate(currDate.getDate() - 1); dateInput.value = formatDateToYYYYMMDD(currDate); window.fetchTransactions(true); }; }
  const nextDayBtn = document.getElementById('nextDayBtn'); if(nextDayBtn) { nextDayBtn.onclick = (e) => { e.stopPropagation(); triggerHaptic('light'); const dateInput = document.getElementById('transactionDate'); if (!dateInput.value) return; const [y, m, d] = dateInput.value.split('-'); const currDate = new Date(y, m - 1, d); currDate.setDate(currDate.getDate() + 1); dateInput.value = formatDateToYYYYMMDD(currDate); window.fetchTransactions(true); }; }

  document.getElementById('filterWeeklyBtn').onclick = () => { triggerHaptic('light'); setFilterMode('weekly'); };
  document.getElementById('filterMonthlyBtn').onclick = () => { triggerHaptic('light'); setFilterMode('monthly'); };
  document.getElementById('filterYearlyBtn').onclick = () => { triggerHaptic('light'); setFilterMode('yearly'); };
  document.getElementById('filterCustomBtn').onclick = () => { triggerHaptic('light'); setFilterMode('custom'); };
  document.getElementById('prevPeriodBtn').onclick = () => { triggerHaptic('light'); shiftPeriod(-1); };
  document.getElementById('nextPeriodBtn').onclick = () => { triggerHaptic('light'); shiftPeriod(1); };
  document.getElementById('weekPicker').onchange = (e) => { triggerHaptic('light'); const d = getDateFromWeekString(e.target.value); if(d) { activePeriodDate = d; updateTimeNavUI(); } };
  document.getElementById('monthPicker').onchange = (e) => { triggerHaptic('light'); const val = e.target.value; if(val) { const [y, m] = val.split('-'); activePeriodDate = new Date(y, m-1, 1); updateTimeNavUI(); } };
  document.getElementById('fetchCustomDataBtn').onclick = () => { triggerHaptic('light'); const s = parseInt(document.getElementById('startMonth').value); const e = parseInt(document.getElementById('endMonth').value); if(s > e) return showToast("Tháng bắt đầu phải nhỏ hơn kết thúc", "warning"); loadCustomReport(s, e, new Date().getFullYear()); };
  
  function setFilterMode(mode) { currentFilterMode = mode; document.querySelectorAll('#tab2 .period-pill').forEach(p => p.classList.remove('active')); document.getElementById('filter' + mode.charAt(0).toUpperCase() + mode.slice(1) + 'Btn').classList.add('active'); activePeriodDate = new Date(); updateTimeNavUI(); }
  function shiftPeriod(dir) { if (currentFilterMode === 'weekly') activePeriodDate.setDate(activePeriodDate.getDate() + (dir * 7)); else if (currentFilterMode === 'monthly') activePeriodDate.setMonth(activePeriodDate.getMonth() + dir); updateTimeNavUI(); }
  
  const sPills = document.querySelectorAll('#searchModal .period-pill');
  sPills.forEach(p => p.onclick = function() { triggerHaptic('light'); sPills.forEach(x=>x.classList.remove('active')); this.classList.add('active'); document.getElementById('searchCustomFilterContainer').style.display = 'none'; if(this.id==='searchCustomBtn') document.getElementById('searchCustomFilterContainer').style.display = 'flex'; });
  
  document.getElementById('searchTransactionsBtn').onclick = async () => {
    triggerHaptic('light');
    const c = document.getElementById('searchContent').value.toLowerCase(), a = document.getElementById('searchAmount').value, cat = document.getElementById('searchCategory').value;
    if(!c && !a && !cat) return showToast("Nhập điều kiện tìm kiếm", "warning");
    let sM = 1, eM = 12;
    if(document.getElementById('searchMonthlyBtn').classList.contains('active')) { sM = eM = new Date().getMonth() + 1; }
    else if(document.getElementById('searchCustomBtn').classList.contains('active')) { sM = parseInt(document.getElementById('searchStartMonth').value); eM = parseInt(document.getElementById('searchEndMonth').value); }
    
    showLoading(true, 'tab3');
    try {
      let txs = []; let fetchPromises = []; 
      for (let m = sM; m <= eM; m++) { fetchPromises.push((async () => { return await fetchMonthData(m); })()); }
      const monthsResults = await Promise.all(fetchPromises);
      const aNum = parseFloat(a.replace(/[^0-9]/g, ''));
      monthsResults.forEach(monthData => { monthData.forEach(t => { let matches = true; if (c && (!t.content || t.content.toLowerCase().indexOf(c) === -1)) matches = false; if (a && Math.abs(t.amount - aNum) > 0.01) matches = false; if (cat && t.category !== cat) matches = false; if (matches) txs.push(t); }); });
      sortTxByDateDesc(txs); cachedSearchResults = txs; currentPageSearch = 1; displaySearchResults();
    } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab3'); }
  };
  
  document.getElementById('fetchKeywordsBtn').onclick = () => { triggerHaptic('light'); window.loadKeywords(false); };
  document.getElementById('addKeywordBtn').onclick = async () => {
        triggerHaptic('light');
        const cat = document.getElementById('keywordCategory').value, kw = document.getElementById('keywordInput').value;
        if(!cat || !kw) return showToast('Vui lòng nhập đủ thông tin', 'warning');
        showLoading(true, 'tab3');
        try {
            if (currentEditKeyword) await removeKeywordFromCategory(cat, currentEditKeyword);
            await upsertKeywordCategory(cat, null, kw);
            triggerHapticNotification('success');
            showToast(currentEditKeyword ? 'Cập nhật từ khóa thành công!' : 'Thêm từ khóa mới thành công!', 'success'); window.cancelEditKeyword(); window.loadKeywords(false);
        } catch(e) { showToast(e.message, 'error'); } finally { showLoading(false, 'tab3'); }
  };

  ['addAmount','editAmount','searchAmount'].forEach(id => { const el = document.getElementById(id); if(el) el.oninput = function() { this.value = formatNumberWithCommas(this.value); }; });
  
  document.getElementById('addForm').onsubmit = async function(e) { e.preventDefault(); closeAddForm(); const [y,m,d] = document.getElementById('addDate').value.split('-'); const tx = { content: document.getElementById('addContent').value, amount: parseNumber(document.getElementById('addAmount').value), type: document.getElementById('addType').value, category: document.getElementById('addCategory').value, note: document.getElementById('addNote').value, date: `${d}/${m}/${y}`, action: 'addTransaction' }; await submitTx(tx); };
  document.getElementById('editForm').onsubmit = async function(e) { e.preventDefault(); closeEditForm(); const [y,m,d] = document.getElementById('editDate').value.split('-'); const tx = { id: document.getElementById('editTransactionId').value, content: document.getElementById('editContent').value, amount: parseNumber(document.getElementById('editAmount').value), type: document.getElementById('editType').value, category: document.getElementById('editCategory').value, note: document.getElementById('editNote').value, date: `${d}/${m}/${y}`, month: m, action: 'updateTransaction' }; await submitTx(tx); };

  // Khởi động Settings
  document.getElementById('settingPrivacyMode').onchange = (e) => { 
      triggerHaptic('light'); 
      localStorage.setItem('settingPrivacyMode', e.target.checked); 
      isPrivacyActive = e.target.checked; 
      updatePrivacyUI(true); 
  };

  document.getElementById('settingTheme').onchange = (e) => { triggerHaptic('light'); const v = e.target.value; localStorage.setItem('settingTheme', v); applyTheme(v); };
  document.getElementById('settingDefaultTab').onchange = (e) => { triggerHaptic('light'); localStorage.setItem('settingDefaultTab', e.target.value); };
  document.getElementById('settingStartOfWeek').onchange = (e) => { triggerHaptic('light'); localStorage.setItem('settingStartOfWeek', e.target.value); if(document.getElementById('tab2').classList.contains('active')) updateTimeNavUI(); };
  
  document.getElementById('settingCurrencyFormat').onchange = (e) => { 
      triggerHaptic('light'); 
      localStorage.setItem('settingCurrencyFormat', e.target.value); 
      window.fetchTransactions(true); 
      if(document.getElementById('tab2').classList.contains('active')) updateTimeNavUI(); 
  };
  
  document.getElementById('settingHaptic').onchange = (e) => { localStorage.setItem('settingHaptic', e.target.checked); if(e.target.checked) triggerHaptic('light'); };
  if(document.getElementById('settingChatId')) document.getElementById('settingChatId').onchange = (e) => localStorage.setItem('settingChatId', e.target.value.trim());

  // [ĐA NGƯỜI DÙNG] Sao lưu: xuất toàn bộ 12 tháng ra CSV ngay trên thiết bị
  document.getElementById('backupTelegramBtn').onclick = async () => {
      triggerHaptic('light'); showToast('Đang tổng hợp dữ liệu sao lưu...', 'info');
      try {
          let allTxs = [];
          const promises = [];
          for (let m = 1; m <= 12; m++) { promises.push(fetchMonthData(m)); }
          const results = await Promise.all(promises);
          results.forEach(monthData => { (monthData || []).forEach(t => { if (t) allTxs.push(t); }); });
          if (allTxs.length === 0) return showToast('Không có dữ liệu để sao lưu!', 'warning');
          allTxs.sort((a, b) => { const pa = a.date.split('/'); const pb = b.date.split('/'); return new Date(pa[2], pa[1]-1, pa[0]) - new Date(pb[2], pb[1]-1, pb[0]); });
          let csvContent = "\\uFEFFMã GD,Ngày,Phân loại,Danh mục,Số tiền,Nội dung,Ghi chú\\n";
          allTxs.forEach(t => { let content = t.content ? t.content.replace(/,/g, " ") : ""; let note = t.note ? t.note.replace(/,/g, " ") : ""; csvContent += `${t.id},${t.date},${t.type},${t.category},${t.amount},${content},${note}\\n`; });
          const fileName = `SaoLuu_ToanBo_${formatDateToYYYYMMDD(new Date())}.csv`;
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
          const platform = window.Telegram?.WebApp?.platform || 'unknown'; const isMobile = ['android', 'android_x', 'ios'].includes(platform.toLowerCase());
          if (isMobile && navigator.canShare) { try { const file = new File([blob], fileName, { type: 'text/csv' }); if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: fileName }); triggerHapticNotification('success'); return; } } catch (error) {} }
          const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); triggerHapticNotification('success'); showToast('Đã xuất file sao lưu toàn bộ dữ liệu!', 'success');
      } catch(e) { showToast('Lỗi sao lưu: ' + e.message, 'error'); }
  };
  // [ĐA NGƯỜI DÙNG] Hard reset: chỉ xoá dữ liệu của chính người dùng này
  document.getElementById('hardResetBtn').onclick = () => {
      triggerHaptic('medium');
      showCustomConfirm('Khôi Phục Cài Đặt Gốc', 'Toàn bộ dữ liệu giao dịch, từ khoá và cài đặt của bạn sẽ bị <strong>XÓA VĨNH VIỄN</strong>. Bạn có chắc chắn không?', 'XÓA TẤT CẢ', async () => {
          showLoading(true, 'tab4');
          try {
              await secureFetch(`/transactions/users/${chatId}.json`, 'DELETE');
              await secureFetch(`/users/${chatId}/keywords.json`, 'DELETE');
              await secureFetch(`/users/${chatId}/categoryIcons.json`, 'DELETE');
              window.apiTxCache = {};
              localStorage.clear(); showToast('Đã xoá sạch dữ liệu!', 'success'); setTimeout(() => window.location.reload(), 1500);
          } catch(e) { showToast('Lỗi: ' + e.message, 'error'); } finally { showLoading(false, 'tab4'); }
      });
  };

  // Nút đổi biểu đồ tab 2
  const toggleChartBtn = document.getElementById('toggleChartBtn');
  if(toggleChartBtn) {
      toggleChartBtn.onclick = () => {
          triggerHaptic('light');
          window.currentChartType = window.currentChartType === 'bar' ? 'line' : 'bar';
          document.getElementById('toggleChartBtn').innerHTML = window.currentChartType === 'bar' ? '<i class=\"fas fa-chart-line\"></i>' : '<i class=\"fas fa-chart-bar\"></i>';
          const isTab2 = document.getElementById('tab2').classList.contains('active');
          if (isTab2 && window.mChart) {
              window.mChart.config.type = window.currentChartType;
              if (window.currentChartType === 'line') {
                  window.mChart.data.datasets[0].tension = 0.4; window.mChart.data.datasets[0].fill = true; window.mChart.data.datasets[0].borderWidth = 2; window.mChart.data.datasets[0].pointRadius = 4;
                  window.mChart.data.datasets[1].tension = 0.4; window.mChart.data.datasets[1].fill = true; window.mChart.data.datasets[1].borderWidth = 2; window.mChart.data.datasets[1].pointRadius = 4;
              } else {
                  window.mChart.data.datasets[0].fill = false; window.mChart.data.datasets[0].borderWidth = 0; window.mChart.data.datasets[0].borderRadius = 4;
                  window.mChart.data.datasets[1].fill = false; window.mChart.data.datasets[1].borderWidth = 0; window.mChart.data.datasets[1].borderRadius = 4;
              }
              window.mChart.update();
          }
      };
  }

  if(typeof initSettings === 'function') initSettings(); 
  
  // [ĐA NGƯỜI DÙNG] Boot: lấy thông tin người dùng (sheetId) trước khi khởi tạo UI
  async function boot() {
      try {
          if (workerUrl && chatId) {
              const res = await fetch(`${workerUrl}/api/get_user_info?chatId=${chatId}`);
              if (res.ok) { const info = await res.json(); if (info && info.sheetId) sheetId = info.sheetId; }
          }
      } catch(e) { console.log('Lỗi lấy thông tin người dùng:', e); }
      if (!sheetId) showToast('Bạn chưa kết nối Drive! Quay lại chat gõ /ketnoi để bật sao lưu Google Sheet.', 'info');

      window.initCategories();
      const defTab = localStorage.getItem('settingDefaultTab') || 'tab1';
      window.openTab(defTab); 
      if(defTab === 'tab1') { showLoading(true, 'tab1'); window.fetchTransactions(false); } else { updateTimeNavUI(); }
      window.loadKeywords(true);
  }
  boot();

  showWhatsNew();
});
