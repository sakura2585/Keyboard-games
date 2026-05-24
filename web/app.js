const KEYBOARD_ROWS = [
  "1234567890-",
  "QWERTYUIOP",
  "ASDFGHJKL;",
  "ZXCVBNM,./",
];

/**
 * 標準 QWERTY 盲打「每指負責鍵位」（與本模擬鍵盤字元一致）。
 * lp/lr/lm/li = 左手 小/無/中/食；ri/rm/rr/rp = 右手 食/中/無/小；th = 空白（雙手拇指區）。
 */
const FINGER_BY_PHYSICAL_KEY = {
  "1": "lp",
  "2": "lr",
  "3": "lm",
  "4": "li",
  "5": "li",
  "6": "ri",
  "7": "ri",
  "8": "rm",
  "9": "rr",
  "0": "rp",
  "-": "rp",
  q: "lp",
  w: "lr",
  e: "lm",
  r: "li",
  t: "li",
  y: "ri",
  u: "ri",
  i: "rm",
  o: "rr",
  p: "rp",
  a: "lp",
  s: "lr",
  d: "lm",
  f: "li",
  g: "li",
  h: "ri",
  j: "ri",
  k: "rm",
  l: "rr",
  ";": "rp",
  z: "lp",
  x: "lr",
  c: "lm",
  v: "li",
  b: "li",
  n: "ri",
  m: "ri",
  ",": "rm",
  ".": "rr",
  "/": "rp",
  " ": "th",
};

const ENERGY_MAX = 100;
const DRAIN_PER_SEC_MIN = 1;
/** 起始＋連擊加成後，每秒能量遞減上限；40 約為兒童向極限，再高容易瞬間結束 */
const DRAIN_PER_SEC_MAX = 40;
const DRAIN_PER_SEC_DEFAULT = 8;
/** 連續命中此鍵數後，每秒能量遞減 +1（略拉長間隔，避免高難度下壓力暴升過快） */
const STREAK_HITS_PER_DRAIN_PLUS_ONE = 36;
/** 答對加分倍率：難度最低 1.0×，達 DRAIN_PER_SEC_MAX 時為此值（與即時每秒遞減線性對應） */
const SCORE_MULT_AT_MAX = 2.5;
const GAIN_CORRECT = 6;
const PENALTY_WRONG = 12;

const SCORE_HISTORY_KEY = "typing-game-web-score-history";
/** 永久儲存中「最佳紀錄」保留筆數（另永遠保留「最後一局」一筆） */
const SCORE_TOP_N = 10;
const MODE_LABELS = {
  letter: "英數單鍵",
  english: "純英文",
  word: "簡單英文單字",
  bopomofo: "注音模式",
  bopomofo_word: "注音拼字",
};
/** 與紀錄表分區一致（順序與畫面模式選項相同） */
const SCORE_MODES = ["letter", "english", "word", "bopomofo", "bopomofo_word"];

function normalizeModeKey(m) {
  return SCORE_MODES.includes(m) ? m : "letter";
}

function clampDrainPerSec(n) {
  const x = Math.round(Number(n));
  if (Number.isNaN(x)) return DRAIN_PER_SEC_DEFAULT;
  return Math.min(DRAIN_PER_SEC_MAX, Math.max(DRAIN_PER_SEC_MIN, x));
}

function getDrainPerSec() {
  const streakBonus = Math.floor(state.streak / STREAK_HITS_PER_DRAIN_PLUS_ONE);
  return Math.min(DRAIN_PER_SEC_MAX, state.drainPerSec + streakBonus);
}

/** 與畫面 LV 共用：達到的最高等級（只升不降） */
function getDifficultyLv() {
  return state.maxLevelAchieved;
}

/** 依最高等級線性放大答對得分；錯誤仍不扣分 */
function getScoreRewardMultiplier() {
  const d = getDifficultyLv();
  const lo = DRAIN_PER_SEC_MIN;
  const hi = DRAIN_PER_SEC_MAX;
  const span = hi - lo;
  if (span <= 0) return 1;
  const t = Math.min(1, Math.max(0, (d - lo) / span));
  return 1 + t * (SCORE_MULT_AT_MAX - 1);
}

/**
 * 再幾次「答對」後，每秒遞減會實際 +1（連擊跨過下一個門檻且未封頂）。
 * 若已無法再升則回傳 null。
 */
function getUpgradeCountdownRemaining() {
  const h = STREAK_HITS_PER_DRAIN_PLUS_ONE;
  const currentLevel = state.maxLevelAchieved;
  
  // 如果已經達到最高等級，則無法再升級
  if (currentLevel >= DRAIN_PER_SEC_MAX) {
    return null;
  }
  
  // 計算下一級需要的連續次數
  const currentStreakLevel = Math.floor(state.streak / h);
  const nextStreakLevel = currentStreakLevel + 1;
  const nextBoundary = nextStreakLevel * h;
  
  return nextBoundary - state.streak;
}

function formatUpgradeCountdown() {
  const n = getUpgradeCountdownRemaining();
  return n == null ? "—" : String(n);
}

/** 內建預設（data/vocabulary.json 載入失敗或該區為空時使用） */
const DEFAULT_WORD_POOL = [
  { en: "cat", zh: "貓" },
  { en: "dog", zh: "狗" },
  { en: "sun", zh: "太陽" },
  { en: "moon", zh: "月亮" },
  { en: "book", zh: "書" },
  { en: "hand", zh: "手" },
  { en: "tree", zh: "樹" },
  { en: "fish", zh: "魚" },
  { en: "star", zh: "星星" },
  { en: "duck", zh: "鴨子" },
  { en: "jump", zh: "跳" },
  { en: "smile", zh: "微笑" },
];
const DEFAULT_BOPOMOFO_WORD_POOL = [
  { han: "媽媽", bop: "ㄇㄚ ㄇㄚ" },
  { han: "爸爸", bop: "ㄅㄚˋ ㄅㄚ" },
  { han: "哥哥", bop: "ㄍㄜ ㄍㄜ" },
  { han: "姐姐", bop: "ㄐㄧㄝˇ ㄐㄧㄝ" },
  { han: "嗎", bop: "ㄇㄚ˙" },
  { han: "小狗", bop: "ㄒㄧㄠˇㄍㄡˇ" },
  { han: "太陽", bop: "ㄊㄞˋㄧㄤˊ" },
  { han: "月亮", bop: "ㄩㄝˋㄌㄧㄤˋ" },
  { han: "早安", bop: "ㄗㄠˇ ㄢ" },
  { han: "蘋果", bop: "ㄆㄧㄥˊㄍㄨㄛˇ" },
];

/** 執行時辭彙（由 vocabulary.json 覆寫） */
let wordPool = [];
/** 完整 wordPool（含 topic），篩選後寫入 wordPool */
let wordPoolFull = [];
/** loadPrefs 先記住，載入詞庫後再套用到 state.wordTopicFilters */
let pendingWordTopicKeys = null;

/** 本局結束遮罩出現前記錄焦點；關閉時若適用則還原（不還原遮罩內控制項） */
let gameOverPreviousFocus = null;
/** 由頂欄開啟「紀錄表」時記錄焦點，關閉時還原 */
let scoreboardPanelPreviousFocus = null;
let bopomofoWordPool = [];

const BOPOMOFO_KEYMAP = {
  "ˇ": "3",
  "ˋ": "4",
  "ˊ": "6",
  "˙": "7",
  "ㄅ": "1", "ㄉ": "2", "ㄓ": "5", "ㄚ": "8", "ㄞ": "9", "ㄢ": "0", "ㄦ": "-",
  "ㄆ": "q", "ㄊ": "w", "ㄍ": "e", "ㄐ": "r", "ㄔ": "t", "ㄗ": "y", "ㄧ": "u", "ㄛ": "i", "ㄟ": "o", "ㄣ": "p",
  "ㄇ": "a", "ㄋ": "s", "ㄎ": "d", "ㄑ": "f", "ㄕ": "g", "ㄘ": "h", "ㄨ": "j", "ㄜ": "k", "ㄠ": "l", "ㄤ": ";",
  "ㄈ": "z", "ㄌ": "x", "ㄏ": "c", "ㄒ": "v", "ㄖ": "b", "ㄙ": "n", "ㄩ": "m", "ㄝ": ",", "ㄡ": ".", "ㄥ": "/",
};
const BOPOMOFO_TONE_MARKS = new Set(["ˇ", "ˋ", "ˊ", "˙"]);
const BOPOMOFO_SYMBOLS = Object.keys(BOPOMOFO_KEYMAP).filter(
  (s) => !BOPOMOFO_TONE_MARKS.has(s)
);

const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const scoreEl = document.getElementById("score");
const targetEl = document.getElementById("target");
const hintEl = document.getElementById("hint");
const seqEl = document.getElementById("seq");
const translateEl = document.getElementById("translate");
const keyboardEl = document.getElementById("keyboard");
const skipBtn = document.getElementById("skipBtn");
const keyboardToggleEl = document.getElementById("keyboardToggle");
const keySfxToggleEl = document.getElementById("keySfxToggle");
const speakWhenSelectEl = document.getElementById("speakWhenSelect");
const speakAutoToggleEl = document.getElementById("speakAutoToggle");
const speakRateEl = document.getElementById("speakRate");
const drainPerSecEl = document.getElementById("drainPerSec");
const energyFillEl = document.getElementById("energyFill");
const targetAreaEl = document.getElementById("targetArea");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverFinalScoreEl = document.getElementById("gameOverFinalScore");
const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverTitleEl = document.getElementById("gameOverTitle");
const gameOverScoreboardBodyEl = document.getElementById("gameOverScoreboardBody");
const gameOverScoreboardTitleEl = document.getElementById("gameOverScoreboardTitle");
const gameOverScoreboardHintEl = document.getElementById("gameOverScoreboardHint");
const gameOverHintEl = document.getElementById("gameOverHint");
const scoreboardCloseBtn = document.getElementById("scoreboardCloseBtn");
const openScoreboardBtn = document.getElementById("openScoreboardBtn");
const scoreboardModeSelectEl = document.getElementById("scoreboardModeSelect");
const wordMarqueeEl = document.getElementById("wordMarquee");
const wordMarqueePanePrevEl = document.getElementById("wordMarqueePanePrev");
const wordMarqueePaneCurrentEl = document.getElementById("wordMarqueePaneCurrent");
const wordMarqueePaneNextEl = document.getElementById("wordMarqueePaneNext");
const speakCurrentBtn = document.getElementById("speakCurrentBtn");
const wordTopicBarEl = document.getElementById("wordTopicBar");
const wordTopicDetailsEl = document.getElementById("wordTopicDetails");
const wordTopicSummaryMetaEl = document.getElementById("wordTopicSummaryMeta");

const state = {
  mode: "letter",
  score: 0,
  streak: 0,
  /** 本局答對鍵次（每次判定正確 +1） */
  correctCount: 0,
  /** 本局答錯鍵次 */
  wrongCount: 0,
  /** 本局曾達到的最高連擊 */
  streakMax: 0,
  expected: "",
  chars: [],
  pos: 0,
  keys: new Map(),
  bopSeqChars: [],
  currentWordEn: "",
  currentWordZh: "",
  /** 注音拼字：目前詞的漢字（供發音按鈕） */
  bopomofoWordHan: "",
  /** 簡單英文單字自動發音：off=關閉；onQuestion=成為目前題目時；onComplete=打完該字時 */
  speakWhen: "onComplete",
  speakRate: 1,
  showKeyboard: true,
  energy: ENERGY_MAX,
  gameOver: false,
  lastEnergyTs: 0,
  /** 本局第一次按下有效鍵前，時間造成的能量遞減不開始 */
  energyDrainStarted: false,
  /** 起始難度：每秒能量遞減基準（1–30），連續命中可再加成 */
  drainPerSec: DRAIN_PER_SEC_DEFAULT,
  /** 本局達到的最高等級（只升不降） */
  maxLevelAchieved: DRAIN_PER_SEC_MIN,
  /** 英文單字：預覽的下一題（含 topic、img 等） */
  nextWordItem: null,
  /** 英文單字：剛完成的上一題（左欄無圖時顯示「已完成」） */
  lastCompletedWord: null,
  /** 英文單字：目前題目完整條目（供左欄附圖） */
  currentWordItem: null,
  /** null = 全部種類；Set 為僅出選中 topic（可複選） */
  wordTopicFilters: null,
  /** 英文詞彙種類面板是否展開（<details open>） */
  wordTopicPanelOpen: false,
  /** 答對／答錯按鍵短音效（結束與破紀錄音不受此影響） */
  sfxKeyEnabled: true,
};

function loadPrefs() {
  pendingWordTopicKeys = null;
  try {
    const raw = localStorage.getItem("typing-game-web");
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (["letter", "english", "word", "bopomofo", "bopomofo_word"].includes(obj.mode)) state.mode = obj.mode;
    if (obj.speakWhen === "onQuestion" || obj.speakWhen === "onComplete" || obj.speakWhen === "off") {
      state.speakWhen = obj.speakWhen;
    } else if (typeof obj.speakEnabled === "boolean") {
      state.speakWhen = obj.speakEnabled ? "onComplete" : "off";
    }
    if (typeof obj.speakRate === "number" && obj.speakRate >= 0.5 && obj.speakRate <= 1.5) state.speakRate = obj.speakRate;
    if (typeof obj.showKeyboard === "boolean") state.showKeyboard = obj.showKeyboard;
    if (typeof obj.drainPerSec === "number") {
      state.drainPerSec = clampDrainPerSec(obj.drainPerSec);
    } else if (["easy", "normal", "hard"].includes(obj.drainDifficulty)) {
      const legacy = { easy: 4, normal: 8, hard: 14 };
      state.drainPerSec = clampDrainPerSec(legacy[obj.drainDifficulty]);
    }
    if (Array.isArray(obj.wordTopicFilters) && obj.wordTopicFilters.length > 0) {
      pendingWordTopicKeys = obj.wordTopicFilters.filter((x) => typeof x === "string");
    }
    if (typeof obj.wordTopicPanelOpen === "boolean") state.wordTopicPanelOpen = obj.wordTopicPanelOpen;
    if (typeof obj.sfxKeyEnabled === "boolean") state.sfxKeyEnabled = obj.sfxKeyEnabled;
  } catch (_) {}
}

function savePrefs() {
  localStorage.setItem(
    "typing-game-web",
    JSON.stringify({
      mode: state.mode,
      speakWhen: state.speakWhen,
      speakRate: state.speakRate,
      showKeyboard: state.showKeyboard,
      drainPerSec: state.drainPerSec,
      wordTopicFilters: state.wordTopicFilters == null ? null : [...state.wordTopicFilters],
      wordTopicPanelOpen: state.wordTopicPanelOpen,
      sfxKeyEnabled: state.sfxKeyEnabled,
    })
  );
}

function applyKeyboardVisibility() {
  keyboardEl.hidden = !state.showKeyboard;
}

/**
 * 排名規則（可再調整）：分數（遊戲內累積分）為主；
 * 同分則正確較多、錯誤較少、連擊較高、時間較新者在前。
 */
function compareRecordsDesc(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.correct !== a.correct) return b.correct - a.correct;
  if (a.wrong !== b.wrong) return a.wrong - b.wrong;
  if (b.streak !== a.streak) return b.streak - a.streak;
  return b.ts - a.ts;
}

function migrateRecord(x) {
  if (!x || typeof x !== "object") {
    return { ts: Date.now(), mode: "letter", score: 0, correct: 0, wrong: 0, streak: 0 };
  }
  const streakVal =
    typeof x.streak === "number"
      ? x.streak
      : typeof x.streakMax === "number"
        ? x.streakMax
        : 0;
  return {
    ts: typeof x.ts === "number" ? x.ts : Date.now(),
    mode: normalizeModeKey(typeof x.mode === "string" ? x.mode : "letter"),
    score: typeof x.score === "number" ? x.score : 0,
    correct: typeof x.correct === "number" ? x.correct : 0,
    wrong: typeof x.wrong === "number" ? x.wrong : 0,
    streak: streakVal,
  };
}

function emptyByMode() {
  return Object.fromEntries(SCORE_MODES.map((m) => [m, { top: [], last: null }]));
}

function migrateV1RootToByMode(data) {
  const byMode = emptyByMode();
  let list = [];
  if (Array.isArray(data)) {
    list = data.map(migrateRecord);
  } else if (data && typeof data === "object") {
    const tops = Array.isArray(data.top) ? data.top.map(migrateRecord) : [];
    const last = data.last != null ? migrateRecord(data.last) : null;
    list = [...tops, last].filter(Boolean);
  }
  const seen = new Set();
  const deduped = [];
  for (const r of list) {
    const mr = migrateRecord(r);
    if (seen.has(mr.ts)) continue;
    seen.add(mr.ts);
    deduped.push(mr);
  }
  for (const m of SCORE_MODES) {
    const inMode = deduped.filter((r) => r.mode === m);
    if (inMode.length === 0) continue;
    const byTime = [...inMode].sort((a, b) => b.ts - a.ts);
    const last = byTime[0];
    const sortedRank = [...inMode].sort(compareRecordsDesc);
    byMode[m] = { top: sortedRank.slice(0, SCORE_TOP_N), last };
  }
  return { v: 2, byMode };
}

function loadFullScoreRoot() {
  try {
    const raw = localStorage.getItem(SCORE_HISTORY_KEY);
    if (!raw) return { v: 2, byMode: emptyByMode() };
    const data = JSON.parse(raw);
    if (data && data.v === 2 && data.byMode && typeof data.byMode === "object") {
      const byMode = emptyByMode();
      for (const m of SCORE_MODES) {
        const block = data.byMode[m];
        if (block && typeof block === "object") {
          const top = Array.isArray(block.top)
            ? block.top.map(migrateRecord).sort(compareRecordsDesc).slice(0, SCORE_TOP_N)
            : [];
          const last = block.last != null ? migrateRecord(block.last) : null;
          byMode[m] = { top, last };
        }
      }
      return { v: 2, byMode };
    }
    const migrated = migrateV1RootToByMode(data);
    saveFullScoreRoot(migrated);
    return migrated;
  } catch (_) {
    return { v: 2, byMode: emptyByMode() };
  }
}

function saveFullScoreRoot(root) {
  try {
    localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(root));
  } catch (_) {}
}

function loadScoreArchive(mode) {
  const mk = normalizeModeKey(mode);
  const root = loadFullScoreRoot();
  return root.byMode[mk] ?? { top: [], last: null };
}

function saveScoreArchiveForMode(mode, archive) {
  const root = loadFullScoreRoot();
  const mk = normalizeModeKey(mode);
  root.byMode[mk] = {
    top: archive.top.map((r) => ({ ...migrateRecord(r) })),
    last: archive.last ? { ...migrateRecord(archive.last) } : null,
  };
  saveFullScoreRoot(root);
}

function mergeScoreArchive(newRecord) {
  const mr = migrateRecord(newRecord);
  const mk = mr.mode;
  const prev = loadScoreArchive(mk);
  const pool = [];
  const seen = new Set();
  function pushUnique(r) {
    if (!r) return;
    const m = migrateRecord(r);
    if (seen.has(m.ts)) return;
    seen.add(m.ts);
    pool.push(m);
  }
  for (const r of prev.top) pushUnique(r);
  pushUnique(prev.last);
  pushUnique(mr);
  pool.sort(compareRecordsDesc);
  saveScoreArchiveForMode(mk, {
    top: pool.slice(0, SCORE_TOP_N),
    last: migrateRecord(mr),
  });
}

/** 合併紀錄前呼叫：本局是否為該模式「嚴格優於」原最佳（無歷史且分數>0 也算首次最佳） */
function isNewPersonalBestBeforeMerge(mr) {
  const migrated = migrateRecord(mr);
  const prev = loadScoreArchive(migrated.mode);
  const pool = [];
  const seen = new Set();
  function pushUnique(r) {
    if (!r) return;
    const m = migrateRecord(r);
    if (seen.has(m.ts)) return;
    seen.add(m.ts);
    pool.push(m);
  }
  for (const r of prev.top) pushUnique(r);
  pushUnique(prev.last);
  pool.sort(compareRecordsDesc);
  const best = pool[0];
  if (!best) return migrated.score > 0;
  return compareRecordsDesc(migrated, best) < 0;
}

let sfxAudioCtx = null;

function getSfxAudioContext() {
  if (sfxAudioCtx) return sfxAudioCtx;
  try {
    sfxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) {
    return null;
  }
  return sfxAudioCtx;
}

function resumeSfxContext(ctx) {
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

function sfxPlayTone(ctx, freq, startTime, duration, type = "sine", peakGain = 0.12) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  g.gain.setValueAtTime(0, startTime);
  g.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.06);
}

/** 本局結束：略低沉收尾 */
function playSfxGameOver() {
  if (document.visibilityState !== "visible") return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;
  resumeSfxContext(ctx);
  const t0 = ctx.currentTime;
  sfxPlayTone(ctx, 220, t0, 0.14, "triangle", 0.1);
  sfxPlayTone(ctx, 165, t0 + 0.11, 0.18, "triangle", 0.085);
  sfxPlayTone(ctx, 110, t0 + 0.26, 0.32, "sine", 0.075);
}

/** 該模式新最佳：短琶音 */
function playSfxNewRecord() {
  if (document.visibilityState !== "visible") return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;
  resumeSfxContext(ctx);
  const t0 = ctx.currentTime;
  const freqs = [523.25, 659.25, 783.99, 1046.5];
  freqs.forEach((f, i) => {
    sfxPlayTone(ctx, f, t0 + i * 0.1, 0.16, "sine", 0.1);
  });
}

/** 單鍵答對：短高音 */
function playSfxKeyCorrect() {
  if (!state.sfxKeyEnabled) return;
  if (document.visibilityState !== "visible") return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;
  resumeSfxContext(ctx);
  const t0 = ctx.currentTime;
  sfxPlayTone(ctx, 880, t0, 0.042, "sine", 0.15); // 增大音量從 0.065 到 0.15
}

/** 單鍵答錯：兩段略降調 */
function playSfxKeyWrong() {
  if (!state.sfxKeyEnabled) return;
  if (document.visibilityState !== "visible") return;
  const ctx = getSfxAudioContext();
  if (!ctx) return;
  resumeSfxContext(ctx);
  const t0 = ctx.currentTime;
  sfxPlayTone(ctx, 200, t0, 0.055, "triangle", 0.12); // 增大音量從 0.06 到 0.12
  sfxPlayTone(ctx, 145, t0 + 0.048, 0.075, "triangle", 0.10); // 增大音量從 0.05 到 0.10
}

function formatScoreWhen(ts) {
  return new Date(ts).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function appendScoreRow(tbody, e, highlight) {
  const tr = document.createElement("tr");
  if (highlight) tr.classList.add("game-over-score-row--latest");
  const tdWhen = document.createElement("td");
  tdWhen.className = "game-over-score-when";
  tdWhen.textContent = formatScoreWhen(e.ts);
  const tdScore = document.createElement("td");
  tdScore.className = "game-over-score-num";
  tdScore.textContent = String(e.score);
  const tdCor = document.createElement("td");
  tdCor.className = "game-over-score-int";
  tdCor.textContent = String(e.correct);
  const tdWr = document.createElement("td");
  tdWr.className = "game-over-score-int";
  tdWr.textContent = String(e.wrong);
  const tdSt = document.createElement("td");
  tdSt.className = "game-over-score-int";
  tdSt.textContent = String(e.streak);
  tr.append(tdWhen, tdScore, tdCor, tdWr, tdSt);
  tbody.appendChild(tr);
}

function updateScoreboardTitles(modeKey) {
  const mk = normalizeModeKey(modeKey);
  const label = MODE_LABELS[mk] ?? mk;
  if (!gameOverScoreboardTitleEl) return;
  if (gameOverOverlay.classList.contains("game-over-overlay--records")) {
    gameOverScoreboardTitleEl.textContent = `「${label}」紀錄表`;
  } else {
    gameOverScoreboardTitleEl.textContent = `「${label}」最佳紀錄與最後一局`;
  }
}

function renderGameOverScoreboard(highlightTs = null, modeKey = null) {
  if (!gameOverScoreboardBodyEl) return;
  const mk = normalizeModeKey(modeKey != null ? modeKey : state.mode);
  if (scoreboardModeSelectEl) scoreboardModeSelectEl.value = mk;
  updateScoreboardTitles(mk);
  gameOverScoreboardBodyEl.replaceChildren();
  const { top, last } = loadScoreArchive(mk);
  if (top.length === 0 && last == null) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "game-over-score-empty";
    td.textContent = "此模式尚無紀錄（該模式玩一局並結束後會寫入）";
    tr.appendChild(td);
    gameOverScoreboardBodyEl.appendChild(tr);
    return;
  }
  if (top.length) {
    const trSec = document.createElement("tr");
    trSec.className = "game-over-score-section";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = `最佳紀錄（${top.length} 筆）`;
    trSec.appendChild(td);
    gameOverScoreboardBodyEl.appendChild(trSec);
    for (const e of top) {
      appendScoreRow(gameOverScoreboardBodyEl, e, highlightTs != null && e.ts === highlightTs);
    }
  }
  if (last != null && !top.some((r) => r.ts === last.ts)) {
    const trSec = document.createElement("tr");
    trSec.className = "game-over-score-section";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "最後一局";
    trSec.appendChild(td);
    gameOverScoreboardBodyEl.appendChild(trSec);
    appendScoreRow(gameOverScoreboardBodyEl, last, highlightTs != null && last.ts === highlightTs);
  }
}

function applyGameOverEndedLayout() {
  gameOverOverlay.classList.remove("game-over-overlay--records");
  if (gameOverTitleEl) gameOverTitleEl.textContent = "本局結束";
  if (gameOverScoreboardTitleEl) updateScoreboardTitles(state.mode);
  if (gameOverScoreboardHintEl) gameOverScoreboardHintEl.hidden = true;
  if (gameOverFinalScoreEl) gameOverFinalScoreEl.hidden = false;
  if (playAgainBtn) playAgainBtn.hidden = false;
  if (gameOverHintEl) gameOverHintEl.hidden = false;
  if (scoreboardCloseBtn) scoreboardCloseBtn.hidden = true;
}

function applyScoreboardRecordsLayout() {
  gameOverOverlay.classList.add("game-over-overlay--records");
  if (gameOverTitleEl) gameOverTitleEl.textContent = "分數紀錄";
  if (gameOverScoreboardHintEl) gameOverScoreboardHintEl.hidden = false;
  if (gameOverFinalScoreEl) gameOverFinalScoreEl.hidden = true;
  if (playAgainBtn) playAgainBtn.hidden = true;
  if (gameOverHintEl) gameOverHintEl.hidden = true;
  if (scoreboardCloseBtn) scoreboardCloseBtn.hidden = false;
}

function openScoreboardPanel() {
  scoreboardPanelPreviousFocus = document.activeElement;
  applyScoreboardRecordsLayout();
  renderGameOverScoreboard(null, state.mode);
  gameOverOverlay.hidden = false;
  requestAnimationFrame(() => {
    try {
      scoreboardCloseBtn?.focus({ preventScroll: true });
    } catch (_) {}
  });
}

function closeScoreboardPanel() {
  gameOverOverlay.hidden = true;
  applyGameOverEndedLayout();
  const p = scoreboardPanelPreviousFocus;
  scoreboardPanelPreviousFocus = null;
  if (p instanceof HTMLElement && p.isConnected && !gameOverOverlay.contains(p)) {
    try {
      p.focus({ preventScroll: true });
    } catch (_) {}
  }
}

function isScoreboardRecordsView() {
  return !gameOverOverlay.hidden && gameOverOverlay.classList.contains("game-over-overlay--records");
}

function syncLvWrapVisibility() {
  const wrap = document.getElementById("targetLvWrap");
  if (!wrap) return;
  const lvInMarquee =
    state.mode === "word" && wordMarqueeEl && !wordMarqueeEl.hidden;
  wrap.hidden = lvInMarquee;
}

function updateScore() {
  const drain = getDrainPerSec();
  const lv = getDifficultyLv();
  const sv = document.getElementById("scoreValue");
  const stv = document.getElementById("streakValue");
  const lvv = document.getElementById("lvValue");
  const lvm = document.getElementById("lvValueMarquee");
  const ucv = document.getElementById("upgradeCountdownValue");
  const ucm = document.getElementById("upgradeCountdownMarquee");
  const dv = document.getElementById("drainValue");
  const cd = formatUpgradeCountdown();
  if (sv) sv.textContent = String(state.score);
  if (stv) stv.textContent = String(state.streak);
  if (lvv) lvv.textContent = String(lv);
  if (lvm) lvm.textContent = String(lv);
  if (ucv) ucv.textContent = cd;
  if (ucm) ucm.textContent = cd;
  if (dv) dv.textContent = String(drain);
  syncLvWrapVisibility();
  if (!sv) {
    scoreEl.textContent = `分數：${state.score}　連續：${state.streak}　遞減：${drain}/秒`;
  }
}

function updateEnergyBar() {
  const pct = Math.max(0, Math.min(ENERGY_MAX, state.energy));
  energyFillEl.style.width = `${pct}%`;
  energyFillEl.classList.toggle("energy-low", pct < 30);
  energyFillEl.classList.toggle("energy-critical", pct < 15);
}

let targetAreaAnimTimer = 0;
let energyFillBumpTimer = 0;

function pulseTargetArea(kind) {
  if (!targetAreaEl) return;
  targetAreaEl.classList.remove("anim-target-ok", "anim-target-bad");
  void targetAreaEl.offsetWidth;
  targetAreaEl.classList.add(kind === "ok" ? "anim-target-ok" : "anim-target-bad");
  window.clearTimeout(targetAreaAnimTimer);
  targetAreaAnimTimer = window.setTimeout(() => {
    targetAreaEl.classList.remove("anim-target-ok", "anim-target-bad");
  }, 450);
}

function pulseEnergyFill(direction) {
  if (!energyFillEl) return;
  energyFillEl.classList.remove("anim-energy-up", "anim-energy-down");
  void energyFillEl.offsetWidth;
  energyFillEl.classList.add(direction === "up" ? "anim-energy-up" : "anim-energy-down");
  window.clearTimeout(energyFillBumpTimer);
  energyFillBumpTimer = window.setTimeout(() => {
    energyFillEl.classList.remove("anim-energy-up", "anim-energy-down");
  }, 500);
}

function beginFreshRun() {
  state.gameOver = false;
  state.energy = ENERGY_MAX;
  state.lastEnergyTs = performance.now();
  state.energyDrainStarted = false;
  state.score = 0;
  state.streak = 0;
  state.correctCount = 0;
  state.wrongCount = 0;
  state.streakMax = 0;
  // 重置最高等級為 1 級（不論起始難度設定）
  state.maxLevelAchieved = DRAIN_PER_SEC_MIN;
  updateScore();
  updateEnergyBar();
  applyGameOverEndedLayout();
  gameOverOverlay.hidden = true;
  const prev = gameOverPreviousFocus;
  gameOverPreviousFocus = null;
  if (prev instanceof HTMLElement && prev.isConnected && !gameOverOverlay.contains(prev)) {
    try {
      prev.focus({ preventScroll: true });
    } catch (_) {}
  }
}

function endRun() {
  if (state.gameOver) return;
  state.gameOver = true;
  state.expected = "";
  resetKeyColors();
  const rec = {
    ts: Date.now(),
    mode: state.mode,
    score: state.score,
    correct: state.correctCount,
    wrong: state.wrongCount,
    streak: state.streakMax,
  };
  const brokeRecord = isNewPersonalBestBeforeMerge(rec);
  mergeScoreArchive(rec);
  playSfxGameOver();
  if (brokeRecord) {
    window.setTimeout(() => playSfxNewRecord(), 400);
  }
  applyGameOverEndedLayout();
  gameOverFinalScoreEl.textContent = `最終分數：${state.score}`;
  renderGameOverScoreboard(rec.ts, state.mode);
  gameOverPreviousFocus = document.activeElement;
  gameOverOverlay.hidden = false;
  requestAnimationFrame(() => {
    try {
      playAgainBtn.focus({ preventScroll: true });
    } catch (_) {}
  });
}

function startNewRun() {
  beginFreshRun();
  nextRound();
}

function energyTick(now) {
  if (
    !state.gameOver &&
    document.visibilityState === "visible" &&
    state.expected &&
    state.energyDrainStarted
  ) {
    const dt = Math.min(1.5, Math.max(0, (now - state.lastEnergyTs) / 1000));
    state.lastEnergyTs = now;
    state.energy = Math.max(0, state.energy - getDrainPerSec() * dt);
    updateEnergyBar();
    if (state.energy <= 0) endRun();
  } else {
    state.lastEnergyTs = now;
  }
  requestAnimationFrame(energyTick);
}

function buildKeyboard() {
  keyboardEl.innerHTML = "";
  state.keys.clear();

  KEYBOARD_ROWS.forEach((rowText, rowIdx) => {
    const row = document.createElement("div");
    row.className = "kbd-row";
    if (rowIdx > 0) row.classList.add(`offset-${rowIdx}`);

    for (const ch of rowText) {
      const key = document.createElement("div");
      key.className = "key";
      const low = ch.toLowerCase();
      key.dataset.key = low;
      const finger = FINGER_BY_PHYSICAL_KEY[low];
      if (finger) key.dataset.finger = finger;
      if (low === "f") key.id = "key-cap-f";
      else if (low === "j") key.id = "key-cap-j";
      key.innerHTML = `<div class="main">${ch}</div><div class="sub"></div>`;
      row.appendChild(key);
      state.keys.set(ch.toLowerCase(), key);
    }

    keyboardEl.appendChild(row);
  });

  const spaceRow = document.createElement("div");
  spaceRow.className = "kbd-row kbd-row-space";
  const leftSp = document.createElement("div");
  leftSp.className = "kbd-spacer";
  leftSp.setAttribute("aria-hidden", "true");
  const space = document.createElement("div");
  space.className = "key key-space";
  space.dataset.key = " ";
  space.dataset.finger = "th";
  space.innerHTML = `<div class="main">Space</div><div class="sub">空白</div>`;
  const rightSp = document.createElement("div");
  rightSp.className = "kbd-spacer";
  rightSp.setAttribute("aria-hidden", "true");
  spaceRow.appendChild(leftSp);
  spaceRow.appendChild(space);
  spaceRow.appendChild(rightSp);
  keyboardEl.appendChild(spaceRow);
  state.keys.set(" ", space);

  setKeyboardMode(state.mode);
}

function setKeyboardMode(mode) {
  if (mode === "bopomofo" || mode === "bopomofo_word") {
    const reverse = {};
    for (const [z, k] of Object.entries(BOPOMOFO_KEYMAP)) reverse[k] = z;
    state.keys.forEach((el, key) => {
      const main = key.toUpperCase();
      const sub = reverse[key] ?? "";
      el.innerHTML = `<div class="main">${main}</div><div class="sub">${sub}</div>`;
    });
  } else {
    state.keys.forEach((el, key) => {
      el.innerHTML = `<div class="main">${key.toUpperCase()}</div><div class="sub"></div>`;
    });
  }
  if (state.keys.has(" ")) {
    const spaceEl = state.keys.get(" ");
    if (mode === "bopomofo" || mode === "bopomofo_word") {
      spaceEl.innerHTML = `<div class="main">Space</div><div class="sub">一聲/分節</div>`;
    } else {
      spaceEl.innerHTML = `<div class="main">Space</div><div class="sub"></div>`;
    }
  }
}

function resetKeyColors() {
  state.keys.forEach((el) => {
    el.classList.remove("key-target", "key-ok", "key-bad");
  });
}

function paintKeys(expected, pressed = "", ok = false) {
  resetKeyColors();
  const e = expected.toLowerCase();
  const p = pressed.toLowerCase();
  if (state.keys.has(e)) state.keys.get(e).classList.add("key-target");
  if (state.keys.has(p)) state.keys.get(p).classList.add(ok ? "key-ok" : "key-bad");
}

function randomFrom(str) {
  return str[Math.floor(Math.random() * str.length)];
}

function speakUtterance(text, lang = "en-US") {
  if (!text || typeof window.speechSynthesis === "undefined") return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = state.speakRate;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (_) {}
}

/** 手動「發音（目前題目）」按鈕：不受「發音」主開關與自動時機影響 */
function speakCurrentQuestion() {
  if (state.gameOver || !state.expected) return;
  switch (state.mode) {
    case "word":
      if (state.currentWordEn) speakUtterance(state.currentWordEn, "en-US");
      break;
    case "english":
      speakUtterance(String(state.expected || "").toUpperCase(), "en-US");
      break;
    case "letter":
      speakUtterance(String(state.chars[state.pos] ?? state.expected), "en-US");
      break;
    case "bopomofo": {
      const sym = state.chars[state.pos] ?? state.chars[0];
      if (sym) speakUtterance(sym, "zh-TW");
      break;
    }
    case "bopomofo_word":
      if (state.bopomofoWordHan) speakUtterance(state.bopomofoWordHan, "zh-TW");
      break;
    default:
      break;
  }
}

function parseBopomofoKeys(bopText) {
  const keys = [];
  const symbols = [];
  const syllables = String(bopText)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const syl of syllables) {
    let hasTone = false;
    for (const ch of [...syl]) {
      if (!BOPOMOFO_KEYMAP[ch]) continue;
      if (BOPOMOFO_TONE_MARKS.has(ch)) hasTone = true;
      keys.push(BOPOMOFO_KEYMAP[ch].toLowerCase());
      symbols.push(ch);
    }
    // 嚴謹模式：若該音節沒標聲調，視為一聲，要求按空白鍵。
    if (!hasTone) {
      keys.push(" ");
      symbols.push("ˉ");
    }
  }
  return { keys, symbols };
}

function normalizeWordPoolEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const en = String(x.en ?? "").trim().toLowerCase();
    const zh = String(x.zh ?? "").trim();
    if (!/^[a-z]+$/.test(en) || !zh) continue;
    const topic = String(x.topic ?? "").trim() || "其他";
    let img = String(x.img ?? "").trim();
    if (img && (!/^[\w./-]+$/.test(img) || img.includes(".."))) img = "";
    const row = { en, zh, topic };
    if (img) row.img = img;
    out.push(row);
  }
  return out;
}

/** 題目附圖 URL：`img` 優先；`國家` 預設 `images/flags/{en}.svg` */
function getWordItemImageUrl(item) {
  if (!item || !item.en) return "";
  const explicit = String(item.img ?? "").trim();
  if (explicit && /^[\w./-]+$/.test(explicit) && !explicit.includes("..")) return explicit;
  if (item.topic === "國家") return `images/flags/${item.en}.svg`;
  return "";
}

function normalizeBopomofoWordPoolEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const han = String(x.han ?? "").trim();
    const bop = String(x.bop ?? "").trim();
    if (!han || !bop) continue;
    const seq = parseBopomofoKeys(bop);
    if (!seq.keys.length) continue;
    out.push({ han, bop });
  }
  return out;
}

function applyWordTopicFilter() {
  if (!wordPoolFull.length) {
    wordPool = [];
    return;
  }
  if (state.wordTopicFilters == null) {
    wordPool = wordPoolFull.map((o) => ({ ...o }));
    return;
  }
  const filtered = wordPoolFull.filter((x) => state.wordTopicFilters.has(x.topic));
  const use = filtered.length ? filtered : wordPoolFull;
  wordPool = use.map((o) => ({ ...o }));
}

function syncWordTopicSummaryMeta() {
  if (!wordTopicSummaryMetaEl) return;
  if (state.wordTopicFilters == null) {
    wordTopicSummaryMetaEl.textContent = "全部";
  } else {
    wordTopicSummaryMetaEl.textContent = `已選 ${state.wordTopicFilters.size} 種`;
  }
}

function updateWordTopicSectionVisibility() {
  if (!wordTopicDetailsEl) return;
  wordTopicDetailsEl.hidden = state.mode !== "word";
}

function finishWordTopicHydration() {
  if (!pendingWordTopicKeys || pendingWordTopicKeys.length === 0) {
    state.wordTopicFilters = null;
  } else if (wordPoolFull.length) {
    const valid = new Set(wordPoolFull.map((x) => x.topic));
    const s = new Set(pendingWordTopicKeys.filter((t) => valid.has(t)));
    state.wordTopicFilters = s.size ? s : null;
  } else {
    state.wordTopicFilters = null;
  }
  pendingWordTopicKeys = null;
  applyWordTopicFilter();
  syncWordTopicSummaryMeta();
}

function syncWordTopicButtonStyles() {
  if (!wordTopicBarEl) return;
  wordTopicBarEl.querySelectorAll(".topic-btn").forEach((btn) => {
    btn.classList.remove("topic-btn--on");
  });
  if (state.wordTopicFilters == null) {
    wordTopicBarEl.querySelector(".topic-btn--all")?.classList.add("topic-btn--on");
  } else {
    wordTopicBarEl.querySelectorAll(".topic-btn[data-topic]").forEach((btn) => {
      if (state.wordTopicFilters.has(btn.dataset.topic)) btn.classList.add("topic-btn--on");
    });
  }
  syncWordTopicSummaryMeta();
}

function onWordTopicFilterChanged() {
  applyWordTopicFilter();
  savePrefs();
  if (state.mode === "word" && !state.gameOver) {
    nextRound();
  }
}

function onWordTopicBarClick(ev) {
  const btn = ev.target.closest(".topic-btn");
  if (!btn || !wordTopicBarEl.contains(btn)) return;
  if (btn.dataset.role === "all") {
    state.wordTopicFilters = null;
  } else if (btn.dataset.topic) {
    const t = btn.dataset.topic;
    if (state.wordTopicFilters == null) {
      state.wordTopicFilters = new Set([t]);
    } else {
      if (state.wordTopicFilters.has(t)) state.wordTopicFilters.delete(t);
      else state.wordTopicFilters.add(t);
      if (state.wordTopicFilters.size === 0) state.wordTopicFilters = null;
    }
  }
  syncWordTopicButtonStyles();
  onWordTopicFilterChanged();
}

if (wordTopicBarEl) {
  wordTopicBarEl.addEventListener("click", onWordTopicBarClick);
}

function buildWordTopicBar() {
  if (!wordTopicBarEl) return;
  wordTopicBarEl.replaceChildren();
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "topic-btn topic-btn--all";
  allBtn.textContent = "全部";
  allBtn.dataset.role = "all";
  wordTopicBarEl.appendChild(allBtn);

  const topics = [...new Set(wordPoolFull.map((x) => x.topic))].sort((a, b) =>
    a.localeCompare(b, "zh-Hant")
  );
  for (const t of topics) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "topic-btn";
    b.textContent = t;
    b.dataset.topic = t;
    wordTopicBarEl.appendChild(b);
  }

  syncWordTopicButtonStyles();
}

function loadVocabViaScriptTag() {
  return new Promise((resolve, reject) => {
    if (window.__KEYBOARD_GAME_VOCAB__) {
      resolve(window.__KEYBOARD_GAME_VOCAB__);
      return;
    }
    const existing = document.querySelector('script[data-vocab-loader="1"]');
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.__KEYBOARD_GAME_VOCAB__) resolve(window.__KEYBOARD_GAME_VOCAB__);
        else reject(new Error("empty"));
      });
      existing.addEventListener("error", () => reject(new Error("fail")));
      return;
    }
    const s = document.createElement("script");
    s.src = "data/vocabulary.js";
    s.dataset.vocabLoader = "1";
    s.onload = () => {
      if (window.__KEYBOARD_GAME_VOCAB__) resolve(window.__KEYBOARD_GAME_VOCAB__);
      else reject(new Error("empty"));
    };
    s.onerror = () => reject(new Error("fail"));
    document.head.appendChild(s);
  });
}

async function loadVocabJsonData() {
  try {
    const res = await fetch("data/vocabulary.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (_) {
    if (window.__KEYBOARD_GAME_VOCAB__) return window.__KEYBOARD_GAME_VOCAB__;
    return loadVocabViaScriptTag();
  }
}

function applyVocabLoadWarning(usedFallback) {
  let el = document.getElementById("vocabLoadWarn");
  if (!el) {
    el = document.createElement("p");
    el.id = "vocabLoadWarn";
    el.className = "vocab-load-warn";
    el.setAttribute("role", "status");
    const anchor = document.querySelector(".modes");
    if (anchor) anchor.insertAdjacentElement("beforebegin", el);
  }
  if (usedFallback) {
    el.hidden = false;
    el.textContent =
      "辭彙庫載入失敗，目前僅使用內建少數單字（種類標籤會不完整）。請在 web 目錄執行 python -m http.server 8000，再以 http://localhost:8000 開啟；或直接雙擊 index.html 並確認 data/vocabulary.js 存在。";
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

async function loadVocabulary() {
  const fbW = normalizeWordPoolEntries(DEFAULT_WORD_POOL.map((o) => ({ ...o })));
  const fbB = DEFAULT_BOPOMOFO_WORD_POOL.map((o) => ({ ...o }));
  let usedFallback = false;
  try {
    const data = await loadVocabJsonData();
    const w = normalizeWordPoolEntries(data.wordPool);
    const b = normalizeBopomofoWordPoolEntries(data.bopomofoWordPool);
    wordPoolFull = w.length ? w : fbW;
    usedFallback = !w.length;
    finishWordTopicHydration();
    bopomofoWordPool = b.length ? b : fbB;
  } catch (_) {
    wordPoolFull = fbW;
    usedFallback = true;
    finishWordTopicHydration();
    bopomofoWordPool = fbB;
  }
  applyVocabLoadWarning(usedFallback);
}

function renderProgressText(chars, pos, upper = false) {
  const done = chars.slice(0, pos).join("");
  const pending = chars.slice(pos).join("");
  const doneText = upper ? done.toUpperCase() : done;
  const pendingText = upper ? pending.toUpperCase() : pending;
  return `<span class="done">${doneText}</span><span class="pending">${pendingText}</span>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pickWordItem(excludeEn = "") {
  if (!wordPool.length) return null;
  if (wordPool.length === 1) return wordPool[0];
  for (let i = 0; i < 80; i++) {
    const item = wordPool[Math.floor(Math.random() * wordPool.length)];
    if (item.en !== excludeEn) return item;
  }
  return wordPool[0];
}

function applyWordItemToGameState(item) {
  if (!item || !item.en) {
    state.currentWordItem = null;
    state.currentWordEn = "";
    state.currentWordZh = "";
    state.chars = [];
    state.pos = 0;
    state.expected = "";
    return;
  }
  state.currentWordItem = {
    en: item.en,
    zh: item.zh,
    topic: item.topic,
    ...(item.img ? { img: item.img } : {}),
  };
  state.currentWordEn = item.en;
  state.currentWordZh = item.zh;
  state.chars = [...item.en];
  state.pos = 0;
  state.expected = state.chars[0].toLowerCase();
}

function renderWordMarqueePrevHtml(item) {
  if (!item || !item.en) {
    return `<span class="word-marquee-label">已完成</span><div class="word-marquee-side-en">—</div>`;
  }
  return `<span class="word-marquee-label">已完成</span><div class="word-marquee-side-en">${item.en.toUpperCase()}</div>`;
}

/** 左欄：有目前題目附圖則顯示圖（取代「已完成」區）；否則維持已完成文字 */
function renderWordMarqueeLeftHtml() {
  const cur = state.currentWordItem;
  const url = cur ? getWordItemImageUrl(cur) : "";
  if (url) {
    const alt = escapeHtml(cur.zh || cur.en);
    return `<div class="word-marquee-visual"><img class="word-marquee-img" src="${escapeHtml(url)}" alt="${alt}" loading="lazy" decoding="async" /></div>`;
  }
  return renderWordMarqueePrevHtml(state.lastCompletedWord);
}

function renderWordMarqueeNextHtml(item) {
  if (!item || !item.en) {
    return `<span class="word-marquee-label">下一題</span><div class="word-marquee-side-en">—</div>`;
  }
  return `<span class="word-marquee-label">下一題</span><div class="word-marquee-side-en">${item.en.toUpperCase()}</div>`;
}

function bindWordMarqueeImgFallback() {
  const img = wordMarqueePanePrevEl.querySelector(".word-marquee-img");
  if (!img) return;
  img.addEventListener(
    "error",
    () => {
      wordMarqueePanePrevEl.classList.remove("word-marquee-col--has-img");
      wordMarqueePanePrevEl.innerHTML = renderWordMarqueePrevHtml(state.lastCompletedWord);
    },
    { once: true }
  );
}

function renderWordMarqueePanes() {
  const imgUrl = state.currentWordItem ? getWordItemImageUrl(state.currentWordItem) : "";
  wordMarqueePanePrevEl.classList.toggle("word-marquee-col--has-img", !!imgUrl);
  wordMarqueePanePrevEl.innerHTML = renderWordMarqueeLeftHtml();
  if (imgUrl) {
    requestAnimationFrame(() => bindWordMarqueeImgFallback());
  }
  wordMarqueePaneCurrentEl.innerHTML = `<span class="word-marquee-label word-marquee-lv-label" title="LV：目前每秒遞減；升級倒數：再幾次答對後每秒遞減+1（已封頂顯示 —）"><span class="word-marquee-lv-part">LV:<strong id="lvValueMarquee"></strong></span><span class="word-marquee-lv-part word-marquee-lv-countdown">升級倒數:<strong id="upgradeCountdownMarquee"></strong></span></span><div class="word-marquee-en">${renderProgressText(state.chars, state.pos, true)}</div><div class="word-marquee-zh">${escapeHtml(state.currentWordZh)}</div>`;
  wordMarqueePaneNextEl.innerHTML = renderWordMarqueeNextHtml(state.nextWordItem);
  updateScore();
}

function updateWordMarqueeTypingDisplay() {
  const wrap = wordMarqueePaneCurrentEl.querySelector(".word-marquee-en");
  if (wrap) wrap.innerHTML = renderProgressText(state.chars, state.pos, true);
}

/**
 * 將右欄「下一題」原樣設為「目前」；只對新的「下一題」隨機抽選。
 * @param {object} opts
 * @param {boolean} [opts.recordCurrentAsCompleted=true] 是否把當前題記入左欄「已完成」（答完單字用 true；跳過未完成題用 false）
 */
function promoteWordMarqueeNextToCurrent(opts = {}) {
  const recordCurrentAsCompleted = opts.recordCurrentAsCompleted !== false;
  if (!state.nextWordItem) return false;
  if (recordCurrentAsCompleted && state.currentWordEn) {
    state.lastCompletedWord = { en: state.currentWordEn, zh: state.currentWordZh };
  }
  const promoted = {
    en: state.nextWordItem.en,
    zh: state.nextWordItem.zh,
    topic: state.nextWordItem.topic,
    ...(state.nextWordItem.img ? { img: state.nextWordItem.img } : {}),
  };
  state.nextWordItem = pickWordItem(promoted.en);
  applyWordItemToGameState(promoted);
  renderWordMarqueePanes();
  paintKeys(state.expected);
  hintEl.textContent = `逐字打出單字，現在請按：「${state.expected.toUpperCase()}」`;
  if (state.speakWhen === "onQuestion" && state.currentWordEn) speakUtterance(state.currentWordEn, "en-US");
  return true;
}

function wordMarqueeAdvanceToNext() {
  promoteWordMarqueeNextToCurrent({ recordCurrentAsCompleted: true });
}

function nextRound() {
  if (state.gameOver) return;
  if (state.mode !== "word") {
    wordMarqueeEl.hidden = true;
    targetEl.hidden = false;
    state.nextWordItem = null;
    state.lastCompletedWord = null;
    state.currentWordItem = null;
  }
  setKeyboardMode(state.mode);
  state.currentWordEn = "";
  state.currentWordZh = "";
  state.currentWordItem = null;
  state.bopomofoWordHan = "";
  state.bopSeqChars = [];
  seqEl.innerHTML = "";
  translateEl.textContent = "";

  if (state.mode === "word") {
    if (!wordPool.length) {
      wordMarqueeEl.hidden = true;
      targetEl.hidden = false;
      const c = randomFrom("abcdefghijklmnopqrstuvwxyz0123456789");
      state.chars = [c];
      state.pos = 0;
      state.expected = c;
      targetEl.textContent = /[a-z]/.test(c) ? c.toUpperCase() : c;
      hintEl.textContent = "英文辭彙庫為空，請檢查 data/vocabulary.json 的 wordPool";
      return;
    }
    wordMarqueeEl.hidden = false;
    targetEl.hidden = true;
    translateEl.textContent = "";
    state.lastCompletedWord = null;
    const cur = pickWordItem();
    applyWordItemToGameState(cur);
    state.nextWordItem = pickWordItem(cur.en);
    renderWordMarqueePanes();
    hintEl.textContent = `逐字打出單字，現在請按：「${state.expected.toUpperCase()}」`;
    paintKeys(state.expected);
    if (state.speakWhen === "onQuestion" && state.currentWordEn) speakUtterance(state.currentWordEn, "en-US");
    return;
  } else if (state.mode === "bopomofo_word") {
    if (!bopomofoWordPool.length) {
      const c = randomFrom("abcdefghijklmnopqrstuvwxyz");
      state.chars = [c];
      state.pos = 0;
      state.expected = c;
      targetEl.textContent = c.toUpperCase();
      hintEl.textContent = "注音辭彙庫為空，請檢查 data/vocabulary.json 的 bopomofoWordPool";
      seqEl.innerHTML = "";
      translateEl.textContent = "";
      return;
    }
    const item = bopomofoWordPool[Math.floor(Math.random() * bopomofoWordPool.length)];
    const seq = parseBopomofoKeys(item.bop);
    if (!seq.keys.length) {
      state.bopomofoWordHan = "";
      state.chars = ["a"];
      state.pos = 0;
      state.expected = "a";
      targetEl.textContent = "A";
      hintEl.textContent = "資料錯誤，改為英文字母";
      seqEl.innerHTML = "";
    } else {
      state.chars = seq.keys;
      state.pos = 0;
      state.expected = state.chars[0];
      state.bopomofoWordHan = item.han;
      targetEl.textContent = item.han;
      translateEl.textContent = item.bop;
      hintEl.textContent = `注音拼字：請依序打出「${item.han}」的注音鍵`;
      state.bopSeqChars = seq.symbols;
      seqEl.innerHTML = renderProgressText(state.bopSeqChars, 0, false);
    }
  } else if (state.mode === "english") {
    const c = randomFrom("abcdefghijklmnopqrstuvwxyz");
    state.chars = [c];
    state.pos = 0;
    state.expected = c;
    targetEl.textContent = c.toUpperCase();
    hintEl.textContent = "純英文模式：請按下這個英文字母";
  } else if (state.mode === "bopomofo") {
    const symbol = BOPOMOFO_SYMBOLS[Math.floor(Math.random() * BOPOMOFO_SYMBOLS.length)];
    const key = BOPOMOFO_KEYMAP[symbol];
    state.chars = [symbol];
    state.pos = 0;
    state.expected = key.toLowerCase();
    targetEl.textContent = symbol;
    hintEl.textContent = `注音模式：請按對應鍵（目前是「${symbol}」）`;
    seqEl.textContent = symbol;
    translateEl.textContent = `鍵位：${key.toUpperCase()}`;
  } else {
    const c = randomFrom("abcdefghijklmnopqrstuvwxyz0123456789");
    state.chars = [c];
    state.pos = 0;
    state.expected = c;
    targetEl.textContent = /[a-z]/.test(c) ? c.toUpperCase() : c;
    hintEl.textContent = "請按下鍵盤上的這一個鍵";
  }

  paintKeys(state.expected);
}

function onModeChange(mode) {
  state.mode = mode;
  savePrefs();
  updateWordTopicSectionVisibility();
  beginFreshRun();
  nextRound();
}

function onKeyDown(ev) {
  if (isScoreboardRecordsView()) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeScoreboardPanel();
    }
    return;
  }
  if (state.gameOver) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      startNewRun();
    }
    return;
  }
  if (!state.expected) return;
  let k = (ev.key || "").toLowerCase();
  if (ev.code === "Space") k = " ";
  if (!k || k.length !== 1) return;

  if (!state.energyDrainStarted) {
    state.energyDrainStarted = true;
    state.lastEnergyTs = performance.now();
  }

  if (k === state.expected) {
    state.correctCount += 1;
    const basePts = 1 + Math.min(state.streak, 5);
    const mult = getScoreRewardMultiplier();
    state.score += Math.max(1, Math.round(basePts * mult));
    state.streak += 1;
    state.streakMax = Math.max(state.streakMax, state.streak);
    // 更新最高等級：連續正確時提升等級，錯誤不降級
    // 基於連續次數計算等級，從1開始，每36次連續+1級
    const streakBasedLevel = DRAIN_PER_SEC_MIN + Math.floor(state.streak / STREAK_HITS_PER_DRAIN_PLUS_ONE);
    const cappedLevel = Math.min(DRAIN_PER_SEC_MAX, streakBasedLevel);
    state.maxLevelAchieved = Math.max(state.maxLevelAchieved, cappedLevel);
    state.energy = Math.min(ENERGY_MAX, state.energy + GAIN_CORRECT);
    updateEnergyBar();
    pulseEnergyFill("up");
    pulseTargetArea("ok");
    playSfxKeyCorrect();
    paintKeys(state.expected, k, true);

    if ((state.mode === "word" || state.mode === "bopomofo_word") && state.pos + 1 < state.chars.length) {
      state.pos += 1;
      state.expected = state.chars[state.pos].toLowerCase();
      if (state.mode === "word") {
        updateWordMarqueeTypingDisplay();
        hintEl.textContent = `很好！下一個請按：「${state.expected.toUpperCase()}」`;
      } else {
        seqEl.innerHTML = renderProgressText(state.bopSeqChars, state.pos, false);
        const keyLabel = state.expected === " " ? "Space（空白）" : state.expected.toUpperCase();
        hintEl.textContent = `很好！注音拼字下一鍵：「${keyLabel}」`;
      }
      paintKeys(state.expected);
    } else {
      if (state.mode === "word" && state.currentWordEn && state.speakWhen === "onComplete") {
        speakUtterance(state.currentWordEn, "en-US");
      }
      if (state.mode === "word" && wordPool.length) {
        wordMarqueeAdvanceToNext();
      } else {
        nextRound();
      }
    }
  } else {
    state.wrongCount += 1;
    state.streak = 0;
    state.energy = Math.max(0, state.energy - PENALTY_WRONG);
    updateEnergyBar();
    pulseEnergyFill("down");
    pulseTargetArea("bad");
    playSfxKeyWrong();
    if (state.mode === "bopomofo" || state.mode === "bopomofo_word") {
      const symbol = state.chars[0] ?? "?";
      if (state.mode === "bopomofo_word") {
        const keyLabel = state.expected === " " ? "Space（空白）" : state.expected.toUpperCase();
        hintEl.textContent = `差一點，再試試！請依序按「${keyLabel}」`;
      } else {
        const keyLabel = state.expected === " " ? "Space（空白）" : state.expected.toUpperCase();
        hintEl.textContent = `差一點，再試試！「${symbol}」要按鍵盤「${keyLabel}」`;
      }
    } else {
      hintEl.textContent = `差一點，再試試！需要按的是「${state.expected.toUpperCase()}」`;
    }
    paintKeys(state.expected, k, false);
    if (state.energy <= 0) endRun();
  }

  updateScore();
}

skipBtn.addEventListener("click", () => {
  if (state.gameOver) return;
  state.streak = 0;
  updateScore();
  if (state.mode === "word" && wordPool.length && state.nextWordItem) {
    setKeyboardMode(state.mode);
    promoteWordMarqueeNextToCurrent({ recordCurrentAsCompleted: false });
  } else {
    nextRound();
  }
});

speakCurrentBtn.addEventListener("click", () => {
  speakCurrentQuestion();
});

playAgainBtn.addEventListener("click", () => {
  startNewRun();
});

openScoreboardBtn?.addEventListener("click", () => {
  openScoreboardPanel();
});

scoreboardCloseBtn?.addEventListener("click", () => {
  closeScoreboardPanel();
});

scoreboardModeSelectEl?.addEventListener("change", () => {
  renderGameOverScoreboard(null, scoreboardModeSelectEl.value);
});

modeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) onModeChange(input.value);
  });
});

function onShowKeyboardToggle() {
  const next = !!keyboardToggleEl.checked;
  if (next === state.showKeyboard) return;
  state.showKeyboard = next;
  applyKeyboardVisibility();
  savePrefs();
}
/* input 較早觸發；change 補少數環境。以 state 去重，同一擊只會存檔一次 */
keyboardToggleEl.addEventListener("input", onShowKeyboardToggle);
keyboardToggleEl.addEventListener("change", onShowKeyboardToggle);

function onKeySfxToggle() {
  if (!keySfxToggleEl) return;
  const next = !!keySfxToggleEl.checked;
  if (next === state.sfxKeyEnabled) return;
  state.sfxKeyEnabled = next;
  savePrefs();
  if (next) {
    const ctx = getSfxAudioContext();
    resumeSfxContext(ctx);
  }
}
keySfxToggleEl?.addEventListener("input", onKeySfxToggle);
keySfxToggleEl?.addEventListener("change", onKeySfxToggle);

function syncSpeakWhenFromState() {
  const autoOn = state.speakWhen !== "off";
  speakAutoToggleEl.checked = autoOn;
  speakWhenSelectEl.disabled = !autoOn;
  if (autoOn) {
    const v = state.speakWhen === "onQuestion" || state.speakWhen === "onComplete" ? state.speakWhen : "onComplete";
    speakWhenSelectEl.value = v;
  }
}

function onSpeakAutoToggle() {
  if (speakAutoToggleEl.checked) {
    speakWhenSelectEl.disabled = false;
    const v = speakWhenSelectEl.value === "onQuestion" || speakWhenSelectEl.value === "onComplete"
      ? speakWhenSelectEl.value
      : "onComplete";
    speakWhenSelectEl.value = v;
    state.speakWhen = v;
  } else {
    state.speakWhen = "off";
    speakWhenSelectEl.disabled = true;
  }
  savePrefs();
}

function onSpeakWhenSelectChange() {
  if (!speakAutoToggleEl.checked) return;
  const v = speakWhenSelectEl.value;
  if (v !== "onQuestion" && v !== "onComplete") return;
  state.speakWhen = v;
  savePrefs();
}

speakAutoToggleEl.addEventListener("input", onSpeakAutoToggle);
speakAutoToggleEl.addEventListener("change", onSpeakAutoToggle);
speakWhenSelectEl.addEventListener("change", onSpeakWhenSelectChange);

speakRateEl.addEventListener("change", () => {
  const v = Number(speakRateEl.value);
  if (!Number.isNaN(v)) {
    state.speakRate = v;
    savePrefs();
  }
});

function syncDrainPerSecInput() {
  drainPerSecEl.value = String(state.drainPerSec);
}

function onDrainPerSecAdjust() {
  state.drainPerSec = clampDrainPerSec(drainPerSecEl.value);
  syncDrainPerSecInput();
  state.lastEnergyTs = performance.now();
  updateScore();
  savePrefs();
}

drainPerSecEl.addEventListener("input", onDrainPerSecAdjust);
drainPerSecEl.addEventListener("change", onDrainPerSecAdjust);

window.addEventListener("keydown", onKeyDown);

loadPrefs();
modeInputs.forEach((el) => {
  el.checked = el.value === state.mode;
});
keyboardToggleEl.checked = state.showKeyboard;
if (keySfxToggleEl) keySfxToggleEl.checked = state.sfxKeyEnabled;
syncSpeakWhenFromState();
speakRateEl.value = String(state.speakRate);
syncDrainPerSecInput();
updateScore();

if (wordTopicDetailsEl) {
  wordTopicDetailsEl.open = state.wordTopicPanelOpen;
  wordTopicDetailsEl.addEventListener("toggle", () => {
    state.wordTopicPanelOpen = wordTopicDetailsEl.open;
    savePrefs();
  });
}
updateWordTopicSectionVisibility();

async function boot() {
  await loadVocabulary();
  buildWordTopicBar();
  buildKeyboard();
  applyKeyboardVisibility();
  state.energy = ENERGY_MAX;
  state.gameOver = false;
  state.lastEnergyTs = performance.now();
  state.energyDrainStarted = false;
  updateScore();
  updateEnergyBar();
  requestAnimationFrame(energyTick);
  nextRound();
}

boot();
