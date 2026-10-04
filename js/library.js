/* 라이브러리 : 최근 꺼낸 게임(카트리지 선반) + 전체 라이브러리(케이스) + 펼친 케이스 */
import { $, $$, h, esc, stars, cart, artStyle, darken, reduced, CART_SVG, md } from './util.js';
import { GAMES, RECENT, MUSIC, lastDate, lastAt } from './store.js';
import { openOverlay, closeOverlay } from './shell.js';
import { startInsert } from './insert.js';
import { openReader } from './game.js';

$('#libCount').textContent = GAMES.length + ' GAMES';

/* ---------- 선반 ---------- */
const track = $('#shelfTrack');
RECENT.forEach(g => {
  const b = h(`<button type="button" class="shelf-item lift" aria-label="${esc(g.name)} — 기록 ${g.posts.length}편">
    ${cart(g, 124)}<span class="tx"><span class="nm">${esc(g.name)}</span><span class="sv">${g.posts.length} SAVES</span></span></button>`);
  b.addEventListener('click', () => openCase(g, b));
  track.appendChild(b);
});
const prev = $('.shelf-btn.prev'), next = $('.shelf-btn.next');
function edges() {
  const max = track.scrollWidth - track.clientWidth;
  prev.setAttribute('aria-disabled', String(track.scrollLeft <= 2));
  next.setAttribute('aria-disabled', String(track.scrollLeft >= max - 2));
}
track.addEventListener('scroll', edges, { passive: true });
addEventListener('resize', edges);
requestAnimationFrame(edges);

/* 한 번 = 한 칸, 꾹 = 연속. 손을 뗀 뒤의 click은 무시한다 */
let held = false, holdT = 0, raf = 0;
function stopHold() { clearTimeout(holdT); cancelAnimationFrame(raf); }
[[prev, -1], [next, 1]].forEach(([btn, d]) => {
  btn.addEventListener('click', () => {
    if (held) { held = false; return; }
    track.scrollBy({ left: d * 164, behavior: reduced ? 'auto' : 'smooth' });
  });
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    held = false; stopHold();
    holdT = setTimeout(() => {
      held = true;
      const step = () => {
        track.scrollLeft += d * 11;
        const max = track.scrollWidth - track.clientWidth;
        if ((d < 0 && track.scrollLeft <= 0) || (d > 0 && track.scrollLeft >= max)) return;
        raf = requestAnimationFrame(step);
      };
      step();
    }, 320);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => btn.addEventListener(t, stopHold));
});

/* ---------- 케이스 ---------- */
export function caseHTML(g) {
  const r = g.review, n = g.posts.length;
  const label = `${g.name} — ${r ? r.rating.toFixed(1) + '점' : '리뷰 없음'}${n ? ', 기록 ' + n + '편' : ''}`;
  const metaL = n ? lastDate(g).slice(0, 4) : (r && r.year ? r.year : '');
  const metaR = n ? '기록 ' + n : (r && r.hours ? r.hours + 'H' : '');
  return `<button type="button" class="case-card ch" data-id="${esc(g.id)}" aria-label="${esc(label)}">
  <div class="case"><span class="hinge"></span>
    <div class="band"><span class="wm">PLAY<i>LOG</i></span><span class="sw" style="background:${g.color}"></span></div>
    <div class="cover${g.img ? ' img' : ''}" style="${artStyle(g, true)}">
      ${n ? `<span class="saves">${CART_SVG}${n} SAVES</span>` : ''}
      ${r ? `<span class="sticker"><b>${r.rating.toFixed(1)}</b><span>★★★★★</span></span>` : ''}
      <span class="title">${esc(g.name)}</span>
    </div>
    <span class="gloss"></span>
  </div>
  <span class="case-meta"><span>${esc(metaL)}</span><span>${esc(metaR)}</span></span>
</button>`;
}

const state = { filter: 'all', sort: 'recent', all: false, q: '' };
/* 대소문자 · 띄어쓰기 무시. 이름과 별칭(aliases)에서 찾는다 */
export const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
const matches = (g, q) => !q || [g.name, ...(g.aliases || [])].some(x => norm(x).includes(q));
const PAGE = 12;
const recency = g => lastAt(g) || (g.review && g.review.year ? String(g.review.year) : '');
const SORTS = {
  recent: (a, b) => recency(b).localeCompare(recency(a)),
  rating: (a, b) => (b.review ? b.review.rating : -1) - (a.review ? a.review.rating : -1),
  name: (a, b) => a.name.localeCompare(b.name, 'ko')
};
const nRec = GAMES.filter(g => g.posts.length).length;
function chips(host, items, key) {
  host.innerHTML = items.map(([v, t]) =>
    `<button type="button" class="chip" data-v="${v}" aria-pressed="${state[key] === v}">${t}</button>`).join('');
  $$('.chip', host).forEach(b => b.addEventListener('click', () => { state[key] = b.dataset.v; state.all = false; renderCases(); }));
}
function renderCases() {
  chips($('#libFilter'), [['all', `전체<i>${GAMES.length}</i>`], ['rec', `기록 있음<i>${nRec}</i>`]], 'filter');
  chips($('#libSort'), [['recent', '최근순'], ['rating', '별점순'], ['name', '이름순']], 'sort');
  const q = norm(state.q);
  let list = GAMES.filter(g => (state.filter === 'all' || g.posts.length) && matches(g, q)).sort(SORTS[state.sort]);
  const total = list.length;
  if (!state.all && !q) list = list.slice(0, PAGE);
  $('#casesShown').textContent = q ? `${total}개 찾음` : '';
  const empty = $('#casesEmpty');
  empty.hidden = total > 0;
  empty.textContent = `‘${state.q.trim()}’와 맞는 게임이 없어요. 영문 이름이나 한글 이름으로 찾아보세요.`;
  const host = $('#cases');
  host.innerHTML = list.map(caseHTML).join('');
  $$('.case-card', host).forEach(b => b.addEventListener('click', () => openCase(GAMES.find(g => g.id === b.dataset.id), b)));
  /* 모두 보기 ↔ 접기 */
  const more = $('#casesMore');
  more.hidden = !!q || total <= PAGE;
  more.textContent = state.all ? '접기' : `${total}개 모두 보기`;
  more.setAttribute('aria-expanded', String(state.all));
}
$('#casesMore').addEventListener('click', () => {
  const folding = state.all;
  state.all = !state.all; renderCases();
  /* 접을 때는 목록 위로 돌아가 버튼만 덩그러니 남지 않게 */
  if (folding) scrollTo({ top: $('#libFilter').getBoundingClientRect().top + scrollY - 96, behavior: reduced ? 'auto' : 'smooth' });   // 위쪽 메뉴에 가리지 않게
});
export function bindSearch(input, onChange) {
  const box = input.closest('.search'), clear = box.querySelector('.s-clear');
  const sync = () => { const has = !!input.value; box.classList.toggle('has', has); clear.hidden = !has; };
  input.addEventListener('input', () => { sync(); onChange(input.value); });
  input.addEventListener('keydown', e => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; sync(); onChange(''); } });
  clear.addEventListener('click', () => { input.value = ''; sync(); onChange(''); input.focus(); });
}
bindSearch($('#libQ'), v => { state.q = v; renderCases(); });
renderCases();

/* ---------- 펼친 케이스 ---------- */
const wrap = $('#caseWrap'), open = $('#caseOpen');
const HOLE = '<svg width="30" height="36" viewBox="0 0 11 13" fill="none" aria-hidden="true"><path d="M1 1.6C1 1.27 1.27 1 1.6 1h7.8c.33 0 .6.27.6.6v8.2c0 .2-.1.38-.26.49l-1.6 1.06a.6.6 0 0 1-.33.1H1.6a.6.6 0 0 1-.6-.6V1.6Z" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/></svg>';

/* 표지의 게임 정보 : 출시일 · 장르 / 공식 플랫폼 */
const info = g => {
  const top = [g.release, g.genre].filter(Boolean).join(' · ');
  return (top ? `<span class="co-meta">${esc(top)}</span>` : '')
    + (g.platforms && g.platforms.length ? `<span class="co-plat">${g.platforms.map(esc).join(' · ')}</span>` : '');
};

/* 공식 사이트 바로가기 (게임 정보 칸의 마지막) — PLAYLOG 는 사이트 자체라 저장소로 */
export const siteLink = g => g.site ? `<a class="co-site" href="${esc(g.site)}" target="_blank" rel="noopener">${/github\.com/.test(g.site) ? 'GitHub 저장소에서 보기' : '공식 사이트에서 더 보기'}<span aria-hidden="true">↗</span><span class="sr">(새 창)</span></a>` : '';

export function openCase(g, opener) {
  const r = g.review, n = g.posts.length;
  const stats = [];
  if (r && r.year) stats.push(['PLAYED', r.year]);
  if (r && r.hours) stats.push(['TIME', r.hours + 'H']);
  if (n) stats.push(['SAVES', n + '편'], ['LAST SAVE', lastDate(g)]);
  const left = `<div class="co-left">
    <div class="co-cover${g.img ? ' img' : ''}" style="${g.img ? artStyle(g) : 'background:' + darken(g.color)}">
      ${r ? `<span class="sticker"><b>${r.rating.toFixed(1)}</b><span>★★★★★</span></span>` : ''}
      <div class="cap"><h2 id="caseName">${esc(g.name)}</h2>${info(g)}</div>
    </div>
    <div class="co-body">
      ${stats.length || r ? `<div class="co-stats">${stats.map(([k, v]) => `<div><span class="sys">${k}</span><b>${esc(v)}</b></div>`).join('')}
        ${r ? `<div><span class="sys">RATING</span><span style="padding-top:4px">${stars(r.rating, 16)}</span></div>` : ''}</div>` : ''}
      ${r ? `<div class="co-review"><span class="sys">ONE-LINE REVIEW</span><p>${esc(r.text)}</p></div>`
          : '<div class="co-empty"><span class="sys">ONE-LINE REVIEW</span><span>아직 한줄 리뷰가 없어요</span></div>'}
      ${siteLink(g)}
    </div>
  </div>`;
  const posts = g.posts.slice(0, 3);
  /* 오른쪽 트레이 : 왼쪽 위 카트리지(+ 짧은 안내), 그 아래 추천곡 바로가기, 오른쪽 기록 목록. 기록이 없어도 같은 모양 */
  const songs = MUSIC.filter(m => m.game === g.id).length;
  const seat = n
    ? `<div class="seat"><button type="button" class="lift" data-act="insert" data-autofocus aria-label="${esc(g.name)} 카트리지 꽂기 — 기록 ${n}편 보기">${cart(g, 150)}</button></div>
       <p class="seat-hint">카트리지를 누르면 꽂혀서 이 게임의 기록을 모두 볼 수 있어요.</p>`
    : `<div class="seat"><div class="hole">${HOLE}</div></div>
       <p class="seat-hint">기록을 남기면 이곳에 카트리지가 생겨요.</p>`;
  const right = `<div class="co-right"><div class="seat-row">
    <div class="seat-col">${seat}
      ${songs ? `<button type="button" class="co-music" data-act="music"><span class="sys">MUSIC</span><b>추천곡 ${songs}곡</b><span class="go" aria-hidden="true">음악에서 보기 →</span></button>` : ''}
    </div>
    <div class="co-saves"><span class="sys">SAVES</span>
      ${n ? posts.map((p, i) => `<button type="button" class="co-post" data-post="${i}"><span>${esc(p.t)}</span><span>${md(p.d)}</span></button>`).join('')
          : `<div class="co-saves-empty"><b>아직 기록이 없어요</b><span>${r ? '이 게임은 한줄 리뷰만 남겨 두었어요.' : '기록을 준비하고 있어요.'}</span></div>`}
      ${n > 3 ? `<span class="co-more">외 ${n - 3}편 더 — 카트리지를 꽂으면 모두 보여요</span>` : ''}
    </div>
  </div></div>`;
  const front = `<div class="co-front shell" aria-hidden="true"><span class="ridge"></span>
    <div class="fband"><span class="wm">PLAY<i>LOG</i></span><span class="sw" style="background:${g.color}"></span></div>
    <div class="fcov${g.img ? ' img' : ''}" style="${g.img ? artStyle(g) : 'background:' + darken(g.color)}">
      ${n ? `<span class="saves">${n} SAVES</span>` : ''}${r ? `<span class="sticker"><b>${r.rating.toFixed(1)}</b><span>★★★★★</span></span>` : ''}
      <b>${esc(g.name)}</b></div><span class="gloss"></span></div>`;
  open.innerHTML = `<div class="co-flip"><div class="co-in shell">${left}</div>${front}</div>`
    + `<div class="co-tray shell"><div class="co-hinge" aria-hidden="true"><i></i><i></i><i></i><i></i></div>${right}</div>`;
  $$('[data-act="insert"]', open).forEach(b => b.addEventListener('click', () => { closeOverlay(wrap); startInsert(g); }));
  $$('[data-post]', open).forEach(b => b.addEventListener('click', () => openReader(posts[+b.dataset.post])));
  /* 추천곡 : 음악 화면을 열고 검색창에 게임 이름을 넣어 둔다 */
  $$('[data-act="music"]', open).forEach(b => b.addEventListener('click', () => {
    closeOverlay(wrap);
    location.hash = '#/music';
    requestAnimationFrame(() => { const q = $('#musicQ'); q.value = g.name; q.dispatchEvent(new Event('input')); });
  }));
  /* 닫힌 케이스로 나타났다가 표지가 경첩을 축으로 넘어간다 (넓은 화면에서만) */
  clearTimeout(flipT);
  const animate = !reduced && innerWidth > 720;
  open.classList.toggle('closed', animate);
  openOverlay(wrap, opener);
  if (animate) flipT = setTimeout(() => open.classList.remove('closed'), 320);
}
let flipT = 0;
export const closeCase = () => closeOverlay(wrap);
