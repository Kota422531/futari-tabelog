// =====================================================================
// utils.js ― DOM に依存しない純関数ユーティリティ(ブラウザ/Node 両対応)
//   日付・時刻、画像サイズ計算、距離、合言葉、URL など
// =====================================================================

// ---------------------------------------------------------------------
// アプリ共通定数
// ---------------------------------------------------------------------
export const APP_VERSION = '1.0.0';
export const LS_PREFIX = 'futari-tabelog.'; // 同一オリジン(<user>.github.io)の他アプリと衝突しないよう接頭辞を付ける

/** カテゴリ短縮名(チップ・カード用。アクセシブル名は正式名称) */
export const CATEGORY_SHORT = Object.freeze({
  restaurant: 'レストラン', izakaya: '居酒屋', bar: 'バー', cafe: 'カフェ', ramen: 'ラーメン',
  yakiniku: '焼肉', washoku: '寿司・和食', sweets: 'スイーツ', other: 'その他',
});

/** タイミングのセグメント表示ラベル(短縮) */
export const TIMING_SHORT = Object.freeze({
  morning: 'モーニング', lunch: 'ランチ', cafe: 'カフェ', dinner: 'ディナー', late: '二次会',
});

/** おすすめ度の文言(入力時) */
export const RATING_WORDS = Object.freeze({
  1: 'いまいち', 2: 'まあまあ', 3: '良い', 4: 'とても良い', 5: '最高・また行きたい',
});

/** 賑やかさの文言(入力時の詳しい表現) */
export const NOISE_WORDS = Object.freeze({
  1: '静か・落ち着いて話せる', 2: 'やや静か', 3: '普通', 4: 'やや賑やか', 5: 'とても賑やか',
});

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const pad2 = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------
// 日付・時刻
// ---------------------------------------------------------------------

/** Date → 端末ローカルの YYYY-MM-DD */
export function ymd(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** YYYY-MM-DD を {y,m,d} に。不正なら null */
export function parseYmd(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d, weekday: dt.getDay() };
}

/**
 * 一覧・カード用の日付表示。
 *   当年:  10/12(日)   当年以外: 2025/10/12
 * @param {string} s YYYY-MM-DD
 * @param {{now?:Date, weekday?:boolean}} [opts]
 */
export function formatShortDate(s, opts = {}) {
  const p = parseYmd(s);
  if (!p) return '';
  const now = opts.now || new Date();
  if (p.y !== now.getFullYear()) return `${p.y}/${p.m}/${p.d}`;
  const wd = opts.weekday === false ? '' : `(${WEEKDAYS[p.weekday]})`;
  return `${p.m}/${p.d}${wd}`;
}

/** M/D(ダイアログ文言用) */
export function formatMonthDay(s) {
  const p = parseYmd(s);
  return p ? `${p.m}/${p.d}` : '';
}

/** ミリ秒 → 2026/10/12 21:30 */
export function formatDateTime(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** ミリ秒 → 2026/10/12 */
export function formatDate(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/**
 * 時刻からタイミングを推定する(02_ui §2.6)
 *   5:00〜10:29 モーニング / 10:30〜14:29 ランチ / 14:30〜16:59 カフェタイム
 *   17:00〜21:29 ディナー / 21:30〜4:59 二次会・深夜
 */
export function timingForTime(date = new Date()) {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= 5 * 60 && m < 10 * 60 + 30) return 'morning';
  if (m >= 10 * 60 + 30 && m < 14 * 60 + 30) return 'lunch';
  if (m >= 14 * 60 + 30 && m < 17 * 60) return 'cafe';
  if (m >= 17 * 60 && m < 21 * 60 + 30) return 'dinner';
  return 'late';
}

/** Firestore Timestamp / Date / number / {seconds} → ミリ秒(不明は null) */
export function toMillis(t) {
  if (t === null || t === undefined) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  return null;
}

// ---------------------------------------------------------------------
// 画像サイズ計算
// ---------------------------------------------------------------------

/**
 * 長辺を maxLong に合わせた幅・高さ(拡大はしない、整数・最小1)
 * @returns {{width:number, height:number, scale:number}}
 */
export function fitSize(width, height, maxLong) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const long = Math.max(w, h);
  if (!(maxLong > 0) || long <= maxLong) return { width: w, height: h, scale: 1 };
  const scale = maxLong / long;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/**
 * 圧縮の試行列(長辺・品質)。先頭から順に試し、上限文字数以下になった時点で採用する。
 * @param {number} maxLong 初期の長辺
 * @param {number} quality 初期品質
 * @param {{minLong?:number, minQuality?:number, longStep?:number, qualityStep?:number}} [o]
 * @returns {Array<{maxLong:number, quality:number}>}
 */
export function compressionAttempts(maxLong, quality, o = {}) {
  const minLong = o.minLong ?? Math.round(maxLong * 0.5);
  const minQ = o.minQuality ?? 0.4;
  const qStep = o.qualityStep ?? 0.1;
  const longStep = o.longStep ?? 0.8;
  const list = [];
  let long = maxLong;
  let startQ = quality;
  for (let guard = 0; guard < 20 && long >= minLong; guard++) {
    for (let q = startQ; q >= minQ - 1e-9; q -= qStep) {
      list.push({ maxLong: Math.round(long), quality: Math.round(q * 100) / 100 });
    }
    long = Math.round(long * longStep);
    startQ = Math.max(minQ, quality - qStep); // 縮小後は1段低い品質から
  }
  if (!list.length) list.push({ maxLong, quality });
  return list;
}

/** data URL の base64 部分から元のバイト数を概算 */
export function base64Bytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

// ---------------------------------------------------------------------
// 距離
// ---------------------------------------------------------------------

/** 2点間の距離(メートル、Haversine) */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const R = 6371008.8;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 約350m / 約1.2km / 約12km */
export function formatDistance(m) {
  if (typeof m !== 'number' || !Number.isFinite(m)) return '';
  // 丸めた結果で単位を決める(995m→「約1.0km」、9,950m→「約10km」。「約1000m」「約10.0km」にしない)
  if (Math.round(m / 10) * 10 < 1000) return `約${Math.max(10, Math.round(m / 10) * 10)}m`;
  if (Math.round(m / 100) < 100) return `約${(Math.round(m / 100) / 10).toFixed(1)}km`;
  return `約${Math.round(m / 1000)}km`;
}

export function hasLocation(shop) {
  return !!shop && typeof shop.lat === 'number' && typeof shop.lng === 'number'
    && Number.isFinite(shop.lat) && Number.isFinite(shop.lng);
}

// ---------------------------------------------------------------------
// 合言葉(グループID)
// ---------------------------------------------------------------------
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 暗号論的乱数で英数字の合言葉を生成(既定24文字)。
 * 剰余の偏りを避けるため棄却サンプリングする。
 * @param {number} [len]
 * @param {(arr:Uint8Array)=>Uint8Array} [getRandomValues] テスト用に差し替え可
 */
export function generateGroupId(len = 24, getRandomValues) {
  const grv = getRandomValues || ((a) => globalThis.crypto.getRandomValues(a));
  const n = ID_CHARS.length; // 62
  const limit = 256 - (256 % n); // 248
  let out = '';
  while (out.length < len) {
    const buf = grv(new Uint8Array(len * 2));
    for (const b of buf) {
      if (b < limit) out += ID_CHARS[b % n];
      if (out.length >= len) break;
    }
  }
  return out;
}

/**
 * 入力から合言葉を取り出す。共有URLを丸ごと貼った場合は g= の値を抽出。前後空白は除去。
 */
export function extractGroupId(input) {
  if (typeof input !== 'string') return '';
  let s = input.trim();
  const m = /[?&#]g=([^&#\s]+)/.exec(s);
  if (m) {
    try { s = decodeURIComponent(m[1]); } catch { s = m[1]; }
  }
  return s.trim();
}

/** 共有URL(現在のページのオリジン+パス+?g=) */
export function buildShareUrl(href, groupId) {
  const u = new URL(href);
  return `${u.origin}${u.pathname}?g=${encodeURIComponent(groupId)}`;
}

// ---------------------------------------------------------------------
// 文字列・URL・数値
// ---------------------------------------------------------------------

/** http(s) の URL のみ true(javascript: 等を拒否) */
export function isHttpUrl(s) {
  if (typeof s !== 'string' || !/^https?:\/\/\S+$/i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** URL 表示用(ホスト名) */
export function urlHost(s) {
  try { return new URL(s).host; } catch { return ''; }
}

/** 3桁カンマ区切り */
export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return n.toLocaleString('ja-JP');
}

/** "4,500" / "4500円" などから整数を取り出す。空なら null、不正なら NaN */
export function parseIntLoose(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).normalize('NFKC').replace(/[,\s円]/g, '');
  if (t === '') return null;
  if (!/^-?\d+$/.test(t)) return NaN;
  return parseInt(t, 10);
}

/** 平均おすすめ度の表示(★4.3 の数値部分)。未評価は null */
export function formatAverage(sum, count) {
  if (!count) return null;
  return (Math.round((sum / count) * 10) / 10).toFixed(1);
}

/** 指定ミリ秒以内の連続呼び出しをまとめる */
export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** CSV の1セルをエスケープ */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(' / ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
