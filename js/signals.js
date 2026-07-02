// 이모지 신호등 — 자유 채팅 없이 정해진 템플릿만 전송 가능
import { SIGNALS, JELLY_COLORS, COLOR_INFO } from './constants.js';
import { activeEffects } from './rules.js';

const $ = (sel) => document.querySelector(sel);

function buildButtonList(mode) {
  const list = [];
  for (const sig of SIGNALS) {
    if (!sig.modes.includes(mode)) continue;
    if (sig.needsColor) {
      for (const color of JELLY_COLORS) {
        list.push({
          id: sig.id,
          color,
          label: `${COLOR_INFO[color].emoji} ${sig.text.replace('{color}', COLOR_INFO[color].label)}`,
        });
      }
    } else {
      list.push({ id: sig.id, label: sig.text });
    }
  }
  return list;
}

export function signalText(signalId, color) {
  const sig = SIGNALS.find((s) => s.id === signalId);
  if (!sig) return '';
  return color ? sig.text.replace('{color}', COLOR_INFO[color].label) : sig.text;
}

// 신호 패널 렌더링. onSend(signalId, color)를 호출해 신호 전송.
export function renderSignalPanel(state, localPlayerId, onSend) {
  const panel = $('#signal-panel');
  panel.innerHTML = '';
  const locked = activeEffects(state).has('noTalk');

  if (locked) {
    const note = document.createElement('div');
    note.className = 'signal-lock-note';
    note.textContent = '🤫 도서관 타임! 지금은 신호를 보낼 수 없어요.';
    panel.appendChild(note);
    return;
  }

  const buttons = buildButtonList(state.mode);
  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.label;
    btn.addEventListener('click', () => onSend(b.id, b.color));
    panel.appendChild(btn);
  });
}
