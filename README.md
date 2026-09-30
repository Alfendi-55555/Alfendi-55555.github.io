# PLAYLOG — 수의 플레이 기록

끝까지 한 게임과, 끝내지 못한 게임에 대해 씁니다.

## 폴더 구조

```
index.html            화면 뼈대 (마크업만)
css/                  스타일. index.html의 <link> 순서가 곧 우선순위
  skins/              게임별 스킨 (base / playlog / metaphor)
js/                   화면 동작. 화면마다 모듈 하나
  app.js              진입점 · 주소(#/...) → 화면
  store.js            data/site.json 을 읽어 모두에게 나눠 준다
  home.js             홈 채널 메뉴와 독
  library.js          라이브러리 : 최근 꺼낸 게임 선반 · 케이스 · 펼친 케이스
  insert.js           카트리지 삽입
  game.js             카트리지를 꽂은 뒤의 게임별 기록 · 글 읽기
  posts.js music.js about.js guest.js landing.js settings.js
assets/               사이트 공용 이미지 (아바타, 게임 아트)
content/
  profile.json        소개 페이지 내용과 사이트 소개 문장(tagline)
  games.json          모든 게임. 한줄 리뷰는 게임마다 선택 항목
  music.json          오늘의 게임 음악 후보
  guestbook.json      방명록 (임시 — 나중에 댓글 서비스로 교체 예정)
posts/<게임id>/<날짜-제목>/
  index.md            글 본문
  01.jpg …            그 글에 들어가는 이미지
scripts/build.py      content + posts → _site/ 로 조립
.github/workflows/    main에 push하면 자동 빌드·배포
```

## 화면과 주소

| 주소 | 화면 |
|---|---|
| `#/` | 홈 (채널 메뉴) |
| `#/library` | 라이브러리 |
| `#/posts` | 전체 글 |
| `#/music` | 음악 |
| `#/about` · `#/guest` | 소개 · 방명록 |
| `#/game/<게임id>` | 카트리지를 꽂은 뒤의 게임별 기록 |

라이브러리에서 게임(케이스)을 누르면 펼친 케이스가 열리고, 기록이 있으면 카트리지를 꽂아 게임 화면으로 들어갑니다.

## 게임 추가 · 한줄 리뷰

`content/games.json`에 항목을 추가합니다. 모든 게임이 같은 목록에 있고, 한줄 리뷰는 있어도 되고 없어도 됩니다.

```json
{
  "id": "celeste",
  "name": "Celeste",
  "aliases": ["셀레스테"],
  "color": "#B8567A",
  "art": "assets/games/celeste/art.jpg",
  "skin": "base",
  "review": { "rating": 4.5, "year": 2024, "hours": 12, "text": "한 줄로 남기는 감상." }
}
```

- `id`는 영문 소문자와 `-`. 글 폴더 이름(`posts/<id>/`)과 같아야 합니다.
- `aliases`는 선택. 라이브러리·전체 글 검색에서 이 이름으로도 찾아집니다(예: "하데스"로 Hades).
- `art`가 없으면 `color` 단색으로 보입니다.
- `skin`은 카트리지를 꽂았을 때의 화면 스킨 (`base` · `playlog` · `metaphor`). 없으면 `base`.
- `review`의 `rating`과 `text`는 필수, `year`와 `hours`는 선택.
- 나중에 이 게임에 글을 쓰면 `posts/<id>/`에 넣기만 하면 됩니다. 케이스에 카트리지가 생기고 "최근 꺼낸 게임"에 올라옵니다.

## 글 쓰기

`posts/<게임id>/` 아래에 폴더를 하나 만들고 `index.md`를 넣습니다.
폴더 이름은 `2026-10-01-boss-rush`처럼 날짜로 시작하면 정리가 편합니다.

```markdown
---
title: 글 제목
date: 2026-10-01
tags: [로그라이크, 클리어기록]
cover: ./01.jpg        # 선택. 목록 썸네일과 글 상단 배경
draft: true            # 선택. true면 사이트에 안 나온다
---

첫 문단.
줄을 그냥 바꾸면 같은 문단 안에서 줄바꿈이 된다.

빈 줄을 넣으면 새 문단.

![이미지 캡션](./01.jpg)
```

- 이미지는 **한 줄에 하나씩**, 앞뒤로 빈 줄을 둡니다. 캡션이 없으면 `![]`.
- 읽는 시간은 본문 길이로 자동 계산되고, 3분 이상인 글에만 표시됩니다.
- 글 끝에는 같은 게임의 이전·다음 기록으로 가는 버튼이 자동으로 붙습니다.
- 굵게·링크 같은 인라인 문법은 아직 화면에 반영되지 않습니다(글자 그대로 보임).

## 오늘의 게임 음악

`content/music.json`에 곡을 추가합니다. 날짜마다 한 곡씩 돌아가며 홈과 음악 페이지에 나옵니다(모든 방문자에게 같은 곡).

```json
{ "title": "In the Blood", "game": "hades", "composer": "Darren Korb",
  "youtube": "https://www.youtube.com/watch?v=...", "tags": ["보컬곡"], "note": "추천 한 줄" }
```

- `game`은 `games.json`의 `id`. 그 게임의 아트가 곡 이미지로 쓰입니다.
- `youtube`가 비어 있으면 "YouTube에서 듣기" 버튼 대신 준비 중 문구가 나옵니다.
- `tags`는 음악 페이지의 필터가 됩니다.

## 소개 페이지 · 사이트 소개 문장

`content/profile.json`을 고칩니다. 숫자(게임 수, 기록 수, 평균 별점, 누적 시간, 별점 분포, 태그)는 기록에서 자동으로 계산됩니다.

- `tagline` — 사이트를 한 문장으로. 홈 제목 아래, 첫 화면 인트로, 검색엔진 설명에 한꺼번에 쓰입니다.
- `headline` — 소개 페이지의 큰 제목. `\n`으로 줄바꿈, `*이렇게*` 감싸면 파란 강조.
- `bio` · `likes` · `dislikes` · `hardware` — 비워 두면 그 섹션이 사라집니다.
- `favorite` — 가장 좋아하는 게임. `null`이면 섹션이 나오지 않습니다.

```json
"favorite": {
  "game": "hades",
  "reason": "왜 이 게임이 1번인지 두세 문장.",
  "first": "2021",
  "cleared": "3회차",
  "hours": 120
}
```

`game`은 `games.json`의 id(그 게임의 아트가 케이스 표지가 됩니다). 목록에 없는 게임이면 `game` 대신 `"title": "게임 이름"`을 쓰세요.

## 검색

라이브러리와 전체 글 오른쪽 위에 검색창이 있습니다. 키보드 `/`로 바로 이동합니다.
라이브러리는 게임 이름과 별칭을, 전체 글은 제목·본문 전체·게임 이름과 별칭·태그를 찾습니다. 띄어쓰기와 대소문자는 무시합니다.

## 설정 (방문자별)

상단 바 오른쪽 끝의 '설정'. 이 브라우저의 localStorage에만 저장됩니다.

- **카트리지 자동으로 꽂기** — 삽입 화면의 체크박스와 같은 값
- **첫 화면 인트로** — 처음만 / 끄기. 주소 끝에 `?intro`를 붙이면 언제든 다시 볼 수 있습니다.
- **화면 테마** — 준비 중

## 샘플 데이터

`"sample": true`가 붙은 항목은 프로토타입용 가상 데이터입니다. 실제 기록이 쌓이면
`content/*.json`에서 그 항목들을, `posts/`에서 해당 폴더(so, nw, pr, ch, lb)를 지우면 됩니다.

## 로컬에서 보기

```bash
python scripts/build.py
python -m http.server -d _site
```
→ http://localhost:8000

`index.html`을 더블클릭해서 열면 데이터를 불러오지 못합니다(브라우저 보안 정책).
빌드가 실패하면 어느 파일의 무엇이 문제인지 알려줍니다.

## 배포

`main`에 push하면 GitHub Actions가 빌드해서 GitHub Pages에 올립니다.
처음 한 번만 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
