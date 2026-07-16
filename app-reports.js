
// Lấy font app từ biến CSS --app-font trong index.html/styles.css để Chart.js/canvas tự đổi theo font cấu hình.
function getAppFontFamily() {
    try {
        const cssFont = getComputedStyle(document.documentElement)
            .getPropertyValue('--app-font')
            .trim();

        return cssFont || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    } catch (e) {
        return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    }
}

function applyAppFontToCharts() {
    const appFont = getAppFontFamily();
    if (window.Chart && Chart.defaults && Chart.defaults.font) {
        Chart.defaults.font.family = appFont;
    }
    return appFont;
}

// ============================================================================
// app-reports.js — Tab 1 (giao dịch trong ngày), Tab 2 (báo cáo tuần/tháng/
//   năm/tùy chọn: lịch, biểu đồ, chi tiết danh mục & theo ngày) và modal Tìm kiếm.
// Phụ thuộc: app-core.js (tiện ích chung, fetchMonthData, renderTxCard) &
//   currency.js (formatCurrencyWithUnit). Nạp sau app-core.js và currency.js.
// ============================================================================

// Giữ nút chuyển trang trong tầm nhìn sau khi đổi trang (tránh bị nhảy vị trí,
// phải kéo xuống mới thấy nút). Cuộn tối thiểu để lộ khối phân trang.
function scrollPager(id){ const el = document.getElementById(id); if(el){ try { el.scrollIntoView({ block: 'nearest' }); } catch(e){} } }

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

  // CACHE NHIỀU NGÀY: đã tải ngày nào thì dùng lại, không gọi mạng (trừ khi ép làm mới)
  if (!window.dayTxCache) window.dayTxCache = {};
  if (!forceRefresh) {
    if (cachedTransactions && cachedTransactions.cacheKey === cacheKey) { displayTransactions(); return; }
    if (window.dayTxCache[cacheKey]) { cachedTransactions = window.dayTxCache[cacheKey]; currentPageTab1 = 1; displayTransactions(); return; }
  }

  showLoading(true, 'tab1');
  try {
    const dNum = parseInt(d, 10); const mNum = parseInt(m, 10); const yNum = parseInt(y, 10);
    const pdNum = currDateObj.getDate(); const pmNum = currDateObj.getMonth() + 1; const pyNum = currDateObj.getFullYear();
    
    let dataCurrMonth, dataPrevMonth;
    if (mNum === pmNum && yNum === pyNum) { dataCurrMonth = await fetchMonthData(mNum, yNum); dataPrevMonth = dataCurrMonth; } 
    else { [dataCurrMonth, dataPrevMonth] = await Promise.all([ fetchMonthData(mNum, yNum), fetchMonthData(pmNum, pyNum) ]); }

    let dataCurr = dataCurrMonth.filter(t => { if(!t || !t.date) return false; const pts = t.date.split('/'); return parseInt(pts[0], 10) === dNum && parseInt(pts[1], 10) === mNum && parseInt(pts[2], 10) === yNum; });
    let dataPrev = dataPrevMonth.filter(t => { if(!t || !t.date) return false; const pts = t.date.split('/'); return parseInt(pts[0], 10) === pdNum && parseInt(pts[1], 10) === pmNum && parseInt(pts[2], 10) === pyNum; });
    dataCurr.sort((a,b) => b.id.localeCompare(a.id)); dataPrev.sort((a,b) => b.id.localeCompare(a.id));
    
    cachedTransactions = { cacheKey, data: dataCurr, prevData: dataPrev, compareSuffix: compareSuffix };
    window.dayTxCache[cacheKey] = cachedTransactions;
    currentPageTab1 = 1; displayTransactions();
  } catch (err) {
  cachedTransactions = { cacheKey, data: [], prevData: [], compareSuffix: compareSuffix };
  displayTransactions();
  showToast(navigator.onLine ? ('Lỗi tải giao dịch: ' + err.message) : 'Mất kết nối mạng. Kiểm tra Internet rồi thử lại.', 'error');
}
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
    const tCls = item.type === 'Thu nhập' ? 'income' : 'expense';
    const stt = (currentPageTab1 - 1) * itemsPerPage + index + 1;
    const card = document.createElement('div'); card.className = `tx-card ${tCls}`;
    card.innerHTML = renderTxCard(item, stt);
    container.appendChild(card);
  });
  
  document.getElementById('pageInfo').textContent = `${currentPageTab1} / ${tPages}`;
  document.getElementById('prevPage').disabled = currentPageTab1 === 1;
  document.getElementById('nextPage').disabled = currentPageTab1 === tPages;
  document.getElementById('prevPage').onclick = () => { triggerHaptic('light'); if(currentPageTab1 > 1) { currentPageTab1--; displayTransactions(); scrollPager('pagination'); } };
  document.getElementById('nextPage').onclick = () => { triggerHaptic('light'); if(currentPageTab1 < tPages) { currentPageTab1++; displayTransactions(); scrollPager('pagination'); } };
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
            for (let m = sM; m <= eM; m++) { fetchPromises.push((async () => { let monthData = await fetchMonthData(m, y); return { y, m, data: monthData }; })()); }
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
    } catch (e) {
        throw new Error(navigator.onLine ? ('Lỗi tải dữ liệu báo cáo: ' + e.message) : 'Mất kết nối mạng. Kiểm tra Internet rồi thử lại.');
    }
}

// ---------------- ÂM LỊCH (thuật toán Hồ Ngọc Đức, tính offline, múi giờ +7) ----------------
// Chỉ dùng để HIỂN THỊ số ngày âm trên lịch Tab 2. Không đụng dữ liệu chi tiêu.
function lunarJdFromDate(dd, mm, yy) {
    const a = Math.floor((14 - mm) / 12);
    const y = yy + 4800 - a;
    const m = mm + 12 * a - 3;
    let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
    return jd;
}
function lunarNewMoon(k) {
    const T = k / 1236.85; const T2 = T * T; const T3 = T2 * T; const dr = Math.PI / 180;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    let deltat;
    if (T < -11) deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
    else deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
    const JdNew = Jd1 + C1 - deltat;
    return Math.floor(JdNew + 0.5 + 7 / 24);
}
function lunarSunLongitude(jdn) {
    const T = (jdn - 2451545.5 - 7 / 24) / 36525; const T2 = T * T; const dr = Math.PI / 180;
    const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    let L = L0 + DL; L = L * dr; L = L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
    return Math.floor(L / Math.PI * 6);
}
function lunarMonth11(yy) {
    const off = lunarJdFromDate(31, 12, yy) - 2415021;
    const k = Math.floor(off / 29.530588853);
    let nm = lunarNewMoon(k);
    if (lunarSunLongitude(nm) >= 9) nm = lunarNewMoon(k - 1);
    return nm;
}
function lunarLeapOffset(a11) {
    const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last = 0; let i = 1;
    let arc = lunarSunLongitude(lunarNewMoon(k + i));
    do { last = arc; i++; arc = lunarSunLongitude(lunarNewMoon(k + i)); } while (arc != last && i < 14);
    return i - 1;
}
function convertSolar2Lunar(dd, mm, yy) {
    const dayNumber = lunarJdFromDate(dd, mm, yy);
    const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
    let monthStart = lunarNewMoon(k + 1);
    if (monthStart > dayNumber) monthStart = lunarNewMoon(k);
    let a11 = lunarMonth11(yy); let b11 = a11; let lunarYear;
    if (a11 >= monthStart) { lunarYear = yy; a11 = lunarMonth11(yy - 1); }
    else { lunarYear = yy + 1; b11 = lunarMonth11(yy + 1); }
    const lunarDay = dayNumber - monthStart + 1;
    const diff = Math.floor((monthStart - a11) / 29);
    let lunarLeap = 0; let lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
        const leapMonthDiff = lunarLeapOffset(a11);
        if (diff >= leapMonthDiff) { lunarMonth = diff + 10; if (diff == leapMonthDiff) lunarLeap = 1; }
    }
    if (lunarMonth > 12) lunarMonth = lunarMonth - 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
}

function renderCalendar(txs, dateObj, mode) {
    const grid = document.getElementById('calendarGrid');
    const box = document.getElementById('calendarStatbox');

    if (mode !== 'monthly' && mode !== 'weekly') { box.style.display = 'none'; return; }
    box.style.display = 'block'; grid.innerHTML = '';

    // Gom dữ liệu thu/chi theo từng ngày
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
    const todayKey = formatDateToYYYYMMDD(new Date());

    // ============ LỊCH TUẦN ============
    if (mode === 'weekly') {
        if (header) {
            header.style.display = 'grid';
            if (startOfWeek === 1) { header.innerHTML = `<span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>`; }
            else { header.innerHTML = `<span>CN</span><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span>`; }
        }
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        grid.style.borderTop = '1px solid var(--border-color)';
        grid.style.borderRadius = '10px';
        for (let i = 0; i < 7; i++) {
            const d = new Date(dateObj); d.setDate(d.getDate() + i);
            const dayKey = formatDateToYYYYMMDD(d);
            const data = dailyData[dayKey] || { inc: 0, exp: 0 };
            let balHTML = `<span class="calendar-balance neutral">0</span>`;
            if (data.inc > 0 || data.exp > 0) {
                const incObj = data.inc > 0 ? formatCurrencyWithUnit(data.inc) : null;
                const expObj = data.exp > 0 ? formatCurrencyWithUnit(data.exp) : null;
                let incStr = incObj ? `<span class="calendar-balance positive cal-row-amt">${incObj.val}${incObj.unit.trim()==='₫'?'':incObj.unit}</span>` : '';
                let expStr = expObj ? `<span class="calendar-balance negative cal-row-amt">${expObj.val}${expObj.unit.trim()==='₫'?'':expObj.unit}</span>` : '';
                balHTML = `<div class="cal-amt-col">${incStr}${expStr}</div>`;
            }

            const dayDiv = document.createElement('div'); dayDiv.className = 'calendar-day';
            if (dayKey === todayKey) dayDiv.classList.add('today');
            // ÂM LỊCH (PA1): số âm nhỏ ở góc phải trên (đồng bộ với lịch tháng)
            const lunarW = convertSolar2Lunar(d.getDate(), d.getMonth() + 1, d.getFullYear());
            const lunarTextW = (lunarW.day === 1) ? `${lunarW.day}/${lunarW.month}` : String(lunarW.day);
            let lunarClsW = 'calendar-lunar';
            if (lunarW.day === 1 || lunarW.day === 15) lunarClsW += ' lunar-special';
            const lunarHTMLW = `<span class="${lunarClsW}">${lunarTextW}</span>`;
            dayDiv.innerHTML = `<span class="calendar-date">${d.getDate()}</span>${lunarHTMLW}${balHTML}`;

            dayDiv.onclick = () => { triggerHaptic('light'); document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected-day')); dayDiv.classList.add('selected-day'); openDailyDetailView(d.getDate(), d.getMonth() + 1, d.getFullYear(), txs); };
            grid.appendChild(dayDiv);
        }
    } else {
    // ============ LỊCH THÁNG ============
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

        // Xác định TUẦN HIỆN TẠI (tuần chứa hôm nay) để tô nền pill khác màu cho cả tuần.
        // diffToStart = số ngày lùi từ hôm nay về đầu tuần (theo cài đặt đầu tuần T2 hoặc CN).
        const todayW = new Date(); todayW.setHours(0,0,0,0);
        const dowW = todayW.getDay();
        const diffToStart = (startOfWeek === 1) ? ((dowW === 0) ? 6 : dowW - 1) : dowW;
        const weekStart = new Date(todayW); weekStart.setDate(todayW.getDate() - diffToStart); weekStart.setHours(0,0,0,0);
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(0,0,0,0);

        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i); const dayKey = formatDateToYYYYMMDD(d);
            const data = dailyData[dayKey] || { inc: 0, exp: 0 };
            let balHTML = `<span class="calendar-balance neutral">0</span>`;
            if (data.inc > 0 || data.exp > 0) {
                const incObj2 = data.inc > 0 ? formatCurrencyWithUnit(data.inc) : null;
                const expObj2 = data.exp > 0 ? formatCurrencyWithUnit(data.exp) : null;
                let incStr2 = incObj2 ? `<span class="calendar-balance positive cal-row-amt">${incObj2.val}${incObj2.unit.trim()==='₫'?'':incObj2.unit}</span>` : '';
                let expStr2 = expObj2 ? `<span class="calendar-balance negative cal-row-amt">${expObj2.val}${expObj2.unit.trim()==='₫'?'':expObj2.unit}</span>` : '';
                balHTML = `<div class="cal-amt-col">${incStr2}${expStr2}</div>`;
            }

            let classes = ['calendar-day'];
            if (isCurrentMonth && today.getDate() === i) classes.push('today');
            // Ô ngày nằm trong tuần hiện tại -> gắn class current-week để tô nền pill
            const cellDate = new Date(year, month, i); cellDate.setHours(0,0,0,0);
            if (cellDate >= weekStart && cellDate <= weekEnd) classes.push('current-week');

            // ÂM LỊCH (PA1): số âm nhỏ ở góc phải trên; mùng 1 hiện dạng "1/<tháng>"; tô đỏ mùng 1 & rằm.
            const lunar = convertSolar2Lunar(i, month + 1, year);
            const lunarText = (lunar.day === 1) ? `${lunar.day}/${lunar.month}` : String(lunar.day);
            let lunarCls = 'calendar-lunar';
            if (lunar.day === 1 || lunar.day === 15) lunarCls += ' lunar-special';
            const lunarHTML = `<span class="${lunarCls}">${lunarText}</span>`;

            const dayDiv = document.createElement('div'); dayDiv.className = classes.join(' ');
            dayDiv.innerHTML = `<span class="calendar-date">${i}</span>${lunarHTML}${balHTML}`;

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
    
    // Khi kỳ báo cáo KHÔNG có giao dịch nào -> ẩn 2 biểu đồ trống (Thu nhập & Chi tiêu +
    // Chi tiêu theo danh mục) và hiện dòng thông báo gọn gàng. Giữ nguyên các thẻ tổng & lịch.
    const chartContainerEl = document.querySelector('#tab2 .chart-container');
    const reportPlaceholderEl = document.getElementById('placeholderTab2');
    if (!currentTx || currentTx.length === 0) {
        if (window.mChart) { window.mChart.destroy(); window.mChart = null; }
        if (window.pChart) { window.pChart.destroy(); window.pChart = null; }
        if (chartContainerEl) chartContainerEl.style.display = 'none';
        if (reportPlaceholderEl) { reportPlaceholderEl.textContent = 'Không có dữ liệu báo cáo'; reportPlaceholderEl.style.display = 'block'; }
        return;
    }
    if (reportPlaceholderEl) reportPlaceholderEl.style.display = 'none';
    if (chartContainerEl) chartContainerEl.style.display = 'block';
    
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

    const appFont = applyAppFontToCharts();
    window.mChart = new Chart(ctx, { 
        type: window.currentChartType || 'bar', 
        data: { labels: labels, datasets: [ dsInc, dsExp ]}, 
        options: { 
            devicePixelRatio: 4, responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } }, 
            scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10, family: appFont } } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: { size: 10, family: appFont }, callback: v => {
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
  const appFont = applyAppFontToCharts();
  const ctx = document.getElementById('monthlyPieChart').getContext('2d');
  if(window.pChart) window.pChart.destroy();
  data.sort((a,b) => b.amount - a.amount);
  const amts = data.map(i=>i.amount); const lbls = data.map(i=>i.category); const bg = data.map((_,i)=>getColorByIndex(i));
  const total = amts.reduce((a,b)=>a+b,0);
  
  window.pChart = new Chart(ctx, { type: 'doughnut', data: { labels:lbls, datasets: [{data:amts, backgroundColor:bg, borderWidth: 0, hoverOffset: 4}] }, options: { devicePixelRatio: 4, cutout:'75%', layout: {padding: 8}, plugins: { legend: {display:false}, tooltip: { enabled: false } }, onClick: (event, activeEls) => { if (activeEls && activeEls.length > 0) { const activeIdx = activeEls[0].index; const catName = lbls[activeIdx]; showCategoryDetail(catName); } } }, plugins: [{ id:'cText', afterDraw(c) { const {ctx} = c; ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; const activeEls = c.getActiveElements(); if (activeEls && activeEls.length > 0) { const activeIdx = activeEls[0].index; const catName = c.data.labels[activeIdx]; const catAmt = c.data.datasets[0].data[activeIdx]; const color = c.data.datasets[0].backgroundColor[activeIdx]; const pct = total > 0 ? ((catAmt/total)*100).toFixed(1) : 0; let shortName = catName.length > 14 ? catName.substring(0, 14) + '...' : catName; ctx.fillStyle = '#94A3B8'; ctx.font = `600 9px ${appFont}`; ctx.fillText(shortName, c.width/2, c.height/2 - 12); ctx.fillStyle = color; ctx.font = `800 12px ${appFont}`; 
  const catObj = formatCurrencyWithUnit(catAmt);
  const displayAmt = isPrivacyActive ? '***' : catObj.val + catObj.unit;
  ctx.fillText(displayAmt, c.width/2, c.height/2 + 4); ctx.fillStyle = '#94A3B8'; ctx.font = `500 9px ${appFont}`; ctx.fillText(`(${pct}%)`, c.width/2, c.height/2 + 16); } else { ctx.fillStyle='#94A3B8'; ctx.font=`500 10px ${appFont}`; ctx.fillText('Tổng chi', c.width/2, c.height/2 - 10); ctx.fillStyle='#F43F5E'; ctx.font=`800 13px ${appFont}`; 
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
  const detailModal = document.getElementById('detailModal');
  document.getElementById('modalOverlay').classList.add('show');
  setTimeout(() => detailModal.classList.add('show'), 10);
  
  document.getElementById('detailModalTitle').textContent = cat.toUpperCase(); 
  document.getElementById('detailModalTitle').style.color = 'var(--primary)';

  // Sort theo logic thời gian (giống tuần/tháng): mới nhất -> cũ nhất dựa trên date,
  // nếu trùng ngày thì ưu tiên id mới hơn.
  const parseTxDate = (t) => {
    if (!t || !t.date) return null;
    const parts = String(t.date).split('/');
    if (parts.length !== 3) return null;
    const dd = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) - 1;
    const yy = parseInt(parts[2], 10);
    if (Number.isNaN(dd) || Number.isNaN(mm) || Number.isNaN(yy)) return null;
    return new Date(yy, mm, dd);
  };
  
  const txs = cachedChartData.txs
    .filter(t => t.category === cat)
    .sort((a, b) => {
      const da = parseTxDate(a);
      const db = parseTxDate(b);
      const ta = da ? da.getTime() : 0;
      const tb = db ? db.getTime() : 0;
      if (tb !== ta) return tb - ta; // ngày mới -> cũ
      // cùng ngày: id mới -> cũ
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

  let totalInc = 0, totalExp = 0;
  txs.forEach(t => { if(t.type === 'Thu nhập') totalInc += t.amount; else totalExp += t.amount; });
  
  const incObj = formatCurrencyWithUnit(totalInc);
  document.getElementById('detailTotalIncome').innerHTML = `<span>+</span>${incObj.val}<span>${incObj.unit}</span>`;
  const expObj = formatCurrencyWithUnit(totalExp);
  document.getElementById('detailTotalExpense').innerHTML = `<span>−</span>${expObj.val}<span>${expObj.unit}</span>`;

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
}).sort((a, b) => b.id.localeCompare(a.id)); // mới nhất → cũ nhất

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
    document.getElementById('detailTotalExpense').innerHTML = `<span>−</span>${expObj.val}<span>${expObj.unit}</span>`;

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
    
    const appFont = applyAppFontToCharts();
    window.dChart = new Chart(ctx, { 
        type: 'doughnut', data: { labels:lbls, datasets: [{data:amts, backgroundColor:bg, borderWidth: 0, hoverOffset: 4}] }, 
        options: { devicePixelRatio: 4, cutout:'75%', layout: {padding: 8}, plugins: { legend: {display:false}, tooltip: { enabled: false } } },
        plugins: [{ id:'cText2', afterDraw(c) { const {ctx} = c; ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#94A3B8'; ctx.font=`500 9px ${appFont}`; ctx.fillText('Tổng chi', c.width/2, c.height/2 - 8); ctx.fillStyle='#F43F5E'; ctx.font=`800 11px ${appFont}`; 
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
    const tCls = item.type === 'Thu nhập' ? 'income' : 'expense'; const stt = (currentPageCategory - 1) * itemsPerPage + index + 1; 
    const card = document.createElement('div'); card.className = `tx-card ${tCls}`; 
    card.innerHTML = renderTxCard(item, stt); list.appendChild(card); 
  });
  document.getElementById('pageInfoDetail').textContent = `${currentPageCategory} / ${tPages}`; document.getElementById('prevPageDetail').disabled = currentPageCategory === 1; document.getElementById('nextPageDetail').disabled = currentPageCategory === tPages; document.getElementById('prevPageDetail').onclick = () => { triggerHaptic('light'); if(currentPageCategory > 1) { currentPageCategory--; displayDetailTransactionsList(txs); scrollPager('paginationDetail'); } }; document.getElementById('nextPageDetail').onclick = () => { triggerHaptic('light'); if(currentPageCategory < tPages) { currentPageCategory++; displayDetailTransactionsList(txs); scrollPager('paginationDetail'); } };
  document.querySelectorAll('#detailTransactionsContainer .edit-btn').forEach(btn => btn.onclick = () => { closeDetailModal(); setTimeout(() => openEditForm(txs.find(i => String(i.id) === btn.getAttribute('data-id'))), 350); }); 
  document.querySelectorAll('#detailTransactionsContainer .delete-btn').forEach(btn => btn.onclick = () => { closeDetailModal(); setTimeout(() => deleteTransaction(btn.getAttribute('data-id')), 350); });
}

window.closeDetailModal = function() {
    triggerHaptic('light'); document.querySelectorAll('.calendar-day.selected-day').forEach(el => el.classList.remove('selected-day')); document.getElementById('detailModal').classList.remove('show'); setTimeout(() => document.getElementById('modalOverlay').classList.remove('show'), 300);
};

// ----- BÁO CÁO TUẦN -----
async function loadWeeklyReport(weekStr) {
  showLoading(true, 'tab2');
  document.querySelector('#tab2 .chart-container').style.display='none';
  document.getElementById('placeholderTab2').style.display='none';
  try {
    const startDate = getDateFromWeekString(weekStr);
    if (!startDate) throw new Error("Dữ liệu tuần không hợp lệ");
    const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 6);
    const prevStartDate = new Date(startDate); prevStartDate.setDate(prevStartDate.getDate() - 7);
    const prevEndDate = new Date(endDate); prevEndDate.setDate(prevEndDate.getDate() - 7);
    const [currentTx, prevTx] = await Promise.all([
      getTransactionsInRange(startDate, endDate),
      getTransactionsInRange(prevStartDate, prevEndDate)
    ]);
    document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (${formatDateToDDMMYYYY(startDate).substring(0,5)} - ${formatDateToDDMMYYYY(endDate).substring(0,5)})`;
    const dayNames = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
    const labels = [], incs = [], exps = [];
    for(let i=0; i<7; i++) {
      const d = new Date(startDate); d.setDate(d.getDate() + i);
      labels.push(`${dayNames[d.getDay()]}\nNgày ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`);
      const dateStr = formatDateToDDMMYYYY(d);
      const dayTx = currentTx.filter(t => t.date === dateStr);
      let inc = 0, exp = 0; dayTx.forEach(t => { if(t.type==='Thu nhập') inc+=t.amount; else exp+=t.amount; });
      incs.push(inc); exps.push(exp);
    }
    renderCalendar(currentTx, startDate, 'weekly');
    processReportData(currentTx, prevTx, labels, incs, exps);
    cachedChartData = { mode: 'weekly', txs: currentTx, periodStr: weekStr };
  } catch(e) { showToast(e.message, 'error'); }
  finally { showLoading(false, 'tab2'); }
}

// ----- BÁO CÁO THÁNG -----
async function loadMonthlyReport(monthStr) {
  showLoading(true, 'tab2');
  document.querySelector('#tab2 .chart-container').style.display='none';
  document.getElementById('placeholderTab2').style.display='none';
  try {
    const [year, month] = monthStr.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    let prevM = month - 1; let prevY = year;
    if(prevM === 0) { prevM = 12; prevY = year - 1; }
    const prevStartDate = new Date(prevY, prevM - 1, 1);
    const prevEndDate = new Date(prevY, prevM, 0);
    const [currentTx, prevTx] = await Promise.all([
      getTransactionsInRange(startDate, endDate),
      getTransactionsInRange(prevStartDate, prevEndDate)
    ]);
    document.getElementById('chartTitleTab2').textContent = `Thu nhập & Chi tiêu (Tháng ${month}/${year})`;
    const labels = [`Tháng ${month}`], incs = [0], exps = [0];
    currentTx.forEach(t => { if(t.type==='Thu nhập') incs[0]+=t.amount; else exps[0]+=t.amount; });
    renderCalendar(currentTx, startDate, 'monthly');
    processReportData(currentTx, prevTx, labels, incs, exps);
    cachedChartData = { mode: 'monthly', txs: currentTx, periodStr: monthStr };
  } catch(e) { showToast(e.message, 'error'); }
  finally { showLoading(false, 'tab2'); }
}
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
        const tCls = item.type==='Thu nhập'?'income':'expense'; const stt = (currentPageSearch - 1) * itemsPerPage + index + 1; 
        const card = document.createElement('div'); card.className = `tx-card ${tCls}`; 
        card.innerHTML = renderTxCard(item, stt); list.appendChild(card); 
    });
    document.getElementById('pageInfoSearch').textContent = `${currentPageSearch} / ${tPages}`; document.getElementById('prevPageSearch').disabled = currentPageSearch === 1; document.getElementById('nextPageSearch').disabled = currentPageSearch === tPages; document.getElementById('prevPageSearch').onclick = () => { triggerHaptic('light'); if(currentPageSearch > 1) { currentPageSearch--; displaySearchResults(); scrollPager('paginationSearch'); } }; document.getElementById('nextPageSearch').onclick = () => { triggerHaptic('light'); if(currentPageSearch < tPages) { currentPageSearch++; displaySearchResults(); scrollPager('paginationSearch'); } };
    document.querySelectorAll('#searchResultsContainer .edit-btn').forEach(btn => btn.onclick = () => { closeSearchModal(); setTimeout(() => openEditForm(data.find(i => String(i.id) === btn.getAttribute('data-id'))), 350); }); 
    document.querySelectorAll('#searchResultsContainer .delete-btn').forEach(btn => btn.onclick = () => { closeSearchModal(); setTimeout(() => deleteTransaction(btn.getAttribute('data-id')), 350); });
}
