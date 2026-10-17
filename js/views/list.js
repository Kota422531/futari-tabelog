// =====================================================================
// S-02 店一覧(ホーム) #/list
// =====================================================================
import { h, icon, clear, add } from '../dom.js';
import {
  categoryTabs, shopCard, skeletonCards, emptyState, conditionBar,
} from '../components.js';
import {
  applyFilter, countActiveConditions, describeActiveConditions, removeCondition,
  clearConditions, clearAll, SORTS,
} from '../filter.js';
import { state, settings, setFilter, onShopsChange, onFilterChange, isNewShop } from '../state.js';
import { debounce } from '../utils.js';
import { openFilterSheet } from './filter-sheet.js';

export function renderList(root, ctx) {
  const searchInput = h('input', {
    class: 'search__input', type: 'search', value: state.filter.keyword,
    placeholder: '店名・メニュー・メモで検索', aria: { label: 'お店を検索' },
    attrs: { enterkeyhint: 'search', autocomplete: 'off' },
  });
  const clearSearch = h('button', {
    type: 'button', class: 'search__clear', aria: { label: '検索語を消去' }, hidden: !state.filter.keyword,
    onClick: () => { searchInput.value = ''; clearSearch.hidden = true; setFilter({ keyword: '' }); searchInput.focus(); },
  }, icon('close', { size: 18 }));
  const onSearch = debounce(() => setFilter({ keyword: searchInput.value }), 200);
  searchInput.addEventListener('input', () => { clearSearch.hidden = !searchInput.value; onSearch(); });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchInput.blur(); } });

  const filterBadge = h('span', { class: 'count-badge', hidden: true });
  const filterBtn = h('button', {
    type: 'button', class: 'icon-btn icon-btn--labeled', aria: { label: '絞り込み' },
    onClick: () => openFilterSheet({ showSort: true }),
  }, icon('filter'), filterBadge);

  const header = h('header', { class: 'list-header' },
    h('h1', { class: 'visually-hidden', text: 'お店の一覧', tabindex: '-1' }),
    h('div', { class: 'search' },
      icon('search', { size: 20, class: 'search__icon' }),
      searchInput, clearSearch),
    filterBtn);

  const tabs = categoryTabs(state.filter.category, (v) => setFilter({ category: v }));
  const condWrap = h('div', { class: 'cond-wrap' });
  const countRow = h('div', { class: 'count-row' });
  const listEl = h('div', { class: 'shop-list', role: 'list' });

  add(root, h('div', { class: 'sticky-top' }, header, tabs),
    h('main', { class: 'page page--list' }, condWrap, countRow, listEl));

  function render() {
    const st = state.filter;
    const n = countActiveConditions(st);
    filterBadge.hidden = !n;
    filterBadge.textContent = String(n);
    filterBtn.setAttribute('aria-label', n ? `絞り込み(${n}件の条件を適用中)` : '絞り込み');

    clear(condWrap);
    const bar = conditionBar(describeActiveConditions(st),
      (g, v) => setFilter(removeCondition(state.filter, g, v)),
      () => setFilter(clearConditions(state.filter)));
    if (bar) add(condWrap, bar);

    clear(listEl);
    clear(countRow);
    if (state.shopsError && !state.shopsLoaded) {
      add(listEl, emptyState({
        emoji: '📡', title: 'お店を読み込めませんでした。通信状況を確認してください',
        action: h('button', { type: 'button', class: 'btn btn--secondary', text: '再試行', onClick: () => ctx.startGroup() }),
      }));
      return;
    }
    if (!state.shopsLoaded) {
      add(listEl, skeletonCards(5));
      return;
    }
    if (!state.shops.length) {
      add(listEl, emptyState({
        title: 'まだお店が登録されていません',
        text: '右下の「＋記録する」から、行ったお店を記録しましょう',
        action: h('button', { type: 'button', class: 'btn btn--primary', onClick: () => ctx.navigate('#/shop/new') },
          icon('plus', { size: 20 }), '最初のお店を記録する'),
      }));
      return;
    }
    const origin = st.sort === 'distance' ? state.origin : null;
    const items = applyFilter(state.shops, st, { origin });
    const sortLabel = (SORTS.find((s) => s.key === st.sort) || SORTS[0]).label;
    add(countRow, 
      h('span', { class: 'count-row__n num', text: `${items.length}件`, aria: { live: 'polite' } }),
      h('button', {
        type: 'button', class: 'count-row__sort', onClick: () => openFilterSheet({ showSort: true, scrollToSort: true }),
      }, `並び:${sortLabel}`, icon('chevronDown', { size: 16 })),
      st.sort === 'distance' && !state.origin ? h('span', { class: 'count-row__note', text: '現在地を取得中…' }) : null);

    if (!items.length) {
      add(listEl, emptyState({
        emoji: '🔍', title: '条件に合うお店がありません',
        action: h('button', {
          type: 'button', class: 'btn btn--secondary', text: '条件をクリア',
          onClick: () => { searchInput.value = ''; clearSearch.hidden = true; tabs.setValue('all'); setFilter(clearAll(state.filter)); },
        }),
      }));
      return;
    }
    const me = settings.nickname;
    const frag = document.createDocumentFragment();
    for (const s of items) {
      add(frag, h('div', { role: 'listitem' }, shopCard(s, {
        origin, showDistance: st.sort === 'distance', isNew: isNewShop(s, me),
      })));
    }
    add(listEl, frag);
  }

  const un1 = onShopsChange(render);
  const un2 = onFilterChange(render);
  render();

  // スクロール位置の復元
  if (state.listScroll) requestAnimationFrame(() => window.scrollTo(0, state.listScroll));
  const onScroll = () => { state.listScroll = window.scrollY; };
  window.addEventListener('scroll', onScroll, { passive: true });

  return {
    destroy() {
      un1(); un2(); onSearch.cancel();
      window.removeEventListener('scroll', onScroll);
    },
  };
}
