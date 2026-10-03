/* 홈 : 채널 메뉴 — 소개가 첫 채널, 방명록이 마지막 채널 */
import { $, h, esc, stars, cart, artStyle, imgStyle, md } from './util.js';
import { POSTS, RECENT, REVIEWED, MUSIC, BY_ID, PROFILE, pickOfDay } from './store.js';
import { openCase } from './library.js';
import { openReader } from './game.js';
import { NEWS, NEWS_UPDATED } from './store.js';
import { newsColor, newsWho, newCount } from './news.js';

const host = $('#channels');
const chans = [];
const P = PROFILE;

/* ABOUT */
chans.push(h(`<a href="#/about" class="chan about ch"><span class="scr">
  <span class="row-sb"><span class="lbl">ABOUT</span>${P.since ? `<span class="meta-line">SINCE ${esc(P.since)}</span>` : ''}</span>
  <span class="who">${P.avatar ? `<img src="${esc(P.avatar)}" alt="${esc((P.name || '') + ' 프로필 사진')}">` : ''}<span><b>${esc(P.name || '')}</b><span>OWNER${P.handle ? ' · ' + esc(P.handle) : ''}</span></span></span>
  <span class="bio">${esc(P.bio || P.tagline || '')}</span></span></a>`));

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
  ${track ? `<span class="lbl music-lbl">TODAY'S TRACK</span><b>${esc(track.title)}</b><span>${esc([track.gameName, track.composer].filter(Boolean).join(' · '))}</span>`
          : '<b>곧 시작해요</b><span>추천곡을 고르는 중</span>'}
  </span></span></span></a>`));

/* NEWS : 윗줄 = 가장 최신 소식, 아랫줄 = 그와 겹치지 않는 라이브러리 게임의 최신 소식(없으면 다음 최신) */
const top = NEWS[0];
const second = NEWS.find(n => n !== top && n.game) || NEWS.find(n => n !== top);
const headline = [top, second].filter(Boolean);
const newsMeta = () => {
  const n = newCount();
  return n ? `<span class="cnt-b new" aria-label="새 소식 ${n}개">${n} NEW</span>`
    : `<span class="meta-line">${esc(NEWS_UPDATED.slice(5).replace('.', '/'))}</span>`;
};
chans.push(h(headline.length ? `<a href="#/news" class="chan news ch"><span class="scr">
  <span class="row-sb"><span class="lbl">NEWS</span><span class="news-meta">${newsMeta()}</span></span>
  <span class="body">${headline.map(n => `<span class="news-row"><span class="sw" style="background:${newsColor(n)}"></span>
    <span><span>${esc(newsWho(n))} · ${esc(n.d.slice(5).replace('.', '/'))}</span><b>${esc(n.t)}</b></span></span>`).join('<span class="rule"></span>')}</span>
  </span></a>`
  : `<div class="chan news soon"><span class="scr">
  <span class="row-sb"><span class="lbl">NEWS</span></span>
  <span class="soon-txt">아직 모아 온 소식이 없어요.</span></span></div>`));

/* LIBRARY */
chans.push(h(`<a href="#/library" class="chan lib ch"><span class="scr">
  <span class="row-sb"><span class="lbl">LIBRARY</span><span class="meta-line">${RECENT.length} CARTRIDGES</span></span>
  <span class="carts">${RECENT.slice(0, 3).map(g => cart(g, 60)).join('')}</span></span></a>`));

/* NOW PLAYING : 가장 최근에 기록한 게임 */
const playing = RECENT[0];
if (playing) {
  const p = playing.posts[0];
  const b = h(`<button type="button" class="chan playing ch"><span class="scr">
    <span class="lbl">NOW PLAYING</span>
    <span class="body"><span class="th" style="${artStyle(playing)}"></span><span class="t-col">
      <b>${esc(playing.name)}</b><span>기록 ${playing.posts.length}편</span></span></span>
    <span class="last"><span>LAST SAVE · ${md(p.d)}</span><b>${esc(p.t)}</b></span>
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

/* MESSAGE BOARD : 가장 최근 방명록 — guest.js 가 불러오면 'guestdata' 로 알려 준다 */
const guestChan = h('<a href="#/guest" class="chan guest ch"><span class="scr"></span></a>');
chans.push(guestChan);
let guestLatest;
function renderGuestChan(total, m) {
  guestChan.querySelector('.scr').innerHTML = `
    <span class="row-sb"><span class="lbl">MESSAGE BOARD</span>${total ? `<span class="cnt-b" aria-label="방명록 ${total}개">${total}</span>` : ''}</span>
    <span class="msg">${m === undefined ? '<p>방명록을 불러오는 중…</p>'
      : m ? `<b>${esc(m.n)}<span>${esc(m.d.slice(5))}</span></b><p>${esc(m.m)}</p>` : '<p>아직 남겨진 글이 없어요. 첫 번째로 남겨 주세요.</p>'}</span>
    <span class="go">방명록 남기기 →</span>`;
}
renderGuestChan(0, undefined);
addEventListener('guestdata', e => {
  if ('latest' in e.detail) guestLatest = e.detail.latest;
  renderGuestChan(e.detail.total, guestLatest);
});

chans.forEach(c => host.appendChild(c));
addEventListener('newsseen', () => { const m = host.querySelector('.news-meta'); if (m) m.innerHTML = newsMeta(); });
$('#chanCount').textContent = chans.length + ' CHANNELS';

/* 독의 시계 */
function tick() {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  $('#clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  $('#clockDate').textContent = `${d.getMonth() + 1}/${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
}
tick(); setInterval(tick, 10000);
