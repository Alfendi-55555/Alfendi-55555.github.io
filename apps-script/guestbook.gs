/**
 * PLAYLOG 방명록 — 구글 시트에 붙이는 Apps Script 웹앱
 *
 * 시트 탭 '방명록'의 1행(열 이름): id | 시각 | 이름 | 내용 | 답글 | 공개 | 수정됨 | 열쇠
 *   - 답글 : 주인이 직접 적는다. 적으면 방문자는 그 글을 수정할 수 없고 삭제만 할 수 있다.
 *   - 공개 : Y = 보임, N = 주인이 숨김, 삭제됨 = 쓴 사람이 지움 (행은 남겨 둔다)
 *   - 열쇠 : 글쓴이 브라우저가 가진 열쇠의 SHA-256. 원문은 저장하지 않는다.
 *
 * 배포: 확장 프로그램 → Apps Script 에 이 파일을 붙여 넣고
 *       배포 → 새 배포 → 유형 '웹 앱', 실행 사용자 '나', 액세스 '모든 사용자' → 웹 앱 URL 복사
 * 코드를 고친 뒤에는 배포 관리 → 기존 배포 편집 → 버전 '새 버전' 으로 다시 배포해야 반영된다.
 */

const SHEET_NAME = '방명록';
const APPROVAL = false;            // true 로 바꾸면 새 글이 '공개 N'으로 들어간다(승인제)
const NOTIFY = true;               // 새 글이 오면 스크립트 주인에게 메일
const NAME_MAX = 16, MSG_MAX = 300;
const MIN_WRITE_MS = 3000;         // 화면을 연 뒤 이보다 빨리 제출되면 봇으로 본다
const PER_BROWSER_SEC = 60;        // 같은 브라우저는 1분에 한 번
const SITE_LIMIT = 10, SITE_WINDOW_SEC = 600;   // 사이트 전체 10분에 10개까지
const DUP_WINDOW_MS = 60 * 60 * 1000;           // 같은 내용은 1시간 안에 다시 못 올린다
const LINK_RE = /https?:\/\/|www\.|\.(com|net|org|kr|io|me|co|xyz|gg|ly)(\/|\b)/i;
const COLS = ['id', '시각', '이름', '내용', '답글', '공개', '수정됨', '열쇠'];

/* ---------- 읽기 ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const per = clamp(parseInt(p.per, 10) || 10, 1, 50);
  const rows = readRows().filter(r => r.공개 === 'Y').reverse();          // 최신이 먼저
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const page = clamp(parseInt(p.page, 10) || 1, 1, pages);
  const items = rows.slice((page - 1) * per, page * per).map(publicItem);
  return json({ ok: true, total: rows.length, page, pages, per, items });
}

/* ---------- 쓰기·수정·삭제 ---------- */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return fail('요청을 읽지 못했어요.'); }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return fail('잠시 후 다시 시도해 주세요.');
  try {
    if (body.action === 'create') return create(body);
    if (body.action === 'edit') return edit(body);
    if (body.action === 'delete') return remove(body);
    return fail('알 수 없는 요청이에요.');
  } finally {
    lock.releaseLock();
  }
}

function create(b) {
  if (b.hp) return json({ ok: true, ignored: true });                   // 숨김 칸이 채워졌다 = 봇. 성공한 척만 한다
  if (!(Number(b.elapsed) >= MIN_WRITE_MS)) return fail('조금만 천천히 남겨 주세요.');
  const name = clean(b.name), msg = clean(b.msg, true);
  const bad = check(name, msg);
  if (bad) return fail(bad);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(b.key || ''))) return fail('요청을 읽지 못했어요.');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(b.cid || ''))) return fail('요청을 읽지 못했어요.');

  const cache = CacheService.getScriptCache();
  if (cache.get('cid:' + b.cid)) return fail('같은 브라우저에서는 1분에 한 번 남길 수 있어요.');
  const count = Number(cache.get('site') || 0);
  if (count >= SITE_LIMIT) return fail('지금은 글이 몰려서 잠시 쉬고 있어요. 조금 뒤에 다시 남겨 주세요.');

  const now = new Date();
  const recent = readRows().slice(-50);
  if (recent.some(r => r.내용 === msg && now - new Date(r.시각) < DUP_WINDOW_MS)) return fail('같은 글이 이미 있어요.');

  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const row = { id, 시각: now, 이름: name, 내용: msg, 답글: '', 공개: APPROVAL ? 'N' : 'Y', 수정됨: '', 열쇠: hash(b.key) };
  sheet().appendRow(COLS.map(c => safe(row[c])));
  cache.put('cid:' + b.cid, '1', PER_BROWSER_SEC);
  cache.put('site', String(count + 1), SITE_WINDOW_SEC);
  if (NOTIFY) notify(name, msg);
  return json({ ok: true, pending: APPROVAL, item: publicItem(row) });
}

function edit(b) {
  const found = own(b);
  if (found.error) return fail(found.error);
  if (found.row.답글) return fail('답글이 달린 글은 수정할 수 없어요.');
  const msg = clean(b.msg, true);
  const bad = check(found.row.이름, msg);
  if (bad) return fail(bad);
  const s = sheet();
  s.getRange(found.index, COLS.indexOf('내용') + 1).setValue(safe(msg));
  s.getRange(found.index, COLS.indexOf('수정됨') + 1).setValue('Y');
  return json({ ok: true, item: publicItem(Object.assign({}, found.row, { 내용: msg, 수정됨: 'Y' })) });
}

function remove(b) {
  const found = own(b);
  if (found.error) return fail(found.error);
  sheet().getRange(found.index, COLS.indexOf('공개') + 1).setValue('삭제됨');
  return json({ ok: true });
}

/* 열쇠가 맞는 내 글 찾기 */
function own(b) {
  const id = String(b.id || ''), key = String(b.key || '');
  if (!id || !key) return { error: '요청을 읽지 못했어요.' };
  const rows = readRows();
  const i = rows.findIndex(r => r.id === id);
  if (i < 0 || rows[i].공개 === '삭제됨') return { error: '이미 지워진 글이에요.' };
  if (rows[i].열쇠 !== hash(key)) return { error: '이 브라우저에서 쓴 글만 고칠 수 있어요.' };
  return { row: rows[i], index: i + 2 };                                 // 시트 행 번호 (1행은 열 이름)
}

/* ---------- 도우미 ---------- */
function sheet() {
  const s = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!s) throw new Error(`'${SHEET_NAME}' 탭이 없습니다`);
  return s;
}

function readRows() {
  const values = sheet().getDataRange().getValues();
  const head = values.shift().map(String);
  return values.filter(v => v[0] !== '').map(v => {
    const r = {};
    COLS.forEach(c => { const j = head.indexOf(c); r[c] = j < 0 ? '' : v[j]; });
    r.id = String(r.id); r.공개 = String(r.공개).trim(); r.답글 = String(r.답글 || '').trim();
    r.내용 = String(r.내용); r.이름 = String(r.이름); r.열쇠 = String(r.열쇠);
    return r;
  });
}

function publicItem(r) {
  const d = r.시각 instanceof Date ? r.시각 : new Date(r.시각);
  return { id: r.id, n: r.이름, m: r.내용, re: r.답글 || '', edited: r.수정됨 === 'Y' || r.수정됨 === true,
           d: Utilities.formatDate(d, 'Asia/Seoul', 'yyyy.MM.dd') };
}

function clean(s, multiline) {
  s = String(s == null ? '' : s).replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

function check(name, msg) {
  if (!name) return '닉네임을 적어 주세요.';
  if (name.length > NAME_MAX) return `닉네임은 ${NAME_MAX}자까지예요.`;
  if (!msg) return '내용을 적어 주세요.';
  if (msg.length > MSG_MAX) return `내용은 ${MSG_MAX}자까지예요.`;
  if (LINK_RE.test(name) || LINK_RE.test(msg)) return '링크(주소)는 남길 수 없어요. 주소를 빼고 다시 남겨 주세요.';
  return '';
}

/* = + - @ 로 시작하면 시트가 수식으로 읽으므로 글자로 고정한다 */
function safe(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function hash(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function notify(name, msg) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), `[PLAYLOG 방명록] ${name} 님의 새 글`,
      `${msg}\n\n답글·숨기기는 시트에서: ${SpreadsheetApp.getActive().getUrl()}`);
  } catch (err) { /* 메일이 실패해도 글은 저장된다 */ }
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail(message) { return json({ ok: false, error: message }); }
