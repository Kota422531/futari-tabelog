// =====================================================================
// forms.js ― 入力フォームの部品:「■ お店」セクション(S-06)と「■ 今回の訪問」セクション(S-08)
//   検証文言は docs/02_ui.md §3.3、部品は §3.1、写真枠は §3.2
// =====================================================================
import { h, icon, clear, nextId, catStyle, safeImageSrc, add } from '../dom.js';
import { fieldLabel, singleChips, multiChips, segmented, starInput } from '../components.js';
import {
  CATEGORIES, TIMINGS, BUDGETS, SCENES, MOOD_TAGS, RESERVATION, PRIVATE_ROOM, SMOKING, PARKING,
  CASHLESS, KIDS_OK, LIMITS, DEFAULT_SHOP_ENUMS, todayStr,
} from '../schema.js';
import {
  CATEGORY_SHORT, TIMING_SHORT, RATING_WORDS, NOISE_WORDS, timingForTime, isHttpUrl, parseIntLoose,
  formatDistance, parseYmd,
} from '../utils.js';
import { findDuplicates } from '../filter.js';
import { state } from '../state.js';
import { toast, confirmDialog, setBusy } from '../ui.js';
import {
  getCurrentPosition, geoErrorMessage, reverseGeocode, loadLeaflet, addOsmLayer,
} from '../geo.js';
import { processImage } from '../images.js';
import { openLocationPicker } from './location-picker.js';
import { openPhotoViewer } from './photo-viewer.js';

// ---------------------------------------------------------------------
// 汎用:フィールド枠・エラー表示・折りたたみ・文字数カウンタ
// ---------------------------------------------------------------------
function makeField({ label, required, control, forId, labelId, help, counter, className }) {
  const errId = nextId('err');
  const err = h('p', { class: 'field__error', id: errId, hidden: true },
    icon('alert', { size: 16 }), h('span', { class: 'field__error-text' }));
  const wrap = h('div', { class: ['field', className] },
    forId ? fieldLabel(label, { required, forId }) : fieldLabel(label, { required, id: labelId }),
    control,
    help ? h('p', { class: 'field__help', text: help }) : null,
    counter || null,
    err);
  wrap.setError = (msg, target) => {
    err.hidden = !msg;
    err.querySelector('.field__error-text').textContent = msg || '';
    const t = target || wrap.querySelector('input, textarea') || null;
    wrap.classList.toggle('has-error', !!msg);
    if (t) {
      if (msg) { t.setAttribute('aria-invalid', 'true'); t.setAttribute('aria-describedby', errId); }
      else { t.removeAttribute('aria-invalid'); t.removeAttribute('aria-describedby'); }
    }
  };
  return wrap;
}

function counterFor(input, max, showFrom = 0) {
  const c = h('p', { class: 'field__counter num', aria: { hidden: 'true' } });
  const update = () => {
    const n = input.value.length;
    c.textContent = `${n}/${max}`;
    c.hidden = n < showFrom;
    c.classList.toggle('is-over', n > max);
  };
  input.addEventListener('input', update);
  update();
  return c;
}

/** テキストエリアの自動伸長 */
function autoGrow(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight, 0) + 2}px`; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

function collapsible(title, content, open = false) {
  const id = nextId('col');
  const body = h('div', { class: 'collapse__body', id, hidden: !open }, content);
  const btn = h('button', {
    type: 'button', class: 'collapse__toggle', aria: { expanded: String(open), controls: id },
    onClick: () => set(btn.getAttribute('aria-expanded') !== 'true'),
  }, icon('chevronDown', { size: 20, class: 'collapse__chev' }), h('span', { text: title }));
  function set(v) {
    btn.setAttribute('aria-expanded', String(v));
    body.hidden = !v;
  }
  const el = h('div', { class: 'collapse' }, btn, body);
  el.open = () => set(true);
  return el;
}

function textInput(o) {
  return h('input', {
    id: o.id, class: 'input', type: o.type || 'text', value: o.value || '', placeholder: o.placeholder,
    attrs: { maxlength: o.max ? String(o.max) : null, autocomplete: 'off', inputmode: o.inputmode || null, enterkeyhint: o.enterkeyhint || null },
  });
}
function textArea(o) {
  return autoGrow(h('textarea', {
    id: o.id, class: 'input textarea', value: o.value || '', rows: o.rows || 3, placeholder: o.placeholder,
    attrs: { maxlength: String(o.max) },
  }));
}

/** 必須でない文字列の長さ検証 */
function lenError(v, max, msg) {
  return v.length > max ? msg : '';
}

// =====================================================================
// 「■ お店」セクション
// =====================================================================
export function defaultShopRaw() {
  return {
    name: '', category: null, genre: '', address: '', lat: null, lng: null, accuracy: null, area: '', url: '',
    ...DEFAULT_SHOP_ENUMS, note: '', autoAddress: null,
  };
}
export function shopRawFrom(shop) {
  const r = defaultShopRaw();
  for (const k of Object.keys(r)) if (shop[k] !== undefined && shop[k] !== null) r[k] = shop[k];
  r.lat = typeof shop.lat === 'number' ? shop.lat : null;
  r.lng = typeof shop.lng === 'number' ? shop.lng : null;
  r.accuracy = null;
  r.autoAddress = null;
  return r;
}

/**
 * @param {object} initial 初期値(defaultShopRaw 形式)
 * @param {{mode:'new'|'edit', excludeId?:string, onCarry?:(shopId:string)=>void, onChange?:Function, focus?:string}} o
 */
export function shopSection(initial, o) {
  const v = { ...defaultShopRaw(), ...initial };
  const initialName = v.name, initialLat = v.lat, initialLng = v.lng;
  const fields = {};
  const changed = () => o.onChange && o.onChange();

  // ---------------- 位置 ----------------
  const locBox = h('div', { class: 'loc' });
  const locField = makeField({ label: '場所', labelId: nextId('lbl'), control: locBox });
  fields.location = locField;
  let preview = null, previewMarker = null, previewEl = null;
  let locating = false;
  let revSeq = 0;

  const nameId = nextId('name');
  const nameInput = textInput({ id: nameId, value: v.name, max: LIMITS.SHOP_NAME_MAX, enterkeyhint: 'next' });
  const addrId = nextId('addr');
  const addrInput = textInput({ id: addrId, value: v.address, max: LIMITS.ADDRESS_MAX });
  const addrSuggest = h('div', { class: 'addr-suggest', hidden: true });
  const addrNote = h('p', { class: 'field__help', hidden: true });
  fields.address = makeField({ label: '住所', forId: addrId, control: h('div', {}, addrInput, addrSuggest, addrNote) });

  function applyAddress(addr) {
    addrInput.placeholder = '';
    if (!addr) {
      addrNote.hidden = false;
      addrNote.textContent = '住所を取得できませんでした。必要なら手入力してください';
      return;
    }
    addrNote.hidden = true;
    if (addrInput.value === '' || addrInput.value === v.autoAddress) {
      addrInput.value = addr.slice(0, LIMITS.ADDRESS_MAX);
      v.autoAddress = addrInput.value;
      addrSuggest.hidden = true;
      changed();
    } else if (addr !== addrInput.value) {
      clear(addrSuggest);
      addrSuggest.hidden = false;
      add(addrSuggest, h('span', { text: `新しい位置の住所:${addr}` }),
        h('button', {
          type: 'button', class: 'btn btn--ghost btn--sm', text: '反映する',
          onClick: () => { addrInput.value = addr.slice(0, LIMITS.ADDRESS_MAX); v.autoAddress = addrInput.value; addrSuggest.hidden = true; changed(); },
        }));
    }
  }

  async function fetchAddress(lat, lng) {
    const seq = ++revSeq;
    addrInput.placeholder = '住所を取得中…';
    try {
      const a = await reverseGeocode(lat, lng);
      if (seq === revSeq) applyAddress(a);
    } catch {
      if (seq === revSeq) applyAddress(null);
    }
  }

  function setLocation(lat, lng, { accuracy = null, address, fetch = true } = {}) {
    v.lat = lat; v.lng = lng; v.accuracy = accuracy;
    renderLoc();
    if (address !== undefined) applyAddress(address);
    else if (fetch) fetchAddress(lat, lng);
    checkDuplicates();
    changed();
  }

  async function useCurrent(btn) {
    if (locating) return;
    locating = true;
    setBusy(btn, true, '現在地を取得中…');
    try {
      const p = await getCurrentPosition({ maximumAge: 10000 });
      setLocation(p.lat, p.lng, { accuracy: p.accuracy });
    } catch (e) {
      toast(geoErrorMessage(e), { type: 'error' });
      setBusy(btn, false);
    } finally {
      locating = false;
    }
  }

  async function pick(focusSearch = false) {
    const r = await openLocationPicker({ lat: v.lat, lng: v.lng, focusSearch });
    if (r) setLocation(r.lat, r.lng, { address: r.address || null, fetch: false });
  }

  function renderLoc() {
    clear(locBox);
    if (preview) { preview.remove(); preview = null; previewMarker = null; }
    if (v.lat === null) {
      const cur = h('button', { type: 'button', class: 'btn btn--primary btn--block' }, icon('pin', { size: 20 }), '現在地を使う');
      cur.addEventListener('click', () => useCurrent(cur));
      add(locBox, cur,
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn--secondary', text: '地図で選ぶ', onClick: () => pick(false) }),
          h('button', { type: 'button', class: 'btn btn--secondary', text: '住所・店名で検索', onClick: () => pick(true) })),
        h('p', { class: 'field__help', text: '位置を設定すると地図に表示されます(後から設定も可)' }));
      return;
    }
    previewEl = h('div', { class: 'loc__preview', aria: { label: '設定した位置の地図' }, role: 'img' });
    add(locBox, previewEl,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn--secondary', text: '変更', onClick: () => pick(false) }),
        h('button', {
          type: 'button', class: 'btn btn--danger-ghost',
          onClick: async () => {
            const ok = await confirmDialog({ title: '位置を削除しますか?', body: 'このお店は地図に表示されなくなります。', okLabel: '削除する', danger: true });
            if (ok) { v.lat = null; v.lng = null; v.accuracy = null; renderLoc(); checkDuplicates(); changed(); }
          },
        }, icon('trash', { size: 18 }), '位置を削除')),
      v.accuracy && v.accuracy > 100 ? h('p', { class: 'note-warn' },
        `位置の精度が低い可能性があります(約±${Math.round(v.accuracy)}m)。`,
        h('button', { type: 'button', class: 'link-btn', text: '地図で調整', onClick: () => pick(false) })) : null);
    loadLeaflet().then((L) => {
      if (!previewEl.isConnected || v.lat === null) return;
      preview = L.map(previewEl, {
        zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
        keyboard: false, touchZoom: false, tap: false,
      }).setView([v.lat, v.lng], 17);
      addOsmLayer(L, preview);
      previewMarker = L.marker([v.lat, v.lng], {
        interactive: false, keyboard: false,
        icon: L.divIcon({
          html: h('div', { class: 'pin pin--select', style: { '--cat': 'var(--color-primary)' } }, h('span', { class: 'pin__body' }, icon('pin', { size: 20 }))),
          className: 'pin-wrap', iconSize: [36, 44], iconAnchor: [18, 44],
        }),
      }).addTo(preview);
    }).catch(() => { previewEl.textContent = '地図を読み込めませんでした'; });
  }

  // ---------------- 重複候補 ----------------
  const dupBox = h('div', { class: 'dup', hidden: true, role: 'status' });
  function checkDuplicates() {
    if (o.mode === 'edit' && nameInput.value.trim() === initialName && v.lat === initialLat && v.lng === initialLng) {
      dupBox.hidden = true; return;
    }
    const list = findDuplicates(state.shops, { name: nameInput.value, lat: v.lat, lng: v.lng, excludeId: o.excludeId });
    clear(dupBox);
    dupBox.hidden = !list.length;
    if (!list.length) return;
    add(dupBox, h('p', { class: 'dup__title' }, icon('alert', { size: 18 }), o.mode === 'new' ? '近くに登録済みのお店があります' : '同じお店が登録されている可能性があります'),
      h('ul', { class: 'dup__list' }, list.map(({ shop, distance }) => h('li', { class: 'dup__item', style: catStyle(shop.category) },
        h('span', { class: 'dup__name' }, shop.name, distance !== null ? h('span', { class: 'dup__dist num', text: `(${formatDistance(distance)})` }) : null),
        o.mode === 'new' && o.onCarry
          ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onClick: () => o.onCarry(shop.id) }, 'このお店に記録', icon('chevronRight', { size: 16 }))
          : h('a', { class: 'btn btn--ghost btn--sm', href: `#/shop/${encodeURIComponent(shop.id)}` }, '見る', icon('chevronRight', { size: 16 }))))),
      o.mode === 'new' && o.onCarry ? h('p', { class: 'dup__note', text: '「このお店に記録」を選ぶと、入力中の店情報は使われません' }) : null);
  }

  // ---------------- 店名・カテゴリ ----------------
  fields.name = makeField({
    label: '店名', required: true, forId: nameId, control: nameInput,
    counter: counterFor(nameInput, LIMITS.SHOP_NAME_MAX, 50),
  });
  nameInput.addEventListener('blur', checkDuplicates);

  const catLabelId = nextId('lbl');
  const catChips = singleChips({
    labelId: catLabelId, value: v.category, className: 'chips--grid3', chipClass: 'chip--cat',
    options: CATEGORIES.map((c) => ({ key: c.key, label: CATEGORY_SHORT[c.key], emoji: c.emoji, style: catStyle(c.key), ariaLabel: c.label })),
    onChange: (k) => { v.category = k; changed(); },
  });
  fields.category = makeField({ label: 'カテゴリ', required: true, labelId: catLabelId, control: catChips });

  // ---------------- 詳しく ----------------
  const genreId = nextId('genre'), areaId = nextId('area'), urlId = nextId('url'), noteId = nextId('note');
  const genreInput = textInput({ id: genreId, value: v.genre, max: LIMITS.GENRE_MAX, placeholder: '例:イタリアン、焼き鳥' });
  const areaInput = textInput({ id: areaId, value: v.area, max: LIMITS.AREA_MAX, placeholder: '例:新橋駅、仙台駅西口' });
  const urlInput = textInput({ id: urlId, value: v.url, type: 'url', max: LIMITS.URL_MAX, placeholder: 'https://', inputmode: 'url' });
  const noteInput = textArea({ id: noteId, value: v.note, max: LIMITS.NOTE_MAX, rows: 3 });
  fields.genre = makeField({ label: 'ジャンル', forId: genreId, control: genreInput });
  fields.area = makeField({ label: 'エリア・最寄り駅', forId: areaId, control: areaInput });
  fields.url = makeField({ label: 'URL(Webサイト・グルメサイト等)', forId: urlId, control: urlInput });
  fields.note = makeField({ label: 'その他の共有事項', forId: noteId, control: noteInput, counter: counterFor(noteInput, LIMITS.NOTE_MAX) });

  const enumDefs = [
    ['reservation', '予約', RESERVATION],
    ['privateRoom', '個室', PRIVATE_ROOM],
    ['smoking', '喫煙', SMOKING],
    ['parking', '駐車場', PARKING],
    ['cashless', 'カード・電子決済', CASHLESS],
    ['kidsOk', '子連れ', KIDS_OK],
  ];
  const enumFields = enumDefs.map(([key, label, defs]) => {
    const labelId = nextId('lbl');
    return makeField({
      label, labelId, className: 'field--compact',
      control: singleChips({
        labelId, options: defs, value: v[key], className: 'chips--sm', mutedKey: 'unknown',
        onChange: (k) => { v[key] = k; changed(); },
      }),
    });
  });

  const hasDetails = !!(v.genre || v.area || v.url || v.note || enumDefs.some(([k]) => v[k] !== 'unknown'));
  const details = collapsible('詳しく入力(ジャンル・エリア・設備など)',
    [h('div', { class: 'field-row' }, fields.genre, fields.area), ...enumFields, fields.url, fields.note],
    hasDetails || o.focus === 'details');

  [nameInput, addrInput, genreInput, areaInput, urlInput, noteInput].forEach((i) => i.addEventListener('input', changed));
  addrInput.addEventListener('input', () => { addrSuggest.hidden = true; });

  const el = h('section', { class: 'form-section' },
    h('h2', { class: 'form-section__title', text: 'お店' }),
    locField, fields.address, dupBox, fields.name, fields.category, details);

  renderLoc();
  if (o.mode === 'new' && v.lat !== null) checkDuplicates();
  if (o.focus === 'location') requestAnimationFrame(() => locField.scrollIntoView({ block: 'center' }));

  // ---------------- 値・検証 ----------------
  function raw() {
    const r = { ...v, name: nameInput.value, address: addrInput.value, genre: genreInput.value, area: areaInput.value, url: urlInput.value, note: noteInput.value };
    return r;
  }
  function values() {
    const r = raw();
    return {
      name: r.name.trim(), category: r.category, genre: r.genre.trim(), address: r.address.trim(),
      lat: r.lat, lng: r.lng, area: r.area.trim(), url: r.url.trim(),
      reservation: r.reservation, privateRoom: r.privateRoom, smoking: r.smoking, parking: r.parking,
      cashless: r.cashless, kidsOk: r.kidsOk, note: r.note.trim(),
    };
  }
  /** @returns {Array<{field:HTMLElement, focus:()=>void}>} */
  function validate() {
    const x = values();
    const errs = [];
    const set = (f, msg, focusFn) => { f.setError(msg); if (msg) errs.push({ field: f, focus: focusFn || (() => f.querySelector('input,textarea,button')?.focus()) }); };
    set(fields.name, !x.name ? '店名を入力してください' : lenError(x.name, LIMITS.SHOP_NAME_MAX, '店名は60文字以内で入力してください'));
    set(fields.category, x.category ? '' : 'カテゴリを選んでください', () => catChips.focusFirst());
    set(fields.genre, lenError(x.genre, LIMITS.GENRE_MAX, '30文字以内で入力してください'));
    set(fields.area, lenError(x.area, LIMITS.AREA_MAX, '30文字以内で入力してください'));
    set(fields.address, lenError(x.address, LIMITS.ADDRESS_MAX, '住所は120文字以内で入力してください'));
    let urlMsg = '';
    if (x.url) {
      if (x.url.length > LIMITS.URL_MAX) urlMsg = 'URLは300文字以内で入力してください';
      else if (!isHttpUrl(x.url)) urlMsg = '「https://」から始まるURLを入力してください';
    }
    set(fields.url, urlMsg);
    set(fields.note, lenError(x.note, LIMITS.NOTE_MAX, '500文字以内で入力してください'));
    if (errs.some((e) => details.contains(e.field))) details.open();
    return errs;
  }

  return {
    el, raw, values, validate,
    destroy() { if (preview) preview.remove(); },
  };
}

// =====================================================================
// 「■ 今回の訪問」セクション
// =====================================================================
export function defaultVisitRaw(now = new Date()) {
  return {
    visitedOn: todayStr(now), timing: timingForTime(now), rating: null, scenes: [], budget: null,
    peopleChoice: null, peopleNum: '', menus: [''], tasteComment: '', noiseLevel: null, moodTags: [],
    moodComment: '', priceActual: '', photos: [],
  };
}
export function visitRawFrom(visit) {
  const r = defaultVisitRaw();
  Object.assign(r, {
    visitedOn: visit.visitedOn, timing: visit.timing, rating: visit.rating,
    scenes: visit.scenes || [], budget: visit.budget || null,
    menus: (visit.menus && visit.menus.length) ? [...visit.menus] : [''],
    tasteComment: visit.tasteComment || '', noiseLevel: visit.noiseLevel || null,
    moodTags: visit.moodTags || [], moodComment: visit.moodComment || '',
    priceActual: typeof visit.priceActual === 'number' ? String(visit.priceActual) : '',
    photos: (visit.thumbs || []).map((t, i) => ({ kind: 'existing', existingOrder: i, thumb: t })),
  });
  if (typeof visit.people === 'number') {
    if (visit.people >= 7) { r.peopleChoice = '7+'; r.peopleNum = String(visit.people); }
    else r.peopleChoice = visit.people;
  }
  return r;
}

/**
 * @param {object} initial 初期値(defaultVisitRaw 形式)
 * @param {{onChange?:Function, onBusyChange?:(busy:boolean)=>void}} o
 */
export function visitSection(initial, o = {}) {
  const v = { ...defaultVisitRaw(), ...initial };
  v.menus = v.menus && v.menus.length ? [...v.menus] : [''];
  v.photos = [...(v.photos || [])];
  const fields = {};
  const changed = () => o.onChange && o.onChange();

  // 訪問日
  const dateId = nextId('date');
  const dateInput = h('input', { id: dateId, class: 'input input--date', type: 'date', value: v.visitedOn, attrs: { max: todayStr(), required: true } });
  dateInput.addEventListener('input', () => { v.visitedOn = dateInput.value; changed(); });
  dateInput.addEventListener('change', () => { v.visitedOn = dateInput.value; changed(); });
  fields.visitedOn = makeField({ label: '訪問日', required: true, forId: dateId, control: dateInput });

  // タイミング
  const timingLabel = nextId('lbl');
  const timingSeg = segmented({
    labelId: timingLabel, value: v.timing,
    options: TIMINGS.map((t) => ({ key: t.key, label: TIMING_SHORT[t.key], ariaLabel: t.label })),
    onChange: (k) => { v.timing = k; changed(); },
  });
  fields.timing = makeField({ label: 'タイミング', required: true, labelId: timingLabel, control: timingSeg });

  // おすすめ度
  const ratingLabel = nextId('lbl');
  const stars = starInput({ labelId: ratingLabel, value: v.rating, words: RATING_WORDS, onChange: (n) => { v.rating = n; changed(); revalidate(); } });
  fields.rating = makeField({ label: 'おすすめ度', required: true, labelId: ratingLabel, control: stars });

  // 利用シーン
  const sceneLabel = nextId('lbl');
  fields.scenes = makeField({
    label: '利用シーン', labelId: sceneLabel,
    control: multiChips({ labelId: sceneLabel, options: SCENES, value: v.scenes, onChange: (x) => { v.scenes = x; changed(); } }),
  });

  // 予算
  const budgetLabel = nextId('lbl');
  fields.budget = makeField({
    label: '予算(1人あたり)', labelId: budgetLabel,
    control: singleChips({ labelId: budgetLabel, options: BUDGETS, value: v.budget, allowDeselect: true, onChange: (k) => { v.budget = k; changed(); } }),
  });

  // 人数
  const peopleLabel = nextId('lbl');
  const peopleNumId = nextId('pnum');
  const peopleNum = h('input', {
    id: peopleNumId, class: 'input input--num', type: 'text', value: v.peopleNum,
    attrs: { inputmode: 'numeric', maxlength: '3', 'aria-label': '人数(7〜50)' },
  });
  const peopleNumWrap = h('div', { class: 'inline-input', hidden: v.peopleChoice !== '7+' }, peopleNum, h('span', { text: '人' }));
  peopleNum.addEventListener('input', () => { v.peopleNum = peopleNum.value; changed(); });
  const peopleChips = singleChips({
    labelId: peopleLabel, allowDeselect: true, value: v.peopleChoice,
    options: [1, 2, 3, 4, 5, 6].map((n) => ({ key: n, label: String(n), ariaLabel: `${n}人` })).concat([{ key: '7+', label: '7人以上' }]),
    onChange: (k) => {
      v.peopleChoice = k;
      peopleNumWrap.hidden = k !== '7+';
      if (k === '7+') requestAnimationFrame(() => peopleNum.focus());
      changed();
    },
  });
  fields.people = makeField({ label: '人数', labelId: peopleLabel, control: h('div', {}, peopleChips, peopleNumWrap) });

  // 食べたメニュー
  const menuList = h('div', { class: 'menu-rows' });
  const menuAdd = h('button', { type: 'button', class: 'btn btn--ghost btn--sm' }, icon('plus', { size: 18 }), 'メニューを追加');
  const menuMax = h('p', { class: 'field__help', text: '最大20品までです', hidden: true });
  const menuLabelId = nextId('lbl');
  function menuInputs() { return [...menuList.querySelectorAll('input')]; }
  function syncMenus() { v.menus = menuInputs().map((i) => i.value); }
  function updateMenuUi() {
    const n = menuInputs().length;
    menuAdd.disabled = n >= LIMITS.MENUS_MAX;
    menuMax.hidden = n < LIMITS.MENUS_MAX;
  }
  function addMenuRow(value = '', focus = false, after = null) {
    if (menuInputs().length >= LIMITS.MENUS_MAX) return null;
    const input = h('input', {
      class: 'input', type: 'text', value, attrs: { maxlength: String(LIMITS.MENU_NAME_MAX), enterkeyhint: 'next', autocomplete: 'off' },
      aria: { labelledby: menuLabelId }, placeholder: '例:おまかせ',
    });
    const row = h('div', { class: 'menu-row' }, input,
      h('button', {
        type: 'button', class: 'icon-btn', aria: { label: 'メニューを削除' },
        onClick: () => {
          if (menuInputs().length <= 1) { input.value = ''; input.focus(); }
          else {
            const next = row.nextElementSibling || row.previousElementSibling;
            row.remove();
            next?.querySelector('input')?.focus();
          }
          syncMenus(); updateMenuUi(); changed();
        },
      }, icon('close', { size: 20 })));
    input.addEventListener('input', () => { syncMenus(); changed(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const r = addMenuRow('', true, row);
        if (!r) input.blur();
        syncMenus(); changed();
      }
    });
    if (after && after.nextSibling) menuList.insertBefore(row, after.nextSibling); else add(menuList, row);
    updateMenuUi();
    if (focus) input.focus();
    return row;
  }
  v.menus.forEach((m) => addMenuRow(m));
  menuAdd.addEventListener('click', () => { addMenuRow('', true); syncMenus(); changed(); });
  fields.menus = makeField({ label: '食べたメニュー', labelId: menuLabelId, control: h('div', {}, menuList, menuAdd, menuMax) });

  // 写真
  const photoGrid = h('div', { class: 'photo-grid' });
  const photoLabelId = nextId('lbl');
  const photoLabel = h('span', {});
  const fileInput = h('input', { type: 'file', class: 'visually-hidden', attrs: { accept: 'image/*', multiple: true, tabindex: '-1', 'aria-hidden': 'true' } });
  fileInput.addEventListener('change', () => { handleFiles([...fileInput.files]); fileInput.value = ''; });
  let pendingCount = 0;
  function busy() { return pendingCount > 0; }
  function renderPhotos() {
    clear(photoGrid);
    photoLabel.textContent = v.photos.length >= 4 ? '写真 4/4枚' : '写真(最大4枚)';
    v.photos.forEach((p, i) => {
      if (p.kind === 'pending') {
        add(photoGrid, h('div', { class: 'photo-slot photo-slot--pending', role: 'status' },
          h('span', { class: 'spinner' }), h('span', { class: 'photo-slot__txt', text: '処理中' })));
        return;
      }
      add(photoGrid, h('div', { class: 'photo-slot photo-slot--filled' },
        h('button', {
          type: 'button', class: 'photo-slot__img', aria: { label: `写真${i + 1}を拡大` },
          onClick: () => {
            const done = v.photos.filter((x) => x.kind !== 'pending');
            openPhotoViewer({
              thumbs: done.map((x) => x.thumb), images: done.map((x) => x.data || x.thumb), start: done.indexOf(p),
            });
          },
        }, h('img', { src: safeImageSrc(p.thumb), alt: '' })),
        h('button', {
          type: 'button', class: 'photo-slot__del', aria: { label: `写真${i + 1}を削除` },
          onClick: () => { v.photos.splice(v.photos.indexOf(p), 1); renderPhotos(); changed(); },
        }, icon('close', { size: 16, strokeWidth: 2.5 }))));
    });
    for (let i = v.photos.length; i < 4; i++) {
      add(photoGrid, h('button', {
        type: 'button', class: 'photo-slot photo-slot--add', aria: { label: '写真を追加' },
        onClick: () => fileInput.click(),
      }, icon(i === v.photos.length ? 'plus' : 'camera', { size: 24 })));
    }
  }
  async function handleFiles(files) {
    const imgs = files.filter((f) => /^image\//.test(f.type) || !f.type);
    const free = 4 - v.photos.length;
    if (imgs.length > free) toast('写真は1回の訪問につき4枚までです', { type: 'error' });
    const take = imgs.slice(0, Math.max(0, free));
    const slots = take.map(() => ({ kind: 'pending' }));
    v.photos.push(...slots);
    pendingCount += slots.length;
    o.onBusyChange && o.onBusyChange(true);
    renderPhotos();
    // 1枚ずつ順に処理(メモリ節約)
    for (let i = 0; i < take.length; i++) {
      const slot = slots[i];
      try {
        const r = await processImage(take[i]);
        Object.assign(slot, { kind: 'new', data: r.data, thumb: r.thumb, width: r.width, height: r.height });
      } catch (e) {
        console.error(e);
        const idx = v.photos.indexOf(slot);
        if (idx >= 0) v.photos.splice(idx, 1);
        toast('写真を読み込めませんでした。別の写真をお試しください', { type: 'error' });
      }
      pendingCount -= 1;
      renderPhotos();
      changed();
    }
    o.onBusyChange && o.onBusyChange(busy());
  }
  renderPhotos();
  fields.photos = makeField({
    label: '', labelId: photoLabelId, control: h('div', {}, photoGrid, fileInput),
  });
  fields.photos.querySelector('.field__label').append(photoLabel);

  // ---- 感想・雰囲気(折りたたみ)----
  const tasteId = nextId('taste'), moodCId = nextId('moodc'), priceId = nextId('price');
  const tasteInput = textArea({ id: tasteId, value: v.tasteComment, max: LIMITS.TASTE_COMMENT_MAX, rows: 4 });
  const moodInput = textArea({ id: moodCId, value: v.moodComment, max: LIMITS.MOOD_COMMENT_MAX, rows: 3 });
  const priceInput = h('input', {
    id: priceId, class: 'input input--num', type: 'text', value: v.priceActual ? Number(v.priceActual).toLocaleString('ja-JP') : '',
    attrs: { inputmode: 'numeric', autocomplete: 'off', maxlength: '9' },
  });
  priceInput.addEventListener('focus', () => { priceInput.value = priceInput.value.replace(/,/g, ''); });
  priceInput.addEventListener('blur', () => {
    const n = parseIntLoose(priceInput.value);
    if (typeof n === 'number' && !Number.isNaN(n)) priceInput.value = n.toLocaleString('ja-JP');
  });
  tasteInput.addEventListener('input', () => { v.tasteComment = tasteInput.value; changed(); });
  moodInput.addEventListener('input', () => { v.moodComment = moodInput.value; changed(); });
  priceInput.addEventListener('input', () => { v.priceActual = priceInput.value; changed(); });
  fields.tasteComment = makeField({ label: '味の感想', forId: tasteId, control: tasteInput, counter: counterFor(tasteInput, LIMITS.TASTE_COMMENT_MAX) });
  fields.moodComment = makeField({ label: '雰囲気の感想', forId: moodCId, control: moodInput, counter: counterFor(moodInput, LIMITS.MOOD_COMMENT_MAX) });
  fields.priceActual = makeField({ label: '実費(1人あたり)', forId: priceId, control: h('div', { class: 'inline-input' }, priceInput, h('span', { text: '円' })) });

  // 賑やかさスライダー
  const noiseId = nextId('noise');
  const noiseInput = h('input', {
    id: noiseId, class: 'range', type: 'range', attrs: { min: '1', max: '5', step: '1' }, value: String(v.noiseLevel || 3),
  });
  const noiseWord = h('span', { class: 'range-word' });
  const noiseClear = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'クリア' });
  function renderNoise() {
    const set = v.noiseLevel !== null;
    noiseInput.classList.toggle('is-unset', !set);
    noiseInput.style.setProperty('--fill', set ? `${((v.noiseLevel - 1) / 4) * 100}%` : '0%');
    noiseWord.textContent = set ? `${v.noiseLevel} ${NOISE_WORDS[v.noiseLevel]}` : '未設定(タップして設定)';
    noiseWord.classList.toggle('is-empty', !set);
    noiseInput.setAttribute('aria-valuetext', set ? `${v.noiseLevel} ${NOISE_WORDS[v.noiseLevel]}` : '未設定');
    noiseClear.hidden = !set;
  }
  const setNoise = () => { v.noiseLevel = parseInt(noiseInput.value, 10); renderNoise(); changed(); };
  noiseInput.addEventListener('input', setNoise);
  noiseInput.addEventListener('change', setNoise);
  noiseInput.addEventListener('pointerup', () => { if (v.noiseLevel === null) setNoise(); });
  noiseInput.addEventListener('keydown', (e) => { if (v.noiseLevel === null && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setNoise(); } });
  noiseClear.addEventListener('click', () => { v.noiseLevel = null; noiseInput.value = '3'; renderNoise(); changed(); });
  renderNoise();
  fields.noise = makeField({
    label: '賑やかさ', forId: noiseId,
    control: h('div', { class: 'range-wrap' },
      h('div', { class: 'range-ends', aria: { hidden: 'true' } }, h('span', { text: '静か' }), h('span', { text: '賑やか' })),
      noiseInput,
      h('div', { class: 'range-ticks', aria: { hidden: 'true' } }, [1, 2, 3, 4, 5].map(() => h('span'))),
      h('div', { class: 'range-foot' }, noiseWord, noiseClear)),
  });

  const moodLabel = nextId('lbl');
  fields.moodTags = makeField({
    label: '雰囲気タグ', labelId: moodLabel,
    control: multiChips({ labelId: moodLabel, options: MOOD_TAGS, value: v.moodTags, onChange: (x) => { v.moodTags = x; changed(); } }),
  });

  const hasFeel = !!(v.tasteComment || v.moodComment || v.noiseLevel || v.moodTags.length || v.priceActual);
  const feel = collapsible('感想・雰囲気', [fields.tasteComment, fields.noise, fields.moodTags, fields.moodComment, fields.priceActual], hasFeel);

  const el = h('div', { class: 'visit-fields' },
    fields.visitedOn, fields.timing, fields.rating, fields.scenes, fields.budget, fields.people,
    fields.menus, fields.photos, feel);

  // ---------------- 値・検証 ----------------
  let validatedOnce = false;
  function revalidate() { if (validatedOnce) validate(); }
  el.addEventListener('input', revalidate);
  el.addEventListener('click', () => setTimeout(revalidate, 0));

  function peopleValue() {
    if (v.peopleChoice === null || v.peopleChoice === undefined) return null;
    if (v.peopleChoice === '7+') return parseIntLoose(peopleNum.value);
    return v.peopleChoice;
  }
  function raw() {
    syncMenus();
    return { ...v, visitedOn: dateInput.value, peopleNum: peopleNum.value, priceActual: priceInput.value, menus: [...v.menus], photos: [...v.photos] };
  }
  function values() {
    const r = raw();
    const price = parseIntLoose(r.priceActual);
    return {
      visitedOn: r.visitedOn,
      timing: r.timing,
      people: peopleValue(),
      budget: r.budget || null,
      priceActual: price === null || Number.isNaN(price) ? null : price,
      scenes: r.scenes,
      menus: r.menus.map((m) => m.trim()).filter(Boolean),
      tasteComment: r.tasteComment.trim(),
      noiseLevel: r.noiseLevel,
      moodTags: r.moodTags,
      moodComment: r.moodComment.trim(),
      rating: r.rating,
    };
  }
  function validate() {
    validatedOnce = true;
    const x = values();
    const errs = [];
    const set = (f, msg, focusFn) => { f.setError(msg, f === fields.menus ? null : undefined); if (msg) errs.push({ field: f, focus: focusFn || (() => f.querySelector('input,textarea,button')?.focus()) }); };
    let dMsg = '';
    if (!x.visitedOn) dMsg = '訪問日を選んでください';
    else if (!parseYmd(x.visitedOn)) dMsg = '訪問日を選んでください';
    else if (x.visitedOn > todayStr()) dMsg = '未来の日付は選べません';
    set(fields.visitedOn, dMsg);
    set(fields.timing, x.timing ? '' : 'タイミングを選んでください', () => timingSeg.focusFirst());
    set(fields.rating, x.rating ? '' : 'おすすめ度を★で選んでください', () => stars.focusFirst());
    let pMsg = '';
    if (v.peopleChoice === '7+') {
      const n = peopleValue();
      if (n === null || Number.isNaN(n) || n < 7 || n > LIMITS.PEOPLE_MAX) pMsg = '人数は7〜50の数字で入力してください';
    }
    set(fields.people, pMsg, () => peopleNum.focus());
    fields.people.setError(pMsg, peopleNum);
    const price = parseIntLoose(priceInput.value);
    const priceMsg = price !== null && (Number.isNaN(price) || price < 0 || price > LIMITS.PRICE_MAX) ? '金額は0〜1,000,000円の数字で入力してください' : '';
    set(fields.priceActual, priceMsg, () => priceInput.focus());
    const longMenu = menuInputs().find((i) => i.value.trim().length > LIMITS.MENU_NAME_MAX);
    set(fields.menus, longMenu ? '1品40文字以内で入力してください' : '', () => longMenu && longMenu.focus());
    set(fields.tasteComment, lenError(x.tasteComment, LIMITS.TASTE_COMMENT_MAX, '1000文字以内で入力してください'));
    set(fields.moodComment, lenError(x.moodComment, LIMITS.MOOD_COMMENT_MAX, '500文字以内で入力してください'));
    if (errs.some((e) => feel.contains(e.field))) feel.open();
    return errs;
  }

  /** 保存用の写真:新規作成時 */
  function newPhotos() {
    return v.photos.filter((p) => p.kind === 'new').map(({ data, thumb, width, height }) => ({ data, thumb, width, height }));
  }
  /** 編集時の写真計画 */
  function photoPlan(originalCount) {
    return {
      originalCount,
      items: v.photos.filter((p) => p.kind !== 'pending').map((p) => (p.kind === 'existing'
        ? { existingOrder: p.existingOrder, thumb: p.thumb }
        : { data: p.data, thumb: p.thumb, width: p.width, height: p.height })),
    };
  }

  return { el, raw, values, validate, newPhotos, photoPlan, busy };
}

/** raw → 比較用シグネチャ(写真は件数と種別のみ) */
export function rawSignature(raw) {
  if (!raw) return '';
  const { photos, autoAddress, accuracy, ...rest } = raw; // eslint-disable-line no-unused-vars
  const r = { ...rest };
  if (Array.isArray(r.menus)) r.menus = r.menus.map((m) => m.trim()).filter(Boolean);
  for (const k of Object.keys(r)) if (typeof r[k] === 'string') r[k] = r[k].trim();
  return JSON.stringify({ ...r, photos: (photos || []).map((p) => (p.kind === 'existing' ? `e${p.existingOrder}` : p.kind)) });
}

/** 下書き保存用(写真本体は保存しない) */
export function rawForDraft(raw) {
  if (!raw) return null;
  const { photos, ...rest } = raw; // eslint-disable-line no-unused-vars
  return rest;
}

/** エラー一覧の最初へスクロール+フォーカス */
export function focusFirstError(errs) {
  if (!errs.length) return;
  const first = errs[0];
  first.field.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(() => first.focus(), 250);
}
