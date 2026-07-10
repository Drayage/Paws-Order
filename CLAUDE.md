# Paws-Order — 동물 테마 협동 숫자 카드게임

바닐라 JS. 파스텔 동물 테마, Firebase 온라인 멀티, PWA, GitHub Pages 배포.

## 파일 지도

- `js/game.js`, `js/rules.js` — 게임 로직/규칙 (퀵 모드 포함)
- `js/deck.js`, `js/constants.js` — 카드/상수 정의
- `js/ui.js` — 렌더 / `js/ai.js` — AI 상대
- `js/net.js`, `js/firebase-config.js`, `js/signals.js` — 온라인
- `js/storage.js` — 새로고침 복원 / `js/sound.js` — 프로시저럴 오디오
- `service-worker.js` — PWA 캐시. **storage.js처럼 새 js 파일을 추가하면
  앱 셸 목록에도 추가할 것** (누락 전례 있음).

## 규칙

- Firebase 규칙은 `games/` 아래 중첩 구조 — 새 경로는 반드시 그 안에 넣을 것
  (병렬 추가 → permission-denied 전례).
- SW/캐시/배포/모바일: webgame-ship 스킬 참조.
- 온라인(방/동기화/규칙): firebase-online 스킬 참조.
