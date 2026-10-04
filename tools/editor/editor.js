/* PLAYLOG 글쓰기 — 보이는 그대로 편집하고, 사이트 기록 형식(index.md)으로 저장한다.
   지원하는 서식은 사이트(scripts/build.py)가 아는 것만 : 문단 · 줄바꿈 · 소제목 2단계 · 목록 · 인용 ·
   굵게 · 기울임 · 취소선 · 링크 · ||스포일러|| · 사진(캡션 · 대체텍스트) · YouTube */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ed = $('#ed'), pv = $('#pv');
const YT = /^https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:\S*&)?v=|shorts\/|live\/|embed\/))([\w-]{11})(\S*)$/;
const DRAFT_KEY = 'pl_editor_draft';

let META = { games: [], posts: [], tags: [], styles: [] };
let state = { path: null, tags: [], dirty: false };

/* ---------- 서버 ---------- */
async function api(url, body, raw) {
  const opt = body === undefined ? {} : raw ? { method: 'POST', ...raw } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(url, opt);
  const d = await r.json().catch(() => ({ error: '서버 응답을 읽지 못했어요.' }));
  if (!r.ok || d.error) throw new Error(d.error || '요청에 실패했어요.');
  return d;
}
function say(t, kind = '') { const m = $('#msg'); m.textContent = t; m.className = 'msg ' + kind; }

/* ---------- 대화상자 ---------- */
function ask(title, html, okText = '확인', danger = false) {
  const d = $('#dlg');
  $('#dlgT').textContent = title; $('#dlgB').innerHTML = html;
  const ok = $('#dlgOk'); ok.textContent = okText; ok.className = 'btn ' + (danger ? 'dark danger' : 'dark');
  d.returnValue = '';
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true }));
}

/* ======================= 본문 → index.md ======================= */
const wrap = (m, inner) => {                      // 앞뒤 공백은 기호 밖으로 (*기울임*이 깨지지 않게)
  const core = inner.trim(); if (!core) return inner;
  const lead = inner.match(/^\s*/)[0], trail = inner.match(/\s*$/)[0];
  return lead + m + core + m + trail;
};
function inline(node) {
  let out = '';
  node.childNodes.forEach(c => {
    if (c.nodeType === 3) { out += c.nodeValue.replace(/​/g, '').replace(/ /g, ' '); return; }
    if (c.nodeType !== 1) return;
    const t = c.tagName;
    if (t === 'BR') { out += '\n'; return; }
    const inner = inline(c);
    if (t === 'B' || t === 'STRONG') out += wrap('**', inner);
    else if (t === 'I' || t === 'EM') out += wrap('*', inner);
    else if (t === 'S' || t === 'STRIKE' || t === 'DEL') out += wrap('~~', inner);
    else if (t === 'A' && /^https?:\/\//.test(c.getAttribute('href') || '')) out += inner.trim() ? `[${inner.replace(/[\[\]]/g, '')}](${c.getAttribute('href')})` : '';
    else if (c.classList && (c.classList.contains('ed-spoiler') || c.classList.contains('spoiler'))) out += inner.trim() ? `||${inner}||` : inner;
    else if (t === 'P' || t === 'DIV') out += (out && !out.endsWith('\n') ? '\n' : '') + inner;
    else out += inner;
  });
  return out;
}
const clean = s => s.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '');
const INLINE_TAGS = /^(B|I|EM|STRONG|S|STRIKE|DEL|A|SPAN|BR|FONT|U|SUB|SUP|CODE|MARK)$/;
const BLOCKY = 'p,div,h1,h2,h3,h4,ul,ol,blockquote,figure,li';
function walk(box, out) {
  let loose = null;                                // 블록 사이에 그냥 놓인 글자는 문단으로 모은다
  const flush = () => { if (loose) { const s = clean(inline(loose)); if (s.trim()) out.push(s); loose = null; } };
  box.childNodes.forEach(n => {
    if (n.nodeType === 3 || (n.nodeType === 1 && INLINE_TAGS.test(n.tagName) && !n.querySelector(BLOCKY))) {
      if (!loose) loose = document.createElement('p');
      loose.appendChild(n.cloneNode(true)); return;
    }
    flush();
    if (n.nodeType !== 1) return;
    const t = n.tagName;
    if (n.classList.contains('ed-img')) {
      const cap = $('.cap', n).value.replace(/[\[\]\n]/g, ' ').trim();
      const alt = $('.alt', n).value.replace(/["\n]/g, ' ').trim();
      out.push(`![${cap}](${n.dataset.src}${alt ? ` "${alt}"` : ''})`);
    } else if (n.classList.contains('ed-yt')) {
      const u = $('.url', n).value.trim(); if (YT.test(u)) out.push(u);
    } else if (/^H[1-4]$/.test(t)) {
      const s = clean(inline(n)).replace(/\n/g, ' ').trim(); if (s) out.push((t === 'H3' || t === 'H4' ? '### ' : '## ') + s);
    } else if (t === 'BLOCKQUOTE') {
      const s = clean(inline(n)); if (s.trim()) out.push(s.split('\n').map(l => '> ' + l).join('\n'));
    } else if (t === 'UL' || t === 'OL') {
      const items = $$(':scope > li', n).map(li => clean(inline(li)).replace(/\n/g, ' ').trim()).filter(Boolean);
      if (items.length) out.push(items.map((x, i) => (t === 'OL' ? `${i + 1}. ` : '- ') + x).join('\n'));
    } else if (n.querySelector(BLOCKY)) {
      walk(n, out);                                // 문단 안에 목록 · 인용 등이 들어간 경우 — 안쪽을 블록 단위로
    } else {
      const s = clean(inline(n)); if (s.trim()) out.push(s);
    }
  });
  flush();
}
function toMarkdown() { const out = []; walk(ed, out); return out.join('\n\n'); }

/* ======================= blocks(사이트 형식) → 본문 ======================= */
const fromSite = html => html.replace(/\n/g, '<br>')
  .replace(/<span class="spoiler"[^>]*>/g, '<span class="ed-spoiler">');
function imgBlock(src, cap = '', alt = '') {
  const f = document.createElement('figure');
  f.className = 'ed-img'; f.contentEditable = 'false'; f.dataset.src = src;
  f.innerHTML = `<img src="${esc(src)}" alt="">
    <div class="ed-img-f">
      <input type="text" class="cap" placeholder="캡션 — 사진 아래에 보여요" value="${esc(cap)}">
      <input type="text" class="alt" placeholder="대체텍스트 — 무엇이 보이는지 (비우면 캡션을 써요)" value="${esc(alt)}">
      <div class="ed-act"><label><input type="radio" name="cover"> 표지로 쓰기</label>
        <button type="button" data-a="up" title="위로">↑</button><button type="button" data-a="down" title="아래로">↓</button><button type="button" class="del" data-a="del">삭제</button></div>
    </div>`;
  return f;
}
function ytBlock(url) {
  const d = document.createElement('div');
  d.className = 'ed-yt'; d.contentEditable = 'false';
  d.innerHTML = `<span class="ic">▶</span><input class="url" value="${esc(url)}" placeholder="YouTube 주소">
    <div class="ed-act"><button type="button" data-a="up">↑</button><button type="button" data-a="down">↓</button><button type="button" class="del" data-a="del">삭제</button></div>`;
  return d;
}
function loadBlocks(blocks, cover) {
  ed.innerHTML = '';
  blocks.forEach(b => {
    let n;
    if (b.type === 'text') { n = document.createElement('p'); n.innerHTML = fromSite(b.html); }
    else if (b.type === 'h') { n = document.createElement(b.level === 3 ? 'h3' : 'h2'); n.innerHTML = fromSite(b.html); }
    else if (b.type === 'quote') { n = document.createElement('blockquote'); n.innerHTML = fromSite(b.html); }
    else if (b.type === 'list') { n = document.createElement(b.ordered ? 'ol' : 'ul'); n.innerHTML = b.items.map(i => `<li>${fromSite(i)}</li>`).join(''); }
    else if (b.type === 'youtube') n = ytBlock(`https://youtu.be/${b.id}${b.start ? '?t=' + b.start : ''}`);
    else n = imgBlock(b.src, b.caption, b.alt && b.alt !== b.caption ? b.alt : '');
    ed.appendChild(n);
  });
  $$('a', ed).forEach(a => a.removeAttribute('target'));
  if (cover) { const f = $$('.ed-img', ed).find(x => x.dataset.src === cover); if (f) $('input[name=cover]', f).checked = true; }
  ensureTail(); markCover();
}
function ensureTail() {                            // 사진 · 영상 뒤에도 이어서 쓸 수 있게 빈 문단 하나
  const last = ed.lastElementChild;
  if (!last || last.classList.contains('ed-img') || last.classList.contains('ed-yt')) ed.insertAdjacentHTML('beforeend', '<p><br></p>');
  ed.classList.toggle('empty', !ed.textContent.trim() && !$('.ed-img,.ed-yt', ed));
}
function markCover() {
  const figs = $$('.ed-img', ed);
  if (figs.length && !figs.some(f => $('input[name=cover]', f).checked)) $('input[name=cover]', figs[0]).checked = true;
  figs.forEach(f => f.classList.toggle('cover', $('input[name=cover]', f).checked));
}

/* ======================= 서식 버튼 ======================= */
document.execCommand('defaultParagraphSeparator', false, 'p');
const topBlock = node => { while (node && node.parentNode !== ed) node = node.parentNode; return node; };
function selInEditor() { const s = getSelection(); return s.rangeCount && ed.contains(s.anchorNode) ? s : null; }
function cmd(c) {
  if (c === 'image') return $('#fileIn').click();
  if (c === 'youtube') return addYoutube();
  ed.focus();
  const s = selInEditor(); if (!s && !['p', 'h2', 'h3'].includes(c)) return;
  const map = { p: ['formatBlock', 'p'], h2: ['formatBlock', 'h2'], h3: ['formatBlock', 'h3'], quote: ['formatBlock', 'blockquote'],
    bold: ['bold'], italic: ['italic'], strike: ['strikeThrough'], ul: ['insertUnorderedList'], ol: ['insertOrderedList'], clear: ['removeFormat'] };
  if (c === 'link') return addLink();
  if (c === 'spoiler') return toggleSpoiler();
  if (c === 'clear') { document.execCommand('removeFormat'); document.execCommand('unlink'); unwrapSpoiler(); return changed(); }
  const [name, arg] = map[c];
  document.execCommand(name, false, arg);
  changed();
}
function addLink() {
  const s = selInEditor(); if (!s) return;
  const range = s.getRangeAt(0).cloneRange();
  const cur = s.anchorNode && s.anchorNode.parentElement && s.anchorNode.parentElement.closest('a');
  const url = prompt('링크 주소 (https://…). 비우면 링크를 지워요.', cur ? cur.href : 'https://');
  if (url === null) return;
  s.removeAllRanges(); s.addRange(range);
  if (!url.trim() || url.trim() === 'https://') document.execCommand('unlink');
  else if (!/^https?:\/\//.test(url.trim())) return say('링크는 http:// 또는 https:// 로 시작해야 해요.', 'err');
  else if (range.collapsed) document.execCommand('insertHTML', false, `<a href="${esc(url.trim())}">${esc(url.trim())}</a>`);
  else document.execCommand('createLink', false, url.trim());
  changed();
}
function unwrapSpoiler(sp) {
  const list = sp ? [sp] : $$('.ed-spoiler', ed).filter(x => getSelection().containsNode(x, true));
  list.forEach(x => { x.replaceWith(...x.childNodes); });
}
function toggleSpoiler() {
  const s = selInEditor(); if (!s) return;
  const inSp = s.anchorNode.parentElement && s.anchorNode.parentElement.closest('.ed-spoiler');
  if (inSp) { unwrapSpoiler(inSp); return changed(); }
  const r = s.getRangeAt(0);
  if (r.collapsed) return say('가릴 글자를 먼저 골라 주세요.', 'err');
  const span = document.createElement('span'); span.className = 'ed-spoiler';
  span.appendChild(r.extractContents());
  r.insertNode(span);
  s.removeAllRanges(); const nr = document.createRange(); nr.selectNodeContents(span); s.addRange(nr);
  changed();
}
function insertBlock(node) {                       // 지금 커서가 있는 문단 뒤에 블록을 넣는다 (빈 문단이면 바꿔 끼운다)
  const s = selInEditor();
  const cur = s ? topBlock(s.anchorNode) : ed.lastElementChild;
  if (cur && cur !== ed && !cur.classList.contains('ed-img') && !cur.classList.contains('ed-yt') && !cur.textContent.trim() && !$('img', cur)) cur.replaceWith(node);
  else if (cur && cur !== ed) cur.after(node);
  else ed.appendChild(node);
  if (!node.nextElementSibling) node.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
  ensureTail(); markCover(); changed();
}
async function addYoutube(pre) {
  const url = pre || prompt('YouTube 주소를 붙여 넣어 주세요. (일부 공개 영상도 돼요)', '');
  if (!url) return;
  if (!YT.test(url.trim())) return say('YouTube 영상 주소가 아니에요.', 'err');
  insertBlock(ytBlock(url.trim()));
}
$$('.toolbar [data-cmd]').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));   // 누를 때 선택이 풀리지 않게
$$('.toolbar [data-cmd]').forEach(b => b.addEventListener('click', () => cmd(b.dataset.cmd)));

/* ======================= 사진 : 크면 줄여서 올린다 ======================= */
async function shrink(file) {
  if (file.type === 'image/gif') return { blob: file, ext: '.gif' };
  const ext = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg';
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, ext };
  if (bmp.width <= 1600 && file.size <= 1200 * 1024) return { blob: file, ext };
  const w = Math.min(1600, bmp.width), h = Math.round(bmp.height * w / bmp.width);
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .86));
  return { blob, ext: '.jpg' };
}
async function addImages(files) {
  const imgs = [...files].filter(f => /^image\/(jpeg|png|gif|webp)$/.test(f.type));
  if (!imgs.length) return say('jpg · png · gif · webp 사진만 넣을 수 있어요.', 'err');
  for (const [i, f] of imgs.entries()) {
    say(`사진 올리는 중… (${i + 1}/${imgs.length})`);
    try {
      const { blob, ext } = await shrink(f);
      const { url } = await api('/api/upload', null, { headers: { 'X-Ext': ext }, body: blob });
      insertBlock(imgBlock(url));
    } catch (e) { say(e.message, 'err'); return; }
  }
  say(`사진 ${imgs.length}장을 넣었어요. 캡션과 대체텍스트를 적어 주세요.`, 'ok');
}
$('#fileIn').addEventListener('change', e => { addImages(e.target.files); e.target.value = ''; });

/* 사진 · 영상 칸의 버튼 (위로 · 아래로 · 삭제 · 표지) */
ed.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const blk = b.closest('.ed-img,.ed-yt');
  const a = b.dataset.a;
  if (a === 'del') blk.remove();
  if (a === 'up' && blk.previousElementSibling) blk.previousElementSibling.before(blk);
  if (a === 'down' && blk.nextElementSibling) blk.nextElementSibling.after(blk);
  ensureTail(); markCover(); changed();
});
ed.addEventListener('change', e => { if (e.target.name === 'cover') { markCover(); changed(); } });

/* 붙여 넣기 : 사진은 사진으로, YouTube 주소는 영상으로, 나머지는 서식 없는 글자로 */
ed.addEventListener('paste', e => {
  if (e.target.closest('input')) return;
  e.preventDefault();
  const files = [...(e.clipboardData.files || [])];
  if (files.length) return addImages(files);
  const text = (e.clipboardData.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  if (YT.test(text.trim())) return addYoutube(text.trim());
  const paras = text.split(/\n\s*\n/).map(p => esc(p).replace(/\n/g, '<br>'));
  document.execCommand('insertHTML', false, paras.length > 1 ? paras.map(p => `<p>${p}</p>`).join('') : paras[0]);
  changed();
});
ed.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); ed.classList.add('drag'); } });
ed.addEventListener('dragleave', () => ed.classList.remove('drag'));
ed.addEventListener('drop', e => {
  ed.classList.remove('drag');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
  if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  addImages(e.dataTransfer.files);
});

/* 단축키 */
addEventListener('keydown', e => {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === 's') { e.preventDefault(); save(); return; }
  if (!ed.contains(e.target) || e.target.closest('input')) return;
  if (mod && k === 'k') { e.preventDefault(); cmd('link'); }
  else if (mod && e.shiftKey && k === 'x') { e.preventDefault(); cmd('strike'); }
  else if (mod && e.shiftKey && k === 'h') { e.preventDefault(); cmd('spoiler'); }
});
/* 사진 칸 안 입력칸에서 Enter 를 눌러도 문단이 생기지 않게 */
ed.addEventListener('keydown', e => { if (e.target.closest('input') && e.key === 'Enter') e.preventDefault(); });

/* ======================= 글 정보 ======================= */
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
function renderTags() {
  $$('.tag', $('#tags')).forEach(t => t.remove());
  state.tags.forEach((t, i) => {
    const s = document.createElement('span'); s.className = 'tag';
    s.innerHTML = `${esc(t)}<button type="button" aria-label="${esc(t)} 태그 빼기">×</button>`;
    s.querySelector('button').onclick = () => { state.tags.splice(i, 1); renderTags(); changed(); };
    $('#fTag').before(s);
  });
  $('#tagList').innerHTML = META.tags.filter(t => !state.tags.includes(t)).map(t => `<option value="${esc(t)}">`).join('');
}
$('#fTag').addEventListener('keydown', e => {
  const v = e.target.value.trim().replace(/^#/, '');
  if ((e.key === 'Enter' || e.key === ',') && v) { e.preventDefault(); if (!state.tags.includes(v)) state.tags.push(v); e.target.value = ''; renderTags(); changed(); }
  else if (e.key === 'Backspace' && !e.target.value && state.tags.length) { state.tags.pop(); renderTags(); changed(); }
});
$('#fTag').addEventListener('change', e => {           // 추천 목록에서 고르면 바로 추가
  const v = e.target.value.trim(); if (v && META.tags.includes(v) && !state.tags.includes(v)) { state.tags.push(v); e.target.value = ''; renderTags(); changed(); }
});
$('#fSpoil').addEventListener('change', () => { $('#spoilWrap').hidden = $('#fSpoil').value !== 'text'; changed(); });
['#fGame', '#fDate', '#fTitle', '#fSpoilText', '#fSlug', '#fDraft'].forEach(s => $(s).addEventListener('input', changed));
$('#pvSkin').addEventListener('change', renderPreview);

function spoilerValue() {
  const v = $('#fSpoil').value;
  return v === 'none' ? null : v === 'warn' ? true : ($('#fSpoilText').value.trim() || true);
}
function coverSrc() { const f = $$('.ed-img', ed).find(x => $('input[name=cover]', x).checked); return f ? f.dataset.src : null; }

/* ======================= 미리보기 : 사이트 변환 규칙(build.py)으로 ======================= */
let pvT = 0, pvReady = false, pvSeq = 0;
function changed() {
  state.dirty = true;
  ed.classList.toggle('empty', !ed.textContent.trim() && !$('.ed-img,.ed-yt', ed));
  clearTimeout(pvT); pvT = setTimeout(() => { renderPreview(); autosave(); }, 280);
}
ed.addEventListener('input', changed);
/* 미리보기 창이 준비되면 그리기 시작 — 이 스크립트보다 먼저 준비될 수도 있어서 세 가지로 확인한다 */
function pvOn() { if (pvReady) return; pvReady = true; renderPreview(); }
addEventListener('message', e => { if (e.data && e.data.type === 'preview-ready') pvOn(); });
pv.addEventListener('load', pvOn);
if (pv.contentDocument && pv.contentDocument.readyState === 'complete' && pv.contentDocument.getElementById('rd')) pvOn();
async function renderPreview() {
  if (!pvReady) return;
  const seq = ++pvSeq;
  try {
    const { blocks, min } = await api('/api/preview', { md: toMarkdown() });
    if (seq !== pvSeq) return;
    const g = META.games.find(x => x.id === $('#fGame').value) || {};
    const sp = spoilerValue();
    pv.contentWindow.postMessage({ type: 'render', styles: META.styles, skin: $('#pvSkin').checked ? g.skin : 'base',
      title: $('#fTitle').value.trim(), date: $('#fDate').value, gameName: g.name, min,
      spoiler: sp === null ? null : sp === true ? '' : sp, cover: coverSrc(), blocks }, location.origin);
  } catch (e) { say(e.message, 'err'); }
}

/* ======================= 자동 보관 (브라우저) ======================= */
function snapshot() {
  return { path: state.path, game: $('#fGame').value, date: $('#fDate').value, title: $('#fTitle').value, tags: state.tags,
    spoil: $('#fSpoil').value, spoilText: $('#fSpoilText').value, slug: $('#fSlug').value, draft: $('#fDraft').checked, html: ed.innerHTML,
    covers: $$('.ed-img', ed).map(f => $('input[name=cover]', f).checked), at: Date.now() };
}
function autosave() { try { if (state.dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot())); } catch { /* 저장소를 못 쓰면 건너뛴다 */ } }
function restore(s) {
  state.path = s.path; state.tags = s.tags || [];
  $('#fGame').value = s.game; $('#fDate').value = s.date; $('#fTitle').value = s.title; $('#fSpoil').value = s.spoil;
  $('#fSpoilText').value = s.spoilText; $('#spoilWrap').hidden = s.spoil !== 'text'; $('#fSlug').value = s.slug; $('#fDraft').checked = s.draft;
  ed.innerHTML = s.html;
  $$('.ed-img', ed).forEach((f, i) => { const r = $('input[name=cover]', f); r.checked = !!(s.covers || [])[i]; });
  $$('.ed-img input[type=text], .ed-yt input', ed).forEach(i => { i.value = i.getAttribute('value') || ''; });
  renderTags(); ensureTail(); markCover();
}
/* innerHTML 로 보관하려면 입력칸의 값을 속성에도 적어 둔다 */
ed.addEventListener('input', e => { if (e.target.matches('input[type=text], .url')) e.target.setAttribute('value', e.target.value); }, true);

/* ======================= 새 기록 · 불러오기 · 저장 · 삭제 · 올리기 ======================= */
async function guardDirty() {
  return !state.dirty || ask('저장하지 않은 내용이 있어요', '<p>지금 쓰던 내용을 저장하지 않고 넘어갈까요?</p>', '저장 안 하고 넘어가기', true);
}
function blank(game) {
  state = { path: null, tags: [], dirty: false };
  $('#fGame').value = game || META.games[0].id; $('#fDate').value = today(); $('#fTitle').value = '';
  $('#fSpoil').value = 'none'; $('#fSpoilText').value = ''; $('#spoilWrap').hidden = true; $('#fSlug').value = ''; $('#fDraft').checked = false;
  ed.innerHTML = '<p><br></p>';
  renderTags(); ensureTail(); renderPreview();
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ }
}
async function openPost(path) {
  if (!(await guardDirty())) return;
  try {
    const p = await api('/api/post?path=' + encodeURIComponent(path));
    const m = p.meta;
    state = { path: p.path, tags: (m.tags || []).map(String), dirty: false };
    $('#fGame').value = p.game; $('#fDate').value = String(m.date || '').slice(0, 10); $('#fTitle').value = m.title || '';
    const sp = m.spoiler;
    $('#fSpoil').value = sp === true ? 'warn' : sp ? 'text' : 'none'; $('#fSpoilText').value = typeof sp === 'string' ? sp : '';
    $('#spoilWrap').hidden = $('#fSpoil').value !== 'text';
    $('#fSlug').value = p.folder.replace(/^\d{4}-\d{2}-\d{2}-?/, ''); $('#fDraft').checked = !!m.draft;
    loadBlocks(p.blocks, p.cover);
    if (m.cover_alt) { const f = $$('.ed-img', ed).find(x => x.dataset.src === p.cover); if (f && !$('.alt', f).value) $('.alt', f).value = m.cover_alt; }
    renderTags(); renderPreview(); closeDrawer();
    say(`「${m.title}」을(를) 불러왔어요.`, 'ok');
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ }
  } catch (e) { say(e.message, 'err'); }
}
function autoSlug(title) {
  const words = (title.toLowerCase().match(/[a-z0-9]+/g) || []).slice(0, 5);
  return words.length ? words.join('-') : '';
}
async function save() {
  const title = $('#fTitle').value.trim();
  if (!title) { $('#fTitle').focus(); return say('제목을 적어 주세요.', 'err'); }
  let slug = $('#fSlug').value.trim().toLowerCase();
  if (!slug) {                                   // 비우면 제목의 영문 · 숫자, 없으면 log · log-2 … 로 겹치지 않게
    const base = autoSlug(title) || 'log';
    const taken = new Set(META.posts.filter(p => p.path !== state.path).map(p => p.path));
    slug = base; let i = 2;
    while (taken.has(`posts/${$('#fGame').value}/${$('#fDate').value}-${slug}`)) slug = `${base}-${i++}`;
  }
  const cover = coverSrc();
  const coverFig = $$('.ed-img', ed).find(f => f.dataset.src === cover);
  const sp = spoilerValue();
  try {
    say('저장하는 중…');
    const r = await api('/api/save', { path: state.path, game: $('#fGame').value, date: $('#fDate').value, slug,
      meta: { title, tags: state.tags, spoiler: sp === null ? undefined : sp, draft: $('#fDraft').checked,
        cover_alt: coverFig ? $('.alt', coverFig).value.trim() : '' }, md: toMarkdown(), cover });
    state.path = r.path; state.dirty = false;
    $('#fSlug').value = r.path.split('/').pop().replace(/^\d{4}-\d{2}-\d{2}-?/, '');
    /* 사진이 01, 02 … 로 다시 정리됐으니 칸의 주소도 새 파일로 */
    $$('.ed-img', ed).forEach(f => { const u = r.map[f.dataset.src]; if (u) { f.dataset.src = u; $('img', f).src = u + '?v=' + Date.now(); } });
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ }
    await refresh();
    say(`저장했어요 → ${r.path}${$('#fDraft').checked ? ' (임시 저장 — 사이트에는 안 보여요)' : ''}`, 'ok');
    renderPreview();
  } catch (e) { say(e.message, 'err'); }
}
async function removePost(p) {
  if (!(await ask('기록 삭제', `<p>「${esc(p.title)}」(${esc(p.date)})을 지울까요?</p><p>사진도 함께 지워져요.</p>`, '삭제', true))) return;
  if (!(await ask('정말 지울까요?', `<p>한 번 더 확인할게요. 「${esc(p.title)}」을 지우면 에디터에서는 되돌릴 수 없어요.</p><p>사이트에서도 없애려면 지운 뒤 「사이트에 올리기」를 눌러 주세요.</p>`, '네, 지울게요', true))) return;
  try {
    await api('/api/delete', { path: p.path });
    if (state.path === p.path) blank();
    await refresh(); renderDrawer();
    say(`「${p.title}」을 지웠어요. 사이트에 반영하려면 「사이트에 올리기」를 눌러 주세요.`, 'ok');
  } catch (e) { say(e.message, 'err'); }
}
async function publish() {
  if (state.dirty && !(await ask('저장하지 않은 내용이 있어요', '<p>지금 쓰던 내용은 아직 저장되지 않아서 올라가지 않아요. 그래도 저장된 것만 올릴까요?</p>', '저장된 것만 올리기'))) return;
  const { changes } = await api('/api/status');
  if (!changes.length) return say('올릴 변경이 없어요. 먼저 저장해 주세요.', 'err');
  const title = $('#fTitle').value.trim();
  const ok = await ask('사이트에 올리기', `<p>아래 변경을 GitHub에 올려요. 1~2분 뒤 사이트에 반영돼요.</p>
    <pre>${esc(changes.join('\n'))}</pre><label>올리기 메모<input id="pubMsg" value="${esc('기록: ' + (title || '업데이트'))}"></label>`, '올리기');
  if (!ok) return;
  const msg = ($('#pubMsg') || {}).value || '기록 업데이트';
  try {
    say('올리는 중…');
    await api('/api/publish', { message: msg });
    await refresh();
    say('올렸어요. 1~2분 뒤 사이트에 반영돼요.', 'ok');
  } catch (e) { say('올리기에 실패했어요.', 'err'); ask('올리기 실패', `<pre>${esc(e.message)}</pre>`, '닫기'); }
}

/* ---------- 기록 목록 ---------- */
function renderDrawer() {
  const host = $('#drList'); host.innerHTML = '';
  if (!META.posts.length) { host.innerHTML = '<p class="dr-g">아직 기록이 없어요.</p>'; return; }
  let g = null;
  META.posts.slice().sort((a, b) => a.gameName.localeCompare(b.gameName) || b.date.localeCompare(a.date)).forEach(p => {
    if (p.gameName !== g) { g = p.gameName; host.insertAdjacentHTML('beforeend', `<div class="dr-g">${esc(g)}</div>`); }
    const row = document.createElement('div'); row.className = 'dr-row';
    row.innerHTML = `<div class="t"><b>${esc(p.title)}</b><span>${esc(p.date)}${p.draft ? '<span class="dr">임시</span>' : ''}</span></div>
      <button type="button" class="btn">열기</button><button type="button" class="btn ghost danger">삭제</button>`;
    const [o, d] = row.querySelectorAll('button');
    o.onclick = () => openPost(p.path); d.onclick = () => removePost(p);
    host.appendChild(row);
  });
}
function closeDrawer() { $('#drawer').hidden = true; }
$('#bList').onclick = () => { renderDrawer(); $('#drawer').hidden = false; $('#drClose').focus(); };
$('#drClose').onclick = closeDrawer;
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden && !$('#dlg').open) closeDrawer(); });
$('#bNew').onclick = async () => { if (await guardDirty()) blank($('#fGame').value); };
$('#bSave').onclick = save;
$('#bPublish').onclick = publish;
addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

async function refresh() {
  META = await api('/api/meta');
  const { changes } = await api('/api/status');
  const c = $('#chg'); c.hidden = !changes.length; c.textContent = changes.length;
  renderTags();
}

/* ---------- 시작 ---------- */
(async () => {
  try {
    await refresh();
    $('#fGame').innerHTML = META.games.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    blank();
    let saved = null; try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { /* 무시 */ }
    if (saved && saved.html && await ask('이어서 쓸까요?', `<p>저장하지 않고 닫은 내용이 있어요${saved.title ? ` (「${esc(saved.title)}」)` : ''}.</p>`, '이어서 쓰기')) {
      restore(saved); state.dirty = true; renderPreview();
    } else { try { localStorage.removeItem(DRAFT_KEY); } catch { /* 무시 */ } }
    say('준비됐어요. 게임을 고르고 쓰기 시작하세요.');
  } catch (e) { say('서버에 연결하지 못했어요: ' + e.message, 'err'); }
})();
