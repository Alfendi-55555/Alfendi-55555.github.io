/* 소개 : 랜딩 페이지처럼. 글은 content/profile.json, 숫자는 실제 기록에서 계산 */
import { $, $$, h, esc, cart, artStyle, darken, reduced } from './util.js';
import { GAMES, POSTS, RECENT, REVIEWED, PROFILE, BY_ID } from './store.js';
import { openCase } from './library.js';

const P = PROFILE;
const avg = REVIEWED.length ? REVIEWED.reduce((n, g) => n + g.review.rating, 0) / REVIEWED.length : 0;
const hours = REVIEWED.reduce((n, g) => n + (g.review.hours || 0), 0);
const d = ms => `style="animation-delay:${ms}ms"`;
const sec = (k, t) => `<div class="sec-line"><span class="sys">${k}</span><span class="ko">${t}</span><span class="rule"></span></div>`;
const bez = (inner, cls = '') => `<div class="bez ${cls}"><div class="in">${inner}</div></div>`;
/* 줄바꿈과 *강조* 를 허용하는 제목 */
const headline = s => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

/* ---------- 첫 화면 ---------- */
const floats = RECENT.slice(0, 3);
const spec = [['MODEL', P.model], ['REGION', P.region], ['SLOTS', RECENT.length + ' CARTRIDGES'], ['SAVES', POSTS.length + ' SAVES']]
  .filter(([, v]) => v).map(([k, v]) => `<div class="pf-row"><span>${k}</span><span>${esc(v)}</span></div>`).join('');
const hero = `<div class="wrap ab-hero">
  <div class="ab-copy">
    <span class="sys rise" ${d(0)}>SYSTEM INFO · 본체 정보</span>
    <h1 id="abTitle" class="rise" ${d(90)}>${headline(P.headline || P.tagline || '')}</h1>
    ${P.bio ? `<p class="ab-bio rise" ${d(180)}>${esc(P.bio)}</p>` : ''}
  </div>
  <div class="ab-stage">
    <div class="ab-card rise" ${d(120)}>${bez(`<div class="pf-top">${P.avatar ? `<img src="${esc(P.avatar)}" alt="${esc((P.name || '') + ' 프로필 사진')}">` : ''}
      <div><b>${esc(P.name || '')}</b><span>OWNER${P.handle ? ' · ' + esc(P.handle) : ''}${P.since ? ' · SINCE ' + esc(P.since) : ''}</span></div></div>${spec}`)}</div>
    ${floats.map((g, i) => `<div class="fl ${'abc'[i]} bob${'ABC'[i]}" aria-hidden="true"><div>${cart(g, [140, 128, 96][i])}</div></div>`).join('')}
  </div>
</div>`;

/* ---------- 숫자 : 화면에 들어올 때 0부터 센다 ---------- */
const STATS = [
  { v: GAMES.length, u: '개', l: '라이브러리의 게임' },
  { v: POSTS.length, u: '편', l: '게임별 기록' },
  { v: avg, u: '', l: '한줄 리뷰 평균 별점', dec: 1 },
  /* 리뷰 시트에 플레이 시간을 하나도 안 적었으면 0시간 대신 리뷰 수를 보인다 */
  hours ? { v: hours, u: '시간', l: '리뷰한 게임 누적 플레이' } : { v: REVIEWED.length, u: '개', l: '한줄 리뷰' }
];
const stats = `<div class="wrap" style="padding-top:0;padding-bottom:0"><div class="rise" ${d(300)}>${bez(STATS.map((s, i) =>
  `<div class="ab-stat"><b><span data-n="${i}">0</span>${s.u ? `<small>${s.u}</small>` : ''}</b><span>${s.l}</span></div>`).join(''), 'ab-stats')}</div></div>`;

/* ---------- 이 사이트는 : 목적 · 이런 분께 · 메뉴 안내 (profile.json 의 purpose) ---------- */
function purpose() {
  const u = P.purpose; if (!u) return '';
  const who = u.for && u.for.length ? `<div class="pp-for"><span class="sys">FOR</span><b>이런 분께</b>
    <ul class="lst">${u.for.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const menu = u.menu && u.menu.length ? `<nav class="pp-menu" aria-label="사이트 안내">${u.menu.map(m =>
    `<a href="${esc(m.href)}"><b>${esc(m.name)}</b><span>${esc(m.text)}</span><i aria-hidden="true">→</i></a>`).join('')}</nav>` : '';
  return `<section class="ab-sec">${sec('ABOUT THIS SITE', '이 사이트는')}<div class="two-col wide">
    <div>${bez(`<p class="pp-text">${esc(u.text || '')}</p>${who}`)}</div><div>${bez(menu, 'pp-nav')}</div></div></section>`;
}

/* ---------- 게임과 함께한 길 (profile.json 의 history) ---------- */
const history = P.history && P.history.length ? `<section class="ab-sec">${sec('HISTORY', '게임과 함께한 길')}${bez(`<ol class="tl">${P.history.map((x, i) =>
  `<li><span class="tl-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><span class="tl-l">${esc(x.label || '')}</span><b>${esc(x.title || '')}</b>${x.text ? `<p>${esc(x.text)}</p>` : ''}</div></li>`).join('')}</ol>`)}</section>` : '';

/* ---------- 가장 좋아하는 게임 (profile.json 의 favorite 가 있을 때만) ---------- */
function favorite() {
  const f = P.favorite; if (!f) return '';
  const g = f.game ? BY_ID.get(f.game) : null;
  const name = f.title || (g && g.name) || '';
  const cov = g && g.img ? `class="fcov img" style="${artStyle(g)}"` : `class="fcov" style="background:${g ? darken(g.color) : '#3F4C57'}"`;
  const meta = [['FIRST PLAYED', f.first], ['CLEARED', f.cleared], ['TIME', f.hours != null ? f.hours + 'H' : null]].filter(([, v]) => v != null && v !== '');
  return `<section class="ab-sec">${sec('FAVORITE', '가장 좋아하는 게임')}${bez(`
    <div class="fav-case shell" aria-hidden="true"><span class="ridge"></span><div class="fband"><span class="wm">PLAY<i>LOG</i></span><span>FAVORITE</span></div>
      <div ${cov}><span class="star">★</span><b>${esc(name)}</b></div><span class="gloss"></span></div>
    <div class="fav-info"><span class="sys">MY NO.1</span><h2>${esc(name)}</h2>${f.reason ? `<p>${esc(f.reason)}</p>` : ''}
      ${meta.length ? `<div class="fav-meta">${meta.map(([k, v]) => `<div><span class="sys">${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}</div>`, 'ab-fav')}</section>`;
}

/* ---------- 좋아하는 것 / 잘 안 맞는 것 ---------- */
const list = (k, t, items, no) => bez(`<div class="lst-hd"><span class="sys">${k}</span><b>${t}</b></div>
  <ul class="lst${no ? ' no' : ''}">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
const style = (P.likes && P.likes.length) || (P.dislikes && P.dislikes.length) ? `<section class="ab-sec">${sec('INTERESTS', '관심 분야')}
  <div class="two-col">${P.likes && P.likes.length ? `<div>${list('LIKES', '좋아하는 게임', P.likes)}</div>` : ''}${P.dislikes && P.dislikes.length ? `<div>${list('DISLIKES', '잘 안 맞는 게임', P.dislikes, true)}</div>` : ''}</div></section>` : '';

/* ---------- 별점 분포 · 태그 ---------- */
const bucket = [0, 0, 0, 0, 0];
REVIEWED.forEach(g => bucket[Math.min(4, Math.max(0, Math.round(g.review.rating) - 1))]++);
const bmax = Math.max(1, ...bucket);
const hi = REVIEWED.filter(g => g.review.rating >= 4).length;
const tagCount = {};
POSTS.forEach(p => p.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
const rating = `<section class="ab-sec"><div class="two-col wide">
  <div>${sec('RATING', '별점을 이렇게 줍니다')}${bez(`<div class="dist2">${[4, 3, 2, 1, 0].map((i, k) =>
    `<div class="row"><span>${i + 1}★</span><span class="tr"><i class="grow" style="width:${bucket[i] / bmax * 100}%;animation-delay:${200 + k * 90}ms"></i></span><span>${bucket[i]}</span></div>`).join('')}</div>
    ${REVIEWED.length ? `<p class="dist-note">${REVIEWED.length}개 리뷰 중 4점 이상이 ${hi}개${hi / REVIEWED.length >= 0.6 ? '. 후한 편이에요.' : hi / REVIEWED.length <= 0.3 ? '. 짠 편이에요.' : '.'}</p>` : ''}`)}</div>
  <div>${sec('TAGS', '자주 쓰는 태그')}${bez(`<div class="tagcloud">${tags.map(([t, n]) => `<span>#${esc(t)}${n > 1 ? `<i>${n}</i>` : ''}</span>`).join('')}</div>`)}</div>
</div></section>`;

/* ---------- 플레이 환경 ---------- */
const hw = P.hardware && P.hardware.length ? `<section class="ab-sec">${sec('HARDWARE', '플레이 환경')}<div class="hw4">${P.hardware.map(x => bez(`
  <div class="top"><span class="bd">${esc(x.badge || '')}</span>${x.note ? `<span class="nt">${esc(x.note)}</span>` : ''}</div>
  <div><b>${esc(x.name || '')}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</div>`)).join('')}</div></section>` : '';

const body = `<div class="wrap" style="padding-top:0;padding-bottom:0">${purpose()}${history}${favorite()}${style}${rating}${hw}</div>`;

/* ---------- 최근 꺼낸 카트리지 : 끝없이 흐른다 (보일 때만) ---------- */
const row = RECENT.map(g => `<button type="button" class="shelf-item lift" data-id="${esc(g.id)}" aria-label="${esc(g.name)} 케이스 열기">${cart(g, 120)}<span class="tx"><span class="nm">${esc(g.name)}</span><span class="sv">${g.posts.length} SAVES</span></span></button>`).join('');
const marq = RECENT.length ? `<section class="ab-marq">${sec('RECENT', '최근 꺼낸 카트리지')}
  <div class="marq-wrap"><div class="marq" id="abMarq">${row}<span class="dup" aria-hidden="true" style="display:contents">${row}</span></div></div></section>` : '';

const cta = `<div class="wrap" style="padding-top:0"><div class="ab-cta"><span class="sys">MESSAGE BOARD<span id="abGuestCnt"></span></span>
  <h2>다녀간 흔적을 남겨 주세요</h2><p>궁금한 게임, 같이 하고 싶은 이야기, 무엇이든요.</p><a href="#/guest">방명록으로</a></div></div>`;

/* 방명록 글 수는 guest.js 가 불러오면 채운다 */
addEventListener('guestdata', e => { const c = $('#abGuestCnt'); if (c) c.textContent = ` · ${e.detail.total} NOTES`; });

const root = $('#aboutRoot');
root.innerHTML = hero + stats + body + marq + cta;
/* 복제본은 화면 읽기 프로그램과 탭 이동에서 뺀다 */
$$('.dup .shelf-item', root).forEach(b => { b.tabIndex = -1; });
$$('.shelf-item', root).forEach(b => b.addEventListener('click', () => openCase(BY_ID.get(b.dataset.id), b)));

const mq = $('#abMarq');
if (mq && !reduced && 'IntersectionObserver' in window) {
  new IntersectionObserver(es => es.forEach(e => mq.classList.toggle('run', e.isIntersecting))).observe(mq);
}

/* 소개 화면에 들어올 때마다 숫자를 다시 센다 */
let iv = 0;
export function aboutShown() {
  clearInterval(iv);
  const els = $$('[data-n]', root);
  const put = t => els.forEach(el => {
    const s = STATS[+el.dataset.n];
    el.textContent = s.dec ? (s.v * t).toFixed(s.dec) : Math.round(s.v * t);
  });
  if (reduced) { put(1); return; }
  put(0);
  const start = performance.now() + 450;
  iv = setInterval(() => {
    const x = Math.min(1, Math.max(0, (performance.now() - start) / 1300));
    put(1 - Math.pow(1 - x, 3));
    if (x >= 1) clearInterval(iv);
  }, 30);
}
