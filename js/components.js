// =====================================================================
// components.js ― 画面共通の UI 部品(ヘッダー・チップ・★・店カード・空状態 など)
// =====================================================================
import { h, icon, catStyle, nextId, safeImageSrc } from './dom.js';
import { CATEGORIES, SCENES, labelOf, categoryOf, averageRating } from './schema.js';
import { CATEGORY_SHORT, formatShortDate, formatDistance, distanceMeters, hasLocation } from './utils.js';

// ---------------------------------------------------------------------
// ヘッダー
// ---------------------------------------------------------------------
/**
 * @param {{title:string, back?:{label:string, onClick:Function}, actions?:Node[], hideTitle?:boolean}} o
 */
export function appHeader(o) {
  const title = h('h1', { class: 'app-header__title', text: o.title, tabindex: '-1' });
  return h('header', { class: 'app-header' },
    h('div', { class: 'app-header__side' },
      o.back ? h('button', {
        type: 'button', class: ['app-header__back', o.back.label === '戻る' && 'has-icon'], onClick: o.back.onClick,
      }, o.back.label === '戻る' ? icon('back', { size: 22 }) : null, o.back.label) : null),
    title,
    h('div', { class: 'app-header__side app-header__side--end' }, o.actions || []));
}

export function iconButton(name, label, onClick, cls) {
  return h('button', { type: 'button', class: ['icon-btn', cls], aria: { label }, onClick }, icon(name));
}

// ---------------------------------------------------------------------
// チップ群
// ---------------------------------------------------------------------
/**
 * 複数選択チップ(aria-pressed)
 * @param {{label?:string, labelId?:string, options:Array<{key:any,label:string}>, value:any[], onChange:(v:any[])=>void, className?:string}} o
 */
export function multiChips(o) {
  const labelId = o.labelId || nextId('chips');
  let value = [...(o.value || [])];
  const buttons = o.options.map((opt) => {
    const b = h('button', {
      type: 'button', class: 'chip', aria: { pressed: String(value.includes(opt.key)) },
      onClick: () => {
        value = value.includes(opt.key) ? value.filter((x) => x !== opt.key) : [...value, opt.key];
        b.setAttribute('aria-pressed', String(value.includes(opt.key)));
        o.onChange(o.options.map((x) => x.key).filter((k) => value.includes(k)));
      },
    }, icon('check', { size: 14, class: 'chip__check', strokeWidth: 2.5 }), h('span', { text: opt.label }));
    return b;
  });
  const el = h('div', { class: ['chips', o.className], role: 'group', aria: { labelledby: labelId } }, buttons);
  el.setValue = (v) => {
    value = [...v];
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(value.includes(o.options[i].key))));
  };
  return el;
}

/**
 * 単一選択チップ(role=radiogroup)。allowDeselect で再タップ解除。
 * @param {{labelId:string, options:Array<{key:any,label:string, emoji?:string, style?:object, ariaLabel?:string}>, value:any, onChange:(v:any)=>void, allowDeselect?:boolean, className?:string, chipClass?:string, mutedKey?:any}} o
 */
export function singleChips(o) {
  let value = o.value;
  const buttons = [];
  const update = () => buttons.forEach((b, i) => {
    const on = o.options[i].key === value;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on || (value === null || value === undefined ? i === 0 : false) ? 0 : -1;
  });
  o.options.forEach((opt, i) => {
    const b = h('button', {
      type: 'button', class: ['chip', o.chipClass, opt.key === o.mutedKey && 'chip--muted'], role: 'radio',
      aria: { checked: 'false', label: opt.ariaLabel || null },
      style: opt.style,
      data: { key: String(opt.key) },
      onClick: () => {
        if (value === opt.key) {
          if (!o.allowDeselect) return;
          value = null;
        } else value = opt.key;
        update();
        o.onChange(value);
      },
      onKeydown: (e) => {
        const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        const n = buttons[(i + dir + buttons.length) % buttons.length];
        n.focus();
      },
    },
    opt.emoji ? h('span', { class: 'chip__emoji', text: opt.emoji, aria: { hidden: 'true' } }) : icon('check', { size: 14, class: 'chip__check', strokeWidth: 2.5 }),
    h('span', { text: opt.label }));
    buttons.push(b);
  });
  const el = h('div', { class: ['chips', o.className], role: 'radiogroup', aria: { labelledby: o.labelId } }, buttons);
  update();
  el.setValue = (v) => { value = v; update(); };
  el.getValue = () => value;
  el.focusFirst = () => buttons[0] && buttons[0].focus();
  return el;
}

/** セグメントコントロール(role=radiogroup) */
export function segmented(o) {
  let value = o.value;
  const buttons = o.options.map((opt, i) => h('button', {
    type: 'button', class: 'segment__item', role: 'radio',
    aria: { checked: String(opt.key === value), label: opt.ariaLabel || null },
    tabindex: opt.key === value || (value == null && i === 0) ? '0' : '-1',
    onClick: () => {
      if (value === opt.key && !o.allowDeselect) return;
      value = value === opt.key ? null : opt.key;
      update();
      o.onChange(value);
    },
    onKeydown: (e) => {
      const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      buttons[(i + dir + buttons.length) % buttons.length].focus();
    },
  }, opt.label));
  function update() {
    buttons.forEach((b, i) => {
      const on = o.options[i].key === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on || (value == null && i === 0) ? 0 : -1;
    });
  }
  const el = h('div', { class: ['segment', o.className], role: 'radiogroup', aria: { labelledby: o.labelId } }, buttons);
  el.setValue = (v) => { value = v; update(); };
  el.focusFirst = () => buttons[0].focus();
  return el;
}

// ---------------------------------------------------------------------
// ★
// ---------------------------------------------------------------------
/** 表示用の★5つ */
export function starsDisplay(n, size = 18) {
  const r = Math.max(0, Math.min(5, Math.round(n || 0)));
  return h('span', { class: 'stars', style: { '--star-size': `${size}px` }, aria: { label: `おすすめ度${r}` }, role: 'img' },
    [1, 2, 3, 4, 5].map((i) => h('span', { class: ['stars__s', i <= r && 'is-on'], text: '★', aria: { hidden: 'true' } })));
}

/**
 * 入力用★(role=radiogroup、解除不可)
 * @param {{labelId:string, value:number|null, words:Object<number,string>, onChange:(n:number)=>void}} o
 */
export function starInput(o) {
  let value = o.value || null;
  const word = h('span', { class: 'star-input__word', aria: { live: 'polite' } });
  const buttons = [1, 2, 3, 4, 5].map((n) => h('button', {
    type: 'button', class: 'star-input__btn', role: 'radio',
    aria: { label: `おすすめ度${n}`, checked: 'false' },
    onClick: () => { value = n; update(); o.onChange(n); },
    onKeydown: (e) => {
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const nv = Math.max(1, Math.min(5, (value || 0) + dir));
      value = nv; update(); o.onChange(nv); buttons[nv - 1].focus();
    },
  }, h('span', { text: '★', aria: { hidden: 'true' } })));
  function update() {
    buttons.forEach((b, i) => {
      const n = i + 1;
      b.classList.toggle('is-on', value !== null && n <= value);
      b.setAttribute('aria-checked', String(n === value));
      b.tabIndex = (value === null ? n === 1 : n === value) ? 0 : -1;
    });
    word.textContent = value ? `${value} ${o.words[value]}` : 'タップして評価';
    word.classList.toggle('is-empty', !value);
  }
  const el = h('div', { class: 'star-input' },
    h('div', { class: 'star-input__stars', role: 'radiogroup', aria: { labelledby: o.labelId } }, buttons),
    word);
  update();
  el.setValue = (v) => { value = v; update(); };
  el.focusFirst = () => buttons[(value || 1) - 1].focus();
  return el;
}

// ---------------------------------------------------------------------
// カテゴリ
// ---------------------------------------------------------------------
export function categoryBadge(key, opts = {}) {
  const c = categoryOf(key);
  return h('span', { class: 'cat-badge', style: catStyle(c.key) },
    h('span', { class: 'cat-badge__emoji', text: c.emoji, aria: { hidden: 'true' } }),
    h('span', { text: opts.full ? c.label : CATEGORY_SHORT[c.key] }));
}

/** 一覧・地図共通のカテゴリチップ横スクロール(すべて+9種) */
export function categoryTabs(value, onChange) {
  const options = [{ key: 'all', label: 'すべて' }, ...CATEGORIES.map((c) => ({
    key: c.key, label: CATEGORY_SHORT[c.key], emoji: c.emoji, style: catStyle(c.key), ariaLabel: c.label,
  }))];
  const labelId = nextId('cat');
  const el = h('div', { class: 'cat-tabs' },
    h('span', { id: labelId, class: 'visually-hidden', text: 'カテゴリ' }),
    singleChips({
      labelId, options, value, className: 'cat-tabs__row', chipClass: 'chip--cat',
      onChange: (v) => { onChange(v || 'all'); scrollIntoViewSelected(); },
    }));
  function scrollIntoViewSelected() {
    const sel = el.querySelector('[aria-checked="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
  el.setValue = (v) => { el.querySelector('.chips').setValue(v); };
  requestAnimationFrame(() => {
    const sel = el.querySelector('[aria-checked="true"]');
    if (sel && sel.dataset.key !== 'all') sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  return el;
}

// ---------------------------------------------------------------------
// 店カード(一覧)
// ---------------------------------------------------------------------
export function shopThumb(shop, cls = 'shop-thumb') {
  const c = categoryOf(shop.category);
  const src = safeImageSrc(shop.thumb);
  if (src) {
    return h('img', { class: cls, src, alt: '', attrs: { loading: 'lazy', decoding: 'async' }, style: catStyle(c.key) });
  }
  return h('span', { class: [cls, `${cls}--empty`], style: catStyle(c.key), aria: { hidden: 'true' } },
    h('span', { text: c.emoji }));
}

/**
 * @param {object} shop
 * @param {{origin?:{lat:number,lng:number}|null, showDistance?:boolean, isNew?:boolean}} [o]
 */
export function shopCard(shop, o = {}) {
  const c = categoryOf(shop.category);
  const avg = averageRating(shop);
  const scenes = SCENES.filter((s) => (shop.sceneSet || []).includes(s.key));
  const sub = [CATEGORY_SHORT[c.key], shop.genre, shop.area].filter(Boolean);

  let distance = null;
  if (o.showDistance) {
    distance = o.origin && hasLocation(shop)
      ? formatDistance(distanceMeters(o.origin.lat, o.origin.lng, shop.lat, shop.lng))
      : '位置未設定';
  }

  const aName = [shop.name, c.label, avg !== null ? `おすすめ度${avg.toFixed(1)}` : '未評価',
    shop.visitCount ? `訪問${shop.visitCount}回` : null, o.isNew ? '新着' : null].filter(Boolean).join('、');

  return h('a', { class: 'shop-card', href: `#/shop/${encodeURIComponent(shop.id)}`, style: catStyle(c.key), aria: { label: aName } },
    shopThumb(shop),
    h('div', { class: 'shop-card__body' },
      h('div', { class: 'shop-card__head' },
        h('span', { class: 'shop-card__name', text: shop.name }),
        o.isNew ? h('span', { class: 'badge-new', text: '新着' }) : null),
      h('div', { class: 'shop-card__sub' },
        h('span', { class: 'shop-card__emoji', text: c.emoji, aria: { hidden: 'true' } }),
        h('span', { class: 'ellipsis', text: sub.join('・') })),
      h('div', { class: 'shop-card__meta' },
        avg !== null
          ? h('span', { class: 'meta-rating' },
            h('span', { class: 'meta-rating__star', text: '★', aria: { hidden: 'true' } }),
            h('span', { class: 'num', text: avg.toFixed(1) }),
            h('span', { class: 'meta-rating__count num', text: `(${shop.ratingCount})` }))
          : h('span', { class: 'meta-unrated', text: '未評価' }),
        shop.visitCount ? h('span', { class: 'num', text: `訪問${shop.visitCount}回` }) : null,
        shop.visitCount && shop.lastVisitedOn ? h('span', { class: 'num', text: `最終 ${formatShortDate(shop.lastVisitedOn, { weekday: false })}` }) : null,
        distance ? h('span', { class: 'shop-card__dist num', text: distance }) : null),
      scenes.length ? h('div', { class: 'shop-card__tags' },
        scenes.slice(0, 3).map((s) => h('span', { class: 'tag', text: s.label })),
        scenes.length > 3 ? h('span', { class: 'tag tag--more', text: `+${scenes.length - 3}` }) : null) : null));
}

export function skeletonCards(n = 5) {
  return h('div', { class: 'skeleton-list', aria: { hidden: 'true' } },
    Array.from({ length: n }, () => h('div', { class: 'shop-card shop-card--skeleton' },
      h('span', { class: 'shop-thumb skeleton' }),
      h('div', { class: 'shop-card__body' },
        h('span', { class: 'skeleton skeleton--line', style: { width: '60%' } }),
        h('span', { class: 'skeleton skeleton--line', style: { width: '80%' } }),
        h('span', { class: 'skeleton skeleton--line', style: { width: '45%' } })))));
}

/** 空状態 */
export function emptyState({ emoji = '📒', title, text, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty__emoji', text: emoji, aria: { hidden: 'true' } }),
    h('p', { class: 'empty__title', text: title }),
    text ? h('p', { class: 'empty__text', text }) : null,
    action || null);
}

/** 適用中条件バー */
export function conditionBar(items, onRemove, onClearAll, trailing) {
  if (!items.length && !trailing) return null;
  return h('div', { class: 'cond-bar' },
    h('div', { class: 'cond-bar__scroll' },
      items.map((it) => h('button', {
        type: 'button', class: 'cond-chip', aria: { label: `${it.label}の条件を解除` },
        onClick: () => onRemove(it.group, it.value),
      }, h('span', { text: it.label }), icon('close', { size: 14, strokeWidth: 2.25 }))),
      items.length ? h('button', { type: 'button', class: 'cond-bar__clear', text: 'すべてクリア', onClick: onClearAll }) : null),
    trailing || null);
}

/** 必須バッジ付きラベル */
export function fieldLabel(text, { required = false, forId, id } = {}) {
  return h(forId ? 'label' : 'span', { class: 'field__label', for: forId || undefined, id },
    text, required ? h('span', { class: 'badge-required', text: '必須' }) : null);
}

export function fieldError(id) {
  return h('p', { class: 'field__error', id, hidden: true, role: 'alert' });
}

/** カテゴリ表示名 */
export const categoryLabel = (key) => labelOf(CATEGORIES, key);
