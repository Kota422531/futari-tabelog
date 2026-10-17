// =====================================================================
// S-01 初期設定 #/setup
// =====================================================================
import { h, icon, nextId, add } from '../dom.js';
import { fieldLabel, fieldError } from '../components.js';
import { settings } from '../state.js';
import { toast, copyText, canShare, shareUrl } from '../ui.js';
import { generateGroupId, extractGroupId, buildShareUrl } from '../utils.js';
import { isValidGroupId, LIMITS } from '../schema.js';
import { isDemoMode } from '../store.js';

function validateNickname(v) {
  if (!v) return 'ニックネームを入力してください';
  if (v.length > LIMITS.NICKNAME_MAX) return 'ニックネームは20文字以内で入力してください';
  return '';
}
function validateGroup(v) {
  if (!v) return '合言葉を入力してください';
  if (!isValidGroupId(v)) return '合言葉が正しくありません。受け取った文字をそのまま貼り付けてください';
  return '';
}

function setError(input, errEl, msg) {
  errEl.textContent = msg;
  errEl.hidden = !msg;
  if (msg) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errEl.id);
  } else {
    input.removeAttribute('aria-invalid');
  }
}

export function renderSetup(root, ctx) {
  const invited = ctx.invitedGroupId;
  const hasGroupOnly = !invited && !!settings.groupId && !settings.nickname;

  const nickId = nextId('nick');
  const nickErr = fieldError(nextId('err'));
  const nickInput = h('input', {
    id: nickId, class: 'input', type: 'text', value: settings.nickname,
    attrs: { maxlength: String(LIMITS.NICKNAME_MAX), autocomplete: 'nickname', enterkeyhint: 'done' },
    placeholder: '例:こうた',
    onInput: () => { if (nickInput.getAttribute('aria-invalid')) setError(nickInput, nickErr, validateNickname(nickInput.value.trim())); },
  });

  const groupId = nextId('group');
  const groupErr = fieldError(nextId('err'));
  const groupInput = h('input', {
    id: groupId, class: 'input input--mono', type: 'text', value: invited || '',
    attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'go' },
    placeholder: '受け取った合言葉', onInput: () => {
      if (groupInput.getAttribute('aria-invalid')) setError(groupInput, groupErr, validateGroup(extractGroupId(groupInput.value)));
    },
  });

  function checkNick() {
    const v = nickInput.value.trim();
    const e = validateNickname(v);
    setError(nickInput, nickErr, e);
    if (e) nickInput.focus();
    return e ? null : v;
  }

  // --- 新しく始める ---
  const createBtn = h('button', {
    type: 'button', class: 'btn btn--primary btn--block', text: '新しく始める',
    onClick: () => {
      const nick = checkNick();
      if (!nick) return;
      const g = generateGroupId(24);
      settings.nickname = nick;
      settings.groupId = g;
      ctx.startGroup().then(() => ctx.store && ctx.store.createGroup());
      toast('合言葉を作成しました', { type: 'success' });
      showCreated(g);
    },
  });

  // --- 参加する ---
  const joinBtn = h('button', {
    type: 'button', class: ['btn', invited ? 'btn--primary' : 'btn--secondary', 'btn--block'], text: '参加する',
    onClick: join,
  });
  groupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); join(); } });

  async function join() {
    const nick = checkNick();
    if (!nick) return;
    const g = extractGroupId(groupInput.value);
    const e = validateGroup(g);
    setError(groupInput, groupErr, e);
    if (e) { groupInput.focus(); return; }
    settings.nickname = nick;
    settings.groupId = g;
    ctx.invitedGroupId = '';
    await ctx.startGroup();
    toast('グループに参加しました', { type: 'success' });
    ctx.replace('#/list');
  }

  // --- ニックネームのみ(稀) ---
  const startBtn = h('button', {
    type: 'button', class: 'btn btn--primary btn--block', text: 'はじめる',
    onClick: async () => {
      const nick = checkNick();
      if (!nick) return;
      settings.nickname = nick;
      await ctx.startGroup();
      ctx.replace('#/list');
    },
  });

  const nickField = h('div', { class: 'field' },
    fieldLabel('ニックネーム', { required: true, forId: nickId }),
    nickInput,
    h('p', { class: 'field__help', text: '記録に「登録者」として表示されます' }),
    nickErr);

  const heading = invited ? '招待されたグループに参加します' : 'ふたりの食べログ';

  const card = h('div', { class: 'setup__card' },
    nickField,
    hasGroupOnly ? h('div', { class: 'setup__block' }, startBtn) : [
      !invited ? h('div', { class: 'setup__block' },
        createBtn,
        h('p', { class: 'field__help setup__center', text: '合言葉を作って、相手に送ります' })) : null,
      !invited ? h('div', { class: 'setup__divider' }, h('span', { text: 'すでに合言葉をもらった方' })) : null,
      h('div', { class: 'setup__block' },
        h('div', { class: 'field' },
          fieldLabel('合言葉', { forId: groupId }),
          groupInput,
          groupErr),
        joinBtn),
    ]);

  const page = h('main', { class: 'page page--setup' },
    h('div', { class: 'setup__hero' },
      h('div', { class: 'setup__mark', aria: { hidden: 'true' } }, h('img', { src: './icons/icon.svg', alt: '', width: 72, height: 72 })),
      h('h1', { class: 'setup__title', text: heading, tabindex: '-1' }),
      h('p', { class: 'setup__lead', text: invited ? 'ニックネームを入力して参加してください' : '行ってよかったお店を、みんなで記録' }),
      isDemoMode() ? h('p', { class: 'setup__demo', text: 'デモモードです。データはこの端末の中だけに保存されます。' }) : null),
    card);

  add(root, page);
  if (!settings.nickname) requestAnimationFrame(() => nickInput.focus({ preventScroll: true }));

  // --- 作成完了ステップ ---
  function showCreated(g) {
    const url = buildShareUrl(location.href, g);
    page.replaceChildren(
      h('div', { class: 'setup__hero' },
        h('h1', { class: 'setup__title', text: '合言葉ができました', tabindex: '-1' })),
      h('div', { class: 'setup__card' },
        h('div', { class: 'passphrase', text: g, attrs: { translate: 'no' } }),
        h('div', { class: 'btn-row' },
          canShare() ? h('button', {
            type: 'button', class: 'btn btn--secondary',
            onClick: async () => {
              const ok = await shareUrl(url, 'ふたりの食べログの合言葉です。このURLを開くと同じ記録を見られます。');
              if (!ok) toast('共有できませんでした。URLをコピーして送ってください', { type: 'error' });
            },
          }, icon('share', { size: 20 }), '共有する') : null,
          h('button', {
            type: 'button', class: 'btn btn--secondary',
            onClick: async () => toast((await copyText(url)) ? 'コピーしました' : 'コピーできませんでした', { type: 'success' }),
          }, icon('copy', { size: 20 }), 'URLをコピー')),
        h('p', { class: 'field__help', text: '相手にURLを送ると同じ記録を見られます' }),
        h('p', { class: 'note-warn', text: '合言葉を知っている人は誰でも閲覧・編集できます。信頼できる人だけに送ってください' }),
        h('button', { type: 'button', class: 'btn btn--primary btn--block', text: 'はじめる', onClick: () => ctx.replace('#/list') })));
    page.querySelector('h1').focus();
  }

  return {};
}
