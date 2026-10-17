// =====================================================================
// state.js ― アプリ内の共有状態(端末設定・店一覧・絞り込み条件・セッション情報)
// =====================================================================
import { LS_PREFIX, toMillis } from './utils.js';
import { isValidGroupId, LIMITS } from './schema.js';
import { defaultFilterState, sanitizeFilterState, shopSearchText } from './filter.js';

const K = {
  nickname: `${LS_PREFIX}nickname`,
  groupId: `${LS_PREFIX}groupId`,
  lastFilter: `${LS_PREFIX}lastFilter`,
  lastOpenedAt: `${LS_PREFIX}lastOpenedAt`,
  draft: `${LS_PREFIX}draft`,
};

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* noop */ } }

// ---------------------------------------------------------------------
// 端末設定
// ---------------------------------------------------------------------
export const settings = {
  get nickname() {
    const v = lsGet(K.nickname);
    return v && v.length <= LIMITS.NICKNAME_MAX ? v : '';
  },
  set nickname(v) { lsSet(K.nickname, v); },
  get groupId() {
    const v = lsGet(K.groupId);
    return v && isValidGroupId(v) ? v : '';
  },
  set groupId(v) { if (v) lsSet(K.groupId, v); else lsDel(K.groupId); },
  isReady() { return !!(this.nickname && this.groupId); },
};

// ---------------------------------------------------------------------
// 共有状態
// ---------------------------------------------------------------------
export const state = {
  store: null,
  /** @type {Array<object>} */
  shops: [],
  shopsLoaded: false,
  shopsError: null,
  fromCache: false,
  /** 一覧・地図で共有する絞り込み条件(F-43) */
  filter: loadFilter(),
  /** 近い順のための現在地(保存しない) */
  origin: null,
  /** 地図の中心・ズーム(セッション内) */
  mapView: null,
  /** 地図で選択状態にする店(詳細の小地図から) */
  mapFocusShopId: null,
  /** 一覧のスクロール位置 */
  listScroll: 0,
  /** 重複候補 → 既存店へ記録するときの訪問入力の引き継ぎ */
  carryVisit: null,
  /** 前回起動日時(F-54 新着) */
  lastOpenedAt: Number(lsGet(K.lastOpenedAt)) || 0,
};

// 起動時刻を記録(次回の新着判定用)
lsSet(K.lastOpenedAt, String(Date.now()));

const shopListeners = new Set();
/** 店一覧の変化を購読 */
export function onShopsChange(cb) {
  shopListeners.add(cb);
  return () => shopListeners.delete(cb);
}
export function setShops(list, meta = {}) {
  state.shops = list.map((s) => ({ ...s, _search: shopSearchText(s) }));
  state.shopsLoaded = true;
  state.shopsError = null;
  state.fromCache = !!meta.fromCache;
  shopListeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
}
export function setShopsError(err) {
  state.shopsError = err;
  shopListeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
}
export function findShop(id) {
  return state.shops.find((s) => s.id === id) || null;
}

/** 新着(F-54):前回起動以降に他の人が登録した店、または他の人の訪問で更新された店 */
export function isNewShop(shop, me) {
  if (!state.lastOpenedAt || !shop) return false;
  const c = toMillis(shop.createdAt);
  return shop.createdBy !== me && c !== null && c > state.lastOpenedAt;
}

// ---------------------------------------------------------------------
// 絞り込み条件(F-36:直近の条件を保存・復元。検索語は保存しない)
// ---------------------------------------------------------------------
function loadFilter() {
  try {
    const raw = lsGet(K.lastFilter);
    if (raw) return { ...sanitizeFilterState(JSON.parse(raw)), keyword: '' };
  } catch { /* noop */ }
  return defaultFilterState();
}
const filterListeners = new Set();
export function onFilterChange(cb) {
  filterListeners.add(cb);
  return () => filterListeners.delete(cb);
}
export function setFilter(next) {
  state.filter = { ...state.filter, ...next };
  const { keyword, ...persist } = state.filter; // eslint-disable-line no-unused-vars
  // 近い順は現在地が必要なので復元時は既定へ
  if (persist.sort === 'distance') persist.sort = 'created';
  lsSet(K.lastFilter, JSON.stringify(persist));
  filterListeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
}

// ---------------------------------------------------------------------
// 入力途中の一時保存(F-27)
// ---------------------------------------------------------------------
export const drafts = {
  get(key) {
    try {
      const all = JSON.parse(lsGet(K.draft) || '{}');
      const d = all[key];
      if (d && Date.now() - d.at < 7 * 24 * 3600 * 1000) return d.value;
    } catch { /* noop */ }
    return null;
  },
  set(key, value) {
    try {
      const all = JSON.parse(lsGet(K.draft) || '{}');
      all[key] = { at: Date.now(), value };
      lsSet(K.draft, JSON.stringify(all));
    } catch { /* 容量不足などは無視 */ }
  },
  remove(key) {
    try {
      const all = JSON.parse(lsGet(K.draft) || '{}');
      delete all[key];
      lsSet(K.draft, JSON.stringify(all));
    } catch { /* noop */ }
  },
};

export function clearLocalGroup() {
  settings.groupId = '';
}
