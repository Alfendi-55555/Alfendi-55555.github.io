/* 전체 글 : 게임을 거치지 않는 입구 */
import { $, $$, h, esc, artStyle, imgStyle, excerpt } from './util.js';
import { POSTS, GAMES } from './store.js';
import { openReader } from './game.js';
import { bindSearch, norm } from './library.js';

const state = { game: null, tag: null, q: '' };
/* 검색 대상 : 제목 · 본문 전체 · 게임 이름과 별칭 · 태그 */
const body = p => (p.blocks || []).map(b => b.text || b.caption || '').join(' ');
POSTS.forEach(p => { p._hay = norm([p.t, body(p), p.game.name, ...(p.game.aliases || []), ...p.tags].join(' ')); });
/* 띄어쓰기를 무시하고 원문에서 검색어 위치를 찾는다 */
function locate(text, q) {
  if (!q) return null;
  const idx = [], chars = [];
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { idx.push(i); chars.push(text[i].toLowerCase()); }
  const k = chars.join('').indexOf(q);
  return k < 0 ? null : [idx[k], idx[k + q.length - 1] + 1];
}
const mark = (text, q) => { const r = locate(text, q); return r ? esc(text.slice(0, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>' + esc(text.slice(r[1])) : esc(text); };
function snippet(p, q) {
  const t = body(p).replace(/\s+/g, ' ').trim(), r = locate(t, q);
  if (!r) return esc(excerpt(p));
  const a = Math.max(0, r[0] - 30), b = Math.min(t.length, r[1] + 60);
  return (a > 0 ? '…' : '') + mark(t.slice(a, b), q) + (b < t.length ? '…' : '');
}
const withPosts = GAMES.filter(g => g.posts.length);
const tagCount = {};
POSTS.forEach(p => p.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([t]) => t);

function side() {
  const gl = $('#postsGames');
  gl.innerHTML = [[null, '전체', '#8F9BA5', POSTS.length], ...withPosts.map(g => [g.id, g.name, g.color, g.posts.length])]
    .map(([id, n, c, k]) => `<button type="button" class="side-item" data-g="${id ?? ''}" aria-pressed="${state.game === id}">
      <span class="sw" style="background:${c}"></span><span class="n">${esc(n)}</span><span class="c">${k}</span></button>`).join('');
  $$('.side-item', gl).forEach(b => b.addEventListener('click', () => { state.game = b.dataset.g || null; render(); }));
  const tl = $('#postsTags');
  tl.innerHTML = tags.map(t => `<button type="button" class="chip" data-t="${esc(t)}" aria-pressed="${state.tag === t}">#${esc(t)}</button>`).join('');
  $$('.chip', tl).forEach(b => b.addEventListener('click', () => { state.tag = state.tag === b.dataset.t ? null : b.dataset.t; render(); }));
}

function render() {
  side();
  const q = norm(state.q);
  const list = POSTS.filter(p => (!state.game || p.game.id === state.game) && (!state.tag || p.tags.includes(state.tag)) && (!q || p._hay.includes(q)));
  $('#postsCount').textContent = (q || state.game || state.tag) ? `${list.length} / ${POSTS.length} SAVES` : POSTS.length + ' SAVES';
  const tl = $('#timeline'); tl.innerHTML = '';
  if (!list.length) {
    tl.appendChild(h(`<p class="empty-note">${q ? `‘${esc(state.q.trim())}’가 들어간 글이 없어요.` : '조건에 맞는 글이 없어요.'}</p>`));
    return;
  }
  let month = '';
  list.forEach(p => {
    const m = p.d.slice(0, 7);
    if (m !== month) { month = m; tl.appendChild(h(`<div class="month"><b>${m}</b><span></span></div>`)); }
    const g = p.game;
    const b = h(`<button type="button" class="post-row ch">
      <span class="dt">${p.d.slice(5)}</span>
      <span class="mid"><span class="gm"><i style="background:${g.color}"></i>${esc(g.name)}</span>
        <span class="t">${mark(p.t, q)}</span><span class="ex">${p.spoiler != null   /* 스포일러 글은 목록에서 본문을 미리 보여 주지 않는다 */
          ? `<span class="spoil-tag">스포일러</span>${p.spoiler ? esc(p.spoiler) + ' 내용이 있어요' : '게임 내용이 드러나는 글이에요'}`
          : q ? snippet(p, q) : esc(excerpt(p))}</span>
        ${p.tags.length ? `<span class="tg">${p.tags.map(t => '#' + esc(t)).join(' ')}</span>` : ''}</span>
      <span class="th" style="${p.cover ? imgStyle(p.cover) : artStyle(g)}"></span></button>`);
    b.addEventListener('click', () => openReader(p));
    tl.appendChild(b);
  });
}
bindSearch($('#postQ'), v => { state.q = v; render(); });
render();
