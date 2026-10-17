// =====================================================================
// sw.js ― Service Worker
//   ・アプリシェル(同一オリジンの静的ファイル)は cache-first、バージョン付きキャッシュ名
//   ・同梱 Leaflet(vendor/leaflet/)はアプリシェルと同じキャッシュ(任意ファイル扱い)
//   ・CDN 版 Leaflet(同梱が無い時のフォールバック)/ Google Fonts は stale-while-revalidate で別キャッシュ
//   ・OSM タイルは network-first(オフライン時のみ直近のタイルを表示、件数上限あり)
//   ・Firebase / Nominatim はキャッシュしない(素通し)
//   ※ 静的ファイルを更新したら VERSION を上げること
// =====================================================================
const VERSION = 'v1.3.1';
const PREFIX = 'futari-tabelog-'; // 同一オリジンの他アプリ(家計簿・在庫)のキャッシュと区別
const SHELL = `${PREFIX}shell-${VERSION}`;
const LIBS = `${PREFIX}libs-v1`;
const TILES = `${PREFIX}tiles-v1`;
const TILE_LIMIT = 300;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/schema.js',
  './js/utils.js',
  './js/filter.js',
  './js/store.js',
  './js/store-firestore.js',
  './js/store-local.js',
  './js/firebase-config.js',
  './js/state.js',
  './js/dom.js',
  './js/ui.js',
  './js/components.js',
  './js/images.js',
  './js/geo.js',
  './js/views/setup.js',
  './js/views/list.js',
  './js/views/filter-sheet.js',
  './js/views/map.js',
  './js/views/shop-detail.js',
  './js/views/photo-viewer.js',
  './js/views/location-picker.js',
  './js/views/forms.js',
  './js/views/form-views.js',
  './js/views/settings.js',
];
// 同梱ライブラリ(app/vendor/)。置いていない環境でもインストールが失敗しないよう、1件ずつ任意で取り込む
const OPTIONAL_FILES = [
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then(async (c) => {
      await c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })));
      await Promise.all(OPTIONAL_FILES.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, LIBS, TILES]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Firebase(SDK・Firestore 通信)はキャッシュしない。SDK の JS はブラウザの HTTP キャッシュ、
// データは Firestore SDK 自身の IndexedDB キャッシュ(persistentLocalCache)に任せる。
const isLib = (url) => (url.hostname === 'unpkg.com' && url.pathname.startsWith('/leaflet@'))
  || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
const isTile = (url) => url.hostname === 'tile.openstreetmap.org';

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 同一オリジン:アプリシェル cache-first
  if (url.origin === self.location.origin) {
    // スコープ外(同じ github.io の別アプリ)には関与しない
    if (!url.href.startsWith(self.registration.scope)) return;
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      if (req.mode === 'navigate') {
        const hit = await cache.match('./index.html');
        if (hit) return hit;
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (e) {
        if (req.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw e;
      }
    })());
    return;
  }

  // ライブラリ・フォント:stale-while-revalidate
  if (isLib(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(LIBS);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })());
    return;
  }

  // 地図タイル:network-first(オフライン時のみキャッシュ)
  if (isTile(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES);
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req, res.clone()).then(() => trimCache(TILES, TILE_LIMIT));
        }
        return res;
      } catch (e) {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw e;
      }
    })());
  }
  // それ以外(Firebase / Nominatim 等)は何もしない=ブラウザ既定のネットワーク
});
