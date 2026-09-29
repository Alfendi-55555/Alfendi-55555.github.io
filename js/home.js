/* 홈 : 채널 메뉴 */
import { $, $$, h, esc, stars, cart, artStyle, imgStyle, md } from './util.js';
import { POSTS, RECENT, REVIEWED, MUSIC, GUEST, BY_ID, pickOfDay } from './store.js';
import { openCase } from './library.js';
import { openReader } from './game.js';

const host = $('#channels');
const chans = [];

/* LATEST : 가장 최근 글 */
const latest = POSTS[0];
if (latest) {
  const g = latest.game;
  const bg = latest.cover ? imgStyle(latest.cover) : artStyle(g);
  const b = h(`<button type="button" class="chan latest ch"><span class="scr">
    <span class="bg" style="${bg}"></span><span class="scrim"></span>
    <span class="cap"><span class="lbl">LATEST</span><b>${esc(latest.t)}</b>
    <span class="meta-line">${esc(g.name.toUpperCase())} · ${esc(latest.d)}</span></span></span></button>`);
  b.addEventListener('click', () => openReader(latest));
  chans.push(b);
}

/* TODAY'S TRACK */
const track = pickOfDay(MUSIC);
const now = new Date();
chans.push(h(`<a href="#/music" class="chan music ch"><span class="scr">
  <span class="row-sb"><span class="lbl">TODAY'S TRACK</span><span class="meta-line">${now.getMonth() + 1}/${now.getDate()}</span></span>
  <span class="body"><span class="disc" aria-hidden="true"></span><span class="t-col">
  ${track ? `<span class="lbl music-lbl">TODAY'S TRACK</span><b>${esc(track.title)}</b><span>${esc([BY_ID.get(track.game)?.name, track.composer].filter(Boolean).join(' · '))}</span>`
          : '<b>곧 시작해요</b><span>추천곡을 고르는 중</span>'}
  </span></span></span></a>`));

/* NEWS : 아직 준비 중 */
chans.push(h(`<div class="chan news soon"><span class="scr">
  <span class="row-sb"><span class="lbl">NEWS</span><span class="meta-line">COMING SOON</span></span>
  <span class="soon-txt">게임 소식 채널은 준비 중이에요.<br>기록한 게임의 공식 공지를 모아 올 예정이에요.</span></span></div>`));

/* LIBRARY */
chans.push(h(`<a href="#/library" class="chan lib ch"><span class="scr">
  <span class="row-sb"><span class="lbl">LIBRARY</span><span class="meta-line lib-n">${RECENT.length} CARTRIDGES</span></span>
  <span class="carts">${RECENT.slice(0, 3).map(g => cart(g, 60)).join('')}</span></span></a>`));

/* NOW PLAYING : 가장 최근에 기록한 게임 */
const playing = RECENT[0];
if (playing) {
  const p = playing.posts[0];
  const b = h(`<button type="button" class="chan playing ch"><span class="scr">
    <span class="lbl">NOW PLAYING</span>
    <span class="body"><span class="th" style="${artStyle(playing)}"></span><span class="t-col">
      <b>${esc(playing.name)}</b><span>글 ${playing.posts.length}편 · 마지막 기록 ${md(p.d)}</span></span></span>
    <span class="pbar"><span class="tr"><i style="width:${p.pct}%;background:${playing.color}"></i></span><b>${p.pct}%</b></span>
  </span></button>`);
  b.addEventListener('click', () => openCase(playing, b));
  chans.push(b);
}

/* ONE-LINE REVIEW : 날마다 하나 */
const rv = pickOfDay(REVIEWED);
if (rv) {
  const b = h(`<button type="button" class="chan review ch"><span class="scr">
    <span class="row-sb"><span class="lbl">ONE-LINE REVIEW</span>${stars(rv.review.rating)}</span>
    <q>${esc(rv.review.text)}</q>
    <span class="nm">${esc(rv.name)}</span></span></button>`);
  b.addEventListener('click', () => openCase(rv, b));
  chans.push(b);
}

chans.forEach(c => host.appendChild(c));
/* 빈 슬롯 : 채널이 더 들어올 자리 */
for (let i = chans.length; i < 8; i++) host.appendChild(h('<div class="chan empty" aria-hidden="true"></div>'));

/* 독 : 시계 · 방명록 수 */
function tick() {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  $('#clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  $('#clockDate').textContent = `${d.getMonth() + 1}/${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
}
tick(); setInterval(tick, 10000);
export function syncGuestBadges() {
  $$('#guestBadge,#dockBadge').forEach(b => { b.textContent = GUEST.length; b.hidden = !GUEST.length; });
}
syncGuestBadges();
