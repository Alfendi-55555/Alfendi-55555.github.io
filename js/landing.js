/* 첫 화면 인트로 — 부제가 한 글자씩 쳐지고, 그 아래로 로고가 올라온다.
   설정의 '첫 화면 인트로'가 '처음만'이면 이 브라우저에서 처음 한 번만. 주소 끝에 ?intro 를 붙이면 언제든 다시 볼 수 있다. */
import { $, reduced } from './util.js';
import { settings } from './settings.js';
import { PROFILE } from './store.js';

const FULL = PROFILE.tagline || '';
const land = $('#landing'), typed = $('#ldTyped'), rest = $('#ldRest'), caret = $('#ldCaret'), mark = $('#ldMark');
let t = 0, done = false;

export function maybeShowLanding() {
  const forced = new URLSearchParams(location.search).has('intro');
  if (!FULL || (!forced && (settings.intro === 'off' || settings.seen))) return;
  land.classList.add('on');
  if (reduced) {
    typed.textContent = FULL; caret.classList.add('off'); mark.classList.add('on');
    t = setTimeout(finish, 1500); return;
  }
  let n = 0;
  rest.textContent = FULL;   /* 쳐질 자리를 미리 투명하게 잡아서 문장이 옆으로 밀리지 않게 */
  const step = () => {
    n++;
    typed.textContent = FULL.slice(0, n); rest.textContent = FULL.slice(n);
    if (n < FULL.length) { t = setTimeout(step, 62); return; }
    t = setTimeout(() => {
      caret.classList.add('off'); mark.classList.add('on');
      t = setTimeout(finish, 1900);
    }, 380);
  };
  t = setTimeout(step, 500);
}
function finish() {
  if (done) return; done = true;
  clearTimeout(t);
  settings.markSeen();
  if (reduced) { land.classList.remove('on'); return; }
  land.classList.add('out');
  setTimeout(() => land.classList.remove('on', 'out'), 700);
}
/* 누르거나 아무 키나 치면 바로 넘어간다 */
land.addEventListener('click', finish);
addEventListener('keydown', e => { if (land.classList.contains('on') && !done) { e.preventDefault(); finish(); } });
