/* 방명록 — 구글 시트에 붙은 Apps Script 웹앱(apps-script/guestbook.gs)에 바로 읽고 쓴다.
   빌드를 거치지 않으므로 남기자마자 보인다. 주소(GUESTBOOK_API)가 없으면 샘플만 보여 주는 읽기 전용. */
import { $, esc, reduced } from './util.js';
import { GUEST, GUEST_API } from './store.js';

const PER = 10, MSG_MAX = 300, NAME_MAX = 16, GAP_MS = 60000;
const LINK_RE = /https?:\/\/|www\.|\.(com|net|org|kr|io|me|co|xyz|gg|ly)(\/|\b)/i;
const narrow = matchMedia('(max-width:720px)');

/* ---------- 이 브라우저에만 남기는 것 : 내 글 열쇠, 브라우저 id, 마지막 작성 시각, 닉네임 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('playlog.guest.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('playlog.guest.' + k, JSON.stringify(v)); } catch { /* 저장 못 해도 동작은 한다 */ } }
};
const token = n => Array.from(crypto.getRandomValues(new Uint8Array(n)),
  b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
const keys = store.get('keys', {});
const cid = store.get('cid', null) || (() => { const c = token(20); store.set('cid', c); return c; })();
const isMine = id => !!keys[id];
/* 새 글 : 방명록 화면에서 마지막으로 본 첫 페이지 글 id 와 비교한다 (처음 온 브라우저는 0개) */
const seenIds = () => store.get('seen', null);
const onGuest = () => location.hash.startsWith('#/guest');
const countNew = items => { const s = seenIds(); return s ? items.filter(e => !s.includes(e.id) && !isMine(e.id)).length : 0; };
const markSeen = items => store.set('seen', [...new Set([...(seenIds() || []), ...items.map(e => e.id)])].slice(-200));

/* ---------- 서버 ---------- */
const TIMEOUT_MS = 25000;          /* Apps Script는 가끔 느리다 — 그래도 화면이 '…중'에 멈춰 있지 않게 */
async function call(url, opts = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    return await r.json();
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? '응답이 너무 늦어요. 잠시 후 다시 시도해 주세요.' : '연결이 끊겼어요. 잠시 후 다시 시도해 주세요.');
  } finally {
    clearTimeout(t);
  }
}
/* Apps Script는 가끔 한 번씩 오류 페이지를 돌려준다 — 읽기는 한 번 더 시도해 본다 */
const apiGet = page => {
  const get = () => call(`${GUEST_API}?page=${page}&per=${PER}`, { cache: 'no-store' });
  return get().catch(() => new Promise(r => setTimeout(r, 1500)).then(get));
};
/* text/plain 이면 브라우저가 사전 요청(CORS preflight)을 보내지 않는다 — Apps Script는 그걸 못 받는다 */
const apiPost = body => call(GUEST_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
const SAMPLE = GUEST.map((g, i) => ({ id: 'sample' + i, n: g.n, d: g.d, m: g.m, re: g.re || '' }));
function localPage(page) {
  const pages = Math.max(1, Math.ceil(SAMPLE.length / PER)), p = Math.min(page, pages);
  return { ok: true, total: SAMPLE.length, page: p, pages, items: SAMPLE.slice((p - 1) * PER, p * PER) };
}

/* ---------- 상태 ---------- */
const S = { page: 1, pages: 1, total: 0, items: [], loading: true, error: '', fresh: null,
            editing: null, confirm: null, busy: null, itemErr: null };

async function load(page = S.page) {
  S.loading = !S.items.length; S.error = '';
  render();
  try {
    const res = GUEST_API ? await apiGet(page) : localPage(page);
    if (!res.ok) throw new Error(res.error || '불러오지 못했어요');
    Object.assign(S, { page: res.page, pages: res.pages, total: res.total, items: res.items, loading: false });
    if (res.page === 1 && (onGuest() || !seenIds())) markSeen(res.items);
    dispatchEvent(new CustomEvent('guestdata', { detail: res.page === 1
      ? { total: res.total, latest: res.items[0] || null, fresh: countNew(res.items) } : { total: res.total } }));
  } catch {
    S.loading = false; S.error = '방명록을 불러오지 못했어요.';
  }
  render();
}

/* ---------- 그리기 ---------- */
const list = $('#gList'), pager = $('#gPager');

function itemHTML(e) {
  const mine = isMine(e.id), editing = S.editing === e.id, confirm = S.confirm === e.id, busy = S.busy === e.id;
  const tag = S.fresh === e.id ? '<span class="g-tag new">방금 남김</span>' : mine ? '<span class="g-tag mine">내 글</span>' : '';
  const acts = mine && !editing && !confirm
    ? `<div class="g-acts">${e.re ? '' : '<button type="button" class="g-act" data-act="edit">수정</button>'}<button type="button" class="g-act danger" data-act="del">삭제</button></div>` : '';
  const body = editing
    ? `<div class="g-edit"><label class="sr" for="gEdit">글 수정</label>
        <textarea class="g-inp" id="gEdit" maxlength="${MSG_MAX}">${esc(e.m)}</textarea>
        <div class="g-edit-ft"><span class="g-cnt" id="gEditCnt">${e.m.length} / ${MSG_MAX}</span>
          <button type="button" class="g-ghost" data-act="edit-cancel">취소</button>
          <button type="button" class="g-save" data-act="edit-save"${busy ? ' disabled' : ''}>${busy ? '저장 중…' : '수정 저장'}</button></div></div>`
    : `<p class="g-msg">${esc(e.m)}</p>`;
  const conf = confirm
    ? `<div class="g-confirm" role="alertdialog" aria-label="삭제 확인"><span>이 글을 삭제할까요? 되돌릴 수 없어요.</span>
        <button type="button" class="g-ghost" data-act="del-cancel">취소</button>
        <button type="button" class="g-save" data-act="del-do"${busy ? ' disabled' : ''}>${busy ? '삭제 중…' : '삭제'}</button></div>` : '';
  const err = S.itemErr && S.itemErr.id === e.id ? `<p class="g-err" role="alert">${esc(S.itemErr.msg)}</p>` : '';
  const re = e.re ? `<div class="g-re"><span class="who" aria-hidden="true">N</span><div><span class="sys">OWNER · NAVI</span><p>${esc(e.re)}</p></div></div>` : '';
  return `<article class="g-item${S.fresh === e.id ? ' fresh' : ''}${editing ? ' editing' : ''}" data-id="${esc(e.id)}">
    <div class="g-hd"><b>${esc(e.n)}</b><span class="d">${esc(e.d)}</span>${e.edited ? '<span class="ed">· 수정됨</span>' : ''}${tag}${acts}</div>
    ${body}${conf}${err}${re}</article>`;
}

/* 첫·마지막 페이지 + 현재 앞뒤 near 쪽, 사이는 … (한 쪽만 건너뛰면 그 번호를 그냥 보인다) */
function pageWindow(page, count, near) {
  const keep = new Set([1, count]);
  let lo = Math.max(1, page - near), hi = Math.min(count, page + near);
  if (page - near < 2) hi = Math.min(count, 1 + near * 2 + 2);
  if (page + near > count - 1) lo = Math.max(1, count - near * 2 - 2);
  for (let n = lo; n <= hi; n++) keep.add(n);
  let nums = [...keep].sort((a, b) => a - b);
  nums.forEach((n, i) => { if (i && n - nums[i - 1] === 2) keep.add(n - 1); });
  nums = [...keep].sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push(null); out.push(n); });
  return out;
}

function render() {
  $('#gCount').textContent = S.loading ? '' : S.total + ' NOTES';
  if (S.loading) { list.innerHTML = '<p class="g-state">방명록을 불러오는 중…</p>'; pager.innerHTML = ''; return; }
  if (S.error) {
    list.innerHTML = `<div class="g-state">${esc(S.error)}<br><button type="button" class="g-ghost" data-act="retry">다시 불러오기</button></div>`;
    pager.innerHTML = ''; return;
  }
  list.innerHTML = S.items.length ? S.items.map(itemHTML).join('') : '<p class="g-state">아직 남겨진 글이 없어요. 첫 번째로 남겨 주세요.</p>';
  pager.innerHTML = S.pages > 1
    ? `<button type="button" class="g-pg arrow" data-page="${S.page - 1}" aria-label="이전 페이지"${S.page === 1 ? ' disabled' : ''}>‹</button>`
      + pageWindow(S.page, S.pages, narrow.matches ? 1 : 2).map(n => n == null
        ? '<span class="g-gap" aria-hidden="true">…</span>'
        : `<button type="button" class="g-pg" data-page="${n}" aria-label="${n}페이지"${n === S.page ? ' aria-current="page"' : ''}>${n}</button>`).join('')
      + `<button type="button" class="g-pg arrow" data-page="${S.page + 1}" aria-label="다음 페이지"${S.page === S.pages ? ' disabled' : ''}>›</button>`
    : '';
  const ed = $('#gEdit');
  if (ed && document.activeElement !== ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
}
narrow.addEventListener('change', render);

/* ---------- 목록 : 수정 · 삭제 · 페이지 ---------- */
pager.addEventListener('click', e => {
  const b = e.target.closest('[data-page]');
  if (!b || b.disabled) return;
  Object.assign(S, { editing: null, confirm: null, itemErr: null, fresh: null });
  load(+b.dataset.page).then(() => $('#gTitle').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));
});

list.addEventListener('input', e => {
  if (e.target.id === 'gEdit') $('#gEditCnt').textContent = e.target.value.length + ' / ' + MSG_MAX;
});

list.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'retry') return load();
  const id = b.closest('[data-id]')?.dataset.id;
  const item = S.items.find(x => x.id === id);
  if (!item) return;
  S.itemErr = null;
  switch (b.dataset.act) {
    case 'edit': S.editing = id; S.confirm = null; return render();
    case 'edit-cancel': S.editing = null; return render();
    case 'del': S.confirm = id; S.editing = null; return render();
    case 'del-cancel': S.confirm = null; return render();
    case 'edit-save': {
      const msg = $('#gEdit').value.trim();
      if (!msg) { S.itemErr = { id, msg: '내용을 적어 주세요.' }; return render(); }
      if (LINK_RE.test(msg)) { S.itemErr = { id, msg: '링크(주소)는 남길 수 없어요.' }; return render(); }
      return send(id, { action: 'edit', id, key: keys[id], msg }, res => { Object.assign(item, res.item); S.editing = null; });
    }
    case 'del-do':
      return send(id, { action: 'delete', id, key: keys[id] }, () => {
        delete keys[id]; store.set('keys', keys); S.confirm = null;
        return load(S.items.length === 1 && S.page > 1 ? S.page - 1 : S.page);
      });
  }
});

async function send(id, body, onOk) {
  S.busy = id; render();
  try {
    if (!GUEST_API) throw new Error('방명록 서버가 아직 연결되지 않았어요.');
    const res = await apiPost(body);
    if (!res.ok) throw new Error(res.error);
    S.busy = null;
    await onOk(res);
  } catch (err) {
    S.busy = null; S.itemErr = { id, msg: err.message || '잠시 후 다시 시도해 주세요.' };
  }
  render();
}

/* ---------- 글쓰기 ---------- */
const form = $('#gForm'), nameIn = $('#gName'), msgIn = $('#gMsg'), saveBtn = $('#gSave'), errEl = $('#gErr');
let startedAt = 0, posting = false;
nameIn.value = store.get('name', '');

function formState() {
  $('#gCnt').textContent = msgIn.value.length + ' / ' + MSG_MAX;
  saveBtn.disabled = posting || !(nameIn.value.trim() && msgIn.value.trim());
}
function showMsg(text, ok = false) { errEl.textContent = text; errEl.classList.toggle('ok', ok); errEl.hidden = !text; }

form.addEventListener('focusin', () => { if (!startedAt) startedAt = Date.now(); });
form.addEventListener('input', () => { showMsg(''); formState(); });

form.addEventListener('submit', async e => {
  e.preventDefault();
  const name = nameIn.value.trim().slice(0, NAME_MAX), msg = msgIn.value.trim().slice(0, MSG_MAX);
  if (!name || !msg || posting) return;
  if (LINK_RE.test(name) || LINK_RE.test(msg)) return showMsg('링크(주소)는 남길 수 없어요. 주소를 빼고 다시 남겨 주세요.');
  const wait = GAP_MS - (Date.now() - store.get('last', 0));
  if (wait > 0) return showMsg(`같은 브라우저에서는 1분에 한 번 남길 수 있어요. ${Math.ceil(wait / 1000)}초 뒤에 다시 남겨 주세요.`);
  if (!GUEST_API) return showMsg('방명록 서버가 아직 연결되지 않았어요. (로컬 미리보기)');

  posting = true; saveBtn.textContent = '남기는 중…'; formState();
  const key = token(32);
  try {
    const res = await apiPost({ action: 'create', name, msg, key, cid, hp: $('#gHp').value, elapsed: Date.now() - startedAt });
    if (!res.ok) throw new Error(res.error);
    store.set('last', Date.now()); store.set('name', name);
    if (res.item) { keys[res.item.id] = key; store.set('keys', keys); }
    msgIn.value = ''; startedAt = 0;
    if (res.pending) showMsg('남겼어요. 확인 후 공개돼요.', true);
    Object.assign(S, { fresh: res.item?.id || null, editing: null, confirm: null });
    await load(1);
  } catch (err) {
    showMsg(err.message || '잠시 후 다시 시도해 주세요.');
  } finally {
    posting = false; saveBtn.textContent = '남기기'; formState();
  }
});
formState();

/* ---------- 언제 불러오나 : 처음 한 번(홈 채널용) + 방명록 화면에 들어올 때마다 ---------- */
load(1);
addEventListener('hashchange', () => { if (location.hash.startsWith('#/guest') && !S.loading) load(S.page); });
