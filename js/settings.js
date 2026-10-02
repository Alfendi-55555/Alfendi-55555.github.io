/* 설정 — 이 브라우저의 localStorage 에만 남는다 */
import { $, $$ } from './util.js';
import { openOverlay } from './shell.js';

const K = { auto: 'pl_auto_insert', intro: 'pl_intro', seen: 'pl_seen' };
const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장소를 못 쓰면 이번 방문 동안만 */ } };

const listeners = new Set();
export const settings = {
  get auto() { return get(K.auto, '0') === '1'; },
  set auto(v) { put(K.auto, v ? '1' : '0'); listeners.forEach(f => f()); },
  get intro() { return get(K.intro, 'always'); },     /* always(기본) · once · off */
  set intro(v) { put(K.intro, v); listeners.forEach(f => f()); },
  get seen() { return get(K.seen, '0') === '1'; },
  markSeen() { put(K.seen, '1'); },
  onChange(f) { listeners.add(f); }
};

const wrap = $('#settingsWrap'), sAuto = $('#stAuto'), seg = $$('#stIntro button');
function sync() {
  sAuto.checked = settings.auto;
  seg.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === settings.intro)));
}
sAuto.addEventListener('change', () => { settings.auto = sAuto.checked; });
seg.forEach(b => b.addEventListener('click', () => { settings.intro = b.dataset.v; }));
/* 화살표 키로 라디오 사이 이동 */
$('#stIntro').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = seg.findIndex(b => b.dataset.v === settings.intro);
  const n = seg[(i + (e.key === 'ArrowRight' ? 1 : -1) + seg.length) % seg.length];
  settings.intro = n.dataset.v; n.focus();
});
settings.onChange(sync);
sync();
$('#settingsBtn').addEventListener('click', e => openOverlay(wrap, e.currentTarget));
