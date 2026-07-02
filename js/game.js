// 게임 상태 머신 — 생성/카드 배치/차례 종료/승패 판정 (직렬화 가능한 순수 데이터 상태)
import { MODES, normalHandSize, QUICK_HAND_SIZE, FTF_HAND_SIZE, SPECIAL_INFO } from './constants.js';
import { buildSetup, makeRng } from './deck.js';
import {
  canPlace, canEndTurn, legalMoves, minPlaysRequired, isDeadlock,
  isCoopWin, isFtfWinner, playerById, playerDeck, activeEffects, topCard, pileShortLabel,
} from './rules.js';

function cardDisplay(card) {
  if (card.type === 'joker') return '🐼';
  if (card.type === 'range') return `${card.lo}-${card.hi}`;
  return String(card.value);
}

const KIND_TAG = { trick: ' 🔄', color: ' 🎨', donate: ' 🎁' };

function freshTurn() {
  return { plays: [], pilesUsed: [], donated: false, exactThree: false, mustCover: [] };
}

function draw(state, playerId, count) {
  const deck = playerDeck(state, playerId);
  const player = playerById(state, playerId);
  const drawn = deck.splice(Math.max(0, deck.length - count), count);
  player.hand.push(...drawn.reverse());
  return drawn.length;
}

export function createGame({ mode, options = {}, players, seed }) {
  const rng = seed != null ? makeRng(seed) : Math.random;
  const playerIds = players.map((p) => p.id);
  const { decks, piles } = buildSetup(mode, options, playerIds, rng);

  let handSize;
  if (mode === MODES.QUICK) handSize = QUICK_HAND_SIZE;
  else if (mode === MODES.FTF) handSize = FTF_HAND_SIZE;
  else handSize = normalHandSize(players.length);

  const state = {
    mode,
    options: { extreme: false, fire: false, joker: false, range: false, ...options },
    decks,
    piles,
    players: players.map((p) => ({ ...p, hand: [] })),
    handSize,
    current: 0,
    turnCount: 0,
    turn: freshTurn(),
    fires: [],           // [{ pileId, cardId, deadline }]
    phase: 'playing',    // playing | won | lost
    winner: null,        // FTF 승자 playerId
    loseReason: null,
    log: [],
  };

  for (const p of state.players) draw(state, p.id, handSize);

  addLog(state, '🌸 게임 시작! 모두 힘내요!');
  checkTurnStart(state);
  return state;
}

function addLog(state, text) {
  state.log.push(text);
  if (state.log.length > 60) state.log.shift();
}

function lose(state, reason) {
  state.phase = 'lost';
  state.loseReason = reason;
  if (state.mode === MODES.FTF) {
    const opponent = state.players[(state.current + 1) % 2];
    state.winner = opponent.id;
    addLog(state, `😿 ${playerById(state, state.players[state.current].id).name}의 패배… ${opponent.name}의 승리!`);
  } else {
    addLog(state, `😿 ${reason}`);
  }
}

function win(state, playerId = null) {
  state.phase = 'won';
  state.winner = playerId;
  addLog(state, playerId ? `🎉 ${playerById(state, playerId).name}의 완벽한 승리!` : '🎉 모든 카드를 내려놓았어요! 다 함께 승리!');
}

function checkWin(state) {
  if (state.mode === MODES.FTF) {
    const id = state.players[state.current].id;
    if (isFtfWinner(state, id)) { win(state, id); return true; }
    return false;
  }
  if (isCoopWin(state) && state.turn.mustCover.length === 0) { win(state); return true; }
  return false;
}

function checkDeadlock(state) {
  if (state.phase !== 'playing') return false;
  if (isDeadlock(state)) {
    const name = state.players[state.current].name;
    lose(state, state.mode === MODES.FTF
      ? `${name}이(가) 더 이상 카드를 낼 수 없어요`
      : `${name}이(가) 낼 수 있는 카드가 없어요… 다음에 다시 도전!`);
    return true;
  }
  return false;
}

function checkTurnStart(state) {
  if (state.phase !== 'playing') return;
  checkDeadlock(state);
}

// 카드 배치 시도. 성공 시 상태 변경 + true 반환
export function playCard(state, playerId, cardId, pileId) {
  if (state.phase !== 'playing') return { ok: false, why: '게임이 끝났어요' };
  const player = state.players[state.current];
  if (player.id !== playerId) return { ok: false, why: '지금은 내 차례가 아니에요' };
  const card = player.hand.find((c) => c.id === cardId);
  const pile = state.piles.find((p) => p.id === pileId);
  if (!card || !pile) return { ok: false, why: '카드나 더미를 찾을 수 없어요' };

  const res = canPlace(state, playerId, card, pile);
  if (!res.ok) return res;

  // 배치 실행
  player.hand.splice(player.hand.indexOf(card), 1);
  pile.cards.push(card);
  state.turn.plays.push({ cardId, pileId, playerId, kind: res.kind });
  if (!state.turn.pilesUsed.includes(pileId)) state.turn.pilesUsed.push(pileId);
  if (res.kind === 'donate') state.turn.donated = true;
  addLog(state, `${player.name}: ${cardDisplay(card)} → ${pileShortLabel(state, pile)}${KIND_TAG[res.kind] || ''}`);

  // 이 더미의 덮기 요구(사자/조커) 해소 — 조커는 숫자 카드로만 해소
  state.turn.mustCover = state.turn.mustCover.filter((mc) =>
    mc.pileId !== pileId || (mc.needs === 'number' && card.type !== 'number'));
  // 이 더미의 불타는 카드가 덮였으면 진화
  const dousedBread = state.fires.some((f) => f.pileId === pileId);
  state.fires = state.fires.filter((f) => f.pileId !== pileId);
  if (dousedBread) addLog(state, '🍞→😊 화난 식빵을 달랬어요!');

  // 새 카드의 특수 효과 발동
  let forcedEnd = false;
  if (card.type === 'joker') {
    state.turn.mustCover.push({ pileId, needs: 'number' });
    addLog(state, '🐼 조커! 이번 차례에 숫자 카드로 바로 덮어야 해요');
  } else if (card.special) {
    const info = SPECIAL_INFO[card.special];
    addLog(state, `${info.emoji} ${info.label}! ${info.desc}`);
    if (card.special === 'skull') state.turn.mustCover.push({ pileId, needs: 'any' });
    else if (card.special === 'three') state.turn.exactThree = true;
    else if (card.special === 'fire') state.fires.push({ pileId, cardId, deadline: state.turnCount + 1 });
    else if (card.special === 'stop') forcedEnd = true;
  }

  if (checkWin(state)) return { ok: true, kind: res.kind };

  if (forcedEnd) {
    endTurn(state, playerId, { force: true });
    return { ok: true, kind: res.kind, forcedEnd: true };
  }

  checkDeadlock(state);
  return { ok: true, kind: res.kind };
}

// 차례 종료: 보충 → 다음 플레이어 (force는 '멈춰!' 카드 전용)
export function endTurn(state, playerId, { force = false } = {}) {
  if (state.phase !== 'playing') return { ok: false, why: '게임이 끝났어요' };
  const player = state.players[state.current];
  if (player.id !== playerId) return { ok: false, why: '지금은 내 차례가 아니에요' };

  if (!force) {
    const res = canEndTurn(state);
    if (!res.ok) return res;
  } else if (state.turn.mustCover.length) {
    lose(state, '멈춰! 때문에 잠든 사자/조커를 덮지 못했어요…');
    return { ok: true };
  }

  // 화난 식빵 기한 확인 — 놓인 차례(또는 다음 차례)가 끝날 때까지 못 덮으면 패배
  const burnt = state.fires.find((f) => state.turnCount >= f.deadline);
  if (burnt) {
    lose(state, '화난 식빵이 폭발했어요! 🍞💥 제때 덮어주지 못했어요…');
    return { ok: true };
  }

  // 손패 보충
  const effects = activeEffects(state);
  let drawn = 0;
  if (state.mode === MODES.FTF) {
    drawn = state.turn.donated
      ? draw(state, playerId, Math.max(0, state.handSize - player.hand.length))
      : draw(state, playerId, 2);
  } else if (effects.has('drawOne')) {
    drawn = draw(state, playerId, Math.min(1, Math.max(0, state.handSize - player.hand.length)));
    if (drawn === 1) addLog(state, '🌱 아껴 뽑기 발동 중 — 1장만 보충했어요');
  } else {
    drawn = draw(state, playerId, Math.max(0, state.handSize - player.hand.length));
  }

  if (checkWin(state)) return { ok: true };

  // 다음 플레이어로 (손패가 빈 플레이어는 건너뜀 — 협력 모드 종반)
  state.turnCount++;
  state.turn = freshTurn();
  for (let i = 0; i < state.players.length; i++) {
    state.current = (state.current + 1) % state.players.length;
    if (state.players[state.current].hand.length > 0) break;
  }
  addLog(state, `➡️ ${state.players[state.current].name}의 차례!`);

  checkTurnStart(state);
  return { ok: true };
}

// UI/AI 편의용 재노출
export { canPlace, canEndTurn, legalMoves, minPlaysRequired, activeEffects, topCard, pileShortLabel };
