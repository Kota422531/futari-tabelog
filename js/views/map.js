// =====================================================================
// S-04 地図 #/map
//   一覧と同じ filterState を適用(F-43)。ピンはカテゴリ色+絵文字。
//   近接ピンは簡易グリッドクラスタリング(F-44)。
// =====================================================================
import { h, icon, clear, catStyle, safeImageSrc, add } from '../dom.js';
import { categoryTabs, conditionBar, categoryLabel } from '../components.js';
import {
  filterShops, countActiveConditions, describeActiveConditions, removeCondition, clearConditions, clearAll,
} from '../filter.js';
import { state, setFilter, onShopsChange, onFilterChange } from '../state.js';
import { categoryOf, averageRating } from '../schema.js';
import { CATEGORY_SHORT, hasLocation } from '../utils.js';
import {
  loadLeaflet, addOsmLayer, getCurrentPosition, geoErrorMessage, JAPAN_BOUNDS,
} from '../geo.js';
import { toast, openSheet } from '../ui.js';
import { openFilterSheet } from './filter-sheet.js';

const CLUSTER_MAX_ZOOM = 14; // これより拡大したらクラスタしない
const CLUSTER_PX = 48;

/** 店ピン(L.divIcon 用の要素) */
export function pinElement(shop, selected = false) {
  const c = categoryOf(shop.category);
  const avg = averageRating(shop);
  return h('div', { class: ['pin', selected && 'is-selected'], style: catStyle(c.key), title: shop.name },
    h('span', { class: 'pin__body' }, h('span', { class: 'pin__emoji', text: c.emoji })),
    avg !== null && avg >= 4.5 ? h('span', { class: 'pin__dot' }) : null);
}

export function renderMap(root, ctx) {
  const filterBadge = h('span', { class: 'count-badge', hidden: true });
  const filterBtn = h('button', {
    type: 'button', class: 'icon-btn icon-btn--float', aria: { label: '絞り込み' },
    onClick: () => openFilterSheet({ showSort: false }),
  }, icon('filter'), filterBadge);
  const tabs = categoryTabs(state.filter.category, (v) => setFilter({ category: v }));
  const condWrap = h('div', { class: 'map-top__cond' });
  const banner = h('div', { class: 'map-banner', hidden: true, role: 'status' });
  const mapEl = h('div', { class: 'map-canvas', role: 'region', aria: { label: '登録したお店の地図' } });
  const centerCard = h('div', { class: 'map-center-card', hidden: true });
  const unlocatedBtn = h('button', { type: 'button', class: 'map-chip', hidden: true });
  const locateBtn = h('button', {
    type: 'button', class: 'icon-btn icon-btn--float map-locate', aria: { label: '現在地へ移動' },
  }, icon('locate'));

  add(root, h('main', { class: 'page page--map' },
    h('h1', { class: 'visually-hidden', text: '地図', tabindex: '-1' }),
    mapEl,
    h('div', { class: 'map-top' },
      h('div', { class: 'map-top__row' }, tabs, filterBtn),
      condWrap, banner),
    centerCard,
    h('div', { class: 'map-bottom' }, unlocatedBtn, locateBtn)));

  let L = null, map = null, layer = null, meMarker = null, meCircle = null;
  let destroyed = false;
  let selectedId = state.mapFocusShopId;
  state.mapFocusShopId = null;
  let fittedOnce = !!state.mapView;
  const markers = new Map(); // shopId -> marker

  function currentShops() {
    return filterShops(state.shops, state.filter);
  }

  function renderOverlayUi(list) {
    const n = countActiveConditions(state.filter);
    filterBadge.hidden = !n;
    filterBadge.textContent = String(n);
    filterBtn.setAttribute('aria-label', n ? `絞り込み(${n}件の条件を適用中)` : '絞り込み');
    const located = list.filter(hasLocation);
    clear(condWrap);
    const bar = conditionBar(describeActiveConditions(state.filter),
      (g, v) => setFilter(removeCondition(state.filter, g, v)),
      () => setFilter(clearConditions(state.filter)),
      n || state.filter.keyword ? h('span', { class: 'cond-bar__count num', text: `${located.length}件表示` }) : null);
    if (bar) add(condWrap, bar);
    if (state.filter.keyword) {
      condWrap.prepend(h('div', { class: 'map-keyword' },
        h('span', { text: `検索語:${state.filter.keyword}` }),
        h('button', { type: 'button', class: 'cond-bar__clear', text: '解除', onClick: () => setFilter({ keyword: '' }) })));
    }

    const unloc = list.filter((s) => !hasLocation(s));
    unlocatedBtn.hidden = !unloc.length;
    clear(unlocatedBtn);
    add(unlocatedBtn, `位置未設定 ${unloc.length}件`, icon('chevronRight', { size: 16 }));
    unlocatedBtn.onclick = () => openUnlocated(unloc);

    clear(centerCard);
    centerCard.hidden = true;
    if (!state.shopsLoaded) return;
    if (!state.shops.length) {
      centerCard.hidden = false;
      add(centerCard, h('p', { text: 'まだお店が登録されていません' }),
        h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ctx.navigate('#/shop/new') }, icon('plus', { size: 20 }), '記録する'));
    } else if (!located.length) {
      centerCard.hidden = false;
      add(centerCard, h('p', { text: '条件に合うお店が地図上にありません' }),
        h('button', {
          type: 'button', class: 'btn btn--secondary', text: '条件をクリア',
          onClick: () => { tabs.setValue('all'); setFilter(clearAll(state.filter)); },
        }));
    }
  }

  function openUnlocated(unloc) {
    openSheet({
      title: '位置が未設定のお店',
      content: h('div', {},
        h('p', { class: 'field__help', text: 'お店の編集から位置を設定すると地図に表示されます' }),
        h('ul', { class: 'simple-list' }, unloc.map((s) => h('li', {},
          h('a', { class: 'simple-list__item', href: `#/shop/${encodeURIComponent(s.id)}`, style: catStyle(categoryOf(s.category).key) },
            h('span', { class: 'simple-list__emoji', text: categoryOf(s.category).emoji, aria: { hidden: 'true' } }),
            h('span', { class: 'simple-list__main' },
              h('span', { class: 'simple-list__name', text: s.name }),
              h('span', { class: 'simple-list__sub', text: CATEGORY_SHORT[categoryOf(s.category).key] })),
            icon('chevronRight', { size: 18 })))))),
    });
  }

  function popupContent(shop) {
    const c = categoryOf(shop.category);
    const avg = averageRating(shop);
    const src = safeImageSrc(shop.thumb);
    return h('a', { class: 'map-popup', href: `#/shop/${encodeURIComponent(shop.id)}`, style: catStyle(c.key) },
      src ? h('img', { class: 'map-popup__thumb', src, alt: '' })
        : h('span', { class: 'map-popup__thumb map-popup__thumb--empty', text: c.emoji, aria: { hidden: 'true' } }),
      h('span', { class: 'map-popup__body' },
        h('span', { class: 'map-popup__name', text: shop.name }),
        h('span', { class: 'map-popup__sub', text: [CATEGORY_SHORT[c.key], shop.genre, shop.area].filter(Boolean).join('・') }),
        h('span', { class: 'map-popup__meta num' },
          avg !== null ? `★${avg.toFixed(1)}(${shop.ratingCount})` : '未評価',
          shop.visitCount ? `・訪問${shop.visitCount}回` : ''),
        h('span', { class: 'map-popup__more' }, '詳細を見る', icon('chevronRight', { size: 16 }))));
  }

  function makeShopMarker(shop) {
    const el = pinElement(shop, shop.id === selectedId);
    const m = L.marker([shop.lat, shop.lng], {
      icon: L.divIcon({ html: el, className: 'pin-wrap', iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -40] }),
      title: shop.name, alt: `${shop.name}、${categoryLabel(shop.category)}`, keyboard: true, riseOnHover: true,
      zIndexOffset: Math.round((averageRating(shop) || 0) * 100),
    });
    m.bindPopup(() => popupContent(shop), { closeButton: false, className: 'tl-popup', maxWidth: 300, minWidth: 220 });
    m.on('popupopen', () => { selectedId = shop.id; m.getElement()?.querySelector('.pin')?.classList.add('is-selected'); });
    m.on('popupclose', () => {
      if (selectedId === shop.id) selectedId = null;
      m.getElement()?.querySelector('.pin')?.classList.remove('is-selected');
    });
    return m;
  }

  function clusterMarker(group) {
    const latlngs = group.map((s) => [s.lat, s.lng]);
    const lat = latlngs.reduce((a, b) => a + b[0], 0) / latlngs.length;
    const lng = latlngs.reduce((a, b) => a + b[1], 0) / latlngs.length;
    const el = h('div', { class: 'cluster', text: String(group.length) });
    const m = L.marker([lat, lng], {
      icon: L.divIcon({ html: el, className: 'pin-wrap', iconSize: [40, 40], iconAnchor: [20, 20] }),
      title: `${group.length}件のお店`, alt: `${group.length}件のお店。タップで拡大`, keyboard: true,
      zIndexOffset: 1000,
    });
    m.on('click', () => map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: CLUSTER_MAX_ZOOM + 2 }));
    return m;
  }

  /** グリッドベースの簡易クラスタリング */
  function drawMarkers() {
    if (!map) return;
    const list = currentShops().filter(hasLocation);
    // 評価の低い順に描画(高評価が上)
    list.sort((a, b) => (averageRating(a) || 0) - (averageRating(b) || 0));
    layer.clearLayers();
    markers.clear();
    const zoom = map.getZoom();
    if (zoom > CLUSTER_MAX_ZOOM || list.length < 30) {
      list.forEach((s) => { const m = makeShopMarker(s); markers.set(s.id, m); layer.addLayer(m); });
    } else {
      const cells = new Map();
      for (const s of list) {
        const p = map.project([s.lat, s.lng], zoom);
        const key = `${Math.floor(p.x / CLUSTER_PX)}:${Math.floor(p.y / CLUSTER_PX)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(s);
      }
      for (const g of cells.values()) {
        if (g.length === 1) { const m = makeShopMarker(g[0]); markers.set(g[0].id, m); layer.addLayer(m); }
        else layer.addLayer(clusterMarker(g));
      }
    }
    return list;
  }

  function fitToPins(list) {
    if (!list.length) { map.fitBounds(JAPAN_BOUNDS); return; }
    if (list.length === 1) { map.setView([list[0].lat, list[0].lng], 16); return; }
    map.fitBounds(L.latLngBounds(list.map((s) => [s.lat, s.lng])), { padding: [48, 48], maxZoom: 16 });
  }

  function refresh() {
    const list = currentShops();
    renderOverlayUi(list);
    if (!map) return;
    const located = drawMarkers();
    if (!fittedOnce && state.shopsLoaded) {
      fittedOnce = true;
      if (selectedId) {
        const s = located.find((x) => x.id === selectedId);
        if (s) map.setView([s.lat, s.lng], 16);
        else fitToPins(located);
      } else fitToPins(located);
    }
    if (selectedId && markers.has(selectedId)) {
      const m = markers.get(selectedId);
      if (!m.isPopupOpen()) m.openPopup();
    }
  }

  locateBtn.addEventListener('click', async () => {
    locateBtn.classList.add('is-busy');
    locateBtn.disabled = true;
    try {
      const pos = await getCurrentPosition({ maximumAge: 0 });
      if (!map || destroyed) return;
      const ll = [pos.lat, pos.lng];
      if (!meMarker) {
        meCircle = L.circle(ll, { radius: pos.accuracy, className: 'me-accuracy', stroke: false, interactive: false }).addTo(map);
        meMarker = L.marker(ll, {
          icon: L.divIcon({ html: h('div', { class: 'me-dot' }), className: 'pin-wrap', iconSize: [22, 22], iconAnchor: [11, 11] }),
          interactive: false, keyboard: false, zIndexOffset: 2000,
        }).addTo(map);
      } else {
        meMarker.setLatLng(ll); meCircle.setLatLng(ll); meCircle.setRadius(pos.accuracy);
      }
      map.setView(ll, 16);
      state.origin = { lat: pos.lat, lng: pos.lng };
    } catch (e) {
      toast(geoErrorMessage(e), { type: 'error' });
    } finally {
      locateBtn.classList.remove('is-busy');
      locateBtn.disabled = false;
    }
  });

  loadLeaflet().then((Lmod) => {
    if (destroyed) return;
    L = Lmod;
    map = L.map(mapEl, { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'topright' }).addTo(map);
    addOsmLayer(L, map, () => {
      banner.hidden = false;
      banner.textContent = '地図を読み込めませんでした。通信状況を確認してください';
    });
    layer = L.layerGroup().addTo(map);
    if (state.mapView) map.setView(state.mapView.center, state.mapView.zoom);
    else map.fitBounds(JAPAN_BOUNDS);
    map.on('moveend', () => {
      state.mapView = { center: map.getCenter(), zoom: map.getZoom() };
    });
    map.on('zoomend', () => drawMarkers());
    refresh();
    setTimeout(() => map && map.invalidateSize(), 50);
  }).catch(() => {
    banner.hidden = false;
    banner.textContent = '地図を読み込めませんでした。通信状況を確認してください';
    renderOverlayUi(currentShops());
  });

  const un1 = onShopsChange(refresh);
  const un2 = onFilterChange(() => { if (map) map.closePopup(); refresh(); });
  refresh();

  return {
    destroy() {
      destroyed = true;
      un1(); un2();
      if (map) { map.remove(); map = null; }
    },
  };
}
