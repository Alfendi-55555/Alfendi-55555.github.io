/* 소개 : 숫자는 전부 실제 데이터에서 */
import { $, el, h, esc, cart } from './util.js';
import { GAMES, POSTS, RECENT, REVIEWED } from './store.js';
import { openCase } from './library.js';

const avg = REVIEWED.length ? REVIEWED.reduce((n, g) => n + g.review.rating, 0) / REVIEWED.length : 0;
const hours = REVIEWED.reduce((n, g) => n + (g.review.hours || 0), 0);

$('#spSlots').textContent = RECENT.length + ' CARTRIDGES';
$('#spSaves').textContent = POSTS.length + ' SAVES';
$('#spBoot').textContent = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

[
  { n: GAMES.length, u: '개', l: '라이브러리의 게임' },
  { n: POSTS.length, u: '편', l: '게임별 기록' },
  { n: avg.toFixed(1), u: '', l: '한줄 리뷰 평균 별점' },
  { n: hours, u: '시간', l: '리뷰한 게임 누적 플레이' }
].forEach(s => {
  const c = el('div', 'stat');
  const n = el('div', 'n'); n.textContent = s.n;
  if (s.u) { const i = el('i'); i.textContent = s.u; n.appendChild(i); }
  const l = el('div', 'l'); l.textContent = s.l;
  c.append(n, l); $('#stats').appendChild(c);
});

/* 별점 분포 — 후한 채점자인지 짠 채점자인지가 한눈에 보인다 */
const bucket = [0, 0, 0, 0, 0];
REVIEWED.forEach(g => bucket[Math.min(4, Math.max(0, Math.round(g.review.rating) - 1))]++);
const bmax = Math.max(...bucket);
for (let i = 4; i >= 0; i--) {
  const row = el('div', 'drow');
  const lb = el('span', 'lb'); lb.textContent = (i + 1) + '★';
  const tr = el('div', 'tr'); const fi = el('i'); fi.style.width = '0%'; tr.appendChild(fi);
  const c = el('span', 'c'); c.textContent = bucket[i];
  row.append(lb, tr, c); $('#dist').appendChild(row);
  requestAnimationFrame(() => { fi.style.width = (bmax ? bucket[i] / bmax * 100 : 0) + '%'; });
}

/* 태그 빈도 */
const tagCount = {};
POSTS.forEach(p => p.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([t, n]) => {
  const c = el('span', 'chip'); c.textContent = '#' + t;
  if (n > 1) { const i = el('i'); i.textContent = n; c.appendChild(i); }
  $('#tagChips').appendChild(c);
});

/* 최근 꺼낸 카트리지 — 누르면 케이스가 열린다 */
const mini = $('#mini');
mini.className = 'mini shelf-track';
RECENT.slice(0, 6).forEach(g => {
  const b = h(`<button type="button" class="shelf-item lift" aria-label="${esc(g.name)} 케이스 열기">${cart(g, 100)}<span class="tx"><span class="nm">${esc(g.name)}</span><span class="sv">${g.posts.length} SAVES</span></span></button>`);
  b.addEventListener('click', () => openCase(g, b));
  mini.appendChild(b);
});
