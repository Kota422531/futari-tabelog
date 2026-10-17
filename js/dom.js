// =====================================================================
// dom.js ― 安全な要素生成ヘルパーと線画アイコン
//   ユーザー入力は必ず textContent / 属性として挿入する(innerHTML 禁止)。
//   innerHTML を使うのはこのファイルの固定アイコン定義のみ。
// =====================================================================

/**
 * 要素を生成する。
 *   h('button', { class: 'btn', type: 'button', onClick: fn, aria: { label: '閉じる' } }, '子', node)
 * props:
 *   class / className: string | string[]
 *   text: textContent
 *   attrs: {name: value}(false/null は付けない)
 *   aria: {label: '…'} → aria-label
 *   data: {key: value} → data-key
 *   style: {prop: value}(--var も可)
 *   on<Event>: リスナー
 *   その他: プロパティとして代入(value, checked, disabled, hidden, id, type, href, src, htmlFor など)
 */
export function h(tag, props = {}, ...children) {
  const el = tag.includes(':')
    ? document.createElementNS('http://www.w3.org/2000/svg', tag.split(':')[1])
    : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class' || k === 'className') {
      const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      if (cls) el.setAttribute('class', cls);
    } else if (k === 'text') {
      el.textContent = String(v);
    } else if (k === 'attrs') {
      for (const [a, av] of Object.entries(v)) {
        if (av === false || av === null || av === undefined) continue;
        el.setAttribute(a, av === true ? '' : String(av));
      }
    } else if (k === 'aria') {
      for (const [a, av] of Object.entries(v)) {
        if (av === null || av === undefined) continue;
        el.setAttribute(`aria-${a}`, String(av));
      }
    } else if (k === 'data') {
      for (const [a, av] of Object.entries(v)) el.dataset[a] = String(av);
    } else if (k === 'style') {
      for (const [a, av] of Object.entries(v)) {
        if (a.startsWith('--')) el.style.setProperty(a, av);
        else el.style[a] = av;
      }
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'role' || k === 'tabindex' || k === 'for' || k === 'title' || k === 'name' || k === 'placeholder') {
      el.setAttribute(k === 'for' ? 'for' : k, String(v));
    } else if (k === 'href') {
      el.setAttribute('href', String(v));
    } else {
      el[k] = v;
    }
  }
  append(el, children);
  return el;
}

/** 子要素を追加(文字列はテキストノード、配列は展開、null/false はスキップ) */
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** null/false を無視して子を追加する(ネイティブ append は null を "null" と描画するため) */
export function add(el, ...children) {
  return append(el, children);
}

export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** カテゴリ色の CSS 変数(--cat / --cat-soft / --cat-ink)を流し込む style オブジェクト */
export function catStyle(key) {
  const k = /^[a-z]+$/.test(key || '') ? key : 'other';
  return { '--cat': `var(--cat-${k})`, '--cat-soft': `var(--cat-${k}-soft)`, '--cat-ink': `var(--cat-${k}-ink)` };
}

// ---------------------------------------------------------------------
// 線画アイコン(24px グリッド・stroke 1.75・currentColor)固定定義
// ---------------------------------------------------------------------
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  list: '<path class="fillable" d="M5 4.5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1v-13a1 1 0 011-1z"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
  map: '<path class="fillable" d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  settings: '<path class="fillable" d="M12 3.5l2 .4.6 2.2 1.9 1.1 2.2-.6 1.4 1.6-.9 2.1v2.2l.9 2.1-1.4 1.6-2.2-.6-1.9 1.1-.6 2.2-2 .4-2-.4-.6-2.2-1.9-1.1-2.2.6-1.4-1.6.9-2.1v-2.2l-.9-2.1 1.4-1.6 2.2.6 1.9-1.1.6-2.2z"/><circle cx="12" cy="12" r="2.8"/>',
  locate: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M6 11.5H5a1 1 0 00-1 1V20a1 1 0 001 1h14a1 1 0 001-1v-7.5a1 1 0 00-1-1h-1"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h2.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  edit: '<path d="M4.5 19.5l1-4.5L15.8 4.7a1.8 1.8 0 012.5 0l1 1a1.8 1.8 0 010 2.5L9 18.5z"/><path d="M13.5 7l3.5 3.5"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13"/><path d="M17 14v4.5a1 1 0 01-1 1H5.5a1 1 0 01-1-1V8a1 1 0 011-1H10"/>',
  route: '<path d="M12 3l8 18-8-4.2L4 21z"/>',
  camera: '<path d="M4 8.5a1.5 1.5 0 011.5-1.5H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0121 18.5"/>',
};

/**
 * 線画 SVG アイコン(装飾扱い aria-hidden)。name は固定キーのみ。
 * @param {keyof ICONS} name
 * @param {{size?:number, class?:string}} [o]
 */
export function icon(name, o = {}) {
  const size = o.size || 24;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', o.strokeWidth ? String(o.strokeWidth) : '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon${o.class ? ` ${o.class}` : ''}`);
  svg.innerHTML = ICONS[name] || ''; // 固定テンプレートのみ
  return svg;
}

/** 一意な DOM id */
let uid = 0;
export function nextId(prefix = 'id') {
  uid += 1;
  return `${prefix}-${uid}`;
}

/** フォーカス可能な要素 */
export function focusables(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** data:image/jpeg のみ画像 src として許可 */
export function safeImageSrc(s) {
  return typeof s === 'string' && s.startsWith('data:image/jpeg;base64,') ? s : '';
}
