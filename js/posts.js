/* 전체 글 : 게임을 거치지 않는 입구 */
import { $, $$, h, esc, artStyle, imgStyle, excerpt } from './util.js';
import { POSTS, GAMES } from './store.js';
import { openReader } from './game.js';

const state = { game: null, tag: null };
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
  const list = POSTS.filter(p => (!state.game || p.game.id === state.game) && (!state.tag || p.tags.includes(state.tag)));
  $('#postsCount').textContent = list.length + ' SAVES';
  const tl = $('#timeline'); tl.innerHTML = '';
  if (!list.length) { tl.appendChild(h('<p class="empty-note">조건에 맞는 글이 없어요.</p>')); return; }
  let month = '';
  list.forEach(p => {
    const m = p.d.slice(0, 7);
    if (m !== month) { month = m; tl.appendChild(h(`<div class="month"><b>${m}</b><span></span></div>`)); }
    const g = p.game;
    const b = h(`<button type="button" class="post-row ch">
      <span class="dt">${p.d.slice(5)}</span>
      <span class="mid"><span class="gm"><i style="background:${g.color}"></i>${esc(g.name)}</span>
        <span class="t">${esc(p.t)}</span><span class="ex">${esc(excerpt(p))}</span>
        ${p.tags.length ? `<span class="tg">${p.tags.map(t => '#' + esc(t)).join(' ')}</span>` : ''}</span>
      <span class="th" style="${p.cover ? imgStyle(p.cover) : artStyle(g)}"></span></button>`);
    b.addEventListener('click', () => openReader(p));
    tl.appendChild(b);
  });
}
render();
