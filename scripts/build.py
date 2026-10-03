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

게임 소식은 빌드할 때마다 모아 온다.
  Steam    : games.json 에 "steam"(앱 ID)이 있는 게임의 공식 공지 RSS (한국어 공지가 있으면 한국어)
  Nintendo : 닌텐도 코리아 뉴스 목록 페이지
출처 하나가 실패해도 빌드는 멈추지 않고, 지금 배포된 사이트에 있던 그 출처의 소식을 다시 쓴다.
NEWS_OFFLINE=1 이면 수집하지 않는다(로컬 빌드용).
"""
import csv, email.utils, html, io, json, os, re, shutil, sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
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
# 빈 줄 = 새 문단, 그냥 줄바꿈 = 문단 안 줄바꿈. 문단 하나가 아래 중 하나면 그 블록이 된다.
#   ![캡션](./01.jpg)        사진          https://youtu.be/…     유튜브 플레이어
#   ## 소제목 / ### 작은 소제목          - 항목 / 1. 항목         목록
#   > 인용
# 문장 안: **굵게** *기울임* ~~취소선~~ [글자](주소) ||스포일러||
IMG_LINE = re.compile(r'^!\[(.*?)\]\((.+?)\)\s*$')
YT_LINE = re.compile(r'^https?://(?:www\.|m\.)?(?:youtu\.be/|youtube\.com/(?:watch\?(?:\S*&)?v=|shorts/|live/|embed/))'
                     r'([\w-]{11})(\S*)$')
HEAD_LINE = re.compile(r'^(#{2,3})\s+(.+)$')
UL_LINE, OL_LINE = re.compile(r'^[-*]\s+(.+)$'), re.compile(r'^\d+[.)]\s+(.+)$')

def html_escape(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

INLINE = [   # (패턴, 바꿀 HTML) — 위에서부터 차례로. 글자는 먼저 이스케이프한다
    (re.compile(r'\[([^\]\n]+)\]\((https?://[^)\s]+)\)'), r'<a href="\2" target="_blank" rel="noopener">\1</a>'),
    (re.compile(r'\|\|(.+?)\|\|'), r'<span class="spoiler" tabindex="0" role="button" aria-label="스포일러, 눌러서 보기">\1</span>'),
    (re.compile(r'\*\*(.+?)\*\*'), r'<strong>\1</strong>'),
    (re.compile(r'~~(.+?)~~'), r'<del>\1</del>'),
    (re.compile(r'(?<![*A-Za-z0-9])\*(?=\S)(.+?)(?<=\S)\*(?![*A-Za-z0-9])'), r'<em>\1</em>'),   # 한국어 조사가 바로 붙어도 되게
]
def inline_html(s):
    s = html_escape(s)
    for pat, rep in INLINE:
        s = pat.sub(rep, s)
    return s

def inline_plain(s):
    """검색·발췌·읽는 시간용 — 문법 기호를 빼고, 스포일러는 내용 대신 표시만"""
    s = re.sub(r'\|\|(.+?)\|\|', '(스포일러)', s)
    s = re.sub(r'\[([^\]\n]+)\]\((https?://[^)\s]+)\)', r'\1', s)
    return re.sub(r'\*\*|~~|(?<![*A-Za-z0-9])\*(?=\S)|(?<=\S)\*(?![*A-Za-z0-9])', '', s)

def yt_start(rest):
    """주소 뒤의 t=90 / t=1m30s / start=90 → 초"""
    m = re.search(r'[?&](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?', rest)
    return (int(m.group(1) or 0) * 3600 + int(m.group(2) or 0) * 60 + int(m.group(3) or 0)) if m else 0

def to_blocks(body, folder_url, path):
    blocks = []
    paras = [p.strip('\n') for p in re.split(r'\n\s*\n', body.strip()) if p.strip()]
    while paras:
        para = paras.pop(0)
        one = para.strip()
        lines = [l.strip() for l in para.split('\n') if l.strip()]
        if m := IMG_LINE.match(one):
            blocks.append({'type': 'image', 'src': resolve(m.group(2), folder_url, path), 'caption': m.group(1)})
        elif m := YT_LINE.match(one):
            blocks.append({'type': 'youtube', 'id': m.group(1), 'start': yt_start(m.group(2))})
        elif m := HEAD_LINE.match(lines[0]):
            t = m.group(2).strip()
            blocks.append({'type': 'h', 'level': len(m.group(1)), 'text': inline_plain(t), 'html': inline_html(t)})
            if len(lines) > 1:                         # 소제목 바로 아래 줄부터는 다음 문단으로
                paras.insert(0, '\n'.join(para.split('\n')[1:]))
        elif all(UL_LINE.match(l) for l in lines) or all(OL_LINE.match(l) for l in lines):
            ordered = bool(OL_LINE.match(lines[0]))
            items = [(OL_LINE if ordered else UL_LINE).match(l).group(1) for l in lines]
            blocks.append({'type': 'list', 'ordered': ordered, 'text': ' '.join(inline_plain(i) for i in items),
                           'items': [inline_html(i) for i in items]})
        elif all(l.startswith('>') for l in lines):
            t = '\n'.join(re.sub(r'^>\s?', '', l) for l in para.split('\n') if l.strip())
            blocks.append({'type': 'quote', 'text': inline_plain(t), 'html': inline_html(t)})
        else:
            blocks.append({'type': 'text', 'text': inline_plain(para), 'html': inline_html(para)})
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
    chars = sum(len(b.get('text', '')) for b in blocks)
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

def fetch_text(url):
    req = Request(url, headers={'User-Agent': 'playlog-build (+https://alfendi-55555.github.io/)',
                                'Accept-Language': 'ko-KR,ko;q=0.9'})
    with urlopen(req, timeout=20) as res:
        return res.read().decode('utf-8-sig')

fetch_csv = fetch_text

def sheet_rows(env, cols):
    """환경 변수 env 의 '웹에 게시' CSV 주소를 읽어 열 이름 기준 dict 목록으로. 주소가 없으면 None."""
    url = os.environ.get(env, '').strip()
    if not url:
        return None
    try:
        text = fetch_csv(url)
    except Exception as e:
        errors.append(f'{env}: 시트를 읽지 못했습니다 → {e}')
        return []
    reader = csv.DictReader(io.StringIO(text))
    head = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in cols if c not in head]
    if missing:
        errors.append(f'{env}: 1행에 열이 없습니다 → {", ".join(missing)} (지금 1행: {", ".join(head)})')
        return []
    return [{(k or '').strip(): (v or '').strip() for k, v in r.items()} for r in reader]

def game_lookup(games):
    """id · 영문 이름 · 별칭(대소문자 무시) → 게임 id"""
    return {key.strip().lower(): g['id'] for g in games for key in [g['id'], g['name'], *g['aliases']]}

def music_rows():
    """시트(또는 music.json)를 시트 열 이름 기준의 dict 목록으로."""
    rows = sheet_rows('MUSICLIST_CSV', MUSIC_COLS)
    if rows is None:
        rows = []
        for m in load_json('music.json', []):
            rows.append({'제목': m.get('title', ''), '게임': m.get('game', ''), '작곡가': m.get('composer', ''),
                         '태그': ', '.join(m.get('tags') or []), '한마디': m.get('note', ''),
                         '비슷한 곡': ', '.join(m.get('similar') or []),
                         '링크': ', '.join(m.get('links') or ([m['youtube']] if m.get('youtube') else [])),
                         '썸네일': m.get('thumb', ''), '공개': 'Y'})
        return 'content/music.json', rows
    return '음악 시트', rows

def build_music(games):
    lookup = game_lookup(games)
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

# ---------------- 한줄 리뷰 (시트) ----------------
REVIEW_COLS = ['게임', '별점', '연도', '시간', '한줄 리뷰', '공개']

def apply_reviews(games):
    """REVIEWS_CSV(리뷰 탭) 의 공개 행을 게임에 붙인다. 시트에 있는 게임은 games.json 의 review 보다 시트가 우선."""
    rows = sheet_rows('REVIEWS_CSV', REVIEW_COLS)
    if rows is None:
        return
    lookup, by_id, seen = game_lookup(games), {g['id']: g for g in games}, set()
    for n, r in enumerate(rows, 2):
        if r.get('공개', '').upper() != 'Y':
            continue
        where = f'리뷰 시트 {n}행'
        gid = lookup.get(r.get('게임', '').lower())
        if not gid:
            errors.append(f'{where}: 라이브러리에 없는 게임입니다 → {r.get("게임")} (games.json의 id·이름·별칭 중 하나로)')
            continue
        if gid in seen:
            errors.append(f'{where}: {by_id[gid]["name"]} 리뷰가 시트에 두 번 있습니다')
            continue
        try:
            rating = float(r['별점'])
        except ValueError:
            rating = -1
        if not (0.5 <= rating <= 5 and rating * 2 == int(rating * 2)):
            errors.append(f'{where}: 별점은 0.5 ~ 5, 0.5 단위로 → {r["별점"]}')
            continue
        if not r.get('한줄 리뷰'):
            errors.append(f'{where}: 한줄 리뷰가 비어 있습니다')
            continue
        year, hours = r.get('연도', ''), r.get('시간', '')
        if year and not re.fullmatch(r'(19|20)\d\d', year):
            errors.append(f'{where}: 연도는 2024처럼 네 자리로 → {year}')
            continue
        if hours and not re.fullmatch(r'\d+(\.\d+)?', hours):
            errors.append(f'{where}: 시간은 숫자만 → {hours}')
            continue
        seen.add(gid)
        by_id[gid]['review'] = {'rating': rating, 'year': int(year) if year else None,
                                'hours': (float(hours) if '.' in hours else int(hours)) if hours else None,
                                'text': r['한줄 리뷰']}
    print(f'리뷰 시트: {len(seen)}개')

# ---------------- 게임 소식 ----------------
NEWS_MAX = 50
KST = timezone(timedelta(hours=9))
NINTENDO_NEWS = 'https://www.nintendo.com/kr/news'
STEAM_RSS = 'https://store.steampowered.com/feeds/news/app/{appid}/?l=koreana'
STEAM_HEADER = 'https://cdn.akamai.steamstatic.com/steam/apps/{appid}/header.jpg'
PREV_SITE = 'https://alfendi-55555.github.io/data/site.json'   # 수집 실패 시 기댈 지난 결과
SUB_LEN = 110

def plain(s, n=None):
    s = re.sub(r'<[^>]+>', ' ', html.unescape(s or ''))
    s = re.sub(r'\s+', ' ', s).strip()
    return s[:n - 1] + '…' if n and len(s) > n else s

def name_key(s):
    """게임 이름 비교용: 소문자, 띄어쓰기·기호 제거."""
    return re.sub(r'[\W_]+', '', s.lower())

def fetch_steam(appid, gid):
    root = ET.fromstring(fetch_text(STEAM_RSS.format(appid=appid)))
    out = []
    for it in root.iter('item'):
        enc = it.find('enclosure')
        when = email.utils.parsedate_to_datetime(it.findtext('pubDate')).astimezone(KST)
        out.append({'src': 'steam', 'srcName': 'Steam', 'game': gid,
                    't': plain(it.findtext('title')), 'sub': plain(it.findtext('description'), SUB_LEN),
                    'url': it.findtext('link', '').strip(), 'd': when.strftime('%Y.%m.%d'), 'ts': when.strftime('%H:%M'),
                    'img': enc.get('url') if enc is not None else STEAM_HEADER.format(appid=appid)})
    return out

NINTENDO_ITEM = re.compile(
    r'<a href="([^"]+)" class="ncmn-u-linkbox">.*?background-image:url\(([^)]+)\)'
    r'.*?ncmn-softUnit__name">(.*?)</div>.*?ncmn-softUnit__release">([\d.]+)</div>', re.S)

def fetch_nintendo(keys):
    out = []
    for href, img, name, d in NINTENDO_ITEM.findall(fetch_text(NINTENDO_NEWS)):
        t = plain(name)
        y, m, dd = d.split('.')
        url = html.unescape(href)
        out.append({'src': 'nintendo', 'srcName': 'Nintendo', 'game': match_game(t, keys),
                    't': t, 'sub': '', 'url': 'https://www.nintendo.com' + url if url.startswith('/') else url,
                    'd': f'{y}.{int(m):02d}.{int(dd):02d}', 'ts': '', 'img': html.unescape(img)})
    if not out:
        raise ValueError('뉴스 항목을 하나도 찾지 못했습니다(페이지 구조가 바뀌었을 수 있음)')
    return out

def match_game(title, keys):
    """『』「」 안의 이름에 라이브러리 게임 이름·별칭이 들어 있으면 그 게임.
    DLC·에디션처럼 이름이 길어진 경우도 잡히고, 여러 개면 가장 긴 이름이 이긴다."""
    for quoted in re.findall(r'[『「](.+?)[』」]', title):
        q = name_key(quoted)
        for key, gid in keys:
            if key in q:
                return gid
    return None

def previous_news():
    try:
        return json.loads(fetch_text(PREV_SITE)).get('news') or []
    except Exception:
        return []

def build_news(games, games_meta):
    if os.environ.get('NEWS_OFFLINE'):
        print('참고: NEWS_OFFLINE — 게임 소식을 모으지 않았습니다')
        return []
    by_id = {g['id']: g for g in games}
    keys = sorted({(name_key(k), g['id']) for g in games for k in [g['name'], *g['aliases']]
                   if len(name_key(k)) >= 3}, key=lambda x: -len(x[0]))       # 너무 짧은 별칭은 오연결 방지로 제외
    jobs = [('Nintendo', lambda: fetch_nintendo(keys), lambda n: n['src'] == 'nintendo')]
    for g in games_meta:
        if g.get('steam'):
            jobs.append((f'Steam · {g["name"]}', lambda a=str(g['steam']), i=g['id']: fetch_steam(a, i),
                         lambda n, i=g['id']: n['src'] == 'steam' and n.get('game') == i))
    news, prev = [], None
    for label, job, mine in jobs:
        try:
            got = job()
            print(f'소식: {label} {len(got)}건')
        except Exception as e:
            if prev is None:
                prev = previous_news()
            got = [n for n in prev if mine(n)]
            print(f'경고: {label} 소식을 모으지 못해 지난 결과 {len(got)}건을 씁니다 → {e}')
        news += got
    seen, uniq = set(), []
    for n in sorted(news, key=lambda n: (n['d'], n.get('ts', '')), reverse=True):
        if n['url'] and n['url'] not in seen:
            seen.add(n['url'])
            n['gameName'] = by_id[n['game']]['name'] if n.get('game') in by_id else ''
            n.pop('ts', None)
            uniq.append(n)
    return uniq[:NEWS_MAX]

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
                # spoiler: true → 경고만, spoiler: 3회차 엔딩 → 무엇이 나오는지까지. 없으면 null
                'spoiler': (meta['spoiler'] if isinstance(meta.get('spoiler'), str) and meta['spoiler']
                            else '' if meta.get('spoiler') is True else None),
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
    apply_reviews(games)
    music = build_music(games)
    for g in games_meta:
        if g.get('steam') and not re.fullmatch(r'\d+', str(g['steam'])):
            errors.append(f'content/games.json: {g["id"]} 의 steam 은 숫자 앱 ID여야 합니다 → {g["steam"]}')

    profile = load_json('profile.json', {})
    for k in ('name', 'tagline'):
        if k not in profile:
            errors.append(f'content/profile.json: {k} 가 없습니다')
    fav = profile.get('favorite')
    if fav and fav.get('game') and fav['game'] not in names:
        errors.append(f'content/profile.json: favorite.game "{fav["game"]}" 이 games.json에 없습니다')

    # 방명록: GUESTBOOK_API(Apps Script 웹앱 주소)가 있으면 화면이 거기서 바로 읽고 쓴다.
    # 없으면 content/guestbook.json 샘플만 읽기 전용으로 보여 준다(로컬 미리보기).
    guest_api = os.environ.get('GUESTBOOK_API', '').strip()
    if guest_api and not re.fullmatch(r'https://script\.google\.com/macros/s/[\w-]+/exec', guest_api):
        errors.append(f'GUESTBOOK_API: Apps Script 웹앱 주소(https://script.google.com/macros/s/…/exec)가 아닙니다 → {guest_api}')
    guest = [] if guest_api else [
        {'n': x['name'], 'd': x['date'].replace('-', '.'), 'm': x['message'], **({'re': x['reply']} if x.get('reply') else {})}
        for x in load_json('guestbook.json', [])]

    if errors:
        print('빌드 실패 — 아래를 고쳐 주세요:', file=sys.stderr)
        for e in errors:
            print('  ·', e, file=sys.stderr)
        sys.exit(1)

    news = build_news(games, games_meta)        # 실패해도 빌드는 계속 (경고만)

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
        json.dumps({'games': games, 'music': music, 'news': news, 'newsMax': NEWS_MAX,
                    'newsUpdated': datetime.now(KST).strftime('%Y.%m.%d %H:%M') if news else '',
                    'guestbook': guest, 'guestbookApi': guest_api, 'profile': profile},
                   ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (OUT / '.nojekyll').touch()

    n_posts = sum(len(g['posts']) for g in games)
    n_rev = sum(1 for g in games if g['review'])
    print(f'완료: 게임 {len(games)}개, 글 {n_posts}편, 한줄 리뷰 {n_rev}개, 음악 {len(music)}곡, 소식 {len(news)}건 → _site/')

if __name__ == '__main__':
    build()
