// ============================================================================
// app-import.js — R50 + R51 + R52: NHẬP FILE CSV (bản chính).
// Thêm giao dịch lịch sử từ file CSV ngoài hoặc từ file CSV do chính app xuất.
// R51 thêm: bước ánh xạ cột (mọi CSV đều chuẩn hóa được về chuẩn app),
// xem trước 3 nhóm Sẵn sàng/Trùng lặp/Lỗi với lựa chọn từng dòng + sửa dòng
// lỗi inline, và spinner trong suốt lúc tải file + kiểm tra trùng + lúc ghi.
// R52 thêm: NGUYÊN TẮC "loại chưa hỗ trợ thì user chọn nơi nhập vào" —
// mọi loại giao dịch không phải Chi/Thu (không chỉ "Chuyển khoản") đều vào
// nhóm "Loại chưa hỗ trợ" với lựa chọn từng dòng (Chi tiêu / Thu nhập /
// Bỏ qua, mặc định Bỏ qua); dòng được chọn ghi với danh mục "Chuyển khoản"
// qua đúng đường ghi + bản ghi đợt nhập như mọi dòng khác (hoàn tác được).
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
    var writtenIds = [];
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
        writtenIds.push(id);
      } catch (e) {
        failedRows.push({ tx: tx, error: (e && e.message) ? e.message : String(e) });
      }
      if (typeof deps.onProgress === 'function') deps.onProgress(i + 1, toImport.length);
      if ((i + 1) % yieldEvery === 0) await new Promise(function (r) { setTimeout(r, 0); });
    }
    return { imported: imported, failedRows: failedRows, writtenIds: writtenIds };
  }

  // ---------- 6b. ÁNH XẠ CỘT (R51) ----------
  // Bước trung gian biến MỌI file CSV về đúng chuẩn của app: mỗi cột CSV được
  // gán một trường đích của app (hoặc "Không nhập"). Định dạng quen thuộc
  // (A/B) được đoán đúng y như R50; tiêu đề lạ được đoán bằng luật mờ
  // (không dấu); tiêu đề không nhận diện được mặc định "Không nhập" để người
  // dùng tự sửa bằng dropdown. Id (Mã GD) KHÔNG BAO GIỜ được nhập — id luôn
  // cấp mới để khỏi đụng độ (quy tắc giữ từ R50).
  var TARGETS = [
    { key: 'date', label: 'Ngày' },
    { key: 'category', label: 'Danh mục' },
    { key: 'amount', label: 'Tiền' },
    { key: 'content', label: 'Nội dung' },
    { key: 'note', label: 'Ghi chú' },
    { key: 'type', label: 'Loại giao dịch' },
    { key: 'group', label: 'Nhóm (→ ghi chú)' },
    { key: 'account', label: 'Tài khoản (→ ghi chú)' }
  ];
  var REQUIRED_TARGETS = [
    { key: 'date', label: 'Ngày' },
    { key: 'amount', label: 'Tiền' },
    { key: 'type', label: 'Loại giao dịch' },
    { key: 'category', label: 'Danh mục' }
  ];

  function stripDiacritics(s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Đoán trường đích cho MỘT tiêu đề lạ (không thuộc 2 định dạng quen).
  // Trả về key đích hoặc '' (= Không nhập).
  function fuzzyTargetForHeader(header) {
    var h = stripDiacritics(header);
    if (!h) return '';
    // Loại trừ trước: id và cột đích chuyển khoản không bao giờ nhập.
    if (h === 'ma gd' || h === 'ma giao dich' || h === 'id') return '';
    if (h.indexOf('den') !== -1 || h.indexOf('destination') !== -1) return '';
    if (h.indexOf('ngay') !== -1 || h.indexOf('date') !== -1) return 'date';
    if (h.indexOf('tien') !== -1 || h.indexOf('amount') !== -1) return 'amount';
    if (h.indexOf('danh muc') !== -1 || h.indexOf('category') !== -1) return 'category';
    if (h.indexOf('noi dung') !== -1 || h.indexOf('mo ta') !== -1 || h.indexOf('dien giai') !== -1 || h.indexOf('content') !== -1 || h.indexOf('description') !== -1) return 'content';
    if (h.indexOf('ghi chu') !== -1 || h.indexOf('note') !== -1 || h.indexOf('memo') !== -1) return 'note';
    if (h.indexOf('loai') !== -1 || h.indexOf('phan loai') !== -1 || h.indexOf('type') !== -1) return 'type';
    if (h.indexOf('nhom') !== -1 || h.indexOf('group') !== -1) return 'group';
    if (h.indexOf('tai khoan') !== -1 || h.indexOf('account') !== -1) return 'account';
    return '';
  }

  // Đoán toàn bộ ánh xạ cho một dòng tiêu đề. Định dạng A/B quen thuộc cho
  // đúng ánh xạ R50 (chú ý: ở A, "Ghi chú" đi vào Nội dung; ở B, "Ghi chú"
  // đi vào Ghi chú). Tiêu đề lạ: luật mờ, mục tiêu trùng nhau thì cột đầu
  // giữ, cột sau về "Không nhập" (người dùng sửa bằng dropdown).
  function guessMapping(headerRow) {
    var h = normalizeHeaderRow(headerRow);
    if (sameHeaders(h, FORMAT_A_HEADERS)) return ['date', 'category', 'amount', 'account', '', 'content', 'type', 'group'];
    if (sameHeaders(h, FORMAT_B_HEADERS)) return ['', 'date', 'type', 'category', 'amount', 'content', 'note'];
    var mapping = h.map(function (col) { return fuzzyTargetForHeader(col); });
    var seen = {};
    for (var i = 0; i < mapping.length; i++) {
      var t = mapping[i];
      if (!t) continue;
      if (seen[t]) mapping[i] = '';
      else seen[t] = true;
    }
    return mapping;
  }

  // 4 trường bắt buộc phải có ánh xạ thì mới được đi tiếp; thiếu trường nào
  // thì báo đúng tên trường đó (không tự đoán giá trị cho dữ liệu tài chính).
  function validateMapping(mapping) {
    var missing = [];
    REQUIRED_TARGETS.forEach(function (r) {
      if (!mapping || mapping.indexOf(r.key) === -1) missing.push(r.label);
    });
    return { ok: missing.length === 0, missing: missing };
  }

  // Số tiền chuẩn hóa: bỏ khoảng trắng, cho phép dấu trừ ở đầu (lấy trị tuyệt
  // đối — dấu lấy theo loại giao dịch) và ký tự ₫ ở cuối; nhóm 3 chữ số
  // (1.000.000) hoặc số trần; thập phân lẻ bị loại như R50.
  function parseAmountUnified(s) {
    var t = trim(s).replace(/\s+/g, '').replace(/₫$/, '');
    if (t.charAt(0) === '-') t = t.slice(1);
    var v = parseGroupedInt(t);
    if (v === null || v === 0) return null;
    return v;
  }

  function targetCell(cells, mapping, target) {
    var idx = mapping.indexOf(target);
    if (idx === -1 || !cells || idx >= cells.length) return '';
    return cells[idx];
  }

  // Ánh xạ MỘT dòng theo mapping hiện tại. Trả về { kind: 'tx', tx } |
  // { kind: 'unsupported', lineNo, cells, typeRaw, date, amount, content, note } |
  // { kind: 'failed', lineNo, reason, cells }.
  // Thứ tự kiểm tra: ngày -> loại -> tiền -> danh mục; lỗi đầu tiên được báo.
  function mapRowMapped(cells, mapping, lineNo) {
    cells = cells || [];
    var dateRaw = trim(targetCell(cells, mapping, 'date'));
    if (!dateRaw) return { kind: 'failed', lineNo: lineNo, reason: 'Thiếu ngày', cells: cells };
    var date = parseAnyDate(dateRaw);
    if (!date) return { kind: 'failed', lineNo: lineNo, reason: 'Ngày không hợp lệ', cells: cells };
    var typeRaw = trim(targetCell(cells, mapping, 'type'));
    var type = null;
    if (typeRaw === 'Chi' || typeRaw === 'Chi tiêu') type = 'Chi tiêu';
    else if (typeRaw === 'Thu' || typeRaw === 'Thu nhập') type = 'Thu nhập';
    else if (!typeRaw) return { kind: 'failed', lineNo: lineNo, reason: 'Thiếu loại giao dịch', cells: cells };
    else {
      // R52 — NGUYÊN TẮC: loại app chưa hỗ trợ KHÔNG tự đoán, KHÔNG lặng
      // lẽ bỏ: đưa vào nhóm "loại chưa hỗ trợ" để user chọn nơi nhập vào
      // (Chi tiêu / Thu nhập / Bỏ qua). Ngày đã hợp lệ ở trên; số tiền
      // phải hợp lệ thì dòng mới vào được nhóm này (tiền hỏng thì vẫn là
      // dòng lỗi để sửa inline — sửa xong mà loại vẫn chưa hỗ trợ thì lại
      // về nhóm này). Danh mục không bắt buộc ở đây: khi ghi, danh mục
      // mặc định là "Chuyển khoản" để các dòng này nhận diện được trong
      // báo cáo (xem unsupportedToTx).
      var uAmountRaw = trim(targetCell(cells, mapping, 'amount'));
      if (!uAmountRaw) return { kind: 'failed', lineNo: lineNo, reason: 'Thiếu số tiền', cells: cells };
      var uAmount = parseAmountUnified(uAmountRaw);
      if (uAmount === null) return { kind: 'failed', lineNo: lineNo, reason: 'Số tiền không hợp lệ', cells: cells };
      var uContent = trim(targetCell(cells, mapping, 'content')) || trim(targetCell(cells, mapping, 'category')) || 'Chuyển khoản';
      var uNoteParts = [];
      var uNoteBase = trim(targetCell(cells, mapping, 'note'));
      if (uNoteBase) uNoteParts.push(uNoteBase);
      var uGroup = trim(targetCell(cells, mapping, 'group'));
      if (uGroup && uGroup !== DEFAULT_GROUP) uNoteParts.push('Nhóm: ' + uGroup);
      var uAccount = trim(targetCell(cells, mapping, 'account'));
      if (uAccount && uAccount !== DEFAULT_ACCOUNT) uNoteParts.push('TK: ' + uAccount);
      return { kind: 'unsupported', lineNo: lineNo, cells: cells, typeRaw: typeRaw, date: date, amount: uAmount, content: uContent, note: uNoteParts.join(' • ') };
    }
    var amountRaw = trim(targetCell(cells, mapping, 'amount'));
    if (!amountRaw) return { kind: 'failed', lineNo: lineNo, reason: 'Thiếu số tiền', cells: cells };
    var amount = parseAmountUnified(amountRaw);
    if (amount === null) return { kind: 'failed', lineNo: lineNo, reason: 'Số tiền không hợp lệ', cells: cells };
    var category = trim(targetCell(cells, mapping, 'category'));
    if (!category) return { kind: 'failed', lineNo: lineNo, reason: 'Thiếu danh mục', cells: cells };
    var content = trim(targetCell(cells, mapping, 'content')) || category;
    var noteParts = [];
    var noteBase = trim(targetCell(cells, mapping, 'note'));
    if (noteBase) noteParts.push(noteBase);
    var group = trim(targetCell(cells, mapping, 'group'));
    if (group && group !== DEFAULT_GROUP) noteParts.push('Nhóm: ' + group);
    var account = trim(targetCell(cells, mapping, 'account'));
    if (account && account !== DEFAULT_ACCOUNT) noteParts.push('TK: ' + account);
    return { kind: 'tx', tx: { date: date, type: type, content: content, amount: amount, category: category, note: noteParts.join(' • ') } };
  }

  // Ánh xạ toàn bộ dòng theo mapping. failed giữ lại cells gốc để sửa inline.
  // unsupported giữ đủ trường đã parse (ngày/tiền/nội dung/ghi chú + loại
  // gốc) để nhóm "loại chưa hỗ trợ" vẽ và ghi mà không cần parse lại.
  function mapAllRowsMapped(rows, mapping) {
    var out = { txs: [], unsupported: [], failed: [] };
    if (!rows || rows.length < 2) return out;
    for (var i = 1; i < rows.length; i++) {
      var r = mapRowMapped(rows[i], mapping, i + 1);
      if (r.kind === 'tx') out.txs.push(r.tx);
      else if (r.kind === 'unsupported') out.unsupported.push({ lineNo: r.lineNo, cells: r.cells, typeRaw: r.typeRaw, date: r.date, amount: r.amount, content: r.content, note: r.note });
      else out.failed.push({ lineNo: r.lineNo, reason: r.reason, cells: r.cells });
    }
    return out;
  }

  // Trùng = cùng ngày + loại + danh mục + số tiền + nội dung trong tháng đó.
  // existingByMonth KHÔNG bị thay đổi (classify làm việc trên bản sao) để
  // bước sửa dòng lỗi còn kiểm tra lại được.
  function isDuplicateTx(tx, existingByMonth) {
    var month = parseInt(tx.date.split('/')[1], 10);
    var set = existingByMonth ? existingByMonth.get(month) : null;
    return !!(set && set.has(keyOf(tx)));
  }

  // Phân loại các tx đã ánh xạ thành Sẵn sàng / Trùng lặp. Dòng trùng trong
  // chính file: lần đầu vào Sẵn sàng, các lần sau vào Trùng lặp (inFile).
  function classifyImportRows(mappedTxs, existingByMonth) {
    var ready = [], duplicates = [];
    var work = new Map();
    if (existingByMonth) existingByMonth.forEach(function (set, m) { work.set(m, new Set(set)); });
    (mappedTxs || []).forEach(function (tx) {
      var month = parseInt(tx.date.split('/')[1], 10);
      var origSet = existingByMonth ? existingByMonth.get(month) : null;
      var key = keyOf(tx);
      var inExisting = !!(origSet && origSet.has(key));
      var set = work.get(month);
      if (inExisting || (set && set.has(key))) {
        duplicates.push({ tx: tx, dupInfo: { date: tx.date, content: tx.content, amount: tx.amount, type: tx.type, inFile: !inExisting } });
      } else {
        ready.push(tx);
        if (!set) { set = new Set(); work.set(month, set); }
        set.add(key);
      }
    });
    return { ready: ready, duplicates: duplicates };
  }

  // R52 — dòng loại chưa hỗ trợ -> giao dịch theo lựa chọn của user.
  // dest 'skip'/khác -> null (không ghi). Danh mục LUÔN là "Chuyển khoản"
  // (theo spec R52) để các dòng này nhận diện được trong báo cáo; nội dung
  // giữ nguyên văn bản gốc của dòng (Ghi chú/Nội dung trong file); ngày +
  // số tiền đã parse sẵn từ bước ánh xạ.
  function unsupportedToTx(u, dest) {
    if (!u || (dest !== 'Chi tiêu' && dest !== 'Thu nhập')) return null;
    return { date: u.date, type: dest, content: u.content || 'Chuyển khoản', amount: u.amount, category: 'Chuyển khoản', note: u.note || '' };
  }

  // Tập sẽ ghi = dòng Sẵn sàng được tick + dòng Trùng lặp được tick ép +
  // dòng loại chưa hỗ trợ được chọn Chi/Thu. Tx của dòng chưa hỗ trợ được
  // cache vào r._mappedTx để tổng kết trừ đúng dòng ghi lỗi theo identity
  // (runImport giữ đúng reference tx từ writeSet trong failedRows).
  function computeWriteSet(readyRows, duplicateRows, unsupportedRows) {
    var out = [];
    (readyRows || []).forEach(function (r) { if (r.checked) out.push(r.tx); });
    (duplicateRows || []).forEach(function (r) { if (r.checked) out.push(r.tx); });
    (unsupportedRows || []).forEach(function (r) {
      var tx = unsupportedToTx(r, r.dest);
      r._mappedTx = tx || null;
      if (tx) out.push(tx);
    });
    return out;
  }

  // R52 — đếm tổng kết nhập (thuần, test được). parts: { ready, duplicates,
  // unsupported, errors } theo đúng shape của importState; mappedTxs = mảng
  // tx đã tạo từ các dòng chưa hỗ trợ (cùng reference với writeSet) để trừ
  // đúng các dòng ghi lỗi; result = { imported, failedRows } của runImport.
  // Lưu ý: dòng chưa hỗ trợ KHÔNG được kiểm tra trùng trước khi ghi (user
  // đã chọn đích một cách tường minh) — nếu nó trùng dữ liệu có sẵn thì
  // vẫn tạo thêm một dòng giống hệt, và hoàn tác sẽ gỡ đúng dòng đó.
  function summarizeImport(parts, mappedTxs, result) {
    var skippedUnchecked = 0;
    (parts.ready || []).forEach(function (r) { if (!r.checked) skippedUnchecked += 1; });
    (parts.duplicates || []).forEach(function (r) { if (!r.checked) skippedUnchecked += 1; });
    (parts.unsupported || []).forEach(function (r) { if (!r.dest || r.dest === 'skip') skippedUnchecked += 1; });
    var duplicatesForced = 0;
    (parts.duplicates || []).forEach(function (r) { if (r.checked) duplicatesForced += 1; });
    var failedSet = new Set();
    (result.failedRows || []).forEach(function (f) { failedSet.add(f.tx); });
    var mappedChi = 0, mappedThu = 0;
    (mappedTxs || []).forEach(function (tx) {
      if (failedSet.has(tx)) return;
      if (tx.type === 'Chi tiêu') mappedChi += 1;
      else if (tx.type === 'Thu nhập') mappedThu += 1;
    });
    return {
      imported: result.imported,
      skippedUnchecked: skippedUnchecked,
      duplicatesForced: duplicatesForced,
      errorsRemaining: (parts.errors || []).length,
      failedCount: (result.failedRows || []).length,
      mappedChi: mappedChi,
      mappedThu: mappedThu
    };
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
    formatPreviewAmount: formatPreviewAmount,
    TARGETS: TARGETS,
    guessMapping: guessMapping,
    fuzzyTargetForHeader: fuzzyTargetForHeader,
    validateMapping: validateMapping,
    parseAmountUnified: parseAmountUnified,
    mapRowMapped: mapRowMapped,
    mapAllRowsMapped: mapAllRowsMapped,
    classifyImportRows: classifyImportRows,
    isDuplicateTx: isDuplicateTx,
    computeWriteSet: computeWriteSet,
    unsupportedToTx: unsupportedToTx,
    summarizeImport: summarizeImport,
    // Hàm vẽ số tiền của dòng chưa hỗ trợ (khai báo ở phần UI nhưng là
    // function declaration nên hoisted — chỉ đọc global isPrivacyActive /
    // formatCurrencyWithUnit lúc gọi nên chạy được cả trong vm.
    unsupportedAmountHtml: unsupportedAmountHtml,
    newImportBatchId: newImportBatchId,
    normalizeImportBatches: normalizeImportBatches,
    formatBatchDate: formatBatchDate,
    buildIdMonthMap: buildIdMonthMap,
    undoImportBatch: undoImportBatch
  };
  if (typeof window !== 'undefined') window.__csvImport = api;

  // ---------- 8. Giao diện (chỉ chạy trong trình duyệt) ----------
  if (typeof document === 'undefined') return;

  var importState = {
    step: 'idle', // idle | mapping | preview | writing | done | error
    fileName: '',
    headerRow: null,
    rows: null,
    mapping: null,
    ready: [],       // [{ key, tx, checked }]
    duplicates: [],  // [{ key, tx, dupInfo, checked }]
    errors: [],      // [{ key, lineNo, cells, reason }]
    unsupported: [], // [{ key, lineNo, cells, typeRaw, date, amount, content, note, dest }]
                     // dest: 'skip' | 'Chi tiêu' | 'Thu nhập' (mặc định 'skip')
    existingByMonth: null,
    running: false,
    loadToken: 0,
    loadCancelled: false,
    nextKey: 1,
    editKey: null,
    lastBatch: null,         // đợt nhập vừa xong (có bản ghi thì mới hoàn tác được)
    lastBatchSaveFailed: false,
    undoRunning: false
  };

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

  // ---------- Spinner (R51) ----------
  // Overlay phủ kín sheet, hiện từ lúc chọn file cho đến khi xem trước vẽ
  // xong (đọc file + parse + tải các tháng để kiểm tra trùng — chỗ chờ thật
  // sự nằm ở tải tháng), và hiện suốt lúc ghi kèm chữ tiến trình. Mọi đường
  // thoát đều giấu spinner: finally của các khối async + nút đóng/hủy.
  function showImportSpinner(text) {
    var sp = getEl('importSpinner');
    var tx = getEl('importSpinnerText');
    if (tx) tx.textContent = text || 'Đang tải…';
    if (sp) sp.style.display = 'flex';
  }
  function hideImportSpinner() {
    var sp = getEl('importSpinner');
    if (sp) sp.style.display = 'none';
  }
  // Chỉ giấu khi token còn hiện hành (tránh load mới bị load cũ giấu spinner).
  function hideSpinnerFor(token) {
    if (token === importState.loadToken) hideImportSpinner();
  }
  api.showImportSpinner = showImportSpinner;
  api.hideImportSpinner = hideImportSpinner;

  function setImportTitle(text) {
    var t = getEl('importSheetTitleText');
    if (t) t.textContent = text;
  }

  // Đóng sheet: đang ghi thì chặn; đang tải thì hủy tải (token++) rồi đóng.
  function closeImportPreview() {
    if (importState.running) return;
    importState.loadToken += 1;
    importState.loadCancelled = true;
    hideImportSpinner();
    closeImportSheet();
  }

  // Đóng sheet nhập khi bấm overlay (closeAllModals gốc không biết sheet này).
  try {
    if (typeof window.closeAllModals === 'function' && !window.closeAllModals.__importPatched) {
      var origCloseAll = window.closeAllModals;
      var wrapped = function () {
        try { closeImportPreview(); } catch (e) {}
        return origCloseAll.apply(this, arguments);
      };
      wrapped.__importPatched = true;
      window.closeAllModals = wrapped;
    }
  } catch (e) {}

  function setPrimaryButton(label, disabled) {
    var btn = getEl('importConfirmBtn');
    if (!btn) return;
    btn.innerHTML = label;
    btn.disabled = !!disabled;
    btn.style.opacity = disabled ? '0.5' : '1';
  }

  function updatePrimaryButton() {
    if (importState.step === 'mapping') {
      setPrimaryButton('<i class="fas fa-arrow-right"></i> Tiếp tục', false);
    } else if (importState.step === 'preview') {
      var n = computeWriteSet(importState.ready, importState.duplicates, importState.unsupported).length;
      setPrimaryButton('<i class="fas fa-file-import"></i> Nhập ' + n + ' giao dịch', n === 0);
    } else if (importState.step === 'done' || importState.step === 'undoDone') {
      setPrimaryButton('<i class="fas fa-check"></i> Xong', false);
    } else {
      setPrimaryButton('<i class="fas fa-file-import"></i> Nhập dữ liệu', true);
    }
  }

  function renderImportError(messageHtml) {
    importState.step = 'error';
    var body = getEl('importPreviewBody');
    var progress = getEl('importProgress');
    if (progress) { progress.style.display = 'none'; progress.textContent = ''; }
    if (body) body.innerHTML = messageHtml;
    updatePrimaryButton();
  }

  // ---------- Bước ánh xạ cột (R51) ----------
  function mappingSelectHtml(colIdx, header, sample, current) {
    var opts = '<option value="">— Không nhập —</option>';
    TARGETS.forEach(function (t) {
      opts += '<option value="' + t.key + '"' + (current === t.key ? ' selected' : '') + '>' + escHtml(t.label) + '</option>';
    });
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border-color);">'
      + '<div style="font-size:13px;color:var(--text-2);">Cột ' + (colIdx + 1) + ': <b style="color:var(--text-1);">' + escHtml(header) + '</b>'
      + (sample !== '' ? ' <span style="color:var(--text-2);">— ví dụ: ' + escHtml(sample) + '</span>' : ' <span style="color:var(--text-2);">— (trống)</span>') + '</div>'
      + '<select class="import-map-select field-input" data-col="' + colIdx + '" style="margin-top:6px;width:100%;">' + opts + '</select></div>';
  }

  function renderMappingStep() {
    importState.step = 'mapping';
    importState.editKey = null;
    setImportTitle('Ánh xạ cột CSV');
    var body = getEl('importPreviewBody');
    if (!body) return;
    var firstData = (importState.rows && importState.rows.length > 1) ? importState.rows[1] : [];
    var html = '<div class="field-helper" style="margin-bottom:12px;">File: <b>' + escHtml(importState.fileName) + '</b> — chọn trường dữ liệu cho từng cột CSV. Cột "Không nhập" sẽ bị bỏ qua. 4 trường bắt buộc: <b>Ngày, Tiền, Loại giao dịch, Danh mục</b>.</div>';
    html += '<div id="importMappingError"></div>';
    importState.headerRow.forEach(function (header, i) {
      var sample = firstData[i] !== undefined ? String(firstData[i]) : '';
      if (sample.length > 30) sample = sample.slice(0, 30) + '…';
      html += mappingSelectHtml(i, header, sample, importState.mapping[i] || '');
    });
    body.innerHTML = html;
    updatePrimaryButton();
  }

  // Dropdown đổi ánh xạ: mục tiêu đã bị cột khác giữ thì cột kia về
  // "Không nhập" (mỗi trường đích chỉ nhận đúng một cột).
  function onMappingSelectChange(selectEl) {
    var col = parseInt(selectEl.getAttribute('data-col'), 10);
    var val = selectEl.value || '';
    if (val) {
      var selects = document.querySelectorAll('.import-map-select');
      for (var i = 0; i < selects.length; i++) {
        var other = selects[i];
        var otherCol = parseInt(other.getAttribute('data-col'), 10);
        if (otherCol !== col && other.value === val) {
          other.value = '';
          importState.mapping[otherCol] = '';
        }
      }
    }
    importState.mapping[col] = val;
  }

  // ---------- Xem trước 3 nhóm (R51) ----------
  function rowAmountHtml(tx) {
    return '<b style="white-space:nowrap;color:' + (tx.type === 'Chi tiêu' ? '#E11D48' : '#10B981') + ';">' + escHtml(formatPreviewAmount(tx.amount, tx.type)) + '</b>';
  }

  function readyRowHtml(row) {
    var tx = row.tx;
    return '<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;cursor:pointer;">'
      + '<input type="checkbox" class="import-row-check" data-section="ready" data-key="' + row.key + '"' + (row.checked ? ' checked' : '') + ' style="margin-top:3px;flex-shrink:0;">'
      + '<span style="flex:1;min-width:0;">' + escHtml(tx.date) + ' — ' + escHtml(tx.content) + ' <span style="color:var(--text-2);">(' + escHtml(tx.category) + ')</span></span>'
      + rowAmountHtml(tx) + '</label>';
  }

  function dupRowHtml(row) {
    var tx = row.tx;
    var info = row.dupInfo;
    return '<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;cursor:pointer;">'
      + '<input type="checkbox" class="import-row-check" data-section="duplicates" data-key="' + row.key + '"' + (row.checked ? ' checked' : '') + ' style="margin-top:3px;flex-shrink:0;">'
      + '<span style="flex:1;min-width:0;">Trùng: ' + escHtml(info.date) + ' — ' + escHtml(info.content) + ' — ' + escHtml(formatPreviewAmount(info.amount, info.type)) + (info.inFile ? ' <span style="color:var(--text-2);">(trùng trong file)</span>' : '') + '</span></label>';
  }

  // R52 — số tiền của dòng chưa hỗ trợ theo lựa chọn hiện tại: Chi đỏ
  // dấu −, Thu xanh dấu +, Bỏ qua không dấu; privacy thì "***" (không rò
  // số) đúng như các nhóm khác.
  function unsupportedAmountHtml(u, dest) {
    try {
      if (typeof isPrivacyActive !== 'undefined' && isPrivacyActive) return '***';
    } catch (e) {}
    var val = '';
    try {
      if (typeof formatCurrencyWithUnit === 'function') {
        var o = formatCurrencyWithUnit(u.amount);
        val = o.val + (o.unit || '');
      }
    } catch (e) {}
    if (!val) val = Number(u.amount).toLocaleString('en-US') + ' ₫';
    if (dest === 'Chi tiêu') return '<b style="color:#E11D48;">− ' + escHtml(val) + '</b>';
    if (dest === 'Thu nhập') return '<b style="color:#10B981;">+ ' + escHtml(val) + '</b>';
    return escHtml(val);
  }

  // R52 — gợi ý khi dòng được chọn nhập mà trùng dữ liệu đã có: chỉ cảnh
  // báo, không chặn (user đã chọn đích một cách tường minh; hoàn tác sẽ
  // gỡ đúng dòng này nếu nhập sai).
  function unsupportedDupHintHtml(u) {
    var dest = u.dest || 'skip';
    if (dest === 'skip') return '';
    var tx = unsupportedToTx(u, dest);
    if (tx && txDuplicatesCurrent(tx)) return ' <span style="color:#E11D48;">(trùng với giao dịch đã có — nhập sẽ tạo thêm một dòng giống hệt)</span>';
    return '';
  }

  // R52 — một dòng chưa hỗ trợ: loại gốc hiện rõ, select chọn đích.
  // data-unsupported-amount / data-unsupported-dup để đổi lựa chọn cập
  // nhật tại chỗ mà không vẽ lại toàn bộ (khỏi nhảy vị trí cuộn).
  function unsupportedRowHtml(u) {
    var dest = u.dest || 'skip';
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;">'
      + '<div>Dòng ' + u.lineNo + ': ' + escHtml(u.date) + ' — ' + escHtml(u.content) + ' — <span data-unsupported-amount="' + u.key + '">' + unsupportedAmountHtml(u, dest) + '</span><span data-unsupported-dup="' + u.key + '">' + unsupportedDupHintHtml(u) + '</span></div>'
      + '<div style="font-size:12px;color:var(--text-2);margin-top:2px;">Loại gốc: ' + escHtml(u.typeRaw) + ' — nhập vào sẽ mang danh mục "Chuyển khoản".</div>'
      + '<select class="import-unsupported-select field-input" data-key="' + u.key + '" style="margin-top:6px;width:100%;">'
      + '<option value="skip"' + (dest === 'skip' ? ' selected' : '') + '>Bỏ qua</option>'
      + '<option value="Chi tiêu"' + (dest === 'Chi tiêu' ? ' selected' : '') + '>Nhập dạng Chi tiêu</option>'
      + '<option value="Thu nhập"' + (dest === 'Thu nhập' ? ' selected' : '') + '>Nhập dạng Thu nhập</option>'
      + '</select></div>';
  }

  // R52 — đồng bộ tại chỗ số tiền + gợi ý trùng của một dòng sau khi đổi
  // lựa chọn (không vẽ lại toàn bộ, không động tới select).
  function refreshUnsupportedDom(u) {
    var amtSpan = document.querySelector('[data-unsupported-amount="' + u.key + '"]');
    if (amtSpan) amtSpan.innerHTML = unsupportedAmountHtml(u, u.dest || 'skip');
    var dupSpan = document.querySelector('[data-unsupported-dup="' + u.key + '"]');
    if (dupSpan) dupSpan.innerHTML = unsupportedDupHintHtml(u);
  }

  function errorRowHtml(row) {
    if (importState.editKey === row.key) return editRowHtml(row);
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;">'
      + '<div>Dòng ' + row.lineNo + ': <span style="color:#E11D48;">' + escHtml(row.reason) + '</span></div>'
      + '<button class="btn-soft" data-action="edit-error" data-key="' + row.key + '" style="margin-top:6px;padding:6px 12px;"><i class="fas fa-pen"></i> Sửa</button></div>';
  }

  function editFieldHtml(field, label, value, type) {
    if (type === 'type') {
      var opts = '<option value="">— Chọn —</option>'
        + '<option value="Chi tiêu"' + (value === 'Chi tiêu' ? ' selected' : '') + '>Chi tiêu</option>'
        + '<option value="Thu nhập"' + (value === 'Thu nhập' ? ' selected' : '') + '>Thu nhập</option>'
        + '<option value="Chuyển khoản"' + (value === 'Chuyển khoản' ? ' selected' : '') + '>Chuyển khoản</option>';
      // R52: loại lạ (không phải 3 lựa chọn trên) phải giữ nguyên trong
      // dropdown — nếu không nó rơi về "— Chọn —" và lưu lại rớt lỗi
      // 'Thiếu loại giao dịch' dù loại gốc vốn hợp lệ; lưu giữ nguyên thì
      // dòng về nhóm "loại chưa hỗ trợ" để user chọn nơi nhập vào.
      if (value && value !== 'Chi tiêu' && value !== 'Thu nhập' && value !== 'Chuyển khoản') {
        opts += '<option value="' + escHtml(value) + '" selected>' + escHtml(value) + ' (chưa hỗ trợ)</option>';
      }
      return '<div style="margin-top:6px;"><div style="font-size:12px;color:var(--text-2);">' + label + '</div><select class="field-input" data-field="' + field + '" style="width:100%;">' + opts + '</select></div>';
    }
    return '<div style="margin-top:6px;"><div style="font-size:12px;color:var(--text-2);">' + label + '</div><input class="field-input" data-field="' + field + '" value="' + escHtml(value) + '" style="width:100%;"></div>';
  }

  // Giá trị thô trong file ngoài ('Chi'/'Thu') phải hiển thị đúng lựa chọn
  // trong dropdown (chỉ có 'Chi tiêu'/'Thu nhập') — nếu không dropdown sẽ
  // về "— Chọn —" và lưu lại rớt lỗi 'Thiếu loại giao dịch' dù loại vốn hợp lệ.
  function displayType(raw) {
    var v = trim(raw || '');
    if (v === 'Chi' || v === 'Chi tiêu') return 'Chi tiêu';
    if (v === 'Thu' || v === 'Thu nhập') return 'Thu nhập';
    if (v === 'Chuyển khoản') return 'Chuyển khoản';
    return v;
  }

  function editRowHtml(row) {
    var m = importState.mapping;
    var dateV = trim(targetCell(row.cells, m, 'date'));
    var amountV = trim(targetCell(row.cells, m, 'amount'));
    var typeV = displayType(targetCell(row.cells, m, 'type'));
    var catV = trim(targetCell(row.cells, m, 'category'));
    var contentIdx = m.indexOf('content');
    var contentV = contentIdx !== -1 ? trim(row.cells[contentIdx] || '') : '';
    var html = '<div data-edit-wrap="' + row.key + '" style="padding:8px 0;border-bottom:1px solid var(--border-color);background:var(--bg-card2);border-radius:12px;padding:10px;">'
      + '<div style="font-size:13px;font-weight:700;">Sửa dòng ' + row.lineNo + ' <span style="font-weight:400;color:#E11D48;">(' + escHtml(row.reason) + ')</span></div>';
    html += editFieldHtml('date', 'Ngày (dd/mm/yyyy hoặc ISO)', dateV, 'text');
    html += editFieldHtml('amount', 'Số tiền', amountV, 'text');
    html += editFieldHtml('type', 'Loại giao dịch', typeV, 'type');
    html += editFieldHtml('category', 'Danh mục', catV, 'text');
    if (contentIdx !== -1) html += editFieldHtml('content', 'Nội dung', contentV, 'text');
    else html += '<div style="font-size:12px;color:var(--text-2);margin-top:6px;">Nội dung không có cột riêng — sẽ lấy theo danh mục.</div>';
    html += '<div style="display:flex;gap:8px;margin-top:10px;"><button class="btn-save" data-action="save-edit" data-key="' + row.key + '" style="flex:1;"><i class="fas fa-check"></i> Lưu</button>'
      + '<button class="btn-cancel" data-action="cancel-edit" data-key="' + row.key + '" style="flex:1;">Hủy</button></div></div>';
    return html;
  }

  function sectionToggleHtml(section, label, count, allChecked) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-top:14px;"><input type="checkbox" class="import-section-check" data-section="' + section + '"' + (allChecked ? ' checked' : '') + ' style="flex-shrink:0;">'
      + '<div class="field-label" style="margin:0;">' + label + ' (' + count + ')</div></div>';
  }

  function renderImportSections() {
    importState.step = 'preview';
    setImportTitle('Xem trước khi nhập CSV');
    var body = getEl('importPreviewBody');
    var progress = getEl('importProgress');
    if (progress) { progress.style.display = 'none'; progress.textContent = ''; }
    if (!body) return;
    var ready = importState.ready, dups = importState.duplicates, errs = importState.errors, uns = importState.unsupported;
    var html = '<div class="field-helper" style="margin-bottom:4px;">File: <b>' + escHtml(importState.fileName) + '</b></div>';
    html += '<button class="btn-soft" data-action="back-mapping" style="padding:6px 12px;margin-bottom:4px;"><i class="fas fa-arrow-left"></i> Sửa ánh xạ cột</button>';
    var readyAll = ready.length > 0 && ready.every(function (r) { return r.checked; });
    html += sectionToggleHtml('ready', 'Sẵn sàng nhập (mặc định nhập hết)', ready.length, readyAll);
    if (ready.length === 0) html += '<div style="font-size:13px;color:var(--text-2);padding:6px 0;">Không có dòng nào sẵn sàng.</div>';
    ready.forEach(function (r) { html += readyRowHtml(r); });
    var dupAll = dups.length > 0 && dups.every(function (r) { return r.checked; });
    html += sectionToggleHtml('duplicates', 'Trùng lặp (mặc định KHÔNG nhập — tick để nhập ép)', dups.length, dupAll);
    if (dups.length === 0) html += '<div style="font-size:13px;color:var(--text-2);padding:6px 0;">Không có dòng trùng.</div>';
    dups.forEach(function (r) { html += dupRowHtml(r); });
    html += '<div class="field-label" style="margin-top:14px;">Lỗi (' + errs.length + ') — bấm Sửa để sửa rồi nhập</div>';
    if (errs.length === 0) html += '<div style="font-size:13px;color:var(--text-2);padding:6px 0;">Không có dòng lỗi.</div>';
    errs.forEach(function (r) { html += errorRowHtml(r); });
    // R52 — nhóm "loại chưa hỗ trợ": KHÁC R51 ở chỗ không còn "không nhập
    // được" nữa — mỗi dòng có lựa chọn đích (mặc định Bỏ qua), vẽ ĐỦ mọi
    // dòng (không cắt 5 dòng như trước vì giờ mỗi dòng đều cần chọn).
    html += '<div class="field-label" style="margin-top:14px;">Loại chưa hỗ trợ (' + uns.length + ') — chọn nơi nhập vào</div>';
    if (uns.length === 0) html += '<div style="font-size:13px;color:var(--text-2);padding:6px 0;">Không có dòng loại chưa hỗ trợ.</div>';
    else {
      html += '<div style="font-size:13px;color:var(--text-2);padding:6px 0;">Những dòng này có loại giao dịch app chưa hỗ trợ. App không tự đoán — chọn Chi tiêu, Thu nhập hoặc Bỏ qua cho từng dòng (mặc định: Bỏ qua). Dòng được chọn sẽ nhập với danh mục "Chuyển khoản".</div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px;">'
        + '<button class="btn-soft" data-action="unsupported-all" data-dest="Chi tiêu" style="padding:6px 12px;">Tất cả → Chi tiêu</button>'
        + '<button class="btn-soft" data-action="unsupported-all" data-dest="Thu nhập" style="padding:6px 12px;">Tất cả → Thu nhập</button>'
        + '<button class="btn-soft" data-action="unsupported-all" data-dest="skip" style="padding:6px 12px;">Tất cả → Bỏ qua</button></div>';
      uns.forEach(function (u) { html += unsupportedRowHtml(u); });
    }
    body.innerHTML = html;
    updatePrimaryButton();
  }

  function findRow(section, key) {
    var arr = section === 'ready' ? importState.ready : importState.duplicates;
    for (var i = 0; i < arr.length; i++) if (arr[i].key === key) return arr[i];
    return null;
  }

  function syncSectionToggle(section) {
    var arr = section === 'ready' ? importState.ready : importState.duplicates;
    var box = document.querySelector('.import-section-check[data-section="' + section + '"]');
    if (box) box.checked = arr.length > 0 && arr.every(function (r) { return r.checked; });
  }

  function txDuplicatesCurrent(tx) {
    if (isDuplicateTx(tx, importState.existingByMonth)) return true;
    var key = keyOf(tx);
    var found = false;
    importState.ready.forEach(function (r) { if (keyOf(r.tx) === key) found = true; });
    importState.duplicates.forEach(function (r) { if (keyOf(r.tx) === key) found = true; });
    return found;
  }

  function saveEditErrorRow(key) {
    var idx = -1;
    for (var i = 0; i < importState.errors.length; i++) if (importState.errors[i].key === key) { idx = i; break; }
    if (idx === -1) return;
    var row = importState.errors[idx];
    var wrap = document.querySelector('[data-edit-wrap="' + key + '"]');
    if (!wrap) return;
    var vals = {};
    var inputs = wrap.querySelectorAll('[data-field]');
    for (var j = 0; j < inputs.length; j++) vals[inputs[j].getAttribute('data-field')] = inputs[j].value;
    var m = importState.mapping;
    var newCells = row.cells.slice();
    function setCell(target, value) {
      var ci = m.indexOf(target);
      if (ci !== -1) {
        while (newCells.length <= ci) newCells.push('');
        newCells[ci] = value;
      }
    }
    setCell('date', trim(vals.date || ''));
    setCell('amount', trim(vals.amount || ''));
    setCell('type', trim(vals.type || ''));
    setCell('category', trim(vals.category || ''));
    if (vals.content !== undefined) setCell('content', trim(vals.content));
    var r = mapRowMapped(newCells, m, row.lineNo);
    importState.errors.splice(idx, 1);
    importState.editKey = null;
    if (r.kind === 'tx') {
      if (m.indexOf('content') === -1 && vals.content !== undefined) r.tx.content = trim(vals.content) || r.tx.category;
      if (txDuplicatesCurrent(r.tx)) {
        importState.duplicates.push({ key: importState.nextKey++, tx: r.tx, dupInfo: { date: r.tx.date, content: r.tx.content, amount: r.tx.amount, type: r.tx.type, inFile: false }, checked: false });
      } else {
        importState.ready.push({ key: importState.nextKey++, tx: r.tx, checked: true });
      }
    } else if (r.kind === 'unsupported') {
      // R52: sửa xong mà loại vẫn chưa hỗ trợ thì về nhóm chưa hỗ trợ
      // (mặc định Bỏ qua) chứ không biến mất khỏi xem trước.
      importState.unsupported.push({ key: importState.nextKey++, lineNo: row.lineNo, cells: newCells, typeRaw: r.typeRaw, date: r.date, amount: r.amount, content: r.content, note: r.note, dest: 'skip' });
    } else {
      importState.errors.push({ key: row.key, lineNo: row.lineNo, cells: newCells, reason: r.reason });
    }
    renderImportSections();
  }

  function onImportBodyChange(e) {
    var t = e.target;
    if (!t || !t.classList) return;
    if (t.classList.contains('import-map-select')) { onMappingSelectChange(t); return; }
    if (t.classList.contains('import-row-check')) {
      var section = t.getAttribute('data-section');
      var key = parseInt(t.getAttribute('data-key'), 10);
      var row = findRow(section, key);
      if (row) row.checked = !!t.checked;
      syncSectionToggle(section);
      updatePrimaryButton();
      return;
    }
    // R52 — đổi đích của một dòng chưa hỗ trợ: cập nhật state + số tiền /
    // gợi ý trùng tại chỗ, nút "Nhập N" cập nhật theo (không vẽ lại).
    if (t.classList.contains('import-unsupported-select')) {
      var ukey = parseInt(t.getAttribute('data-key'), 10);
      var urow = null;
      for (var ui = 0; ui < importState.unsupported.length; ui++) {
        if (importState.unsupported[ui].key === ukey) { urow = importState.unsupported[ui]; break; }
      }
      if (urow) {
        var uval = t.value || 'skip';
        urow.dest = (uval === 'Chi tiêu' || uval === 'Thu nhập') ? uval : 'skip';
        refreshUnsupportedDom(urow);
      }
      updatePrimaryButton();
      return;
    }
    if (t.classList.contains('import-section-check')) {
      var sec = t.getAttribute('data-section');
      var arr = sec === 'ready' ? importState.ready : importState.duplicates;
      var state = !!t.checked;
      arr.forEach(function (r) { r.checked = state; });
      var boxes = document.querySelectorAll('.import-row-check[data-section="' + sec + '"]');
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = state;
      updatePrimaryButton();
      return;
    }
  }

  function onImportBodyClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var key = parseInt(btn.getAttribute('data-key'), 10);
    if (action === 'back-mapping') { renderMappingStep(); return; }
    // R52 — chọn hàng loạt cho nhóm chưa hỗ trợ; select từng dòng vẫn sửa
    // lại được sau đó (hàng loạt chỉ đặt giá trị, không khóa gì).
    if (action === 'unsupported-all') {
      var udest = btn.getAttribute('data-dest') || 'skip';
      if (udest !== 'Chi tiêu' && udest !== 'Thu nhập') udest = 'skip';
      importState.unsupported.forEach(function (u) {
        u.dest = udest;
        var sel = document.querySelector('.import-unsupported-select[data-key="' + u.key + '"]');
        if (sel) sel.value = udest;
        refreshUnsupportedDom(u);
      });
      updatePrimaryButton();
      return;
    }
    if (action === 'undo-last-batch') { startUndoFromSummary(); return; }
    if (action === 'undo-retry') { startUndoFromSummary(); return; }
    if (action === 'edit-error') { importState.editKey = key; renderImportSections(); return; }
    if (action === 'cancel-edit') { importState.editKey = null; renderImportSections(); return; }
    if (action === 'save-edit') { saveEditErrorRow(key); return; }
  }

  function onPrimaryAction() {
    if (importState.step === 'mapping') { proceedFromMapping(); return; }
    if (importState.step === 'preview') { confirmImport(); return; }
    if (importState.step === 'retry') { renderImportSections(); return; }
    if (importState.step === 'done') { closeImportSheet(); return; }
    if (importState.step === 'undoDone') { closeImportSheet(); return; }
  }

  // ---------- Đọc file + ánh xạ + kiểm tra trùng ----------
  async function readFileText(file) {
    if (typeof file.text === 'function') return await file.text();
    return await new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () { resolve(rd.result || ''); };
      rd.onerror = function () { reject(new Error('Không đọc được file')); };
      rd.readAsText(file);
    });
  }

  async function handleImportFile(file) {
    if (!file) return;
    var token = ++importState.loadToken;
    importState.loadCancelled = false;
    importState.fileName = file.name || 'file.csv';
    importState.step = 'loading';
    importState.headerRow = null;
    importState.rows = null;
    importState.mapping = null;
    importState.ready = [];
    importState.duplicates = [];
    importState.errors = [];
    importState.unsupported = [];
    importState.existingByMonth = null;
    importState.editKey = null;
    openImportSheet();
    showImportSpinner('Đang đọc file…');
    var text = '';
    try {
      text = await readFileText(file);
    } catch (e) {
      if (token === importState.loadToken) {
        hideImportSpinner();
        renderImportError('<div style="color:#E11D48;">Không đọc được file: ' + escHtml(e.message || e) + '</div>');
      }
      return;
    }
    if (token !== importState.loadToken || importState.loadCancelled) return;
    var rows = parseCsvText(text);
    if (rows.length < 2) {
      hideSpinnerFor(token);
      renderImportError('<div style="color:#E11D48;">File không có dòng dữ liệu.</div>');
      return;
    }
    importState.headerRow = rows[0];
    importState.rows = rows;
    importState.mapping = guessMapping(rows[0]);
    renderMappingStep();
    hideSpinnerFor(token);
  }

  async function proceedFromMapping() {
    var v = validateMapping(importState.mapping);
    if (!v.ok) {
      var errBox = getEl('importMappingError');
      if (errBox) errBox.innerHTML = '<div style="color:#E11D48;margin-bottom:12px;">Chưa đủ trường bắt buộc: <b>' + escHtml(v.missing.join(', ')) + '</b>. Hãy chọn cột cho các trường này rồi bấm Tiếp tục.</div>';
      return;
    }
    var token = importState.loadToken;
    showImportSpinner('Đang kiểm tra trùng lặp…');
    try {
      var mapped = mapAllRowsMapped(importState.rows, importState.mapping);
      var months = {};
      mapped.txs.forEach(function (tx) { months[parseInt(tx.date.split('/')[1], 10)] = true; });
      var existingByMonth = new Map();
      var monthNums = Object.keys(months).map(function (k) { return parseInt(k, 10); });
      for (var i = 0; i < monthNums.length; i++) {
        if (token !== importState.loadToken || importState.loadCancelled) return;
        var m = monthNums[i];
        var list = [];
        try { list = (typeof fetchMonthData === 'function') ? (await fetchMonthData(m)) || [] : []; } catch (e) { list = []; }
        if (token !== importState.loadToken || importState.loadCancelled) return;
        var set = new Set();
        list.forEach(function (t) { if (t && t.date) set.add(keyOf({ date: t.date, type: t.type, category: t.category, amount: t.amount, content: t.content })); });
        existingByMonth.set(m, set);
      }
      if (token !== importState.loadToken || importState.loadCancelled) return;
      importState.existingByMonth = existingByMonth;
      var cls = classifyImportRows(mapped.txs, existingByMonth);
      importState.ready = cls.ready.map(function (tx) { return { key: importState.nextKey++, tx: tx, checked: true }; });
      importState.duplicates = cls.duplicates.map(function (d) { return { key: importState.nextKey++, tx: d.tx, dupInfo: d.dupInfo, checked: false }; });
      importState.errors = mapped.failed.map(function (f) { return { key: importState.nextKey++, lineNo: f.lineNo, cells: f.cells, reason: f.reason }; });
      importState.unsupported = mapped.unsupported.map(function (u) { return { key: importState.nextKey++, lineNo: u.lineNo, cells: u.cells, typeRaw: u.typeRaw, date: u.date, amount: u.amount, content: u.content, note: u.note, dest: 'skip' }; });
      renderImportSections();
    } catch (e) {
      if (token === importState.loadToken) renderImportError('<div style="color:#E11D48;">Lỗi khi xử lý file: ' + escHtml(e.message || e) + '</div>');
    } finally {
      hideSpinnerFor(token);
    }
  }

  // ---------- Ghi hàng loạt ----------
  async function confirmImport() {
    var writeSet = computeWriteSet(importState.ready, importState.duplicates, importState.unsupported);
    if (importState.running || writeSet.length === 0) return;
    if (typeof chatId === 'undefined' || !chatId) {
      try { showToast('Chưa xác định được người dùng (chatId trống), không thể ghi.', 'error'); } catch (e) {}
      return;
    }
    importState.running = true;
    importState.step = 'writing';
    var progress = getEl('importProgress');
    if (progress) { progress.style.display = 'block'; progress.textContent = 'Đang nhập 0/' + writeSet.length + '…'; }
    showImportSpinner('Đang nhập 0/' + writeSet.length + '…');
    var result = null;
    var runError = null;
    try {
      result = await runImport(writeSet, {
        chatId: chatId,
        fetchAll: function () { return secureFetch('/transactions/users/' + chatId + '.json'); },
        put: function (path, body) { return secureFetch(path, 'PUT', body); },
        onProgress: function (done, total) {
          var txt = 'Đang nhập ' + done + '/' + total + '…';
          if (progress) progress.textContent = txt;
          var sp = getEl('importSpinnerText');
          if (sp) sp.textContent = txt;
        },
        yieldEvery: 10
      });
    } catch (e) {
      runError = e;
    }
    importState.running = false;
    hideImportSpinner();
    if (progress) { progress.style.display = 'none'; progress.textContent = ''; }
    if (runError) {
      // fetchAll lỗi TRƯỚC mọi PUT nên chưa ghi dòng nào — cho thử lại: bấm
      // "Thử lại" vẽ lại các nhóm rồi bấm Nhập như cũ.
      renderImportError('<div style="color:#E11D48;">Nhập dừng vì lỗi tải dữ liệu: ' + escHtml(runError.message || runError) + '. Chưa ghi dòng nào mới trong đợt này.</div>');
      importState.step = 'retry';
      setPrimaryButton('<i class="fas fa-rotate-right"></i> Thử lại', false);
      return;
    }
    refreshViewsAfterDataChange();
    // Ghi nhận đợt nhập để hoàn tác được. Chỉ những id ghi THÀNH CÔNG mới
    // vào bản ghi (nhập một phần vẫn hoàn tác đúng phần đã nhập). Ghi bản
    // ghi thất bại thì KHÔNG bịa bản ghi — tổng kết báo rõ đợt này không
    // có hoàn tác.
    var lastBatch = null, batchSaveFailed = false;
    if (result.imported > 0 && result.writtenIds && result.writtenIds.length > 0) {
      var batch = { id: newImportBatchId(), filename: importState.fileName || 'file.csv', importedAt: new Date().toISOString(), count: result.writtenIds.length, ids: result.writtenIds };
      try { await secureFetch(importBatchPath(batch.id), 'PUT', batch); lastBatch = batch; }
      catch (e) { batchSaveFailed = true; }
    }
    importState.lastBatch = lastBatch;
    importState.lastBatchSaveFailed = batchSaveFailed;
    // R52 — tổng kết qua hàm thuần (đếm đúng dòng chưa hỗ trợ được ghi theo
    // từng chiều, trừ dòng ghi lỗi theo identity; dòng chưa hỗ trợ để Bỏ qua
    // tính vào "Bỏ chọn"). _mappedTx do computeWriteSet cache lúc tạo
    // writeSet nên đây đúng là các object đã ghi.
    var mappedTxs = [];
    importState.unsupported.forEach(function (r) { if (r._mappedTx) mappedTxs.push(r._mappedTx); });
    var summary = summarizeImport(
      { ready: importState.ready, duplicates: importState.duplicates, unsupported: importState.unsupported, errors: importState.errors },
      mappedTxs, result);
    importState.step = 'done';
    setImportTitle('Kết quả nhập CSV');
    var body = getEl('importPreviewBody');
    var html = '<div class="field-helper" style="margin-bottom:12px;">Nhập xong.</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + summary.imported + '</b><br><span style="font-size:12px;color:var(--text-2);">Đã nhập</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + summary.skippedUnchecked + '</b><br><span style="font-size:12px;color:var(--text-2);">Bỏ chọn (không nhập)</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + summary.duplicatesForced + '</b><br><span style="font-size:12px;color:var(--text-2);">Trùng nhập ép</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + summary.errorsRemaining + '</b><br><span style="font-size:12px;color:var(--text-2);">Lỗi còn lại</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + summary.failedCount + '</b><br><span style="font-size:12px;color:var(--text-2);">Ghi lỗi</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + summary.mappedChi + '</b><br><span style="font-size:12px;color:var(--text-2);">Loại chưa hỗ trợ → Chi</span></div>';
    html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + summary.mappedThu + '</b><br><span style="font-size:12px;color:var(--text-2);">Loại chưa hỗ trợ → Thu</span></div>';
    html += '</div>';
    if (result.failedRows.length > 0) {
      html += '<div class="field-label">Dòng ghi lỗi (tối đa 5 dòng đầu)</div>';
      result.failedRows.slice(0, 5).forEach(function (f) {
        html += '<div style="font-size:13px;color:var(--text-2);padding:4px 0;">' + escHtml(f.tx.date) + ' — ' + escHtml(f.tx.content) + ': ' + escHtml(f.error) + '</div>';
      });
    }
    if (lastBatch) {
      html += '<button class="btn-danger-outline" data-action="undo-last-batch" style="width:100%;padding:10px;margin-top:8px;"><i class="fas fa-trash"></i> Xoá đợt vừa nhập</button>';
      html += '<div style="font-size:12px;color:var(--text-2);margin-top:6px;">Chỉ xoá đúng ' + lastBatch.count + ' giao dịch vừa nhập, dữ liệu cũ không bị động tới.</div>';
    } else if (batchSaveFailed) {
      html += '<div style="font-size:13px;color:#E11D48;margin-top:8px;">Không lưu được bản ghi đợt nhập nên đợt này KHÔNG có hoàn tác. Các giao dịch đã nhập vẫn còn nguyên.</div>';
    }
    if (body) body.innerHTML = html;
    updatePrimaryButton();
    try { triggerHapticNotification('success'); } catch (e) {}
    try { showToast('Đã nhập ' + result.imported + ' giao dịch!', 'success'); } catch (e) {}
    renderImportHistory();
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
    if (confirmBtn) confirmBtn.onclick = function () { onPrimaryAction(); };
    var body = getEl('importPreviewBody');
    if (body) {
      body.addEventListener('change', onImportBodyChange);
      body.addEventListener('click', onImportBodyClick);
    }
    // Lịch sử nhập trong Cài đặt: bấm Xoá trên từng đợt.
    var histList = getEl('importHistoryList');
    if (histList) {
      histList.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-action="undo-history"]') : null;
        if (!btn) return;
        var row = btn.closest('.import-history-row');
        var batchId = row ? row.getAttribute('data-batch-id') : null;
        if (batchId) startUndoFromHistory(batchId, row);
      });
    }
    // Cài đặt là trang fullscreen (#settingsPage, class 'show' khi mở) chứ
    // không phải tab nên không móc được vào activateTab — quan sát class để
    // tải lại lịch sử đúng lúc mở Cài đặt (không phụ thuộc thứ tự script).
    var sp = getEl('settingsPage');
    if (sp && typeof MutationObserver !== 'undefined') {
      var wasShown = sp.classList.contains('show');
      new MutationObserver(function () {
        var shown = sp.classList.contains('show');
        if (shown && !wasShown) renderImportHistory();
        wasShown = shown;
      }).observe(sp, { attributes: true, attributeFilter: ['class'] });
    }
    renderImportHistory();
  }
  bindImportUI();

  // ---------- 9. HOÀN TÁC ĐỢT NHẬP (R51 bổ sung) ----------
  // Mỗi lần nhập thành công (dù chỉ một phần) đều ghi một bản ghi đợt nhập:
  // { id, filename, importedAt (ISO), count, ids: [...] } tại
  // /users/${chatId}/csvImports/${id}.json (cùng nút /users/${chatId}/ với
  // keywords sẵn có). Hoàn tác chỉ xoá đúng các id trong bản ghi — dữ liệu
  // cũ (kể cả giao dịch trùng nội dung nhưng có từ trước) không bao giờ bị
  // động tới vì xoá theo id, không theo nội dung. Nếu user đã sửa một giao
  // dịch thuộc đợt rồi bấm hoàn tác thì giao dịch đó VẪN bị xoá (vì thuộc
  // đợt) — điều này ghi rõ trong hộp xác nhận.
  function newImportBatchId() { return 'IMP' + Date.now(); }
  function importBatchesPath() { return '/users/' + chatId + '/csvImports.json'; }
  function importBatchPath(batchId) { return '/users/' + chatId + '/csvImports/' + batchId + '.json'; }

  // Chuẩn hóa object Firebase thành mảng đợt, mới nhất trước. (Thuần.)
  function normalizeImportBatches(data) {
    var arr = [];
    if (Array.isArray(data)) arr = data.filter(function (b) { return !!b; });
    else if (data && typeof data === 'object') Object.keys(data).forEach(function (k) { if (data[k]) arr.push(data[k]); });
    arr.sort(function (a, b) {
      var x = String(a.importedAt || ''), y = String(b.importedAt || '');
      if (x === y) return 0;
      return x < y ? 1 : -1;
    });
    return arr;
  }

  async function loadImportBatches() {
    var data = await secureFetch(importBatchesPath());
    return normalizeImportBatches(data);
  }

  // ISO -> "dd/mm/yyyy hh:mm" theo giờ máy (thiết bị của user).
  function formatBatchDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso || '');
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return String(iso || ''); }
  }

  // Bản đồ id -> số tháng HIỆN TẠI, từ dữ liệu toàn cục (cùng dạng fetchAll
  // của runImport: { month_1: { GD001: {...} }, ... }). Dùng dữ liệu hiện
  // tại nên giao dịch bị sửa ngày (đổi tháng) vẫn tìm đúng tháng mới; id
  // không còn trong dữ liệu = đã mất (user xoá tay rồi).
  function buildIdMonthMap(allData) {
    var map = {};
    if (!allData || typeof allData !== 'object') return map;
    Object.keys(allData).forEach(function (monthKey) {
      var m = parseInt(String(monthKey).split('_')[1], 10);
      if (!m) return;
      var monthObj = allData[monthKey];
      if (!monthObj || typeof monthObj !== 'object') return;
      Object.keys(monthObj).forEach(function (k) {
        var item = monthObj[k];
        if (item && item.id) map[String(item.id)] = m;
      });
    });
    return map;
  }

  // Lõi hoàn tác (test được qua deps giả). deps: { getBatch, fetchAll, del,
  // deleteRecord, updateRecord, onProgress, chatId }.
  // Trả về: { status: 'not-found' } | { status: 'load-error', error } |
  // { status: 'done', deleted, gone, errors: [{id, error}], remainingIds,
  //   recordDeleted, recordError }.
  // Quy tắc giữ bản ghi: xoá hết (kể cả id đã mất) thì xoá luôn bản ghi;
  // còn sót id lỗi thì GIỮ bản ghi với đúng danh sách id lỗi để bấm xoá
  // lại được; bản ghi không cập nhật được thì báo recordError (bấm lại vẫn
  // hội tụ vì id đã xoá/mất sẽ được đếm lại từ đầu).
  async function undoImportBatch(batch, deps) {
    var fresh = null;
    try { fresh = await deps.getBatch(batch.id); }
    catch (e) { return { status: 'load-error', error: (e && e.message) ? e.message : String(e) }; }
    if (!fresh) return { status: 'not-found' };
    var ids = Array.isArray(fresh.ids) ? fresh.ids : [];
    if (ids.length === 0) {
      try { await deps.deleteRecord(batch.id); }
      catch (e) { return { status: 'done', deleted: 0, gone: 0, errors: [], remainingIds: [], recordDeleted: false, recordError: (e && e.message) ? e.message : String(e) }; }
      return { status: 'done', deleted: 0, gone: 0, errors: [], remainingIds: [], recordDeleted: true, recordError: null };
    }
    var allData;
    try { allData = await deps.fetchAll(); }
    catch (e) { return { status: 'load-error', error: (e && e.message) ? e.message : String(e) }; }
    var monthById = buildIdMonthMap(allData);
    var deleted = 0, gone = 0, errors = [], remaining = [];
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i]);
      var month = monthById[id];
      if (!month) { gone += 1; continue; }
      try {
        await deps.del('/transactions/users/' + deps.chatId + '/month_' + month + '/' + id + '.json');
        deleted += 1;
      } catch (e) {
        errors.push({ id: id, error: (e && e.message) ? e.message : String(e) });
        remaining.push(id);
      }
      if (typeof deps.onProgress === 'function') deps.onProgress(i + 1, ids.length);
    }
    var recordDeleted = false, recordError = null;
    if (errors.length === 0) {
      try { await deps.deleteRecord(batch.id); recordDeleted = true; }
      catch (e) { recordError = (e && e.message) ? e.message : String(e); }
    } else {
      try { await deps.updateRecord({ id: fresh.id, filename: fresh.filename, importedAt: fresh.importedAt, count: remaining.length, ids: remaining }); }
      catch (e) { recordError = (e && e.message) ? e.message : String(e); }
    }
    return { status: 'done', deleted: deleted, gone: gone, errors: errors, remainingIds: remaining, recordDeleted: recordDeleted, recordError: recordError };
  }

  // Làm mới các mặt hiển thị sau khi dữ liệu thay đổi (dùng chung cho nhập
  // và hoàn tác): xóa cache + đánh dấu Báo cáo cần tải lại + vẽ lại tab
  // đang mở. Giữ nguyên hành vi R50 (chỉ tách thành hàm dùng chung).
  function refreshViewsAfterDataChange() {
    try { window.apiTxCache = {}; } catch (e) {}
    try { if (window.dayTxCache) window.dayTxCache = {}; } catch (e) {}
    try { tab2NeedsReload = true; } catch (e) {}
    try {
      if (document.getElementById('tab1') && document.getElementById('tab1').classList.contains('active')) displayTransactions();
      else if (document.getElementById('tab2') && document.getElementById('tab2').classList.contains('active')) updateTimeNavUI();
      else if (document.getElementById('tab3') && document.getElementById('tab3').classList.contains('active')) displaySearchResults();
    } catch (e) {}
  }

  function undoConfirmHtml(batch) {
    return 'Xoá toàn bộ <strong>' + escHtml(batch.count) + ' giao dịch</strong> của đợt nhập file <strong>' + escHtml(batch.filename) + '</strong> lúc <strong>' + escHtml(formatBatchDate(batch.importedAt)) + '</strong>?<br><br>Dữ liệu cũ không bị động tới — chỉ xoá đúng các giao dịch thuộc đợt này. <strong>Giao dịch thuộc đợt này dù đã sửa vẫn sẽ bị xoá.</strong>';
  }

  function undoDeps(onProgress) {
    return {
      chatId: chatId,
      getBatch: function (id) { return secureFetch(importBatchPath(id)); },
      fetchAll: function () { return secureFetch('/transactions/users/' + chatId + '.json'); },
      del: function (path) { return secureFetch(path, 'DELETE'); },
      deleteRecord: function (id) { return secureFetch(importBatchPath(id), 'DELETE'); },
      updateRecord: function (batch) { return secureFetch(importBatchPath(batch.id), 'PUT', batch); },
      onProgress: onProgress
    };
  }

  function renderUndoResult(res, batch) {
    setImportTitle('Kết quả xoá đợt nhập');
    var body = getEl('importPreviewBody');
    var html = '';
    if (res.status === 'not-found') {
      html += '<div class="field-helper" style="margin-bottom:12px;">Đợt nhập này đã được xoá hoàn tác trước đó, không còn gì để xoá.</div>';
    } else if (res.status === 'load-error') {
      html += '<div style="color:#E11D48;margin-bottom:12px;">Không xoá được vì lỗi tải dữ liệu: ' + escHtml(res.error) + '. Chưa xoá dòng nào, hãy thử lại.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">';
      html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + res.deleted + '</b><br><span style="font-size:12px;color:var(--text-2);">Đã xoá</span></div>';
      html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + res.gone + '</b><br><span style="font-size:12px;color:var(--text-2);">Đã mất trước đó</span></div>';
      html += '<div style="background:var(--bg-card2);border-radius:12px;padding:10px;"><b style="font-size:18px;">' + res.errors.length + '</b><br><span style="font-size:12px;color:var(--text-2);">Lỗi</span></div>';
      html += '</div>';
      if (res.errors.length > 0) {
        html += '<div class="field-label">Id xoá lỗi (tối đa 5 id đầu)</div>';
        res.errors.slice(0, 5).forEach(function (f) {
          html += '<div style="font-size:13px;color:var(--text-2);padding:4px 0;">' + escHtml(f.id) + ': ' + escHtml(f.error) + '</div>';
        });
      }
      if (res.recordDeleted) {
        html += '<div style="font-size:13px;color:var(--text-2);margin-top:8px;">Đã xoá bản ghi đợt nhập — đợt này không còn hoàn tác được nữa.</div>';
      } else if (res.recordError) {
        html += '<div style="font-size:13px;color:#E11D48;margin-top:8px;">Chưa cập nhật được bản ghi đợt (' + escHtml(res.recordError) + ') — bấm “Xoá lại” để thử tiếp.</div>';
      } else if (res.remainingIds.length > 0) {
        html += '<div style="font-size:13px;color:var(--text-2);margin-top:8px;">Bản ghi đợt còn giữ ' + res.remainingIds.length + ' id lỗi — bấm “Xoá lại” để thử tiếp.</div>';
      }
      if (!res.recordDeleted && res.remainingIds.length > 0) {
        html += '<button class="btn-soft" data-action="undo-retry" style="width:100%;padding:10px;margin-top:8px;"><i class="fas fa-rotate-right"></i> Xoá lại các dòng còn lại</button>';
      }
    }
    if (body) body.innerHTML = html;
    importState.step = 'undoDone';
    updatePrimaryButton();
  }

  function startUndoFromSummary() {
    var batch = importState.lastBatch;
    if (!batch || importState.running) return;
    showCustomConfirm('Xoá đợt nhập CSV', undoConfirmHtml(batch), 'Xoá đợt này', async function () {
      importState.running = true;
      showImportSpinner('Đang xoá đợt nhập…');
      var res;
      try {
        res = await undoImportBatch(batch, undoDeps(function (done, total) {
          var sp = getEl('importSpinnerText');
          if (sp) sp.textContent = 'Đang xoá ' + done + '/' + total + '…';
        }));
      } catch (e) {
        res = { status: 'load-error', error: (e && e.message) ? e.message : String(e) };
      }
      importState.running = false;
      hideImportSpinner();
      if (res.status === 'done') {
        if (res.deleted > 0) refreshViewsAfterDataChange();
        if (res.recordDeleted) importState.lastBatch = null;
        else importState.lastBatch = { id: batch.id, filename: batch.filename, importedAt: batch.importedAt, count: res.remainingIds.length, ids: res.remainingIds };
        renderImportHistory();
      }
      renderUndoResult(res, batch);
      try { triggerHapticNotification(res.status === 'done' ? 'success' : 'error'); } catch (e) {}
    });
  }

  function renderImportHistory() {
    var list = getEl('importHistoryList');
    if (!list) return;
    if (typeof chatId === 'undefined' || !chatId) {
      list.innerHTML = '<div style="font-size:13px;color:var(--text-2);">Không tải được lịch sử (chưa xác định người dùng).</div>';
      return;
    }
    list.innerHTML = '<div style="font-size:13px;color:var(--text-2);">Đang tải lịch sử nhập…</div>';
    loadImportBatches().then(function (batches) {
      var html = '';
      if (batches.length === 0) {
        html = '<div style="font-size:13px;color:var(--text-2);">Chưa có đợt nhập CSV nào.</div>';
      } else {
        batches.forEach(function (b) {
          html += '<div class="import-history-row" data-batch-id="' + escHtml(b.id) + '" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;">'
            + '<span style="flex:1;min-width:0;"><b>' + escHtml(b.filename || '(không tên)') + '</b><br><span style="color:var(--text-2);font-size:12px;">' + escHtml(formatBatchDate(b.importedAt)) + ' — ' + escHtml(b.count) + ' dòng</span></span>'
            + '<span class="import-history-status" style="font-size:12px;color:var(--text-2);"></span>'
            + '<button class="btn-mini" data-action="undo-history" style="padding:6px 12px;">Xoá</button>'
            + '</div>';
        });
      }
      list.innerHTML = html;
    }).catch(function (e) {
      list.innerHTML = '<div style="font-size:13px;color:var(--text-2);">Không tải được lịch sử nhập: ' + escHtml((e && e.message) ? e.message : e) + '</div>';
    });
  }

  function startUndoFromHistory(batchId, rowEl) {
    if (importState.undoRunning) return;
    var btn = rowEl ? rowEl.querySelector('[data-action="undo-history"]') : null;
    var statusEl = rowEl ? rowEl.querySelector('.import-history-status') : null;
    loadImportBatches().then(function (batches) {
      var batch = null;
      batches.forEach(function (b) { if (String(b.id) === String(batchId)) batch = b; });
      if (!batch) {
        try { showToast('Đợt nhập này đã được xoá trước đó, không còn gì để xoá.', 'info'); } catch (e) {}
        renderImportHistory();
        return;
      }
      showCustomConfirm('Xoá đợt nhập CSV', undoConfirmHtml(batch), 'Xoá đợt này', async function () {
        importState.undoRunning = true;
        if (btn) btn.disabled = true;
        var res;
        try {
          res = await undoImportBatch(batch, undoDeps(function (done, total) {
            if (statusEl) statusEl.textContent = 'Đang xoá ' + done + '/' + total + '…';
          }));
        } catch (e) {
          res = { status: 'load-error', error: (e && e.message) ? e.message : String(e) };
        }
        importState.undoRunning = false;
        if (statusEl) statusEl.textContent = '';
        if (btn) btn.disabled = false;
        if (res.status === 'not-found') {
          try { showToast('Đợt nhập này đã được xoá trước đó, không còn gì để xoá.', 'info'); } catch (e) {}
        } else if (res.status === 'load-error') {
          try { showToast('Không xoá được: ' + res.error, 'error'); } catch (e) {}
        } else {
          if (res.deleted > 0) refreshViewsAfterDataChange();
          var msg = 'Đã xoá ' + res.deleted + ' / đã mất ' + res.gone + ' / lỗi ' + res.errors.length;
          if (!res.recordDeleted && res.remainingIds.length > 0) msg += ' — còn ' + res.remainingIds.length + ' dòng lỗi, bấm Xoá lại để thử tiếp.';
          try { showToast(msg, res.errors.length > 0 ? 'info' : 'success'); } catch (e) {}
        }
        renderImportHistory();
      });
    }).catch(function (e) {
      try { showToast('Không tải được đợt nhập: ' + ((e && e.message) ? e.message : e), 'error'); } catch (e2) {}
    });
  }

})();
