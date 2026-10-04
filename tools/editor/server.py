"""PLAYLOG 글쓰기 — 이 컴퓨터에서만 여는 기록 에디터 서버 (Python 표준 라이브러리만)

  python tools/editor/server.py      (또는 저장소 맨 위의 글쓰기.bat 더블클릭)
  → 브라우저에 http://127.0.0.1:8770 이 열린다

에디터에서 쓴 기록은 posts/<게임id>/<날짜-이름>/ 에 index.md 와 사진(01.jpg …)으로 저장된다.
미리보기는 scripts/build.py 의 변환 규칙을 그대로 써서, 실제 사이트와 같은 모양이 나온다.
이 폴더(tools/)는 사이트로 배포되지 않는다.
"""
import contextlib, io, json, mimetypes, re, shutil, subprocess, sys, threading, uuid, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.resolve()
POSTS = ROOT / 'posts'
TMP = HERE / '.tmp'
PORT = int(sys.argv[sys.argv.index('--port') + 1]) if '--port' in sys.argv else 8770
sys.path.insert(0, str(ROOT / 'scripts'))
import build  # noqa: E402  — 변환 규칙(to_blocks · read_post · reading_min)을 같이 쓴다

IMG_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
MD_IMG = re.compile(r'!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)')


def games():
    return json.loads((ROOT / 'content' / 'games.json').read_text(encoding='utf-8'))


def safe_post_dir(rel):
    """posts/<게임>/<폴더> 만 허용 — 다른 곳은 건드리지 않는다"""
    p = (ROOT / rel).resolve()
    if p.parent.parent != POSTS.resolve() or not re.fullmatch(r'[\w.-]+', p.name):
        raise ValueError('잘못된 기록 경로예요: ' + rel)
    return p


def quiet(fn, *a):
    """build.py 의 안내 출력과 오류 목록이 에디터 서버에 쌓이지 않게"""
    build.errors.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        out = fn(*a)
    build.errors.clear()
    return out


def list_posts():
    names = {g['id']: g['name'] for g in games()}
    out, tags = [], {}
    for md in sorted(POSTS.glob('*/*/index.md')):
        meta, _ = quiet(build.read_post, md)
        meta = meta or {}
        for t in meta.get('tags') or []:
            tags[t] = tags.get(t, 0) + 1
        out.append({'path': md.parent.relative_to(ROOT).as_posix(), 'game': md.parent.parent.name,
                    'gameName': names.get(md.parent.parent.name, md.parent.parent.name),
                    'title': str(meta.get('title', md.parent.name)), 'date': str(meta.get('date', '')),
                    'draft': bool(meta.get('draft'))})
    out.sort(key=lambda p: p['date'], reverse=True)
    return out, [t for t, _ in sorted(tags.items(), key=lambda x: -x[1])]


def load_post(rel):
    d = safe_post_dir(rel)
    meta, body = quiet(build.read_post, d / 'index.md')
    url = '/site/' + d.relative_to(ROOT).as_posix()
    blocks = quiet(build.to_blocks, body, url, d / 'index.md')
    cover = meta.get('cover')
    return {'path': rel, 'game': d.parent.name, 'folder': d.name, 'meta': meta,
            'cover': (url + '/' + cover[2:]) if isinstance(cover, str) and cover.startswith('./') else None,
            'blocks': blocks}


def preview(md):
    blocks = quiet(build.to_blocks, md, '', ROOT / 'posts' / '_preview' / 'index.md')
    return {'blocks': blocks, 'min': build.reading_min(blocks)}


def fm_value(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, list):
        return '[' + ', '.join(json.dumps(x, ensure_ascii=False) for x in v) + ']'
    return json.dumps(str(v), ensure_ascii=False)


def save(data):
    gids = {g['id'] for g in games()}
    game, date, slug = data.get('game'), data.get('date', ''), data.get('slug', '').strip()
    meta = data.get('meta') or {}
    if game not in gids:
        raise ValueError('게임을 골라 주세요.')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
        raise ValueError('날짜 형식이 맞지 않아요.')
    if not str(meta.get('title', '')).strip():
        raise ValueError('제목을 적어 주세요.')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', slug):
        raise ValueError('폴더 이름은 영문 소문자 · 숫자 · - 만 쓸 수 있어요.')
    old = safe_post_dir(data['path']) if data.get('path') else None
    new = safe_post_dir(f'posts/{game}/{date}-{slug}')
    if new.exists() and new != old:
        raise ValueError('같은 게임 · 날짜 · 폴더 이름의 기록이 이미 있어요. 폴더 이름을 바꿔 주세요.')

    # 본문의 사진을 순서대로 01, 02 … 로 모은다 (새로 올린 사진은 .tmp, 기존 사진은 지금 폴더에서)
    md = data.get('md', '')
    stage = TMP / ('stage-' + uuid.uuid4().hex)
    stage.mkdir(parents=True)
    names, n = {}, 0

    def src_file(url):
        u = unquote(url)
        if u.startswith('/tmp/'):
            return TMP / Path(u).name
        if u.startswith('/site/posts/'):
            return (ROOT / u[len('/site/'):]).resolve()
        return None

    def take(m):
        nonlocal n
        cap, url, alt = m.group(1), m.group(2), m.group(3)
        f = src_file(url)
        if f is None:                     # 바깥 주소 사진은 그대로
            return m.group(0)
        if url not in names:
            if not f.exists():
                raise ValueError('사진 파일을 찾을 수 없어요: ' + url)
            n += 1
            name = f'{n:02d}{f.suffix.lower() if f.suffix.lower() in IMG_EXT else ".jpg"}'
            shutil.copy2(f, stage / name)
            names[url] = name
        return f'![{cap}](./{names[url]}' + (f' "{alt}"' if alt else '') + ')'

    try:
        body = MD_IMG.sub(take, md).strip() + '\n'
        fm = {'title': meta['title'].strip(), 'date': date}
        tags = [t.strip() for t in meta.get('tags') or [] if t.strip()]
        if tags: fm['tags'] = tags
        cover = data.get('cover')
        if cover and cover in names:
            fm['cover'] = './' + names[cover]
            if str(meta.get('cover_alt', '')).strip(): fm['cover_alt'] = meta['cover_alt'].strip()
        sp = meta.get('spoiler')
        if sp is True or (isinstance(sp, str) and sp.strip()): fm['spoiler'] = sp if sp is True else sp.strip()
        if meta.get('draft'): fm['draft'] = True
        lines = ['---'] + [f'{k}: ' + (v if k in ('date', 'cover') else fm_value(v)) for k, v in fm.items()] + ['---', '']
        (stage / 'index.md').write_text('\n'.join(lines) + body, encoding='utf-8', newline='\n')
        if old and old.exists():
            shutil.rmtree(old)
        new.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stage), str(new))
    finally:
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
    rel = new.relative_to(ROOT).as_posix()
    return {'path': rel, 'map': {u: f'/site/{rel}/{nm}' for u, nm in names.items()}}


def delete(rel):
    d = safe_post_dir(rel)
    if not (d / 'index.md').exists():
        raise ValueError('기록을 찾을 수 없어요.')
    shutil.rmtree(d)
    if not any(d.parent.iterdir()):
        d.parent.rmdir()
    return {'ok': True}


# ---------------- 게임 관리 (content/games.json + assets/games/<id>/) ----------------
GAMES_JSON = ROOT / 'content' / 'games.json'
CONFIG = HERE / 'config.json'           # 이 컴퓨터에만 두는 설정 (리뷰 시트 주소 등) — 저장소에 올리지 않는다
KEY_ORDER = ['id', 'name', 'aliases', 'color', 'release', 'genre', 'platforms', 'skin', 'art', 'steam']


def skins():
    return sorted(f.stem for f in (ROOT / 'css' / 'skins').glob('*.css') if f.stem != 'focus')


def games_meta():
    gs = games()
    counts = {d.name: len(list(d.glob('*/index.md'))) for d in POSTS.iterdir() if d.is_dir()}
    genres = sorted({g.get('genre') for g in gs if g.get('genre')})
    plats = []
    for g in gs:
        for x in g.get('platforms') or []:
            base = re.sub(r'\s*\(.*\)$', '', x)
            if base not in plats:
                plats.append(base)
    return {'games': gs, 'skins': skins(), 'posts': counts, 'genres': genres, 'platforms': plats}


def write_games(gs):
    ordered = [{**{k: g[k] for k in KEY_ORDER if k in g}, **{k: v for k, v in g.items() if k not in KEY_ORDER}} for g in gs]
    GAMES_JSON.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def save_game(data):
    g, orig, art = data.get('game') or {}, data.get('orig'), data.get('art')
    gs = games()
    gid = str(g.get('id', '')).strip()
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', gid):
        raise ValueError('게임 id는 영문 소문자 · 숫자 · - 만 쓸 수 있어요.')
    if not str(g.get('name', '')).strip():
        raise ValueError('게임 이름을 적어 주세요.')
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', str(g.get('color', ''))):
        raise ValueError('대표 색은 #RRGGBB 형식이어야 해요.')
    if g.get('release') and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', g['release']):
        raise ValueError('출시일 형식이 맞지 않아요.')
    if g.get('steam') and not re.fullmatch(r'\d+', str(g['steam'])):
        raise ValueError('Steam 앱 번호는 숫자여야 해요.')
    if g.get('skin') and g['skin'] not in skins():
        raise ValueError('없는 테마예요.')
    ids = [x['id'] for x in gs]
    if orig and orig != gid and (POSTS / orig).exists() and any((POSTS / orig).glob('*/index.md')):
        raise ValueError('기록이 있는 게임은 id를 바꿀 수 없어요.')
    if gid in ids and gid != orig:
        raise ValueError('같은 id의 게임이 이미 있어요.')
    new = {'id': gid, 'name': g['name'].strip(),
           'aliases': [a.strip() for a in g.get('aliases') or [] if a.strip()],
           'color': g['color'].upper()}
    for k in ('release', 'genre'):
        if str(g.get(k, '')).strip():
            new[k] = str(g[k]).strip()
    pl = [x.strip() for x in g.get('platforms') or [] if x.strip()]
    if pl:
        new['platforms'] = pl
    if g.get('skin') and g['skin'] != 'base':
        new['skin'] = g['skin']
    if g.get('steam'):
        new['steam'] = str(g['steam'])
    # 게임 아트 : 새로 올린 것(.tmp) · 그대로 · 지움
    adir = ROOT / 'assets' / 'games' / gid
    odir = ROOT / 'assets' / 'games' / (orig or gid)
    old_art = next((x.get('art') for x in gs if x['id'] == (orig or gid)), None)
    if art and art.startswith('/tmp/'):
        src = TMP / Path(art).name
        if not src.exists():
            raise ValueError('게임 아트 파일을 찾을 수 없어요.')
        for d in {adir, odir}:
            if d.exists():
                shutil.rmtree(d)
        adir.mkdir(parents=True)
        dst = adir / ('art' + src.suffix.lower())
        shutil.copy2(src, dst)
        new['art'] = dst.relative_to(ROOT).as_posix()
    elif art and old_art and (ROOT / old_art).exists():
        if odir != adir:                       # id 가 바뀌면 아트 폴더도 같이 옮긴다
            adir.mkdir(parents=True, exist_ok=True)
            dst = adir / Path(old_art).name
            shutil.move(str(ROOT / old_art), str(dst))
            shutil.rmtree(odir, ignore_errors=True)
            new['art'] = dst.relative_to(ROOT).as_posix()
        else:
            new['art'] = old_art
    else:
        for d in {adir, odir}:
            if d.exists():
                shutil.rmtree(d)
    if orig and orig in ids:
        gs[ids.index(orig)] = new
    else:
        gs.append(new)
    write_games(gs)
    return {'game': new}


def delete_game(gid):
    gs = games()
    if gid not in [x['id'] for x in gs]:
        raise ValueError('없는 게임이에요.')
    if (POSTS / gid).exists() and any((POSTS / gid).glob('*/index.md')):
        raise ValueError('기록이 있는 게임은 지울 수 없어요. 기록을 먼저 지워 주세요.')
    write_games([x for x in gs if x['id'] != gid])
    shutil.rmtree(ROOT / 'assets' / 'games' / gid, ignore_errors=True)
    return {'ok': True}


def load_config():
    try:
        return json.loads(CONFIG.read_text(encoding='utf-8'))
    except Exception:
        return {}


def save_config(data):
    c = load_config()
    url = str(data.get('reviewSheet', '')).strip()
    if url and not url.startswith('https://docs.google.com/'):
        raise ValueError('구글 시트 주소(https://docs.google.com/…)를 넣어 주세요.')
    c['reviewSheet'] = url
    CONFIG.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding='utf-8')
    return c


def git(*args):
    r = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout + r.stderr).strip()


MANAGED = ['posts', 'content/games.json', 'assets/games']   # 에디터가 다루는 곳 — 올리기도 여기만


def status():
    _, out = git('status', '--porcelain', '--untracked-files=all', '--', *MANAGED)
    rows = [l for l in out.splitlines() if l.strip()]
    return {'changes': rows}


def publish(message):
    if not status()['changes']:
        raise ValueError('올릴 변경이 없어요.')
    steps = [('add', '-A', '--', *MANAGED), ('commit', '-m', message or '기록 업데이트', '--', *MANAGED), ('push',)]
    log = []
    for s in steps:
        code, out = git(*s)
        log.append(f'$ git {" ".join(s[:2])}\n{out}')
        if code != 0:
            raise ValueError('올리기에 실패했어요.\n\n' + '\n\n'.join(log))
    return {'log': '\n\n'.join(log)}


def styles():
    """사이트 index.html 의 스타일 목록 — 미리보기가 같은 CSS 를 쓰도록 (새 테마가 생겨도 자동)"""
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    hrefs = re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
    return [h if h.startswith('http') else '/site/' + h for h in hrefs]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype='application/json; charset=utf-8'):
        b = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def file(self, p):
        if not p.is_file():
            return self.send(404, {'error': '없는 파일'})
        self.send(200, p.read_bytes(), (mimetypes.guess_type(p.name)[0] or 'application/octet-stream'))

    def do_GET(self):
        u = urlparse(self.path)
        path = unquote(u.path)
        try:
            if path in ('/', '/index.html'):
                return self.file(HERE / 'editor.html')
            if path in ('/editor.js', '/editor.css', '/preview.html', '/games.js', '/game-preview.html'):
                return self.file(HERE / path[1:])
            if path.startswith('/tmp/'):
                return self.file(TMP / Path(path).name)
            if path.startswith('/site/'):
                p = (ROOT / path[len('/site/'):]).resolve()
                if not str(p).startswith(str(ROOT.resolve())) or p.parts[len(ROOT.parts)] not in ('css', 'assets', 'posts', 'js'):
                    return self.send(403, {'error': '열 수 없는 파일'})
                return self.file(p)
            if path == '/api/meta':
                posts, tags = list_posts()
                gs = [{'id': g['id'], 'name': g['name'], 'skin': g.get('skin', 'base'), 'color': g['color']} for g in games()]
                return self.send(200, {'games': gs, 'posts': posts, 'tags': tags, 'styles': styles()})
            if path == '/api/post':
                return self.send(200, load_post(parse_qs(u.query)['path'][0]))
            if path == '/api/games':
                return self.send(200, games_meta())
            if path == '/api/config':
                return self.send(200, load_config())
            if path == '/api/status':
                return self.send(200, status())
            self.send(404, {'error': '없는 주소'})
        except Exception as e:
            self.send(400, {'error': str(e)})

    def do_POST(self):
        path = urlparse(self.path).path
        n = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(n)
        try:
            if path == '/api/upload':
                ext = (self.headers.get('X-Ext') or '.jpg').lower()
                if ext not in IMG_EXT:
                    raise ValueError('jpg · png · gif · webp 사진만 넣을 수 있어요.')
                TMP.mkdir(exist_ok=True)
                name = uuid.uuid4().hex + ext
                (TMP / name).write_bytes(raw)
                return self.send(200, {'url': '/tmp/' + name})
            data = json.loads(raw or b'{}')
            if path == '/api/preview':
                return self.send(200, preview(data.get('md', '')))
            if path == '/api/save':
                return self.send(200, save(data))
            if path == '/api/delete':
                return self.send(200, delete(data['path']))
            if path == '/api/game/save':
                return self.send(200, save_game(data))
            if path == '/api/game/delete':
                return self.send(200, delete_game(data['id']))
            if path == '/api/config':
                return self.send(200, save_config(data))
            if path == '/api/publish':
                return self.send(200, publish(data.get('message', '')))
            self.send(404, {'error': '없는 주소'})
        except Exception as e:
            self.send(400, {'error': str(e)})


if __name__ == '__main__':
    TMP.mkdir(exist_ok=True)
    url = f'http://127.0.0.1:{PORT}/'
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:                      # 이미 켜져 있으면 그 에디터를 다시 연다
        print('글쓰기 에디터가 이미 켜져 있어요. 브라우저에서 다시 엽니다.')
        webbrowser.open(url)
        sys.exit(0)
    print(f'PLAYLOG 글쓰기 → {url}\n이 창을 닫으면 에디터도 꺼집니다.')
    if '--no-browser' not in sys.argv:
        threading.Timer(.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
