// 덱 생성 및 셔플 — 모드/확장팩 옵션에 따라 카드 구성
import {
  MODES, EXTREME_SPECIALS, FIRE_NUMBERS, JELLY_COLORS,
  JOKER_COUNT, RANGE_COUNT,
} from './constants.js';

// mulberry32 — 시드 고정 가능한 RNG (테스트/멀티 동기화용)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function specialForNumber(value, options) {
  if (options.extreme) {
    for (const [special, numbers] of Object.entries(EXTREME_SPECIALS)) {
      if (numbers.includes(value)) return special;
    }
  }
  if (options.fire && FIRE_NUMBERS.includes(value)) return 'fire';
  return null;
}

let nextId = 1;
function card(props) {
  return { id: `c${nextId++}`, ...props };
}

// 일반 협력 모드: 숫자 2~99 (+ 옵션에 따라 조커/레인지)
function buildNormalDeck(options) {
  const cards = [];
  for (let v = 2; v <= 99; v++) {
    cards.push(card({ type: 'number', value: v, special: specialForNumber(v, options) }));
  }
  if (options.joker) {
    for (let i = 0; i < JOKER_COUNT; i++) cards.push(card({ type: 'joker' }));
  }
  if (options.range) {
    for (let i = 0; i < RANGE_COUNT; i++) {
      cards.push(card({ type: 'range', lo: i * 10, hi: i * 10 + 9 }));
    }
  }
  return cards;
}

// 퀵 앤 이지: 색상 5종 × 각 1~10 (총 50장) — 숫자는 1~10 안에서만 움직임
function buildQuickDeck() {
  const cards = [];
  for (const color of JELLY_COLORS) {
    for (let n = 1; n <= 10; n++) {
      cards.push(card({ type: 'number', value: n, color }));
    }
  }
  return cards;
}

// 페이스 투 페이스: 숫자 2~59 (각자 동일 구성의 개인 덱, 카드에 소유자 표시)
function buildFtfDeck(owner) {
  const cards = [];
  for (let v = 2; v <= 59; v++) {
    cards.push(card({ type: 'number', value: v, owner }));
  }
  return cards;
}

function pile(id, dir, base, label, owner = null) {
  return { id, dir, base, label, owner, cards: [] };
}

// 게임 초기 배치(덱 + 더미) 생성
export function buildSetup(mode, options, playerIds, rng = Math.random) {
  if (mode === MODES.QUICK) {
    return {
      decks: { shared: shuffle(buildQuickDeck(), rng) },
      // 숫자가 1~10이므로 경계는 0(오름) / 11(내림)
      piles: [
        pile('up1', 'up', 0, '토끼의 등산로 🐰'),
        pile('down1', 'down', 11, '두더지의 땅굴 🐹'),
      ],
    };
  }
  if (mode === MODES.FTF) {
    const [a, b] = playerIds;
    return {
      decks: {
        [a]: shuffle(buildFtfDeck(a), rng),
        [b]: shuffle(buildFtfDeck(b), rng),
      },
      piles: [
        pile('up-' + a, 'up', 1, '등산로 🐰', a),
        pile('down-' + a, 'down', 60, '땅굴 🐹', a),
        pile('up-' + b, 'up', 1, '등산로 🐰', b),
        pile('down-' + b, 'down', 60, '땅굴 🐹', b),
      ],
    };
  }
  return {
    decks: { shared: shuffle(buildNormalDeck(options), rng) },
    piles: [
      pile('up1', 'up', 1, '토끼의 등산로 🐰'),
      pile('up2', 'up', 1, '토끼의 등산로 🐰'),
      pile('down1', 'down', 100, '두더지의 땅굴 🐹'),
      pile('down2', 'down', 100, '두더지의 땅굴 🐹'),
    ],
  };
}
