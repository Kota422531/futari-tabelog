// =====================================================================
// geo.js ― 現在地取得、住所・店名検索(国土地理院/OSM Nominatim/ホットペッパー)、逆ジオコーディング、Leaflet の読み込み
//   Nominatim 利用規約:1秒1リクエスト以下、検索はボタン押下時のみ、accept-language=ja
// =====================================================================

// ---------------------------------------------------------------------
// 現在地
// ---------------------------------------------------------------------
/** 位置情報エラーをトースト文言IDに */
export function geoErrorMessage(err) {
  if (!err) return '現在地を取得できませんでした。電波の良い場所で再度お試しください';
  if (err.code === 'unsupported') return 'この端末では現在地を利用できません';
  if (err.code === 1) return '位置情報の利用が許可されていません。端末の設定でブラウザの位置情報を許可してください';
  return '現在地を取得できませんでした。電波の良い場所で再度お試しください';
}

/** @returns {Promise<{lat:number, lng:number, accuracy:number}>} */
export function getCurrentPosition(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject({ code: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: opts.timeout || 15000, maximumAge: opts.maximumAge ?? 30000 },
    );
  });
}

// ---------------------------------------------------------------------
// Nominatim(グローバルに 1 秒 1 リクエスト以下に直列化)
// ---------------------------------------------------------------------
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let lastRequestAt = 0;
let chain = Promise.resolve();

function throttled(fn) {
  const run = chain.then(async () => {
    const wait = lastRequestAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 日本の住所表示用に Nominatim の address を組み立て */
export function formatJpAddress(addr, fallback = '') {
  if (!addr) return fallback;
  const parts = [
    addr.province || addr.state,
    addr.city || addr.town || addr.village || addr.county,
    addr.city_district || addr.suburb,
    addr.quarter || addr.neighbourhood,
    addr.road,
    addr.house_number,
  ].filter((x) => typeof x === 'string' && x);
  const dedup = parts.filter((p, i) => parts.indexOf(p) === i);
  const s = dedup.join('');
  return s || fallback;
}

/** display_name(「番地, 町, 市, 県, 郵便番号, 日本」)を日本式の順に並べ直す簡易版 */
function reorderDisplayName(name) {
  if (typeof name !== 'string') return '';
  const parts = name.split(',').map((s) => s.trim()).filter(Boolean)
    .filter((p) => p !== '日本' && !/^\d{3}-?\d{4}$/.test(p));
  return parts.reverse().join('');
}

// ---------------------------------------------------------------------
// 国土地理院 住所検索(無料・キー不要・日本の住所に強い)
// ---------------------------------------------------------------------
const GSI_ADDRESS = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

/** 住所らしい入力か(都道府県・市区町村・丁目・番地・「1-2-3」・郵便番号) */
export function looksLikeAddress(q) {
  const t = String(q || '').normalize('NFKC');
  return /丁目|番地|\d+\s*[-ー−‐]\s*\d+|〒|^\d{3}-?\d{4}|(東京都|北海道|大阪府|京都府|.{2,3}県)|(市|郡).*?(区|町|村)|.区.+?(町|\d)/.test(t);
}

/** 店名検索用のゆるい言い換え(支店名・括弧・空白の除去) */
export function nameQueryVariants(q) {
  const t = String(q || '').normalize('NFKC').trim();
  const out = [];
  const push = (x) => { x = x.replace(/\s+/g, ' ').trim(); if (x && x !== t && !out.includes(x)) out.push(x); };
  const noParen = t.replace(/[(（\[【「].*?[)）\]】」]/g, ' ');
  push(noParen);
  // 「〇〇店」「本店」などの支店名トークンを除く
  push(noParen.split(/\s+/).filter((w) => !/^.+店$|^本店$|^支店$/.test(w)).join(' '));
  // 末尾の「〇〇店」を除く(空白なしの場合)
  push(noParen.replace(/\S+?(駅前|駅東口|駅西口|駅南口|駅北口|駅)?店$/, (m) => (m.length < noParen.length ? '' : m)));
  push(t.replace(/\s+/g, ''));
  return out.slice(0, 2);
}

export async function searchAddressGsi(q) {
  const res = await fetch(`${GSI_ADDRESS}?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = await res.json();
  return (Array.isArray(list) ? list : []).slice(0, 8).map((f) => ({
    name: f.properties && f.properties.title ? f.properties.title : '',
    address: f.properties && f.properties.title ? f.properties.title : '',
    lat: f.geometry && f.geometry.coordinates ? Number(f.geometry.coordinates[1]) : NaN,
    lng: f.geometry && f.geometry.coordinates ? Number(f.geometry.coordinates[0]) : NaN,
    kind: 'address', source: 'gsi',
  })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

function nominatimSearch(q, opts = {}) {
  return throttled(async () => {
    const p = new URLSearchParams({
      q, format: 'jsonv2', addressdetails: '1', limit: '10', 'accept-language': 'ja', countrycodes: 'jp',
    });
    if (opts.viewbox) p.set('viewbox', opts.viewbox);
    const list = await getJson(`${NOMINATIM}/search?${p}`);
    return (Array.isArray(list) ? list : []).map((r) => {
      const isPoi = ['amenity', 'shop', 'tourism', 'leisure', 'craft'].includes(r.category);
      return {
        name: r.name || (r.display_name || '').split(',')[0] || '',
        address: formatJpAddress(r.address, reorderDisplayName(r.display_name)),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        kind: isPoi ? 'shop' : 'place', source: 'osm',
      };
    }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  });
}

// ---------------------------------------------------------------------
// ホットペッパーグルメ Webサービス(任意:firebase-config.js に API キーがある時だけ使う)
//   CORS 非対応のため JSONP で呼ぶ
// ---------------------------------------------------------------------
let jsonpSeq = 0;
function jsonp(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cb = `__ftJsonp${Date.now()}_${++jsonpSeq}`;
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); clearTimeout(timer); };
    const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, timeoutMs);
    window[cb] = (data) => { done(); resolve(data); };
    s.src = `${url}&callback=${cb}`;
    s.onerror = () => { done(); reject(new Error('jsonp failed')); };
    document.head.append(s);
  });
}

export async function searchHotpepper(q, key, opts = {}) {
  const p = new URLSearchParams({ key, keyword: q, format: 'jsonp', count: '10' });
  if (opts.near) { p.set('lat', String(opts.near.lat)); p.set('lng', String(opts.near.lng)); p.set('range', '5'); }
  const data = await jsonp(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${p}`);
  const shops = data && data.results && Array.isArray(data.results.shop) ? data.results.shop : [];
  return shops.map((r) => ({
    name: r.name || '', address: r.address || '',
    lat: Number(r.lat), lng: Number(r.lng),
    kind: 'shop', source: 'hotpepper',
    genre: r.genre && r.genre.name ? r.genre.name : '',
    url: r.urls && r.urls.pc ? r.urls.pc : '',
  })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((r) => {
    const k = `${r.name}|${r.lat.toFixed(4)}|${r.lng.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 住所・店名検索
 *   住所 → 国土地理院、店名 → (ホットペッパー)+ OpenStreetMap を並行で引き、結果をまとめる
 * @param {string} q
 * @param {{viewbox?:string, near?:{lat:number,lng:number}, hotpepperKey?:string}} opts
 * @returns {Promise<Array<{name:string, address:string, lat:number, lng:number, kind:'shop'|'address'|'place', source:string, genre?:string, url?:string}>>}
 */
export async function searchPlaces(q, opts = {}) {
  const addrLike = looksLikeAddress(q);
  const safe = (p) => p.then((x) => ({ ok: true, list: x }), () => ({ ok: false, list: [] }));
  const gsiP = safe(searchAddressGsi(q));
  const hpP = opts.hotpepperKey ? safe(searchHotpepper(q, opts.hotpepperKey, opts)) : Promise.resolve({ ok: false, list: [] });
  const osmP = safe((async () => {
    let list = await nominatimSearch(q, opts);
    if (!addrLike && !list.some((r) => r.kind === 'shop')) {
      for (const alt of nameQueryVariants(q)) {
        const more = await nominatimSearch(alt, opts);
        list = list.concat(more);
        if (more.some((r) => r.kind === 'shop')) break;
      }
    }
    return list;
  })());
  const [gsi, hp, osm] = await Promise.all([gsiP, hpP, osmP]);
  if (!gsi.ok && !hp.ok && !osm.ok) throw new Error('search failed');
  const osmShops = osm.list.filter((r) => r.kind === 'shop');
  const osmPlaces = osm.list.filter((r) => r.kind !== 'shop');
  const ordered = addrLike
    ? [...gsi.list, ...hp.list, ...osmShops, ...osmPlaces]
    : [...hp.list, ...osmShops, ...gsi.list, ...osmPlaces];
  return dedupe(ordered).slice(0, 15);
}

/** 逆ジオコーディング → 住所文字列(失敗時は例外) */
export function reverseGeocode(lat, lng) {
  return throttled(async () => {
    const p = new URLSearchParams({
      lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', zoom: '18', 'accept-language': 'ja',
    });
    const r = await getJson(`${NOMINATIM}/reverse?${p}`);
    if (!r || r.error) throw new Error(r && r.error ? r.error : 'not found');
    return formatJpAddress(r.address, reorderDisplayName(r.display_name)).slice(0, 120);
  });
}

// ---------------------------------------------------------------------
// Leaflet(必要になった時に読み込む)
//   1) unpkg の CDN
//   2) CDN に届かない場合は同梱版 ./vendor/leaflet/(tools/vendor-leaflet.sh で配置した時のみ)
// ---------------------------------------------------------------------
const LEAFLET_VER = '1.9.4';
export const LEAFLET_SOURCES = Object.freeze([
  `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/`,
  new URL('../vendor/leaflet/', import.meta.url).href,
]);
let leafletPromise = null;

function loadCss(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.leaflet = '1';
  // アプリの CSS(.leaflet-* の上書き)より前に入れて、詳細度が同じ規則はアプリ側を優先させる
  const first = document.querySelector('link[rel="stylesheet"]');
  if (first) first.before(link); else document.head.append(link);
  return link;
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(s);
    s.onerror = () => { s.remove(); reject(new Error(`Leaflet load failed: ${src}`)); };
    document.head.append(s);
  });
}

export function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = (async () => {
      let lastErr = null;
      for (const base of LEAFLET_SOURCES) {
        const link = loadCss(`${base}leaflet.css`);
        try {
          await loadScript(`${base}leaflet.js`);
          if (window.L && window.L.map) return window.L;
          lastErr = new Error('Leaflet not available');
        } catch (e) {
          lastErr = e;
        }
        link.remove();
      }
      throw lastErr;
    })();
    leafletPromise.catch(() => { leafletPromise = null; });
  }
  return leafletPromise;
}

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/** 日本全体(仙台・東京を含む既定範囲) */
export const JAPAN_BOUNDS = [[30.5, 129.5], [43.0, 146.0]];
export const JAPAN_CENTER = [37.0, 139.5];

/** タイルレイヤーを追加(読み込み失敗を onError で通知) */
export function addOsmLayer(L, map, onError) {
  const layer = L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION });
  let errors = 0, loaded = 0;
  layer.on('tileerror', () => { errors += 1; if (errors >= 4 && loaded === 0 && onError) onError(); });
  layer.on('tileload', () => { loaded += 1; });
  layer.addTo(map);
  map.attributionControl.setPrefix(false);
  return layer;
}

/** 外部地図アプリの URL */
export function directionsUrls(lat, lng, name) {
  const ll = `${lat},${lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(ll)}&q=${encodeURIComponent(name || '')}`,
  };
}

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
