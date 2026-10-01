#!/usr/bin/env python3
"""
PLAYLOG 빌드 스크립트 (파이썬 표준 라이브러리만 사용)

  content/*.json  +  posts/<게임id>/<폴더>/index.md
        ↓
  _site/  (GitHub Pages에 그대로 올라가는 결과물)
    ├─ index.html, css/, js/, assets/     ← 그대로 복사
    ├─ posts/...                          ← 글 이미지만 복사
    └─ data/site.json                     ← 화면이 읽는 데이터 한 덩어리

로컬 미리보기:
  python scripts/build.py && python -m http.server -d _site

음악 목록은 환경 변수 MUSICLIST_CSV(구글 시트 '웹에 게시' CSV 주소)가 있으면 시트에서,
없으면 content/music.json 에서 읽는다.
"""
import csv, io, json, os, re, shutil, sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_site'
STATIC = ['index.html', 'css', 'js', 'assets']
IMG_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'}
CHARS_PER_MIN = 500          # 한국어 기준 대략적인 읽기 속도

errors = []

# ---------------- front matter ----------------
def parse_value(raw):
    v = raw.strip()
    if v == '':
        return ''
    if v.startswith('[') and v.endswith(']'):
        inner = v[1:-1].strip()
        return [parse_value(x) for x in split_list(inner)] if inner else []
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
        return json.loads(v) if v[0] == '"' else v[1:-1]
    if re.fullmatch(r'-?\d+', v):
        return int(v)
    if v in ('true', 'false'):
        return v == 'true'
    return v

def split_list(s):
    out, buf, q = [], '', None
    for ch in s:
        if q:
            buf += ch
            if ch == q: q = None
        elif ch in '"\'':
            q = ch; buf += ch
        elif ch == ',':
            out.append(buf); buf = ''
        else:
            buf += ch
    out.append(buf)
    return [x for x in out if x.strip()]

def read_post(path):
    text = path.read_text(encoding='utf-8').replace('\r\n', '\n')
    m = re.match(r'---\n(.*?)\n---\n?(.*)', text, re.S)
    if not m:
        errors.append(f'{path}: 맨 위에 --- 로 감싼 front matter가 없습니다')
        return None, ''
    meta = {}
    for n, line in enumerate(m.group(1).split('\n'), 2):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if ':' not in line:
            errors.append(f'{path}:{n}: "키: 값" 형식이 아닙니다 → {line!r}')
            continue
        k, v = line.split(':', 1)
        meta[k.strip()] = parse_value(v)
    return meta, m.group(2)

# ---------------- 본문 → blocks ----------------
IMG_LINE = re.compile(r'^!\[(.*?)\]\((.+?)\)\s*$')

def to_blocks(body, folder_url, path):
    blocks = []
    for para in re.split(r'\n\s*\n', body.strip()):
        para = para.strip('\n')
        if not para.strip():
            continue
        m = IMG_LINE.match(para.strip())
        if m:
            blocks.append({'type': 'image', 'src': resolve(m.group(2), folder_url, path),
                           'caption': m.group(1)})
        else:
            blocks.append({'type': 'text', 'text': para})
    return blocks

def resolve(src, folder_url, path):
    src = src.strip()
    if re.match(r'https?://|/', src):
        return src
    rel = src[2:] if src.startswith('./') else src
    if not (path.parent / rel).exists():
        errors.append(f'{path}: 이미지 파일이 없습니다 → {src}')
    return f'{folder_url}/{rel}'

def reading_min(blocks):
    chars = sum(len(b['text']) for b in blocks if b['type'] == 'text')
    return max(1, round(chars / CHARS_PER_MIN))

# ---------------- 조립 ----------------
def load_json(name, default=None):
    p = ROOT / 'content' / name
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding='utf-8'))

def check_review(g):
    r = g.get('review')
    if r is None:
        return None
    for k in ('rating', 'text'):
        if k not in r:
            errors.append(f'content/games.json: {g["id"]} 의 review 에 {k} 가 없습니다')
    return {'rating': r.get('rating'), 'year': r.get('year'), 'hours': r.get('hours'),
            'text': r.get('text', '')}

# ---------------- 음악 ----------------
MUSIC_COLS = ['제목', '게임', '작곡가', '태그', '한마디', '비슷한 곡', '링크', '썸네일', '공개']
# (도메인, 표시 이름, 약어) — 더 구체적인 도메인을 앞에. 하위 도메인도 잡는다.
PLATFORMS = [
    ('music.youtube.com', 'YouTube Music', 'YTM'),
    ('youtube.com', 'YouTube', 'YT'),
    ('youtu.be', 'YouTube', 'YT'),
    ('spotify.com', 'Spotify', 'SP'),
    ('music.apple.com', 'Apple Music', 'AM'),
    ('music.nintendo.com', 'Nintendo Music', 'NM'),
]
TRACKING = {'si', 'feature', 'pp', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'}

def split_cell(s):
    return [x.strip() for x in re.split(r'[,\n]', s or '') if x.strip()]

def clean_link(url, where):
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        errors.append(f'{where}: http(s) 주소가 아닙니다 → {url}')
        return None
    host = parts.hostname.removeprefix('www.')
    label, short = '듣기', 'LINK'
    for d, name, ab in PLATFORMS:
        if host == d or host.endswith('.' + d):
            label, short = name, ab
            break
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in TRACKING])
    return {'url': urlunsplit(parts._replace(query=query)), 'label': label, 'short': short}

def fetch_csv(url):
    req = Request(url, headers={'User-Agent': 'playlog-build'})
    with urlopen(req, timeout=20) as res:
        return res.read().decode('utf-8-sig')

def music_rows():
    """시트(또는 music.json)를 시트 열 이름 기준의 dict 목록으로."""
    url = os.environ.get('MUSICLIST_CSV', '').strip()
    if not url:
        rows = []
        for m in load_json('music.json', []):
            rows.append({'제목': m.get('title', ''), '게임': m.get('game', ''), '작곡가': m.get('composer', ''),
                         '태그': ', '.join(m.get('tags') or []), '한마디': m.get('note', ''),
                         '비슷한 곡': ', '.join(m.get('similar') or []),
                         '링크': ', '.join(m.get('links') or ([m['youtube']] if m.get('youtube') else [])),
                         '썸네일': m.get('thumb', ''), '공개': 'Y'})
        return 'content/music.json', rows
    try:
        text = fetch_csv(url)
    except Exception as e:
        errors.append(f'MUSICLIST_CSV: 시트를 읽지 못했습니다 → {e}')
        return 'MUSICLIST_CSV', []
    reader = csv.DictReader(io.StringIO(text))
    head = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in MUSIC_COLS if c not in head]
    if missing:
        errors.append(f'MUSICLIST_CSV: 1행에 열이 없습니다 → {", ".join(missing)} (지금 1행: {", ".join(head)})')
        return 'MUSICLIST_CSV', []
    return '음악 시트', [{(k or '').strip(): (v or '').strip() for k, v in r.items()} for r in reader]

def build_music(games):
    lookup = {}
    for g in games:
        for key in [g['id'], g['name'], *g['aliases']]:
            lookup[key.strip().lower()] = g['id']
    src, rows = music_rows()
    music, unknown = [], set()
    for n, r in enumerate(rows, 2):
        if r.get('공개', '').upper() != 'Y':
            continue
        where = f'{src} {n}행'
        if not r.get('제목') or not r.get('게임'):
            errors.append(f'{where}: 제목과 게임은 꼭 적어야 합니다')
            continue
        gid = lookup.get(r['게임'].lower())
        if not gid:
            unknown.add(r['게임'])
        thumb = r.get('썸네일', '')
        if thumb and not re.match(r'https?://', thumb) and not (ROOT / thumb).exists():
            errors.append(f'{where}: 썸네일 파일이 없습니다 → {thumb}')
        links = [l for l in (clean_link(u, where) for u in split_cell(r.get('링크'))) if l]
        music.append({'title': r['제목'], 'game': gid, 'gameName': r['게임'], 'composer': r.get('작곡가', ''),
                      'tags': split_cell(r.get('태그')), 'note': r.get('한마디', ''),
                      'similar': split_cell(r.get('비슷한 곡')), 'links': links, 'thumb': thumb})
    for m in music:                                # 라이브러리 게임은 공식 이름으로 표시
        if m['game']:
            m['gameName'] = next(g['name'] for g in games if g['id'] == m['game'])
    if unknown:
        print(f'참고: 라이브러리에 없는 게임(텍스트로만 표시) → {", ".join(sorted(unknown))}')
    return music

def build():
    games_meta = load_json('games.json', [])
    ids = [g['id'] for g in games_meta]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        errors.append(f'content/games.json: 겹치는 id → {", ".join(sorted(dup))}')
    known = set(ids)
    for d in sorted((ROOT / 'posts').iterdir()):
        if d.is_dir() and d.name not in known:
            errors.append(f'posts/{d.name}/ : content/games.json에 없는 게임 id입니다')

    games = []
    for g in games_meta:
        if g.get('art') and not (ROOT / g['art']).exists():
            errors.append(f'content/games.json: {g["id"]} 의 art 파일이 없습니다 → {g["art"]}')
        posts = []
        for md in sorted((ROOT / 'posts' / g['id']).glob('*/index.md')):
            meta, body = read_post(md)
            if meta is None:
                continue
            for req in ('title', 'date'):
                if req not in meta:
                    errors.append(f'{md}: front matter에 {req} 가 없습니다')
            folder_url = 'posts/' + md.parent.relative_to(ROOT / 'posts').as_posix()
            blocks = to_blocks(body, folder_url, md)
            cover = meta.get('cover')
            posts.append({
                'id': f'{g["id"]}/{md.parent.name}',
                't': meta.get('title', md.parent.name),
                'd': str(meta.get('date', '')).replace('-', '.'),
                'min': reading_min(blocks),
                'tags': meta.get('tags') or [],
                'cover': resolve(cover, folder_url, md) if cover else None,
                'blocks': blocks,
                'draft': bool(meta.get('draft', False)),
            })
        posts = [p for p in posts if not p.pop('draft')]
        posts.sort(key=lambda p: p['d'], reverse=True)          # 최신 글이 위
        img = g.get('art')
        games.append({'id': g['id'], 'name': g['name'], 'aliases': g.get('aliases') or [],
                      'skin': g.get('skin', 'base'),
                      'color': g['color'], 'img': img,
                      'art': f'url("{img}") center/cover' if img else g['color'],
                      'review': check_review(g), 'posts': posts})

    names = {g['id'] for g in games}
    music = build_music(games)

    profile = load_json('profile.json', {})
    for k in ('name', 'tagline'):
        if k not in profile:
            errors.append(f'content/profile.json: {k} 가 없습니다')
    fav = profile.get('favorite')
    if fav and fav.get('game') and fav['game'] not in names:
        errors.append(f'content/profile.json: favorite.game "{fav["game"]}" 이 games.json에 없습니다')

    guest = [{'n': x['name'], 'd': x['date'].replace('-', '.'), 'm': x['message'],
              **({'re': x['reply']} if x.get('reply') else {})}
             for x in load_json('guestbook.json', [])]

    if errors:
        print('빌드 실패 — 아래를 고쳐 주세요:', file=sys.stderr)
        for e in errors:
            print('  ·', e, file=sys.stderr)
        sys.exit(1)

    # 출력
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for name in STATIC:
        src = ROOT / name
        (shutil.copytree if src.is_dir() else shutil.copy2)(src, OUT / name)
    for f in (ROOT / 'posts').rglob('*'):
        if f.suffix.lower() in IMG_EXT:
            dst = OUT / f.relative_to(ROOT)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dst)
    html = (OUT / 'index.html').read_text(encoding='utf-8')
    tl = profile.get('tagline', '').replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')
    (OUT / 'index.html').write_text(html.replace('%TAGLINE%', tl), encoding='utf-8')
    (OUT / 'data').mkdir()
    (OUT / 'data' / 'site.json').write_text(
        json.dumps({'games': games, 'music': music, 'guestbook': guest, 'profile': profile},
                   ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (OUT / '.nojekyll').touch()

    n_posts = sum(len(g['posts']) for g in games)
    n_rev = sum(1 for g in games if g['review'])
    print(f'완료: 게임 {len(games)}개, 글 {n_posts}편, 한줄 리뷰 {n_rev}개, 음악 {len(music)}곡 → _site/')

if __name__ == '__main__':
    build()
