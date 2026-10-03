/* 게임별 기록 화면 (카트리지를 꽂은 뒤) · 글 읽기 — 게임 스킨이 화면을 가져간다 */
import { $, el, reduced, cart, esc } from './util.js';
import { BY_ID } from './store.js';
import { showScreen } from './shell.js';
import { settings } from './settings.js';

$('#ejectBtn').onclick = () => { location.hash = '#/library'; };

/* 게임별 테마를 끄면 모든 게임이 기본 스킨으로 */
const skinOf = g => (settings.skins && g.skin) || 'base';

const slots = $('#slots');
let shown = null, bootTimer = 0;
export function renderGame(id) {
  const g = BY_ID.get(id);
  if (!g) { location.replace('#/library'); return; }
  shown = g;
  const skin = skinOf(g);
  $('#game').dataset.skin = skin;
  $('#reader').dataset.skin = skin;
  $('#libName').textContent = g.name;
  $('#libN').textContent = g.posts.length + ' SAVES';
  $('#libCart').innerHTML = skin === 'base' ? cart(g, 40) : '';
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
    /* 읽는 시간은 3분 이상일 때만 — 짧은 글마다 같은 말이 반복되지 않게 */
    m.textContent = [p.d, p.min >= 3 ? '읽는 데 ' + p.min + '분' : '', p.tags && p.tags.length ? p.tags.map(x => '#' + x).join(' ') : '']
      .filter(Boolean).join('  ·  ');
    mid.append(n, t, m);
    b.append(bar, th, mid);
    b.style.animationDelay = (i * 40) + 'ms';
    b.onclick = () => openReader(p);
    slots.appendChild(b);
  });
  showScreen('game', { ctx: g.name.toUpperCase(), skin });
  /* 들어오는 연출이 끝나면 boot 를 떼어 낸다 — 마우스를 뗄 때 연출이 다시 돌지 않게 */
  clearTimeout(bootTimer);
  if (!reduced) {
    requestAnimationFrame(() => slots.classList.add('boot'));
    bootTimer = setTimeout(() => slots.classList.remove('boot'), 300 + g.posts.length * 40);
  }
}
/* 설정에서 게임별 테마를 바꾸면 보고 있던 화면에도 바로 적용 */
settings.onChange(() => {
  if (!shown || !$('#game').classList.contains('on')) return;
  const skin = skinOf(shown);
  if ($('#game').dataset.skin === skin) return;
  renderGame(shown.id);
  if (readerOpen()) reader.dataset.skin = skin;
});

/* ---------- 글 읽기 : 위쪽 막대는 지금 이 글을 얼마나 읽었는지만 보여준다 ---------- */
const reader = $('#reader'), rd = $('#rd'), rdBar = $('#rdBar');
/* ||스포일러|| : 누르거나 Enter·Space 로 보이기 / 다시 가리기 */
const toggleSpoiler = s => { s.classList.toggle('open'); s.setAttribute('aria-label', s.classList.contains('open') ? '스포일러, 눌러서 가리기' : '스포일러, 눌러서 보기'); };
rd.addEventListener('click', e => { const s = e.target.closest('.spoiler'); if (s) toggleSpoiler(s); });
rd.addEventListener('keydown', e => {
  const s = e.target.closest?.('.spoiler');
  if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSpoiler(s); }
});
let cur = null;
export const readerOpen = () => reader.classList.contains('on');

export function openReader(p) {
  const g = p.game;
  cur = { p, opener: cur ? cur.opener : document.activeElement };
  reader.dataset.skin = skinOf(g);
  rd.innerHTML = '';
  const back = el('button', 'rd-back');
  back.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M7.6 1.6 3.2 6l4.4 4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>닫기';
  back.onclick = closeReader;
  rd.appendChild(back);
  const hero = el('div', 'hero');
  if (p.cover) { const im = new Image(); im.className = 'cov'; im.src = p.cover; im.alt = p.coverAlt || p.t + ' 표지 이미지'; hero.appendChild(im); }
  hero.append(el('div', 'tex'), el('div', 'glow'), el('div', 'frame'));
  ['tl', 'tr', 'bl', 'br'].forEach(k => hero.appendChild(el('span', 'brk ' + k)));
  const comp = el('div', 'compass'); comp.innerHTML = '<i></i><span>N</span>'; hero.appendChild(comp);
  const hin = el('div', 'hin');
  const h = el('h1'); h.textContent = p.t;
  const m = el('div', 'rmeta'); m.textContent = [g.name, p.d, p.min >= 3 ? '읽는 데 ' + p.min + '분' : ''].filter(Boolean).join(' · ');
  hin.append(h, m); hero.appendChild(hin); rd.appendChild(hero);
  if (p.spoiler != null) {
    const w = el('div', 'rd-spoil');
    w.innerHTML = `<b>스포일러 주의</b><span>${p.spoiler ? esc(p.spoiler) + '에 대한 내용이 있어요.' : '게임 내용이 드러나는 기록이에요.'}</span>`;
    rd.appendChild(w);
  }
  /* 본문 블록 — html 은 build.py 가 글자를 이스케이프한 뒤 만든 것만 들어온다 */
  (p.blocks || []).forEach(b => {
    let n;
    if (b.type === 'text') { n = el('p'); n.innerHTML = b.html ?? esc(b.text); }
    else if (b.type === 'h') { n = el(b.level === 3 ? 'h3' : 'h2'); n.innerHTML = b.html; }
    else if (b.type === 'quote') { n = el('blockquote'); n.innerHTML = b.html; }
    else if (b.type === 'list') { n = el(b.ordered ? 'ol' : 'ul'); n.innerHTML = b.items.map(i => `<li>${i}</li>`).join(''); }
    else if (b.type === 'youtube') {
      n = el('div', 'rd-yt');
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.id)}${b.start ? '?start=' + b.start : ''}`;
      f.title = p.t + ' — YouTube 영상'; f.loading = 'lazy'; f.allowFullscreen = true;
      f.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      n.appendChild(f);
    } else {
      n = el('figure'); const im = new Image(); im.src = b.src; im.alt = b.alt || b.caption || g.name + ' 스크린샷'; im.loading = 'lazy';
      n.appendChild(im);
      if (b.caption) { const cp = el('figcaption'); const sp = el('span'); sp.textContent = b.caption; cp.appendChild(sp); n.appendChild(cp); }
    }
    rd.appendChild(n);
  });
  const endl = el('div', 'end');
  const es = el('span'); es.textContent = 'END OF LOG';
  const eb = el('b'); eb.innerHTML = 'PLAY<i>LOG</i>';
  endl.append(es, eb); rd.appendChild(endl);
  /* 같은 게임의 이전 · 다음 기록 */
  const i = g.posts.indexOf(p), older = g.posts[i + 1], newer = g.posts[i - 1];
  const nav = el('div', 'rd-nav');
  const mk = (q, cls, lab) => {
    const b = el('button', cls); b.type = 'button';
    if (q) { b.innerHTML = `<span>${lab}</span><b>${esc(q.t)}</b>`; b.onclick = () => openReader(q); }
    else b.disabled = true;
    return b;
  };
  nav.append(mk(older, 'prev', '← 이전 기록'), mk(newer, 'next', '다음 기록 →'));
  if (older || newer) rd.appendChild(nav);
  const pad = el('div'); pad.style.height = '20vh'; rd.appendChild(pad);
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
}
reader.addEventListener('scroll', updateProgress, { passive: true });
