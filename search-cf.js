// ============================================================================
// search-cf.js — TIM KIEM HOP NHAT (nap CUOI CUNG, sau app-upgrade.js)
// ----------------------------------------------------------------------------
// Port logic tim kiem cua MINIAPP-CLOUDFLARE: dung DUY NHAT 1 o nhap #searchQuery.
//   - Neu chuoi KHONG co khoang trang VA parse ra so > 0  -> tim theo SO TIEN
//     (khop dung tri tuyet doi). Ho tro nhap day du (2.000.000) hoac rut gon
//     (50k, 1tr5, 2m, 2ty...).
//   - Nguoc lai -> tim theo NOI DUNG/GHI CHU: tach theo khoang trang, TAT CA
//     tu khoa phai xuat hien (trong content hoac note).
// Dung lai lop du lieu san co cua finance (fetchMonthData qua secureFetch) —
// KHONG dung toi bat ky phan nao khac.
//
// Ngoai ra: doi nhan o "Dinh dang tien" thanh "Day du" / "Rut gon" va bien modal
// tim kiem cu (nhieu o) thanh dang 1 o nhap giong CLOUDFLARE.
// ============================================================================
(function () {
  'use strict';

  // 't' xep vao nhom TRIEU; 'b'/'ty'/'ti' = ty. (Giong currency.js cua CLOUDFLARE.)
  var CURRENCY_UNITS = {
    trieu: 1e6, nghin: 1e3, ngan: 1e3,
    tr: 1e6, ng: 1e3, ty: 1e9, ti: 1e9,
    k: 1e3, m: 1e6, t: 1e6, b: 1e9
  };
  var UNIT_PATTERN = 'trieu|nghin|ngan|tr|ng|ty|ti|k|m|t|b';

  // Port nguyen parseNumber cua CLOUDFLARE: chuoi -> so nguyen VND, tra null neu sai.
  function parseAmount(value) {
    if (value == null) return null;
    var str = value.toString().trim().toLowerCase();
    if (!str) return null;
    str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // bo dau tieng Viet
    str = str.replace(/đ|₫|vnd|\s/g, '');                       // bo ky hieu tien
    if (!str) return null;
    var negative = str.charAt(0) === '-';
    if (negative) str = str.slice(1);
    if (!str) return null;
    var m = str.match(new RegExp('^(\\d+([.,]\\d+)?)(' + UNIT_PATTERN + ')(\\d{0,3})$'));
    if (m) {
      var base = parseFloat(m[1].replace(',', '.'));
      var unit = CURRENCY_UNITS[m[3]];
      var fracDigits = m[4] || '';
      var frac = fracDigits ? parseFloat('0.' + fracDigits) : 0;
      var result = Math.round((base + frac) * unit);
      return negative ? -result : result;
    }
    if (/^\d+$/.test(str) || /^\d{1,3}([.,]\d{3})+$/.test(str)) {
      var n = parseInt(str.replace(/[.,]/g, ''), 10);
      return negative ? -n : n;
    }
    return null;
  }

  // ---------------- TIM KIEM: 1 O NHAP DUY NHAT ----------------
  async function runSearch() {
    if (typeof triggerHaptic === 'function') triggerHaptic('light');
    var input = document.getElementById('searchQuery');
    var raw = (input && input.value ? input.value : '').trim();
    if (!raw) {
      if (typeof showToast === 'function') showToast('Nhap noi dung hoac so tien de tim', 'warning');
      return;
    }

    var amount = null;
    if (!/\s/.test(raw)) { var parsed = parseAmount(raw); if (parsed && parsed > 0) amount = parsed; }

    if (typeof showLoading === 'function') showLoading(true, 'tab3');
    try {
      var fetchPromises = [];
      for (var mth = 1; mth <= 12; mth++) { fetchPromises.push(fetchMonthData(mth)); }
      var monthsResults = await Promise.all(fetchPromises);
      var txs = [];
      if (amount !== null) {
        // Tim theo SO TIEN: khop dung gia tri tuyet doi
        monthsResults.forEach(function (monthData) {
          (monthData || []).forEach(function (t) {
            if (t && Math.abs(Number(t.amount) || 0) === amount) txs.push(t);
          });
        });
      } else {
        // Tim theo NOI DUNG / GHI CHU: TAT CA tu khoa phai xuat hien
        var terms = raw.toLowerCase().split(/\s+/).filter(Boolean);
        monthsResults.forEach(function (monthData) {
          (monthData || []).forEach(function (t) {
            if (!t) return;
            var content = (t.content || '').toLowerCase();
            var note = (t.note || '').toLowerCase();
            var ok = terms.every(function (term) { return content.indexOf(term) !== -1 || note.indexOf(term) !== -1; });
            if (ok) txs.push(t);
          });
        });
      }
      cachedSearchResults = txs;
      currentPageSearch = 1;
      if (typeof window.displaySearchResults === 'function') window.displaySearchResults();
    } catch (e) {
      if (typeof showToast === 'function') showToast(e && e.message ? e.message : 'Co loi khi tim kiem', 'error');
    } finally {
      if (typeof showLoading === 'function') showLoading(false, 'tab3');
    }
  }
  window.__runCloudflareSearch = runSearch;

  // ---------------- DOI NHAN DINH DANG TIEN -> "Day du" / "Rut gon" ----------------
  function relabelCurrencyFormat() {
    var sel = document.getElementById('settingCurrencyFormat');
    if (!sel) return;
    Array.prototype.forEach.call(sel.options, function (o) {
      if (o.value === 'full') o.textContent = 'Đầy đủ';
      else if (o.value === 'short') o.textContent = 'Rút gọn';
    });
  }

  // ---------------- BIEN MODAL TIM KIEM CU -> 1 O NHAP (giong CLOUDFLARE) ----------------
  function simplifySearchModal() {
    var modal = document.getElementById('searchModal');
    if (!modal || document.getElementById('searchQuery')) return;
    var contentInput = document.getElementById('searchContent');
    var contentGroup = contentInput ? contentInput.closest('.field-group') : null;
    if (contentGroup && contentGroup.parentNode) {
      var wrap = document.createElement('div');
      wrap.className = 'field-group';
      wrap.innerHTML =
        '<div class="field-label">Nội dung hoặc số tiền</div>' +
        '<input type="text" id="searchQuery" class="field-input" placeholder="Nhập nội dung giao dịch hoặc số tiền">' +
        '<div style="font-size:0.78rem; color:var(--text-2); margin-top:8px; line-height:1.45;">Tìm theo nội dung, ghi chú hoặc số tiền. Hỗ trợ nhập số tiền dạng đầy đủ (2.000.000) hoặc rút gọn (50k, 1tr5, 2m).</div>';
      contentGroup.parentNode.insertBefore(wrap, contentGroup);
    }
    // An cac o loc cu (khong con dung trong che do tim kiem hop nhat)
    ['searchContent', 'searchAmount', 'searchCategory'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { var g = el.closest('.field-group'); if (g) g.style.display = 'none'; }
    });
    var pills = modal.querySelector('.period-pills');
    if (pills) pills.style.display = 'none';
    var cf = document.getElementById('searchCustomFilterContainer');
    if (cf) cf.style.display = 'none';
  }

  // Nap CUOI CUNG -> handler nay chay SAU app-init & app-upgrade (ghi de nut tim kiem).
  document.addEventListener('DOMContentLoaded', function () {
    try { relabelCurrencyFormat(); } catch (e) {}
    try { simplifySearchModal(); } catch (e) {}

    var btn = document.getElementById('searchTransactionsBtn');
    if (btn) { btn.innerHTML = '<i class="fas fa-search"></i> Tìm kiếm'; btn.onclick = runSearch; }
    var q = document.getElementById('searchQuery');
    if (q) q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
  });
})();
