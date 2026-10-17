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
import { HOTPEPPER_API_KEY } from '../firebase-config.js';

const KIND_LABEL = { shop: 'お店', address: '住所', place: '地名' };

/**
 * @param {{lat?:number|null, lng?:number|null, focusSearch?:boolean, query?:string}} init
 * @returns {Promise<null|{lat:number, lng:number, address:string|null, place?:object|null}>}
 */
export function openLocationPicker(init = {}) {
  return new Promise((resolve) => {
    let result = null;
    let pos = typeof init.lat === 'number' && typeof init.lng === 'number' ? { lat: init.lat, lng: init.lng } : null;
    let address = null; // 逆ジオ結果 or 検索結果の住所
    let chosen = null;  // 検索結果から選んだ場所(店名・ジャンル等の引き継ぎ用)
    let L = null, map = null, marker = null;
    let revTimer = null, revSeq = 0;

    const searchInput = h('input', {
      class: 'input', type: 'search', placeholder: '店名(+地名)や住所を入力', value: init.query || '', aria: { label: '住所・店名で検索' },
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

    function placeMarker(ll, { pan = false, zoom, knownAddress = null, place = null } = {}) {
      pos = { lat: ll.lat, lng: ll.lng };
      chosen = place;
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
      if (knownAddress) {
        clearTimeout(revTimer); revSeq += 1;
        address = knownAddress;
        addrEl.textContent = knownAddress;
      } else {
        scheduleReverse();
      }
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
        let viewbox, near;
        if (map && map.getZoom() >= 10) {
          const b = map.getBounds();
          viewbox = `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
          const c = map.getCenter();
          near = { lat: c.lat, lng: c.lng };
        }
        const list = await searchPlaces(q, { viewbox, near: map && map.getZoom() >= 13 ? near : undefined, hotpepperKey: HOTPEPPER_API_KEY || '' });
        clear(results);
        if (!list.length) {
          add(results, h('div', { class: 'picker__msg' },
            h('p', { text: '見つかりませんでした。' }),
            h('ul', { class: 'picker__tips' },
              h('li', { text: '住所で検索すると確実です(食べログやGoogleマップの住所をコピーして貼り付け)' }),
              h('li', { text: '店名は「店名 地名」(例:利久 国分町)のように短くすると見つかりやすくなります' }),
              h('li', { text: '見つからない時は地図をタップしてピンを置けます' }))));
        } else {
          add(results, h('ul', { class: 'picker__list' }, list.map((r) => h('li', {},
            h('button', {
              type: 'button', class: 'picker__item',
              onClick: () => {
                results.hidden = true;
                if (map) placeMarker({ lat: r.lat, lng: r.lng }, { pan: true, zoom: 18, knownAddress: r.address || null, place: r });
              },
            },
            h('span', { class: 'picker__item-main' },
              h('span', { class: 'picker__item-name' },
                h('span', { class: `picker__kind picker__kind--${r.kind}`, text: KIND_LABEL[r.kind] || '' }),
                h('span', { text: r.name || r.address })),
              r.address && r.address !== r.name ? h('span', { class: 'picker__item-addr', text: r.address }) : null),
            icon('chevronRight', { size: 18 }))))));
          if (list.some((r) => r.source === 'hotpepper')) {
            add(results, h('p', { class: 'picker__credit' },
              h('a', { href: 'http://webservice.recruit.co.jp/', target: '_blank', rel: 'noopener noreferrer', text: 'Powered by ホットペッパーグルメ Webサービス' })));
          }
          if (list.some((r) => r.source === 'gsi')) {
            add(results, h('p', { class: 'picker__credit', text: '住所検索:国土地理院' }));
          }
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
      result = { lat: pos.lat, lng: pos.lng, address, place: chosen };
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
      if (init.query && init.query.trim()) setTimeout(doSearch, 120);
    }).catch(() => {
      addrEl.textContent = '地図を読み込めませんでした。通信状況を確認してください';
    });
  });
}
