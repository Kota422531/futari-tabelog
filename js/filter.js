// =====================================================================
// filter.js ― 検索語の正規化・絞り込み・並び替え・重複候補(DOM非依存の純関数)
//   02_ui.md §1.5 / §2.3 / §5.3、01_requirements F-15 / F-31〜F-35
// =====================================================================
import {
  SCENES, TIMINGS, BUDGETS, CATEGORIES, labelOf, averageRating,
} from './schema.js';
import { distanceMeters, hasLocation, toMillis } from './utils.js';

// ---------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------

/**
 * 検索用の正規化:
 *  - NFKC(全角英数→半角、半角カナ→全角カナ、全角スペース→半角 など)
 *  - 英字は小文字
 *  - カタカナ → ひらがな(ァ-ヶ。ヴ→ゔ、ヵヶ も変換)
 *  - 連続空白は1つに、前後空白除去
 */
export function normalizeText(s) {
  if (s === null || s === undefined) return '';
  let t = String(s).normalize('NFKC').toLowerCase();
  t = t.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** 同名判定用(空白・中黒・記号の一部を除去した正規化) */
export function normalizeName(s) {
  return normalizeText(s).replace(/[\s・·.\-ー‐_'’"“”!!??&&]/g, '');
}

/** 検索語をスペース区切りのトークン(AND条件)に */
export function tokenizeKeyword(keyword) {
  const n = normalizeText(keyword);
  return n ? n.split(' ').filter(Boolean) : [];
}

/** 店の検索対象テキスト(店名・ジャンル・エリア・menusText・note・住所・カテゴリ名) */
export function shopSearchText(shop) {
  if (!shop) return '';
  return normalizeText([
    shop.name, shop.genre, shop.area, shop.menusText, shop.note, shop.address,
    labelOf(CATEGORIES, shop.category),
  ].filter((x) => typeof x === 'string' && x).join('\n'));
}

/** 検索語に一致するか(全トークンが部分一致) */
export function matchesKeyword(shop, keyword) {
  const tokens = Array.isArray(keyword) ? keyword : tokenizeKeyword(keyword);
  if (!tokens.length) return true;
  const hay = shop && typeof shop._search === 'string' ? shop._search : shopSearchText(shop);
  return tokens.every((t) => hay.includes(t));
}

// ---------------------------------------------------------------------
// 絞り込み条件
// ---------------------------------------------------------------------

/** 設備・条件(すべて満たす=AND) */
export const FEATURES = Object.freeze([
  { key: 'privateRoom',   label: '個室あり',           test: (s) => s.privateRoom === 'yes' || s.privateRoom === 'semi' },
  { key: 'nonsmoking',    label: '全面禁煙',           test: (s) => s.smoking === 'nonsmoking' },
  { key: 'parking',       label: '駐車場あり',         test: (s) => s.parking === 'yes' || s.parking === 'nearby' },
  { key: 'cashless',      label: 'カード・電子決済可', test: (s) => s.cashless === 'yes' || s.cashless === 'partial' },
  { key: 'kids',          label: '子連れ可',           test: (s) => s.kidsOk === 'yes' },
  { key: 'noReservation', label: '予約不要',           test: (s) => s.reservation === 'notneeded' },
]);

export const MIN_RATINGS = Object.freeze([
  { key: 0,   label: '指定なし' },
  { key: 3,   label: '★3以上' },
  { key: 4,   label: '★4以上' },
  { key: 4.5, label: '★4.5以上' },
]);

export const SORTS = Object.freeze([
  { key: 'created',   label: '新着登録順' },
  { key: 'lastVisit', label: '最終訪問日順' },
  { key: 'rating',    label: 'おすすめ度順' },
  { key: 'visits',    label: '訪問回数順' },
  { key: 'distance',  label: '現在地から近い順' },
]);

export const DEFAULT_SORT = 'created';

/** 既定の filterState */
export function defaultFilterState() {
  return {
    category: 'all',
    keyword: '',
    scenes: [],
    timings: [],
    budgets: [],
    minRating: 0,
    features: [],
    people: [],
    sort: DEFAULT_SORT,
  };
}

const uniqStrs = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string'))] : []);

/** 外部(localStorage 等)から来た値を安全な filterState に整える */
export function sanitizeFilterState(raw) {
  const d = defaultFilterState();
  if (!raw || typeof raw !== 'object') return d;
  const keys = (defs) => defs.map((x) => x.key);
  const pick = (arr, allowed) => uniqStrs(arr).filter((x) => allowed.includes(x));
  return {
    category: raw.category === 'all' || keys(CATEGORIES).includes(raw.category) ? raw.category : 'all',
    keyword: typeof raw.keyword === 'string' ? raw.keyword.slice(0, 100) : '',
    scenes: pick(raw.scenes, keys(SCENES)),
    timings: pick(raw.timings, keys(TIMINGS)),
    budgets: pick(raw.budgets, keys(BUDGETS)),
    minRating: keys(MIN_RATINGS).includes(raw.minRating) ? raw.minRating : 0,
    features: pick(raw.features, keys(FEATURES)),
    people: uniqStrs(raw.people).slice(0, 100),
    sort: keys(SORTS).includes(raw.sort) ? raw.sort : DEFAULT_SORT,
  };
}

const intersects = (a, b) => Array.isArray(a) && a.some((x) => b.includes(x));

/**
 * 1店が条件に合うか(sort は無関係)
 * @param {object} shop
 * @param {object} st filterState
 * @param {{tokens?:string[], ignoreCategory?:boolean}} [opt]
 */
export function matchesFilter(shop, st, opt = {}) {
  if (!shop) return false;
  if (!opt.ignoreCategory && st.category && st.category !== 'all' && shop.category !== st.category) return false;
  if (st.scenes && st.scenes.length && !intersects(shop.sceneSet, st.scenes)) return false;
  if (st.timings && st.timings.length && !intersects(shop.timingSet, st.timings)) return false;
  if (st.budgets && st.budgets.length && !intersects(shop.budgetSet, st.budgets)) return false;
  if (st.minRating) {
    const avg = averageRating(shop);
    if (avg === null || avg < st.minRating) return false;
  }
  if (st.features && st.features.length) {
    for (const f of st.features) {
      const def = FEATURES.find((x) => x.key === f);
      if (def && !def.test(shop)) return false;
    }
  }
  if (st.people && st.people.length) {
    const who = new Set([shop.createdBy, ...(Array.isArray(shop.visitorSet) ? shop.visitorSet : [])]);
    if (!st.people.some((p) => who.has(p))) return false;
  }
  const tokens = opt.tokens || tokenizeKeyword(st.keyword);
  if (!matchesKeyword(shop, tokens)) return false;
  return true;
}

/** 絞り込み(順序は入力順のまま) */
export function filterShops(shops, st, opt = {}) {
  const tokens = tokenizeKeyword(st && st.keyword);
  return (Array.isArray(shops) ? shops : []).filter((s) => matchesFilter(s, st || defaultFilterState(), { ...opt, tokens }));
}

const createdMs = (s) => {
  const m = toMillis(s && s.createdAt);
  return m === null ? Number.MAX_SAFE_INTEGER : m; // 未確定(書き込み直後)は最新扱い
};

/**
 * 並び替え(新しい配列を返す・安定ソート)
 * @param {Array} shops
 * @param {string} sort SORTS のキー
 * @param {{origin?:{lat:number,lng:number}}} [opt] distance 用の現在地
 */
export function sortShops(shops, sort, opt = {}) {
  const list = (Array.isArray(shops) ? shops : []).map((s, i) => ({ s, i }));
  const byCreated = (a, b) => createdMs(b.s) - createdMs(a.s);
  const tie = (a, b) => byCreated(a, b) || a.i - b.i;
  let cmp;
  switch (sort) {
    case 'lastVisit':
      cmp = (a, b) => {
        const x = a.s.lastVisitedOn || '', y = b.s.lastVisitedOn || '';
        if (x === y) return tie(a, b);
        if (!x) return 1; if (!y) return -1; // 未訪問は末尾
        return x < y ? 1 : -1;
      };
      break;
    case 'rating':
      cmp = (a, b) => {
        const x = averageRating(a.s), y = averageRating(b.s);
        if (x === null && y === null) return tie(a, b);
        if (x === null) return 1; if (y === null) return -1; // 未評価は末尾
        if (x !== y) return y - x;
        const cx = a.s.ratingCount || 0, cy = b.s.ratingCount || 0;
        return cy - cx || tie(a, b);
      };
      break;
    case 'visits':
      cmp = (a, b) => (b.s.visitCount || 0) - (a.s.visitCount || 0) || tie(a, b);
      break;
    case 'distance': {
      const o = opt.origin;
      const dist = (s) => (o && hasLocation(s) ? distanceMeters(o.lat, o.lng, s.lat, s.lng) : null);
      const cache = new Map(list.map((e) => [e, dist(e.s)]));
      cmp = (a, b) => {
        const x = cache.get(a), y = cache.get(b);
        if (x === null && y === null) return tie(a, b);
        if (x === null) return 1; if (y === null) return -1; // 位置未設定は末尾
        return x - y || tie(a, b);
      };
      break;
    }
    case 'created':
    default:
      cmp = tie;
  }
  return list.sort(cmp).map((e) => e.s);
}

/** 絞り込み+並び替え */
export function applyFilter(shops, st, opt = {}) {
  const s = st || defaultFilterState();
  return sortShops(filterShops(shops, s, opt), s.sort, opt);
}

/** 適用中の S-03 条件数(カテゴリ・検索語・並び順を除く) */
export function countActiveConditions(st) {
  if (!st) return 0;
  return (st.scenes?.length || 0) + (st.timings?.length || 0) + (st.budgets?.length || 0)
    + (st.minRating ? 1 : 0) + (st.features?.length || 0) + (st.people?.length || 0);
}

/**
 * 適用中条件バー用のチップ定義(表示順:シーン→タイミング→予算→おすすめ度→設備→記録した人)
 * @returns {Array<{group:string, value:any, label:string}>}
 */
export function describeActiveConditions(st) {
  if (!st) return [];
  const out = [];
  const add = (group, defs, values) => {
    for (const d of defs) if (values.includes(d.key)) out.push({ group, value: d.key, label: d.label });
  };
  add('scenes', SCENES, st.scenes || []);
  add('timings', TIMINGS, st.timings || []);
  add('budgets', BUDGETS, st.budgets || []);
  if (st.minRating) {
    const r = MIN_RATINGS.find((x) => x.key === st.minRating);
    if (r) out.push({ group: 'minRating', value: r.key, label: r.label });
  }
  add('features', FEATURES, st.features || []);
  for (const p of st.people || []) out.push({ group: 'people', value: p, label: `${p}さん` });
  return out;
}

/** 条件チップ1つを解除した新しい filterState */
export function removeCondition(st, group, value) {
  const n = { ...st };
  if (group === 'minRating') n.minRating = 0;
  else if (Array.isArray(n[group])) n[group] = n[group].filter((x) => x !== value);
  return n;
}

/** S-03 条件のみ解除(カテゴリ・検索語・並び順は残す) */
export function clearConditions(st) {
  return { ...st, scenes: [], timings: [], budgets: [], minRating: 0, features: [], people: [] };
}

/** 空状態の[条件をクリア]:カテゴリ・検索語・S-03条件を解除(並び順は維持) */
export function clearAll(st) {
  return { ...clearConditions(st), category: 'all', keyword: '' };
}

/** 「記録した人」の選択肢:全店の createdBy ∪ visitorSet を五十音順 */
export function collectPeople(shops) {
  const set = new Set();
  for (const s of Array.isArray(shops) ? shops : []) {
    if (s && typeof s.createdBy === 'string' && s.createdBy) set.add(s.createdBy);
    if (s && Array.isArray(s.visitorSet)) s.visitorSet.forEach((v) => typeof v === 'string' && v && set.add(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
}

// ---------------------------------------------------------------------
// 重複候補(F-15)
// ---------------------------------------------------------------------

/**
 * 同名(正規化後の完全一致)または半径 radius m 以内の既存店を返す(最大 limit 件)。
 * @param {Array} shops
 * @param {{name?:string, lat?:number|null, lng?:number|null, excludeId?:string}} input
 * @param {{radius?:number, limit?:number}} [opt]
 * @returns {Array<{shop:object, distance:(number|null), sameName:boolean}>}
 */
export function findDuplicates(shops, input, opt = {}) {
  const radius = opt.radius ?? 50;
  const limit = opt.limit ?? 3;
  const inp = input || {};
  const name = normalizeName(inp.name);
  const hasPos = typeof inp.lat === 'number' && typeof inp.lng === 'number';
  const out = [];
  for (const s of Array.isArray(shops) ? shops : []) {
    if (!s || (inp.excludeId && s.id === inp.excludeId)) continue;
    const sameName = !!name && normalizeName(s.name) === name;
    const d = hasPos && hasLocation(s) ? distanceMeters(inp.lat, inp.lng, s.lat, s.lng) : null;
    const near = d !== null && d <= radius;
    if (sameName || near) out.push({ shop: s, distance: d, sameName });
  }
  out.sort((a, b) => {
    if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
    if (a.distance !== null) return -1;
    if (b.distance !== null) return 1;
    return 0;
  });
  return out.slice(0, limit);
}
