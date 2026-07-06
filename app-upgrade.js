// ============================================================================
// app-upgrade.js — NÂNG CẤP GIAO DIỆN (nạp CUỐI CÙNG, sau app-init.js)
// ----------------------------------------------------------------------------
// 1) Tab 1: bấm dòng ngày -> bảng chọn ngày GỐC của OS.
// 2) Nút ＋ (FAB): Thêm thu nhập / chi tiêu / Cài đặt / Giới thiệu.
// 3) Cài đặt / Giới thiệu dạng trang toàn màn hình (Quay Lại bên phải + vuốt).
// 4) Tab 2: ẩn/hiện lịch + mũi tên tiến/lùi (chặn kỳ không có dữ liệu).
// 5) Ngày dd/MM/yyyy ở form Thêm/Sửa.
// 6) Nút đóng ✕ cho modal.
// 7) Tab Tìm kiếm (thêm nút Tìm kiếm vào thanh điều hướng, mở modal tìm kiếm).
// 8) Đếm tổng giao dịch + sắp xếp kết quả tìm kiếm theo ngày mới nhất.
// 9) Indicator trượt giữa các tab trên thanh điều hướng.
// 10) Nhãn so sánh ghi rõ kỳ trước (so với tuần 26 / tháng 6 / năm 2025).
// 11) Che do Nam: lam mo mui ten lui khi nam lien truoc khong co du lieu.
// ----------------------------------------------------------------------------
// [FINANCE] Ban nay da duoc chinh cho repo Miniapp-hmh-finance: LOP DU LIEU giu
// nguyen 100% (app-core/app-crud/app-reports/app-init dung secureFetch per-user).
// fetchYearData bi vo hieu hoa (no-op) de du lieu CHI den tu getTransactionsInRange
// / fetchMonthData goc cua finance, tranh goi Firebase global (repo nay khong dung).
// ============================================================================

(function () {
  'use strict';

  function fmtDMY(yyyymmdd) {
    if (!yyyymmdd) return '';
    var p = String(yyyymmdd).split('-');
    if (p.length !== 3) return '';
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function syncDateDisplay(inputId, displayId) {
    var i = document.getElementById(inputId), d = document.getElementById(displayId);
    if (i && d) d.textContent = fmtDMY(i.value);
  }
  window.__syncDateDisplay = syncDateDisplay;
  function setupDateDisplay(inputId, displayId) {
    var input = document.getElementById(inputId);
    if (!input || document.getElementById(displayId)) return;
    input.classList.add('date-native');
    var wrap = document.createElement('div');
    wrap.className = 'date-field-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var span = document.createElement('span');
    span.className = 'date-display';
    span.id = displayId;
    wrap.appendChild(span);
    input.addEventListener('change', function () { syncDateDisplay(inputId, displayId); });
    input.addEventListener('input', function () { syncDateDisplay(inputId, displayId); });
    syncDateDisplay(inputId, displayId);
  }

  function setupHeroDateNative() {
    var heroDate = document.getElementById('displayCurrentDate');
    var tInput = document.getElementById('transactionDate');
    if (!heroDate || !tInput) return;
    var parent = heroDate.parentNode;
    if (parent && parent.classList && parent.classList.contains('hero-date-tap')) return;
    var caret = heroDate.nextElementSibling;
    var wrap = document.createElement('span');
    wrap.className = 'hero-date-tap';
    parent.insertBefore(wrap, heroDate);
    wrap.appendChild(heroDate);
    if (caret && caret.classList && caret.classList.contains('fa-caret-down')) wrap.appendChild(caret);
    tInput.style.display = 'block';
    tInput.classList.add('hero-date-native');
    wrap.appendChild(tInput);
    tInput.addEventListener('click', function (e) { e.stopPropagation(); });
    tInput.addEventListener('change', function () { if (typeof window.fetchTransactions === 'function') window.fetchTransactions(false); });
  }

  function addModalCloseX(modalId, closeFnName) {
    var modal = document.getElementById(modalId);
    if (!modal || modal.querySelector('.modal-close-x')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'modal-close-x';
    btn.setAttribute('aria-label', 'Đóng');
    btn.innerHTML = '<i class="fas fa-times"></i>';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      triggerHaptic('light');
      if (typeof window[closeFnName] === 'function') window[closeFnName]();
    });
    modal.appendChild(btn);
  }

  function enableSwipeBack(pageId) {
    var el = document.getElementById(pageId);
    if (!el) return;
    var sx = 0, sy = 0, tracking = false;
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      e.stopPropagation();
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      e.stopPropagation();
      if (!tracking) return;
      tracking = false;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        window.closeFullscreen(pageId);
      }
    }, { passive: true });
  }

  function setupSearchTab() {
    var fabMenu = document.getElementById('fabMenu');
    if (fabMenu) {
      fabMenu.querySelectorAll('.fab-item').forEach(function (it) {
        var lbl = it.querySelector('.fab-item-label');
        if (lbl && lbl.textContent.trim() === 'Tìm kiếm') it.remove();
      });
    }
    var group = document.querySelector('.nav-tabs-group');
    if (group && !document.getElementById('navSearchBtn')) {
      var btn = document.createElement('button');
      btn.id = 'navSearchBtn';
      btn.className = 'nav-btn';
      btn.type = 'button';
      btn.innerHTML = '<div class="nav-icon-wrap"><i class="fas fa-search"></i></div><span class="nav-label">Tìm kiếm</span>';
      btn.onclick = function () { triggerHaptic('light'); if (typeof window.openSearchModal === 'function') window.openSearchModal(); };
      group.appendChild(btn);
    }
  }

  // ---- Indicator trượt giữa các tab ----
  function positionNavIndicator() {
    var group = document.querySelector('.nav-tabs-group');
    var ind = document.getElementById('navIndicator');
    if (!group || !ind) return;
    var active = group.querySelector('.nav-btn.active');
    if (!active) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.width = active.offsetWidth + 'px';
    ind.style.height = active.offsetHeight + 'px';
    ind.style.top = active.offsetTop + 'px';
    ind.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }
  window.__positionNavIndicator = positionNavIndicator;
  function setupNavIndicator() {
    var group = document.querySelector('.nav-tabs-group');
    if (!group || document.getElementById('navIndicator')) return;
    var ind = document.createElement('div');
    ind.id = 'navIndicator';
    ind.className = 'nav-indicator';
    group.insertBefore(ind, group.firstChild);
    positionNavIndicator();
    requestAnimationFrame(function () { requestAnimationFrame(positionNavIndicator); });
    setTimeout(positionNavIndicator, 60);
    setTimeout(positionNavIndicator, 250);
    setTimeout(positionNavIndicator, 600);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { try { positionNavIndicator(); } catch (e) {} });
    }
    if (typeof ResizeObserver !== 'undefined') {
      try {
        var __navRO = new ResizeObserver(function () { try { positionNavIndicator(); } catch (e) {} });
        __navRO.observe(group);
        var __activeInit = group.querySelector('.nav-btn.active');
        if (__activeInit) __navRO.observe(__activeInit);
      } catch (e) {}
    }
  }

  function setupSearchCount() {
    var container = document.getElementById('searchResultsContainer');
    if (!container || document.getElementById('searchCountLabel')) return;
    var lbl = document.createElement('div');
    lbl.id = 'searchCountLabel';
    lbl.className = 'chart-title text-left';
    lbl.style.display = 'none';
    lbl.style.marginTop = '4px';
    lbl.style.marginBottom = '10px';
    container.parentNode.insertBefore(lbl, container);
  }

  function searchDateKey(t) {
    if (!t || !t.date) return 0;
    var p = String(t.date).split('/');
    if (p.length !== 3) return 0;
    return parseInt(p[2], 10) * 10000 + parseInt(p[1], 10) * 100 + parseInt(p[0], 10);
  }

  // ------------------------------------------------------------------
  // WRAP openTab — cập nhật vị trí indicator
  // ------------------------------------------------------------------
  var _origOpenTab = window.openTab;
  if (typeof _origOpenTab === 'function') {
    window.openTab = function (tabId) {
      var r = _origOpenTab.apply(this, arguments);
      try { positionNavIndicator(); } catch (e) {}
      return r;
    };
  }

  // ------------------------------------------------------------------
  // WRAP fetchTransactions — lam moi moc du lieu dieu huong khi tai lai
  // ------------------------------------------------------------------
  var _origFetchTransactions = window.fetchTransactions;
  if (typeof _origFetchTransactions === 'function') {
    window.fetchTransactions = function (force) {
      if (force === true) { window.__navBoundsPromise = null; window.monthDataCache = {}; window.__yearHasDataCache = {}; window.apiTxCache = {}; window.__yearFetchInFlight = {}; }
      return _origFetchTransactions.apply(this, arguments);
    };
  }

  // ------------------------------------------------------------------
  // [FINANCE] fetchYearData VO HIEU HOA (no-op).
  // Repo finance khong dung Firebase RTDB global; du lieu duoc lay theo tung
  // user qua secureFetch (fetchMonthData / getTransactionsInRange trong app-core).
  // De KHONG lam sai nguon du lieu, ta khong tai "ca nam" tu Firebase o day nua.
  // fetchMonthData goc cua finance van tu tai theo thang khi can.
  // ------------------------------------------------------------------
  function fetchYearData(year, force) { return Promise.resolve(false); }
  window.fetchYearData = fetchYearData;

  // ------------------------------------------------------------------
  // WRAP openAddForm — khóa loại giao dịch (Thu nhập / Chi tiêu)
  // ------------------------------------------------------------------
  var _origOpenAddForm = window.openAddForm;
  window.openAddForm = async function (lockType) {
    var addModal = document.getElementById('addModal');
    var typeRow = addModal ? addModal.querySelector('.type-row') : null;
    var typeGroup = typeRow ? typeRow.closest('.field-group') : null;
    var titleEl = addModal ? addModal.querySelector('.modal-title') : null;
    var locked = (lockType === 'Thu nhập' || lockType === 'Chi tiêu');

    if (typeGroup) typeGroup.style.display = locked ? 'none' : '';
    if (titleEl) titleEl.textContent = locked ? (lockType === 'Thu nhập' ? 'Thêm thu nhập' : 'Thêm chi tiêu') : 'Thêm giao dịch mới';

    if (typeof _origOpenAddForm === 'function') { await _origOpenAddForm(); }

    if (locked && addModal) {
      var addTypeInput = document.getElementById('addType');
      if (addTypeInput) addTypeInput.value = lockType;
      addModal.querySelectorAll('.type-pill').forEach(function (p) {
        if (p.textContent.indexOf(lockType) !== -1) p.click();
      });
      if (typeGroup) typeGroup.style.display = 'none';
      if (titleEl) titleEl.textContent = (lockType === 'Thu nhập' ? 'Thêm thu nhập' : 'Thêm chi tiêu');
    } else if (!locked) {
      if (typeGroup) typeGroup.style.display = '';
      if (titleEl) titleEl.textContent = 'Thêm giao dịch mới';
    }

    syncDateDisplay('addDate', 'addDateDisplay');
  };

  var _origOpenEditForm = window.openEditForm;
  window.openEditForm = async function (tx) {
    if (typeof _origOpenEditForm === 'function') { await _origOpenEditForm(tx); }
    syncDateDisplay('editDate', 'editDateDisplay');
  };

  // WRAP displayDetailTransactionsList — hiện tổng số giao dịch trên tiêu đề
  var _origDisplayDetailList = window.displayDetailTransactionsList;
  if (typeof _origDisplayDetailList === 'function') {
    window.displayDetailTransactionsList = function (txs) {
      var r = _origDisplayDetailList.apply(this, arguments);
      var title = document.getElementById('detailListTitle');
      if (title) {
        var n = (txs && txs.length) ? txs.length : 0;
        title.innerHTML = 'Giao dịch chi tiết <span style="font-size:0.72rem; color:var(--text-2); text-transform:none; font-weight:600;">(Tổng: ' + n + ')</span>';
      }
      return r;
    };
  }

  // WRAP displaySearchResults — sắp xếp theo ngày mới nhất + đếm tổng
  var _origDisplaySearch = window.displaySearchResults;
  if (typeof _origDisplaySearch === 'function') {
    window.displaySearchResults = function () {
      try {
        if (typeof cachedSearchResults !== 'undefined' && Array.isArray(cachedSearchResults)) {
          cachedSearchResults.sort(function (a, b) { return searchDateKey(b) - searchDateKey(a); });
        }
      } catch (e) {}
      var r = _origDisplaySearch.apply(this, arguments);
      var lbl = document.getElementById('searchCountLabel');
      if (lbl) {
        var n = 0;
        try { if (typeof cachedSearchResults !== 'undefined' && cachedSearchResults) n = cachedSearchResults.length; } catch (e) {}
        if (n > 0) {
          lbl.style.display = 'block';
          lbl.innerHTML = 'Kết quả <span style="font-size:0.72rem; color:var(--text-2); text-transform:none; font-weight:600;">(Tổng: ' + n + ')</span>';
        } else {
          lbl.style.display = 'none';
        }
      }
      return r;
    };
  }

  // ------------------------------------------------------------------
  // WRAP so sánh kỳ trước — HIỂN THỊ RÕ kỳ được so sánh.
  // ------------------------------------------------------------------
  var _origProcessReportData = window.processReportData;
  if (typeof _origProcessReportData === 'function') {
    window.processReportData = function (currentTx, prevTx, labels, incs, exps) {
      var r = _origProcessReportData.apply(this, arguments);
      try {
        var txt = window.__cmpText;
        if (txt && typeof getCompareHTML === 'function') {
          var tInc = 0, tExp = 0; (currentTx || []).forEach(function (i) { if (i.type === 'Thu nhập') tInc += i.amount; else tExp += i.amount; });
          var pInc = 0, pExp = 0; (prevTx || []).forEach(function (i) { if (i.type === 'Thu nhập') pInc += i.amount; else pExp += i.amount; });
          var tBal = tInc - tExp, pBal = pInc - pExp;
          var ei = document.getElementById('tab2IncomeCompare'); if (ei) ei.innerHTML = getCompareHTML(tInc, pInc, 'income', txt);
          var ee = document.getElementById('tab2ExpenseCompare'); if (ee) ee.innerHTML = getCompareHTML(tExp, pExp, 'expense', txt);
          var eb = document.getElementById('tab2BalanceCompare'); if (eb) eb.innerHTML = getCompareHTML(tBal, pBal, 'balance', txt);
        }
      } catch (e) {}
      return r;
    };
  }

  var _origLoadWeeklyReport = window.loadWeeklyReport;
  if (typeof _origLoadWeeklyReport === 'function') {
    window.loadWeeklyReport = function (weekStr) {
      try {
        var sd = (typeof getDateFromWeekString === 'function') ? getDateFromWeekString(weekStr) : null;
        if (sd && typeof getWeekNumber === 'function') {
          var psd = new Date(sd); psd.setDate(psd.getDate() - 7);
          window.__cmpText = 'so với tuần ' + getWeekNumber(psd);
        } else window.__cmpText = null;
      } catch (e) { window.__cmpText = null; }
      return _origLoadWeeklyReport.apply(this, arguments);
    };
  }

  var _origLoadMonthlyReport = window.loadMonthlyReport;
  if (typeof _origLoadMonthlyReport === 'function') {
    window.loadMonthlyReport = function (monthStr) {
      try {
        var parts = String(monthStr).split('-').map(Number);
        var year = parts[0], month = parts[1];
        var prevM = month - 1, prevY = year;
        if (prevM === 0) { prevM = 12; prevY = year - 1; }
        window.__cmpText = 'so với tháng ' + prevM + (prevY !== year ? '/' + prevY : '');
      } catch (e) { window.__cmpText = null; }
      return _origLoadMonthlyReport.apply(this, arguments);
    };
  }

  var _origLoadCustomReport = window.loadCustomReport;
  if (typeof _origLoadCustomReport === 'function') {
    window.loadCustomReport = function (startMonth, endMonth, year) {
      try { window.__cmpText = 'so với năm ' + (year - 1); } catch (e) { window.__cmpText = null; }
      return _origLoadCustomReport.apply(this, arguments);
    };
  }

  // ------------------------------------------------------------------
  // WRAP updateTimeNavUI — đồng bộ thanh điều khiển lịch (Tab 2)
  // ------------------------------------------------------------------
  var _origUpdateTimeNavUI = window.updateTimeNavUI;
  window.updateTimeNavUI = function () {
    if (typeof currentFilterMode !== 'undefined' && currentFilterMode === 'yearly') {
      var timeNav = document.getElementById('timeNavContainer');
      var customNav = document.getElementById('customFilterContainer');
      if (timeNav) timeNav.style.display = 'none';
      if (customNav) customNav.style.display = 'none';
      var lbl = document.getElementById('currentPeriodLabel');
      if (lbl) lbl.textContent = 'Năm ' + activePeriodDate.getFullYear();
      var selY = activePeriodDate.getFullYear();
      if (typeof loadCustomReport === 'function') loadCustomReport(1, 12, selY);
      try { syncCalendarControlBar(); } catch (e) {}
      try { refreshNavArrows(); } catch (e) {}
      return;
    }
    var r = (typeof _origUpdateTimeNavUI === 'function') ? _origUpdateTimeNavUI.apply(this, arguments) : undefined;
    try { syncCalendarControlBar(); } catch (e) {}
    try { refreshNavArrows(); } catch (e) {}
    return r;
  };

  function syncCalendarControlBar() {
    var bar = document.getElementById('calCtrlBar');
    if (!bar) return;
    var mode = (typeof currentFilterMode !== 'undefined') ? currentFilterMode : '';
    var isCal = (mode === 'weekly' || mode === 'monthly');
    var isYear = (mode === 'yearly');
    bar.style.display = (isCal || isYear) ? 'flex' : 'none';
    var toggle = document.getElementById('calToggleBtn');
    if (toggle) toggle.style.display = isYear ? 'none' : '';
    var label = document.getElementById('calCtrlLabel');
    var src = document.getElementById('currentPeriodLabel');
    if (label && src && src.textContent) label.textContent = src.textContent;
  }

  // ------------------------------------------------------------------
  // GIOI HAN DIEU HUONG: khong cho sang ky (tuan/thang) khong co du lieu.
  // ------------------------------------------------------------------
  function keyOf(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }

  function weekStartOf(date) {
    var sow = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay();
    var diff = (sow === 1) ? (day === 0 ? 6 : day - 1) : day;
    d.setDate(d.getDate() - diff);
    return d;
  }

  function nextPeriodStartKey() {
    if (currentFilterMode === 'monthly') {
      return keyOf(new Date(activePeriodDate.getFullYear(), activePeriodDate.getMonth() + 1, 1));
    }
    var ws = weekStartOf(activePeriodDate); ws.setDate(ws.getDate() + 7); return keyOf(ws);
  }
  function prevPeriodEndKey() {
    if (currentFilterMode === 'monthly') {
      return keyOf(new Date(activePeriodDate.getFullYear(), activePeriodDate.getMonth(), 0));
    }
    var ws = weekStartOf(activePeriodDate); ws.setDate(ws.getDate() - 1); return keyOf(ws);
  }

  // [FINANCE] fetchYearData la no-op -> monthDataCache rong -> bounds {null,null}.
  // refreshNavArrows ben duoi da xu ly an toan truong hop bounds null (chi chan tuong lai).
  function getNavDataBounds(force) {
    if (force) window.__navBoundsPromise = null;
    if (window.__navBoundsPromise) return window.__navBoundsPromise;
    window.__navBoundsPromise = (async function () {
      var minKey = null, maxKey = null;
      try {
        var yr = new Date().getFullYear();
        await fetchYearData(yr);
        for (var m = 1; m <= 12; m++) {
          var arr = (window.monthDataCache && window.monthDataCache[yr + '_' + m]) || [];
          arr.forEach(function (t) {
            if (!t || !t.date) return;
            var p = String(t.date).split('/');
            if (p.length !== 3) return;
            var k = parseInt(p[2], 10) * 10000 + parseInt(p[1], 10) * 100 + parseInt(p[0], 10);
            if (minKey === null || k < minKey) minKey = k;
            if (maxKey === null || k > maxKey) maxKey = k;
          });
        }
      } catch (e) {}
      return { minKey: minKey, maxKey: maxKey };
    })();
    return window.__navBoundsPromise;
  }
  window.__invalidateNavBounds = function () { window.__navBoundsPromise = null; };

  async function yearHasData(year) {
    if (!window.__yearHasDataCache) window.__yearHasDataCache = {};
    if (year in window.__yearHasDataCache) return window.__yearHasDataCache[year];
    var has = false;
    try {
      if (typeof getTransactionsInRange === 'function') {
        var txs = await getTransactionsInRange(new Date(year, 0, 1), new Date(year, 11, 31));
        has = !!(txs && txs.length);
      }
    } catch (e) { has = false; }
    window.__yearHasDataCache[year] = has;
    return has;
  }
  window.__yearHasData = yearHasData;

  function setArrowDisabled(ids, disabled) {
    ids.forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.disabled = !!disabled;
      b.classList.toggle('nav-disabled', !!disabled);
    });
  }

  async function refreshNavArrows() {
    var prevIds = ['calPrevBtn', 'prevPeriodBtn'];
    var nextIds = ['calNextBtn', 'nextPeriodBtn'];
    if (currentFilterMode === 'yearly') {
      var selY = activePeriodDate.getFullYear();
      setArrowDisabled(nextIds, selY >= new Date().getFullYear());
      var cache = window.__yearHasDataCache || {};
      if ((selY - 1) in cache) {
        setArrowDisabled(prevIds, !cache[selY - 1]);
      } else {
        setArrowDisabled(prevIds, true);
        yearHasData(selY - 1).then(function (has) {
          if (activePeriodDate.getFullYear() === selY) setArrowDisabled(prevIds, !has);
        });
      }
      return;
    }
    if (typeof currentFilterMode === 'undefined' || (currentFilterMode !== 'weekly' && currentFilterMode !== 'monthly')) {
      setArrowDisabled(prevIds, false); setArrowDisabled(nextIds, false); return;
    }
    var todayKey = keyOf(new Date());
    var nStart = nextPeriodStartKey();
    var pEnd = prevPeriodEndKey();
    setArrowDisabled(nextIds, nStart > todayKey);
    setArrowDisabled(prevIds, false);
    // [FINANCE] Khi bounds null (fetchYearData no-op) -> KHONG chan lui/toi theo bounds.
    // Chi giu quy tac chan tuong lai (nStart > todayKey). Qua khu luon cho phep.
    try {
      var b = await getNavDataBounds(false);
      if (b) {
        var dn = (nStart > todayKey) || (b.maxKey !== null && nStart > b.maxKey);
        var dp = (b.minKey !== null && pEnd < b.minKey);
        setArrowDisabled(nextIds, dn);
        setArrowDisabled(prevIds, dp);
      }
    } catch (e) {}
  }
  window.__refreshNavArrows = refreshNavArrows;

  window.calShift = function (dir) {
    if (typeof currentFilterMode === 'undefined') return;
    if (currentFilterMode === 'yearly') {
      if (dir > 0 && activePeriodDate.getFullYear() >= new Date().getFullYear()) { triggerHaptic('light'); return; }
      if (dir < 0) {
        var cache = window.__yearHasDataCache || {};
        var py = activePeriodDate.getFullYear() - 1;
        if ((py in cache) && !cache[py]) { triggerHaptic('light'); return; }
      }
      triggerHaptic('light');
      activePeriodDate.setFullYear(activePeriodDate.getFullYear() + dir);
      updateTimeNavUI();
      return;
    }
    if (currentFilterMode !== 'weekly' && currentFilterMode !== 'monthly') return;
    if (dir > 0 && nextPeriodStartKey() > keyOf(new Date())) { triggerHaptic('light'); return; }
    triggerHaptic('light');
    if (currentFilterMode === 'weekly') activePeriodDate.setDate(activePeriodDate.getDate() + dir * 7);
    else activePeriodDate.setMonth(activePeriodDate.getMonth() + dir);
    updateTimeNavUI();
  };

  // ------------------------------------------------------------------
  // MENU FAB (nút ＋)
  // ------------------------------------------------------------------
  window.toggleFabMenu = function () {
    triggerHaptic('light');
    var m = document.getElementById('fabMenu'), b = document.getElementById('fabBackdrop'), f = document.getElementById('fabBtn');
    if (!m) return;
    var open = m.classList.toggle('show');
    if (b) b.classList.toggle('show', open);
    if (f) f.classList.toggle('active', open);
  };
  window.closeFabMenu = function () {
    var m = document.getElementById('fabMenu'), b = document.getElementById('fabBackdrop'), f = document.getElementById('fabBtn');
    if (m) m.classList.remove('show');
    if (b) b.classList.remove('show');
    if (f) f.classList.remove('active');
  };
  window.fabAddIncome = function () { closeFabMenu(); window.openAddForm('Thu nhập'); };
  window.fabAddExpense = function () { closeFabMenu(); window.openAddForm('Chi tiêu'); };
  window.fabSearch = function () { closeFabMenu(); if (typeof window.openSearchModal === 'function') window.openSearchModal(); };
  window.fabSettings = function () { closeFabMenu(); openFullscreen('settingsPage'); };
  window.fabAbout = function () { closeFabMenu(); openFullscreen('aboutPage'); };

  // ------------------------------------------------------------------
  // TRANG TOAN MAN HINH (Cài đặt / Giới thiệu)
  // ------------------------------------------------------------------
  function openFullscreen(id) {
    triggerHaptic('light');
    var el = document.getElementById(id);
    if (el) { el.scrollTop = 0; el.classList.add('show'); document.body.classList.add('fullscreen-open'); }
  }
  window.openFullscreen = openFullscreen;
  window.closeFullscreen = function (id) {
    triggerHaptic('light');
    var el = document.getElementById(id);
    if (el) el.classList.remove('show');
    if (!document.querySelector('.fullscreen-page.show')) document.body.classList.remove('fullscreen-open');
  };

  // ------------------------------------------------------------------
  // KHỞI TẠO SAU KHI DOM SẴN SÀNG
  // ------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    var fabBtn = document.getElementById('fabBtn');
    if (fabBtn) fabBtn.onclick = window.toggleFabMenu;

    setupHeroDateNative();
    setupSearchTab();
    setupSearchCount();
    setupNavIndicator();

    window.addEventListener('resize', function () { try { positionNavIndicator(); } catch (e) {} });
    window.addEventListener('load', function () { try { positionNavIndicator(); } catch (e) {} });

    var calPrev = document.getElementById('calPrevBtn'); if (calPrev) calPrev.onclick = function () { window.calShift(-1); };
    var calNext = document.getElementById('calNextBtn'); if (calNext) calNext.onclick = function () { window.calShift(1); };
    var calWidget = document.getElementById('calendarWidget');
    if (calWidget && localStorage.getItem('calCollapsed') === 'true') calWidget.classList.add('cal-collapsed');
    var calToggle = document.getElementById('calToggleBtn');
    if (calToggle) calToggle.onclick = function () {
      triggerHaptic('light');
      if (!calWidget) return;
      var c = calWidget.classList.toggle('cal-collapsed');
      localStorage.setItem('calCollapsed', c);
    };

    setupDateDisplay('addDate', 'addDateDisplay');
    setupDateDisplay('editDate', 'editDateDisplay');

    addModalCloseX('detailModal', 'closeDetailModal');
    addModalCloseX('searchModal', 'closeSearchModal');
    addModalCloseX('addModal', 'closeAddForm');
    addModalCloseX('editModal', 'closeEditForm');
    addModalCloseX('iconPickerModal', 'closeIconPickerModal');
    addModalCloseX('pdfPreviewModal', 'closeAllModals');

    document.querySelectorAll('.fs-back').forEach(function (b) {
      if (!b.querySelector('.fs-back-label')) {
        var s = document.createElement('span');
        s.className = 'fs-back-label';
        s.textContent = 'Quay Lại';
        b.appendChild(s);
      }
    });
    enableSwipeBack('settingsPage');
    enableSwipeBack('aboutPage');

    try { syncCalendarControlBar(); } catch (e) {}
    try { refreshNavArrows(); } catch (e) {}
  });
})();
