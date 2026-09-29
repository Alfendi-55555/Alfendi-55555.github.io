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
"""
import json, re, shutil, sys
from pathlib import Path

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
def art_css(g):
    if g.get('art'):
        return f'url("{g["art"]}") center/cover'
    return g.get('gradient') or f'linear-gradient(152deg,{g["color"]},#000)'

def load_json(name):
    return json.loads((ROOT / 'content' / name).read_text(encoding='utf-8'))

def build():
    games_meta = load_json('games.json')
    known = {g['id'] for g in games_meta}
    for d in sorted((ROOT / 'posts').iterdir()):
        if d.is_dir() and d.name not in known:
            errors.append(f'posts/{d.name}/ : content/games.json에 없는 게임 id입니다')

    games = []
    for g in games_meta:
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
                'pct': int(meta.get('progress', 0)),
                'tags': meta.get('tags') or [],
                'cover': resolve(cover, folder_url, md) if cover else None,
                'blocks': blocks,
                'draft': bool(meta.get('draft', False)),
            })
        posts = [p for p in posts if not p.pop('draft')]
        posts.sort(key=lambda p: p['d'], reverse=True)          # 최신 글이 위
        games.append({'id': g['id'], 'name': g['name'], 'skin': g.get('skin', 'base'),
                      'color': g['color'], 'art': art_css(g), 'cover': g.get('cover'),
                      'posts': posts})

    reviews = [{'name': r['name'], 'color': r['color'], 'art': art_css(r), 'r': r['rating'],
                'y': r['year'], 'h': r['hours'], 'rev': r['review']}
               for r in load_json('reviews.json')]
    guest = [{'n': x['name'], 'd': x['date'].replace('-', '.'), 'm': x['message'],
              **({'re': x['reply']} if x.get('reply') else {})}
             for x in load_json('guestbook.json')]

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
    (OUT / 'data').mkdir()
    (OUT / 'data' / 'site.json').write_text(
        json.dumps({'games': games, 'reviews': reviews, 'guestbook': guest},
                   ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (OUT / '.nojekyll').touch()

    n_posts = sum(len(g['posts']) for g in games)
    print(f'완료: 게임 {len(games)}개, 글 {n_posts}편, 한줄 리뷰 {len(reviews)}개 → _site/')

if __name__ == '__main__':
    build()
