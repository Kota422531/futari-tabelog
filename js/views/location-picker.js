// =====================================================================
// S-07 位置選択(全画面オーバーレイ)
//   地図タップ/ピンドラッグ/Nominatim 検索(ボタン押下時のみ)/現在地
//   ピン確定後 1 秒待って逆ジオコーディング(geo.js 側で 1 秒 1 リクエストに制限)
// =====================================================================
import { h, icon, clear, add } from '../dom.js';
import { openOverlay, toast } from '../ui.js';
import {
  loadLeaflet, addOsmLayer, searchPlaces, reverseGeocode, getCurrentPosition, geoErrorMessage, JAPAN_BOUNDS,
} from '../geo.js';
import { state } from '../state.js';

/**
 * @param {{lat?:number|null, lng?:number|null, focusSearch?:boolean}} init
 * @returns {Promise<null|{lat:number, lng:number, address:string|null}>}
 */
export function openLocationPicker(init = {}) {
  return new Promise((resolve) => {
    let result = null;
    let pos = typeof init.lat === 'number' && typeof init.lng === 'number' ? { lat: init.lat, lng: init.lng } : null;
    let address = null; // 逆ジオ結果
    let L = null, map = null, marker = null;
    let revTimer = null, revSeq = 0;

    const searchInput = h('input', {
      class: 'input', type: 'search', placeholder: '住所・店名を入力', aria: { label: '住所・店名で検索' },
      attrs: { enterkeyhint: 'search', autocomplete: 'off' },
    });
    const searchBtn = h('button', { type: 'button', class: 'btn btn--secondary', text: '検索' });
    const results = h('div', { class: 'picker__results', hidden: true, aria: { live: 'polite' } });
    const mapEl = h('div', { class: 'picker__map', role: 'region', aria: { label: '位置を選ぶ地図' } });
    const hint = h('p', { class: 'picker__hint' });
    const addrEl = h('p', { class: 'picker__addr' });
    const okBtn = h('button', { type: 'button', class: 'btn btn--primary btn--block', text: 'この位置に決定' });
    const locBtn = h('button', { type: 'button', class: 'icon-btn icon-btn--float picker__locate', aria: { label: '現在地へ移動' } }, icon('locate'));
    const backBtn = h('button', { type: 'button', class: 'app-header__back has-icon' }, icon('back', { size: 22 }), '戻る');

    const root = h('div', { class: 'overlay overlay--full', role: 'dialog', aria: { modal: 'true', label: '位置を選ぶ' } },
      h('div', { class: 'picker' },
        h('header', { class: 'app-header' },
          h('div', { class: 'app-header__side' }, backBtn),
          h('h2', { class: 'app-header__title', text: '位置を選ぶ' }),
          h('div', { class: 'app-header__side' })),
        h('form', { class: 'picker__search', onSubmit: (e) => { e.preventDefault(); doSearch(); } }, searchInput, searchBtn),
        results,
        h('div', { class: 'picker__mapwrap' }, mapEl, locBtn),
        h('div', { class: 'picker__foot' }, addrEl, hint, okBtn)));

    const handle = openOverlay(root, {
      initialFocus: () => (init.focusSearch ? searchInput : backBtn),
      onClose: () => {
        clearTimeout(revTimer);
        if (map) map.remove();
        resolve(result);
      },
    });
    backBtn.addEventListener('click', () => handle.close());
    searchBtn.addEventListener('click', (e) => { e.preventDefault(); doSearch(); });

    function updateFoot() {
      okBtn.disabled = !pos;
      hint.textContent = pos ? '地図をタップ、またはピンをドラッグして調整' : '地図をタップして位置を指定してください';
    }

    function placeMarker(ll, { pan = false, zoom } = {}) {
      pos = { lat: ll.lat, lng: ll.lng };
      if (!marker) {
        marker = L.marker([pos.lat, pos.lng], {
          draggable: true, autoPan: true, keyboard: true, title: '選択中の位置',
          icon: L.divIcon({
            html: h('div', { class: 'pin pin--select', style: { '--cat': 'var(--color-primary)' } }, h('span', { class: 'pin__body' }, icon('pin', { size: 20 }))),
            className: 'pin-wrap', iconSize: [36, 44], iconAnchor: [18, 44],
          }),
        }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); pos = { lat: p.lat, lng: p.lng }; scheduleReverse(); });
      } else {
        marker.setLatLng([pos.lat, pos.lng]);
      }
      if (pan) map.setView([pos.lat, pos.lng], zoom || Math.max(map.getZoom(), 16));
      updateFoot();
      scheduleReverse();
    }

    function scheduleReverse() {
      clearTimeout(revTimer);
      address = null;
      addrEl.textContent = '住所を取得中…';
      const seq = ++revSeq;
      revTimer = setTimeout(async () => {
        try {
          const a = await reverseGeocode(pos.lat, pos.lng);
          if (seq !== revSeq || !handle.isOpen()) return;
          address = a || null;
          addrEl.textContent = a || '住所を取得できませんでした(位置は保存できます)';
        } catch {
          if (seq !== revSeq || !handle.isOpen()) return;
          addrEl.textContent = '住所を取得できませんでした(位置は保存できます)';
        }
      }, 1000);
    }

    let searching = false;
    async function doSearch() {
      const q = searchInput.value.trim();
      if (!q || searching) return;
      searching = true;
      searchBtn.disabled = true;
      searchBtn.textContent = '検索中…';
      results.hidden = false;
      clear(results);
      add(results, h('p', { class: 'picker__msg', text: '検索中…' }));
      const started = Date.now();
      try {
        let viewbox;
        if (map) {
          const b = map.getBounds();
          viewbox = `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
        }
        const list = await searchPlaces(q, { viewbox });
        clear(results);
        if (!list.length) {
          add(results, h('p', { class: 'picker__msg', text: '見つかりませんでした。別の言葉で検索するか、地図をタップして指定してください' }));
        } else {
          add(results, h('ul', { class: 'picker__list' }, list.map((r) => h('li', {},
            h('button', {
              type: 'button', class: 'picker__item',
              onClick: () => {
                results.hidden = true;
                if (map) placeMarker({ lat: r.lat, lng: r.lng }, { pan: true, zoom: 17 });
              },
            },
            h('span', { class: 'picker__item-main' },
              h('span', { class: 'picker__item-name', text: r.name || r.address }),
              h('span', { class: 'picker__item-addr', text: r.address })),
            icon('chevronRight', { size: 18 }))))));
        }
      } catch (e) {
        console.error(e);
        clear(results);
        add(results, h('p', { class: 'picker__msg', text: '検索できませんでした。時間をおいて再度お試しください' }));
      } finally {
        searching = false;
        searchBtn.textContent = '検索';
        // 押下後 1 秒はボタン無効(連打防止)
        setTimeout(() => { searchBtn.disabled = false; }, Math.max(0, 1000 - (Date.now() - started)));
      }
    }

    locBtn.addEventListener('click', async () => {
      locBtn.classList.add('is-busy');
      locBtn.disabled = true;
      try {
        const p = await getCurrentPosition({ maximumAge: 0 });
        if (map) placeMarker({ lat: p.lat, lng: p.lng }, { pan: true, zoom: 17 });
      } catch (e) {
        toast(geoErrorMessage(e), { type: 'error' });
      } finally {
        locBtn.classList.remove('is-busy');
        locBtn.disabled = false;
      }
    });

    okBtn.addEventListener('click', () => {
      if (!pos) return;
      result = { lat: pos.lat, lng: pos.lng, address };
      handle.close();
    });

    updateFoot();
    loadLeaflet().then((Lmod) => {
      if (!handle.isOpen()) return;
      L = Lmod;
      map = L.map(mapEl, { zoomControl: true });
      addOsmLayer(L, map, () => { addrEl.textContent = '地図を読み込めませんでした。通信状況を確認してください'; });
      if (pos) {
        map.setView([pos.lat, pos.lng], 17);
        placeMarker(pos);
      } else if (state.mapView) {
        map.setView(state.mapView.center, state.mapView.zoom);
      } else {
        map.fitBounds(JAPAN_BOUNDS);
      }
      map.on('click', (e) => placeMarker(e.latlng));
      setTimeout(() => map && map.invalidateSize(), 60);
    }).catch(() => {
      addrEl.textContent = '地図を読み込めませんでした。通信状況を確認してください';
    });
  });
}
