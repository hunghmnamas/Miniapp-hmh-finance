// ============================================================================
// whatsnew.js — Popup thông báo khi mở Mini App. Nạp CUỐI CÙNG trong index.html
// ----------------------------------------------------------------------------
// MUỐN ĐỔI POPUP: chỉ sửa khối POPUP bên dưới, KHÔNG cần đụng file nào khác.
//   1. Đổi  version   -> popup hiện lại cho TẤT CẢ mọi người (bắt buộc đổi).
//   2. Sửa  title / subtitle / body / items / deadline / contacts.
//   3. dismissible: true  -> có checkbox "không hiển thị lần sau".
//      dismissible: false -> KHÔNG cho tắt, hiện mọi lần mở app.
//   4. enabled: false     -> tắt hẳn popup.
// ============================================================================
(function () {
  'use strict';

  var HTTPS = 'https://';

  // ==========================================================================
  // ============================ KHỐI CẤU HÌNH ===============================
  // ==========================================================================
  var POPUP = {
    enabled: true,

    // >>> ĐỔI MỖI KHI CÓ THÔNG BÁO MỚI (bắt buộc) <<<
    version: '2026.08.12-shutdown',

    // false = KHÔNG cho người dùng tắt, hiện mọi lần mở app
    dismissible: false,

    style: 'warning',        // 'warning' (cam/đỏ) hoặc 'info' (xanh)
    icon: '⚠️',
    title: 'Thông báo quan trọng',
    subtitle: 'Ngừng duy trì Miniapp Quản lý tài chính',

    // Các đoạn văn. Cho phép thẻ HTML đơn giản: <b> <i> <br>
    body: [
      'Cảm ơn bạn đã đồng hành cùng Miniapp trong thời gian qua.',
      'Sắp tới, do yêu cầu nâng cấp hệ thống và giới hạn nguồn lực duy trì server, tác giả xin phép ngừng hoạt động phiên bản này, dự kiến <b>12/12/2026</b>.',
      'Bạn vui lòng <b>sao lưu hoặc trích xuất dữ liệu chi tiêu</b> của mình để tránh thất thoát.',
      'Rất mong bạn thông cảm cho sự bất tiện này. Chân thành cảm ơn!'
    ],

    // Danh sách gạch đầu dòng kiểu "Có gì mới". Để [] nếu không dùng.
    items: [],

    // Ô đếm ngược. Đặt null nếu không dùng.
    deadline: { label: 'DỰ KIẾN NGỪNG HOẠT ĐỘNG', date: '2026-12-12', display: '12/12/2026' },

    // Nút liên hệ. Đặt null từng cái nếu không dùng.
    contacts: { telegram: 'masterhmh', facebook: 'masterhmh' },

    buttonText: 'Tôi đã hiểu',
    dismissText: 'Tôi đã đọc, không hiện lại nữa',
    delayMs: 700              // độ trễ trước khi hiện popup
  };
  // ==========================================================================
  // ========================= HẾT KHỐI CẤU HÌNH ==============================
  // ==========================================================================

  var THEMES = {
    warning: { grad: 'linear-gradient(135deg,#f97316,#dc2626)', soft: '#fff7ed', line: '#fed7aa', dim: '#9a3412', strong: '#c2410c', accent: '#c2410c' },
    info:    { grad: 'linear-gradient(135deg,#2b8ef0,#1c64c4)', soft: '#eff6ff', line: '#bfdbfe', dim: '#1e40af', strong: '#1c64c4', accent: '#1c64c4' }
  };
  var T = THEMES[POPUP.style] || THEMES.info;

  // Khóa lưu RIÊNG cho từng version -> tick popup cũ không ảnh hưởng popup mới
  var STORAGE_KEY = 'whatsnewDismissed:' + POPUP.version;

  function alreadyDismissed() {
    if (!POPUP.dismissible) return false;   // popup bắt buộc: luôn hiện
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  function closeModal(overlay) {
    if (POPUP.dismissible) {
      var chk = document.getElementById('whatsnewDontShow');
      if (chk && chk.checked) {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      }
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function daysLeft(iso) {
    try {
      var end = new Date(iso + 'T00:00:00+07:00');
      var d = Math.ceil((end - new Date()) / 86400000);
      return d > 0 ? d : 0;
    } catch (e) { return null; }
  }

  function openExternal(url, isTelegram) {
    try {
      var tg = window.Telegram && window.Telegram.WebApp;
      if (tg && isTelegram && typeof tg.openTelegramLink === 'function') { tg.openTelegramLink(url); return; }
      if (tg && typeof tg.openLink === 'function') { tg.openLink(url); return; }
    } catch (e) {}
    window.open(url, '_blank');
  }

  function buildAndShow() {
    if (document.getElementById('whatsnewOverlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'whatsnewOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; padding:20px;';

    // --- Các đoạn văn ---
    var bodyHtml = BODY.map(function (p) {
  return '<p style="margin:0 0 10px; color:#374151; font-size:0.9rem; line-height:1.6; text-align:justify; text-justify:inter-word;">' + p + '</p>';
  }).join('');

    // --- Danh sách gạch đầu dòng ---
    var items = POPUP.items || [];
    var itemsHtml = items.map(function (u, i) {
      var border = (i === items.length - 1) ? '' : 'border-bottom:1px solid #eef0f2;';
      return '<div style="display:flex; gap:12px; align-items:flex-start; padding:11px 0; ' + border + '">' +
               '<div style="font-size:1.35rem; line-height:1.35; flex-shrink:0;">' + (u.icon || '•') + '</div>' +
               '<div style="flex:1;">' +
                 '<div style="font-weight:700; color:#111827; font-size:0.95rem; margin-bottom:3px;">' + u.title + '</div>' +
                 '<div style="color:#4b5563; font-size:0.84rem; line-height:1.5;">' + u.desc + '</div>' +
               '</div>' +
             '</div>';
    }).join('');

    // --- Ô đếm ngược ---
    var cdHtml = '';
    if (POPUP.deadline && POPUP.deadline.date) {
      var d = daysLeft(POPUP.deadline.date);
      cdHtml = '<div style="margin:14px 0 4px; padding:11px 12px; border-radius:12px; background:' + T.soft + '; border:1px solid ' + T.line + '; text-align:center;">' +
                 '<div style="font-size:0.78rem; color:' + T.dim + '; letter-spacing:.3px;">' + (POPUP.deadline.label || '') + '</div>' +
                 '<div style="font-size:1.05rem; font-weight:800; color:' + T.strong + '; margin-top:2px;">' +
                   (POPUP.deadline.display || POPUP.deadline.date) +
                   (d === null ? '' : (d > 0 ? ' &nbsp;·&nbsp; còn ' + d + ' ngày' : ' &nbsp;·&nbsp; đã đến hạn')) +
                 '</div>' +
               '</div>';
    }

    // --- Nút liên hệ ---
    var c = POPUP.contacts || {};
    var contactBtns = '';
    if (c.telegram) {
      contactBtns += '<button id="wnTelegramBtn" style="flex:1; padding:10px 0; border:none; border-radius:10px; background:#e8f2fe; color:#1c64c4; font-size:0.85rem; font-weight:700; cursor:pointer;">' +
                       '<i class="fab fa-telegram" style="margin-right:6px;"></i>@' + c.telegram + '</button>';
    }
    if (c.facebook) {
      contactBtns += '<button id="wnFacebookBtn" style="flex:1; padding:10px 0; border:none; border-radius:10px; background:#eef2ff; color:#3b5998; font-size:0.85rem; font-weight:700; cursor:pointer;">' +
                       '<i class="fab fa-facebook" style="margin-right:6px;"></i>' + c.facebook + '</button>';
    }
    var contactHtml = contactBtns ?
      '<div style="margin-top:16px; padding-top:14px; border-top:1px dashed #e5e7eb;">' +
        '<div style="font-size:0.85rem; font-weight:700; color:#111827; margin-bottom:9px;">Cần hỗ trợ xin liên hệ</div>' +
        '<div style="display:flex; gap:9px;">' + contactBtns + '</div>' +
      '</div>' : '';

    // --- Checkbox (chỉ khi dismissible) ---
    var dismissHtml = POPUP.dismissible ?
      '<label style="display:flex; align-items:center; gap:9px; cursor:pointer; margin-bottom:14px; color:#374151; font-size:0.85rem;">' +
        '<input type="checkbox" id="whatsnewDontShow" style="width:18px; height:18px; accent-color:' + T.accent + '; flex-shrink:0;">' +
        '<span>' + POPUP.dismissText + '</span>' +
      '</label>' : '';

    var subtitleHtml = POPUP.subtitle ?
      '<div style="font-size:0.84rem; color:rgba(255,255,255,0.95); margin-top:4px; line-height:1.45;">' + POPUP.subtitle + '</div>' : '';

    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#ffffff; width:100%; max-width:400px; max-height:85vh; display:flex; flex-direction:column; border-radius:20px; box-shadow:0 24px 70px rgba(0,0,0,0.45); overflow:hidden;';
    dialog.innerHTML =
      '<div style="padding:22px 20px 16px; text-align:center; background:' + T.grad + '; color:#fff;">' +
        '<div style="font-size:1.9rem; margin-bottom:6px;">' + (POPUP.icon || '🔔') + '</div>' +
        '<div style="font-size:1.2rem; font-weight:800; color:#fff;">' + POPUP.title + '</div>' +
        subtitleHtml +
      '</div>' +
      '<div style="padding:18px 20px 6px; overflow-y:auto; -webkit-overflow-scrolling:touch; background:#ffffff;">' +
        bodyHtml + itemsHtml + cdHtml + contactHtml +
      '</div>' +
      '<div style="padding:14px 20px 18px; flex-shrink:0; border-top:1px solid #eef0f2; background:#ffffff;">' +
        dismissHtml +
        '<button id="whatsnewCloseBtn" style="width:100%; margin:0; padding:13px 0; border:none; border-radius:12px; background:' + T.grad + '; color:#fff; font-size:0.95rem; font-weight:700; cursor:pointer;">' +
          '<i class="fas fa-check" style="margin-right:6px;"></i> ' + POPUP.buttonText +
        '</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    var btn = document.getElementById('whatsnewCloseBtn');
    if (btn) btn.onclick = function () {
      if (typeof triggerHaptic === 'function') { try { triggerHaptic('light'); } catch (e) {} }
      closeModal(overlay);
    };

    var tgBtn = document.getElementById('wnTelegramBtn');
    if (tgBtn) tgBtn.onclick = function () { openExternal(HTTPS + 't.me/' + c.telegram, true); };

    var fbBtn = document.getElementById('wnFacebookBtn');
    if (fbBtn) fbBtn.onclick = function () { openExternal(HTTPS + 'fb.com/' + c.facebook, false); };

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(overlay); });
  }

  function start() {
    if (!POPUP.enabled) return;
    if (alreadyDismissed()) return;
    setTimeout(buildAndShow, POPUP.delayMs || 0);
  }

  // Chạy được cả khi script nạp sau lúc DOM đã sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
