// =====================================================================
// S-10 設定 #/settings
// =====================================================================
import { h, icon, nextId, add } from '../dom.js';
import { appHeader, fieldLabel } from '../components.js';
import { settings, state } from '../state.js';
import { toast, confirmDialog, copyText, canShare, shareUrl, setBusy } from '../ui.js';
import { buildShareUrl, extractGroupId, APP_VERSION, csvCell, ymd } from '../utils.js';
import {
  LIMITS, isValidGroupId, CATEGORIES, TIMINGS, BUDGETS, SCENES, MOOD_TAGS, RESERVATION, PRIVATE_ROOM,
  SMOKING, PARKING, CASHLESS, PAYMENTS, KIDS_OK, labelOf, labelsOf,
} from '../schema.js';
import { isDemoMode } from '../store.js';

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, attrs: { download: filename } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const isoOrEmpty = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString() : '');

function toCsv(data) {
  const head = [
    '店名', 'カテゴリ', 'ジャンル', 'エリア', '住所', '緯度', '経度', 'URL', '予約', '個室', '喫煙', '駐車場', 'カード・電子決済', '支払い方法', '子連れ', 'その他共有事項',
    '店の登録者', '店の登録日時',
    '訪問日', 'タイミング', '人数', '予算', '実費', '利用シーン', '食べたメニュー', '味の感想', '賑やかさ', '雰囲気タグ', '雰囲気の感想', 'おすすめ度', '写真枚数', '訪問の登録者', '訪問の登録日時',
  ];
  const rows = [head];
  for (const s of data) {
    const shopCols = [
      s.name, labelOf(CATEGORIES, s.category), s.genre, s.area, s.address, s.lat ?? '', s.lng ?? '', s.url,
      labelOf(RESERVATION, s.reservation), labelOf(PRIVATE_ROOM, s.privateRoom), labelOf(SMOKING, s.smoking),
      labelOf(PARKING, s.parking), labelOf(CASHLESS, s.cashless), labelsOf(PAYMENTS, s.payments), labelOf(KIDS_OK, s.kidsOk), s.note,
      s.createdBy, isoOrEmpty(s.createdAt),
    ];
    if (!s.visits.length) rows.push([...shopCols, ...Array(15).fill('')]);
    for (const v of s.visits) {
      rows.push([...shopCols,
        v.visitedOn, labelOf(TIMINGS, v.timing), v.people ?? '', labelOf(BUDGETS, v.budget), v.priceActual ?? '',
        labelsOf(SCENES, v.scenes), v.menus || [], v.tasteComment, v.noiseLevel ?? '', labelsOf(MOOD_TAGS, v.moodTags),
        v.moodComment, v.rating, v.photoCount || 0, v.createdBy, isoOrEmpty(v.createdAt)]);
    }
  }
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function renderSettings(root, ctx) {
  const groupId = settings.groupId;
  const url = buildShareUrl(location.href, groupId);

  // ニックネーム
  const nickId = nextId('nick');
  const nickInput = h('input', {
    id: nickId, class: 'input', type: 'text', value: settings.nickname, attrs: { maxlength: String(LIMITS.NICKNAME_MAX), autocomplete: 'nickname' },
  });
  const nickErr = h('p', { class: 'field__error', hidden: true, id: nextId('err') });
  const nickSave = h('button', { type: 'button', class: 'btn btn--secondary', text: '保存', disabled: true });
  nickInput.addEventListener('input', () => { nickSave.disabled = nickInput.value.trim() === settings.nickname; nickErr.hidden = true; nickInput.removeAttribute('aria-invalid'); });
  nickSave.addEventListener('click', () => {
    const v = nickInput.value.trim();
    let msg = '';
    if (!v) msg = 'ニックネームを入力してください';
    else if (v.length > LIMITS.NICKNAME_MAX) msg = 'ニックネームは20文字以内で入力してください';
    if (msg) {
      nickErr.textContent = msg; nickErr.hidden = false;
      nickInput.setAttribute('aria-invalid', 'true'); nickInput.setAttribute('aria-describedby', nickErr.id);
      nickInput.focus();
      return;
    }
    settings.nickname = v;
    nickInput.value = v;
    nickSave.disabled = true;
    toast('ニックネームを変更しました', { type: 'success' });
  });

  // 合言葉
  const shareBtns = h('div', { class: 'btn-row btn-row--wrap' },
    canShare() ? h('button', {
      type: 'button', class: 'btn btn--secondary btn--sm',
      onClick: async () => {
        const ok = await shareUrl(url, 'ふたりの食べログの合言葉です。このURLを開くと同じ記録を見られます。');
        if (!ok) toast('共有できませんでした。URLをコピーして送ってください', { type: 'error' });
      },
    }, icon('share', { size: 18 }), '共有する') : null,
    h('button', {
      type: 'button', class: 'btn btn--secondary btn--sm',
      onClick: async () => toast((await copyText(url)) ? 'コピーしました' : 'コピーできませんでした', { type: 'success' }),
    }, icon('link', { size: 18 }), 'URLをコピー'),
    h('button', {
      type: 'button', class: 'btn btn--secondary btn--sm',
      onClick: async () => toast((await copyText(groupId)) ? 'コピーしました' : 'コピーできませんでした', { type: 'success' }),
    }, icon('copy', { size: 18 }), '合言葉をコピー'));

  // グループ切替
  async function switchGroup() {
    const id = nextId('g');
    const input = h('input', {
      id, class: 'input input--mono', type: 'text', placeholder: '新しい合言葉',
      attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' },
    });
    const err = h('p', { class: 'field__error', hidden: true });
    const content = h('div', { class: 'field' }, fieldLabel('合言葉', { forId: id }), input, err);
    let next = '';
    const ok = await confirmDialog({
      title: '別のグループに切り替えますか?',
      body: '今のグループの合言葉はこの端末から外れます(データは消えません)。戻るには今の合言葉が必要です。',
      content, okLabel: '切り替える',
      onOk: () => {
        next = extractGroupId(input.value);
        let msg = '';
        if (!next) msg = '合言葉を入力してください';
        else if (!isValidGroupId(next)) msg = '合言葉が正しくありません。受け取った文字をそのまま貼り付けてください';
        else if (next === groupId) msg = '今と同じ合言葉です';
        err.textContent = msg; err.hidden = !msg;
        if (msg) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
        return !msg;
      },
    });
    if (!ok) return;
    settings.groupId = next;
    await ctx.startGroup();
    toast('グループに参加しました', { type: 'success' });
    ctx.replace('#/list');
  }
  async function leave() {
    const ok = await confirmDialog({
      title: 'この端末からグループを外しますか?',
      body: 'データは消えません。再び使うには合言葉が必要です。',
      okLabel: '外す', danger: true,
    });
    if (ok) ctx.leaveGroup();
  }

  // 書き出し
  async function exportData(kind, btn) {
    if (!ctx.store) return;
    setBusy(btn, true, '書き出し中…');
    try {
      const data = await ctx.store.exportAll();
      const stamp = ymd().replace(/-/g, '');
      if (kind === 'json') {
        download(`futari-tabelog-${stamp}.json`, JSON.stringify({ app: 'futari-tabelog', version: APP_VERSION, exportedAt: new Date().toISOString(), shops: data }, null, 2), 'application/json');
      } else {
        download(`futari-tabelog-${stamp}.csv`, toCsv(data), 'text/csv');
      }
      toast('書き出しました', { type: 'success' });
    } catch (e) {
      console.error(e);
      toast('書き出せませんでした。通信状況を確認してください', { type: 'error' });
    } finally {
      setBusy(btn, false);
    }
  }
  const jsonBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm' }, icon('download', { size: 18 }), 'JSONで書き出す');
  const csvBtn = h('button', { type: 'button', class: 'btn btn--secondary btn--sm' }, icon('download', { size: 18 }), 'CSVで書き出す');
  jsonBtn.addEventListener('click', () => exportData('json', jsonBtn));
  csvBtn.addEventListener('click', () => exportData('csv', csvBtn));

  // ホーム画面に追加の説明
  const a2hsId = nextId('a2hs');
  const a2hsBody = h('div', { id: a2hsId, class: 'a2hs', hidden: true },
    h('p', {}, h('strong', { text: 'iPhone(Safari)' }), ':画面下の共有ボタン → 「ホーム画面に追加」'),
    h('p', {}, h('strong', { text: 'Android(Chrome)' }), ':右上の︙メニュー → 「ホーム画面に追加」または「アプリをインストール」'));
  const a2hsBtn = h('button', {
    type: 'button', class: 'row-link', aria: { expanded: 'false', controls: a2hsId },
    onClick: () => {
      const open = a2hsBtn.getAttribute('aria-expanded') !== 'true';
      a2hsBtn.setAttribute('aria-expanded', String(open));
      a2hsBody.hidden = !open;
    },
  }, h('span', { text: 'ホーム画面に追加すると全画面で使えます' }), icon('chevronDown', { size: 18, class: 'row-link__chev' }));

  const sec = (title, ...children) => h('section', { class: 'settings-sec' }, h('h2', { class: 'section-title', text: title }), ...children);

  add(root, 
    appHeader({ title: '設定' }),
    h('main', { class: 'page page--settings' },
      sec('ニックネーム',
        h('div', { class: 'field' },
          h('label', { class: 'visually-hidden', for: nickId, text: 'ニックネーム' }),
          h('div', { class: 'input-row' }, nickInput, nickSave),
          nickErr,
          h('p', { class: 'field__help', text: '今後の記録に使われます(過去の記録は変わりません)' }))),
      sec('合言葉(グループ)',
        h('div', { class: 'passphrase', text: groupId, attrs: { translate: 'no' } }),
        shareBtns,
        h('p', { class: 'note-warn', text: '合言葉を知っている人は誰でも閲覧・編集できます' })),
      sec('グループ',
        h('button', { type: 'button', class: 'row-link', onClick: switchGroup }, h('span', { text: '別の合言葉に切り替える' }), icon('chevronRight', { size: 18 })),
        h('button', { type: 'button', class: 'btn btn--danger-ghost', onClick: leave }, icon('trash', { size: 18 }), 'この端末からグループを外す')),
      sec('データ',
        h('div', { class: 'btn-row btn-row--wrap' }, jsonBtn, csvBtn),
        h('p', { class: 'field__help', text: `登録店 ${state.shops.length}件。写真は含まれません` })),
      sec('アプリについて',
        h('dl', { class: 'info-list' },
          h('div', { class: 'info-list__row' }, h('dt', { text: 'バージョン' }), h('dd', { class: 'num', text: APP_VERSION })),
          h('div', { class: 'info-list__row' }, h('dt', { text: '保存先' }), h('dd', { text: isDemoMode() ? 'デモモード(この端末のみ)' : 'Firebase Cloud Firestore' }))),
        a2hsBtn, a2hsBody,
        h('p', { class: 'credits' },
          '地図データ ',
          h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener noreferrer', text: '© OpenStreetMap contributors' })),
        h('p', { class: 'credits' },
          '住所検索 ',
          h('a', { href: 'https://nominatim.org/', target: '_blank', rel: 'noopener noreferrer', text: 'Nominatim' }),
          '、地図表示 ',
          h('a', { href: 'https://leafletjs.com/', target: '_blank', rel: 'noopener noreferrer', text: 'Leaflet' })))));
  return {};
}
