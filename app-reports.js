// =====================================================================
// PHẦN 2/5: TAB 1 GIAO DỊCH + CÁC BÁO CÁO (calendar, charts, detail modal)
// =====================================================================

// ---------------- HELPER: SẮP XẾP GIAO DỊCH MỚI -> CŨ ----------------
function sortTxByDateDesc(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.sort((a, b) => {
    const pa = (a && a.date) ? a.date.split('/') : ['0','0','0'];
    const pb = (b && b.date) ? b.date.split('/') : ['0','0','0'];
    const da = new Date(parseInt(pa[2], 10), parseInt(pa[1], 10) - 1, parseInt(pa[0], 10));
    const db = new Date(parseInt(pb[2], 10), parseInt(pb[1], 10) - 1, parseInt(pb[0], 10));
    if (db - da !== 0) return db - da;
    return String(b.id).localeCompare(String(a.id));
  });
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
  // Trong lúc chờ tải dữ liệu, hiển thị dấu — mờ thay cho 0 ₫ cho hợp lý
  ['heroExpenseMain','heroIncome','heroBalanceSub'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<span style="opacity:0.45;">—</span>'; });
  const heroCmpEl = document.getElementById('heroExpenseCompare'); if (heroCmpEl) heroCmpEl.innerHTML = '';
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
// Lấy ngày đầu tuần (theo cài đặt Thứ 2 / Chủ nhật) của tuần chứa `date`
function getWeekStart(date) {
    const startDay = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dow = d.getDay();
    const diff = (startDay === 1) ? ((dow === 0) ? -6 : (1 - dow)) : (-dow);
    d.setDate(d.getDate() + diff);
    return d;
}

// Số tuần theo chuẩn ISO (luôn đúng "tuần lịch"), đồng nhất cho cả kiểu T2 và CN
function getWeekNumber(date) {
    const startDay = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    const start = getWeekStart(date);
    const thursday = new Date(start);
    thursday.setDate(start.getDate() + (startDay === 1 ? 3 : 4));
    const t = new Date(Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate()));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
}

function formatWeekInput(date) {
    const startDay = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    const start = getWeekStart(date);
    const thursday = new Date(start);
    thursday.setDate(start.getDate() + (startDay === 1 ? 3 : 4));
    return `${thursday.getFullYear()}-W${String(getWeekNumber(date)).padStart(2, '0')}`;
}

function getDateFromWeekString(weekStr) {
    const startDay = parseInt(localStorage.getItem('settingStartOfWeek') || '1', 10);
    if (!weekStr) return null;
    const [yearStr, weekPart] = weekStr.split('-W');
    if (!yearStr || !weekPart) return null;
    const year = parseInt(yearStr); const week = parseInt(weekPart);
    const jan4 = new Date(year, 0, 4);
    const jan4Dow = jan4.getDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - (jan4Dow - 1));
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + (week - 1) * 7);
    if (startDay === 0) monday.setDate(monday.getDate() - 1);
    return monday;
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

// ---------------- ĐỊNH DẠNG TIỀN RÚT GỌN CHO Ô LỊCH (chuẩn quốc tế K/M/B, không xuống dòng) ----------------
function formatCalShort(value) {
    let num = parseInt(value.toString().replace(/[^0-9-]/g, '')) || 0;
    const sign = num < 0 ? '-' : '';
    const absNum = Math.abs(num);
    if (absNum < 1000) return sign + absNum.toString();
    const fmt = (n) => (Math.round(n * 100) / 100).toString();
    if (absNum >= 1000000000) return sign + fmt(absNum / 1000000000) + 'B';
    if (absNum >= 1000000) return sign + fmt(absNum / 1000000) + 'M';
    return sign + fmt(absNum / 1000) + 'K';
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
            const bal = data.inc - data.exp;
            let balHTML = `<span class="calendar-balance neutral">0</span>`;
            if (data.inc > 0 || data.exp > 0) {
                let incStr = data.inc > 0 ? `<span class="calendar-balance positive cal-row-amt">+${formatCalShort(data.inc)}</span>` : '';
                let expStr = data.exp > 0 ? `<span class="calendar-balance negative cal-row-amt">-${formatCalShort(data.exp)}</span>` : '';
                balHTML = `<div class="cal-amt-col">${incStr}${expStr}</div>`;
            }

            const dayDiv = document.createElement('div'); dayDiv.className = 'calendar-day';
            dayDiv.innerHTML = `<span class="calendar-date">${d.getDate()}</span>${balHTML}`;
            
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
                let incStr2 = data.inc > 0 ? `<span class="calendar-balance positive cal-row-amt">+${formatCalShort(data.inc)}</span>` : '';
                let expStr2 = data.exp > 0 ? `<span class="calendar-balance negative cal-row-amt">-${formatCalShort(data.exp)}</span>` : '';
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
  
  const txs = sortTxByDateDesc(cachedChartData.txs.filter(t => t.category === cat));
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
    
    const dayTxs = sortTxByDateDesc(allTxs.filter(t => { 
        if (!t || !t.date) return false; 
        const parts = t.date.split('/'); 
        if (parts.length !== 3) return false; 
        return parseInt(parts[0], 10) === dNum && parseInt(parts[1], 10) === mNum && parseInt(parts[2], 10) === yNum; 
    }));

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
