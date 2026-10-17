// =====================================================================
// store.js ― データ層の共通インターフェース
//
//   実装は2種類(同じメソッドを持つオブジェクトを返す):
//     - store-firestore.js : Firebase Cloud Firestore(本番)
//     - store-local.js     : localStorage + IndexedDB(デモモード、この端末のみ)
//
//   デモモードになる条件:
//     - firebase-config.js の apiKey が "YOUR_API_KEY" のまま、または
//     - URL に ?demo=1 が付いている(一度付けて開くと、このタブでは維持)
//   デモモードでは Firebase の CDN を読み込まない(動的 import で分岐)。
//
//   インターフェース(すべての時刻はミリ秒 number、未確定のサーバー時刻は推定値):
//     mode                                   'firestore' | 'demo'
//     subscribeShops(cb, onError) → unsub    cb(shops[], {fromCache})
//     getShop(shopId) → shop|null            直近の購読結果から(読み取りなし)
//     subscribeVisits(shopId, cb, onError) → unsub   cb(visits[], {fromCache})  visitedOn降順→createdAt降順
//     getVisit(shopId, visitId) → visit|null
//     createShopWithVisit(shopInput, visitInput|null, photos[]) → {shopId, visitId}
//     updateShop(shopId, shopInput)
//     deleteShop(shopId)
//     addVisit(shopId, visitInput, photos[]) → visitId
//     updateVisit(shopId, visitId, visitInput, photoPlan)
//     deleteVisit(shopId, visitId)
//     getPhotos(shopId, visitId) → [{data,width,height,order}]
//     recalcShop(shopId)
//     createGroup()                          groups/{id} を作る(任意・失敗は無視)
//     exportAll() → [{...shop, visits:[...]}](写真・サムネイルを除く)
//     dispose()
//
//   photos[](新規): [{data, thumb, width, height}]  ※ processImage() の結果
//   photoPlan(編集): {originalCount, items:[{existingOrder:number, thumb} | {data, thumb, width, height}]}
// =====================================================================
import { firebaseConfig } from './firebase-config.js';
import { LS_PREFIX } from './utils.js';

const DEMO_SESSION_KEY = `${LS_PREFIX}demo-session`;

/** デモモードで動くか */
export function isDemoMode() {
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') {
    try { sessionStorage.setItem(DEMO_SESSION_KEY, '1'); } catch { /* noop */ }
    return true;
  }
  if (params.get('demo') === '0') {
    try { sessionStorage.removeItem(DEMO_SESSION_KEY); } catch { /* noop */ }
  } else {
    try { if (sessionStorage.getItem(DEMO_SESSION_KEY) === '1') return true; } catch { /* noop */ }
  }
  return !firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY';
}

/**
 * ストアを生成する
 * @param {{groupId:string, getNickname:()=>string}} opts
 */
export async function createStore(opts) {
  if (isDemoMode()) {
    const mod = await import('./store-local.js');
    return mod.createLocalStore(opts);
  }
  const mod = await import('./store-firestore.js');
  return mod.createFirestoreStore(opts);
}

/** 新規訪問データ+写真 → visit ドキュメントの写真関連フィールド */
export function photoFields(photos) {
  const list = Array.isArray(photos) ? photos.slice(0, 4) : [];
  return { thumbs: list.map((p) => p.thumb), photoCount: list.length };
}

/** 編集時の写真計画が「変更なし」か */
export function photoPlanUnchanged(plan) {
  if (!plan || !Array.isArray(plan.items)) return true;
  if (plan.items.length !== plan.originalCount) return false;
  return plan.items.every((it, i) => typeof it.existingOrder === 'number' && it.existingOrder === i);
}

/** 訪問一覧の並び:visitedOn 降順 → createdAt 降順(未確定は最新扱い) */
export function sortVisits(visits) {
  const c = (v) => (typeof v.createdAt === 'number' ? v.createdAt : Number.MAX_SAFE_INTEGER);
  return [...visits].sort((a, b) => {
    if (a.visitedOn !== b.visitedOn) return a.visitedOn < b.visitedOn ? 1 : -1;
    return c(b) - c(a);
  });
}

/** エクスポート用:写真・サムネイルを除いたコピー */
export function stripForExport(shop, visits) {
  const { thumb, _search, ...s } = shop; // eslint-disable-line no-unused-vars
  return {
    ...s,
    visits: (visits || []).map((v) => {
      const { thumbs, ...rest } = v; // eslint-disable-line no-unused-vars
      return rest;
    }),
  };
}

/** ストア由来のエラーを利用者向け文言の種類に分類 */
export function classifyError(err) {
  const code = (err && (err.code || err.name)) || '';
  if (code === 'permission-denied') return 'permission';
  if (code === 'resource-exhausted') return 'quota';
  if (code === 'local-quota' || code === 'QuotaExceededError') return 'local-quota';
  if (code === 'not-found') return 'not-found';
  return 'other';
}
