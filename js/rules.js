// 순수 규칙 판정 함수 — 상태를 변경하지 않고 가능/불가능만 판단
import { MODES, PERSISTENT_SPECIALS } from './constants.js';

export function topCard(pile) {
  return pile.cards.length ? pile.cards[pile.cards.length - 1] : null;
}

// 방향 비교에 쓰는 현재 값 (맨 위가 숫자 카드가 아니면 null)
export function topValue(pile) {
  const top = topCard(pile);
  if (!top) return pile.base;
  return top.type === 'number' ? top.value : null;
}

// 지속형 익스트림 효과: 어떤 더미든 맨 위에 있으면 활성
export function activeEffects(state) {
  const effects = new Set();
  if (state.mode !== MODES.NORMAL || !state.options.extreme) return effects;
  for (const pile of state.piles) {
    const top = topCard(pile);
    if (top && top.special && PERSISTENT_SPECIALS.includes(top.special)) {
      effects.add(top.special);
    }
  }
  return effects;
}

export function playerById(state, playerId) {
  return state.players.find((p) => p.id === playerId);
}

export function playerDeck(state, playerId) {
  return state.mode === MODES.FTF ? state.decks[playerId] : state.decks.shared;
}

// 로그/UI에 쓰는 짧은 더미 이름 (예: "⬆️A", "토토의 ⬇️")
export function pileShortLabel(state, pile) {
  const arrow = pile.dir === 'up' ? '⬆️' : '⬇️';
  if (pile.owner) {
    const owner = playerById(state, pile.owner);
    return `${owner ? owner.name : '?'}의 ${arrow}`;
  }
  const sameDir = state.piles.filter((p) => p.dir === pile.dir);
  if (sameDir.length <= 1) return arrow;
  const idx = sameDir.indexOf(pile);
  return `${arrow}${String.fromCharCode(65 + idx)}`;
}

// 카드 1장을 특정 더미에 놓을 수 있는가 → { ok, kind } / { ok:false, why }
export function canPlace(state, playerId, card, pile) {
  const no = (why) => ({ ok: false, why });
  const turn = state.turn;
  const effects = activeEffects(state);

  // 3! 명령: 이번 턴 정확히 3장 → 3장 초과 배치 금지
  if (turn.exactThree && turn.plays.length >= 3) return no('이번 차례엔 정확히 3장만 낼 수 있어요');
  // 3! 카드 자체를 4번째 이후로 내는 것도 금지 (정확히 3장이 불가능해짐)
  if (card.special === 'three' && turn.plays.length >= 3) return no('셋 세기 카드는 3장 안에 내야 해요');

  // 한 더미에만: 이미 사용한 더미 외 배치 금지
  if (effects.has('onePile') && turn.pilesUsed.length && !turn.pilesUsed.includes(pile.id)) {
    return no('외골수 두더지 발동 중! 이번 차례엔 한 더미에만 낼 수 있어요');
  }

  const top = topCard(pile);
  const isDonation = state.mode === MODES.FTF && pile.owner !== playerId;

  if (isDonation) {
    if (turn.donated) return no('선물은 한 차례에 1장만 줄 수 있어요');
    const value = topValue(pile);
    if (card.type !== 'number') return no('선물은 숫자 카드만 가능해요');
    const helpful = pile.dir === 'up' ? card.value < value : card.value > value;
    return helpful ? { ok: true, kind: 'donate' } : no('상대에게 유리한 카드만 선물할 수 있어요');
  }

  // 조커: 어떤 더미든 배치 가능 (같은 턴에 숫자로 덮어야 함)
  if (card.type === 'joker') return { ok: true, kind: 'jokerAny' };

  // 레인지 카드: 맨 위 숫자(또는 시작 경계값)가 범위 안일 때 덮기 가능
  if (card.type === 'range') {
    const value = topValue(pile);
    if (value === null) return no('레인지 카드는 숫자 위에만 놓을 수 있어요');
    return value >= card.lo && value <= card.hi
      ? { ok: true, kind: 'rangeCover' }
      : no('이 더미의 숫자가 레인지 범위 밖이에요');
  }

  // 이하 숫자 카드 배치
  if (top && top.type === 'joker') {
    // 조커 위엔 어떤 숫자든 OK (만능 리셋)
    return { ok: true, kind: 'onJoker' };
  }
  if (top && top.type === 'range') {
    // 레인지 위엔 범위 안 숫자만, 방향/되돌리기 무시
    return card.value >= top.lo && card.value <= top.hi
      ? { ok: true, kind: 'onRange' }
      : no('레인지 범위 안의 숫자만 놓을 수 있어요');
  }

  const value = topValue(pile);

  // 퀵 앤 이지: 색상 일치 시 대소 무시
  if (state.mode === MODES.QUICK && top && top.color === card.color) {
    return { ok: true, kind: 'color' };
  }

  if (pile.dir === 'up') {
    if (card.value > value) return { ok: true, kind: 'asc' };
    if (state.mode !== MODES.QUICK && card.value === value - 10 && !effects.has('noBackwards')) {
      return { ok: true, kind: 'trick' };
    }
  } else {
    if (card.value < value) return { ok: true, kind: 'desc' };
    if (state.mode !== MODES.QUICK && card.value === value + 10 && !effects.has('noBackwards')) {
      return { ok: true, kind: 'trick' };
    }
  }
  return no(pile.dir === 'up' ? '더 큰 숫자(또는 -10)만 낼 수 있어요' : '더 작은 숫자(또는 +10)만 낼 수 있어요');
}

// 현재 플레이어의 모든 합법 수
export function legalMoves(state, playerId) {
  const player = playerById(state, playerId);
  const moves = [];
  for (const card of player.hand) {
    for (const pile of state.piles) {
      const res = canPlace(state, playerId, card, pile);
      if (res.ok) moves.push({ card, pile, kind: res.kind });
    }
  }
  return moves;
}

// 이번 턴 최소 제출 장수 (손패보다 클 수 없음)
export function minPlaysRequired(state, playerId) {
  const player = playerById(state, playerId);
  const inHand = player.hand.length;
  const played = state.turn.plays.length;
  let base;
  if (state.mode === MODES.QUICK) base = 1;
  else if (state.mode === MODES.FTF) base = 2;
  else base = playerDeck(state, playerId).length > 0 ? 2 : 1;
  if (state.turn.exactThree) base = Math.max(base, 3);
  return Math.min(base, played + inHand);
}

// 지금 차례를 마칠 수 있는가
// (3!의 '정확히 3장'은 canPlace가 3장 초과를 막으므로 최소 장수 확인으로 충분)
export function canEndTurn(state) {
  const turn = state.turn;
  const required = minPlaysRequired(state, state.players[state.current].id);
  if (turn.plays.length < required) {
    return { ok: false, why: turn.exactThree ? '정확히 3장을 내야 해요' : `최소 ${required}장을 내야 해요` };
  }
  if (turn.mustCover.length) return { ok: false, why: '잠든 사자/조커를 먼저 덮어야 해요' };
  return { ok: true };
}

// 데드락: 차례를 마칠 수도, 카드를 낼 수도 없음
export function isDeadlock(state) {
  const playerId = state.players[state.current].id;
  if (canEndTurn(state).ok) return false;
  return legalMoves(state, playerId).length === 0;
}

// 협력 모드 승리: 덱과 모든 손패 소진
export function isCoopWin(state) {
  if (state.mode === MODES.FTF) return false;
  return state.decks.shared.length === 0 && state.players.every((p) => p.hand.length === 0);
}

// FTF 승리: 개인 덱 + 손패 소진
export function isFtfWinner(state, playerId) {
  if (state.mode !== MODES.FTF) return false;
  return state.decks[playerId].length === 0 && playerById(state, playerId).hand.length === 0;
}
