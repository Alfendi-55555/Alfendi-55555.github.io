/* PLAYLOG 에디터 — 처음 화면(무엇을 편집할지) · 기록/게임 탭 · 게임 관리
   게임 정보는 content/games.json, 게임 아트는 assets/games/<id>/ 에 저장한다.
   한줄 리뷰 · 오늘의 게임 음악은 구글 시트에서 관리한다 (여기서는 시트를 여는 버튼만). */
'use strict';
(() => {
const COMMON_PLATS = ['Nintendo Switch 2', 'Nintendo Switch', 'Nintendo 3DS', 'Windows', 'macOS', 'PS5', 'PS4', 'Xbox Series X|S', 'Xbox One', 'iOS', 'Android', 'Web'];
const LIVE_URL = 'https://alfendi-55555.github.io/data/site.json';   // 별점 · 리뷰 · 기록 · 추천곡은 지금 사이트 기준으로 미리 본다
const gpv = $('#gpv');
let GM = { games: [], skins: [], posts: {}, genres: [], platforms: [] };
let LIVE = null;
let G = null;            // 지금 편집 중인 게임 { orig, aliases, platforms, art, idTouched }
let gDirty = false, gpvReady = false;

/* ---------- 처음 화면 · 탭 ---------- */
function route() {
  const m = location.hash === '#/posts' ? 'posts' : location.hash === '#/games' ? 'games' : 'home';
  document.body.dataset.mode = m;
  $('#home').hidden = m !== 'home';
  $('#postsView').hidden = m !== 'posts';
  $('#gamesView').hidden = m !== 'games';
  $('#tabPosts').toggleAttribute('aria-current', m === 'posts'); if (m === 'posts') $('#tabPosts').setAttribute('aria-current', 'page');
  $('#tabGames').toggleAttribute('aria-current', m === 'games'); if (m === 'games') $('#tabGames').setAttribute('aria-current', 'page');
  if (m === 'games') { loadGames(); }
  if (m === 'posts' && typeof renderPreview === 'function') renderPreview();
}
addEventListener('hashchange', route);

/* ---------- 데이터 ---------- */
async function loadGames(keep) {
  try {
    GM = await api('/api/games');
    if (!LIVE) LIVE = await fetch(LIVE_URL, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ games: [], music: [] }));
    $('#gSkin').innerHTML = GM.skins.map(s => `<option value="${esc(s)}">${esc(s === 'base' ? '기본 (base)' : s)}</option>`).join('');
    $('#genreList').innerHTML = GM.genres.map(x => `<option value="${esc(x)}">`).join('');
    renderList();
    if (keep) pickById(keep, true);
    else if (!G) { if (GM.games.length) pickById(GM.games[0].id, true); else newGame(true); }
  } catch (e) { say(e.message, 'err'); }
}
function liveOf(id) {
  const lg = (LIVE && LIVE.games || []).find(x => x.id === id);
  const songs = (LIVE && LIVE.music || []).filter(m => m.game === id).length;
  return { review: lg ? lg.review : null, posts: lg ? lg.posts.map(p => ({ t: p.t, d: p.d })) : [], songs };
}

/* ---------- 목록 ---------- */
function renderList() {
  const q = $('#gSearch').value.trim().toLowerCase().replace(/\s+/g, '');
  const list = GM.games.filter(g => !q || [g.id, g.name, ...(g.aliases || [])].join(' ').toLowerCase().replace(/\s+/g, '').includes(q));
  $('#gList').innerHTML = list.map(g => `<button type="button" class="g-item" data-id="${esc(g.id)}"${G && G.orig === g.id ? ' aria-current="true"' : ''}>
    <span class="sw" style="background:${esc(g.color)}"></span><span><b>${esc(g.name)}</b><span>${esc((g.aliases || [])[0] || g.id)} · 기록 ${GM.posts[g.id] || 0}</span></span></button>`).join('')
    || '<p class="dr-g">맞는 게임이 없어요.</p>';
  $$('.g-item', $('#gList')).forEach(b => b.onclick = () => pickById(b.dataset.id));
}
$('#gSearch').addEventListener('input', renderList);

async function guardG() {
  return !gDirty || ask('저장하지 않은 게임 정보가 있어요', '<p>지금 고친 내용을 저장하지 않고 넘어갈까요?</p>', '저장 안 하고 넘어가기', true);
}
async function pickById(id, skipGuard) {
  if (!skipGuard && !(await guardG())) return;
  const g = GM.games.find(x => x.id === id); if (!g) return;
  G = { orig: g.id, aliases: [...(g.aliases || [])], platforms: [...(g.platforms || [])], art: g.art ? '/site/' + g.art : null, idTouched: true };
  $('#gName').value = g.name; $('#gId').value = g.id;
  const locked = (GM.posts[g.id] || 0) > 0;
  $('#gId').readOnly = locked; $('#gId').title = locked ? '기록이 있는 게임은 id를 바꿀 수 없어요' : '';
  setColor(g.color); $('#gRelease').value = g.release || ''; $('#gGenre').value = g.genre || '';
  $('#gSkin').value = g.skin || 'base'; $('#gSteam').value = g.steam || '';
  $('#gDel').disabled = locked; $('#gDel').title = locked ? '기록이 있는 게임은 지울 수 없어요' : '';
  fillChips(); showArt(); renderList(); gDirty = false; gRender();
}
function newGame(skipGuard) {
  (skipGuard ? Promise.resolve(true) : guardG()).then(ok => {
    if (!ok) return;
    G = { orig: null, aliases: [], platforms: [], art: null, idTouched: false };
    ['#gName', '#gId', '#gRelease', '#gGenre', '#gSteam'].forEach(s => { $(s).value = ''; });
    $('#gId').readOnly = false; $('#gId').title = '';
    setColor('#5B7C99'); $('#gSkin').value = 'base'; $('#gDel').disabled = true;
    fillChips(); showArt(); renderList(); gDirty = false; gRender();
    $('#gName').focus();
    say('새 게임 정보를 채워 주세요. 저장하면 라이브러리에 들어가요.');
  });
}
$('#gNew').onclick = () => newGame();

/* ---------- 칸 ---------- */
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function setColor(c) { $('#gColor').value = c.toUpperCase(); if (/^#[0-9a-f]{6}$/i.test(c)) $('#gColorPick').value = c; }
$('#gColorPick').addEventListener('input', e => { $('#gColor').value = e.target.value.toUpperCase(); gChanged(); });
$('#gColor').addEventListener('input', e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) $('#gColorPick').value = e.target.value; gChanged(); });
$('#gName').addEventListener('input', () => { if (G && !G.idTouched && !G.orig) $('#gId').value = slug($('#gName').value); gChanged(); });
$('#gId').addEventListener('input', () => { if (G) G.idTouched = true; gChanged(); });
['#gRelease', '#gGenre', '#gSkin'].forEach(s => $(s).addEventListener('input', gChanged));
$('#gSteam').addEventListener('change', e => {        // 상점 주소를 붙여 넣으면 앱 번호만
  const m = e.target.value.match(/app\/(\d+)/) || e.target.value.match(/^\s*(\d+)\s*$/);
  if (e.target.value.trim() && !m) say('Steam 상점 주소나 앱 번호를 넣어 주세요.', 'err');
  e.target.value = m ? m[1] : e.target.value.trim(); gChanged();
});

function chipBox(box, input, arr) {
  $$('.tag', box).forEach(t => t.remove());
  arr.forEach((t, i) => {
    const s = document.createElement('span'); s.className = 'tag';
    s.innerHTML = `${esc(t)}<button type="button" aria-label="${esc(t)} 빼기">×</button>`;
    s.querySelector('button').onclick = () => { arr.splice(i, 1); fillChips(); gChanged(); };
    input.before(s);
  });
}
function fillChips() {
  if (!G) return;
  chipBox($('#gAliases'), $('#gAlias'), G.aliases);
  chipBox($('#gPlats'), $('#gPlat'), G.platforms);
  const plats = [...new Set([...COMMON_PLATS, ...GM.platforms])];
  $('#gPlatPick').innerHTML = plats.map(p => `<button type="button" aria-pressed="${G.platforms.includes(p)}">${esc(p)}</button>`).join('');
  $$('button', $('#gPlatPick')).forEach(b => b.onclick = () => {
    const p = b.textContent, i = G.platforms.indexOf(p);
    if (i >= 0) G.platforms.splice(i, 1); else G.platforms.push(p);
    fillChips(); gChanged();
  });
}
function chipInput(input, key) {
  input.addEventListener('keydown', e => {
    const v = input.value.trim();
    if ((e.key === 'Enter' || (e.key === ',' && key === 'aliases')) && v) { e.preventDefault(); if (!G[key].includes(v)) G[key].push(v); input.value = ''; fillChips(); gChanged(); }
    else if (e.key === 'Backspace' && !input.value && G[key].length) { G[key].pop(); fillChips(); gChanged(); }
  });
}
chipInput($('#gAlias'), 'aliases'); chipInput($('#gPlat'), 'platforms');

/* ---------- 게임 아트 ---------- */
function showArt() {
  const d = $('#gArtDrop');
  d.style.backgroundImage = G && G.art ? `url("${G.art}")` : '';
  d.classList.toggle('has', !!(G && G.art));
  $('#gArtDel').disabled = !(G && G.art);
}
async function setArt(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return say('jpg · png · webp 사진만 넣을 수 있어요.', 'err');
  try {
    say('게임 아트 올리는 중…');
    const bmp = await createImageBitmap(file);
    const w = Math.min(1000, bmp.width), h = Math.round(bmp.height * w / bmp.width);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .86));
    const { url } = await api('/api/upload', null, { headers: { 'X-Ext': '.jpg' }, body: blob });
    G.art = url; showArt(); gChanged();
    say('게임 아트를 넣었어요. 저장하면 반영돼요.', 'ok');
  } catch (e) { say(e.message, 'err'); }
}
const drop = $('#gArtDrop');
drop.onclick = () => $('#gArtIn').click();
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#gArtIn').click(); } });
$('#gArtIn').addEventListener('change', e => { setArt(e.target.files[0]); e.target.value = ''; });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); setArt(e.dataTransfer.files[0]); });
$('#gArtDel').onclick = () => { if (G) { G.art = null; showArt(); gChanged(); } };

/* ---------- 미리보기 ---------- */
let gT = 0;
function gChanged() { gDirty = true; clearTimeout(gT); gT = setTimeout(gRender, 150); }
function draft() {
  return { id: $('#gId').value.trim(), name: $('#gName').value.trim(), aliases: G.aliases, color: $('#gColor').value.trim(),
    release: $('#gRelease').value, genre: $('#gGenre').value.trim(), platforms: G.platforms, skin: $('#gSkin').value, steam: $('#gSteam').value.trim() };
}
function gpvOn() { if (gpvReady) return; gpvReady = true; gRender(); }
addEventListener('message', e => { if (e.data && e.data.type === 'gpv-ready') gpvOn(); });
gpv.addEventListener('load', gpvOn);
function gRender() {
  if (!gpvReady || !G) return;
  const d = draft();
  const game = { ...d, name: d.name || '게임 이름', color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#5B7C99', img: G.art, id: G.orig || d.id };
  gpv.contentWindow.postMessage({ type: 'render', styles: META.styles, game, live: G.orig ? liveOf(G.orig) : { review: null, posts: [], songs: 0 } }, location.origin);
}

/* ---------- 저장 · 삭제 · 리뷰 시트 ---------- */
async function saveGame() {
  if (!G) return;
  const d = draft();
  if (!d.name) { $('#gName').focus(); return say('게임 이름을 적어 주세요.', 'err'); }
  if (!d.id) d.id = slug(d.name);
  try {
    const r = await api('/api/game/save', { orig: G.orig, game: d, art: G.art });
    gDirty = false;
    await refresh();                                   // 기록 탭의 게임 목록 · 올리기 숫자도 새로
    const cur = $('#fGame').value;
    $('#fGame').innerHTML = META.games.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    $('#fGame').value = cur && META.games.some(g => g.id === cur) ? cur : r.game.id;
    G = null; await loadGames(r.game.id);
    say(`「${r.game.name}」을(를) 저장했어요. 사이트에 반영하려면 「사이트에 올리기」를 눌러 주세요.`, 'ok');
  } catch (e) { say(e.message, 'err'); }
}
window.saveGame = saveGame;
$('#gSave').onclick = saveGame;
$('#gDel').onclick = async () => {
  if (!G || !G.orig) return;
  const name = $('#gName').value;
  if (!(await ask('게임 삭제', `<p>「${esc(name)}」을 라이브러리에서 뺄까요? 게임 아트도 함께 지워져요.</p>`, '삭제', true))) return;
  if (!(await ask('정말 지울까요?', `<p>한 번 더 확인할게요. 한줄 리뷰 시트에 이 게임 행이 있으면 빌드가 실패하니, 시트에서도 지워 주세요.</p>`, '네, 지울게요', true))) return;
  try {
    await api('/api/game/delete', { id: G.orig });
    gDirty = false; G = null; await refresh();
    $('#fGame').innerHTML = META.games.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    await loadGames();
    say(`「${name}」을 지웠어요. 사이트에 반영하려면 「사이트에 올리기」를 눌러 주세요.`, 'ok');
  } catch (e) { say(e.message, 'err'); }
};
$('#gReview').onclick = async () => {
  let c = await api('/api/config').catch(() => ({}));
  if (!c.reviewSheet) {
    const ok = await ask('리뷰 시트 주소', `<p>한줄 리뷰를 적는 구글 시트의 주소를 한 번만 넣어 주세요. 이 컴퓨터에만 저장돼요.</p>
      <label>시트 주소<input id="sheetUrl" placeholder="https://docs.google.com/spreadsheets/d/…/edit"></label>`, '저장하고 열기');
    if (!ok) return;
    try { c = await api('/api/config', { reviewSheet: ($('#sheetUrl') || {}).value || '' }); } catch (e) { return say(e.message, 'err'); }
    if (!c.reviewSheet) return;
  }
  open(c.reviewSheet, '_blank', 'noopener');
};
addEventListener('beforeunload', e => { if (gDirty) { e.preventDefault(); e.returnValue = ''; } });

route();
})();
