/* 사이트 데이터 — data/site.json (scripts/build.py 가 만든다) 을 한 번 읽어 모두가 나눠 쓴다. */
let site;
try {
  const res = await fetch('data/site.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  site = await res.json();
} catch (err) {
  document.body.innerHTML =
    '<div style="padding:40px;font-family:system-ui;line-height:1.7;color:#17232D">'
    + '<b>데이터를 불러오지 못했습니다.</b><br>'
    + '파일을 직접 열었다면(file://) 브라우저가 막은 것입니다. 로컬에서는<br>'
    + '<code>python scripts/build.py &amp;&amp; python -m http.server -d _site</code><br>'
    + '로 띄운 뒤 <code>http://localhost:8000</code> 을 여세요.<br><small>' + err + '</small></div>';
  throw err;
}

export const GAMES = site.games;
GAMES.forEach(g => g.posts.forEach(p => { p.game = g; }));
export const BY_ID = new Map(GAMES.map(g => [g.id, g]));
export const POSTS = GAMES.flatMap(g => g.posts).sort((a, b) => b.d.localeCompare(a.d));
export const MUSIC = site.music || [];
export const GUEST = site.guestbook || [];

export const lastDate = g => (g.posts[0] ? g.posts[0].d : '');
/* 최근 꺼낸 게임 = 기록이 있는 게임을 마지막 기록 날짜순으로 */
export const RECENT = GAMES.filter(g => g.posts.length)
  .sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
export const REVIEWED = GAMES.filter(g => g.review);

/* 날짜마다 하나씩 도는 선택 — 모든 방문자에게 같은 결과 */
export const dayIndex = (d = new Date()) =>
  Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
export const pickOfDay = (list, offset = 0) =>
  list.length ? list[((dayIndex() - offset) % list.length + list.length) % list.length] : null;
