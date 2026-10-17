// =====================================================================
// app.js ― 起動・ハッシュルーティング・アプリシェル(帯・下部タブ・FAB)
//   ルート表:docs/02_ui.md §1.2
// =====================================================================
import { h, icon, clear, add } from './dom.js';
import { createStore, isDemoMode, classifyError } from './store.js';
import { settings, state, setShops, setShopsError, clearLocalGroup } from './state.js';
import { toast, confirmDialog, closeAllOverlaysSilently, hasOverlay } from './ui.js';
import { extractGroupId } from './utils.js';
import { isValidGroupId } from './schema.js';

import { renderSetup } from './views/setup.js';
import { renderList } from './views/list.js';
import { renderMap } from './views/map.js';
import { renderSettings } from './views/settings.js';
import { renderShopDetail } from './views/shop-detail.js';
import { renderShopNew, renderShopEdit, renderVisitForm } from './views/form-views.js';

const appEl = document.getElementById('app');
const tabbarEl = document.getElementById('tabbar');
const fabEl = document.getElementById('fab');

let current = null;      // {destroy, isDirty?, route}
let unsubShops = null;
let invitedGroupId = ''; // ?g= で招待されたグループ(未設定端末用)
const navStack = [];     // アプリ内の履歴(戻るボタンの判定用)

// ---------------------------------------------------------------------
// ナビゲーション
// ---------------------------------------------------------------------
let leaveAllowed = false;
let lastUrl = location.href;
export function navigate(hash, opts = {}) {
  closeAllOverlaysSilently();
  if (opts.force) leaveAllowed = true;
  if (location.hash === hash) { route(); return; }
  location.hash = hash;
}
export function replace(hash) {
  closeAllOverlaysSilently();
  leaveAllowed = true; // 保存成功など、プログラムからの置換遷移は確認しない
  const url = `${location.pathname}${location.search}${hash}`;
  if (location.hash === hash) { route(); return; }
  location.replace(url);
}
/** アプリ内履歴があれば戻る、なければ fallback へ */
export function back(fallback = '#/list', opts = {}) {
  if (opts.force) leaveAllowed = true;
  if (navStack.length > 1) history.back();
  else replace(fallback);
}

const ctx = {
  get store() { return state.store; },
  nickname: () => settings.nickname,
  navigate, replace, back,
  get invitedGroupId() { return invitedGroupId; },
  set invitedGroupId(v) { invitedGroupId = v; },
  startGroup,
  leaveGroup,
};

// ---------------------------------------------------------------------
// ルーティング
// ---------------------------------------------------------------------
function parseRoute(hash) {
  const r = parseRoutePath(hash);
  const qi = (hash || '').indexOf('?');
  r.query = qi >= 0 ? Object.fromEntries(new URLSearchParams(hash.slice(qi + 1))) : {};
  return r;
}
function parseRoutePath(hash) {
  const path = (hash || '').split('?')[0];
  const p = path.replace(/^#\/?/, '').split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  if (p[0] === 'setup') return { name: 'setup' };
  if (p[0] === 'map') return { name: 'map', tab: 'map' };
  if (p[0] === 'settings') return { name: 'settings', tab: 'settings' };
  if (p[0] === 'shop') {
    if (p[1] === 'new' && p.length === 2) return { name: 'shopNew' };
    if (p[1] && p.length === 2) return { name: 'shop', id: p[1] };
    if (p[1] && p[2] === 'edit' && p.length === 3) return { name: 'shopEdit', id: p[1] };
    if (p[1] && p[2] === 'visit' && p[3] === 'new' && p.length === 4) return { name: 'visitNew', id: p[1] };
    if (p[1] && p[2] === 'visit' && p[3] && p[4] === 'edit' && p.length === 5) return { name: 'visitEdit', id: p[1], vid: p[3] };
  }
  if (p[0] === 'list' && p.length === 1) return { name: 'list', tab: 'list' };
  return { name: 'list', tab: 'list', fallback: true };
}

function trackNav(hash) {
  if (navStack.length > 1 && navStack[navStack.length - 2] === hash) navStack.pop();
  else if (navStack[navStack.length - 1] !== hash) navStack.push(hash);
}

function route() {
  const r = parseRoute(location.hash);
  if (r.fallback && location.hash !== '#/list') {
    history.replaceState(history.state, '', `${location.pathname}${location.search}#/list`);
  }
  if (r.name !== 'setup' && !settings.isReady()) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}#/setup`);
    return route();
  }
  trackNav(location.hash || '#/list');
  closeAllOverlaysSilently();
  leaveAllowed = false;
  lastUrl = location.href;

  if (current) {
    try { current.destroy && current.destroy(); } catch (e) { console.error(e); }
    current = null;
  }
  clear(appEl);
  window.scrollTo(0, 0);

  // シェル(下部タブ・FAB)
  const showTabs = !!r.tab;
  tabbarEl.hidden = !showTabs;
  document.body.classList.toggle('has-tabbar', showTabs);
  fabEl.hidden = !(r.tab === 'list' || r.tab === 'map');
  document.body.dataset.route = r.name;
  tabbarEl.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const view = ({
    setup: renderSetup,
    list: renderList,
    map: renderMap,
    settings: renderSettings,
    shop: renderShopDetail,
    shopNew: renderShopNew,
    shopEdit: renderShopEdit,
    visitNew: renderVisitForm,
    visitEdit: renderVisitForm,
  })[r.name];

  current = view(appEl, ctx, r) || {};
  current.route = r;
  // 画面遷移後は見出しへフォーカス(02_ui §8)
  requestAnimationFrame(() => {
    const h1 = appEl.querySelector('h1');
    if (h1 && !appEl.contains(document.activeElement)) h1.focus({ preventScroll: true });
  });
}

// ---------------------------------------------------------------------
// ストア(グループ)の開始・終了
// ---------------------------------------------------------------------
async function startGroup() {
  if (unsubShops) { unsubShops(); unsubShops = null; }
  if (state.store) { state.store.dispose(); state.store = null; }
  state.shops = [];
  state.shopsLoaded = false;
  state.shopsError = null;
  const groupId = settings.groupId;
  if (!groupId) return;
  try {
    state.store = await createStore({ groupId, getNickname: () => settings.nickname });
  } catch (e) {
    console.error(e);
    setShopsError(e);
    showFatal('アプリを起動できませんでした。通信状況を確認して、ページを再読み込みしてください', null);
    return;
  }
  unsubShops = state.store.subscribeShops(
    (shops, meta) => setShops(shops, meta),
    (err) => {
      console.error(err);
      if (classifyError(err) === 'permission') {
        showFatal('データにアクセスできません。合言葉が正しいか確認してください', { label: '設定を開く', hash: '#/settings' });
      }
      setShopsError(err);
    },
  );
}

function leaveGroup() {
  if (unsubShops) { unsubShops(); unsubShops = null; }
  if (state.store) { state.store.dispose(); state.store = null; }
  clearLocalGroup();
  state.shops = [];
  state.shopsLoaded = false;
  replace('#/setup');
}

function showFatal(message, action) {
  const root = document.getElementById('fatal');
  clear(root);
  root.hidden = false;
  add(root, h('div', { class: 'fatal__box', role: 'alert' },
    h('div', { class: 'fatal__emoji', text: '🔒', aria: { hidden: 'true' } }),
    h('p', { class: 'fatal__text', text: message }),
    action ? h('button', {
      type: 'button', class: 'btn btn--primary',
      onClick: () => { root.hidden = true; navigate(action.hash); },
    }, action.label) : h('button', { type: 'button', class: 'btn btn--primary', text: '再読み込み', onClick: () => location.reload() })));
}

// ---------------------------------------------------------------------
// 共有URL(?g=)の処理
// ---------------------------------------------------------------------
async function handleInviteParam() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('g');
  if (raw === null) return;
  params.delete('g');
  const qs = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  const g = extractGroupId(raw);
  if (!isValidGroupId(g)) {
    invitedGroupId = '';
    if (!settings.isReady()) location.hash = '#/setup';
    toast('合言葉が正しくありません。受け取った文字をそのまま貼り付けてください', { type: 'error' });
    return;
  }
  if (settings.groupId === g) return; // 同じグループ:何もしない
  if (settings.isReady()) {
    const ok = await confirmDialog({
      title: '別のグループに切り替えますか?',
      body: '今のグループの合言葉はこの端末から外れます(データは消えません)。戻るには今の合言葉が必要です。',
      okLabel: '切り替える',
    });
    if (ok) {
      settings.groupId = g;
      await startGroup();
      toast('グループに参加しました', { type: 'success' });
      replace('#/list');
    }
    return;
  }
  invitedGroupId = g;
  if (location.hash !== '#/setup') history.replaceState(history.state, '', `${location.pathname}${location.search}#/setup`);
}

// ---------------------------------------------------------------------
// 帯(デモ・オフライン)・Service Worker
// ---------------------------------------------------------------------
function setupBanners() {
  const demo = document.getElementById('demo-banner');
  demo.hidden = !isDemoMode();
  document.body.classList.toggle('is-demo', !demo.hidden);
  const off = document.getElementById('offline-banner');
  const update = () => {
    off.hidden = navigator.onLine !== false;
    document.body.classList.toggle('is-offline', !off.hidden);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (!reg) return;
    const offer = (worker) => {
      toast('新しいバージョンがあります', {
        persistent: true,
        action: { label: '更新する', onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }) },
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch((e) => console.warn('[sw] register failed', e));
}

function setupShell() {
  const tabs = [
    { tab: 'list', hash: '#/list', label: '一覧', icon: 'list' },
    { tab: 'map', hash: '#/map', label: '地図', icon: 'map' },
    { tab: 'settings', hash: '#/settings', label: '設定', icon: 'settings' },
  ];
  add(tabbarEl, ...tabs.map((t) => h('a', {
    class: 'tabbar__item', href: t.hash, data: { tab: t.tab },
    onClick: (e) => {
      // 同じタブの再タップは一覧の先頭へ
      if (location.hash === t.hash) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    },
  }, icon(t.icon), h('span', { class: 'tabbar__label', text: t.label }))));
  add(fabEl, icon('plus', { size: 28, strokeWidth: 2.5 }), h('span', { class: 'fab__label', text: '記録する' }));
  fabEl.addEventListener('click', () => navigate('#/shop/new'));
}

// ---------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------
async function boot() {
  setupBanners();
  setupShell();
  await handleInviteParam();
  if (settings.groupId) startGroup();
  window.addEventListener('hashchange', async () => {
    if (hasOverlay()) closeAllOverlaysSilently();
    // 入力途中のフォームから戻る操作で離れようとした → D-01
    if (current && typeof current.isDirty === 'function' && current.isDirty() && !leaveAllowed) {
      const target = location.href;
      history.pushState(history.state, '', lastUrl); // いったん元の画面に留まる
      const ok = await confirmDialog({
        title: '入力内容を破棄しますか?', body: '保存していない内容は失われます。', okLabel: '破棄する', danger: true,
      });
      if (ok) {
        if (current.discard) current.discard();
        leaveAllowed = true;
        location.replace(target);
      }
      return;
    }
    route();
  });
  window.addEventListener('beforeunload', (e) => {
    if (current && typeof current.isDirty === 'function' && current.isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  route();
  setupServiceWorker();
}

boot();
