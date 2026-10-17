// =====================================================================
// store-firestore.js ― Cloud Firestore 実装(docs/04_database.md 準拠)
//   ・Firebase SDK は CDN の ESM を動的 import(デモモードでは読み込まれない)
//   ・オフラインキャッシュ:persistentLocalCache + persistentMultipleTabManager
//   ・店の集計値は visits 全件から computeShopAggregates で再計算(updatedAt/updatedBy は触らない)
//   ・削除は 写真 → 訪問 → 店 の順に 500件ごとに batch
// =====================================================================
import { firebaseConfig, FIREBASE_SDK_VERSION } from './firebase-config.js';
import { computeShopAggregates, DEFAULT_SHOP_ENUMS } from './schema.js';
import { toMillis } from './utils.js';
import { photoFields, photoPlanUnchanged, sortVisits, stripForExport } from './store.js';

const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
const BATCH_LIMIT = 500;

let sdkPromise = null;
/** SDK と Firestore インスタンス(アプリ内で1つだけ) */
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const [appMod, fs] = await Promise.all([
        import(`${BASE}/firebase-app.js`),
        import(`${BASE}/firebase-firestore.js`),
      ]);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
      let db;
      try {
        db = fs.initializeFirestore(app, {
          localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
        });
      } catch (e) {
        // 既に初期化済み・IndexedDB 非対応(プライベートブラウズ等)の場合はメモリキャッシュで続行
        console.warn('[firestore] persistent cache unavailable:', e);
        try { db = fs.initializeFirestore(app, {}); } catch { db = fs.getFirestore(app); }
      }
      return { fs, db };
    })();
    sdkPromise.catch(() => { sdkPromise = null; });
  }
  return sdkPromise;
}

/** DocumentSnapshot → 平たいオブジェクト(時刻はミリ秒) */
function toPlain(d) {
  const data = d.data({ serverTimestamps: 'estimate' }) || {};
  const out = { ...data, id: d.id };
  out.createdAt = toMillis(data.createdAt);
  out.updatedAt = toMillis(data.updatedAt);
  return out;
}

/** 集計用:未確定の serverTimestamp は null(=最新扱い) */
function toAggInput(d) {
  const data = d.data({ serverTimestamps: 'none' }) || {};
  return { ...data, createdAt: toMillis(data.createdAt) };
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * 書き込みの完了待ち。オフライン時はローカル反映(キャッシュ)の時点で戻る。
 * サーバー反映は通信復帰後に SDK が自動で行う。
 */
async function settle(promise) {
  if (isOffline()) {
    promise.catch((e) => console.warn('[firestore] pending write failed:', e));
    return;
  }
  await promise;
}

export async function createFirestoreStore({ groupId, getNickname }) {
  const { fs, db } = await loadSdk();
  const {
    collection, doc, getDoc, getDocs, getDocsFromCache, onSnapshot, query, orderBy,
    writeBatch, updateDoc, setDoc, serverTimestamp,
  } = fs;

  const shopsCol = () => collection(db, 'groups', groupId, 'shops');
  const shopRef = (shopId) => doc(db, 'groups', groupId, 'shops', shopId);
  const visitsCol = (shopId) => collection(shopRef(shopId), 'visits');
  const visitRef = (shopId, visitId) => doc(visitsCol(shopId), visitId);
  const photosCol = (shopId, visitId) => collection(visitRef(shopId, visitId), 'photos');
  const nick = () => String(getNickname() || '').slice(0, 20);

  let shopCache = new Map();
  const unsubs = new Set();

  const read = (q) => (isOffline() ? getDocsFromCache(q).catch(() => getDocs(q)) : getDocs(q));

  async function commitDeletes(refs) {
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      refs.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(r));
      await settle(batch.commit());
    }
  }

  function visitDoc(input, photos) {
    return { ...input, ...photoFields(photos) };
  }
  function addPhotoSets(batch, vRef, photos, startOrder = 0) {
    photos.forEach((p, i) => {
      batch.set(doc(collection(vRef, 'photos')), {
        data: p.data, order: startOrder + i, width: p.width, height: p.height, createdAt: serverTimestamp(),
      });
    });
  }

  const api = {
    mode: 'firestore',

    subscribeShops(cb, onError) {
      const un = onSnapshot(shopsCol(), { includeMetadataChanges: true }, (snap) => {
        const shops = snap.docs.map(toPlain);
        shopCache = new Map(shops.map((s) => [s.id, s]));
        cb(shops, { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
      }, (err) => onError && onError(err));
      unsubs.add(un);
      return () => { un(); unsubs.delete(un); };
    },

    getShop(shopId) {
      return shopCache.get(shopId) || null;
    },

    subscribeVisits(shopId, cb, onError) {
      const q = query(visitsCol(shopId), orderBy('visitedOn', 'desc'));
      const un = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
        cb(sortVisits(snap.docs.map(toPlain)), { fromCache: snap.metadata.fromCache });
      }, (err) => onError && onError(err));
      unsubs.add(un);
      return () => { un(); unsubs.delete(un); };
    },

    async getVisit(shopId, visitId) {
      const s = await getDoc(visitRef(shopId, visitId));
      return s.exists() ? toPlain(s) : null;
    },

    async createShopWithVisit(shopInput, visitInput, photos = []) {
      const n = nick();
      const sRef = doc(shopsCol());
      const batch = writeBatch(db);
      let agg = computeShopAggregates([]);
      let vId = null;
      if (visitInput) {
        const vRef = doc(collection(sRef, 'visits'));
        vId = vRef.id;
        const v = { ...visitDoc(visitInput, photos), createdBy: n, updatedBy: n };
        agg = computeShopAggregates([{ ...v, createdAt: null }]);
        batch.set(vRef, { ...v, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        addPhotoSets(batch, vRef, photos);
      }
      batch.set(sRef, {
        ...DEFAULT_SHOP_ENUMS, ...shopInput, ...agg,
        createdBy: n, updatedBy: n, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await settle(batch.commit());
      return { shopId: sRef.id, visitId: vId };
    },

    async updateShop(shopId, shopInput) {
      await settle(updateDoc(shopRef(shopId), {
        ...shopInput, updatedBy: nick(), updatedAt: serverTimestamp(),
      }));
    },

    async deleteShop(shopId) {
      const visits = await read(visitsCol(shopId));
      const photoRefs = [];
      for (const v of visits.docs) {
        const ps = await read(collection(v.ref, 'photos'));
        photoRefs.push(...ps.docs.map((d) => d.ref));
      }
      await commitDeletes([...photoRefs, ...visits.docs.map((d) => d.ref), shopRef(shopId)]);
    },

    async addVisit(shopId, visitInput, photos = []) {
      const n = nick();
      const vRef = doc(visitsCol(shopId));
      const batch = writeBatch(db);
      batch.set(vRef, {
        ...visitDoc(visitInput, photos),
        createdBy: n, updatedBy: n, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      addPhotoSets(batch, vRef, photos);
      await settle(batch.commit());
      await api.recalcShop(shopId);
      return vRef.id;
    },

    async updateVisit(shopId, visitId, visitInput, photoPlan) {
      const vRef = visitRef(shopId, visitId);
      const batch = writeBatch(db);
      const update = { ...visitInput, updatedBy: nick(), updatedAt: serverTimestamp() };
      if (photoPlan && !photoPlanUnchanged(photoPlan)) {
        const items = photoPlan.items.slice(0, 4);
        const existing = await read(photosCol(shopId, visitId));
        const byOrder = new Map();
        existing.docs.forEach((d) => {
          const o = d.data().order;
          if (!byOrder.has(o)) byOrder.set(o, d.ref); else batch.delete(d.ref); // 重複順序のゴミは掃除
        });
        const kept = new Set();
        items.forEach((it, i) => {
          if (typeof it.existingOrder === 'number') {
            const ref = byOrder.get(it.existingOrder);
            if (ref) {
              kept.add(it.existingOrder);
              if (it.existingOrder !== i) batch.update(ref, { order: i });
            }
          } else {
            batch.set(doc(collection(vRef, 'photos')), {
              data: it.data, order: i, width: it.width, height: it.height, createdAt: serverTimestamp(),
            });
          }
        });
        for (const [o, ref] of byOrder) if (!kept.has(o)) batch.delete(ref);
        update.thumbs = items.map((it) => it.thumb);
        update.photoCount = items.length;
      }
      batch.update(vRef, update);
      await settle(batch.commit());
      await api.recalcShop(shopId);
    },

    async deleteVisit(shopId, visitId) {
      const photos = await read(photosCol(shopId, visitId));
      await commitDeletes([...photos.docs.map((d) => d.ref), visitRef(shopId, visitId)]);
      await api.recalcShop(shopId);
    },

    async getPhotos(shopId, visitId) {
      const snap = await getDocs(query(photosCol(shopId, visitId), orderBy('order')));
      return snap.docs.map((d) => {
        const p = d.data();
        return { data: p.data, width: p.width, height: p.height, order: p.order };
      });
    },

    async recalcShop(shopId) {
      const snap = await read(visitsCol(shopId));
      const agg = computeShopAggregates(snap.docs.map(toAggInput));
      // 集計値だけを更新(updatedAt / updatedBy は据え置き → ルール 4.4)
      await settle(updateDoc(shopRef(shopId), agg));
    },

    async createGroup() {
      try {
        const ref = doc(db, 'groups', groupId);
        await settle(setDoc(ref, { createdAt: serverTimestamp() }));
      } catch (e) {
        console.warn('[firestore] group doc not created (ignored):', e && e.code);
      }
    },

    async exportAll() {
      const shops = await getDocs(shopsCol());
      const out = [];
      for (const s of shops.docs) {
        const visits = await getDocs(visitsCol(s.id));
        out.push(stripForExport(toPlain(s), sortVisits(visits.docs.map(toPlain))));
      }
      return out;
    },

    dispose() {
      unsubs.forEach((u) => { try { u(); } catch { /* noop */ } });
      unsubs.clear();
    },
  };
  return api;
}
