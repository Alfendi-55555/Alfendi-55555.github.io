/* 음악 : 오늘의 곡 + 전체 추천 목록 (음악 시트 또는 content/music.json) */
import { $, $$, h, esc, artStyle, imgStyle, reduced } from './util.js';
import { MUSIC, BY_ID, dayIndex } from './store.js';
import { openCase, bindSearch, norm } from './library.js';

const L = MUSIC.length;
/* 오늘부터 거꾸로 하루에 한 곡씩 — 곡마다 가장 최근에 추천된 날짜가 붙는다 */
const today = dayIndex();
const rotated = Array.from({ length: L }, (_, i) => {
  const d = new Date((today - i) * 86400000);
  return { ...MUSIC[((today - i) % L + L) % L], date: `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`, first: i === 0 };
});
const tags = [...new Set(MUSIC.flatMap(m => m.tags))];
const titles = new Set(MUSIC.map(m => m.title));
let tag = null, q = '';
let sel = rotated[0];          /* 위 카드에 띄운 곡 — 처음엔 오늘의 곡 */
const PLAY = '<span class="playdot" aria-hidden="true"></span>';
const NEUTRAL = 'background:#26323D';

/* 썸네일 : 시트에 적은 것 → 라이브러리 게임 아트(또는 색) → 무채색 */
const thumbStyle = m => {
  const g = BY_ID.get(m.game);
  return m.thumb ? imgStyle(m.thumb) : g ? artStyle(g) : NEUTRAL;
};
const hasArt = m => !!(m.thumb || BY_ID.get(m.game)?.img);
const byline = m => [m.gameName, m.composer].filter(Boolean).join(' · ');
const NEEDS = { 'Nintendo Music': 'Nintendo Switch Online 가입자만 들을 수 있어요' };

function renderToday() {
  const host = $('#today');
  const m = sel;
  if (!m) { host.innerHTML = '<div class="in" style="display:flex;align-items:center;justify-content:center;color:#C0CAD4">추천곡을 준비하고 있어요.</div>'; return; }
  const g = BY_ID.get(m.game);
  const d = new Date();
  const label = m.first
    ? `<span class="sys">오늘의 게임 음악 · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}</span>`
    : `<span class="pick-lbl"><button type="button" class="back-today">오늘의 곡으로</button></span>`;
  const game = g
    ? `<button type="button" class="by-game" aria-label="${esc(g.name)} 케이스 열기">${esc(g.name)}</button>`
    : esc(m.gameName);
  const similar = m.similar.map(s => titles.has(s)
    ? `<button type="button" class="sim" data-title="${esc(s)}">${esc(s)}</button>` : `<span>${esc(s)}</span>`).join('');
  const [first, ...rest] = m.links;
  host.innerHTML = `<div class="in">
    <div class="art" style="${thumbStyle(m)}" role="img" aria-label="${esc(m.gameName)} 게임 아트">
      ${hasArt(m) ? '' : `<span class="art-name">${esc(m.gameName)}</span>`}</div>
    <div class="info">
      ${label}
      <h2>${esc(m.title)}</h2>
      <p class="by">${[game, m.composer && esc(m.composer)].filter(Boolean).join(' · ')}</p>
      ${m.tags.length ? `<div class="tags">${m.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}
      ${similar ? `<p class="similar"><span class="sys">비슷한 곡</span>${similar}</p>` : ''}
      ${first ? `<div class="listen">
          <a class="yt" href="${esc(first.url)}" target="_blank" rel="noopener"${NEEDS[first.label] ? ` title="${NEEDS[first.label]}"` : ''}>${PLAY}${esc(first.label)}에서 듣기</a>
          ${rest.map(l => `<a class="yt-sub" href="${esc(l.url)}" target="_blank" rel="noopener"${NEEDS[l.label] ? ` title="${NEEDS[l.label]}"` : ''}>${esc(l.label)}</a>`).join('')}
        </div>`
        : '<span class="yt-none">듣기 링크를 준비하고 있어요</span>'}
    </div></div>`;
  if (g) $('.by-game', host).addEventListener('click', e => openCase(g, e.currentTarget));
  $('.back-today', host)?.addEventListener('click', () => select(rotated[0]));
  $$('.sim', host).forEach(b => b.addEventListener('click', () => select(rotated.find(r => r.title === b.dataset.title))));
}

/* 목록에서 고른 곡을 위 카드에 띄운다 */
function select(m) {
  if (!m) return;
  sel = m;
  renderToday(); renderList();
  const host = $('#today');
  if (host.getBoundingClientRect().top < 0) host.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  $('h2', host).setAttribute('tabindex', '-1');
  $('h2', host).focus({ preventScroll: true });
}

function renderList() {
  const c = $('#musicTags');
  c.innerHTML = [[null, '전체'], ...tags.map(t => [t, '#' + t])].map(([v, t]) =>
    `<button type="button" class="chip" data-v="${esc(v ?? '')}" aria-pressed="${tag === v}">${esc(t)}</button>`).join('');
  $$('.chip', c).forEach(b => b.addEventListener('click', () => { tag = b.dataset.v || null; renderList(); }));
  const nq = norm(q);
  const list = rotated.filter(m => (!tag || m.tags.includes(tag))
    && (!nq || norm([m.title, m.gameName, m.composer, ...m.tags].join(' ')).includes(nq)));
  $('#trackCount').textContent = list.length + ' TRACKS';
  const host = $('#tracks'); host.innerHTML = '';
  if (!list.length) host.appendChild(h(`<p class="empty-note">${nq ? `‘${esc(q.trim())}’와 맞는 곡이 없어요. 곡 제목, 게임 이름, 작곡가로 찾아보세요.` : '조건에 맞는 곡이 없어요.'}</p>`));
  list.forEach(m => {
    const first = m.links[0];
    const row = h(`<div class="tune${first ? '' : ' off'}${m === sel ? ' on' : ''}">
      <button type="button" class="pick"${m === sel ? ' aria-current="true"' : ''}>
        <span class="dt">${m.first ? 'TODAY' : m.date}</span>
        <span class="th" style="${thumbStyle(m)}"></span>
        <span class="t"><b>${esc(m.title)}</b><span>${esc(byline(m))}</span></span>
        <span class="tg">${m.tags.map(t => '#' + esc(t)).join(' ')}${m.links.map(l => `<span class="pf" title="${esc(l.label)}">${esc(l.short)}</span>`).join('')}</span>
      </button>
      ${first
        ? `<a class="play" href="${esc(first.url)}" target="_blank" rel="noopener" aria-label="${esc(m.title)} — ${esc(first.label)}에서 듣기">${PLAY}</a>`
        : `<span class="play" aria-label="듣기 링크 없음" role="img">${PLAY}</span>`}
    </div>`);
    $('.pick', row).addEventListener('click', () => select(m));
    host.appendChild(row);
  });
}
bindSearch($('#musicQ'), v => { q = v; renderList(); });
renderToday(); renderList();
