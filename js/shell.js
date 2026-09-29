/* 화면 전환 · 상단 바 · 오버레이 */
import { $, $$ } from './util.js';

let current = 'home';
export const currentScreen = () => current;

export function showScreen(id, { ctx = '', skin = '' } = {}) {
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  current = id;
  document.body.dataset.screen = id;
  if (skin) document.body.dataset.hskin = skin; else delete document.body.dataset.hskin;
  $('#hdrCtx').textContent = ctx;
  /* 삽입 · 게임 화면은 라이브러리 안쪽이다 */
  const key = (id === 'insert' || id === 'game') ? 'library' : id;
  $$('[data-nav]').forEach(a => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  closeMenu();
  window.scrollTo(0, 0);
}

/* 모바일 메뉴 */
const nav = $('#hdrNav'), menuBtn = $('#menuBtn');
function closeMenu() { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.setAttribute('aria-label', '메뉴 열기'); }
menuBtn.addEventListener('click', () => {
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
});
document.addEventListener('click', e => {
  if (nav.classList.contains('open') && !e.target.closest('#hdrNav,#menuBtn')) closeMenu();
});

/* 오버레이 : 열 때 포커스를 안으로, 닫으면 연 자리로 돌려놓는다 */
const openers = new Map();
export function openOverlay(el, opener) {
  openers.set(el, opener || document.activeElement);
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  const f = el.querySelector('[data-autofocus]') || el.querySelector('button, a, input');
  if (f) f.focus({ preventScroll: true });
}
export function closeOverlay(el) {
  if (el.hidden) return;
  el.hidden = true;
  if (!$$('.overlay').some(o => !o.hidden)) document.body.style.overflow = '';
  const o = openers.get(el);
  if (o && o.focus && document.contains(o)) o.focus({ preventScroll: true });
}
export const openOverlays = () => $$('.overlay').filter(o => !o.hidden);
$$('.overlay').forEach(o => o.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) closeOverlay(o);
}));
/* 오버레이 안에서만 Tab이 돈다 */
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const o = openOverlays().pop(); if (!o) return;
  const f = $$('button:not([disabled]), a[href], input, [tabindex="0"]', o).filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
