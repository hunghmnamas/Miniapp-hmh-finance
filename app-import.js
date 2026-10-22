// ============================================================================
// app-import.js — R50: NHẬP FILE CSV (bản chính).
// Thêm giao dịch lịch sử từ file CSV ngoài hoặc từ file CSV do chính app xuất.
// KHÔNG dùng submitTx theo từng dòng (nó tải lại toàn bộ dữ liệu, toast và
// render lại mỗi dòng): vòng này tải toàn bộ dữ liệu MỘT lần để cấp id, rồi
// PUT trực tiếp từng giao dịch mới qua secureFetch với _action addTransaction.
// KHÔNG tự tạo từ khóa/danh mục: danh mục lạ vẫn hiển thị tốt nhờ màu + icon
// theo tên (hash), từ khóa là do người dùng quản lý.
// KHÔNG ghi dữ liệu thật từ script/test: ghi thật chỉ xảy ra sau khi người dùng
// bấm xác nhận ở bước xem trước trong app.
// ============================================================================

(function () {
  'use strict';

  // ---------- Hằng số định dạng ----------
  var FORMAT_A_HEADERS = ['Ngày', 'Danh mục', 'Tiền', 'Tài khoản', 'Tài khoản (đến)', 'Ghi chú', 'Loại giao dịch', 'Nhóm'];
  var FORMAT_B_HEADERS = ['Mã GD', 'Ngày', 'Phân loại', 'Danh mục', 'Số tiền', 'Nội dung', 'Ghi chú'];
  var DEFAULT_GROUP = '👤 Cá nhân';
  var DEFAULT_ACCOUNT = 'Ngân hàng';

  // ---------- Tiện ích ----------
  function trim(s) { return (s === null || s === undefined) ? '' : String(s).trim(); }

  function escHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // ---------- 1. Parser CSV robust (không tách naive theo dấu phẩy) ----------
  // Xử lý: BOM UTF-8, CRLF/LF/CR, trường trích dẫn "..." (dấu phẩy + xuống
  // dòng bên trong), "" thoát thành ". Dòng hoàn toàn trống được bỏ qua.
  function parseCsvText(text) {
    if (text === null || text === undefined) return [];
    var s = String(text);
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    function endField() { row.push(field); field = ''; }
    function endRow() {
      endField();
      // Bỏ dòng hoàn toàn trống (dòng trắng giữa file).
      var allEmpty = row.length === 0 || row.every(function (c) { return trim(c) === ''; });
      if (!allEmpty) rows.push(row);
      row = [];
    }
    while (i < s.length) {
      var ch = s[i];
      if (inQuotes) {
        if (ch === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += ch; i += 1; continue;
      }
      if (ch === '"') { inQuotes = true; i += 1; continue; }
      if (ch === ',') { endField(); i += 1; continue; }
      if (ch === '\r') { if (s[i + 1] === '\n') i += 1; endRow(); i += 1; continue; }
      if (ch === '\n') { endRow(); i += 1; continue; }
      field += ch; i += 1;
    }
    // Dòng cuối không có newline kết thúc.
    if (field !== '' || row.length > 0) endRow();
    return rows;
  }

  // ---------- 2. Nhận diện định dạng theo header ----------
  function normalizeHeaderRow(row) { return (row || []).map(function (c) { return trim(c); }); }
  function sameHeaders(a, b) {
    if (!a || a.length !== b.length) return false;
    for (var i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function detectFormat(headerRow) {
    var h = normalizeHeaderRow(headerRow);
    if (sameHeaders(h, FORMAT_A_HEADERS)) return 'A';
    if (sameHeaders(h, FORMAT_B_HEADERS)) return 'B';
    return null;
  }

  // ---------- 3. Ngày ----------
  // dd/mm/yyyy: kiểm tra ngày thật trên lịch (loại 31/02, 32/13...).
  function parseDmyDate(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trim(s));
    if (!m) return null;
    var d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(d) + '/' + pad(mo) + '/' + y;
  }

  // ISO instant -> ngày dương lịch Asia/Ho_Chi_Minh. QUAN TRỌNG: không lấy phần
  // ngày trước chữ 'T' (17:00Z = 00:00 ICT ngày hôm sau). ICT không có DST nên
  // cộng cố định +07:00 vào mốc UTC là chính xác.
  // Chuỗi ISO không kèm múi giờ được hiểu là giờ tường ICT (hệ xuất file ở VN).
  function ictDateFromIso(s) {
    var t = trim(s);
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(t);
    if (!m) return null;
    var iso = t;
    if (!m[7]) iso = t + '+07:00';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var ict = new Date(d.getTime() + 7 * 3600 * 1000);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(ict.getUTCDate()) + '/' + pad(ict.getUTCMonth() + 1) + '/' + ict.getUTCFullYear();
  }

  function parseAnyDate(s) {
    var t = trim(s);
    if (t.indexOf('T') !== -1) return ictDateFromIso(t);
    return parseDmyDate(t);
  }

  // ---------- 4. Số tiền ----------
  // Chỉ chấp nhận số nguyên: số trần hoặc nhóm 3 chữ số (1.000.000 / 1,000,000).
  // Dạng thập phân lẻ (10.5) bị loại để không đoán sai thành 105.
  function parseGroupedInt(s) {
    var t = trim(s).replace(/\s+/g, '');
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return parseInt(t.replace(/[.,]/g, ''), 10);
    return null;
  }
  // Định dạng A: số dương, dấu lấy theo loại giao dịch (file ngoài không âm).
  function parseAmountA(s) {
    var v = parseGroupedInt(s);
    if (v === null || v <= 0) return null;
    return v;
  }
  // Định dạng B: phòng thủ hơn (file do app hoặc tay sửa): cho phép dấu trừ
  // ở đầu và ký tự ₫ ở cuối; lấy trị tuyệt đối, loại giữ nguyên như đã ghi.
  function parseAmountB(s) {
    var t = trim(s).replace(/\s+/g, '').replace(/₫$/, '');
    var neg = false;
    if (t.charAt(0) === '-') { neg = true; t = t.slice(1); }
    var v = parseGroupedInt(t);
    if (v === null || v === 0) return null;
    return v;
  }

  // ---------- 5. Ánh xạ từng dòng ----------
  // Trả về: { kind: 'tx', tx } | { kind: 'transfer' } | { kind: 'failed', reason }
  function mapRowA(cells, lineNo) {
    if (!cells || cells.length !== 8) return { kind: 'failed', lineNo: lineNo, reason: 'Số cột không khớp (cần 8 cột)' };
    var date = parseAnyDate(cells[0]);
    if (!date) return { kind: 'failed', lineNo: lineNo, reason: 'Ngày không hợp lệ' };
    var typeRaw = trim(cells[6]);
    var type = null;
    if (typeRaw === 'Chi' || typeRaw === 'Chi tiêu') type = 'Chi tiêu';
    else if (typeRaw === 'Thu' || typeRaw === 'Thu nhập') type = 'Thu nhập';
    else if (typeRaw === 'Chuyển khoản') return { kind: 'transfer', lineNo: lineNo };
    else return { kind: 'failed', lineNo: lineNo, reason: 'Loại giao dịch không nhận diện: ' + typeRaw };
    var amount = parseAmountA(cells[2]);
    if (amount === null) return { kind: 'failed', lineNo: lineNo, reason: 'Số tiền không hợp lệ' };
    var category = trim(cells[1]);
    if (!category) return { kind: 'failed', lineNo: lineNo, reason: 'Thiếu danh mục' };
    var content = trim(cells[5]) || category;
    var noteParts = [];
    var group = trim(cells[7]);
    var account = trim(cells[3]);
    if (group && group !== DEFAULT_GROUP) noteParts.push('Nhóm: ' + group);
    if (account && account !== DEFAULT_ACCOUNT) noteParts.push('TK: ' + account);
    return { kind: 'tx', tx: { date: date, type: type, content: content, amount: amount, category: category, note: noteParts.join(' • ') } };
  }

  function mapRowB(cells, lineNo) {
    if (!cells || cells.length !== 7) return { kind: 'failed', lineNo: lineNo, reason: 'Số cột không khớp (cần 7 cột)' };
    // Cột Mã GD (cells[0]) được BỎ QUA cố tình: id cấp mới để khỏi đụng độ.
    var date = parseDmyDate(cells[1]);
    if (!date) return { kind: 'failed', lineNo: lineNo, reason: 'Ngày không hợp lệ' };
    var type = trim(cells[2]);
    if (type !== 'Thu nhập' && type !== 'Chi tiêu') return { kind: 'failed', lineNo: lineNo, reason: 'Phân loại không nhận diện: ' + type };
    var amount = parseAmountB(cells[4]);
    if (amount === null) return { kind: 'failed', lineNo: lineNo, reason: 'Số tiền không hợp lệ' };
    var category = trim(cells[3]);
    if (!category) return { kind: 'failed', lineNo: lineNo, reason: 'Thiếu danh mục' };
    var content = trim(cells[5]) || category;
    return { kind: 'tx', tx: { date: date, type: type, content: content, amount: amount, category: category, note: trim(cells[6]) } };
  }

  // rows: toàn bộ dòng CSV (dòng đầu là header). lineNo = số dòng trong file
  // (header là dòng 1) để báo lỗi đúng vị trí người dùng thấy.
  function mapAllRows(rows, format) {
    var out = { txs: [], transfers: 0, failed: [] };
    if (!rows || rows.length < 2) return out;
    var mapFn = format === 'A' ? mapRowA : mapRowB;
    for (var i = 1; i < rows.length; i++) {
      var r = mapFn(rows[i], i + 1);
      if (r.kind === 'tx') out.txs.push(r.tx);
      else if (r.kind === 'transfer') out.transfers += 1;
      else out.failed.push({ lineNo: r.lineNo, reason: r.reason });
    }
    return out;
  }

  // ---------- 6. Trùng lặp + cấp id ----------
  function keyOf(tx) {
    return [tx.date, tx.type, tx.category, tx.amount, tx.content].join(' | ');
  }

  // existingByMonth: Map tháng (số) -> Set khóa. Trùng = cùng ngày + loại +
  // danh mục + số tiền + nội dung trong cùng tháng đó -> bỏ qua (nhập lại
  // cùng file không tạo bản sao).
  function buildImportPlan(mapped, existingByMonth) {
    var toImport = [];
    var duplicates = 0;
    mapped.txs.forEach(function (tx) {
      var month = parseInt(tx.date.split('/')[1], 10);
      var set = existingByMonth ? existingByMonth.get(month) : null;
      var key = keyOf(tx);
      if (set && set.has(key)) {
        duplicates += 1;
      } else {
        toImport.push(tx);
        // Ghi nhớ luôn để dòng trùng lặp NGAY TRONG FILE cũng bị loại
        // (không tạo 2 bản sao giống hệt nhau trong cùng một đợt nhập).
        if (existingByMonth) {
          if (!set) { set = new Set(); existingByMonth.set(month, set); }
          set.add(key);
        }
      }
    });
    return { toImport: toImport, duplicates: duplicates, transfers: mapped.transfers, failed: mapped.failed };
  }

  function computeMaxId(allData) {
    var maxNum = 0;
    if (allData && typeof allData === 'object') {
      Object.values(allData).forEach(function (monthObj) {
        if (monthObj && typeof monthObj === 'object') {
          Object.values(monthObj).forEach(function (item) {
            if (item && item.id) {
              var mm = /^GD(\d+)$/.exec(String(item.id));
              if (mm) { var nn = parseInt(mm[1], 10); if (nn > maxNum) maxNum = nn; }
            }
          });
        }
      });
    }
    return maxNum;
  }

  // Ghi hàng loạt. deps: { fetchAll, put, onProgress, yieldEvery }.
  // KHÔNG gọi submitTx theo từng dòng. Lỗi từng PUT được gom lại, không dừng
  // cả đợt. Trả về { imported, failedRows: [{ tx, error }] }.
  async function runImport(toImport, deps) {
    var allData = await deps.fetchAll();
    var nextNum = computeMaxId(allData) + 1;
    var imported = 0;
    var failedRows = [];
    var yieldEvery = (deps.yieldEvery && deps.yieldEvery > 0) ? deps.yieldEvery : 10;
    for (var i = 0; i < toImport.length; i++) {
      var tx = toImport[i];
      var id = 'GD' + String(nextNum).padStart(3, '0');
      nextNum += 1;
      var month = parseInt(tx.date.split('/')[1], 10);
      var body = { id: id, date: tx.date, type: tx.type, content: tx.content, amount: tx.amount, category: tx.category, note: tx.note, _action: 'addTransaction' };
      try {
        await deps.put('/transactions/users/' + deps.chatId + '/month_' + month + '/' + id + '.json', body);
        imported += 1;
      } catch (e) {
        failedRows.push({ tx: tx, error: (e && e.message) ? e.message : String(e) });
      }
      if (typeof deps.onProgress === 'function') deps.onProgress(i + 1, toImport.length);
      if ((i + 1) % yieldEvery === 0) await new Promise(function (r) { setTimeout(r, 0); });
    }
    return { imported: imported, failedRows: failedRows };
  }

  // ---------- 7. Hiển thị xem trước ----------
  function formatPreviewAmount(amount, type) {
    try {
      if (typeof isPrivacyActive !== 'undefined' && isPrivacyActive) {
        return (type === 'Chi tiêu' ? '− ' : '+ ') + '***';
      }
    } catch (e) {}
    var sign = (type === 'Chi tiêu') ? '− ' : '+ ';
    try {
      if (typeof formatCurrencyWithUnit === 'function') {
        var o = formatCurrencyWithUnit(amount);
        return sign + o.val + (o.unit || '');
      }
    } catch (e) {}
    return sign + Number(amount).toLocaleString('en-US') + ' ₫';
  }

  // API cho test (Node) + cho UI bên dưới.
  var api = {
    FORMAT_A_HEADERS: FORMAT_A_HEADERS,
    FORMAT_B_HEADERS: FORMAT_B_HEADERS,
    parseCsvText: parseCsvText,
    detectFormat: detectFormat,
    parseDmyDate: parseDmyDate,
    ictDateFromIso: ictDateFromIso,
    parseAmountA: parseAmountA,
    parseAmountB: parseAmountB,
    mapRowA: mapRowA,
    mapRowB: mapRowB,
    mapAllRows: mapAllRows,
    keyOf: keyOf,
    buildImportPlan: buildImportPlan,
    computeMaxId: computeMaxId,
    runImport: runImport,
    formatPreviewAmount: formatPreviewAmount
  };
  if (typeof window !== 'undefined') window.__csvImport = api;

  // ---------- 8. Giao diện (chỉ chạy trong trình duyệt) ----------
  if (typeof document === 'undefined') return;

  var importState = { plan: null, running: false, fileName: '' };

  function getEl(id) { return document.getElementById(id); }

  // Sheet xem trước mở từ trang Cài đặt (fullscreen z-index 3000) nên phải
  // nâng overlay + sheet lên trên (3500/3600), đóng thì trả lại như cũ.
  function openImportSheet() {
    var ov = getEl('modalOverlay');
    var sheet = getEl('importPreviewModal');
    if (ov) { ov.style.zIndex = '3500'; ov.classList.add('show'); }
    if (sheet) { sheet.style.zIndex = '3600'; setTimeout(function () { sheet.classList.add('show'); }, 10); }
  }

  function closeImportSheet() {
    var ov = getEl('modalOverlay');
    var sheet = getEl('importPreviewModal');
    if (sheet) sheet.classList.remove('show');
    setTimeout(function () {
      if (ov) { ov.classList.remove('show'); ov.style.zIndex = ''; }
      if (sheet) sheet.style.zIndex = '';
    }, 300);
  }

  function closeImportPreview() {
    if (importState.running) return; // Đang ghi thì không cho đóng giữa chừng.
    closeImportSheet();
  }

  // Đóng sheet nhập khi bấm overlay (closeAllModals gốc không biết sheet này).
  try {
    if (typeof window.closeAllModals === 'function' && !window.closeAllModals.__importPatched) {
      var origCloseAll = window.closeAllModals;
      var wrapped = function () {
        try { if (!importState.running) closeImportSheet(); } catch (e) {}
        return origCloseAll.apply(this, arguments);
      };
      wrapped.__importPatched = true;
      window.closeAllModals = wrapped;
    }
  } catch (e) {}

  function renderImportPreview(plan, fileName, formatLabel) {
    var body = getEl('importPreviewBody');
    var confirmBtn = getEl('importConfirmBtn');
    var progress = getEl('importProgress');
    if (progress) { progress.style.display = 'none'; progress.textContent = ''; }
    if (!body) return;
    var total = plan.toImport.length + plan.duplicates + plan.transfers + plan.failed.length;
    var html = '';
    html += '<div class="field-helper" style="margin-bottom:12px;">File: <b>' + escHtml(fileName) + '</b> — định dạng ' + escHtml(formatLabel) + ' — tổng ' + total + ' dòng.</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + plan.toImport.length + '</b><br><span style="font-size:12px;color:var(--text-2);">Sẽ nhập</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + plan.duplicates + '</b><br><span style="font-size:12px;color:var(--text-2);">Trùng (bỏ qua)</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + plan.transfers + '</b><br><span style="font-size:12px;color:var(--text-2);">Chuyển khoản (bỏ qua)</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + plan.failed.length + '</b><br><span style="font-size:12px;color:var(--text-2);">Lỗi (bỏ qua)</span></div>';
    html += '</div>';
    if (plan.toImport.length > 0) {
      html += '<div class="field-label">Mẫu vài dòng sẽ nhập</div>';
      plan.toImport.slice(0, 5).forEach(function (tx) {
        html += '<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;">'
          + '<span style="flex:1;min-width:0;">' + escHtml(tx.date) + ' — ' + escHtml(tx.content) + ' <span style="color:var(--text-2);">(' + escHtml(tx.category) + ')</span></span>'
          + '<b style="white-space:nowrap;color:' + (tx.type === 'Chi tiêu' ? '#E11D48' : '#10B981') + ';">' + escHtml(formatPreviewAmount(tx.amount, tx.type)) + '</b></div>';
      });
    }
    if (plan.failed.length > 0) {
      html += '<div class="field-label" style="margin-top:12px;">Dòng lỗi (tối đa 5 dòng đầu)</div>';
      plan.failed.slice(0, 5).forEach(function (f) {
        html += '<div style="font-size:13px;color:var(--text-2);padding:4px 0;">Dòng ' + f.lineNo + ': ' + escHtml(f.reason) + '</div>';
      });
    }
    body.innerHTML = html;
    if (confirmBtn) {
      confirmBtn.disabled = plan.toImport.length === 0;
      confirmBtn.style.opacity = plan.toImport.length === 0 ? '0.5' : '1';
      confirmBtn.innerHTML = '<i class="fas fa-file-import"></i> Nhập ' + plan.toImport.length + ' giao dịch';
    }
  }

  function renderImportError(messageHtml) {
    var body = getEl('importPreviewBody');
    var confirmBtn = getEl('importConfirmBtn');
    var progress = getEl('importProgress');
    if (progress) { progress.style.display = 'none'; progress.textContent = ''; }
    if (body) body.innerHTML = messageHtml;
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.opacity = '0.5'; confirmBtn.innerHTML = '<i class="fas fa-file-import"></i> Nhập dữ liệu'; }
  }

  function acceptedHeadersHtml() {
    return '<div class="field-label">Chỉ nhận 2 định dạng tiêu đề sau:</div>'
      + '<div style="font-size:13px;line-height:1.6;margin-bottom:8px;">(A) ' + escHtml(FORMAT_A_HEADERS.join(',')) + '</div>'
      + '<div style="font-size:13px;line-height:1.6;">(B) ' + escHtml(FORMAT_B_HEADERS.join(',')) + '</div>';
  }

  async function handleImportFile(file) {
    if (!file) return;
    importState.fileName = file.name || 'file.csv';
    importState.plan = null;
    var text = '';
    try {
      if (typeof file.text === 'function') text = await file.text();
      else text = await new Promise(function (resolve, reject) {
        var rd = new FileReader();
        rd.onload = function () { resolve(rd.result || ''); };
        rd.onerror = function () { reject(new Error('Không đọc được file')); };
        rd.readAsText(file);
      });
    } catch (e) {
      renderImportError('<div style="color:#E11D48;">Không đọc được file: ' + escHtml(e.message || e) + '</div>');
      openImportSheet();
      return;
    }
    var rows = parseCsvText(text);
    if (rows.length === 0) {
      renderImportError('<div style="color:#E11D48;">File trống, không có dòng nào.</div>');
      openImportSheet();
      return;
    }
    var format = detectFormat(rows[0]);
    if (!format) {
      renderImportError('<div style="color:#E11D48;margin-bottom:12px;">Tiêu đề file không khớp định dạng nào.</div>' + acceptedHeadersHtml());
      openImportSheet();
      return;
    }
    var mapped = mapAllRows(rows, format);
    // Trùng lặp: tải mỗi tháng bị chạm đúng 1 lần.
    var months = {};
    mapped.txs.forEach(function (tx) { months[parseInt(tx.date.split('/')[1], 10)] = true; });
    var existingByMonth = new Map();
    try {
      var monthNums = Object.keys(months).map(function (k) { return parseInt(k, 10); });
      for (var i = 0; i < monthNums.length; i++) {
        var m = monthNums[i];
        var list = [];
        try { list = (typeof fetchMonthData === 'function') ? (await fetchMonthData(m)) || [] : []; } catch (e) { list = []; }
        var set = new Set();
        list.forEach(function (t) { if (t && t.date) set.add(keyOf({ date: t.date, type: t.type, category: t.category, amount: t.amount, content: t.content })); });
        existingByMonth.set(m, set);
      }
    } catch (e) {
      // Lỗi tải tháng cũ -> coi như chưa có dữ liệu (bước ghi vẫn kiểm tra
      // lại bằng id mới, không ghi đè vì id luôn cấp mới).
      existingByMonth = new Map();
    }
    var plan = buildImportPlan(mapped, existingByMonth);
    importState.plan = plan;
    renderImportPreview(plan, importState.fileName, format === 'A' ? 'ngoài (A)' : 'xuất của app (B)');
    openImportSheet();
  }

  async function confirmImport() {
    if (importState.running || !importState.plan || importState.plan.toImport.length === 0) return;
    if (typeof chatId === 'undefined' || !chatId) {
      try { showToast('Chưa xác định được người dùng (chatId trống), không thể ghi.', 'error'); } catch (e) {}
      return;
    }
    importState.running = true;
    var confirmBtn = getEl('importConfirmBtn');
    var progress = getEl('importProgress');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.opacity = '0.5'; }
    if (progress) { progress.style.display = 'block'; progress.textContent = 'Đang nhập 0/' + importState.plan.toImport.length + '…'; }
    var result = null;
    var runError = null;
    try {
      result = await runImport(importState.plan.toImport, {
        chatId: chatId,
        fetchAll: function () { return secureFetch('/transactions/users/' + chatId + '.json'); },
        put: function (path, body) { return secureFetch(path, 'PUT', body); },
        onProgress: function (done, total) { if (progress) progress.textContent = 'Đang nhập ' + done + '/' + total + '…'; },
        yieldEvery: 10
      });
    } catch (e) {
      runError = e;
    }
    importState.running = false;
    // Mở khóa cache + render lại MỘT lần (giống submitTx nhưng chỉ 1 lần).
    try { window.apiTxCache = {}; } catch (e) {}
    try { if (window.dayTxCache) window.dayTxCache = {}; } catch (e) {}
    try { tab2NeedsReload = true; } catch (e) {}
    try {
      if (document.getElementById('tab1') && document.getElementById('tab1').classList.contains('active')) displayTransactions();
      else if (document.getElementById('tab2') && document.getElementById('tab2').classList.contains('active')) updateTimeNavUI();
      else if (document.getElementById('tab3') && document.getElementById('tab3').classList.contains('active')) displaySearchResults();
    } catch (e) {}
    var plan = importState.plan;
    var body = getEl('importPreviewBody');
    if (runError) {
      if (body) body.innerHTML = '<div style="color:#E11D48;">Nhập dừng vì lỗi tải dữ liệu: ' + escHtml(runError.message || runError) + '. Chưa ghi dòng nào mới trong đợt này, bấm Đóng rồi thử lại.</div>';
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.style.opacity = '1'; confirmBtn.innerHTML = '<i class="fas fa-file-import"></i> Thử lại'; }
      if (progress) { progress.style.display = 'none'; }
      return;
    }
    var html = '<div class="field-helper" style="margin-bottom:12px;">Nhập xong.</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + result.imported + '</b><br><span style="font-size:12px;color:var(--text-2);">Đã nhập</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + plan.duplicates + '</b><br><span style="font-size:12px;color:var(--text-2);">Trùng (bỏ qua)</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + plan.transfers + '</b><br><span style="font-size:12px;color:var(--text-2);">Chuyển khoản (bỏ qua)</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + result.failedRows.length + '</b><br><span style="font-size:12px;color:var(--text-2);">Ghi lỗi</span></div>';
    html += '</div>';
    if (result.failedRows.length > 0) {
      html += '<div class="field-label">Dòng ghi lỗi (tối đa 5 dòng đầu)</div>';
      result.failedRows.slice(0, 5).forEach(function (f) {
        html += '<div style="font-size:13px;color:var(--text-2);padding:4px 0;">' + escHtml(f.tx.date) + ' — ' + escHtml(f.tx.content) + ': ' + escHtml(f.error) + '</div>';
      });
    }
    if (body) body.innerHTML = html;
    if (progress) { progress.style.display = 'none'; }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.innerHTML = '<i class="fas fa-check"></i> Xong';
      confirmBtn.onclick = function () { closeImportSheet(); };
    }
    try { triggerHapticNotification('success'); } catch (e) {}
    try { showToast('Đã nhập ' + result.imported + ' giao dịch!', 'success'); } catch (e) {}
  }

  // Gắn nút (script defer chạy sau khi DOM parse xong nên phần tử đã có).
  function bindImportUI() {
    var btn = getEl('importCsvBtn');
    var input = getEl('importCsvFile');
    if (btn && input) {
      btn.onclick = function () {
        try { triggerHaptic('light'); } catch (e) {}
        input.value = '';
        input.click();
      };
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        input.value = '';
        if (f) handleImportFile(f);
      });
    }
    var cancelBtn = getEl('importCancelBtn');
    if (cancelBtn) cancelBtn.onclick = function () { closeImportPreview(); };
    var handle = getEl('importPreviewHandle');
    if (handle) handle.onclick = function () { closeImportPreview(); };
    var confirmBtn = getEl('importConfirmBtn');
    if (confirmBtn) confirmBtn.onclick = function () { confirmImport(); };
  }
  bindImportUI();
})();
