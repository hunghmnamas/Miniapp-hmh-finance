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
// 12) Tang toc: tai CA NAM trong 1 request (bao cao Nam tu 24 -> 2 request);
//     nap ngam nam nay + nam truoc khi vao tab Bao cao de che do Nam mo tuc thi.
// 13) Tinh chinh toc do: CHI gom-tai ca nam cho bao cao Nam/Tuy chon (>=4 thang);
//     Tuan/Thang giu ban goc (1-2 request/thang, nhe hon) de khong giai bang thong
//     lam cham Tab 1. Khi xem 1 nam -> nap ngam nam so sanh ke tiep (selY-2) de
//     bam "lui" hien ra tuc thi (nam hien tai da co san, nam so sanh cung da san).
// 14) Am lich (Tab 2): ghep thuat toan Ho Ngoc Duc tu CLOUDFLARE, hien so ngay am
//     o goc phai tren moi o lich tuan/thang. KHONG dung toi lop du lieu finance.
// 15) Trang thai rong Tab 2: khi ky bao cao khong co giao dich -> an bieu do va
//     hien dong "Khong co du lieu bao cao" thay cho bieu do trong rong.
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
  // WRAP openTab — cập nhật vị trí indicator + nap ngam du lieu bao cao
  // ------------------------------------------------------------------
  var _origOpenTab = window.openTab;
  if (typeof _origOpenTab === 'function') {
    window.openTab = function (tabId) {
      var r = _origOpenTab.apply(this, arguments);
      try { positionNavIndicator(); } catch (e) {}
      try { if (tabId === 'tab2') prefetchYearsForReports(); } catch (e) {}
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
  // [FINANCE] fetchYearData — VO HIEU HOA (no-op).
  // ------------------------------------------------------------------
  function fetchYearData(year, force) { return Promise.resolve(false); }
  window.fetchYearData = fetchYearData;

  function prefetchYearIdle(year) {
    var y = parseInt(year, 10);
    if (!y || y < 2000) return;
    var runIdle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
    runIdle(function () { try { fetchYearData(y); } catch (e) {} });
  }
  window.__prefetchYearIdle = prefetchYearIdle;

  function prefetchYearsForReports() {
    var cy = new Date().getFullYear();
    prefetchYearIdle(cy);
    prefetchYearIdle(cy - 1);
  }
  window.__prefetchYearsForReports = prefetchYearsForReports;

  var _origGetTransactionsInRange = window.getTransactionsInRange;
  if (typeof _origGetTransactionsInRange === 'function') {
    window.getTransactionsInRange = async function (startDate, endDate) {
      try {
        if (startDate && endDate) {
          var sY = startDate.getFullYear(), eY = endDate.getFullYear();
          var monthsSpan = (eY - sY) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
          if (monthsSpan >= 4) {
            var jobs = [];
            for (var y = sY; y <= eY; y++) jobs.push(fetchYearData(y));
            await Promise.all(jobs);
          }
        }
      } catch (e) {}
      return _origGetTransactionsInRange.apply(this, arguments);
    };
  }

  // ------------------------------------------------------------------
  // ÂM LỊCH (Tab 2) — thuat toan Ho Ngoc Duc, tinh offline (mui gio +7).
  // Ghep tu MINIAPP-CLOUDFLARE. CHI hien so ngay am o goc phai tren moi o lich
  // tuan/thang; KHONG dung toi du lieu giao dich cua finance.
  // ------------------------------------------------------------------
  function lunarJdFromDate(dd, mm, yy) {
    var a = Math.floor((14 - mm) / 12);
    var y = yy + 4800 - a;
    var m = mm + 12 * a - 3;
    var jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
    return jd;
  }
  function lunarNewMoon(k) {
    var T = k / 1236.85; var T2 = T * T; var T3 = T2 * T; var dr = Math.PI / 180;
    var Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    var M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    var Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    var F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    var C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    var deltat;
    if (T < -11) deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
    else deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
    var JdNew = Jd1 + C1 - deltat;
    return Math.floor(JdNew + 0.5 + 7 / 24);
  }
  function lunarSunLongitude(jdn) {
    var T = (jdn - 2451545.5 - 7 / 24) / 36525; var T2 = T * T; var dr = Math.PI / 180;
    var M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    var L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    var DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    var L = L0 + DL; L = L * dr; L = L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
    return Math.floor(L / Math.PI * 6);
  }
  function lunarMonth11(yy) {
    var off = lunarJdFromDate(31, 12, yy) - 2415021;
    var k = Math.floor(off / 29.530588853);
    var nm = lunarNewMoon(k);
    if (lunarSunLongitude(nm) >= 9) nm = lunarNewMoon(k - 1);
    return nm;
  }
  function lunarLeapOffset(a11) {
    var k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    var last = 0; var i = 1;
    var arc = lunarSunLongitude(lunarNewMoon(k + i));
    do { last = arc; i++; arc = lunarSunLongitude(lunarNewMoon(k + i)); } while (arc != last && i < 14);
    return i - 1;
  }
  function convertSolar2Lunar(dd, mm, yy) {
    var dayNumber = lunarJdFromDate(dd, mm, yy);
    var k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
    var monthStart = lunarNewMoon(k + 1);
    if (monthStart > dayNumber) monthStart = lunarNewMoon(k);
    var a11 = lunarMonth11(yy); var b11 = a11; var lunarYear;
    if (a11 >= monthStart) { lunarYear = yy; a11 = lunarMonth11(yy - 1); }
    else { lunarYear = yy + 1; b11 = lunarMonth11(yy + 1); }
    var lunarDay = dayNumber - monthStart + 1;
    var diff = Math.floor((monthStart - a11) / 29);
    var lunarLeap = 0; var lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
      var leapMonthDiff = lunarLeapOffset(a11);
      if (diff >= leapMonthDiff) { lunarMonth = diff + 10; if (diff == leapMonthDiff) lunarLeap = 1; }
    }
    if (lunarMonth > 12) lunarMonth = lunarMonth - 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
  }
  window.convertSolar2Lunar = convertSolar2Lunar;

  // Tao/gan the <span.calendar-lunar> vao 1 o lich. Mung 1 hien "1/<thang am>";
  // mung 1 & ram (15) to mau tim (.lunar-special). Bo qua neu o da co am lich.
  function appendLunarCell(cell, dd, mm, yy) {
    if (!cell || cell.querySelector('.calendar-lunar')) return;
    var l = convertSolar2Lunar(dd, mm, yy);
    var text = (l.day === 1) ? (l.day + '/' + l.month) : String(l.day);
    var cls = 'calendar-lunar';
    if (l.day === 1 || l.day === 15) cls += ' lunar-special';
    var span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    cell.appendChild(span);
  }

  // Sau khi renderCalendar goc chay xong, quet cac o .calendar-day va chen am lich.
  // Tuan: 7 o lien tiep tu dateObj (bo qua o .empty neu co). Thang: doc so ngay
  // duong tu .calendar-date roi dung dateObj de biet thang/nam.
  function injectLunarIntoCalendar(dateObj, mode) {
    if (!dateObj) return;
    if (mode !== 'weekly' && mode !== 'monthly') return;
    var grid = document.getElementById('calendarGrid');
    if (!grid) return;
    var cells = grid.querySelectorAll('.calendar-day');
    if (mode === 'weekly') {
      var idx = 0;
      cells.forEach(function (cell) {
        if (cell.classList.contains('empty')) return;
        var d = new Date(dateObj);
        d.setDate(d.getDate() + idx);
        idx++;
        appendLunarCell(cell, d.getDate(), d.getMonth() + 1, d.getFullYear());
      });
    } else {
      var yy = dateObj.getFullYear();
      var mm = dateObj.getMonth();
      cells.forEach(function (cell) {
        if (cell.classList.contains('empty')) return;
        var dateEl = cell.querySelector('.calendar-date');
        if (!dateEl) return;
        var day = parseInt(dateEl.textContent, 10);
        if (!day) return;
        var d = new Date(yy, mm, day);
        appendLunarCell(cell, d.getDate(), d.getMonth() + 1, d.getFullYear());
      });
    }
  }
  window.__injectLunarIntoCalendar = injectLunarIntoCalendar;

  // WRAP renderCalendar — chen am lich sau khi lich goc ve xong.
  var _origRenderCalendar = window.renderCalendar;
  if (typeof _origRenderCalendar === 'function') {
    window.renderCalendar = function (txs, dateObj, mode) {
      var r = _origRenderCalendar.apply(this, arguments);
      try { injectLunarIntoCalendar(dateObj, mode); } catch (e) {}
      return r;
    };
  }

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
  // WRAP so sánh kỳ trước — HIỂN THỊ RÕ kỳ được so sánh + TRẠNG THÁI RỖNG.
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
      // TRANG THAI RONG: khong co giao dich nao trong ky -> an bieu do trong rong
      // va hien dong thong bao "Khong co du lieu bao cao". KHONG dung toi du lieu.
      try {
        var __hasData = Array.isArray(currentTx) && currentTx.length > 0;
        var __chartBox = document.querySelector('#tab2 .chart-container');
        var __ph = document.getElementById('placeholderTab2');
        if (!__hasData) {
          if (__chartBox) __chartBox.style.display = 'none';
          if (__ph) { __ph.textContent = 'Không có dữ liệu báo cáo'; __ph.style.display = 'block'; }
        } else {
          if (__ph) __ph.style.display = 'none';
          if (__chartBox) __chartBox.style.display = 'block';
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
      try { prefetchYearIdle(selY - 2); } catch (e) {}
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
