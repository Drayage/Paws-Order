// 부트스트랩 & 화면 전환 & 이벤트 와이어링
import { MODES, ANIMAL_AVATARS, MAX_PLAYERS } from './constants.js';
import { createGame, playCard, endTurn } from './game.js';
import { planAiMove, pickAiSignal } from './ai.js';
import { renderGame, openModal, closeModal, buildPileHistoryBody, buildDeckModalBody } from './ui.js';
import { buildSignalButtons, isSignalLocked, signalText } from './signals.js';
import { isFirebaseConfigured, hostRoom, joinRoom, leaveRoom } from './net.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const MODE_META = [
  { id: MODES.NORMAL, emoji: '🟢', title: '일반 협력 모드', desc: '숫자 2~99, 다 함께 손패를 소진하면 승리!' },
  { id: MODES.QUICK, emoji: '🟡', title: '퀵 앤 이지', desc: '숫자 1~50, 젤리 색상이 같으면 역행 가능!' },
  { id: MODES.FTF, emoji: '🔵', title: '페이스 투 페이스', desc: '2인 전용 경쟁! 상대 더미에 선물도 줄 수 있어요.' },
];

const appState = {
  screen: 'menu',
  roomMode: 'single', // single | host | join
  mode: MODES.NORMAL,
  options: { extreme: false, fire: false, joker: false, range: false },
  aiCount: 2,
  playerName: '',
  game: null,
  localPlayerId: 'human',
  selectedCardId: null,
  handSort: 'draw',      // draw | asc | color
  focusPileId: null,     // 더미를 눌러 "여기 낼 수 있는 카드" 강조 중인 더미
  drawnIds: null,        // 방금 뽑은 카드 id Set (드로우 이펙트용)
  bubbles: new Map(),
  bubbleTimers: new Map(),
  resultShown: false,
  net: null, // RoomController when hosting/joining
};

function switchScreen(name) {
  appState.screen = name;
  $$('.screen').forEach((el) => el.classList.remove('active'));
  $(`#screen-${name}`).classList.add('active');
}

// ---------- 설정 화면 ----------
function renderModeGrid() {
  const grid = $('#mode-grid');
  grid.innerHTML = '';
  MODE_META.forEach((m) => {
    const el = document.createElement('div');
    el.className = 'mode-card' + (appState.mode === m.id ? ' selected' : '');
    el.innerHTML = `<h3>${m.emoji} ${m.title}</h3><p>${m.desc}</p>`;
    el.addEventListener('click', () => {
      appState.mode = m.id;
      if (m.id !== MODES.NORMAL) appState.options = { extreme: false, fire: false, joker: false, range: false };
      if (m.id === MODES.FTF) appState.aiCount = 1;
      renderSetupScreen();
    });
    grid.appendChild(el);
  });
}

function renderToggles() {
  const isNormal = appState.mode === MODES.NORMAL;
  $('#ext-disabled-note').style.display = isNormal ? 'none' : 'block';
  $$('#panel-extensions .toggle-row').forEach((row) => {
    const opt = row.dataset.opt;
    const input = row.querySelector('input');
    input.disabled = !isNormal;
    input.checked = isNormal && appState.options[opt];
    row.classList.toggle('disabled', !isNormal);
    input.onchange = () => { appState.options[opt] = input.checked; };
  });
}

function renderAiStepper() {
  const row = $('#row-ai-count');
  const isFtf = appState.mode === MODES.FTF;
  const isGuest = appState.roomMode === 'join';
  row.style.display = isGuest ? 'none' : 'flex';
  $('#row-ai-count label').textContent = appState.roomMode === 'host' ? 'AI로 채울 인원(최대)' : 'AI 동물 친구';
  const max = isFtf ? 1 : MAX_PLAYERS - 1;
  if (appState.aiCount > max) appState.aiCount = max;
  $('#ai-count').textContent = appState.aiCount;
  $('#ai-minus').disabled = appState.aiCount <= (isFtf ? 1 : 0);
  $('#ai-plus').disabled = appState.aiCount >= max;
}

function renderRoomPanel() {
  const panel = $('#panel-room');
  const isMulti = appState.roomMode !== 'single';
  panel.style.display = isMulti ? 'block' : 'none';
  $('#row-room-code-input').style.display = appState.roomMode === 'join' ? 'flex' : 'none';
  $('#row-room-code-display').style.display = 'none';
  $('#room-panel-title').textContent = appState.roomMode === 'host' ? '🏠 방 만들기' : '🚪 방 참가하기';
  const note = $('#firebase-note');
  if (!isFirebaseConfigured()) {
    note.textContent = '⚠️ 아직 Firebase 설정이 안 되어 있어요. js/firebase-config.js를 채워주세요. (README 참고)';
  } else {
    note.textContent = appState.roomMode === 'host'
      ? '방을 만들면 코드가 생성돼요. 친구에게 코드를 알려주고 대기실에서 시작하세요!'
      : '친구에게 받은 6자리 코드를 입력하고 참가하세요.';
  }
}

function renderSetupScreen() {
  $('#setup-title').textContent = appState.roomMode === 'host' ? '🏠 방 만들기'
    : appState.roomMode === 'join' ? '🚪 방 참가하기' : '🎮 혼자 놀기 설정';
  renderModeGrid();
  renderToggles();
  renderAiStepper();
  renderRoomPanel();
  $('#btn-start-game').textContent = appState.roomMode === 'join' ? '참가하기 🚪' : appState.roomMode === 'host' ? '방 만들기 🏠' : '시작하기 🚀';
}

// ---------- 싱글 플레이 ----------
function buildSoloPlayers() {
  const name = appState.playerName.trim() || '손님';
  const players = [{ id: 'human', name, isAI: false }];
  const count = appState.mode === MODES.FTF ? 1 : appState.aiCount;
  for (let i = 0; i < count; i++) {
    const avatar = ANIMAL_AVATARS[i % ANIMAL_AVATARS.length];
    players.push({ id: `ai${i}`, name: avatar.name, isAI: true });
  }
  return players;
}

function resetGameUiState() {
  appState.selectedCardId = null;
  appState.focusPileId = null;
  appState.drawnIds = null;
  appState.handSort = 'draw';
  appState.resultShown = false;
  appState.bubbles.clear();
  $('#gameover-banner').style.display = 'none';
}

function startSinglePlayerGame() {
  const players = buildSoloPlayers();
  appState.localPlayerId = 'human';
  appState.game = createGame({ mode: appState.mode, options: appState.options, players });
  resetGameUiState();
  switchScreen('game');
  render();
  maybeRunAiTurn();
}

// ---------- 공통 렌더/디스패치 ----------
function ctxForUi() {
  return {
    localPlayerId: appState.localPlayerId,
    selectedCardId: appState.selectedCardId,
    handSort: appState.handSort,
    focusPileId: appState.focusPileId,
    drawnIds: appState.drawnIds,
    onSelectCard: (cardId) => {
      appState.selectedCardId = appState.selectedCardId === cardId ? null : cardId;
      appState.focusPileId = null;
      render();
    },
    onPlayToPile: (pileId) => {
      const cardId = appState.selectedCardId;
      appState.selectedCardId = null;
      appState.focusPileId = null;
      if (appState.net) {
        appState.net.dispatchPlay(cardId, pileId);
      } else {
        const res = playCard(appState.game, appState.localPlayerId, cardId, pileId);
        if (!res.ok) flashHint(res.why);
        afterStateChange();
      }
    },
    onTogglePileFocus: (pileId) => {
      appState.focusPileId = appState.focusPileId === pileId ? null : pileId;
      render();
    },
    onSetSort: (sortId) => {
      appState.handSort = sortId;
      render();
    },
    onAvatarClick: () => openSignalModal(),
    onInspectPile: (pileId) => openPileModal(pileId),
    onInspectDeck: (deckKey) => openDeckModal(deckKey),
  };
}

function openSignalModal() {
  const state = appState.game;
  const wrap = document.createElement('div');
  if (isSignalLocked(state)) {
    wrap.innerHTML = '<div class="signal-lock-note">🤫 도서관 타임! 지금은 신호를 보낼 수 없어요.</div>';
    openModal('신호 보내기', wrap);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'signal-grid';
  buildSignalButtons(state.mode).forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (b.emojiOnly) btn.classList.add('emoji-only');
    btn.textContent = b.label;
    if (b.hex) btn.style.borderColor = b.hex;
    btn.addEventListener('click', () => { sendLocalSignal(b.id, b.color); closeModal(); });
    grid.appendChild(btn);
  });
  wrap.appendChild(grid);
  openModal('신호 보내기 📣', wrap);
}

function openPileModal(pileId) {
  const pile = appState.game.piles.find((p) => p.id === pileId);
  const body = buildPileHistoryBody(appState.game, pileId, appState.localPlayerId);
  openModal(`${pile.dir === 'up' ? '⬆️' : '⬇️'} 더미에 놓인 카드`, body);
}

function openDeckModal(deckKey) {
  const body = buildDeckModalBody(appState.game, deckKey, appState.localPlayerId);
  openModal('🗂️ 아직 안 나온 카드', body);
}

function flashHint(text) {
  const hint = $('#turn-requirement');
  hint.textContent = '❌ ' + text;
  hint.style.color = 'var(--danger)';
  setTimeout(() => { hint.style.color = ''; render(); }, 1400);
}

function render() {
  if (!appState.game) return;
  renderGame(appState.game, ctxForUi(), appState.bubbles);
}

// 말풍선 표시 (플레이어별 타이머 관리 — 연속 신호에도 자연스럽게)
function showBubble(playerId, text, duration = 3000) {
  appState.bubbles.set(playerId, text);
  render();
  const prev = appState.bubbleTimers.get(playerId);
  if (prev) clearTimeout(prev);
  appState.bubbleTimers.set(playerId, setTimeout(() => {
    appState.bubbles.delete(playerId);
    appState.bubbleTimers.delete(playerId);
    render();
  }, duration));
}

function sendLocalSignal(signalId, color) {
  const text = signalText(signalId, color);
  showBubble(appState.localPlayerId, text);
  if (appState.net) appState.net.dispatchSignal(text);
}

// ---------- 게임 종료 처리 ----------
// 패배 시 바로 결과 화면으로 넘기지 않고, 필드를 볼 수 있는 배너를 먼저 띄움
function handleGameOver() {
  const state = appState.game;
  if (!state || state.phase === 'playing' || appState.resultShown) return;
  if (state.phase === 'won') {
    appState.resultShown = true;
    showResult();
    return;
  }
  const banner = $('#gameover-banner');
  $('#gameover-text').textContent = `😿 ${state.loseReason || '게임이 끝났어요'}`;
  banner.style.display = 'flex';
}

// ---------- 싱글 플레이 전용 진행 루프 ----------
function afterStateChange() {
  render();
  if (appState.game.phase !== 'playing') { handleGameOver(); return; }
  maybeRunAiTurn();
}

// AI 턴: 한 장씩, 애매한 상황일수록 오래 고민하는 연출 + 상황 이모지
function maybeRunAiTurn() {
  if (appState.net) return; // 멀티플레이는 호스트(net.js)가 AI 턴을 진행
  const state = appState.game;
  if (!state || state.phase !== 'playing') return;
  const current = state.players[state.current];
  if (!current.isAI) return;

  const plan = planAiMove(state, current.id);
  // 고민할수록 오래 끔 (0.6~2.6초) + 약간의 랜덤
  const delay = 600 + Math.round(plan.hesitation * 1700) + Math.random() * 300;
  if (plan.hesitation > 0.45) showBubble(current.id, '🤔', Math.min(delay, 2500));

  // 가끔 자기 상황을 이모지로 알림
  if (Math.random() < 0.3) {
    const sig = pickAiSignal(state, current.id, plan);
    if (sig && !isSignalLocked(state)) showBubble(current.id, signalText(sig.id, sig.color));
  }

  setTimeout(() => {
    if (!appState.game || appState.game.phase !== 'playing') return;
    if (appState.game.players[appState.game.current].id !== current.id) { maybeRunAiTurn(); return; }
    if (plan.type === 'play') {
      playCard(appState.game, current.id, plan.cardId, plan.pileId);
    } else {
      endTurn(appState.game, current.id);
    }
    render();
    if (appState.game.phase !== 'playing') { handleGameOver(); return; }
    maybeRunAiTurn();
  }, delay);
}

function showResult() {
  const state = appState.game;
  const emoji = $('#result-emoji');
  const title = $('#result-title');
  const desc = $('#result-desc');
  if (state.phase === 'won') {
    emoji.textContent = '🎉';
    if (state.mode === MODES.FTF && state.winner) {
      const winner = state.players.find((p) => p.id === state.winner);
      const won = state.winner === appState.localPlayerId;
      title.textContent = won ? '내가 이겼어요!' : `${winner.name}의 승리!`;
    } else {
      title.textContent = '모두 함께 승리했어요!';
    }
    desc.textContent = '동물 마을 친구들이 모두 기뻐해요 🐾';
  } else {
    emoji.textContent = '😿';
    title.textContent = state.mode === MODES.FTF && state.winner
      ? `${state.players.find((p) => p.id === state.winner)?.name}의 승리…`
      : '아쉬워요…';
    desc.textContent = state.loseReason || '다음엔 꼭 성공할 거예요!';
  }
  switchScreen('result');
}

// ---------- 멀티플레이 로비 ----------
function renderLobby(players) {
  $('#lobby-code').textContent = appState.net.code;
  const list = $('#lobby-players');
  list.innerHTML = players.map((p) => `<li>${p.name}${p.uid === appState.net.uid ? ' (나)' : ''}</li>`).join('');
  const startBtn = $('#btn-lobby-start');
  if (appState.net.isHost) {
    startBtn.style.display = 'inline-block';
    startBtn.disabled = players.length < 1;
    $('#lobby-hint').textContent = `AI ${appState.net.aiCount}명이 빈 자리를 채워요. 준비되면 시작하세요!`;
  } else {
    startBtn.style.display = 'none';
    $('#lobby-hint').textContent = '호스트가 게임을 시작하길 기다리는 중… 🕐';
  }
}

async function enterMultiplayerGame() {
  appState.localPlayerId = appState.net.gamePlayerId;
  resetGameUiState();
  switchScreen('game');
  appState.net.onGameState((state, localId) => {
    appState.game = state;
    appState.localPlayerId = localId || appState.localPlayerId;
    render();
    if (state.phase !== 'playing') handleGameOver();
  });
  appState.net.onSignal(({ uid, text }) => {
    showBubble(uid, text);
  });
  if (appState.net.isHost) {
    appState.game = appState.net.state;
    render();
  }
}

async function startMultiplayerFlow() {
  const name = appState.playerName.trim() || '손님';
  if (appState.roomMode === 'host') {
    appState.net = await hostRoom({ mode: appState.mode, options: appState.options, aiCount: appState.aiCount, name });
  } else {
    const code = $('#input-room-code').value.trim().toUpperCase();
    if (!code) { alert('방 코드를 입력해주세요.'); return; }
    appState.net = await joinRoom({ code, name });
  }
  switchScreen('lobby');
  appState.net.onPlayers((players) => renderLobby(players));
  const metaUnsub = appState.net.fb.onValue(appState.net.metaRef, (snap) => {
    const meta = snap.val();
    if (meta && meta.status === 'playing' && appState.screen === 'lobby') {
      enterMultiplayerGame();
    }
  });
  appState.net._unsubs.push(metaUnsub);
}

// ---------- 이벤트 바인딩 ----------
function bindEvents() {
  $('#btn-goto-single').addEventListener('click', () => {
    appState.roomMode = 'single';
    switchScreen('setup');
    renderSetupScreen();
  });
  $('#btn-goto-host').addEventListener('click', () => {
    appState.roomMode = 'host';
    switchScreen('setup');
    renderSetupScreen();
  });
  $('#btn-goto-join').addEventListener('click', () => {
    appState.roomMode = 'join';
    switchScreen('setup');
    renderSetupScreen();
  });
  $('#btn-back-menu').addEventListener('click', () => switchScreen('menu'));

  $('#input-name').addEventListener('input', (e) => { appState.playerName = e.target.value; });

  $('#ai-minus').addEventListener('click', () => { appState.aiCount = Math.max(appState.mode === MODES.FTF ? 1 : 0, appState.aiCount - 1); renderAiStepper(); });
  $('#ai-plus').addEventListener('click', () => { appState.aiCount = Math.min(MAX_PLAYERS - 1, appState.aiCount + 1); renderAiStepper(); });

  $('#btn-start-game').addEventListener('click', async () => {
    if (appState.roomMode === 'single') {
      startSinglePlayerGame();
      return;
    }
    if (!isFirebaseConfigured()) {
      alert('멀티플레이를 사용하려면 먼저 js/firebase-config.js에 Firebase 설정을 입력해주세요. (README 참고)');
      return;
    }
    try {
      await startMultiplayerFlow();
    } catch (err) {
      alert('연결에 실패했어요: ' + err.message);
    }
  });

  $('#btn-lobby-start').addEventListener('click', async () => {
    if (appState.net?.isHost) await appState.net.startGame();
  });
  $('#btn-lobby-leave').addEventListener('click', () => {
    if (appState.net) leaveRoom(appState.net);
    appState.net = null;
    switchScreen('menu');
  });

  $('#btn-end-turn').addEventListener('click', () => {
    if (appState.net) {
      appState.net.dispatchEndTurn();
      return;
    }
    const me = appState.game.players.find((p) => p.id === appState.localPlayerId);
    const beforeIds = new Set(me.hand.map((c) => c.id));
    const res = endTurn(appState.game, appState.localPlayerId);
    if (!res.ok) flashHint(res.why);
    else {
      // 새로 뽑은 카드에 드로우 이펙트
      appState.drawnIds = new Set(me.hand.filter((c) => !beforeIds.has(c.id)).map((c) => c.id));
      appState.focusPileId = null;
      if (appState.drawnIds.size) {
        setTimeout(() => { appState.drawnIds = null; render(); }, 1600);
      }
    }
    afterStateChange();
  });

  $('#btn-show-result').addEventListener('click', () => {
    $('#gameover-banner').style.display = 'none';
    appState.resultShown = true;
    showResult();
  });

  $('#btn-leave-game').addEventListener('click', () => {
    if (appState.net) leaveRoom(appState.net);
    appState.net = null;
    appState.game = null;
    switchScreen('menu');
  });

  $('#btn-play-again').addEventListener('click', () => {
    appState.net = null;
    switchScreen('setup');
    renderSetupScreen();
  });
  $('#btn-result-menu').addEventListener('click', () => {
    appState.net = null;
    appState.game = null;
    switchScreen('menu');
  });

  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

bindEvents();
renderSetupScreen();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => { /* PWA는 선택 기능이라 실패해도 게임 진행에는 영향 없음 */ });
  });
}
