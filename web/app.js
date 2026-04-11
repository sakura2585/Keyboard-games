const KEYBOARD_ROWS = [
  "1234567890-",
  "QWERTYUIOP",
  "ASDFGHJKL;",
  "ZXCVBNM,./",
];

const ENERGY_MAX = 100;
const DRAIN_PER_SEC_MIN = 1;
const DRAIN_PER_SEC_MAX = 30;
const DRAIN_PER_SEC_DEFAULT = 8;
const GAIN_CORRECT = 6;
const PENALTY_WRONG = 12;

function clampDrainPerSec(n) {
  const x = Math.round(Number(n));
  if (Number.isNaN(x)) return DRAIN_PER_SEC_DEFAULT;
  return Math.min(DRAIN_PER_SEC_MAX, Math.max(DRAIN_PER_SEC_MIN, x));
}

function getDrainPerSec() {
  return state.drainPerSec;
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
const speakToggleEl = document.getElementById("speakToggle");
const speakRateEl = document.getElementById("speakRate");
const drainPerSecEl = document.getElementById("drainPerSec");
const energyFillEl = document.getElementById("energyFill");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverFinalScoreEl = document.getElementById("gameOverFinalScore");
const playAgainBtn = document.getElementById("playAgainBtn");

const state = {
  mode: "letter",
  score: 0,
  streak: 0,
  expected: "",
  chars: [],
  pos: 0,
  keys: new Map(),
  bopSeqChars: [],
  currentWordEn: "",
  currentWordZh: "",
  speakEnabled: true,
  speakRate: 1,
  showKeyboard: true,
  energy: ENERGY_MAX,
  gameOver: false,
  lastEnergyTs: 0,
  /** 本局第一次按下有效鍵前，時間造成的能量遞減不開始 */
  energyDrainStarted: false,
  /** 每秒時間造成的能量遞減（1–30） */
  drainPerSec: DRAIN_PER_SEC_DEFAULT,
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem("typing-game-web");
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (["letter", "english", "word", "bopomofo", "bopomofo_word"].includes(obj.mode)) state.mode = obj.mode;
    if (typeof obj.speakEnabled === "boolean") state.speakEnabled = obj.speakEnabled;
    if (typeof obj.speakRate === "number" && obj.speakRate >= 0.5 && obj.speakRate <= 1.5) state.speakRate = obj.speakRate;
    if (typeof obj.showKeyboard === "boolean") state.showKeyboard = obj.showKeyboard;
    if (typeof obj.drainPerSec === "number") {
      state.drainPerSec = clampDrainPerSec(obj.drainPerSec);
    } else if (["easy", "normal", "hard"].includes(obj.drainDifficulty)) {
      const legacy = { easy: 4, normal: 8, hard: 14 };
      state.drainPerSec = clampDrainPerSec(legacy[obj.drainDifficulty]);
    }
  } catch (_) {}
}

function savePrefs() {
  localStorage.setItem(
    "typing-game-web",
    JSON.stringify({
      mode: state.mode,
      speakEnabled: state.speakEnabled,
      speakRate: state.speakRate,
      showKeyboard: state.showKeyboard,
      drainPerSec: state.drainPerSec,
    })
  );
}

function applyKeyboardVisibility() {
  keyboardEl.hidden = !state.showKeyboard;
}

function updateScore() {
  scoreEl.textContent = `分數：${state.score}　連續：${state.streak}`;
}

function updateEnergyBar() {
  const pct = Math.max(0, Math.min(ENERGY_MAX, state.energy));
  energyFillEl.style.width = `${pct}%`;
  energyFillEl.classList.toggle("energy-low", pct < 30);
  energyFillEl.classList.toggle("energy-critical", pct < 15);
}

function beginFreshRun() {
  state.gameOver = false;
  state.energy = ENERGY_MAX;
  state.lastEnergyTs = performance.now();
  state.energyDrainStarted = false;
  state.score = 0;
  state.streak = 0;
  updateScore();
  updateEnergyBar();
  gameOverOverlay.hidden = true;
}

function endRun() {
  if (state.gameOver) return;
  state.gameOver = true;
  state.expected = "";
  resetKeyColors();
  gameOverFinalScoreEl.textContent = `最終分數：${state.score}`;
  gameOverOverlay.hidden = false;
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
      key.dataset.key = ch.toLowerCase();
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

function speakWord(text) {
  if (!state.speakEnabled || !text || typeof window.speechSynthesis === "undefined") return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = state.speakRate;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (_) {}
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
    out.push({ en, zh });
  }
  return out;
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

async function loadVocabulary() {
  const fbW = DEFAULT_WORD_POOL.map((o) => ({ ...o }));
  const fbB = DEFAULT_BOPOMOFO_WORD_POOL.map((o) => ({ ...o }));
  try {
    const res = await fetch("data/vocabulary.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const w = normalizeWordPoolEntries(data.wordPool);
    const b = normalizeBopomofoWordPoolEntries(data.bopomofoWordPool);
    wordPool = w.length ? w : fbW;
    bopomofoWordPool = b.length ? b : fbB;
  } catch (_) {
    wordPool = fbW;
    bopomofoWordPool = fbB;
  }
}

function renderProgressText(chars, pos, upper = false) {
  const done = chars.slice(0, pos).join("");
  const pending = chars.slice(pos).join("");
  const doneText = upper ? done.toUpperCase() : done;
  const pendingText = upper ? pending.toUpperCase() : pending;
  return `<span class="done">${doneText}</span><span class="pending">${pendingText}</span>`;
}

function nextRound() {
  if (state.gameOver) return;
  setKeyboardMode(state.mode);
  state.currentWordEn = "";
  state.currentWordZh = "";
  state.bopSeqChars = [];
  seqEl.innerHTML = "";
  translateEl.textContent = "";

  if (state.mode === "word") {
    if (!wordPool.length) {
      const c = randomFrom("abcdefghijklmnopqrstuvwxyz0123456789");
      state.chars = [c];
      state.pos = 0;
      state.expected = c;
      targetEl.textContent = /[a-z]/.test(c) ? c.toUpperCase() : c;
      hintEl.textContent = "英文辭彙庫為空，請檢查 data/vocabulary.json 的 wordPool";
      return;
    }
    const item = wordPool[Math.floor(Math.random() * wordPool.length)];
    state.currentWordEn = item.en;
    state.currentWordZh = item.zh;
    state.chars = [...item.en];
    state.pos = 0;
    state.expected = state.chars[0].toLowerCase();
    targetEl.innerHTML = renderProgressText(state.chars, state.pos, true);
    translateEl.textContent = item.zh;
    hintEl.textContent = `逐字打出單字，現在請按：「${state.expected.toUpperCase()}」`;
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
  beginFreshRun();
  nextRound();
}

function onKeyDown(ev) {
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
    state.score += 1 + Math.min(state.streak, 5);
    state.streak += 1;
    state.energy = Math.min(ENERGY_MAX, state.energy + GAIN_CORRECT);
    updateEnergyBar();
    paintKeys(state.expected, k, true);

    if ((state.mode === "word" || state.mode === "bopomofo_word") && state.pos + 1 < state.chars.length) {
      state.pos += 1;
      state.expected = state.chars[state.pos].toLowerCase();
      if (state.mode === "word") {
        targetEl.innerHTML = renderProgressText(state.chars, state.pos, true);
        hintEl.textContent = `很好！下一個請按：「${state.expected.toUpperCase()}」`;
      } else {
        seqEl.innerHTML = renderProgressText(state.bopSeqChars, state.pos, false);
        const keyLabel = state.expected === " " ? "Space（空白）" : state.expected.toUpperCase();
        hintEl.textContent = `很好！注音拼字下一鍵：「${keyLabel}」`;
      }
      paintKeys(state.expected);
    } else {
      if (state.mode === "word" && state.currentWordEn) {
        speakWord(state.currentWordEn);
      }
      nextRound();
    }
  } else {
    state.streak = 0;
    state.energy = Math.max(0, state.energy - PENALTY_WRONG);
    updateEnergyBar();
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
  nextRound();
});

playAgainBtn.addEventListener("click", () => {
  startNewRun();
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

speakToggleEl.addEventListener("change", () => {
  state.speakEnabled = !!speakToggleEl.checked;
  savePrefs();
});

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
speakToggleEl.checked = state.speakEnabled;
speakRateEl.value = String(state.speakRate);
syncDrainPerSecInput();

async function boot() {
  await loadVocabulary();
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
