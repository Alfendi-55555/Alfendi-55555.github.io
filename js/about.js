/* 소개 : 랜딩 페이지처럼. 글은 content/profile.json, 숫자는 실제 기록에서 계산 */
import { $, $$, h, esc, cart, artStyle, darken, reduced } from './util.js';
import { GAMES, POSTS, RECENT, REVIEWED, RATED, PROFILE, BY_ID } from './store.js';
import { openCase } from './library.js';

const P = PROFILE;
const avg = RATED.length ? RATED.reduce((n, g) => n + g.review.rating, 0) / RATED.length : 0;
const hours = REVIEWED.reduce((n, g) => n + (g.review.hours || 0), 0);
const d = ms => `style="animation-delay:${ms}ms"`;
/* 칸 제목 : 작은 영문 표시 + 굵고 큰 한글 제목 (캐치프레이즈보다 한 단계 작게) */
const sec = (k, t) => `<header class="ab-h"><span class="sys">${k}</span><h2>${t}</h2></header>`;
const bez = (inner, cls = '') => `<div class="bez ${cls}"><div class="in">${inner}</div></div>`;
/* 줄바꿈과 *강조* 를 허용하는 제목 */
const headline = s => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

/* ---------- 첫 화면 ---------- */
const floats = RECENT.slice(0, 3);
/* 카트리지 · 세이브 수는 아래 기록 현황에 있으니 여기엔 자기소개 한마디 */
const spec = [['MODEL', P.model], ['REGION', P.region]]
  .filter(([, v]) => v).map(([k, v]) => `<div class="pf-row"><span>${k}</span><span>${esc(v)}</span></div>`).join('')
  + (P.intro ? `<p class="pf-say">${esc(P.intro)}</p>` : '');
const hero = `<div class="wrap ab-hero">
  <div class="ab-copy">
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
const stats = `<div id="abStats">${bez(STATS.map((s, i) =>
  `<div class="ab-stat"><b><span data-n="${i}">0</span>${s.u ? `<small>${s.u}</small>` : ''}</b><span>${s.l}</span></div>`).join(''), 'ab-stats')}</div>`;

/* ---------- 이 사이트는 : 목적 · 이런 분께 · 메뉴 안내 (profile.json 의 purpose) ---------- */
function purpose() {
  const u = P.purpose; if (!u) return '';
  const who = u.for && u.for.length ? `<div class="pp-for"><span class="sys">FOR</span><b>이런 분께</b>
    <ul class="lst">${u.for.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const menu = u.menu && u.menu.length ? `<nav class="pp-menu" aria-label="사이트 안내">${u.menu.map(m =>
    `<a href="${esc(m.href)}"><b>${esc(m.name)}</b><span>${esc(m.text)}</span><i aria-hidden="true">→</i></a>`).join('')}</nav>` : '';
  return `<section class="ab-sec">${sec('GUIDE', '이 사이트는')}<div class="two-col">
    <div>${bez(who)}</div><div>${bez(menu, 'pp-nav')}</div></div></section>`;
}

/* ---------- 나 → 이 사이트로 넘어가는 칸 : 큰 문장 + 카트리지가 길을 따라 PLAYLOG 슬롯에 들어가 저장된다 ---------- */
function bridge() {
  const u = P.purpose; if (!u) return '';
  const carts = RECENT.slice(0, 3).map((g, i) => `<div class="br-cart c${i}">${cart(g, 58)}</div>`).join('');
  return `<section class="ab-bridge" id="abBridge">
    <span class="sys">ABOUT THIS SITE · 이 사이트에 대하여</span>
    <h2>${headline(P.bridge || '')}</h2>
    ${u.text ? `<p>${esc(u.text)}</p>` : ''}
    <div class="br-run" aria-hidden="true"><span class="br-trail"></span>${carts}
      <div class="br-slot"><span class="br-mouth"></span><span class="wm">PLAY<i>LOG</i></span><span class="br-led"></span><span class="br-saved">SAVED</span></div></div>
  </section>`;
}

/* ---------- 게임과 함께한 길 (profile.json 의 history) ---------- */
/* 왼쪽에서 오른쪽으로 이어지는 길. 가장 좋아하는 게임 칸은 별로 표시 */
const favT = P.favorite && (P.favorite.title || (BY_ID.get(P.favorite.game) || {}).name);
const history = P.history && P.history.length ? `<section class="ab-sec">${sec('HISTORY', '게임과 함께한 길')}<ol class="trail" id="abTrail" style="--n:${P.history.length}">${P.history.map((x, i) =>
  `<li style="--i:${i}"${x.title === favT ? ' class="fav"' : ''}><span class="tr-dot" aria-hidden="true">${x.title === favT ? '★' : String(i + 1).padStart(2, '0')}</span>
    <div class="tr-card"><span class="tl-l">${esc(x.label || '')}</span><b>${esc(x.title || '')}</b>${x.text ? `<p>${esc(x.text)}</p>` : ''}</div></li>`).join('')}</ol></section>` : '';

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
RATED.forEach(g => bucket[Math.min(4, Math.max(0, Math.floor(g.review.rating) - 1))]++);
const bmax = Math.max(1, ...bucket);
const hi = RATED.filter(g => g.review.rating >= 4).length;
const tagCount = {};
POSTS.forEach(p => p.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
const rating = `<section class="ab-sec">${sec('STATS', '기록 현황')}${stats}<div class="two-col wide" style="margin-top:24px">
  <div><h3 class="sub-h">별점을 이렇게 줍니다</h3>${bez(`<div class="dist2">${[4, 3, 2, 1, 0].map((i, k) =>
    `<div class="row"><span>${i + 1}★</span><span class="tr"><i class="grow" style="width:${bucket[i] / bmax * 100}%;animation-delay:${200 + k * 90}ms"></i></span><span>${bucket[i]}</span></div>`).join('')}</div>
    ${RATED.length ? `<p class="dist-note">${RATED.length}개 리뷰 중 4점 이상이 ${hi}개${hi / RATED.length >= 0.6 ? '. 후한 편이에요.' : hi / RATED.length <= 0.3 ? '. 짠 편이에요.' : '.'}</p>` : ''}`)}</div>
  <div><h3 class="sub-h">자주 쓰는 태그</h3>${bez(`<div class="tagcloud">${tags.map(([t, n]) => `<span>#${esc(t)}${n > 1 ? `<i>${n}</i>` : ''}</span>`).join('')}</div>`)}</div>
</div></section>`;

/* ---------- 플레이 환경 ---------- */
/* 기기 그림 : 이름을 한 번 더 쓰지 않게 글자 배지 대신 모양만 (badge 값으로 고른다) */
const DEV = {
  fold: '<rect x="5" y="2.5" width="14" height="9" rx="1.6"/><rect x="5" y="12.5" width="14" height="9" rx="1.6"/><rect x="8" y="4.6" width="8" height="4.8" rx=".6"/><circle cx="8.6" cy="17" r="1.2"/><path d="M13.4 16.2h3M13.4 18h3"/>',
  hybrid: '<rect x="6.5" y="6" width="11" height="12" rx="1"/><path d="M6.5 6.4H5A2.6 2.6 0 0 0 2.4 9v6A2.6 2.6 0 0 0 5 17.6h1.5M17.5 6.4H19A2.6 2.6 0 0 1 21.6 9v6a2.6 2.6 0 0 1-2.6 2.6h-1.5"/><circle cx="4.5" cy="10" r=".9"/><circle cx="19.5" cy="14" r=".9"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.2"/><path d="M2 19h20M10 17h4"/>'
};
const devKind = b => /^(DS|3DS)$/i.test(b || '') ? 'fold' : /^NS/i.test(b || '') ? 'hybrid' : 'laptop';
const devIcon = b => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DEV[devKind(b)]}</svg>`;
const hw = P.hardware && P.hardware.length ? `<section class="ab-sec">${sec('HARDWARE', '플레이 환경')}<div class="hw4">${P.hardware.map(x => bez(`
  <div class="top"><span class="bd">${devIcon(x.badge)}</span>${x.note ? `<span class="nt">${esc(x.note)}</span>` : ''}</div>
  <div><b>${esc(x.name || '')}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</div>`)).join('')}</div></section>` : '';

const body = `<div class="wrap" style="padding-top:0;padding-bottom:0">${history}${favorite()}${style}${hw}${bridge()}${purpose()}${rating}</div>`;

/* ---------- 최근 꺼낸 카트리지 : 끝없이 흐른다 (보일 때만) ---------- */
const row = RECENT.map(g => `<button type="button" class="shelf-item lift" data-id="${esc(g.id)}" aria-label="${esc(g.name)} 케이스 열기">${cart(g, 120)}<span class="tx"><span class="nm">${esc(g.name)}</span><span class="sv">${g.posts.length} SAVES</span></span></button>`).join('');
const marq = RECENT.length ? `<section class="ab-marq">${sec('RECENT', '최근 꺼낸 카트리지')}
  <div class="marq-wrap"><div class="marq" id="abMarq">${row}<span class="dup" aria-hidden="true" style="display:contents">${row}</span></div></div></section>` : '';

/* 방명록 안내 : 다른 칸과 같은 제목 + 카드 */
const cta = `<div class="wrap" style="padding-top:0"><section class="ab-sec ab-cta">${sec('GUESTBOOK', '다녀간 흔적을 남겨 주세요')}${bez(`
  <p>궁금한 게임이나 같이 하고 싶은 이야기, 무엇이든 편하게 남겨 주세요.</p><a class="btn-dark" href="#/guest">방명록으로 <span aria-hidden="true">→</span></a>`, 'cta-card')}</section></div>`;

const root = $('#aboutRoot');
root.innerHTML = hero + body + marq + cta;
/* 복제본은 화면 읽기 프로그램과 탭 이동에서 뺀다 */
$$('.dup .shelf-item', root).forEach(b => { b.tabIndex = -1; });
$$('.shelf-item', root).forEach(b => b.addEventListener('click', () => openCase(BY_ID.get(b.dataset.id), b)));

const mq = $('#abMarq');
if (mq && !reduced && 'IntersectionObserver' in window) {
  new IntersectionObserver(es => es.forEach(e => mq.classList.toggle('run', e.isIntersecting))).observe(mq);
}
/* 길 · 넘어가는 칸 : 화면에 들어오면 go (나갔다 다시 오면 처음부터) */
const io = 'IntersectionObserver' in window && !reduced
  ? new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('go'); if (e.target.id === 'abStats') countUp(); }
      else if (e.boundingClientRect.top > 0) e.target.classList.remove('go');   /* 아래로 나가면 다음에 다시 */
      else e.target.classList.add('go');
      /* 한 번에 건너뛰어 위로 지나간 칸(알림이 오지 않는다)도 보인 채로 */
      watched.forEach(w => { if (w.getBoundingClientRect().bottom < 0) w.classList.add('go'); });
    }), { threshold: 0, rootMargin: '0px 0px -12% 0px' })   /* 아주 긴 칸(휴대폰의 길)도 들어오자마자 */
  : null;
/* 칸마다 화면에 들어올 때 아래에서 떠오른다 — 위에서부터 차례로 읽어 내려가는 흐름 */
const watched = [...$$('.ab-sec, .ab-marq, .ab-cta', root), ...['#abTrail', '#abBridge', '#abStats'].map(s => $(s)).filter(Boolean)];
watched.forEach(el => { if (io) io.observe(el); else el.classList.add('go'); });

/* 숫자는 「기록 현황」이 화면에 들어올 때 0부터 센다 */
let iv = 0;
export function aboutShown() { if (!io) countUp(); }
function countUp() {
  clearInterval(iv);
  const els = $$('[data-n]', root);
  const put = t => els.forEach(el => {
    const s = STATS[+el.dataset.n];
    el.textContent = s.dec ? (s.v * t).toFixed(s.dec) : Math.round(s.v * t);
  });
  if (reduced) { put(1); return; }
  put(0);
  const start = performance.now() + 150;
  iv = setInterval(() => {
    const x = Math.min(1, Math.max(0, (performance.now() - start) / 1300));
    put(1 - Math.pow(1 - x, 3));
    if (x >= 1) clearInterval(iv);
  }, 30);
}
