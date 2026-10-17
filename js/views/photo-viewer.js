// =====================================================================
// S-09 写真ビューア(全画面オーバーレイ)
//   開いた時点で photos を遅延読み込み(N-03)。読込中はサムネイルを拡大表示。
//   左右スワイプ・前後ボタン・矢印キーで切替、端で止まる。×/戻る/下スワイプで閉じる。
// =====================================================================
import { h, icon, clear, safeImageSrc, add } from '../dom.js';
import { openOverlay } from '../ui.js';

/**
 * @param {{thumbs:string[], start?:number, caption?:string, load?:()=>Promise<Array<{data:string}>>, images?:string[]}} o
 *   images を渡した場合は読み込みせずにそれを表示(フォーム内プレビュー)
 */
export function openPhotoViewer(o) {
  const thumbs = (o.thumbs || []).map(safeImageSrc);
  let full = o.images ? o.images.map(safeImageSrc) : null;
  let index = Math.max(0, Math.min((o.start || 0), thumbs.length - 1));
  let loading = !full && !!o.load;
  let failed = false;

  const counter = h('span', { class: 'viewer__count num', aria: { live: 'polite' } });
  const img = h('img', { class: 'viewer__img', alt: '' });
  const spinner = h('span', { class: 'spinner spinner--light viewer__spinner', aria: { label: '読み込み中' }, role: 'status' });
  const errorBox = h('div', { class: 'viewer__error', hidden: true });
  const prevBtn = h('button', { type: 'button', class: 'viewer__nav viewer__nav--prev', aria: { label: '前の写真' }, onClick: () => go(-1) }, icon('back', { size: 28 }));
  const nextBtn = h('button', { type: 'button', class: 'viewer__nav viewer__nav--next', aria: { label: '次の写真' }, onClick: () => go(1) }, icon('chevronRight', { size: 28 }));
  const closeBtn = h('button', { type: 'button', class: 'viewer__close', aria: { label: '閉じる' }, onClick: () => handle.close() }, icon('close', { size: 26 }));
  const stage = h('div', { class: 'viewer__stage' }, img, spinner, errorBox);

  const root = h('div', { class: 'overlay overlay--viewer', role: 'dialog', aria: { modal: 'true', label: '写真' } },
    h('div', { class: 'viewer' },
      h('div', { class: 'viewer__top' }, closeBtn, counter),
      stage,
      prevBtn, nextBtn,
      o.caption ? h('p', { class: 'viewer__caption', text: o.caption }) : null));

  function render() {
    const n = thumbs.length;
    counter.textContent = `${index + 1} / ${n}`;
    const src = full && full[index] ? full[index] : thumbs[index];
    if (src) img.src = src;
    img.classList.toggle('is-thumb', !(full && full[index]));
    spinner.hidden = !loading;
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= n - 1;
    prevBtn.hidden = n <= 1;
    nextBtn.hidden = n <= 1;
    errorBox.hidden = !failed;
  }
  function go(d) {
    const ni = Math.max(0, Math.min(thumbs.length - 1, index + d));
    if (ni !== index) { index = ni; render(); }
  }

  async function load() {
    if (!o.load) return;
    loading = true; failed = false; render();
    try {
      const photos = await o.load();
      full = photos.map((p) => safeImageSrc(p.data));
    } catch (e) {
      console.error(e);
      failed = true;
      clear(errorBox);
      add(errorBox, h('p', { text: '写真を読み込めませんでした' }),
        h('button', { type: 'button', class: 'btn btn--secondary', text: '再試行', onClick: load }));
    } finally {
      loading = false;
      if (handle.isOpen()) render();
    }
  }

  // スワイプ
  let sx = null, sy = null;
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { sx = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) handle.close();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });

  const handle = openOverlay(root, { initialFocus: closeBtn });
  render();
  if (loading) load();
  return handle;
}
