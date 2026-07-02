// 확률형 그리디 AI — 손패×더미 조합에 점수를 매겨 가장 "안전한" 수를 우선 제출
import { MODES } from './constants.js';
import { canPlace, canEndTurn, endTurn, playCard } from './game.js';
import { topValue, minPlaysRequired, playerById } from './rules.js';

// 카드를 놓았을 때의 "소모 간격" — 작을수록 더미를 알뜰하게 씀 (좋은 수)
function gapScore(card, pile, kind) {
  if (kind === 'trick' || kind === 'color') return 100; // 되돌리기/색상 역행은 큰 보너스(막힌 더미를 뚫음)
  if (kind === 'onJoker') return 40; // 조커 위엔 부담 없이 놓을 수 있음
  if (kind === 'jokerAny' || kind === 'rangeCover' || kind === 'onRange') return 20;
  const value = topValue(pile);
  if (value === null || card.type !== 'number') return 10;
  const gap = pile.dir === 'up' ? card.value - value : value - card.value;
  return -gap; // 간격이 좁을수록 점수가 높음(0에 가까움)
}

// 이 수를 두면 얼마나 급한 상황(사자/조커/화난 식빵/3!)을 해소하는지
function urgencyBonus(state, card, pile) {
  let bonus = 0;
  if (state.turn.mustCover.some((mc) => mc.pileId === pile.id)) bonus += 500;
  if (state.fires.some((f) => f.pileId === pile.id)) bonus += 300;
  if (card.special === 'skull' || card.special === 'stop') bonus -= 50; // 급하지 않으면 아껴둠
  return bonus;
}

function scoreMove(state, playerId, card, pile, kind) {
  return gapScore(card, pile, kind) + urgencyBonus(state, card, pile);
}

function allMoves(state, playerId) {
  const player = playerById(state, playerId);
  const moves = [];
  for (const card of player.hand) {
    for (const pile of state.piles) {
      const res = canPlace(state, playerId, card, pile);
      if (res.ok) moves.push({ card, pile, kind: res.kind, score: scoreMove(state, playerId, card, pile, res.kind) });
    }
  }
  return moves.sort((a, b) => b.score - a.score);
}

// FTF: 상대 더미에 기부할 가치가 있는지 판단 (기부하면 손패 6장 풀보충)
function pickFtfDonation(state, playerId) {
  const opponent = state.players.find((p) => p.id !== playerId);
  const player = playerById(state, playerId);
  let best = null;
  for (const card of player.hand) {
    for (const pile of state.piles.filter((p) => p.owner === opponent.id)) {
      const res = canPlace(state, playerId, card, pile);
      if (res.ok && res.kind === 'donate') {
        const score = scoreMove(state, playerId, card, pile, res.kind);
        if (!best || score > best.score) best = { card, pile, kind: res.kind, score };
      }
    }
  }
  return best;
}

// 한 플레이어의 턴 전체를 진행 (모든 필수 배치 + 합리적 추가 배치 + 종료)
export function playAiTurn(state, playerId) {
  const player = playerById(state, playerId);
  if (player.id !== state.players[state.current].id) return;

  // FTF는 손패 관리를 위해 기부를 먼저 고려 (최대 1장)
  if (state.mode === MODES.FTF && !state.turn.donated) {
    const donation = pickFtfDonation(state, playerId);
    if (donation && donation.score > -15) {
      playCard(state, playerId, donation.card.id, donation.pile.id);
    }
  }

  let guard = 0;
  while (state.phase === 'playing' && state.players[state.current].id === playerId && guard++ < 50) {
    const required = minPlaysRequired(state, playerId);
    const moves = allMoves(state, playerId);

    if (moves.length === 0) {
      // 더 낼 수 없음 — 종료 시도 (데드락이면 game.js가 패배 처리)
      const endRes = canEndTurn(state);
      if (endRes.ok) endTurn(state, playerId);
      else endTurn(state, playerId, { force: false }); // 실패해도 상태는 game.js의 checkDeadlock이 이미 처리
      break;
    }

    const needMore = state.turn.plays.length < required || state.turn.mustCover.length > 0;
    const best = moves[0];
    // 필수 요건을 채웠다면, 점수가 충분히 좋을 때만 추가 배치(손패를 아낌)
    if (!needMore && best.score < 30) {
      const endRes = canEndTurn(state);
      if (endRes.ok) { endTurn(state, playerId); break; }
    }

    playCard(state, playerId, best.card.id, best.pile.id);

    if (state.phase !== 'playing') break;
    if (state.players[state.current].id !== playerId) break; // stop 카드 등으로 턴이 넘어감
    const endRes = canEndTurn(state);
    if (!needMore && endRes.ok && allMoves(state, playerId)[0]?.score < 30) {
      endTurn(state, playerId);
      break;
    }
  }
}
