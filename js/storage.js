// 새로고침해도 게임이 이어지도록 세션을 localStorage에 저장/복원
// 싱글 플레이는 게임 상태 전체를, 멀티 플레이는 방 재접속에 필요한 정보만 저장한다
// (실제 게임 상태는 Firebase에 있으므로 코드/uid만 있으면 재접속 가능)
const KEY = 'pawsOrderSession';
const VERSION = 1;

export function saveSession(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...data }));
  } catch (_) { /* 저장 실패(용량 초과 등)해도 게임 진행에는 영향 없음 */ }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.v !== VERSION) return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch (_) { /* noop */ }
}
