/* =====================================================================
   PLAYLOG — 진입점
   데이터는 data/site.json (scripts/build.py 가 만든다).
   화면마다 모듈이 하나씩 있다 : home · library · insert · game · posts · music · about · guest
   ===================================================================== */
import './store.js';
import { showScreen, openOverlays, closeOverlay, currentScreen } from './shell.js';
import './settings.js';
import './home.js';
import './library.js';
import './posts.js';
import './music.js';
import './about.js';
import './guest.js';
import { renderGame, readerOpen, closeReader } from './game.js';
import { maybeShowLanding } from './landing.js';

/* ---------- 주소 → 화면 : #/ · #/library · #/posts · #/music · #/about · #/guest · #/game/<id> ---------- */
const SIMPLE = ['library', 'posts', 'music', 'about', 'guest'];
function route() {
  closeReader();
  openOverlays().forEach(closeOverlay);
  const [head, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (head === 'game' && arg) renderGame(decodeURIComponent(arg));
  else if (SIMPLE.includes(head)) showScreen(head);
  else showScreen('home');
}
addEventListener('hashchange', route);
route();

/* ---------- ESC : 가장 위에 있는 것부터 닫는다 ---------- */
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (readerOpen()) { closeReader(); return; }
  const o = openOverlays().pop();
  if (o) { closeOverlay(o); return; }
  if (currentScreen() === 'insert') location.hash = '#/library';
});

maybeShowLanding();

/* 지금 있는 주소의 링크를 다시 눌러도 그 화면으로 돌아간다 (예: 삽입 화면에서 '라이브러리') */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a) return;
  const norm = s => s.replace(/^#\/?/, '');
  if (norm(a.getAttribute('href')) === norm(location.hash)) route();
});
