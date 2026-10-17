// =====================================================================
// S-03 絞り込み・並び替え(ボトムシート)
//   開くたびに適用中の条件で初期化。×/背景/下スワイプは破棄して閉じる。
// =====================================================================
import { h, nextId } from '../dom.js';
import { multiChips, singleChips } from '../components.js';
import { SCENES, TIMINGS, BUDGETS } from '../schema.js';
import { FEATURES, MIN_RATINGS, SORTS, filterShops, collectPeople } from '../filter.js';
import { state, setFilter } from '../state.js';
import { openSheet, toast } from '../ui.js';
import { getCurrentPosition, geoErrorMessage } from '../geo.js';

/**
 * @param {{showSort?:boolean, scrollToSort?:boolean}} [o]
 */
export function openFilterSheet(o = {}) {
  const showSort = o.showSort !== false;
  const draft = JSON.parse(JSON.stringify(state.filter));
  const people = collectPeople(state.shops);
  const applyBtn = h('button', { type: 'button', class: 'btn btn--primary', style: { flex: '2' } });
  const sections = [];

  function updateCount() {
    const n = filterShops(state.shops, draft).length;
    applyBtn.textContent = `${n}件を表示`;
  }

  function section(title, hint, control, id) {
    const labelId = id || nextId('fs');
    const s = h('section', { class: 'fsheet__section' },
      h('h3', { class: 'fsheet__title', id: labelId }, title, hint ? h('span', { class: 'fsheet__hint', text: hint }) : null),
      control(labelId));
    sections.push(s);
    return s;
  }

  let sortChips = null;
  const sortSection = showSort ? section('並び順', '', (labelId) => {
    sortChips = singleChips({
      labelId, options: SORTS, value: draft.sort,
      onChange: async (v) => {
        if (v === 'distance') {
          sortChips.classList.add('is-busy');
          try {
            state.origin = await getCurrentPosition();
            draft.sort = 'distance';
          } catch (e) {
            toast(geoErrorMessage(e), { type: 'error' });
            sortChips.setValue(draft.sort);
          } finally {
            sortChips.classList.remove('is-busy');
          }
        } else {
          draft.sort = v;
        }
        updateCount();
      },
    });
    return sortChips;
  }) : null;

  const controls = {};
  section('利用シーン', '(いずれかを含む)', (labelId) => (controls.scenes = multiChips({
    labelId, options: SCENES, value: draft.scenes, onChange: (v) => { draft.scenes = v; updateCount(); },
  })));
  section('タイミング', '', (labelId) => (controls.timings = multiChips({
    labelId, options: TIMINGS, value: draft.timings, onChange: (v) => { draft.timings = v; updateCount(); },
  })));
  section('予算(1人あたり)', '', (labelId) => (controls.budgets = multiChips({
    labelId, options: BUDGETS, value: draft.budgets, onChange: (v) => { draft.budgets = v; updateCount(); },
  })));
  section('おすすめ度', '', (labelId) => (controls.minRating = singleChips({
    labelId, options: MIN_RATINGS, value: draft.minRating, onChange: (v) => { draft.minRating = v || 0; updateCount(); },
  })));
  section('設備・条件', '(すべて満たす)', (labelId) => (controls.features = multiChips({
    labelId, options: FEATURES, value: draft.features, onChange: (v) => { draft.features = v; updateCount(); },
  })));
  if (people.length) {
    section('記録した人', '', (labelId) => (controls.people = multiChips({
      labelId, options: people.map((p) => ({ key: p, label: p })), value: draft.people,
      onChange: (v) => { draft.people = v; updateCount(); },
    })));
  }

  const clearBtn = h('button', {
    type: 'button', class: 'btn btn--secondary', text: 'クリア', style: { flex: '1' },
    onClick: () => {
      Object.assign(draft, { scenes: [], timings: [], budgets: [], minRating: 0, features: [], people: [], sort: 'created' });
      controls.scenes.setValue([]); controls.timings.setValue([]); controls.budgets.setValue([]);
      controls.minRating.setValue(0); controls.features.setValue([]);
      if (controls.people) controls.people.setValue([]);
      if (sortChips) sortChips.setValue('created');
      updateCount();
    },
  });

  applyBtn.addEventListener('click', () => {
    const next = { ...draft };
    handle.close(() => setFilter(next));
  });

  const handle = openSheet({
    title: '絞り込み・並び替え',
    content: h('div', { class: 'fsheet' }, sections),
    footer: h('div', { class: 'sheet__foot-row' }, clearBtn, applyBtn),
    className: 'sheet--filter',
  });
  updateCount();
  if (o.scrollToSort && sortSection) requestAnimationFrame(() => sortSection.scrollIntoView({ block: 'start' }));
  return handle;
}
