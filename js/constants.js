// 말랑숫자 동물마을 — 게임 상수 정의

export const MODES = {
  NORMAL: 'normal', // 🟢 일반 협력 모드 (2~99)
  QUICK: 'quick',   // 🟡 퀵 앤 이지 (1~50, 색상)
  FTF: 'ftf',       // 🔵 페이스 투 페이스 (2인 경쟁)
};

// 익스트림 명령 카드 번호 매핑
export const EXTREME_SPECIALS = {
  // 일회용
  stop: [6, 35, 57, 95],        // ✋ 정지: 차례 즉시 종료
  skull: [17, 41, 61, 87],      // 🦁 잠든 사자: 이번 차례에 다른 카드로 덮어야 종료 가능
  three: [19, 28, 53, 81],      // 3️⃣ 3! : 이 카드 포함 정확히 3장 내고 종료
  // 지속 (더미 맨 위에 있는 동안)
  noTalk: [26, 65, 78, 92],     // 🤫 쉿! 도서관 타임: 시그널 금지
  noBackwards: [21, 32, 59, 70],// 🚫 되돌리기 금지: ±10 트릭 불가
  onePile: [9, 47, 68, 84],     // 1️⃣ 한 더미에만: 차례에 한 더미에만 배치
  drawOne: [13, 38, 43, 76],    // 🃏 카드 1장만 뽑기: 보충 1장 제한
};

export const ONE_TIME_SPECIALS = ['stop', 'skull', 'three'];
export const PERSISTENT_SPECIALS = ['noTalk', 'noBackwards', 'onePile', 'drawOne'];

// 온 파이어 — 화난 식빵 🍞: 놓인 차례 또는 다음 차례까지 덮어야 함
export const FIRE_NUMBERS = [22, 33, 44, 55, 66, 77];

// 퀵 앤 이지 젤리 색상 (각 색상 1~10)
export const JELLY_COLORS = ['red', 'yellow', 'blue', 'green', 'purple'];
export const COLOR_INFO = {
  red: { label: '딸기', emoji: '🍓', hex: '#f28ba8' },
  yellow: { label: '레몬', emoji: '🍋', hex: '#f2ce6b' },
  blue: { label: '소다', emoji: '🫐', hex: '#7fb5e6' },
  green: { label: '메론', emoji: '🍈', hex: '#8fce9a' },
  purple: { label: '포도', emoji: '🍇', hex: '#b795dc' },
};

// 특수 카드 표시 정보 (동물마을 리브랜딩)
export const SPECIAL_INFO = {
  stop: { emoji: '✋', label: '멈춰!', desc: '이 카드를 내려놓으면 차례가 즉시 끝나요.' },
  skull: { emoji: '🦁', label: '잠든 사자', desc: '사자가 깨기 전에! 이번 차례 안에 다른 카드로 덮어야 해요.' },
  three: { emoji: '3️⃣', label: '셋 세기', desc: '이 카드를 포함해 이번 차례에 정확히 3장을 내야 해요.' },
  noTalk: { emoji: '🤫', label: '도서관 타임', desc: '맨 위에 있는 동안 아무도 신호를 보낼 수 없어요.' },
  noBackwards: { emoji: '🚧', label: '외길 등산로', desc: '맨 위에 있는 동안 ±10 되돌리기가 안 돼요.' },
  onePile: { emoji: '1️⃣', label: '외골수 두더지', desc: '맨 위에 있는 동안 한 차례에 한 더미에만 낼 수 있어요.' },
  drawOne: { emoji: '🌱', label: '아껴 뽑기', desc: '맨 위에 있는 동안 차례 끝에 카드를 1장만 뽑아요.' },
  fire: { emoji: '🍞', label: '화난 식빵', desc: '다음 친구 차례가 끝나기 전에 다른 카드로 덮어 달래주세요!' },
};

export const JOKER_COUNT = 10;   // 🐼 조커: 어디든 놓지만 같은 차례에 숫자카드로 즉시 덮기
export const RANGE_COUNT = 10;   // 🏕️ 레인지: 0-9 … 90-99

// 인원수별 시작 손패 (일반 모드)
export function normalHandSize(playerCount) {
  if (playerCount <= 1) return 8;
  if (playerCount === 2) return 7;
  return 6;
}

export const QUICK_HAND_SIZE = 2;
export const FTF_HAND_SIZE = 6;

export const MAX_PLAYERS = 6; // 본인 + AI 5명

// AI 이름/아바타 풀
export const ANIMAL_AVATARS = [
  { emoji: '🐰', name: '토토' },
  { emoji: '🐹', name: '몽실' },
  { emoji: '🦊', name: '여우비' },
  { emoji: '🐻', name: '보리' },
  { emoji: '🐱', name: '나비' },
  { emoji: '🐶', name: '초코' },
  { emoji: '🐨', name: '유칼' },
  { emoji: '🐧', name: '펭순' },
];

// 이모지 신호등 템플릿 (자유 채팅 없음)
export const SIGNALS = [
  { id: 'haveUp', text: '나 등산로🐰에 낼 카드 있어!', modes: ['normal', 'quick'] },
  { id: 'haveDown', text: '나 땅굴🐹에 낼 카드 있어!', modes: ['normal', 'quick'] },
  { id: 'dontTouchUp', text: '등산로🐰는 만지지 마! ❌', modes: ['normal', 'quick'] },
  { id: 'dontTouchDown', text: '땅굴🐹은 만지지 마! ❌', modes: ['normal', 'quick'] },
  { id: 'wait', text: '조금만 기다려줘! 🙏', modes: ['normal', 'quick', 'ftf'] },
  { id: 'nice', text: '나이스! 최고야 💖', modes: ['normal', 'quick', 'ftf'] },
  { id: 'colorHigh', text: '나 {color}젤리 높은 거 있어!', modes: ['quick'], needsColor: true },
  { id: 'colorLow', text: '나 {color}젤리 낮은 거 있어!', modes: ['quick'], needsColor: true },
  { id: 'gift', text: '친구야, 좋은 선물 줄게! 🎁', modes: ['ftf'] },
  { id: 'noGift', text: '선물은 사양할게~ 😅', modes: ['ftf'] },
];
