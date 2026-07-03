// 사운드 — 외부 오디오 파일 없이 Web Audio API로 직접 합성 (저작권 걱정 없음)
// 파스텔 동물마을 테마에 맞는 부드럽고 귀여운 톤으로 통일

const MUTE_KEY = 'pawsOrderMuted';
const VOLUME = 0.5;

let ctx = null;
let master = null;
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
})();

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : VOLUME;
  master.connect(ctx.destination);
  return ctx;
}

export function isMuted() { return muted; }

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch (_) { /* noop */ }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : VOLUME, ctx.currentTime, 0.05);
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

// 짧은 톤 하나를 재생 (부드러운 attack/release 엔벌로프)
function tone({ freq, start = 0, dur = 0.08, type = 'sine', gain = 0.2, attack = 0.008, release = 0.09 }) {
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.linearRampToValueAtTime(0, t0 + dur + release);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + release + 0.02);
}

export const sfx = {
  place() { tone({ freq: 520, start: 0, dur: 0.06, type: 'triangle', gain: 0.22 }); tone({ freq: 780, start: 0.045, dur: 0.07, type: 'triangle', gain: 0.15 }); },
  special() { tone({ freq: 660, start: 0, dur: 0.08, type: 'sawtooth', gain: 0.14 }); tone({ freq: 494, start: 0.07, dur: 0.09, type: 'sawtooth', gain: 0.12 }); },
  draw() { tone({ freq: 660, start: 0, dur: 0.045, type: 'sine', gain: 0.13 }); tone({ freq: 880, start: 0.035, dur: 0.05, type: 'sine', gain: 0.13 }); },
  invalid() { tone({ freq: 200, start: 0, dur: 0.1, type: 'square', gain: 0.12 }); tone({ freq: 150, start: 0.09, dur: 0.12, type: 'square', gain: 0.1 }); },
  select() { tone({ freq: 1050, start: 0, dur: 0.025, type: 'sine', gain: 0.07 }); },
  endTurn() { tone({ freq: 440, start: 0, dur: 0.07, type: 'triangle', gain: 0.18 }); tone({ freq: 660, start: 0.06, dur: 0.09, type: 'triangle', gain: 0.15 }); },
  signal() { tone({ freq: 900, start: 0, dur: 0.05, type: 'sine', gain: 0.15 }); tone({ freq: 1200, start: 0.045, dur: 0.05, type: 'sine', gain: 0.11 }); },
  click() { tone({ freq: 760, start: 0, dur: 0.03, type: 'sine', gain: 0.09 }); },
  win() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, start: i * 0.11, dur: 0.16, type: 'triangle', gain: 0.2 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone({ freq: f, start: i * 0.17, dur: 0.24, type: 'sine', gain: 0.16 })); },
};

// ---------- 배경음악 ----------
// 5음계(펜타토닉) 기반의 짧고 밝은 루프를 절차적으로 생성해서 계속 반복 재생
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0]; // C D E G A
const MELODY = [0, 2, 4, 2, 3, 4, 2, 0, 1, 3, 4, 3, 2, 1, 0, 0];
const STEP_DUR = 0.28;
const LOOKAHEAD = 0.2;
const SCHEDULER_INTERVAL_MS = 100;

let bgmNextTime = 0;
let bgmStepIndex = 0;
let bgmTimerId = null;

function scheduleBgmSteps() {
  const c = ensureCtx();
  if (!c) return;
  while (bgmNextTime < c.currentTime + LOOKAHEAD) {
    const idx = MELODY[bgmStepIndex % MELODY.length];
    const lowerOctave = bgmStepIndex % 8 === 0;
    const freq = SCALE[idx] * (lowerOctave ? 0.5 : 1);
    tone({
      freq,
      start: bgmNextTime - c.currentTime,
      dur: STEP_DUR * 0.8,
      type: 'triangle',
      gain: 0.065,
      attack: 0.02,
      release: 0.12,
    });
    bgmNextTime += STEP_DUR;
    bgmStepIndex++;
  }
}

export function startBgm() {
  const c = ensureCtx();
  if (!c || bgmTimerId) return;
  bgmNextTime = c.currentTime + 0.1;
  bgmStepIndex = 0;
  scheduleBgmSteps();
  bgmTimerId = setInterval(scheduleBgmSteps, SCHEDULER_INTERVAL_MS);
}

export function stopBgm() {
  if (bgmTimerId) { clearInterval(bgmTimerId); bgmTimerId = null; }
}

// 브라우저 자동재생 정책 때문에 반드시 사용자 제스처(클릭/터치) 안에서 오디오를 시작해야 함
export function initAudioOnUserGesture() {
  const start = () => {
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
    startBgm();
  };
  document.addEventListener('pointerdown', start, { once: true });
  document.addEventListener('keydown', start, { once: true });
}
