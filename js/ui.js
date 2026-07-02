// 렌더링 전담 모듈 — DOM 갱신만 담당, 게임 로직은 건드리지 않음
import { MODES, SPECIAL_INFO, COLOR_INFO, ANIMAL_AVATARS } from './constants.js';
import { canPlace, minPlaysRequired, canEndTurn, activeEffects } from './rules.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function avatarFor(index) {
  return ANIMAL_AVATARS[index % ANIMAL_AVATARS.length];
}

function cardLabel(card) {
  if (card.type === 'joker') return '🐼';
  if (card.type === 'range') return `${card.lo}-${card.hi}`;
  return String(card.value);
}

function renderCardEl(card, { selected = false, onClick = null } = {}) {
  const el = document.createElement('div');
  el.className = `game-card type-${card.type}` + (selected ? ' selected' : '');
  if (card.color) el.style.boxShadow = `0 0 0 3px ${COLOR_INFO[card.color].hex} inset`;
  el.textContent = cardLabel(card);
  if (card.special) {
    const badge = document.createElement('span');
    badge.className = 'special-emoji';
    badge.textContent = SPECIAL_INFO[card.special].emoji;
    el.appendChild(badge);
  }
  if (onClick) el.addEventListener('click', onClick);
  el.title = card.special ? `${SPECIAL_INFO[card.special].label} — ${SPECIAL_INFO[card.special].desc}` : '';
  return el;
}

function pileTopLabel(pile) {
  if (!pile.cards.length) return { text: pile.dir === 'up' ? `시작 ${pile.base}` : `시작 ${pile.base}`, empty: true };
  const top = pile.cards[pile.cards.length - 1];
  if (top.type === 'joker') return { text: '🐼', empty: false };
  if (top.type === 'range') return { text: `${top.lo}-${top.hi}`, empty: false };
  return { text: String(top.value), empty: false, special: top.special, color: top.color };
}

function renderPile(state, pile, ctx) {
  const el = document.createElement('div');
  el.className = `pile ${pile.dir}`;
  const localPlayer = state.players.find((p) => p.id === ctx.localPlayerId);
  const isMyTurn = state.players[state.current].id === ctx.localPlayerId;
  let selectable = false;
  if (isMyTurn && ctx.selectedCardId) {
    const card = localPlayer.hand.find((c) => c.id === ctx.selectedCardId);
    if (card) {
      const res = canPlace(state, ctx.localPlayerId, card, pile);
      selectable = res.ok;
    }
  }
  if (selectable) el.classList.add('selectable');

  const label = document.createElement('div');
  label.className = 'pile-label';
  label.textContent = pile.label;
  el.appendChild(label);

  if (pile.owner) {
    const owner = document.createElement('div');
    owner.className = 'pile-owner';
    const ownerPlayer = state.players.find((p) => p.id === pile.owner);
    owner.textContent = pile.owner === ctx.localPlayerId ? '(내 더미)' : `(${ownerPlayer?.name ?? '상대'} 더미)`;
    el.appendChild(owner);
  }

  const top = pileTopLabel(pile);
  const topEl = document.createElement('div');
  topEl.className = 'pile-top' + (top.empty ? ' empty' : '');
  topEl.textContent = top.text;
  if (top.color) topEl.style.boxShadow = `0 0 0 3px ${COLOR_INFO[top.color].hex} inset`;
  if (top.special) {
    const badge = document.createElement('span');
    badge.className = 'pile-badge';
    badge.textContent = SPECIAL_INFO[top.special].emoji;
    topEl.appendChild(badge);
  }
  el.appendChild(topEl);

  const count = document.createElement('div');
  count.className = 'pile-count';
  count.textContent = `${pile.cards.length}장 놓임`;
  el.appendChild(count);

  if (state.fires.some((f) => f.pileId === pile.id)) {
    const warn = document.createElement('div');
    warn.className = 'fire-warning';
    warn.textContent = '🍞 곧 화나요! 덮어주세요';
    el.appendChild(warn);
  }
  if (state.turn.mustCover.some((mc) => mc.pileId === pile.id)) {
    const warn = document.createElement('div');
    warn.className = 'fire-warning';
    warn.textContent = '⚠️ 지금 덮어야 해요';
    el.appendChild(warn);
  }

  if (selectable) el.addEventListener('click', () => ctx.onPlayToPile(pile.id));
  return el;
}

function renderPilesArea(state, ctx) {
  const wrap = $('#piles-area-wrap');
  wrap.innerHTML = '';

  if (state.mode === MODES.FTF) {
    for (const ownerId of [...new Set(state.piles.map((p) => p.owner))]) {
      const ownerPlayer = state.players.find((p) => p.id === ownerId);
      const title = document.createElement('div');
      title.className = 'pile-group-title';
      title.textContent = ownerId === ctx.localPlayerId ? `🧺 내 더미 (${ownerPlayer.name})` : `🧺 ${ownerPlayer.name}의 더미`;
      wrap.appendChild(title);
      const area = document.createElement('div');
      area.className = 'piles-area';
      state.piles.filter((p) => p.owner === ownerId).forEach((pile) => area.appendChild(renderPile(state, pile, ctx)));
      wrap.appendChild(area);
    }
    return;
  }

  const area = document.createElement('div');
  area.className = 'piles-area';
  state.piles.forEach((pile) => area.appendChild(renderPile(state, pile, ctx)));
  wrap.appendChild(area);
}

function renderPlayersStrip(state, ctx, bubbles) {
  const strip = $('#players-strip');
  strip.innerHTML = '';
  state.players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (i === state.current ? ' current' : '');
    chip.dataset.playerId = p.id;
    const avatar = avatarFor(i);
    const av = document.createElement('div');
    av.className = 'avatar';
    av.textContent = avatar.emoji;
    chip.appendChild(av);
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<b>${p.name}${p.id === ctx.localPlayerId ? ' (나)' : ''}</b><span>${p.isAI ? '🤖 AI' : '👤'} 카드 ${p.hand.length}장</span>`;
    chip.appendChild(info);
    const bubbleText = bubbles.get(p.id);
    if (bubbleText) {
      const b = document.createElement('div');
      b.className = 'bubble';
      b.textContent = bubbleText;
      chip.appendChild(b);
    }
    strip.appendChild(chip);
  });
}

function renderHand(state, ctx) {
  const handWrap = $('#hand-cards');
  handWrap.innerHTML = '';
  const player = state.players.find((p) => p.id === ctx.localPlayerId);
  const isMyTurn = state.players[state.current].id === ctx.localPlayerId;
  player.hand.forEach((card) => {
    const el = renderCardEl(card, {
      selected: card.id === ctx.selectedCardId,
      onClick: isMyTurn ? () => ctx.onSelectCard(card.id) : null,
    });
    if (!isMyTurn) el.style.opacity = '0.6';
    handWrap.appendChild(el);
  });
}

function renderTurnInfo(state, ctx) {
  const isMyTurn = state.players[state.current].id === ctx.localPlayerId;
  $('#turn-indicator').textContent = isMyTurn ? '✨ 내 차례!' : `${state.players[state.current].name}의 차례…`;
  const required = minPlaysRequired(state, state.players[state.current].id);
  const played = state.turn.plays.length;
  $('#turn-requirement').textContent = `이번 차례 최소 ${required}장 (${played}/${required})`;

  const endBtn = $('#btn-end-turn');
  const endRes = canEndTurn(state);
  endBtn.disabled = !isMyTurn || !endRes.ok || state.phase !== 'playing';
  endBtn.title = endRes.ok ? '' : endRes.why;
}

function renderLog(state) {
  const panel = $('#log-panel');
  panel.innerHTML = state.log.map((line) => `<div>${line}</div>`).join('');
  panel.scrollTop = panel.scrollHeight;
}

export function renderGame(state, ctx, bubbles = new Map()) {
  $('#deck-counter').textContent =
    state.mode === MODES.FTF
      ? `🗂️ 남은 카드: ${Object.values(state.decks).reduce((a, d) => a + d.length, 0)}`
      : `🗂️ 남은 카드: ${state.decks.shared.length}`;
  renderPlayersStrip(state, ctx, bubbles);
  renderPilesArea(state, ctx);
  renderHand(state, ctx);
  renderTurnInfo(state, ctx);
  renderLog(state);
}

export function localEffects(state) {
  return activeEffects(state);
}
