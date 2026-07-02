// 이모지 신호등 — 자유 채팅 없이 정해진 템플릿만 전송 가능 (내 캐릭터를 누르면 뜨는 팝업에서 선택)
import { SIGNALS, JELLY_COLORS, COLOR_INFO } from './constants.js';
import { activeEffects } from './rules.js';

// 현재 모드에서 고를 수 있는 신호 버튼 목록 (색상 신호는 색상별로 펼쳐서 반환)
export function buildSignalButtons(mode) {
  const list = [];
  for (const sig of SIGNALS) {
    if (!sig.modes.includes(mode)) continue;
    if (sig.needsColor) {
      for (const color of JELLY_COLORS) {
        list.push({
          id: sig.id,
          color,
          hex: COLOR_INFO[color].hex,
          label: sig.text.replace('{color}', COLOR_INFO[color].label),
          emojiOnly: false,
        });
      }
    } else {
      list.push({ id: sig.id, label: sig.text, emojiOnly: Boolean(sig.emojiOnly) });
    }
  }
  return list;
}

export function isSignalLocked(state) {
  return activeEffects(state).has('noTalk');
}

export function signalText(signalId, color) {
  const sig = SIGNALS.find((s) => s.id === signalId);
  if (!sig) return '';
  return color ? sig.text.replace('{color}', COLOR_INFO[color].label) : sig.text;
}
