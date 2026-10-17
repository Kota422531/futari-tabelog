// =====================================================================
// schema.js ― ふたりの食べログ データ定義(依存なし・ブラウザ/Node両対応の ES module)
//   設計書 : docs/04_database.md
//   ルール : app/firestore.rules と制約を必ず同期させること
// =====================================================================

// ---------------------------------------------------------------------
// enum 定義(保存は英語キー、表示はラベル)
// ---------------------------------------------------------------------
export const CATEGORIES = Object.freeze([
  { key: 'restaurant', label: 'レストラン・食堂', emoji: '🍽️' },
  { key: 'izakaya',    label: '居酒屋・飲み屋',   emoji: '🍺' },
  { key: 'bar',        label: 'バー',             emoji: '🍸' },
  { key: 'cafe',       label: 'カフェ',           emoji: '☕' },
  { key: 'ramen',      label: 'ラーメン・麺類',   emoji: '🍜' },
  { key: 'yakiniku',   label: '焼肉・ホルモン',   emoji: '🥩' },
  { key: 'washoku',    label: '寿司・和食',       emoji: '🍣' },
  { key: 'sweets',     label: 'スイーツ・パン',   emoji: '🍰' },
  { key: 'other',      label: 'その他',           emoji: '📍' },
]);

export const TIMINGS = Object.freeze([
  { key: 'morning', label: 'モーニング' },
  { key: 'lunch',   label: 'ランチ' },
  { key: 'cafe',    label: 'カフェタイム' },
  { key: 'dinner',  label: 'ディナー' },
  { key: 'late',    label: '二次会・深夜' },
]);

// min/max は 1人あたり円(max=null は上限なし)。絞り込み・実費からの推定に利用可
export const BUDGETS = Object.freeze([
  { key: 'b1', label: '〜1,000円',        min: 0,     max: 1000 },
  { key: 'b2', label: '1,000〜2,000円',   min: 1000,  max: 2000 },
  { key: 'b3', label: '2,000〜3,000円',   min: 2000,  max: 3000 },
  { key: 'b4', label: '3,000〜5,000円',   min: 3000,  max: 5000 },
  { key: 'b5', label: '5,000〜8,000円',   min: 5000,  max: 8000 },
  { key: 'b6', label: '8,000〜10,000円',  min: 8000,  max: 10000 },
  { key: 'b7', label: '10,000円〜',       min: 10000, max: null },
]);

export const SCENES = Object.freeze([
  { key: 'settai',      label: '接待' },
  { key: 'kaishoku',    label: '会食・打合せ' },
  { key: 'nomikai',     label: '飲み会' },
  { key: 'date',        label: 'デート' },
  { key: 'solo',        label: '一人' },
  { key: 'family',      label: '家族' },
  { key: 'friends',     label: '友人' },
  { key: 'joshikai',    label: '女子会' },
  { key: 'anniversary', label: '記念日' },
  { key: 'sobetsu',     label: '歓送迎会' },
  { key: 'other',       label: 'その他' },
]);

export const MOOD_TAGS = Object.freeze([
  { key: 'calm',    label: '落ち着いた' },
  { key: 'casual',  label: 'カジュアル' },
  { key: 'stylish', label: 'おしゃれ' },
  { key: 'luxury',  label: '高級感' },
  { key: 'homey',   label: 'アットホーム' },
  { key: 'lively',  label: '活気がある' },
  { key: 'view',    label: '夜景・眺望' },
]);

export const RESERVATION = Object.freeze([
  { key: 'required',    label: '予約必須' },
  { key: 'recommended', label: '予約推奨' },
  { key: 'notneeded',   label: '予約不要' },
  { key: 'unavailable', label: '予約不可' },
  { key: 'unknown',     label: '不明' },
]);

export const PRIVATE_ROOM = Object.freeze([
  { key: 'yes',     label: '個室あり' },
  { key: 'semi',    label: '半個室あり' },
  { key: 'no',      label: 'なし' },
  { key: 'unknown', label: '不明' },
]);

export const SMOKING = Object.freeze([
  { key: 'nonsmoking', label: '全面禁煙' },
  { key: 'separated',  label: '分煙' },
  { key: 'allowed',    label: '喫煙可' },
  { key: 'unknown',    label: '不明' },
]);

export const PARKING = Object.freeze([
  { key: 'yes',     label: 'あり' },
  { key: 'nearby',  label: 'なし(近隣コインPあり)' },
  { key: 'no',      label: 'なし' },
  { key: 'unknown', label: '不明' },
]);

export const CASHLESS = Object.freeze([
  { key: 'yes',      label: '可' },
  { key: 'partial',  label: '一部可' },
  { key: 'cashonly', label: '現金のみ' },
  { key: 'unknown',  label: '不明' },
]);

export const KIDS_OK = Object.freeze([
  { key: 'yes',     label: '可' },
  { key: 'no',      label: '不可' },
  { key: 'unknown', label: '不明' },
]);

// 賑やかさ(noiseLevel 1〜5)
export const NOISE_LEVELS = Object.freeze([
  { key: 1, label: '静か' },
  { key: 2, label: 'やや静か' },
  { key: 3, label: '普通' },
  { key: 4, label: 'やや賑やか' },
  { key: 5, label: 'とても賑やか' },
]);

// ---------------------------------------------------------------------
// 制約値(firestore.rules と同値)
// ---------------------------------------------------------------------
export const LIMITS = Object.freeze({
  GROUP_ID_RE: /^[A-Za-z0-9_-]{20,64}$/,
  NICKNAME_MAX: 20,
  SHOP_NAME_MAX: 60,
  GENRE_MAX: 30,
  ADDRESS_MAX: 120,
  AREA_MAX: 30,
  URL_MAX: 300,
  NOTE_MAX: 500,
  PEOPLE_MIN: 1, PEOPLE_MAX: 50,
  PRICE_MAX: 1000000,
  MENUS_MAX: 20, MENU_NAME_MAX: 40,
  TASTE_COMMENT_MAX: 1000,
  MOOD_COMMENT_MAX: 500,
  THUMBS_MAX: 4,
  THUMB_LEN_MAX: 45000,     // サムネイル data URL の文字数上限
  PHOTO_LEN_MAX: 760000,    // 写真本体 data URL の文字数上限
  PHOTO_DIM_MAX: 4096,
  MENUS_TEXT_MAX: 10000,
  JPEG_PREFIX: 'data:image/jpeg;base64,',
});

export const DEFAULT_SHOP_ENUMS = Object.freeze({
  reservation: 'unknown', privateRoom: 'unknown', smoking: 'unknown',
  parking: 'unknown', cashless: 'unknown', kidsOk: 'unknown',
});

// ---------------------------------------------------------------------
// キー → ラベル ヘルパー
// ---------------------------------------------------------------------
const keysOf = (defs) => defs.map((d) => d.key);

/** enum 定義配列とキーから表示名を返す(未知キーはキーそのもの、null/undefined は '') */
export function labelOf(defs, key) {
  if (key === null || key === undefined) return '';
  const hit = defs.find((d) => d.key === key);
  return hit ? hit.label : String(key);
}
/** 複数キーを表示名配列に(定義順に並べ替え) */
export function labelsOf(defs, keys) {
  if (!Array.isArray(keys)) return [];
  return defs.filter((d) => keys.includes(d.key)).map((d) => d.label);
}
export function categoryOf(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}
export function isValidGroupId(id) {
  return typeof id === 'string' && LIMITS.GROUP_ID_RE.test(id);
}

// ---------------------------------------------------------------------
// 内部バリデーション部品
// ---------------------------------------------------------------------
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
const isStr = (v) => typeof v === 'string';
const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isRealDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
/** 端末ローカル時刻での今日 YYYY-MM-DD */
export function todayStr(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
function isJpeg(v, maxLen) {
  return isStr(v) && v.length > LIMITS.JPEG_PREFIX.length && v.length <= maxLen
    && v.startsWith(LIMITS.JPEG_PREFIX);
}

function checkStr(errs, o, k, label, min, max, required) {
  if (!has(o, k)) { if (required) errs.push(`${label}を入力してください`); return; }
  const v = o[k];
  if (!isStr(v)) { errs.push(`${label}は文字列で入力してください`); return; }
  if (v.length < min) errs.push(required && min === 1 ? `${label}を入力してください` : `${label}は${min}文字以上で入力してください`);
  if (v.length > max) errs.push(`${label}は${max}文字以内で入力してください(現在${v.length}文字)`);
}
function checkEnum(errs, o, k, label, defs, required, allowNull) {
  if (!has(o, k) || (allowNull && o[k] === null)) {
    if (required) errs.push(`${label}を選択してください`);
    return;
  }
  if (!keysOf(defs).includes(o[k])) errs.push(`${label}の値が不正です`);
}
function checkEnumList(errs, o, k, label, defs) {
  if (!has(o, k)) return;
  const v = o[k];
  if (!Array.isArray(v)) { errs.push(`${label}の形式が不正です`); return; }
  const keys = keysOf(defs);
  if (v.some((x) => !keys.includes(x))) errs.push(`${label}に不正な値が含まれています`);
  if (new Set(v).size !== v.length) errs.push(`${label}に重複があります`);
  if (v.length > defs.length) errs.push(`${label}は${defs.length}件以内で選択してください`);
}
function checkIntOrNull(errs, o, k, label, min, max) {
  if (!has(o, k) || o[k] === null) return;
  const v = o[k];
  if (!isInt(v)) { errs.push(`${label}は整数で入力してください`); return; }
  if (v < min || v > max) errs.push(`${label}は${min.toLocaleString()}〜${max.toLocaleString()}の範囲で入力してください`);
}
function checkNumOrNull(errs, o, k, label, min, max) {
  if (!has(o, k) || o[k] === null) return;
  const v = o[k];
  if (!isNum(v)) { errs.push(`${label}は数値で入力してください`); return; }
  if (v < min || v > max) errs.push(`${label}は${min}〜${max}の範囲で入力してください`);
}
function checkNickname(errs, o, k, label) {
  if (!has(o, k)) return; // createdBy/updatedBy は保存時に付与するため、存在する時のみ検証
  const v = o[k];
  if (!isStr(v) || v.length < 1 || v.length > LIMITS.NICKNAME_MAX) {
    errs.push(`${label}(ニックネーム)は1〜${LIMITS.NICKNAME_MAX}文字にしてください`);
  }
}

const SHOP_INPUT_KEYS = [
  'name', 'category', 'genre', 'address', 'lat', 'lng', 'area', 'url',
  'reservation', 'privateRoom', 'smoking', 'parking', 'cashless', 'kidsOk', 'note',
];
const META_KEYS = ['createdBy', 'createdAt', 'updatedBy', 'updatedAt'];
export const SHOP_AGG_KEYS = Object.freeze([
  'ratingSum', 'ratingCount', 'visitCount', 'lastVisitedOn',
  'sceneSet', 'timingSet', 'budgetSet', 'visitorSet', 'thumb', 'menusText',
]);
export const SHOP_KEYS = Object.freeze([...SHOP_INPUT_KEYS, ...META_KEYS, ...SHOP_AGG_KEYS]);
export const VISIT_KEYS = Object.freeze([
  'visitedOn', 'timing', 'people', 'budget', 'priceActual', 'scenes', 'menus',
  'tasteComment', 'noiseLevel', 'moodTags', 'moodComment', 'rating',
  'thumbs', 'photoCount', ...META_KEYS,
]);
export const PHOTO_KEYS = Object.freeze(['data', 'order', 'width', 'height', 'createdAt']);

function checkUnknownKeys(errs, o, allowed) {
  const extra = Object.keys(o).filter((k) => !allowed.includes(k));
  if (extra.length) errs.push(`保存できない項目が含まれています:${extra.join(', ')}`);
}

// ---------------------------------------------------------------------
// validateShop / validateVisit / validatePhoto
//   戻り値:日本語エラーメッセージの配列(空配列なら OK)
//   createdAt/updatedAt(serverTimestamp)はルール側で検証するためここでは対象外
// ---------------------------------------------------------------------
export function validateShop(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return ['店のデータが不正です'];
  checkUnknownKeys(errs, obj, SHOP_KEYS);

  checkStr(errs, obj, 'name', '店名', 1, LIMITS.SHOP_NAME_MAX, true);
  if (has(obj, 'name') && isStr(obj.name) && obj.name.length > 0 && obj.name.trim() === '') {
    errs.push('店名を入力してください');
  }
  checkEnum(errs, obj, 'category', 'カテゴリ', CATEGORIES, true, false);
  checkStr(errs, obj, 'genre', 'ジャンル', 0, LIMITS.GENRE_MAX, false);
  checkStr(errs, obj, 'address', '住所', 0, LIMITS.ADDRESS_MAX, false);
  checkNumOrNull(errs, obj, 'lat', '緯度', -90, 90);
  checkNumOrNull(errs, obj, 'lng', '経度', -180, 180);
  const latNull = !has(obj, 'lat') || obj.lat === null;
  const lngNull = !has(obj, 'lng') || obj.lng === null;
  if (latNull !== lngNull) errs.push('緯度と経度は両方とも設定してください');
  checkStr(errs, obj, 'area', '最寄り駅・エリア', 0, LIMITS.AREA_MAX, false);

  if (has(obj, 'url') && obj.url !== '') {
    if (!isStr(obj.url) || obj.url.length > LIMITS.URL_MAX) {
      errs.push(`URLは${LIMITS.URL_MAX}文字以内で入力してください`);
    } else if (!/^https?:\/\/\S+$/.test(obj.url)) {
      errs.push('URLは https:// または http:// で始まる形式で入力してください');
    }
  }

  checkEnum(errs, obj, 'reservation', '予約', RESERVATION, false, false);
  checkEnum(errs, obj, 'privateRoom', '個室', PRIVATE_ROOM, false, false);
  checkEnum(errs, obj, 'smoking', '喫煙', SMOKING, false, false);
  checkEnum(errs, obj, 'parking', '駐車場', PARKING, false, false);
  checkEnum(errs, obj, 'cashless', 'カード・電子決済', CASHLESS, false, false);
  checkEnum(errs, obj, 'kidsOk', '子連れ', KIDS_OK, false, false);
  checkStr(errs, obj, 'note', 'その他共有事項', 0, LIMITS.NOTE_MAX, false);
  checkNickname(errs, obj, 'createdBy', '登録者名');
  checkNickname(errs, obj, 'updatedBy', '更新者名');

  // 集計値(通常は computeShopAggregates の結果。型のみ確認)
  for (const k of ['ratingSum', 'ratingCount', 'visitCount']) {
    if (has(obj, k) && !(isInt(obj[k]) && obj[k] >= 0)) errs.push(`集計値 ${k} が不正です`);
  }
  if (has(obj, 'lastVisitedOn') && obj.lastVisitedOn !== null && !isRealDate(obj.lastVisitedOn)) {
    errs.push('集計値 lastVisitedOn が不正です');
  }
  for (const k of ['sceneSet', 'timingSet', 'budgetSet', 'visitorSet']) {
    if (has(obj, k) && !Array.isArray(obj[k])) errs.push(`集計値 ${k} が不正です`);
  }
  if (has(obj, 'thumb') && obj.thumb !== null && !isJpeg(obj.thumb, LIMITS.THUMB_LEN_MAX)) {
    errs.push('代表サムネイルの形式またはサイズが不正です');
  }
  if (has(obj, 'menusText') && !(isStr(obj.menusText) && obj.menusText.length <= LIMITS.MENUS_TEXT_MAX)) {
    errs.push('集計値 menusText が不正です');
  }
  return errs;
}

/**
 * @param {object} obj  訪問データ
 * @param {{today?: string}} [opts]  未来日判定に使う今日(YYYY-MM-DD)。省略時は端末の今日
 */
export function validateVisit(obj, opts = {}) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return ['訪問記録のデータが不正です'];
  checkUnknownKeys(errs, obj, VISIT_KEYS);

  if (!has(obj, 'visitedOn') || obj.visitedOn === '') {
    errs.push('訪問日を入力してください');
  } else if (!isStr(obj.visitedOn) || !isRealDate(obj.visitedOn)) {
    errs.push('訪問日の形式が不正です(YYYY-MM-DD)');
  } else if (obj.visitedOn > (opts.today || todayStr())) {
    errs.push('訪問日に未来の日付は指定できません');
  }
  checkEnum(errs, obj, 'timing', 'タイミング', TIMINGS, true, false);

  if (!has(obj, 'rating') || obj.rating === null) {
    errs.push('おすすめ度を選択してください');
  } else if (!isInt(obj.rating) || obj.rating < 1 || obj.rating > 5) {
    errs.push('おすすめ度は1〜5で選択してください');
  }

  checkIntOrNull(errs, obj, 'people', '人数', LIMITS.PEOPLE_MIN, LIMITS.PEOPLE_MAX);
  checkEnum(errs, obj, 'budget', '予算感', BUDGETS, false, true);
  checkIntOrNull(errs, obj, 'priceActual', '実費', 0, LIMITS.PRICE_MAX);
  checkEnumList(errs, obj, 'scenes', '利用シーン', SCENES);

  if (has(obj, 'menus')) {
    const m = obj.menus;
    if (!Array.isArray(m)) {
      errs.push('食べたメニューの形式が不正です');
    } else {
      if (m.length > LIMITS.MENUS_MAX) errs.push(`食べたメニューは${LIMITS.MENUS_MAX}品以内にしてください`);
      m.forEach((name, i) => {
        if (!isStr(name) || name.length < 1) errs.push(`メニュー${i + 1}品目が空です`);
        else if (name.length > LIMITS.MENU_NAME_MAX) errs.push(`メニュー${i + 1}品目は${LIMITS.MENU_NAME_MAX}文字以内にしてください`);
      });
    }
  }

  checkStr(errs, obj, 'tasteComment', '味の感想', 0, LIMITS.TASTE_COMMENT_MAX, false);
  checkIntOrNull(errs, obj, 'noiseLevel', '賑やかさ', 1, 5);
  checkEnumList(errs, obj, 'moodTags', '雰囲気タグ', MOOD_TAGS);
  checkStr(errs, obj, 'moodComment', '雰囲気の感想', 0, LIMITS.MOOD_COMMENT_MAX, false);

  if (has(obj, 'thumbs')) {
    const t = obj.thumbs;
    if (!Array.isArray(t)) {
      errs.push('写真サムネイルの形式が不正です');
    } else {
      if (t.length > LIMITS.THUMBS_MAX) errs.push(`写真は${LIMITS.THUMBS_MAX}枚までです`);
      if (t.some((s) => !isJpeg(s, LIMITS.THUMB_LEN_MAX))) errs.push('写真サムネイルの形式またはサイズが不正です');
    }
  }
  if (has(obj, 'photoCount') && !(isInt(obj.photoCount) && obj.photoCount >= 0 && obj.photoCount <= LIMITS.THUMBS_MAX)) {
    errs.push(`写真枚数は0〜${LIMITS.THUMBS_MAX}にしてください`);
  }
  checkNickname(errs, obj, 'createdBy', '登録者名');
  checkNickname(errs, obj, 'updatedBy', '更新者名');
  return errs;
}

export function validatePhoto(obj) {
  const errs = [];
  if (!obj || typeof obj !== 'object') return ['写真のデータが不正です'];
  checkUnknownKeys(errs, obj, PHOTO_KEYS);
  if (!isJpeg(obj.data, LIMITS.PHOTO_LEN_MAX)) {
    errs.push(`写真データは JPEG 形式で約${Math.floor(LIMITS.PHOTO_LEN_MAX / 1000)}KB以下にしてください`);
  }
  if (!(isInt(obj.order) && obj.order >= 0 && obj.order <= 3)) errs.push('写真の表示順は0〜3にしてください');
  for (const k of ['width', 'height']) {
    if (!(isInt(obj[k]) && obj[k] >= 1 && obj[k] <= LIMITS.PHOTO_DIM_MAX)) errs.push(`写真の${k === 'width' ? '幅' : '高さ'}が不正です`);
  }
  return errs;
}

// ---------------------------------------------------------------------
// 集計(純関数)
// ---------------------------------------------------------------------

/** Firestore Timestamp / Date / number / 未確定(null)を比較用ミリ秒に変換 */
function toMillis(t) {
  if (t === null || t === undefined) return Number.MAX_SAFE_INTEGER; // 未確定の serverTimestamp=最新扱い
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  return 0;
}

/** 定義順に並べた和集合 */
function orderedUnion(defs, values) {
  const s = new Set(values);
  return keysOf(defs).filter((k) => s.has(k));
}

/**
 * 店の集計値を訪問記録配列から計算する。
 * @param {Array<object>} visits  該当店の全 visit データ(id は不要)
 * @returns {{ratingSum:number, ratingCount:number, visitCount:number, lastVisitedOn:(string|null),
 *            sceneSet:string[], timingSet:string[], budgetSet:string[], visitorSet:string[],
 *            thumb:(string|null), menusText:string}}
 */
export function computeShopAggregates(visits) {
  const list = Array.isArray(visits) ? visits.filter((v) => v && typeof v === 'object') : [];

  let ratingSum = 0;
  let ratingCount = 0;
  let lastVisitedOn = null;
  const scenes = [];
  const timings = [];
  const budgets = [];
  const visitors = new Set();
  const menuSeen = new Set();
  const menuNames = [];

  for (const v of list) {
    if (isInt(v.rating) && v.rating >= 1 && v.rating <= 5) {
      ratingSum += v.rating;
      ratingCount += 1;
    }
    if (isStr(v.visitedOn) && v.visitedOn && (lastVisitedOn === null || v.visitedOn > lastVisitedOn)) {
      lastVisitedOn = v.visitedOn;
    }
    if (Array.isArray(v.scenes)) scenes.push(...v.scenes);
    if (isStr(v.timing)) timings.push(v.timing);
    if (isStr(v.budget)) budgets.push(v.budget);
    if (isStr(v.createdBy) && v.createdBy) visitors.add(v.createdBy);
    if (Array.isArray(v.menus)) {
      for (const m of v.menus) {
        if (!isStr(m)) continue;
        const t = m.trim();
        if (t && !menuSeen.has(t)) { menuSeen.add(t); menuNames.push(t); }
      }
    }
  }

  // 代表サムネイル:写真付き訪問のうち visitedOn 最新(同日なら createdAt 新しい方)の thumbs[0]
  let thumb = null;
  let best = null;
  for (const v of list) {
    if (!Array.isArray(v.thumbs) || v.thumbs.length === 0 || !isStr(v.thumbs[0])) continue;
    const d = isStr(v.visitedOn) ? v.visitedOn : '';
    const c = toMillis(v.createdAt);
    if (best === null || d > best.d || (d === best.d && c > best.c)) {
      best = { d, c };
      thumb = v.thumbs[0];
    }
  }

  // 検索用メニュー連結(重複除去・改行区切り・上限文字数で打ち切り)
  //   メニュー単位で打ち切る(文字単位の slice だと絵文字のサロゲートペアが途中で切れ、
  //   不正な文字列が保存されたり、末尾のメニュー名が中途半端な語で検索に掛かったりするため)
  let menusText = '';
  for (const name of menuNames) {
    const next = menusText ? `${menusText}\n${name}` : name;
    if (next.length > LIMITS.MENUS_TEXT_MAX) break;
    menusText = next;
  }

  return {
    ratingSum,
    ratingCount,
    visitCount: list.length,
    lastVisitedOn,
    sceneSet: orderedUnion(SCENES, scenes),
    timingSet: orderedUnion(TIMINGS, timings),
    budgetSet: orderedUnion(BUDGETS, budgets),
    visitorSet: [...visitors].sort(),
    thumb,
    menusText,
  };
}

/** 平均おすすめ度(小数第1位、件数0なら null) */
export function averageRating(shop) {
  if (!shop || !shop.ratingCount) return null;
  return Math.round((shop.ratingSum / shop.ratingCount) * 10) / 10;
}
