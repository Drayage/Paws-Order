// Firebase Realtime Database 멀티플레이 — 호스트 권위 모델
// 호스트가 게임 상태를 계산해 games/pawsOrder/rooms/{code}/state에 기록하고,
// 게스트는 games/pawsOrder/rooms/{code}/actions에 액션만 올리면 호스트가 반영해 다시 배포합니다.
import { firebaseConfig } from './firebase-config.js';
import { createGame, playCard, endTurn } from './game.js';
import { playAiTurn } from './ai.js';
import { ANIMAL_AVATARS } from './constants.js';

const FIREBASE_APP_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
const FIREBASE_DB_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js';

// 이 Firebase 프로젝트는 다른 게임들과 공유하며, 보안 규칙이 "games/" 경로만 열려있으므로
// 그 밑에 우리만의 하위 경로를 둬서 다른 게임 데이터와 섞이지 않게 함
const APP_ROOT = 'games/pawsOrder';

let fbPromise = null;

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.databaseURL);
}

async function ensureFirebase() {
  if (!fbPromise) {
    fbPromise = (async () => {
      const [{ initializeApp }, dbMod] = await Promise.all([
        import(/* webpackIgnore: true */ FIREBASE_APP_URL),
        import(/* webpackIgnore: true */ FIREBASE_DB_URL),
      ]);
      const app = initializeApp(firebaseConfig);
      const db = dbMod.getDatabase(app);
      return { db, ...dbMod };
    })();
  }
  return fbPromise;
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function randomUid() {
  return 'u' + Math.random().toString(36).slice(2, 10);
}

// 로비 플레이어 목록 + 호스트가 지정한 AI 인원으로 실제 게임 플레이어 배열 구성
function buildPlayersFromLobby(lobbyPlayers, aiCount, mode) {
  const players = lobbyPlayers.map((p) => ({ id: p.uid, name: p.name, isAI: false }));
  const aiTotal = mode === 'ftf' ? Math.max(0, 2 - players.length) : aiCount;
  for (let i = 0; i < aiTotal; i++) {
    const avatar = ANIMAL_AVATARS[i % ANIMAL_AVATARS.length];
    players.push({ id: `ai${i}`, name: avatar.name, isAI: true });
  }
  return players;
}

class RoomController {
  constructor({ fb, code, uid, isHost, mode, options, aiCount, name }) {
    this.fb = fb;
    this.code = code;
    this.uid = uid;
    this.isHost = isHost;
    this.mode = mode;
    this.options = options;
    this.aiCount = aiCount;
    this.name = name;
    this.state = null;
    this.gamePlayerId = null;
    this._unsubs = [];
    this._playersCb = null;
    this._gameStateCb = null;
    this._signalCb = null;
    this._seenSignals = new Set();
  }

  get roomRef() { return this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}`); }
  get metaRef() { return this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/meta`); }
  get playersRef() { return this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/players`); }
  get stateRef() { return this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/state`); }
  get actionsRef() { return this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/actions`); }
  get signalsRef() { return this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/signals`); }

  onPlayers(cb) {
    this._playersCb = cb;
    const unsub = this.fb.onValue(this.playersRef, (snap) => {
      const val = snap.val() || {};
      const list = Object.entries(val).map(([uid, v]) => ({ uid, name: v.name }));
      cb(list);
    });
    this._unsubs.push(unsub);
  }

  // cb(state|null, localGamePlayerId)
  onGameState(cb) {
    this._gameStateCb = cb;
    if (this.isHost) return; // 호스트는 로컬 상태를 직접 사용
    const unsub = this.fb.onValue(this.stateRef, (snap) => {
      const val = snap.val();
      if (val) cb(val, this.gamePlayerId);
    });
    this._unsubs.push(unsub);
    const metaUnsub = this.fb.onValue(this.metaRef, (snap) => {
      const meta = snap.val();
      if (meta && meta.playerMap && meta.playerMap[this.uid]) {
        this.gamePlayerId = meta.playerMap[this.uid];
      }
    });
    this._unsubs.push(metaUnsub);
  }

  onSignal(cb) {
    this._signalCb = cb;
    const unsub = this.fb.onChildAdded(this.signalsRef, (snap) => {
      const key = snap.key;
      if (this._seenSignals.has(key)) return;
      this._seenSignals.add(key);
      const val = snap.val();
      if (val && val.uid !== this.uid) cb(val);
      if (this.isHost) setTimeout(() => this.fb.remove(this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/signals/${key}`)), 3500);
    });
    this._unsubs.push(unsub);
  }

  dispatchSignal(text) {
    this.fb.push(this.signalsRef, { uid: this.uid, text, ts: Date.now() });
  }

  _pushState() {
    this.fb.set(this.stateRef, this.state);
  }

  _applyAndBroadcast(mutator) {
    mutator();
    this._pushState();
    if (this._gameStateCb) this._gameStateCb(this.state, this.gamePlayerId);
    this._runAiChain();
  }

  _runAiChain() {
    if (!this.isHost || !this.state || this.state.phase !== 'playing') return;
    const current = this.state.players[this.state.current];
    if (!current.isAI) return;
    setTimeout(() => {
      if (!this.state || this.state.phase !== 'playing') return;
      playAiTurn(this.state, current.id);
      this._pushState();
      if (this._gameStateCb) this._gameStateCb(this.state, this.gamePlayerId);
      this._runAiChain();
    }, 550);
  }

  // 호스트 전용: 로비 인원 + AI로 게임 시작
  async startGame() {
    if (!this.isHost) return;
    const snap = await this.fb.get(this.playersRef);
    const val = snap.val() || {};
    const lobbyPlayers = Object.entries(val).map(([uid, v]) => ({ uid, name: v.name }));
    const players = buildPlayersFromLobby(lobbyPlayers, this.aiCount, this.mode);
    this.gamePlayerId = this.uid;
    this.state = createGame({ mode: this.mode, options: this.options, players });
    const playerMap = {};
    for (const p of lobbyPlayers) playerMap[p.uid] = p.uid;
    await this.fb.update(this.metaRef, { status: 'playing', playerMap });
    this._pushState();
    if (this._gameStateCb) this._gameStateCb(this.state, this.gamePlayerId);
    this._listenActions();
    this._runAiChain();
  }

  _listenActions() {
    const unsub = this.fb.onChildAdded(this.actionsRef, (snap) => {
      const action = snap.val();
      const key = snap.key;
      this.fb.remove(this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/actions/${key}`));
      if (!action || !this.state) return;
      const gid = action.uid; // 게스트 uid == 게임 플레이어 id
      if (action.type === 'play') {
        this._applyAndBroadcast(() => playCard(this.state, gid, action.payload.cardId, action.payload.pileId));
      } else if (action.type === 'endTurn') {
        this._applyAndBroadcast(() => endTurn(this.state, gid));
      }
    });
    this._unsubs.push(unsub);
  }

  dispatchPlay(cardId, pileId) {
    if (this.isHost) {
      this._applyAndBroadcast(() => playCard(this.state, this.gamePlayerId, cardId, pileId));
    } else {
      this.fb.push(this.actionsRef, { uid: this.uid, type: 'play', payload: { cardId, pileId }, ts: Date.now() });
    }
  }

  dispatchEndTurn() {
    if (this.isHost) {
      this._applyAndBroadcast(() => endTurn(this.state, this.gamePlayerId));
    } else {
      this.fb.push(this.actionsRef, { uid: this.uid, type: 'endTurn', payload: {}, ts: Date.now() });
    }
  }

  leave() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) { /* noop */ } });
    this._unsubs = [];
    this.fb.remove(this.fb.ref(this.fb.db, `${APP_ROOT}/rooms/${this.code}/players/${this.uid}`)).catch(() => {});
  }
}

export async function hostRoom({ mode, options, aiCount, name }) {
  const fb = await ensureFirebase();
  const code = randomCode();
  const uid = randomUid();
  const controller = new RoomController({ fb, code, uid, isHost: true, mode, options, aiCount, name });
  await fb.set(controller.metaRef, { mode, options, aiCount, hostUid: uid, status: 'lobby', createdAt: Date.now() });
  await fb.set(fb.ref(fb.db, `${APP_ROOT}/rooms/${code}/players/${uid}`), { name, joinedAt: Date.now() });
  return controller;
}

export async function joinRoom({ code, name }) {
  const fb = await ensureFirebase();
  const metaSnap = await fb.get(fb.ref(fb.db, `${APP_ROOT}/rooms/${code}/meta`));
  const meta = metaSnap.val();
  if (!meta) throw new Error('방을 찾을 수 없어요. 코드를 확인해주세요.');
  if (meta.status !== 'lobby') throw new Error('이미 시작된 게임이에요.');
  const uid = randomUid();
  const controller = new RoomController({ fb, code, uid, isHost: false, mode: meta.mode, options: meta.options, aiCount: meta.aiCount, name });
  await fb.set(fb.ref(fb.db, `${APP_ROOT}/rooms/${code}/players/${uid}`), { name, joinedAt: Date.now() });
  return controller;
}

// 새로고침 후 재접속: 저장해둔 code/uid로 같은 방에 다시 붙는다.
// 실제 게임 상태는 Firebase에 있으므로(호스트도 games/pawsOrder/rooms/{code}/state에 즉시 반영해둠),
// 호스트가 새로고침했어도 마지막으로 기록된 state를 그대로 읽어와 이어서 진행할 수 있다.
export async function resumeRoom({ code, uid, isHost, name }) {
  const fb = await ensureFirebase();
  const metaSnap = await fb.get(fb.ref(fb.db, `${APP_ROOT}/rooms/${code}/meta`));
  const meta = metaSnap.val();
  if (!meta) throw new Error('방을 찾을 수 없어요. (만료되었거나 삭제된 방이에요)');

  const controller = new RoomController({
    fb, code, uid, isHost,
    mode: meta.mode, options: meta.options, aiCount: meta.aiCount, name,
  });
  controller.status = meta.status;

  // 자리를 계속 지키고 있었다는 걸 표시 (없어졌으면 다시 등록)
  await fb.set(fb.ref(fb.db, `${APP_ROOT}/rooms/${code}/players/${uid}`), { name, joinedAt: Date.now() });

  if (isHost) {
    controller.gamePlayerId = uid;
    if (meta.status === 'playing') {
      const stateSnap = await fb.get(controller.stateRef);
      controller.state = stateSnap.val();
      if (!controller.state) throw new Error('게임 상태를 복원하지 못했어요.');
      controller._listenActions();
      controller._runAiChain();
    }
  } else if (meta.status === 'playing' && meta.playerMap && meta.playerMap[uid]) {
    controller.gamePlayerId = meta.playerMap[uid];
  }
  return controller;
}

export function leaveRoom(controller) {
  if (controller) controller.leave();
}
