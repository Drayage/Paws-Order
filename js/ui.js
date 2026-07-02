// 렌더링 전담 모듈 — DOM 갱신만 담당, 게임 로직은 건드리지 않음
import { MODES, SPECIAL_INFO, COLOR_INFO, JELLY_COLORS, ANIMAL_AVATARS, ONE_TIME_SPECIALS, PERSISTENT_SPECIALS } from './constants.js';
import { canPlace, minPlaysRequired, canEndTurn, activeEffects } from './rules.js';

function specialBadgeColor(specialId) {
  if (specialId === 'fire') return '#f2a65a';
  if (ONE_TIME_SPECIALS.includes(specialId)) return '#e8798a';
  if (PERSISTENT_SPECIALS.includes(specialId)) return '#5b9bd9';
  return '#9c8973';
}

const $ = (sel, root = document) => root.querySelector(sel);

export function avatarFor(index) {
  return ANIMAL_AVATARS[index % ANIMAL_AVATARS.length];
}

function cardLabel(card) {
  if (card.type === 'joker') return '🐼';
  if (card.type === 'range') return `${card.lo}-${card.hi}`;
  return String(card.value);
}

// 카드 배경 테마 클래스: 일반 모드=10단위, 퀵앤이지=색상, 페이스투페이스=카드의 원래 소유자 기준
// (FTF에서 상대 더미에 선물해도 카드 색은 낸 사람 색을 유지)
function cardThemeClass(card, mode, localPlayerId = null) {
  if (card.type !== 'number') return '';
  if (mode === MODES.QUICK) return `jelly-${card.color}`;
  if (mode === MODES.FTF) return card.owner === localPlayerId ? 'owner-mine' : 'owner-theirs';
  return `decade-${Math.min(9, Math.floor(card.value / 10))}`;
}

export function renderCardEl(card, { selected = false, onClick = null, themeClass = '', trickIcon = null, playable = null } = {}) {
  const el = document.createElement('div');
  let cls = `game-card type-${card.type}${themeClass ? ' ' + themeClass : ''}`;
  if (selected) cls += ' selected';
  if (playable === true) cls += ' playable';
  if (playable === false) cls += ' not-playable';
  el.className = cls;
  const inner = document.createElement('span');
  inner.className = 'value-inner';
  inner.textContent = cardLabel(card);
  el.appendChild(inner);
  const titleParts = [];
  if (card.special) {
    const badge = document.createElement('span');
    badge.className = 'special-emoji';
    badge.textContent = SPECIAL_INFO[card.special].emoji;
    badge.style.background = specialBadgeColor(card.special);
    el.appendChild(badge);
    titleParts.push(`${SPECIAL_INFO[card.special].label} — ${SPECIAL_INFO[card.special].desc}`);
  }
  if (trickIcon) {
    const tb = document.createElement('span');
    tb.className = 'trick-badge';
    tb.textContent = trickIcon;
    el.appendChild(tb);
    titleParts.push(trickIcon === '🎨' ? '색상이 같아서 순서 무시하고 낼 수 있어요' : '되돌리기(±10) 트릭으로 낼 수 있어요');
  }
  const paw = document.createElement('span');
  paw.className = 'paw-mark';
  paw.textContent = '🐾';
  el.appendChild(paw);
  if (onClick) el.addEventListener('click', onClick);
  el.title = titleParts.join('\n');
  return el;
}

function renderPile(state, pile, ctx) {
  const el = document.createElement('div');
  const isFtf = state.mode === MODES.FTF;
  const isMineDir = isFtf ? pile.owner === ctx.localPlayerId : null;
  el.className = `pile ${pile.dir}` + (isFtf ? (isMineDir ? ' mine' : ' theirs') : '');

  const localPlayer = state.players.find((p) => p.id === ctx.localPlayerId);
  const isMyTurn = state.players[state.current].id === ctx.localPlayerId;
  let selectable = false;
  if (isMyTurn && ctx.selectedCardId) {
    const card = localPlayer.hand.find((c) => c.id === ctx.selectedCardId);
    if (card) selectable = canPlace(state, ctx.localPlayerId, card, pile).ok;
  }
  if (selectable) el.classList.add('selectable');

  const arrow = document.createElement('div');
  arrow.className = 'pile-arrow';
  arrow.textContent = pile.dir === 'up' ? '⬆️' : '⬇️';
  arrow.title = pile.label;
  el.appendChild(arrow);

  if (pile.owner) {
    const owner = document.createElement('div');
    owner.className = 'pile-owner';
    const ownerPlayer = state.players.find((p) => p.id === pile.owner);
    owner.textContent = isMineDir ? '내 더미' : (ownerPlayer?.name ?? '상대');
    el.appendChild(owner);
  }

  const topCardData = pile.cards.length ? pile.cards[pile.cards.length - 1] : null;
  let topEl;
  if (topCardData) {
    const theme = cardThemeClass(topCardData, state.mode, ctx.localPlayerId);
    topEl = renderCardEl(topCardData, { themeClass: theme });
    topEl.classList.add('pile-top');
    // 방금 낸 카드 강조 + 놓일 때 팡! 이펙트
    if (state.lastPlay && state.lastPlay.cardId === topCardData.id) {
      topEl.classList.add('last-played');
      if (Date.now() - state.lastPlay.ts < 1200) topEl.classList.add('just-placed');
    }
  } else {
    topEl = document.createElement('div');
    topEl.className = 'pile-top empty';
    topEl.textContent = `시작 ${pile.base}`;
  }
  el.appendChild(topEl);

  const count = document.createElement('div');
  count.className = 'pile-count';
  count.textContent = `${pile.cards.length}장`;
  el.appendChild(count);

  if (state.fires.some((f) => f.pileId === pile.id)) {
    const warn = document.createElement('div');
    warn.className = 'fire-warning';
    warn.textContent = '🍞 곧 화나요!';
    el.appendChild(warn);
  }
  if (state.turn.mustCover.some((mc) => mc.pileId === pile.id)) {
    const warn = document.createElement('div');
    warn.className = 'fire-warning';
    warn.textContent = '⚠️ 덮어야 해요';
    el.appendChild(warn);
  }

  const inspect = document.createElement('button');
  inspect.type = 'button';
  inspect.className = 'pile-inspect';
  inspect.textContent = '🔍';
  inspect.title = '이 더미에 놓인 카드 보기';
  inspect.addEventListener('click', (e) => { e.stopPropagation(); ctx.onInspectPile(pile.id); });
  el.appendChild(inspect);

  if (ctx.focusPileId === pile.id) el.classList.add('focused');

  if (selectable) {
    el.addEventListener('click', () => ctx.onPlayToPile(pile.id));
  } else {
    // 카드를 고르지 않은 상태에서 더미를 누르면, 이 더미에 낼 수 있는 손패 카드를 강조
    el.addEventListener('click', () => ctx.onTogglePileFocus(pile.id));
  }
  return el;
}

function renderPilesArea(state, ctx) {
  const wrap = $('#piles-area-wrap');
  wrap.innerHTML = '';

  if (state.mode === MODES.FTF) {
    wrap.classList.add('ftf-wrap');
    const ownerIds = [...new Set(state.piles.map((p) => p.owner))];
    for (const ownerId of ownerIds) {
      const ownerPlayer = state.players.find((p) => p.id === ownerId);
      const isMine = ownerId === ctx.localPlayerId;
      const group = document.createElement('div');
      group.className = 'pile-group ' + (isMine ? 'mine' : 'theirs');
      const title = document.createElement('div');
      title.className = 'pile-group-title';
      title.textContent = isMine ? '🧺 내 더미' : `🧺 ${ownerPlayer?.name ?? '상대'}의 더미`;
      group.appendChild(title);
      const area = document.createElement('div');
      area.className = 'piles-area';
      state.piles.filter((p) => p.owner === ownerId).forEach((pile) => area.appendChild(renderPile(state, pile, ctx)));
      group.appendChild(area);
      wrap.appendChild(group);
    }
    return;
  }

  wrap.classList.remove('ftf-wrap');
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
    const isLocal = p.id === ctx.localPlayerId;
    chip.className = 'player-chip' + (i === state.current ? ' current' : '') + (isLocal ? ' clickable' : '');
    chip.dataset.playerId = p.id;
    const avatar = avatarFor(i);
    const av = document.createElement('div');
    av.className = 'avatar';
    av.textContent = avatar.emoji;
    chip.appendChild(av);
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `<b>${p.name}${isLocal ? ' (나)' : ''}</b><span>${p.isAI ? '🤖 AI' : '👤'} 카드 ${p.hand.length}장</span>`;
    chip.appendChild(info);
    if (bubbles.get(p.id)) chip.classList.add('speaking');
    if (isLocal) chip.addEventListener('click', () => ctx.onAvatarClick());
    strip.appendChild(chip);
  });
}

// 손패 정렬: draw(뽑은 순) | asc(오름차순) | color(색깔별, 퀵앤이지)
function sortHand(hand, sortMode) {
  if (sortMode === 'draw') return hand;
  const typeRank = (c) => (c.type === 'number' ? 0 : c.type === 'range' ? 1 : 2);
  const sorted = [...hand];
  if (sortMode === 'color') {
    sorted.sort((a, b) => typeRank(a) - typeRank(b)
      || JELLY_COLORS.indexOf(a.color) - JELLY_COLORS.indexOf(b.color)
      || (a.value ?? 0) - (b.value ?? 0));
  } else {
    sorted.sort((a, b) => typeRank(a) - typeRank(b)
      || (a.value ?? a.lo ?? 0) - (b.value ?? b.lo ?? 0)
      || JELLY_COLORS.indexOf(a.color) - JELLY_COLORS.indexOf(b.color));
  }
  return sorted;
}

function renderSortButtons(state, ctx) {
  const wrap = $('#sort-buttons');
  wrap.innerHTML = '';
  const options = [
    { id: 'draw', label: '🃏 뽑은 순' },
    { id: 'asc', label: '🔢 오름차순' },
  ];
  if (state.mode === MODES.QUICK) options.push({ id: 'color', label: '🎨 색깔별' });
  options.forEach((o) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-btn' + (ctx.handSort === o.id ? ' active' : '');
    btn.textContent = o.label;
    btn.addEventListener('click', () => ctx.onSetSort(o.id));
    wrap.appendChild(btn);
  });
}

function renderHand(state, ctx) {
  const handWrap = $('#hand-cards');
  handWrap.innerHTML = '';
  const player = state.players.find((p) => p.id === ctx.localPlayerId);
  const isMyTurn = state.players[state.current].id === ctx.localPlayerId;
  const focusPile = ctx.focusPileId ? state.piles.find((p) => p.id === ctx.focusPileId) : null;
  sortHand(player.hand, ctx.handSort).forEach((card) => {
    const theme = cardThemeClass(card, state.mode, ctx.localPlayerId);
    let playable = null;
    let trickIcon = null;
    if (isMyTurn && state.phase === 'playing') {
      playable = false;
      for (const pile of state.piles) {
        const res = canPlace(state, ctx.localPlayerId, card, pile);
        if (res.ok) {
          playable = true;
          if (res.kind === 'trick') trickIcon = '🔄';
          else if (res.kind === 'color' && !trickIcon) trickIcon = '🎨';
        }
      }
    }
    const el = renderCardEl(card, {
      selected: card.id === ctx.selectedCardId,
      onClick: isMyTurn ? () => ctx.onSelectCard(card.id) : null,
      themeClass: theme,
      playable,
      trickIcon,
    });
    // 더미를 눌러둔 상태면, 그 더미에 낼 수 있는 카드만 도드라지게
    if (focusPile) {
      const fits = canPlace(state, ctx.localPlayerId, card, focusPile).ok;
      el.classList.toggle('pile-match', fits);
      el.classList.toggle('pile-mismatch', !fits);
    }
    if (ctx.drawnIds && ctx.drawnIds.has(card.id)) el.classList.add('drawn');
    if (!isMyTurn) el.style.opacity = '0.6';
    handWrap.appendChild(el);
  });
}

function renderDeckCounters(state, ctx) {
  const wrap = $('#deck-counters');
  wrap.innerHTML = '';
  if (state.mode === MODES.FTF) {
    for (const pid of Object.keys(state.decks)) {
      const player = state.players.find((p) => p.id === pid);
      const isMine = pid === ctx.localPlayerId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck-counter';
      btn.textContent = `🗂️ ${isMine ? '내' : (player?.name ?? '상대')} 덱 ${state.decks[pid].length}`;
      btn.addEventListener('click', () => ctx.onInspectDeck(pid));
      wrap.appendChild(btn);
    }
    return;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'deck-counter';
  btn.textContent = `🗂️ 남은 카드 ${state.decks.shared.length}`;
  btn.addEventListener('click', () => ctx.onInspectDeck('shared'));
  wrap.appendChild(btn);
}

function renderTurnInfo(state, ctx) {
  const isMyTurn = state.players[state.current].id === ctx.localPlayerId;
  $('#turn-indicator').textContent = isMyTurn ? '✨ 내 차례!' : `${state.players[state.current].name}의 차례…`;
  const required = minPlaysRequired(state, state.players[state.current].id);
  const played = state.turn.plays.length;
  $('#turn-requirement').textContent = `이번 차례 최소 ${required}장 (${played}/${required})`;

  const endBtn = $('#btn-end-turn');
  const endRes = canEndTurn(state);
  const ready = isMyTurn && endRes.ok && state.phase === 'playing';
  endBtn.disabled = !isMyTurn || !endRes.ok || state.phase !== 'playing';
  endBtn.classList.toggle('ready', ready);
  endBtn.title = endRes.ok ? '' : endRes.why;
}

function renderLog(state) {
  const panel = $('#log-panel');
  panel.innerHTML = state.log.map((line) => `<div>${line}</div>`).join('');
  panel.scrollTop = panel.scrollHeight;
}

// 말풍선 토스트 — 플레이어 칩에 붙이면 UI에 가려지므로 화면 상단 고정 레이어에 표시
function renderBubbleToasts(state, ctx, bubbles) {
  const wrap = $('#bubble-toasts');
  wrap.innerHTML = '';
  for (const [playerId, text] of bubbles) {
    const idx = state.players.findIndex((p) => p.id === playerId);
    if (idx === -1) continue;
    const player = state.players[idx];
    const toast = document.createElement('div');
    toast.className = 'bubble-toast';
    toast.innerHTML = `<span class="toast-avatar">${avatarFor(idx).emoji}</span><b>${player.name}</b><span class="toast-text"></span>`;
    toast.querySelector('.toast-text').textContent = text;
    wrap.appendChild(toast);
  }
}

export function renderGame(state, ctx, bubbles = new Map()) {
  renderDeckCounters(state, ctx);
  renderPlayersStrip(state, ctx, bubbles);
  renderBubbleToasts(state, ctx, bubbles);
  renderPilesArea(state, ctx);
  renderSortButtons(state, ctx);
  renderHand(state, ctx);
  renderTurnInfo(state, ctx);
  renderLog(state);
}

export function localEffects(state) {
  return activeEffects(state);
}

// ---------- 모달 ----------
export function openModal(title, bodyEl) {
  $('#modal-title').textContent = title;
  const body = $('#modal-body');
  body.innerHTML = '';
  body.appendChild(bodyEl);
  $('#modal-backdrop').classList.add('active');
}

export function closeModal() {
  $('#modal-backdrop').classList.remove('active');
}

// 더미에 놓인 카드 히스토리
export function buildPileHistoryBody(state, pileId, localPlayerId) {
  const pile = state.piles.find((p) => p.id === pileId);
  const wrap = document.createElement('div');
  if (!pile.cards.length) {
    wrap.innerHTML = '<div class="pile-history-empty">아직 놓인 카드가 없어요.</div>';
    return wrap;
  }
  const row = document.createElement('div');
  row.className = 'pile-history-row';
  pile.cards.forEach((card) => {
    const theme = cardThemeClass(card, state.mode, localPlayerId);
    row.appendChild(renderCardEl(card, { themeClass: theme }));
  });
  wrap.appendChild(row);
  return wrap;
}

// 필드에 아직 공개되지 않은 카드 (전체 구성 − 필드에 놓인 카드 = 덱 + 모든 손패)
// 손패까지 합쳐서 보여주므로 특정 플레이어의 카드를 유추할 수 없음
export function buildDeckModalBody(state, deckKey, localPlayerId) {
  const wrap = document.createElement('div');

  const fieldIds = new Set();
  for (const pile of state.piles) for (const c of pile.cards) fieldIds.add(c.id);

  const catalog = state.catalog?.[deckKey] || state.catalog?.shared || [];
  const cards = catalog.filter((c) => !fieldIds.has(c.id));

  const note = document.createElement('div');
  note.className = 'deck-list-title';
  note.style.marginBottom = '8px';
  note.textContent = state.mode === MODES.FTF
    ? '덱과 손패를 합쳐 보여줘요 (손패 유추 불가)'
    : '덱과 모든 친구들의 손패를 합쳐 보여줘요 (손패 유추 불가)';
  wrap.appendChild(note);

  const numberCards = cards.filter((c) => c.type === 'number');
  const jokers = cards.filter((c) => c.type === 'joker');
  const ranges = cards.filter((c) => c.type === 'range');

  const addGroup = (titleText, values, hex = null) => {
    if (!values.length) return;
    const gEl = document.createElement('div');
    gEl.className = 'deck-list-group';
    const title = document.createElement('div');
    title.className = 'deck-list-title';
    title.textContent = titleText;
    gEl.appendChild(title);
    const row = document.createElement('div');
    row.className = 'deck-chip-row';
    values.forEach((v) => {
      const chip = document.createElement('span');
      chip.className = 'deck-chip';
      chip.textContent = v;
      if (hex) chip.style.boxShadow = `0 0 0 2px ${hex} inset`;
      row.appendChild(chip);
    });
    gEl.appendChild(row);
    wrap.appendChild(gEl);
  };

  if (state.mode === MODES.QUICK) {
    // 퀵앤이지는 색깔별로 정리
    for (const color of JELLY_COLORS) {
      const values = numberCards.filter((c) => c.color === color).map((c) => c.value).sort((a, b) => a - b);
      addGroup(`${COLOR_INFO[color].label} (${values.length}장)`, values, COLOR_INFO[color].hex);
    }
  } else {
    const maxValue = numberCards.reduce((m, c) => Math.max(m, c.value), 0);
    for (let start = 0; start <= maxValue; start += 10) {
      const end = start + 9;
      const values = numberCards.filter((c) => c.value >= start && c.value <= end).map((c) => c.value).sort((a, b) => a - b);
      addGroup(`${start}-${end} (${values.length}장)`, values);
    }
  }
  if (jokers.length) addGroup(`조커 (${jokers.length}장)`, jokers.map(() => '🐼'));
  if (ranges.length) addGroup(`레인지 (${ranges.length}장)`, ranges.map((r) => `${r.lo}-${r.hi}`));

  if (!numberCards.length && !jokers.length && !ranges.length) {
    wrap.innerHTML = '<div class="pile-history-empty">모든 카드가 필드에 나왔어요!</div>';
    return wrap;
  }
  const total = document.createElement('div');
  total.className = 'deck-list-title';
  total.style.marginTop = '8px';
  total.textContent = `총 ${cards.length}장 미공개`;
  wrap.appendChild(total);
  return wrap;
}
