export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarse = matchMedia('(pointer: coarse)').matches;

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 문자열 하나를 요소 하나로 */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function darken(hex, f = 0.72) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => Math.round(parseInt(n.slice(i, i + 2), 16) * f));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* 게임 이미지가 있으면 이미지, 없으면 단색 */
export const artStyle = (g, dark = false) => g.img
  ? `background-image:url('${esc(g.img)}')`
  : `background:${dark ? darken(g.color) : g.color}`;
export const imgStyle = src => `background-image:url('${esc(src)}')`;

export const md = d => { const [, m, dd] = d.split('.'); return `${+m}/${+dd}`; };

let starSeq = 0;
export function stars(r, size = 13) {
  let out = '<span class="stars" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) {
    let fill = 'none', defs = '';
    if (r >= i) fill = '#E78B3B';
    else if (r >= i - 0.5) {
      const id = 'hs' + (++starSeq);
      defs = `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="50%" stop-color="#E78B3B"/><stop offset="50%" stop-color="rgba(0,0,0,0)"/></linearGradient></defs>`;
      fill = `url(#${id})`;
    }
    out += `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${defs}<path d="M12 2.6 14.9 9.2 22 10 16.8 14.9 18.2 22 12 18.5 5.8 22 7.2 14.9 2 10l7.1-.8Z" fill="${fill}" stroke="#E78B3B" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  return out + '</span>';
}

export function cart(g, w = 124) {
  return `<div class="cart${w < 60 ? ' sm' : ''}" style="--w:${w}px" aria-hidden="true">`
    + '<div class="grip"><i></i><i></i><i></i></div><div class="paper">'
    + `<div class="plate">${esc(g.name.toUpperCase())}</div>`
    + `<div class="win" style="${artStyle(g)}"></div>`
    + `<div class="band" style="background:${g.color}"></div></div></div>`;
}

export const CART_SVG = '<svg width="8" height="10" viewBox="0 0 11 13" aria-hidden="true"><path d="M1 1.6C1 1.27 1.27 1 1.6 1h7.8c.33 0 .6.27.6.6v8.2c0 .2-.1.38-.26.49l-1.6 1.06a.6.6 0 0 1-.33.1H1.6a.6.6 0 0 1-.6-.6V1.6Z" fill="currentColor"/></svg>';

export function excerpt(p, n = 90) {
  const b = (p.blocks || []).find(x => x.type === 'text');
  const t = b ? b.text.replace(/\s+/g, ' ').trim() : '';
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
