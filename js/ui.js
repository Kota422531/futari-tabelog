// =====================================================================
// ui.js ― トースト・確認ダイアログ・オーバーレイ(履歴連動)・ボトムシート・メニュー
//   02_ui.md §1.2(オーバーレイはルートを持たず、ダミー履歴で戻る操作に対応)/ §7
// =====================================================================
import { h, icon, focusables, clear, add } from './dom.js';

// ---------------------------------------------------------------------
// トースト(後勝ち・3秒、エラー5秒、role=status / alert)
// ---------------------------------------------------------------------
let toastTimer = null;
let persistentToast = null;

export function toast(message, opts = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const type = opts.type || 'info';
  clearTimeout(toastTimer);
  clear(root);
  const el = h('div', {
    class: ['toast', `toast--${type}`],
    role: type === 'error' ? 'alert' : 'status',
  },
  type === 'success' ? icon('check', { size: 18, class: 'toast__icon' }) : null,
  type === 'error' ? icon('alert', { size: 18, class: 'toast__icon' }) : null,
  h('span', { class: 'toast__text', text: message }),
  opts.action ? h('button', {
    type: 'button', class: 'toast__action', text: opts.action.label,
    onClick: () => { opts.action.onClick(); if (!opts.persistent) dismissToast(); },
  }) : null);
  add(root, el);
  requestAnimationFrame(() => el.classList.add('is-shown'));
  if (opts.persistent) {
    persistentToast = { message, opts };
    return;
  }
  toastTimer = setTimeout(() => {
    dismissToast();
    if (persistentToast) toast(persistentToast.message, persistentToast.opts);
  }, opts.duration || (type === 'error' ? 5000 : 3000));
}
export function dismissToast() {
  const root = document.getElementById('toast-root');
  if (root) clear(root);
}

// ---------------------------------------------------------------------
// オーバーレイ管理(history.pushState でダミー履歴を1つ積む)
// ---------------------------------------------------------------------
const stack = [];

window.addEventListener('popstate', () => {
  const top = stack.pop();
  if (top) top.teardown();
});

document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    top.handle.close();
  } else if (e.key === 'Tab') {
    const f = focusables(top.root);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!top.root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
});

export function hasOverlay() {
  return stack.length > 0;
}

/**
 * オーバーレイを開く
 * @param {HTMLElement} root  overlay-root に追加する要素
 * @param {{onClose?:Function, initialFocus?:HTMLElement|(()=>HTMLElement), lockScroll?:boolean}} [o]
 * @returns {{close:()=>void, closeSilently:()=>void, root:HTMLElement, isOpen:()=>boolean}}
 */
export function openOverlay(root, o = {}) {
  const host = document.getElementById('overlay-root');
  const prevFocus = document.activeElement;
  add(host, root);
  document.body.classList.add('has-overlay');
  history.pushState({ overlay: true }, '');
  let open = true;
  const entry = {
    root,
    teardown() {
      if (!open) return;
      open = false;
      root.classList.remove('is-open');
      root.remove();
      if (!stack.length) document.body.classList.remove('has-overlay');
      try { o.onClose && o.onClose(); } catch (e) { console.error(e); }
      if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
      if (entry.after) { const f = entry.after; entry.after = null; setTimeout(f, 0); }
    },
    after: null,
    handle: null,
  };
  entry.handle = {
    root,
    isOpen: () => open,
    /** 閉じる(戻る操作と同じ)。then は閉じ終わった後(popstate 後)に実行 */
    close(then) {
      if (!open) return;
      if (typeof then === 'function') entry.after = then;
      if (stack[stack.length - 1] === entry) history.back();
      else { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); entry.teardown(); }
    },
    /** 履歴を戻さずに閉じる(この直後に location.replace で遷移する場合に使う) */
    closeSilently() {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      entry.teardown();
    },
  };
  stack.push(entry);
  requestAnimationFrame(() => {
    root.classList.add('is-open');
    const f = typeof o.initialFocus === 'function' ? o.initialFocus() : o.initialFocus;
    (f || focusables(root)[0] || root).focus({ preventScroll: true });
  });
  return entry.handle;
}

/** 開いている全オーバーレイを履歴を戻さずに閉じる(ルート遷移の前に呼ぶ) */
export function closeAllOverlaysSilently() {
  while (stack.length) {
    const e = stack.pop();
    e.teardown();
  }
}

// ---------------------------------------------------------------------
// 確認ダイアログ(キャンセル左・実行右、初期フォーカスはキャンセル)
// ---------------------------------------------------------------------
/**
 * @param {{title:string, body?:string|Node, okLabel?:string, cancelLabel?:string, danger?:boolean, content?:Node, onOk?:()=>(boolean|Promise<boolean>)}} o
 * @returns {Promise<boolean>}
 */
export function confirmDialog(o) {
  return new Promise((resolve) => {
    let result = false;
    const titleId = `dlg-title-${Date.now()}`;
    const cancelBtn = h('button', { type: 'button', class: 'btn btn--secondary', text: o.cancelLabel || 'キャンセル' });
    const okBtn = h('button', {
      type: 'button',
      class: ['btn', o.danger ? 'btn--danger' : 'btn--primary'],
    }, o.danger ? icon('trash', { size: 20 }) : null, o.okLabel || 'OK');
    const dialog = h('div', {
      class: 'dialog', role: 'alertdialog', aria: { modal: 'true', labelledby: titleId },
    },
    h('h2', { class: 'dialog__title', id: titleId, text: o.title }),
    o.body ? h('p', { class: 'dialog__body' }, o.body) : null,
    o.content || null,
    h('div', { class: 'dialog__actions' }, cancelBtn, okBtn));
    const root = h('div', { class: 'overlay overlay--dialog' },
      h('div', { class: 'overlay__backdrop', onClick: () => handle.close() }),
      dialog);
    const handle = openOverlay(root, {
      initialFocus: () => (o.content && o.content.querySelector('input')) || cancelBtn,
      onClose: () => resolve(result),
    });
    cancelBtn.addEventListener('click', () => handle.close());
    okBtn.addEventListener('click', async () => {
      if (o.onOk) {
        const ok = await o.onOk();
        if (!ok) return;
      }
      result = true;
      handle.close();
    });
  });
}

// ---------------------------------------------------------------------
// ボトムシート
// ---------------------------------------------------------------------
/**
 * @param {{title:string, content:Node, footer?:Node, onClose?:Function, className?:string, initialFocus?:any}} o
 */
export function openSheet(o) {
  const titleId = `sheet-title-${Date.now()}`;
  const closeBtn = h('button', {
    type: 'button', class: 'icon-btn sheet__close', aria: { label: '閉じる' },
  }, icon('close'));
  const body = h('div', { class: 'sheet__body' }, o.content);
  const sheet = h('div', {
    class: ['sheet', o.className], role: 'dialog', aria: { modal: 'true', labelledby: titleId },
  },
  h('div', { class: 'sheet__grabber', aria: { hidden: 'true' } }),
  h('div', { class: 'sheet__head' },
    h('h2', { class: 'sheet__title', id: titleId, text: o.title }),
    closeBtn),
  body,
  o.footer ? h('div', { class: 'sheet__foot' }, o.footer) : null);
  const root = h('div', { class: 'overlay overlay--sheet' },
    h('div', { class: 'overlay__backdrop', onClick: () => handle.close() }),
    sheet);
  const handle = openOverlay(root, { onClose: o.onClose, initialFocus: o.initialFocus || closeBtn });
  closeBtn.addEventListener('click', () => handle.close());
  enableSwipeDown(sheet, sheet.querySelector('.sheet__grabber'), body, () => handle.close());
  sheet.querySelector('.sheet__head').addEventListener('pointerdown', () => {}, { passive: true });
  handle.body = body;
  handle.sheet = sheet;
  return handle;
}

/** 下スワイプで閉じる(グラバー/ヘッダー、または内容が最上部の時) */
function enableSwipeDown(sheet, grabber, body, onClose) {
  let startY = null, dy = 0;
  const start = (e) => {
    if (e.touches.length !== 1) return;
    const fromHead = grabber.contains(e.target) || sheet.querySelector('.sheet__head').contains(e.target);
    if (!fromHead && body.scrollTop > 0) return;
    startY = e.touches[0].clientY; dy = 0;
  };
  const move = (e) => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (startY === null) return;
    startY = null;
    sheet.style.transform = '';
    if (dy > 90) onClose();
  };
  sheet.addEventListener('touchstart', start, { passive: true });
  sheet.addEventListener('touchmove', move, { passive: true });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

/**
 * アクションメニュー(︙)
 * @param {string} title
 * @param {Array<{label:string, icon?:string, danger?:boolean, onSelect:()=>void}>} items
 */
export function openMenu(title, items) {
  const list = h('ul', { class: 'menu-list', role: 'list' },
    items.map((it) => h('li', {},
      h('button', {
        type: 'button',
        class: ['menu-list__item', it.danger && 'is-danger'],
        onClick: () => handle.close(it.onSelect),
      }, it.icon ? icon(it.icon) : null, h('span', { text: it.label })))));
  const handle = openSheet({ title, content: list, className: 'sheet--menu' });
  return handle;
}

// ---------------------------------------------------------------------
// ボタンの処理中表示
// ---------------------------------------------------------------------
export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    clear(btn);
    add(btn, h('span', { class: 'spinner', aria: { hidden: 'true' } }), h('span', { text: label || '処理中…' }));
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.label !== undefined) {
      clear(btn);
      add(btn, btn.dataset.label);
      delete btn.dataset.label;
    }
  }
}

// ---------------------------------------------------------------------
// クリップボード・共有
// ---------------------------------------------------------------------
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 古い環境向けフォールバック
    const ta = h('textarea', { value: text, attrs: { readonly: true }, style: { position: 'fixed', top: '-1000px', opacity: '0' } });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const canShare = () => typeof navigator.share === 'function';

export async function shareUrl(url, text) {
  try {
    await navigator.share({ title: 'ふたりの食べログ', text, url });
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return true; // 利用者がキャンセル
    return false;
  }
}
