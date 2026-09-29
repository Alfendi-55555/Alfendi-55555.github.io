/* 음악 : 오늘의 곡 + 전체 추천 목록 (content/music.json) */
import { $, $$, h, esc, artStyle } from './util.js';
import { MUSIC, BY_ID, dayIndex } from './store.js';

const L = MUSIC.length;
/* 오늘부터 거꾸로 하루에 한 곡씩 — 곡마다 가장 최근에 추천된 날짜가 붙는다 */
const today = dayIndex();
const rotated = Array.from({ length: L }, (_, i) => {
  const d = new Date((today - i) * 86400000);
  return { ...MUSIC[((today - i) % L + L) % L], date: `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`, first: i === 0 };
});
const tags = [...new Set(MUSIC.flatMap(m => m.tags))];
let tag = null;
const PLAY = '<span class="playdot" aria-hidden="true"></span>';

function renderToday() {
  const host = $('#today');
  const m = rotated[0];
  if (!m) { host.innerHTML = '<div class="in" style="display:flex;align-items:center;justify-content:center;color:#C0CAD4">추천곡을 준비하고 있어요.</div>'; return; }
  const g = BY_ID.get(m.game);
  const d = new Date();
  host.innerHTML = `<div class="in">
    <div class="art" style="${g ? artStyle(g) : ''}" role="img" aria-label="${esc(g ? g.name : '')} 게임 아트"></div>
    <div class="info">
      <span class="sys">오늘의 게임 음악 · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}</span>
      <h2>${esc(m.title)}</h2>
      <p class="by">${esc([g && g.name, m.composer].filter(Boolean).join(' · '))}</p>
      ${m.tags.length ? `<div class="tags">${m.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}
      ${m.youtube ? `<a class="yt" href="${esc(m.youtube)}" target="_blank" rel="noopener">${PLAY}YouTube에서 듣기</a>`
                  : '<span class="yt-none">YouTube 링크를 준비하고 있어요</span>'}
    </div></div>`;
}

function renderList() {
  const c = $('#musicTags');
  c.innerHTML = [[null, '전체'], ...tags.map(t => [t, '#' + t])].map(([v, t]) =>
    `<button type="button" class="chip" data-v="${esc(v ?? '')}" aria-pressed="${tag === v}">${esc(t)}</button>`).join('');
  $$('.chip', c).forEach(b => b.addEventListener('click', () => { tag = b.dataset.v || null; renderList(); }));
  const list = rotated.filter(m => !tag || m.tags.includes(tag));
  $('#trackCount').textContent = list.length + ' TRACKS';
  const host = $('#tracks'); host.innerHTML = '';
  list.forEach(m => {
    const g = BY_ID.get(m.game);
    const inner = `<span class="dt">${m.first ? 'TODAY' : m.date}</span>
      <span class="th" style="${g ? artStyle(g) : ''}"></span>
      <span class="t"><b>${esc(m.title)}</b><span>${esc([g && g.name, m.composer].filter(Boolean).join(' · '))}</span></span>
      <span class="tg">${m.tags.map(t => '#' + esc(t)).join(' ')}</span>${PLAY}`;
    host.appendChild(m.youtube
      ? h(`<a class="tune ch" href="${esc(m.youtube)}" target="_blank" rel="noopener" aria-label="${esc(m.title)} — YouTube에서 듣기">${inner}</a>`)
      : h(`<div class="tune off">${inner}</div>`));
  });
}
renderToday(); renderList();
