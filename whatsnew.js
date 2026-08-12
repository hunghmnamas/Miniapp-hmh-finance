// ============================================================================
// whatsnew.js — Popup THÔNG BÁO hiển thị khi mở Mini App. Nạp CUỐI CÙNG.
// Phiên bản: Thông báo ngừng duy trì Miniapp Quản lý tài chính (12/12/2026)
// ----------------------------------------------------------------------------
// - Đổi WHATSNEW_VERSION -> popup hiện lại cho TẤT CẢ người dùng.
// - ALLOW_DISMISS = false  -> popup hiện MỌI LẦN mở app (không có checkbox tắt).
// - ALLOW_DISMISS = true   -> có checkbox "không hiện lại nữa".
// ============================================================================
(function () {
  'use strict';

  var WHATSNEW_VERSION = '2026.08.12-shutdown'; // >> Đổi mốc này khi có thông báo mới
  var STORAGE_KEY = 'whatsnewDismissedVersion';

  var ALLOW_DISMISS = false;      // false = luôn hiện mỗi lần mở app
  var SHOW_DELAY_MS = 700;       // độ trễ trước khi hiện popup

  var HTTPS = 'https://';
  var TELEGRAM_USER = 'masterhmh';
  var TELEGRAM_LINK = HTTPS + 't.me/' + TELEGRAM_USER;
  var FACEBOOK_LINK = HTTPS + 'fb.com/masterhmh';

  var TITLE    = 'Thông báo quan trọng';
  var SUBTITLE = 'Ngừng duy trì Miniapp Quản lý tài chính';
  var END_DATE = '12/12/2026';       // ngày dự kiến ngừng hoạt động (hiển thị)
  var END_DATE_ISO = '2026-12-12';   // dùng để đếm ngược

  var BODY = [
    'Cảm ơn bạn đã đồng hành cùng Miniapp trong thời gian qua.',
    'Sắp tới, do yêu cầu nâng cấp hệ thống và giới hạn nguồn lực duy trì server, tác giả xin phép ngừng hoạt động phiên bản này, dự kiến <b>' + END_DATE + '</b>.',
    'Bạn vui lòng <b>sao lưu hoặc trích xuất dữ liệu chi tiêu</b> của mình để tránh thất thoát.',
    'Rất mong bạn thông cảm cho sự bất tiện này. Chân thành cảm ơn!'
  ];

  function daysLeft() {
    try {
      var now = new Date();
      var end = new Date(END_DATE_ISO + 'T00:00:00+07:00');
      var d = Math.ceil((end - now) / 86400000);
      return d > 0 ? d : 0;
    } catch (e) { return null; }
  }

  function alreadyDismissed() {
    if (!ALLOW_DISMISS) return false;
    try { return localStorage.getItem(STORAGE_KEY) === WHATSNEW_VERSION; } catch (e) { return false; }
  }

  function closeModal(overlay) {
    if (ALLOW_DISMISS) {
      var chk = document.getElementById('whatsnewDontShow');
      if (chk && chk.checked) {
        try { localStorage.setItem(STORAGE_KEY, WHATSNEW_VERSION); } catch (e) {}
      }
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
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

    var bodyHtml = BODY.map(function (p) {
      return '<p style="margin:0 0 10px; color:#374151; font-size:0.9rem; line-height:1.6;">' + p + '</p>';
    }).join('');

    var d = daysLeft();
    var countdownHtml = (d === null) ? '' :
      '<div style="margin:14px 0 4px; padding:11px 12px; border-radius:12px; background:#fff7ed; border:1px solid #fed7aa; text-align:center;">' +
        '<div style="font-size:0.78rem; color:#9a3412; letter-spacing:.3px;">DỰ KIẾN NGỪNG HOẠT ĐỘNG</div>' +
        '<div style="font-size:1.05rem; font-weight:800; color:#c2410c; margin-top:2px;">' + END_DATE +
          (d > 0 ? ' &nbsp;·&nbsp; còn ' + d + ' ngày' : ' &nbsp;·&nbsp; đã đến hạn') +
        '</div>' +
      '</div>';

    var contactHtml =
      '<div style="margin-top:16px; padding-top:14px; border-top:1px dashed #e5e7eb;">' +
        '<div style="font-size:0.85rem; font-weight:700; color:#111827; margin-bottom:9px;">Cần hỗ trợ xin liên hệ</div>' +
        '<div style="display:flex; gap:9px;">' +
          '<button id="wnTelegramBtn" style="flex:1; padding:10px 0; border:none; border-radius:10px; background:#e8f2fe; color:#1c64c4; font-size:0.85rem; font-weight:700; cursor:pointer;">' +
            '<i class="fab fa-telegram" style="margin-right:6px;"></i>@' + TELEGRAM_USER +
          '</button>' +
          '<button id="wnFacebookBtn" style="flex:1; padding:10px 0; border:none; border-radius:10px; background:#eef2ff; color:#3b5998; font-size:0.85rem; font-weight:700; cursor:pointer;">' +
            '<i class="fab fa-facebook" style="margin-right:6px;"></i>masterhmh' +
          '</button>' +
        '</div>' +
      '</div>';

    var dismissHtml = ALLOW_DISMISS ?
      '<label style="display:flex; align-items:center; gap:9px; cursor:pointer; margin-bottom:14px; color:#374151; font-size:0.85rem;">' +
        '<input type="checkbox" id="whatsnewDontShow" style="width:18px; height:18px; accent-color:#c2410c; flex-shrink:0;">' +
        '<span>Tôi đã đọc, không hiện lại nữa</span>' +
      '</label>' : '';

    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#ffffff; width:100%; max-width:400px; max-height:85vh; display:flex; flex-direction:column; border-radius:20px; box-shadow:0 24px 70px rgba(0,0,0,0.45); overflow:hidden;';
    dialog.innerHTML =
      '<div style="padding:22px 20px 16px; text-align:center; background:linear-gradient(135deg,#f97316,#dc2626); color:#fff;">' +
        '<div style="font-size:1.9rem; margin-bottom:6px;">⚠️</div>' +
        '<div style="font-size:1.2rem; font-weight:800; color:#fff;">' + TITLE + '</div>' +
        '<div style="font-size:0.84rem; color:rgba(255,255,255,0.95); margin-top:4px; line-height:1.45;">' + SUBTITLE + '</div>' +
      '</div>' +
      '<div style="padding:18px 20px 6px; overflow-y:auto; -webkit-overflow-scrolling:touch; background:#ffffff;">' +
        bodyHtml + countdownHtml + contactHtml +
      '</div>' +
      '<div style="padding:14px 20px 18px; flex-shrink:0; border-top:1px solid #eef0f2; background:#ffffff;">' +
        dismissHtml +
        '<button id="whatsnewCloseBtn" style="width:100%; margin:0; padding:13px 0; border:none; border-radius:12px; background:linear-gradient(135deg,#f97316,#dc2626); color:#fff; font-size:0.95rem; font-weight:700; cursor:pointer;"><i class="fas fa-check" style="margin-right:6px;"></i> Tôi đã hiểu</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    var btn = document.getElementById('whatsnewCloseBtn');
    if (btn) btn.onclick = function () {
      if (typeof triggerHaptic === 'function') { try { triggerHaptic('light'); } catch (e) {} }
      closeModal(overlay);
    };

    var tgBtn = document.getElementById('wnTelegramBtn');
    if (tgBtn) tgBtn.onclick = function () { openExternal(TELEGRAM_LINK, true); };

    var fbBtn = document.getElementById('wnFacebookBtn');
    if (fbBtn) fbBtn.onclick = function () { openExternal(FACEBOOK_LINK, false); };

    // Chạm ra ngoài vùng dialog cũng đóng (vẫn tuân theo checkbox)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(overlay); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (alreadyDismissed()) return;
    setTimeout(buildAndShow, SHOW_DELAY_MS);
  });
})();
