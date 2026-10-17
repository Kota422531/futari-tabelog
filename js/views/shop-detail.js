// =====================================================================
// S-05 店詳細 #/shop/:id
// =====================================================================
import { h, icon, clear, catStyle, safeImageSrc, add } from '../dom.js';
import { appHeader, iconButton, categoryBadge, starsDisplay, emptyState } from '../components.js';
import {
  categoryOf, SCENES, TIMINGS, BUDGETS, MOOD_TAGS, RESERVATION, PRIVATE_ROOM, SMOKING, PARKING,
  CASHLESS, KIDS_OK, PAYMENTS, NOISE_LEVELS, labelOf, labelsOf, averageRating,
} from '../schema.js';
import {
  formatShortDate, formatMonthDay, formatDate, formatNumber, hasLocation, isHttpUrl, urlHost,
} from '../utils.js';
import { state, findShop, onShopsChange } from '../state.js';
import { toast, confirmDialog, openMenu, openSheet, copyText } from '../ui.js';
import { loadLeaflet, addOsmLayer, directionsUrls, isIOS } from '../geo.js';
import { classifyError } from '../store.js';
import { openPhotoViewer } from './photo-viewer.js';
import { pinElement } from './map.js';

export function notFound(root, ctx, text) {
  add(root, appHeader({ title: '', back: { label: '戻る', onClick: () => ctx.back('#/list') } }),
    h('main', { class: 'page' }, emptyState({
      emoji: '🍂', title: text,
      action: h('button', { type: 'button', class: 'btn btn--secondary', text: '一覧に戻る', onClick: () => ctx.replace('#/list') }),
    })));
}

/** 店削除(D-03)。成功時 true */
export async function confirmDeleteShop(ctx, shop) {
  return confirmDialog({
    title: `「${shop.name}」を削除しますか?`,
    body: `訪問記録${shop.visitCount || 0}件と写真もすべて削除され、グループの全員の画面から消えます。元に戻せません。`,
    okLabel: '削除する', danger: true,
    onOk: async () => {
      try {
        await ctx.store.deleteShop(shop.id);
        return true;
      } catch (e) {
        console.error(e);
        toast(classifyError(e) === 'quota' ? '本日の利用上限に達しました。時間をおいてお試しください' : '削除できませんでした。もう一度お試しください', { type: 'error' });
        return false;
      }
    },
  });
}

export function renderShopDetail(root, ctx, route) {
  const shopId = route.id;
  let shop = findShop(shopId);
  let visits = null;
  let visitsError = false;
  let deletingSelf = false;
  let healed = false;
  let unsubVisits = null;
  let miniMap = null;
  const expanded = new Set();

  if (!shop && state.shopsLoaded) {
    notFound(root, ctx, 'お店が見つかりません。削除された可能性があります');
    return {};
  }

  const headerTitle = h('h1', { class: 'app-header__title', tabindex: '-1' });
  const menuBtn = iconButton('more', 'お店のメニュー', () => openMenu('お店のメニュー', [
    { label: 'お店の情報を編集', icon: 'edit', onSelect: () => ctx.navigate(`#/shop/${encodeURIComponent(shopId)}/edit`) },
    { label: 'お店を削除', icon: 'trash', danger: true, onSelect: deleteShop },
  ]));
  const header = h('header', { class: 'app-header' },
    h('div', { class: 'app-header__side' },
      h('button', { type: 'button', class: 'app-header__back has-icon', onClick: () => ctx.back('#/list') }, icon('back', { size: 22 }), '戻る')),
    headerTitle,
    h('div', { class: 'app-header__side app-header__side--end' }, menuBtn));

  const top = h('section', { class: 'detail-top' });
  const actions = h('section', { class: 'detail-actions' });
  const info = h('section', { class: 'detail-section' });
  const visitsSec = h('section', { class: 'detail-section detail-visits' });
  const footMeta = h('p', { class: 'detail-foot' });
  const addBtn = h('button', {
    type: 'button', class: 'btn btn--primary btn--block btn--tall',
    onClick: () => ctx.navigate(`#/shop/${encodeURIComponent(shopId)}/visit/new`),
  }, icon('plus', { size: 20 }), 'この店の訪問を記録');

  add(root, header,
    h('main', { class: 'page page--detail' }, top, actions, info, visitsSec, footMeta),
    h('div', { class: 'bottom-bar' }, addBtn));

  async function deleteShop() {
    deletingSelf = true;
    const ok = await confirmDeleteShop(ctx, shop);
    if (ok) {
      toast('お店を削除しました', { type: 'success' });
      ctx.replace('#/list');
    } else deletingSelf = false;
  }

  // ------------------------------------------------------------------
  function renderTop() {
    const c = categoryOf(shop.category);
    headerTitle.textContent = shop.name;
    document.title = `${shop.name} - ふたりの食べログ`;
    clear(top);
    const avg = averageRating(shop);
    const thumb = safeImageSrc(shop.thumb);
    top.style.cssText = '';
    Object.entries(catStyle(c.key)).forEach(([k, v]) => top.style.setProperty(k, v));
    add(top, 
      thumb ? h('img', { class: 'detail-hero', src: thumb, alt: '' }) : null,
      h('div', { class: 'detail-title' },
        h('div', { class: 'detail-title__main' },
          h('h2', { class: 'detail-name', text: shop.name }),
          h('div', { class: 'detail-sub' },
            categoryBadge(shop.category, { full: true }),
            shop.genre ? h('span', { text: shop.genre }) : null,
            shop.area ? h('span', { class: 'detail-sub__area' }, icon('pin', { size: 16 }), h('span', { text: shop.area })) : null)),
        avg !== null
          ? h('div', { class: 'seal', role: 'img', aria: { label: `平均おすすめ度${avg.toFixed(1)}、${shop.ratingCount}件の評価` } },
            h('span', { class: 'seal__num', text: avg.toFixed(1) }),
            h('span', { class: 'seal__cap', text: `${shop.ratingCount}件の平均` }))
          : h('div', { class: 'seal seal--none', text: 'まだ評価なし' })),
      h('div', { class: 'detail-meta' },
        h('span', { class: 'num', text: `訪問${shop.visitCount || 0}回` }),
        shop.lastVisitedOn ? h('span', { class: 'num', text: `最終 ${formatShortDate(shop.lastVisitedOn)}` }) : null),
      (shop.sceneSet || []).length ? h('div', { class: 'tag-row' },
        labelsOf(SCENES, shop.sceneSet).map((l) => h('span', { class: 'tag', text: l }))) : null,
      (shop.timingSet || []).length || (shop.budgetSet || []).length ? h('p', { class: 'detail-tb' },
        [...labelsOf(TIMINGS, shop.timingSet), ...labelsOf(BUDGETS, shop.budgetSet)].join('  ')) : null,
    );
  }

  function renderActions() {
    clear(actions);
    if (miniMap) { miniMap.remove(); miniMap = null; }
    const btns = h('div', { class: 'action-row' });
    if (hasLocation(shop)) {
      add(btns, h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onClick: openDirections }, icon('route', { size: 18 }), '経路案内'));
    }
    if (shop.url && isHttpUrl(shop.url)) {
      add(btns, h('a', {
        class: 'btn btn--secondary btn--sm', href: shop.url, target: '_blank', rel: 'noopener noreferrer',
        aria: { label: `Webサイト(${urlHost(shop.url)})を開く` },
      }, icon('external', { size: 18 }), 'Webサイト'));
    }
    if (shop.address) {
      add(btns, h('button', {
        type: 'button', class: 'btn btn--secondary btn--sm',
        onClick: async () => toast((await copyText(shop.address)) ? 'コピーしました' : 'コピーできませんでした', { type: 'success' }),
      }, icon('copy', { size: 18 }), '住所コピー'));
    }
    if (btns.childElementCount) add(actions, btns);

    if (hasLocation(shop)) {
      const mm = h('button', {
        type: 'button', class: 'mini-map', aria: { label: '地図で見る' },
        onClick: () => { state.mapFocusShopId = shop.id; state.mapView = { center: [shop.lat, shop.lng], zoom: 16 }; ctx.navigate('#/map'); },
      });
      add(actions, mm);
      loadLeaflet().then((L) => {
        if (!mm.isConnected) return;
        miniMap = L.map(mm, {
          zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
          keyboard: false, touchZoom: false, tap: false, attributionControl: true,
        }).setView([shop.lat, shop.lng], 16);
        addOsmLayer(L, miniMap);
        L.marker([shop.lat, shop.lng], {
          icon: L.divIcon({ html: pinElement(shop), className: 'pin-wrap', iconSize: [36, 44], iconAnchor: [18, 44] }),
          interactive: false, keyboard: false,
        }).addTo(miniMap);
      }).catch(() => { mm.classList.add('is-failed'); mm.textContent = '地図を読み込めませんでした'; });
    } else {
      add(actions, h('div', { class: 'mini-map mini-map--empty' },
        h('span', { text: '位置が未設定です' }),
        h('button', {
          type: 'button', class: 'btn btn--ghost btn--sm', text: '位置を設定する',
          onClick: () => ctx.navigate(`#/shop/${encodeURIComponent(shopId)}/edit?focus=location`),
        })));
    }
    if (shop.address) add(actions, h('p', { class: 'detail-address', text: shop.address }));
  }

  function openDirections() {
    const u = directionsUrls(shop.lat, shop.lng, shop.name);
    if (!isIOS()) { window.open(u.google, '_blank', 'noopener,noreferrer'); return; }
    openSheet({
      title: '経路案内',
      content: h('ul', { class: 'menu-list' },
        h('li', {}, h('a', { class: 'menu-list__item', href: u.google, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), h('span', { text: 'Google マップで開く' }))),
        h('li', {}, h('a', { class: 'menu-list__item', href: u.apple, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), h('span', { text: 'Apple マップで開く' })))),
      className: 'sheet--menu',
    });
  }

  function renderInfo() {
    clear(info);
    const rows = [
      ['予約', RESERVATION, shop.reservation],
      ['個室', PRIVATE_ROOM, shop.privateRoom],
      ['喫煙', SMOKING, shop.smoking],
      ['駐車場', PARKING, shop.parking],
      ['子連れ', KIDS_OK, shop.kidsOk],
    ].filter(([, , v]) => v && v !== 'unknown');
    const pays = labelsOf(PAYMENTS, shop.payments);
    if (pays.length) rows.splice(4, 0, ['支払い方法', null, pays.join('、')]);
    else if (shop.cashless && shop.cashless !== 'unknown') rows.splice(4, 0, ['カード・電子決済', CASHLESS, shop.cashless]);
    add(info, h('h2', { class: 'section-title', text: 'お店の情報' }));
    if (!rows.length && !shop.note) {
      add(info, h('div', { class: 'info-empty' },
        h('span', { text: 'まだ登録されていません' }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '追加する', onClick: () => ctx.navigate(`#/shop/${encodeURIComponent(shopId)}/edit?focus=details`) })));
      return;
    }
    add(info, h('dl', { class: 'info-list' },
      rows.map(([k, defs, v]) => h('div', { class: 'info-list__row' }, h('dt', { text: k }), h('dd', { text: defs ? labelOf(defs, v) : v }))),
      shop.note ? h('div', { class: 'info-list__row info-list__row--note' }, h('dt', { text: 'メモ' }), h('dd', { class: 'prewrap', text: shop.note })) : null));
  }

  function longText(label, text, key) {
    if (!text) return null;
    const p = h('p', { class: ['visit__text', 'prewrap', !expanded.has(key) && 'is-clamped'] },
      h('span', { class: 'visit__label', text: `${label}:` }), text);
    const more = h('button', {
      type: 'button', class: 'link-btn', text: expanded.has(key) ? '閉じる' : 'もっと見る', hidden: true,
      onClick: () => {
        if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
        p.classList.toggle('is-clamped', !expanded.has(key));
        more.textContent = expanded.has(key) ? '閉じる' : 'もっと見る';
      },
    });
    requestAnimationFrame(() => { if (p.scrollHeight > p.clientHeight + 2 || expanded.has(key)) more.hidden = false; });
    return h('div', {}, p, more);
  }

  function visitCard(v) {
    const caption = [formatShortDate(v.visitedOn), labelOf(TIMINGS, v.timing), v.createdBy].filter(Boolean).join(' ・ ');
    const menu = iconButton('more', `${formatMonthDay(v.visitedOn)}の訪問記録のメニュー`, () => openMenu('訪問記録', [
      { label: '編集', icon: 'edit', onSelect: () => ctx.navigate(`#/shop/${encodeURIComponent(shopId)}/visit/${encodeURIComponent(v.id)}/edit`) },
      { label: '削除', icon: 'trash', danger: true, onSelect: () => deleteVisit(v) },
    ]), 'icon-btn--sm');
    const thumbs = (v.thumbs || []).map(safeImageSrc).filter(Boolean);
    const noise = v.noiseLevel ? h('div', { class: 'visit__noise' },
      h('span', { class: 'visit__label', text: '賑やかさ:' }),
      h('span', { text: labelOf(NOISE_LEVELS, v.noiseLevel) }),
      h('span', { class: 'noise-meter', role: 'img', aria: { label: `5段階中${v.noiseLevel}` } },
        [1, 2, 3, 4, 5].map((i) => h('span', { class: ['noise-meter__dot', i <= v.noiseLevel && 'is-on'] })))) : null;
    return h('article', { class: 'visit', id: `visit-${v.id}` },
      h('div', { class: 'visit__head' },
        h('h3', { class: 'visit__date' },
          h('span', { class: 'num', text: formatShortDate(v.visitedOn) }),
          h('span', { class: 'visit__timing', text: labelOf(TIMINGS, v.timing) }),
          h('span', { class: 'visit__by', text: v.createdBy })),
        menu),
      h('div', { class: 'visit__rating' },
        starsDisplay(v.rating, 18),
        h('span', { class: 'num visit__rnum', text: String(v.rating) }),
        v.people ? h('span', { class: 'num', text: `${v.people}人` }) : null,
        v.budget ? h('span', { text: labelOf(BUDGETS, v.budget) }) : null,
        typeof v.priceActual === 'number' ? h('span', { class: 'num', text: `実費 ${formatNumber(v.priceActual)}円` }) : null),
      (v.scenes || []).length ? h('div', { class: 'tag-row' }, labelsOf(SCENES, v.scenes).map((l) => h('span', { class: 'tag', text: l }))) : null,
      (v.menus || []).length ? h('p', { class: 'visit__text' }, h('span', { class: 'visit__label', text: '食べたもの:' }), v.menus.join('、')) : null,
      longText('味', v.tasteComment, `${v.id}-t`),
      noise,
      (v.moodTags || []).length ? h('div', { class: 'tag-row' }, labelsOf(MOOD_TAGS, v.moodTags).map((l) => h('span', { class: 'tag tag--mood', text: l }))) : null,
      longText('雰囲気', v.moodComment, `${v.id}-m`),
      thumbs.length ? h('div', { class: 'visit__photos' }, thumbs.map((src, i) => h('button', {
        type: 'button', class: 'visit__photo', aria: { label: `写真${i + 1}を拡大` },
        onClick: () => openPhotoViewer({
          thumbs, start: i, caption,
          load: () => ctx.store.getPhotos(shopId, v.id),
        }),
      }, h('img', { src, alt: '', attrs: { loading: 'lazy' } })))) : null);
  }

  async function deleteVisit(v) {
    const ok = await confirmDialog({
      title: 'この訪問記録を削除しますか?',
      body: `${formatMonthDay(v.visitedOn)}・${v.createdBy}さんの記録と写真が削除されます。元に戻せません。`,
      okLabel: '削除する', danger: true,
      onOk: async () => {
        try { await ctx.store.deleteVisit(shopId, v.id); return true; } catch (e) {
          console.error(e);
          toast('削除できませんでした。もう一度お試しください', { type: 'error' });
          return false;
        }
      },
    });
    if (ok) toast('訪問記録を削除しました', { type: 'success' });
  }

  function renderVisits() {
    clear(visitsSec);
    add(visitsSec, h('h2', { class: 'section-title' }, '訪問記録', visits ? h('span', { class: 'section-title__n num', text: `(${visits.length})` }) : null));
    if (visitsError) {
      add(visitsSec, h('div', { class: 'info-empty' },
        h('span', { text: '訪問記録を読み込めませんでした' }),
        h('button', { type: 'button', class: 'btn btn--secondary btn--sm', text: '再試行', onClick: subscribe })));
      return;
    }
    if (!visits) {
      add(visitsSec, h('div', { class: 'visit visit--skeleton', aria: { hidden: 'true' } },
        h('span', { class: 'skeleton skeleton--line', style: { width: '50%' } }),
        h('span', { class: 'skeleton skeleton--line', style: { width: '70%' } })),
      h('div', { class: 'visit visit--skeleton', aria: { hidden: 'true' } },
        h('span', { class: 'skeleton skeleton--line', style: { width: '40%' } }),
        h('span', { class: 'skeleton skeleton--line', style: { width: '65%' } })));
      return;
    }
    if (!visits.length) {
      add(visitsSec, h('div', { class: 'info-empty' },
        h('span', { text: 'まだ訪問記録がありません' }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onClick: () => addBtn.click() }, icon('plus', { size: 18 }), '訪問を記録')));
      return;
    }
    add(visitsSec, h('div', { class: 'visit-list' }, visits.map(visitCard)));
  }

  function renderFoot() {
    const parts = [];
    if (shop.createdBy) parts.push(`登録:${shop.createdBy} ${formatDate(shop.createdAt)}`);
    if (shop.updatedBy && shop.updatedAt && shop.updatedAt !== shop.createdAt) parts.push(`更新:${shop.updatedBy} ${formatDate(shop.updatedAt)}`);
    footMeta.textContent = parts.join(' / ');
  }

  function renderAll() {
    renderTop(); renderActions(); renderInfo(); renderVisits(); renderFoot();
  }

  function subscribe() {
    if (unsubVisits) unsubVisits();
    visitsError = false;
    visits = null;
    renderVisits();
    unsubVisits = ctx.store.subscribeVisits(shopId, (list, meta) => {
      visits = list;
      renderVisits();
      // 自己修復:集計と実際の件数が食い違っていたら再計算(04_database 4.3 補足)
      //   ・最新の店ドキュメントで判定(削除済みなら何もしない)、1画面につき1回まで
      //   ・オンラインかつサーバー由来のスナップショットのときだけ
      const live = findShop(shopId);
      if (!healed && live && !deletingSelf && !meta?.fromCache && navigator.onLine !== false
        && list.length !== (live.visitCount || 0) && !list.some((v) => v.createdAt === null)) {
        healed = true;
        setTimeout(() => ctx.store && ctx.store.recalcShop(shopId).catch(() => {}), 0);
      }
      const target = sessionStorage.getItem('futari-tabelog.scrollToVisit');
      if (target) {
        sessionStorage.removeItem('futari-tabelog.scrollToVisit');
        requestAnimationFrame(() => document.getElementById(`visit-${target}`)?.scrollIntoView({ block: 'center' }));
      }
    }, (err) => { console.error(err); visitsError = true; renderVisits(); });
  }

  // 店ドキュメントの変化(他端末の更新・削除)
  let lastSig = '';
  const un = onShopsChange(() => {
    const s = findShop(shopId);
    if (!s) {
      if (!state.shopsLoaded) return;
      if (!deletingSelf) {
        toast('このお店は削除されました');
        ctx.replace('#/list');
      }
      return;
    }
    shop = s;
    const sig = JSON.stringify({ ...s, _search: 0 });
    if (sig !== lastSig) {
      lastSig = sig;
      renderTop(); renderActions(); renderInfo(); renderFoot();
      if (!unsubVisits && ctx.store) subscribe();
    }
  });

  if (shop) {
    lastSig = JSON.stringify({ ...shop, _search: 0 });
    renderAll();
    if (ctx.store) subscribe();
  } else {
    // 店一覧の初回読み込み待ち
    add(top, h('div', { class: 'skeleton skeleton--hero', aria: { hidden: 'true' } }));
  }

  return {
    destroy() {
      un();
      if (unsubVisits) unsubVisits();
      if (miniMap) miniMap.remove();
      document.title = 'ふたりの食べログ';
    },
  };
}
