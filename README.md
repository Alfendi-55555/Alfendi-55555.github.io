# PLAYLOG — 수의 플레이 기록

끝까지 한 게임과, 끝내지 못한 게임에 대해 씁니다.

## 폴더 구조

```
index.html            화면 뼈대 (마크업만)
css/                  스타일. index.html의 <link> 순서가 곧 우선순위
  skins/              게임별 스킨 (base / playlog / metaphor)
js/app.js             화면 동작. 데이터는 data/site.json에서 읽는다
assets/               사이트 공용 이미지 (아바타, 게임 아트)
content/
  games.json          카트리지(글이 있는 게임) 목록과 순서
  reviews.json        한줄 리뷰만 있는 게임
  guestbook.json      방명록 (임시 — 나중에 댓글 서비스로 교체 예정)
posts/<게임id>/<날짜-제목>/
  index.md            글 본문
  01.jpg …            그 글에 들어가는 이미지
scripts/build.py      content + posts → _site/ 로 조립
.github/workflows/    main에 push하면 자동 빌드·배포
```

## 글 쓰기

`posts/<게임id>/` 아래에 폴더를 하나 만들고 `index.md`를 넣는다.
폴더 이름은 `2026-10-01-boss-rush`처럼 날짜로 시작하면 정리가 편하다.

```markdown
---
title: 글 제목
date: 2026-10-01
tags: [로그라이크, 클리어기록]
cover: ./01.jpg        # 선택. 목록 썸네일과 글 상단 배경
progress: 0            # 선택. 목록에 표시되는 진행도(%)
draft: true            # 선택. true면 사이트에 안 나온다
---

첫 문단.
줄을 그냥 바꾸면 같은 문단 안에서 줄바꿈이 된다.

빈 줄을 넣으면 새 문단.

![이미지 캡션](./01.jpg)

![](./02.jpg)
```

- 이미지는 **한 줄에 하나씩**, 앞뒤로 빈 줄을 둔다. 캡션이 없으면 `![]`.
- 읽는 시간은 본문 길이로 자동 계산된다.
- 같은 게임의 글은 날짜 최신순으로 정렬된다.
- 아직 굵게·링크 같은 인라인 문법은 화면에 반영되지 않는다(글자 그대로 보임).

## 게임 추가

1. `content/games.json`에 항목 추가 (배열 순서 = 홈에 나오는 순서)
   ```json
   { "id": "celeste", "name": "Celeste", "skin": "base", "color": "#B8567A",
     "art": "assets/games/celeste/art.jpg" }
   ```
   이미지가 없으면 `"art"` 대신 `"gradient": "linear-gradient(...)"`.
2. `posts/celeste/` 폴더를 만들고 글을 넣는다.

`"sample": true`가 붙은 항목은 프로토타입용 가상 데이터다. 실제 기록이 쌓이면
`content/*.json`에서 그 항목들을, `posts/`에서 해당 폴더(so, nw, pr, ch, lb)를 지우면 된다.

## 로컬에서 보기

```bash
python scripts/build.py
python -m http.server -d _site
```
→ http://localhost:8000

`index.html`을 더블클릭해서 열면 데이터를 불러오지 못한다(브라우저 보안 정책).
빌드가 실패하면 어느 파일 몇 번째 줄이 문제인지 알려준다.

## 배포

`main`에 push하면 GitHub Actions가 빌드해서 GitHub Pages에 올린다.
처음 한 번만 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꾼다
