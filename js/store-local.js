// =====================================================================
// store-local.js ― デモモード用ストア(この端末のみに保存)
//   ・店・訪問記録:localStorage(グループIDごとに1キー、JSON)
//   ・写真本体    :IndexedDB(容量が大きいため。使えない環境ではメモリのみ)
//   ・store-firestore.js と同じインターフェース・同じ集計ロジック
//   ・他タブでの変更は storage イベントで反映
// =====================================================================
import { computeShopAggregates, DEFAULT_SHOP_ENUMS } from './schema.js';
import { LS_PREFIX } from './utils.js';
import { photoFields, photoPlanUnchanged, sortVisits, stripForExport } from './store.js';

const IDB_NAME = `${LS_PREFIX}demo-photos`;
const IDB_STORE = 'photos';

function randomId(len = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of buf) s += chars[b % chars.length];
  return s;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------
// 写真本体(IndexedDB)
// ---------------------------------------------------------------------
function openIdb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function makePhotoStore() {
  const mem = new Map();
  const dbP = openIdb();
  const tx = async (mode, fn) => {
    const db = await dbP;
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const t = db.transaction(IDB_STORE, mode);
      const st = t.objectStore(IDB_STORE);
      const out = fn(st);
      // fn が IDBRequest を返した場合はその result(キーが無ければ undefined)を返す。
      // 以前は result が undefined のとき IDBRequest 自体を返しており、欠けた写真が {order} だけの要素になっていた
      t.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    async put(key, val) {
      const db = await dbP;
      if (!db) { mem.set(key, val); return; }
      await tx('readwrite', (st) => { st.put(val, key); });
    },
    async get(key) {
      const db = await dbP;
      if (!db) return mem.get(key) || null;
      const r = await tx('readonly', (st) => st.get(key));
      return r || null;
    },
    async del(key) {
      const db = await dbP;
      if (!db) { mem.delete(key); return; }
      await tx('readwrite', (st) => { st.delete(key); });
    },
  };
}

// ---------------------------------------------------------------------
// ストア本体
// ---------------------------------------------------------------------
export function createLocalStore({ groupId, getNickname }) {
  const KEY = `${LS_PREFIX}demo-data.${groupId}`;
  const photos = makePhotoStore();
  const nick = () => String(getNickname() || '').slice(0, 20);
  const shopSubs = new Set();
  const visitSubs = new Set(); // {shopId, cb}

  /** @returns {{shops:Object<string,object>, visits:Object<string,Object<string,object>>}} */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') return { shops: d.shops || {}, visits: d.visits || {} };
      }
    } catch { /* 壊れていたら空から */ }
    return { shops: {}, visits: {} };
  }
  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      const err = new Error('この端末の保存容量が不足しています(デモモード)');
      err.code = 'local-quota';
      err.cause = e;
      throw err;
    }
    emit();
  }

  function shopsArray(data = load()) {
    return Object.entries(data.shops).map(([id, s]) => ({ ...clone(s), id }));
  }
  function visitsArray(shopId, data = load()) {
    const vs = data.visits[shopId] || {};
    return sortVisits(Object.entries(vs).map(([id, v]) => ({ ...clone(v), id })));
  }

  // 通知は非同期にまとめて行う(Firestore の onSnapshot と同様。購読者内からの書き込みで再入しない)
  let emitScheduled = false;
  function emit() {
    if (emitScheduled) return;
    emitScheduled = true;
    setTimeout(() => { emitScheduled = false; emitNow(); }, 0);
  }
  function emitNow() {
    const data = load();
    const shops = shopsArray(data);
    shopSubs.forEach((cb) => { try { cb(shops, { fromCache: false }); } catch (e) { console.error(e); } });
    visitSubs.forEach((s) => { try { s.cb(visitsArray(s.shopId, data), { fromCache: false }); } catch (e) { console.error(e); } });
  }

  const onStorage = (e) => { if (e.key === KEY) emit(); };
  window.addEventListener('storage', onStorage);

  function recalcInData(data, shopId) {
    const shop = data.shops[shopId];
    if (!shop) return;
    const vs = Object.values(data.visits[shopId] || {});
    Object.assign(shop, computeShopAggregates(vs)); // updatedAt/updatedBy は据え置き
  }

  const photoKey = (shopId, visitId, order) => `${groupId}/${shopId}/${visitId}/${order}`;

  async function putPhotos(shopId, visitId, list, startOrder = 0) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      await photos.put(photoKey(shopId, visitId, startOrder + i), { data: p.data, width: p.width, height: p.height });
    }
  }
  async function deletePhotos(shopId, visitId, count = 4) {
    for (let i = 0; i < Math.max(4, count); i++) await photos.del(photoKey(shopId, visitId, i));
  }

  const api = {
    mode: 'demo',

    subscribeShops(cb) {
      shopSubs.add(cb);
      // Firestore と同様に非同期で初回通知
      setTimeout(() => shopSubs.has(cb) && cb(shopsArray(), { fromCache: false }), 0);
      return () => shopSubs.delete(cb);
    },

    getShop(shopId) {
      const s = load().shops[shopId];
      return s ? { ...clone(s), id: shopId } : null;
    },

    subscribeVisits(shopId, cb) {
      const sub = { shopId, cb };
      visitSubs.add(sub);
      setTimeout(() => visitSubs.has(sub) && cb(visitsArray(shopId), { fromCache: false }), 0);
      return () => visitSubs.delete(sub);
    },

    async getVisit(shopId, visitId) {
      const v = (load().visits[shopId] || {})[visitId];
      return v ? { ...clone(v), id: visitId } : null;
    },

    async createShopWithVisit(shopInput, visitInput, photoList = []) {
      await delay(120);
      const data = load();
      const now = Date.now();
      const n = nick();
      const shopId = randomId();
      let visitId = null;
      data.shops[shopId] = {
        ...DEFAULT_SHOP_ENUMS, ...shopInput, ...computeShopAggregates([]),
        createdBy: n, updatedBy: n, createdAt: now, updatedAt: now,
      };
      data.visits[shopId] = {};
      if (visitInput) {
        visitId = randomId();
        await putPhotos(shopId, visitId, photoList);
        data.visits[shopId][visitId] = {
          ...visitInput, ...photoFields(photoList),
          createdBy: n, updatedBy: n, createdAt: now, updatedAt: now,
        };
        recalcInData(data, shopId);
      }
      save(data);
      return { shopId, visitId };
    },

    async updateShop(shopId, shopInput) {
      await delay(80);
      const data = load();
      if (!data.shops[shopId]) { const e = new Error('not found'); e.code = 'not-found'; throw e; }
      Object.assign(data.shops[shopId], shopInput, { updatedBy: nick(), updatedAt: Date.now() });
      save(data);
    },

    async deleteShop(shopId) {
      await delay(80);
      const data = load();
      for (const [vid, v] of Object.entries(data.visits[shopId] || {})) {
        await deletePhotos(shopId, vid, v.photoCount || 0);
      }
      delete data.visits[shopId];
      delete data.shops[shopId];
      save(data);
    },

    async addVisit(shopId, visitInput, photoList = []) {
      await delay(120);
      const data = load();
      if (!data.shops[shopId]) { const e = new Error('not found'); e.code = 'not-found'; throw e; }
      const now = Date.now();
      const n = nick();
      const visitId = randomId();
      await putPhotos(shopId, visitId, photoList);
      data.visits[shopId] = data.visits[shopId] || {};
      data.visits[shopId][visitId] = {
        ...visitInput, ...photoFields(photoList),
        createdBy: n, updatedBy: n, createdAt: now, updatedAt: now,
      };
      recalcInData(data, shopId);
      save(data);
      return visitId;
    },

    async updateVisit(shopId, visitId, visitInput, photoPlan) {
      await delay(100);
      const data = load();
      const v = (data.visits[shopId] || {})[visitId];
      if (!v) { const e = new Error('not found'); e.code = 'not-found'; throw e; }
      if (photoPlan && !photoPlanUnchanged(photoPlan)) {
        const items = photoPlan.items.slice(0, 4);
        // 既存写真を読み出してから並べ直して書き戻す
        const bodies = [];
        for (const it of items) {
          if (typeof it.existingOrder === 'number') bodies.push(await photos.get(photoKey(shopId, visitId, it.existingOrder)));
          else bodies.push({ data: it.data, width: it.width, height: it.height });
        }
        await deletePhotos(shopId, visitId, photoPlan.originalCount);
        for (let i = 0; i < bodies.length; i++) {
          if (bodies[i]) await photos.put(photoKey(shopId, visitId, i), bodies[i]);
        }
        v.thumbs = items.map((it) => it.thumb);
        v.photoCount = items.length;
      }
      Object.assign(v, visitInput, { updatedBy: nick(), updatedAt: Date.now() });
      recalcInData(data, shopId);
      save(data);
    },

    async deleteVisit(shopId, visitId) {
      await delay(80);
      const data = load();
      const v = (data.visits[shopId] || {})[visitId];
      if (v) await deletePhotos(shopId, visitId, v.photoCount || 0);
      if (data.visits[shopId]) delete data.visits[shopId][visitId];
      recalcInData(data, shopId);
      save(data);
    },

    async getPhotos(shopId, visitId) {
      const v = (load().visits[shopId] || {})[visitId];
      const n = v ? v.photoCount || 0 : 0;
      const out = [];
      for (let i = 0; i < n; i++) {
        const p = await photos.get(photoKey(shopId, visitId, i));
        if (p) out.push({ ...p, order: i });
      }
      return out;
    },

    async recalcShop(shopId) {
      const data = load();
      if (!data.shops[shopId]) return;
      const before = JSON.stringify(data.shops[shopId]);
      recalcInData(data, shopId);
      if (JSON.stringify(data.shops[shopId]) !== before) save(data);
    },

    async createGroup() { /* デモでは不要 */ },

    async exportAll() {
      const data = load();
      return shopsArray(data).map((s) => stripForExport(s, visitsArray(s.id, data)));
    },

    dispose() {
      window.removeEventListener('storage', onStorage);
      shopSubs.clear();
      visitSubs.clear();
    },
  };
  return api;
}
