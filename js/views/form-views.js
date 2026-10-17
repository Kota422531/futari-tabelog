// =====================================================================
// 入力画面
//   #/shop/new                       S-06+S-08 統合フォーム(新規店+1件目の訪問)
//   #/shop/:id/edit                  S-06 店編集
//   #/shop/:id/visit/new             S-08 訪問記録追加
//   #/shop/:id/visit/:vid/edit       S-08 訪問記録編集
// =====================================================================
import { h, icon, catStyle, add } from '../dom.js';
import { appHeader, shopThumb } from '../components.js';
import { categoryOf, validateShop, validateVisit } from '../schema.js';
import { CATEGORY_SHORT, formatMonthDay, debounce } from '../utils.js';
import { state, findShop, onShopsChange, drafts } from '../state.js';
import { toast, confirmDialog, setBusy } from '../ui.js';
import { classifyError } from '../store.js';
import {
  shopSection, visitSection, defaultShopRaw, shopRawFrom, defaultVisitRaw, visitRawFrom,
  rawSignature, rawForDraft, focusFirstError,
} from './forms.js';
import { notFound, confirmDeleteShop } from './shop-detail.js';

const isOffline = () => navigator.onLine === false;

function saveErrorMessage(e) {
  const k = classifyError(e);
  if (k === 'quota') return '本日の利用上限に達しました。時間をおいてお試しください';
  if (k === 'local-quota') return 'この端末の保存容量が不足しています。写真を減らしてお試しください(デモモード)';
  if (k === 'permission') return 'データにアクセスできません。合言葉が正しいか確認してください';
  return '保存できませんでした。通信状況を確認して、もう一度お試しください';
}

/** 共通の枠:ヘッダー(キャンセル)+本文+下部固定の保存ボタン */
function formFrame(root, ctx, { title, onCancel, saveLabel = '保存する' }) {
  const saveBtn = h('button', { type: 'button', class: 'btn btn--primary btn--block btn--tall', text: saveLabel });
  const body = h('main', { class: 'page page--form' });
  const form = h('form', { class: 'form', attrs: { novalidate: true }, onSubmit: (e) => e.preventDefault() }, body);
  add(root, 
    appHeader({ title, back: { label: 'キャンセル', onClick: onCancel } }),
    form,
    h('div', { class: 'bottom-bar' }, saveBtn));
  // Enter で誤送信しない(テキスト入力は各部品側で制御)
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search') e.preventDefault();
  });
  return { body, saveBtn };
}

function whenShopsLoaded(cb) {
  if (state.shopsLoaded) { cb(); return () => {}; }
  let done = false;
  const un = onShopsChange(() => { if (!done && state.shopsLoaded) { done = true; un(); cb(); } });
  return un;
}

function shopContextCard(shop) {
  const c = categoryOf(shop.category);
  return h('div', { class: 'context-card', style: catStyle(c.key) },
    shopThumb(shop, 'context-card__thumb'),
    h('div', { class: 'context-card__body' },
      h('p', { class: 'context-card__name', text: shop.name }),
      h('p', { class: 'context-card__sub', text: [CATEGORY_SHORT[c.key], shop.genre, shop.area].filter(Boolean).join('・') })));
}

/** キャンセル時の確認(D-01) */
async function confirmDiscard() {
  return confirmDialog({ title: '入力内容を破棄しますか?', body: '保存していない内容は失われます。', okLabel: '破棄する', danger: true });
}

// =====================================================================
// #/shop/new
// =====================================================================
export function renderShopNew(root, ctx) {
  const DRAFT_KEY = 'shop-new';
  const draft = drafts.get(DRAFT_KEY);
  const initShop = draft && draft.shop ? { ...defaultShopRaw(), ...draft.shop } : defaultShopRaw();
  const initVisit = draft && draft.visit ? { ...defaultVisitRaw(), ...draft.visit, photos: [] } : defaultVisitRaw();
  let withVisit = draft ? draft.withVisit !== false : true;
  let baseSig = null;
  let saving = false;

  const { body, saveBtn } = formFrame(root, ctx, {
    title: 'お店を記録',
    onCancel: async () => {
      if (isDirty() && !(await confirmDiscard())) return;
      drafts.remove(DRAFT_KEY);
      ctx.back('#/list', { force: true });
    },
  });

  const saveDraft = debounce(() => {
    if (saving) return;
    if (isDirty()) drafts.set(DRAFT_KEY, { shop: rawForDraft(shopSec.raw()), visit: rawForDraft(visitSec.raw()), withVisit });
    else drafts.remove(DRAFT_KEY);
  }, 400);
  const onChange = () => saveDraft();

  const shopSec = shopSection(initShop, {
    mode: 'new', onChange,
    onCarry: (shopId) => {
      state.carryVisit = withVisit ? visitSec.raw() : null;
      drafts.remove(DRAFT_KEY);
      ctx.navigate(`#/shop/${encodeURIComponent(shopId)}/visit/new`, { force: true });
    },
  });
  const visitSec = visitSection(initVisit, {
    onChange,
    onBusyChange: (b) => updateSave(b),
  });

  const toggleId = 'visit-toggle';
  const toggle = h('input', { id: toggleId, type: 'checkbox', class: 'switch__input', checked: withVisit, attrs: { role: 'switch' } });
  const visitBody = h('div', { class: 'visit-body', hidden: !withVisit }, visitSec.el);
  toggle.addEventListener('change', () => { withVisit = toggle.checked; visitBody.hidden = !withVisit; onChange(); });

  add(body, shopSec.el,
    h('section', { class: 'form-section' },
      h('div', { class: 'form-section__head' },
        h('h2', { class: 'form-section__title', text: '今回の訪問' }),
        h('label', { class: 'switch', for: toggleId }, h('span', { class: 'switch__label', text: '訪問記録も登録する' }), toggle, h('span', { class: 'switch__track', aria: { hidden: 'true' } }))),
      visitBody));

  baseSig = signature(defaultShopRaw(), defaultVisitRaw(), true);
  if (draft && isDirty()) toast('入力途中の内容を復元しました');

  function signature(s, v, wv) { return `${rawSignature(s)}|${wv ? rawSignature(v) : ''}|${wv}`; }
  function isDirty() { return !saving && signature(shopSec.raw(), visitSec.raw(), withVisit) !== baseSig; }
  function updateSave(busy = visitSec.busy()) {
    if (saving) return;
    saveBtn.disabled = busy;
    saveBtn.textContent = busy ? '写真を処理中…' : '保存する';
  }

  saveBtn.addEventListener('click', async () => {
    if (saving || visitSec.busy()) return;
    const errs = [...shopSec.validate(), ...(withVisit ? visitSec.validate() : [])];
    if (errs.length) { toast('入力内容を確認してください', { type: 'error' }); focusFirstError(errs); return; }
    const shopInput = shopSec.values();
    const visitInput = withVisit ? visitSec.values() : null;
    const schemaErrs = [...validateShop(shopInput), ...(visitInput ? validateVisit(visitInput) : [])];
    if (schemaErrs.length) { toast(schemaErrs[0], { type: 'error' }); return; }
    saving = true;
    setBusy(saveBtn, true, '保存中…');
    try {
      const offline = isOffline();
      const { shopId } = await ctx.store.createShopWithVisit(shopInput, visitInput, withVisit ? visitSec.newPhotos() : []);
      saveDraft.cancel();
      drafts.remove(DRAFT_KEY);
      toast(offline ? 'オフラインのため、通信が戻ったら同期します' : '記録しました', { type: 'success' });
      ctx.replace(`#/shop/${encodeURIComponent(shopId)}`);
    } catch (e) {
      console.error(e);
      saving = false;
      setBusy(saveBtn, false);
      toast(saveErrorMessage(e), { type: 'error' });
    }
  });

  return {
    isDirty,
    discard() { saveDraft.cancel(); drafts.remove(DRAFT_KEY); saving = true; },
    destroy() { saveDraft.cancel(); shopSec.destroy(); },
  };
}

// =====================================================================
// #/shop/:id/edit
// =====================================================================
export function renderShopEdit(root, ctx, route) {
  const shopId = route.id;
  let api = { isDirty: () => false };
  let cleanup = () => {};
  const un = whenShopsLoaded(() => {
    const shop = findShop(shopId);
    if (!shop) { notFound(root, ctx, 'お店が見つかりません。削除された可能性があります'); return; }
    let saving = false;
    const detailHash = `#/shop/${encodeURIComponent(shopId)}`;
    const { body, saveBtn } = formFrame(root, ctx, {
      title: 'お店の情報を編集',
      onCancel: async () => {
        if (isDirty() && !(await confirmDiscard())) return;
        ctx.back(detailHash, { force: true });
      },
    });
    const init = shopRawFrom(shop);
    const sec = shopSection(init, { mode: 'edit', excludeId: shopId, focus: route.query && route.query.focus });
    const baseSig = rawSignature(init);
    function isDirty() { return !saving && rawSignature(sec.raw()) !== baseSig; }

    add(body, sec.el,
      h('div', { class: 'form-danger' },
        h('button', {
          type: 'button', class: 'btn btn--danger-ghost',
          onClick: async () => {
            saving = true;
            const ok = await confirmDeleteShop(ctx, findShop(shopId) || shop);
            if (ok) { toast('お店を削除しました', { type: 'success' }); ctx.replace('#/list'); } else saving = false;
          },
        }, icon('trash', { size: 20 }), 'このお店を削除')));

    saveBtn.addEventListener('click', async () => {
      if (saving) return;
      const errs = sec.validate();
      if (errs.length) { toast('入力内容を確認してください', { type: 'error' }); focusFirstError(errs); return; }
      const input = sec.values();
      const se = validateShop(input);
      if (se.length) { toast(se[0], { type: 'error' }); return; }
      saving = true;
      setBusy(saveBtn, true, '保存中…');
      try {
        const offline = isOffline();
        await ctx.store.updateShop(shopId, input);
        toast(offline ? 'オフラインのため、通信が戻ったら同期します' : 'お店の情報を更新しました', { type: 'success' });
        ctx.replace(detailHash);
      } catch (e) {
        console.error(e);
        saving = false;
        setBusy(saveBtn, false);
        toast(saveErrorMessage(e), { type: 'error' });
      }
    });

    // 編集中に他端末で削除された
    const un2 = onShopsChange(() => {
      if (!findShop(shopId) && !saving) { toast('このお店は削除されました'); ctx.replace('#/list'); }
    });
    api = { isDirty, discard() { saving = true; } };
    cleanup = () => { un2(); sec.destroy(); };
  });
  return {
    isDirty: () => api.isDirty(),
    discard: () => api.discard && api.discard(),
    destroy() { un(); cleanup(); },
  };
}

// =====================================================================
// #/shop/:id/visit/new  /  #/shop/:id/visit/:vid/edit
// =====================================================================
export function renderVisitForm(root, ctx, route) {
  const shopId = route.id;
  const editing = route.name === 'visitEdit';
  const detailHash = `#/shop/${encodeURIComponent(shopId)}`;
  let api = { isDirty: () => false };
  let cleanup = () => {};
  let disposed = false;

  const placeholder = h('div', {},
    appHeader({ title: editing ? '訪問記録を編集' : '訪問を記録', back: { label: 'キャンセル', onClick: () => ctx.back(detailHash) } }),
    h('main', { class: 'page page--form' }, h('div', { class: 'skeleton skeleton--hero', aria: { hidden: 'true' } })));
  add(root, placeholder);

  const un = whenShopsLoaded(async () => {
    const shop = findShop(shopId);
    let visit = null;
    if (shop && editing) {
      try { visit = await ctx.store.getVisit(shopId, route.vid); } catch (e) { console.error(e); }
    }
    if (disposed) return;
    placeholder.remove();
    if (!shop) { notFound(root, ctx, 'お店が見つかりません。削除された可能性があります'); return; }
    if (editing && !visit) { notFound(root, ctx, '訪問記録が見つかりません。削除された可能性があります'); return; }

    const DRAFT_KEY = editing ? `visit-edit:${shopId}:${route.vid}` : `visit-new:${shopId}`;
    let init;
    let restored = false;
    if (!editing && state.carryVisit) {
      init = { ...defaultVisitRaw(), ...state.carryVisit };
      state.carryVisit = null;
    } else {
      const d = drafts.get(DRAFT_KEY);
      const base = editing ? visitRawFrom(visit) : defaultVisitRaw();
      if (d) { init = { ...base, ...d, photos: base.photos }; restored = true; } else init = base;
    }
    const baseRaw = editing ? visitRawFrom(visit) : defaultVisitRaw();
    const baseSig = rawSignature(baseRaw);
    let saving = false;

    const { body, saveBtn } = formFrame(root, ctx, {
      title: editing ? '訪問記録を編集' : '訪問を記録',
      onCancel: async () => {
        if (isDirty() && !(await confirmDiscard())) return;
        drafts.remove(DRAFT_KEY);
        ctx.back(detailHash, { force: true });
      },
    });
    const saveDraft = debounce(() => {
      if (saving) return;
      if (isDirty()) drafts.set(DRAFT_KEY, rawForDraft(sec.raw())); else drafts.remove(DRAFT_KEY);
    }, 400);
    const sec = visitSection(init, {
      onChange: () => saveDraft(),
      onBusyChange: (b) => {
        if (saving) return;
        saveBtn.disabled = b;
        saveBtn.textContent = b ? '写真を処理中…' : '保存する';
      },
    });
    function isDirty() { return !saving && rawSignature(sec.raw()) !== baseSig; }

    add(body, shopContextCard(shop), h('section', { class: 'form-section' }, sec.el));
    if (editing) {
      add(body, h('div', { class: 'form-danger' },
        h('button', {
          type: 'button', class: 'btn btn--danger-ghost',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'この訪問記録を削除しますか?',
              body: `${formatMonthDay(visit.visitedOn)}・${visit.createdBy}さんの記録と写真が削除されます。元に戻せません。`,
              okLabel: '削除する', danger: true,
              onOk: async () => {
                saving = true;
                try { await ctx.store.deleteVisit(shopId, route.vid); return true; } catch (e) {
                  console.error(e); saving = false;
                  toast('削除できませんでした。もう一度お試しください', { type: 'error' });
                  return false;
                }
              },
            });
            if (ok) {
              drafts.remove(DRAFT_KEY);
              toast('訪問記録を削除しました', { type: 'success' });
              ctx.replace(detailHash);
            }
          },
        }, icon('trash', { size: 20 }), 'この訪問記録を削除')));
    }
    if (restored && isDirty()) toast('入力途中の内容を復元しました');

    saveBtn.addEventListener('click', async () => {
      if (saving || sec.busy()) return;
      const errs = sec.validate();
      if (errs.length) { toast('入力内容を確認してください', { type: 'error' }); focusFirstError(errs); return; }
      const input = sec.values();
      const ve = validateVisit(input);
      if (ve.length) { toast(ve[0], { type: 'error' }); return; }
      saving = true;
      setBusy(saveBtn, true, '保存中…');
      try {
        const offline = isOffline();
        let vid = route.vid;
        if (editing) await ctx.store.updateVisit(shopId, route.vid, input, sec.photoPlan(visit.photoCount || 0));
        else vid = await ctx.store.addVisit(shopId, input, sec.newPhotos());
        saveDraft.cancel();
        drafts.remove(DRAFT_KEY);
        if (vid) sessionStorage.setItem('futari-tabelog.scrollToVisit', vid);
        toast(offline ? 'オフラインのため、通信が戻ったら同期します' : (editing ? '訪問記録を更新しました' : '記録しました'), { type: 'success' });
        ctx.replace(detailHash);
      } catch (e) {
        console.error(e);
        saving = false;
        setBusy(saveBtn, false);
        toast(saveErrorMessage(e), { type: 'error' });
      }
    });

    const un2 = onShopsChange(() => {
      if (!findShop(shopId) && !saving) { toast('このお店は削除されました'); ctx.replace('#/list'); }
    });
    api = { isDirty, discard() { saveDraft.cancel(); drafts.remove(DRAFT_KEY); saving = true; } };
    cleanup = () => { un2(); saveDraft.cancel(); };
  });

  return {
    isDirty: () => api.isDirty(),
    discard: () => api.discard && api.discard(),
    destroy() { disposed = true; un(); cleanup(); },
  };
}

