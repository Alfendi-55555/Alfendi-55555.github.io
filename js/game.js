/* 게임별 기록 화면 (카트리지를 꽂은 뒤) · 글 읽기 — 게임 스킨이 화면을 가져간다 */
import { $, el, reduced } from './util.js';
import { BY_ID } from './store.js';
import { showScreen } from './shell.js';

$('#mq').innerHTML = Array(8).fill('<span>PLAY</span><span>◆</span><span>RECORD</span>'
  + '<span>◆</span><span>TALK</span><span>◆</span><span>REPEAT</span><span>◆</span>').join('');
$('#ejectBtn').onclick = () => { location.hash = '#/library'; };

const slots = $('#slots');
export function renderGame(id) {
  const g = BY_ID.get(id);
  if (!g) { location.replace('#/library'); return; }
  const skin = g.skin || 'base';
  $('#game').dataset.skin = skin;
  $('#reader').dataset.skin = skin;
  $('#libName').textContent = g.name;
  $('#libN').textContent = g.posts.length + ' SAVES';
  slots.innerHTML = ''; slots.classList.remove('boot');
  if (!g.posts.length) {
    const p = el('p', 'save-empty'); p.textContent = '아직 이 게임의 기록이 없어요.';
    slots.appendChild(p);
  }
  g.posts.forEach((p, i) => {
    const b = el('button', 'save');
    const bar = el('div', 'bar'); bar.style.background = g.color;
    const th = el('div', 'thumb');
    th.style.background = p.cover ? `url("${p.cover}") center/cover` : g.art;
    b.appendChild(el('div', 'tex'));
    const mid = el('div', 'mid');
    const n = el('div', 'n'); n.textContent = 'SAVE ' + String(g.posts.length - i).padStart(2, '0');
    const t = el('div', 't'); t.textContent = p.t;
    const m = el('div', 'm');
    m.textContent = p.d + ' · 읽는 데 ' + p.min + '분'
      + (p.tags && p.tags.length ? '  ·  ' + p.tags.map(x => '#' + x).join(' ') : '');
    mid.append(n, t, m);
    const pr = el('div', 'prog');
    const pc = el('div', 'pct'); pc.textContent = p.pct + '%';
    const tr = el('div', 'track'); const fi = el('i');
    fi.style.width = p.pct + '%'; fi.style.background = g.color; tr.appendChild(fi);
    pr.append(pc, tr);
    b.append(bar, th, mid, pr);
    b.style.animationDelay = (i * 40) + 'ms';
    b.onclick = () => openReader(p, { fill: fi, pctEl: pc });
    slots.appendChild(b);
  });
  showScreen('game', { ctx: g.name.toUpperCase(), skin });
  if (!reduced) requestAnimationFrame(() => slots.classList.add('boot'));
}

/* ---------- 글 읽기 : 진행률은 실제로 읽은 만큼 ---------- */
const reader = $('#reader'), rd = $('#rd'), rdBar = $('#rdBar');
let cur = null;
export const readerOpen = () => reader.classList.contains('on');

export function openReader(p, ui = {}) {
  const g = p.game;
  cur = { p, ...ui, opener: document.activeElement };
  reader.dataset.skin = g.skin || 'base';
  rd.innerHTML = '';
  const back = el('button', 'rd-back');
  back.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M7.6 1.6 3.2 6l4.4 4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>닫기';
  back.onclick = closeReader;
  rd.appendChild(back);
  const hero = el('div', 'hero');
  if (p.cover) { const im = new Image(); im.className = 'cov'; im.src = p.cover; im.alt = ''; hero.appendChild(im); }
  hero.append(el('div', 'tex'), el('div', 'glow'), el('div', 'frame'));
  ['tl', 'tr', 'bl', 'br'].forEach(k => hero.appendChild(el('span', 'brk ' + k)));
  const comp = el('div', 'compass'); comp.innerHTML = '<i></i><span>N</span>'; hero.appendChild(comp);
  const hin = el('div', 'hin');
  const h = el('h1'); h.textContent = p.t;
  const m = el('div', 'rmeta'); m.textContent = g.name + ' · ' + p.d + ' · 읽는 데 ' + p.min + '분';
  hin.append(h, m); hero.appendChild(hin); rd.appendChild(hero);
  (p.blocks || []).forEach(b => {
    if (b.type === 'text') { const q = el('p'); q.textContent = b.text; rd.appendChild(q); }
    else {
      const f = el('figure'); const im = new Image(); im.src = b.src; im.alt = b.caption || ''; im.loading = 'lazy';
      f.appendChild(im);
      if (b.caption) { const cp = el('figcaption'); const sp = el('span'); sp.textContent = b.caption; cp.appendChild(sp); f.appendChild(cp); }
      rd.appendChild(f);
    }
  });
  const endl = el('div', 'end');
  const es = el('span'); es.textContent = 'END OF LOG';
  const eb = el('b'); eb.innerHTML = 'PLAY<i>LOG</i>';
  endl.append(es, eb); rd.appendChild(endl);
  const pad = el('div'); pad.style.height = '40vh'; rd.appendChild(pad);
  reader.setAttribute('role', 'dialog'); reader.setAttribute('aria-modal', 'true'); reader.setAttribute('aria-label', p.t);
  reader.classList.add('on'); reader.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  back.focus({ preventScroll: true });
  updateProgress();
}
export function closeReader() {
  if (!readerOpen()) return;
  reader.classList.remove('on');
  document.body.style.overflow = '';
  const o = cur && cur.opener; cur = null;
  if (o && o.focus && document.contains(o)) o.focus({ preventScroll: true });
}
function updateProgress() {
  if (!cur) return;
  const max = reader.scrollHeight - reader.clientHeight;
  const pct = max <= 0 ? 100 : Math.min(100, Math.round(reader.scrollTop / max * 100));
  rdBar.style.width = pct + '%';
  if (pct > cur.p.pct) {
    cur.p.pct = pct;
    if (cur.fill) { cur.fill.style.width = pct + '%'; cur.pctEl.textContent = pct + '%'; }
  }
}
reader.addEventListener('scroll', updateProgress, { passive: true });
