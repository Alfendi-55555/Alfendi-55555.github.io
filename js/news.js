/* 게임 소식 : Steam(게임별 공식 공지) + 닌텐도 코리아 뉴스 — scripts/build.py 가 하루 두 번 모아 온다 */
import { $, $$, h, esc, artStyle, imgStyle } from './util.js';
import { NEWS, NEWS_UPDATED, NEWS_MAX, BY_ID } from './store.js';
import { bindSearch, norm } from './library.js';

const state = { scope: 'all', src: null, game: null, q: '', allGames: false };
const NEUTRAL = '#9BA8B8';
const GAMES_SHOWN = 5;          /* 게임 필터는 이만큼만 보이고 나머지는 '더 보기' */
const SRC = [...new Set(NEWS.map(n => n.srcName))];
/* NEWS는 최신순이라 처음 나온 순서 = 최근 소식이 있는 게임 순 */
const GAMES_WITH_NEWS = [...new Set(NEWS.filter(n => n.game).map(n => n.game))].map(id => BY_ID.get(id)).filter(Boolean);

/* 방문자 기준 NEW : 소식 페이지에서 본 소식의 주소를 이 브라우저에만 기억한다.
   처음 온 방문자는 기록이 없으므로 NEW를 세지 않는다(전부 NEW가 되지 않게). */
const SEEN_KEY = 'playlog.newsSeen';
function readSeen() {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY)); return Array.isArray(v) ? new Set(v) : null; }
  catch { return null; }
}
function writeSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(NEWS.map(n => n.url))); } catch { /* 저장 못 해도 화면은 그대로 */ }
}
const seenAtLoad = readSeen();
export const isNew = n => !!seenAtLoad && !seenAtLoad.has(n.url);
export const newCount = () => { const s = readSeen(); return s ? NEWS.filter(n => !s.has(n.url)).length : 0; };

export const newsColor = n => BY_ID.get(n.game)?.color || NEUTRAL;
export const newsWho = n => n.gameName || n.srcName;

function dayLabel(d) {
  const t = new Date(), y = new Date(Date.now() - 86400000);
  const f = x => `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}`;
  if (d === f(t)) return '오늘';
  if (d === f(y)) return '어제';
  const [, m, dd] = d.split('.');
  return `${+m}월 ${+dd}일`;
}

function side() {
  const item = (grp, v, label, count, sw) =>
    `<button type="button" class="side-item" data-grp="${grp}" data-v="${esc(v ?? '')}" aria-pressed="${state[grp] === v}">
      ${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}<span class="n">${esc(label)}</span><span class="c">${count}</span></button>`;
  $('#newsScope').innerHTML =
    item('scope', 'all', '전체', NEWS.length) +
    item('scope', 'mine', '내 라이브러리', NEWS.filter(n => n.game).length);
  $('#newsSrc').innerHTML = SRC.map(s => item('src', s, s, NEWS.filter(n => n.srcName === s).length)).join('');
  /* 고른 게임은 맨 위로 — 해제하기 쉽게 */
  const sel = GAMES_WITH_NEWS.find(g => g.id === state.game);
  const rest = GAMES_WITH_NEWS.filter(g => g !== sel);
  const shown = state.allGames ? rest : rest.slice(0, GAMES_SHOWN - (sel ? 1 : 0));
  const more = rest.length - shown.length;
  $('#newsGames').innerHTML = [sel, ...shown].filter(Boolean)
    .map(g => item('game', g.id, g.name, NEWS.filter(n => n.game === g.id).length, g.color)).join('')
    + (more > 0 ? `<button type="button" class="side-more" data-more="1">게임 ${more}개 더 보기</button>`
      : state.allGames && rest.length > GAMES_SHOWN ? '<button type="button" class="side-more" data-more="0">접기</button>' : '');
  $('#newsGames').closest('.side-grp').hidden = !GAMES_WITH_NEWS.length;
  $$('.side-item', $('#news')).forEach(b => b.addEventListener('click', () => {
    const grp = b.dataset.grp, v = b.dataset.v;
    if (grp === 'scope') { state.scope = v; state.src = null; state.game = null; }
    else state[grp] = state[grp] === v ? null : v;          /* 출처와 게임은 함께 걸 수 있다 */
    render();
  }));
  $('.side-more', $('#news'))?.addEventListener('click', e => { state.allGames = e.currentTarget.dataset.more === '1'; render(); });
  /* 모바일 필터 요약 */
  const on = [state.scope === 'mine' && '내 라이브러리', state.src, sel?.name].filter(Boolean);
  $('#newsFilterSum').textContent = on.length ? on.join(' · ') : '전체';
  $('#newsFilterTog').classList.toggle('on', !!on.length);
}

$('#newsFilterTog').addEventListener('click', e => {
  const open = e.currentTarget.getAttribute('aria-expanded') !== 'true';
  e.currentTarget.setAttribute('aria-expanded', open);
  $('#newsFilters').classList.toggle('open', open);
});

function render() {
  side();
  const nq = norm(state.q);
  const list = NEWS.filter(n => (state.scope === 'all' || n.game)
    && (!state.src || n.srcName === state.src) && (!state.game || n.game === state.game)
    && (!nq || norm([n.t, n.sub, n.gameName, ...(BY_ID.get(n.game)?.aliases || []), n.srcName].join(' ')).includes(nq)));
  $('#newsCount').textContent = list.length + '건';
  const host = $('#newsList'); host.innerHTML = '';
  if (!list.length) host.appendChild(h(`<p class="empty-note">${nq ? `‘${esc(state.q.trim())}’가 들어간 소식이 없어요.` : '조건에 맞는 소식이 없어요.'}</p>`));
  /* 해가 바뀌는 곳에만 연도 구분선 — 올해 소식에는 붙이지 않는다 */
  let day = '', year = String(new Date().getFullYear());
  list.forEach(n => {
    const y = n.d.slice(0, 4);
    if (y !== year) { year = y; host.appendChild(h(`<div class="year-mark"><b>${y}</b><span></span></div>`)); }
    if (n.d !== day) { day = n.d; host.appendChild(h(`<div class="month"><b>${dayLabel(n.d)}</b><span></span></div>`)); }
    const g = BY_ID.get(n.game);
    const th = n.img ? imgStyle(n.img) : g ? artStyle(g) : `background:${NEUTRAL}`;   /* 기사 이미지 우선 */
    host.appendChild(h(`<a class="post-row news-item ch" href="${esc(n.url)}" target="_blank" rel="noopener">
      <span class="dt">${n.d.slice(5)}</span>
      <span class="mid">
        <span class="gm"><i style="background:${newsColor(n)}"></i>${esc(newsWho(n))}${isNew(n) ? '<span class="new-b">NEW</span>' : ''}</span>
        <span class="t">${esc(n.t)}</span>
        ${n.sub ? `<span class="ex">${esc(n.sub)}</span>` : ''}
        <span class="tg"><span class="src-b">${esc(n.srcName)}</span><span>원문 보기 ↗</span></span>
      </span>
      <span class="th" style="${th}"></span></a>`));
  });
  $('#newsUpd').innerHTML = `
    ${NEWS_UPDATED ? `<span class="upd"><b>마지막 갱신</b>${esc(NEWS_UPDATED)}</span>` : ''}
    <span>하루 두 번 새 소식을 모아 와요.<br>최근 ${NEWS_MAX}개까지 보여 줘요.</span>
    <span><b>Nintendo</b> 닌텐도 코리아 소식 전체</span>
    <span><b>Steam</b> 라이브러리 게임의 공식 공지</span>`;
}
bindSearch($('#newsQ'), v => { state.q = v; render(); });
render();
/* 소식 페이지를 열면 지금 목록을 '본 것'으로 기록하고 홈의 NEW를 갱신한다.
   이번 화면의 NEW 표시는 다시 들어올 때까지 남겨 둔다. */
addEventListener('hashchange', () => { if (location.hash.startsWith('#/news')) { writeSeen(); dispatchEvent(new Event('newsseen')); } });
if (location.hash.startsWith('#/news')) writeSeen();
