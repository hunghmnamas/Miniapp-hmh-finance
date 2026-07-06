// ============================================================================
// whatsnew.js — Popup "Có gì mới" hiển thị khi mở Mini App. Nap CUOI CUNG.
// ----------------------------------------------------------------------------
// - Hiển thị danh sách cập nhật gần đây mỗi khi vào app.
// - Có checkbox "Không hiển thị thông báo này lần sau": nếu TICK rồi ĐÓNG
//   -> lưu phiên bản đã xem vào localStorage, các lần sau KHÔNG hiện nữa.
//   Nếu KHÔNG tick -> lần vào app sau vẫn hiện lại.
// - Khi có bản cập nhật mới: chỉ cần đổi WHATSNEW_VERSION -> popup hiện lại cho mọi người.
// ============================================================================
(function () {
  'use strict';

  var WHATSNEW_VERSION = '2026.07.06'; // >> Đổi mốc này khi muốn popup hiện lại cho lần cập nhật mới
  var STORAGE_KEY = 'whatsnewDismissedVersion';

  var UPDATES = [
    { icon: '🎨', title: 'Giao diện mới', desc: 'Nâng cấp thanh điều hướng, nút thao tác nhanh và tổng thể trải nghiệm.' },
    { icon: '🔍', title: 'Tìm kiếm thông minh', desc: 'Gộp về một ô duy nhất: tìm theo nội dung/ghi chú hoặc số tiền (hỗ trợ 50k, 1tr5, 2m...).' },
    { icon: '💰', title: 'Định dạng tiền gọn hơn', desc: 'Tùy chọn hiển thị chỉ còn Đầy đủ / Rút gọn trong Cài đặt.' },
    { icon: '📊', title: 'Kiểu biểu đồ', desc: 'Chọn biểu đồ Cột hoặc Đường trong Cài đặt, áp dụng cho báo cáo.' },
    { icon: '🌙', title: 'Lịch âm', desc: 'Hiển thị ngày âm lịch ngay trong lịch thu chi.' },
    { icon: '📄', title: 'Trạng thái rõ ràng', desc: 'Thông báo rõ khi tab báo cáo chưa có dữ liệu.' }
  ];

  function alreadyDismissed() {
    try { return localStorage.getItem(STORAGE_KEY) === WHATSNEW_VERSION; } catch (e) { return false; }
  }

  function closeModal(overlay) {
    var chk = document.getElementById('whatsnewDontShow');
    if (chk && chk.checked) {
      try { localStorage.setItem(STORAGE_KEY, WHATSNEW_VERSION); } catch (e) {}
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function buildAndShow() {
    if (document.getElementById('whatsnewOverlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'whatsnewOverlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; padding:20px; -webkit-backdrop-filter:blur(3px); backdrop-filter:blur(3px);';

    var itemsHtml = UPDATES.map(function (u) {
      return '<div style="display:flex; gap:12px; align-items:flex-start; padding:10px 0; border-bottom:1px solid var(--border-color);">' +
               '<div style="font-size:1.35rem; line-height:1.4; flex-shrink:0;">' + u.icon + '</div>' +
               '<div style="flex:1;">' +
                 '<div style="font-weight:700; color:var(--text-1); font-size:0.95rem; margin-bottom:2px;">' + u.title + '</div>' +
                 '<div style="color:var(--text-2); font-size:0.83rem; line-height:1.45;">' + u.desc + '</div>' +
               '</div>' +
             '</div>';
    }).join('');

    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-card); width:100%; max-width:420px; max-height:85vh; display:flex; flex-direction:column; border-radius:20px; box-shadow:0 20px 60px rgba(0,0,0,0.35); overflow:hidden;';
    dialog.innerHTML =
      '<div style="padding:22px 20px 14px; text-align:center; background:linear-gradient(135deg, var(--primary), var(--primary-light, var(--primary))); color:#fff;">' +
        '<div style="font-size:1.9rem; margin-bottom:6px;">🎉</div>' +
        '<div style="font-size:1.18rem; font-weight:800;">Có gì mới</div>' +
        '<div style="font-size:0.8rem; opacity:0.92; margin-top:3px;">Cảm ơn bạn đã dùng app! Đây là các cập nhật gần đây.</div>' +
      '</div>' +
      '<div style="padding:4px 20px; overflow-y:auto; -webkit-overflow-scrolling:touch;">' + itemsHtml + '</div>' +
      '<div style="padding:12px 20px 18px; flex-shrink:0; border-top:1px solid var(--border-color);">' +
        '<label style="display:flex; align-items:center; gap:9px; cursor:pointer; margin-bottom:14px; color:var(--text-2); font-size:0.85rem;">' +
          '<input type="checkbox" id="whatsnewDontShow" style="width:18px; height:18px; accent-color:var(--primary); flex-shrink:0;">' +
          '<span>Không hiển thị thông báo này lần sau</span>' +
        '</label>' +
        '<button id="whatsnewCloseBtn" class="btn-save" style="width:100%; margin:0;"><i class="fas fa-check"></i> Đã hiểu</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    var btn = document.getElementById('whatsnewCloseBtn');
    if (btn) btn.onclick = function () {
      if (typeof triggerHaptic === 'function') { try { triggerHaptic('light'); } catch (e) {} }
      closeModal(overlay);
    };
    // Cham ra ngoai vung dialog cung dong (van tuan theo checkbox)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(overlay); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (alreadyDismissed()) return;
    // Cho app on dinh mot chut roi moi hien popup
    setTimeout(buildAndShow, 700);
  });
})();
