/* 설정 — 이 브라우저의 localStorage 에만 남는다 */
import { $, $$ } from './util.js';
import { openOverlay } from './shell.js';

const K = { auto: 'pl_auto_insert', intro: 'pl_intro', seen: 'pl_seen', theme: 'pl_theme', skins: 'pl_skins' };
const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장소를 못 쓰면 이번 방문 동안만 */ } };

const listeners = new Set();
export const settings = {
  get auto() { return get(K.auto, '0') === '1'; },
  set auto(v) { put(K.auto, v ? '1' : '0'); listeners.forEach(f => f()); },
  get intro() { return get(K.intro, 'always'); },     /* always(기본) · once · off */
  set intro(v) { put(K.intro, v); listeners.forEach(f => f()); },
  get theme() { return get(K.theme, 'system'); },     /* system(기본) · light · dark */
  set theme(v) { put(K.theme, v); applyTheme(); listeners.forEach(f => f()); },
  get skins() { return get(K.skins, '1') === '1'; }, /* 게임별 테마 (기본 켜짐) */
  set skins(v) { put(K.skins, v ? '1' : '0'); listeners.forEach(f => f()); },
  get seen() { return get(K.seen, '0') === '1'; },
  markSeen() { put(K.seen, '1'); },
  onChange(f) { listeners.add(f); }
};

/* 화면 테마 — 처음 값은 index.html <head> 의 짧은 스크립트가 이미 정해 두었다. '시스템'이면 OS 설정이 바뀔 때 따라간다 */
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = settings.theme;
  document.documentElement.dataset.theme = t === 'dark' || (t === 'system' && darkMQ.matches) ? 'dark' : 'light';
}
darkMQ.addEventListener('change', () => { if (settings.theme === 'system') applyTheme(); });
applyTheme();

/* ---------- 설정 창 ---------- */
const wrap = $('#settingsWrap'), sAuto = $('#stAuto');
const sSkins = $('#stSkins');
sAuto.addEventListener('change', () => { settings.auto = sAuto.checked; });
sSkins.addEventListener('change', () => { settings.skins = sSkins.checked; });

/* 라디오처럼 동작하는 버튼 묶음 : 누르거나 화살표 키로 고른다 */
const groups = [['#stIntro', 'intro'], ['#stTheme', 'theme']].map(([sel, key]) => {
  const btns = $$(sel + ' button');
  btns.forEach(b => b.addEventListener('click', () => { settings[key] = b.dataset.v; }));
  $(sel).addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const i = btns.findIndex(b => b.dataset.v === settings[key]);
    const n = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
    settings[key] = n.dataset.v; n.focus();
  });
  return { btns, key };
});
function sync() {
  sAuto.checked = settings.auto;
  sSkins.checked = settings.skins;
  groups.forEach(({ btns, key }) => btns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === settings[key]))));
}
settings.onChange(sync);
sync();
$('#settingsBtn').addEventListener('click', e => openOverlay(wrap, e.currentTarget));
