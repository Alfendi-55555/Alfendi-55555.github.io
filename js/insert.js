/* 카트리지 삽입 — 처음엔 직접 꽂고, 원하면 다음부터 자동으로 */
import { $, cart, reduced, coarse } from './util.js';
import { showScreen, currentScreen } from './shell.js';
import { settings } from './settings.js';

let active = null;
const drag = $('#dragCart'), arena = $('#arena'), slot = $('#slot'), led = $('#led'), auto = $('#autoInsert');

export function startInsert(g) {
  if (settings.auto) { active = g; boot(); return; }
  active = g;
  drag.innerHTML = cart(g, innerWidth <= 720 ? 170 : 200);
  drag.setAttribute('aria-label', g.name + ' 카트리지를 슬롯에 꽂기');
  $('#insCtx').textContent = 'SLOT 1 · ' + g.name.toUpperCase();
  $('#insTitle').textContent = '카트리지를 꽂아 주세요';
  $('#insHelp').textContent = coarse
    ? '카트리지를 눌러서 꽂으세요. 끌어다 놓아도 됩니다.'
    : '아래 슬롯으로 끌어다 놓으세요. 그냥 눌러도 꽂힙니다.';
  auto.checked = settings.auto;
  showScreen('insert', { ctx: g.name.toUpperCase() });
  requestAnimationFrame(() => { resetCart(); drag.focus({ preventScroll: true }); });
}
auto.addEventListener('change', () => { settings.auto = auto.checked; });
settings.onChange(() => { auto.checked = settings.auto; });

/* ---------- 위치 : arena 아래 경계가 슬롯 구멍의 한가운데다 ---------- */
const size = () => { const r = drag.getBoundingClientRect(); return { w: r.width, h: r.height }; };
const A = () => arena.getBoundingClientRect();
function restPos() { const a = A(), c = size(); return { x: (a.width - c.w) / 2, y: Math.max(8, a.height - c.h - 70) }; }
function preSeat() { const a = A(), c = size(); return { x: (a.width - c.w) / 2, y: a.height - c.h - 4 }; }
function seated() { const a = A(), c = size(); return { x: (a.width - c.w) / 2, y: a.height - c.h * 0.42 }; }
const place = p => { drag.style.left = p.x + 'px'; drag.style.top = p.y + 'px'; };
function resetCart() {
  drag.className = 'drag'; drag.style.transform = '';
  place(restPos()); slot.classList.remove('hot'); led.classList.remove('on');
  $('#insTitle').textContent = '카트리지를 꽂아 주세요';
}
addEventListener('resize', () => { if (currentScreen() === 'insert' && !dragging && !busy) resetCart(); });

/* ---------- 끌기 ---------- */
const SNAP = 70;
let dragging = false, busy = false, gx = 0, gy = 0, moved = 0;
drag.addEventListener('pointerdown', e => {
  if (busy) return;
  dragging = true; moved = 0;
  drag.setPointerCapture(e.pointerId);
  drag.className = 'drag grabbing';
  const r = drag.getBoundingClientRect();
  gx = e.clientX - r.left; gy = e.clientY - r.top;
  e.preventDefault();
});
drag.addEventListener('pointermove', e => {
  if (!dragging) return;
  const a = A();
  const x = e.clientX - a.left - gx, y = e.clientY - a.top - gy;
  moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
  place({ x, y });
  const t = preSeat(), d = Math.hypot(x - t.x, y - t.y), near = d < SNAP;
  slot.classList.toggle('hot', near);
  /* 가로 변위를 rotateY ±18도까지만. 슬롯 근처에선 0도로 수렴 */
  const c = size(), mid = a.width / 2;
  let ry = Math.max(-18, Math.min(18, (x + c.w / 2 - mid) / mid * 18));
  if (near) ry *= Math.max(0, (d - 14) / (SNAP - 14));
  drag.style.transform = `perspective(950px) rotateY(${ry.toFixed(1)}deg) rotateX(3deg)`;
});
function endDrag() {
  if (!dragging) return;
  dragging = false;
  const a = A(), r = drag.getBoundingClientRect(), t = preSeat();
  const x = r.left - a.left, y = r.top - a.top;
  if (moved < 6 || Math.hypot(x - t.x, y - t.y) < SNAP) { insertNow(); return; }
  drag.className = 'drag returning'; drag.style.transform = '';
  place(restPos()); slot.classList.remove('hot');
  setTimeout(() => { drag.className = 'drag'; }, reduced ? 0 : 270);
}
drag.addEventListener('pointerup', endDrag);
drag.addEventListener('pointercancel', endDrag);
drag.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertNow(); } });

function insertNow() {
  if (busy) return; busy = true;
  slot.classList.add('hot');
  drag.className = 'drag settling'; drag.style.transform = '';
  place(preSeat());
  setTimeout(() => {
    drag.className = 'drag sinking';
    place(seated());
    led.classList.add('on');
    $('#insTitle').textContent = 'READING  ' + active.name.toUpperCase();
    setTimeout(boot, reduced ? 0 : 320);
  }, reduced ? 0 : 190);
}
$('#skipBtn').onclick = () => { busy = true; boot(); };

/* ---------- 부팅 → 게임 화면 ---------- */
function boot() {
  const b = $('#boot'), g = active;
  const go = () => {
    busy = false;
    const to = '#/game/' + g.id;
    if (location.hash === to) dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = to;
  };
  $('#bootTxt').textContent = 'READING  ' + g.name.toUpperCase();
  if (reduced) { go(); return; }
  b.classList.add('on');
  requestAnimationFrame(() => b.classList.add('run'));
  setTimeout(() => { go(); b.classList.remove('on', 'run'); }, 560);
}
