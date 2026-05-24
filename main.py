# -*- coding: utf-8 -*-
"""鍵盤小遊戲：小朋友練習英數按鍵。"""
from __future__ import annotations

import json
import os
import random
import re
import string
import tempfile
import tkinter as tk
from tkinter import font as tkfont
from tkinter import ttk
from typing import Any, Dict, List

try:
    import pygame
    PYGAME_AVAILABLE = True
except ImportError:
    PYGAME_AVAILABLE = False
    print("pygame 未安裝，音效功能將被禁用。安裝方法：pip install pygame")

STATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state")
STATE_PATH = os.path.join(STATE_DIR, "app_state.json")
DEFAULT_GEOMETRY = "720x480"
SCHEMA_VERSION = 1

# 給「字詞」模式：預設單字（web/data/vocabulary.json 無法讀取或 wordPool 為空時使用）
_DEFAULT_WORD_POOL: List[str] = [
    "cat",
    "dog",
    "sun",
    "moon",
    "book",
    "hand",
    "tree",
    "fish",
    "star",
    "duck",
    "jump",
    "smile",
]


def _load_word_pool_from_vocabulary_json() -> List[str]:
    """與網頁版共用 web/data/vocabulary.json 的 wordPool。"""
    path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "web",
        "data",
        "vocabulary.json",
    )
    base = list(_DEFAULT_WORD_POOL)
    if not os.path.isfile(path):
        return base
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError, TypeError):
        return base
    if not isinstance(data, dict):
        return base
    raw = data.get("wordPool")
    if not isinstance(raw, list):
        return base
    out: List[str] = []
    for x in raw:
        if isinstance(x, dict):
            en = str(x.get("en") or "").strip().lower()
            if en.isalpha():
                out.append(en)
        elif isinstance(x, str):
            s = x.strip().lower()
            if s.isalpha():
                out.append(s)
    return out if out else base


WORD_POOL: List[str] = _load_word_pool_from_vocabulary_json()

KEYBOARD_ROWS: List[str] = [
    "1234567890-",
    "QWERTYUIOP",
    "ASDFGHJKL;",
    "ZXCVBNM,./",
]

# 注音符號 -> 實體鍵盤鍵位（台灣常見注音鍵位）
BOPOMOFO_KEYMAP: Dict[str, str] = {
    "ㄅ": "1",
    "ㄉ": "2",
    "ㄓ": "5",
    "ㄚ": "8",
    "ㄞ": "9",
    "ㄢ": "0",
    "ㄦ": "-",
    "ㄆ": "q",
    "ㄊ": "w",
    "ㄍ": "e",
    "ㄐ": "r",
    "ㄔ": "t",
    "ㄗ": "y",
    "ㄧ": "u",
    "ㄛ": "i",
    "ㄟ": "o",
    "ㄣ": "p",
    "ㄇ": "a",
    "ㄋ": "s",
    "ㄎ": "d",
    "ㄑ": "f",
    "ㄕ": "g",
    "ㄘ": "h",
    "ㄨ": "j",
    "ㄜ": "k",
    "ㄠ": "l",
    "ㄤ": ";",
    "ㄈ": "z",
    "ㄌ": "x",
    "ㄏ": "c",
    "ㄒ": "v",
    "ㄖ": "b",
    "ㄙ": "n",
    "ㄩ": "m",
    "ㄝ": ",",
    "ㄡ": ".",
    "ㄥ": "/",
}


def _atomic_write_json(path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        dir=os.path.dirname(path), prefix=".app_state_", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except OSError:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except OSError:
            pass


def load_state() -> Dict[str, Any]:
    default: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "geometry": DEFAULT_GEOMETRY,
        "difficulty": "letter",
    }
    if not os.path.isfile(STATE_PATH):
        return default
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, json.JSONDecodeError, TypeError):
        return default
    if not isinstance(raw, dict):
        return default
    ver = raw.get("schema_version", 1)
    if not isinstance(ver, int) or ver < 1 or ver > SCHEMA_VERSION:
        return default
    out = dict(default)
    g = raw.get("geometry")
    if isinstance(g, str) and g.strip():
        out["geometry"] = g.strip()
    d = raw.get("difficulty")
    if d in ("letter", "word", "english", "bopomofo"):
        out["difficulty"] = d
    return out


def save_state(geometry: str, difficulty: str) -> None:
    data = {
        "schema_version": SCHEMA_VERSION,
        "geometry": geometry,
        "difficulty": difficulty,
    }
    try:
        _atomic_write_json(STATE_PATH, data)
    except OSError:
        pass


_geom_re = re.compile(
    r"^(?P<w>\d+)x(?P<h>\d+)(?:\+(?P<x>-?\d+)\+(?P<y>-?\d+))?$"
)


def clamp_geometry(
    root: tk.Tk, geometry: str, default: str = DEFAULT_GEOMETRY
) -> str:
    m = _geom_re.match((geometry or "").strip().replace(" ", ""))
    if not m:
        return default
    w = int(m.group("w"))
    h = int(m.group("h"))
    x = int(m.group("x")) if m.group("x") is not None else None
    y = int(m.group("y")) if m.group("y") is not None else None
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    margin = 16
    if w < 100 or h < 80 or w > sw or h > sh:
        return default
    if x is None or y is None:
        x = max(margin, (sw - w) // 2)
        y = max(margin, (sh - h) // 2)
    else:
        x = max(margin, min(x, sw - w - margin))
        y = max(margin, min(y, sh - h - margin))
    return f"{w}x{h}+{x}+{y}"


class TypingGameApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("鍵盤小遊戲 · 練習英數")
        self.root.minsize(620, 500)
        self._state = load_state()
        geom = clamp_geometry(self.root, self._state.get("geometry", DEFAULT_GEOMETRY))
        self.root.geometry(geom)
        self.root.deiconify()

        self.score = 0
        self.streak = 0
        self.level = 1  # 新增：等級系統
        self._difficulty = str(self._state.get("difficulty", "letter"))
        self._mode_var = tk.StringVar(value=self._difficulty)
        self._target_chars: List[str] = []
        self._position = 0
        self._expected: str = ""
        self._kbd_labels: Dict[str, tk.Label] = {}
        self._kbd_text_base: Dict[str, str] = {}

        self.big_font = tkfont.Font(family="Segoe UI", size=72, weight="bold")
        self.hint_font = tkfont.Font(family="Segoe UI", size=16)
        
        # 初始化音效系統
        self._init_sound_system()

        self._build_ui()
        self._new_round()
        self.root.bind("<KeyPress>", self._on_key)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _init_sound_system(self) -> None:
        """初始化音效系統"""
        self.sound_enabled = PYGAME_AVAILABLE
        if not self.sound_enabled:
            return
        
        try:
            pygame.mixer.pre_init(frequency=22050, size=-16, channels=2, buffer=512)
            pygame.mixer.init()
            self._generate_sound_effects()
        except Exception as e:
            print(f"音效系統初始化失敗：{e}")
            self.sound_enabled = False

    def _generate_sound_effects(self) -> None:
        """產生音效（使用程式生成的音調）"""
        if not self.sound_enabled:
            return
        
        try:
            import numpy as np
            
            # 音效參數
            sample_rate = 22050
            
            # 正確音效：較高頻率，較大音量
            duration_correct = 0.15  # 增加音效長度
            freq_correct = 880  # 高音調
            t = np.linspace(0, duration_correct, int(sample_rate * duration_correct))
            wave_correct = np.sin(2 * np.pi * freq_correct * t)
            
            # 增大音量（原來可能太小）
            volume_multiplier = 0.3  # 增加音量
            wave_correct = (wave_correct * volume_multiplier * 32767).astype(np.int16)
            
            # 立體聲
            stereo_correct = np.array([wave_correct, wave_correct]).T
            self.sound_correct = pygame.sndarray.make_sound(stereo_correct)
            
            # 錯誤音效：較低頻率
            duration_wrong = 0.2
            freq_wrong = 220  # 低音調
            t2 = np.linspace(0, duration_wrong, int(sample_rate * duration_wrong))
            wave_wrong = np.sin(2 * np.pi * freq_wrong * t2)
            wave_wrong = (wave_wrong * volume_multiplier * 32767).astype(np.int16)
            
            stereo_wrong = np.array([wave_wrong, wave_wrong]).T
            self.sound_wrong = pygame.sndarray.make_sound(stereo_wrong)
            
        except ImportError:
            print("numpy 未安裝，使用簡化音效。建議安裝：pip install numpy")
            # 使用 pygame 的基本音調生成
            self._generate_simple_sounds()
        except Exception as e:
            print(f"音效生成失敗：{e}")
            self.sound_enabled = False

    def _generate_simple_sounds(self) -> None:
        """生成簡化的音效（不依賴 numpy）"""
        try:
            # 創建簡單的音調
            sample_rate = 22050
            duration = 0.15
            
            # 手動創建正弦波
            import math
            samples = int(sample_rate * duration)
            wave_data = []
            
            # 正確音效
            for i in range(samples):
                t = i / sample_rate
                sample = int(0.3 * 32767 * math.sin(2 * math.pi * 880 * t))
                wave_data.append([sample, sample])  # 立體聲
            
            self.sound_correct = pygame.sndarray.make_sound(wave_data)
            
            # 錯誤音效
            wave_data2 = []
            for i in range(samples):
                t = i / sample_rate
                sample = int(0.3 * 32767 * math.sin(2 * math.pi * 220 * t))
                wave_data2.append([sample, sample])
            
            self.sound_wrong = pygame.sndarray.make_sound(wave_data2)
            
        except Exception as e:
            print(f"簡化音效生成失敗：{e}")
            self.sound_enabled = False

    def _play_sound_correct(self) -> None:
        """播放正確音效"""
        if self.sound_enabled and hasattr(self, 'sound_correct'):
            try:
                self.sound_correct.play()
            except Exception:
                pass

    def _play_sound_wrong(self) -> None:
        """播放錯誤音效"""
        if self.sound_enabled and hasattr(self, 'sound_wrong'):
            try:
                self.sound_wrong.play()
            except Exception:
                pass

    def _build_ui(self) -> None:
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill=tk.X)
        ttk.Label(top, text="難度：").pack(side=tk.LEFT)
        ttk.Radiobutton(
            top,
            text="英數單鍵",
            variable=self._mode_var,
            value="letter",
            command=self._on_mode_change,
        ).pack(side=tk.LEFT, padx=4)
        ttk.Radiobutton(
            top,
            text="純英文",
            variable=self._mode_var,
            value="english",
            command=self._on_mode_change,
        ).pack(side=tk.LEFT, padx=4)
        ttk.Radiobutton(
            top,
            text="簡單英文單字",
            variable=self._mode_var,
            value="word",
            command=self._on_mode_change,
        ).pack(side=tk.LEFT, padx=4)
        ttk.Radiobutton(
            top,
            text="注音模式",
            variable=self._mode_var,
            value="bopomofo",
            command=self._on_mode_change,
        ).pack(side=tk.LEFT, padx=4)

        self.lbl_score = ttk.Label(top, text="分數：0　連續：0　等級：1")
        self.lbl_score.pack(side=tk.RIGHT)

        body = ttk.Frame(self.root, padding=16)
        body.pack(fill=tk.BOTH, expand=True)
        self.lbl_target = ttk.Label(body, text="", font=self.big_font, anchor="center")
        self.lbl_target.pack(expand=True, fill=tk.BOTH)
        self.lbl_hint = ttk.Label(
            body,
            text="請看上面，按下鍵盤上對應的鍵（英文不分大小寫）",
            font=self.hint_font,
            anchor="center",
            foreground="#333",
        )
        self.lbl_hint.pack(pady=(8, 6))
        self.lbl_kbd_tip = ttk.Label(
            body,
            text="黃色=現在要按　綠色=剛剛按對　紅色=剛剛按錯",
            foreground="#555",
            anchor="center",
        )
        self.lbl_kbd_tip.pack(pady=(0, 6))
        self._build_keyboard(body)
        ttk.Button(body, text="下一題（跳過）", command=self._skip).pack(pady=(8, 0))

        ttk.Label(
            self.root,
            text="給小朋友練習用 · 答錯不扣分，多鼓勵嘗試",
            foreground="#666",
        ).pack(side=tk.BOTTOM, pady=4)

    def _build_keyboard(self, parent: tk.Misc) -> None:
        frame = tk.Frame(parent, bg="#f4f4f4", bd=1, relief=tk.GROOVE)
        frame.pack(padx=8, pady=4)
        frame.pack_propagate(False)

        key_w, key_h = 42, 34
        key_gap, row_gap = 6, 8
        # 以像素位移模擬實體 QWERTY 列位移（比用空白字元更準）
        row_offsets = [0, 24, 34, 54]

        max_keys = max(len(row) for row in KEYBOARD_ROWS)
        frame_w = row_offsets[-1] + max_keys * key_w + (max_keys - 1) * key_gap + 12
        frame_h = len(KEYBOARD_ROWS) * key_h + (len(KEYBOARD_ROWS) - 1) * row_gap + 12
        frame.configure(width=frame_w, height=frame_h)

        for r, row_text in enumerate(KEYBOARD_ROWS):
            y = 6 + r * (key_h + row_gap)
            x0 = 6 + row_offsets[r]
            for i, ch in enumerate(row_text):
                x = x0 + i * (key_w + key_gap)
                lb = tk.Label(
                    frame,
                    text=ch,
                    width=3,
                    height=2,
                    font=("Segoe UI", 11, "bold"),
                    bg="#f8f8f8",
                    fg="#222",
                    relief=tk.RIDGE,
                    bd=1,
                )
                lb.place(x=x, y=y, width=key_w, height=key_h)
                self._kbd_labels[ch.lower()] = lb
                self._kbd_text_base[ch.lower()] = ch

    def _on_mode_change(self) -> None:
        self._difficulty = self._mode_var.get()
        self._new_round()

    def _rand_letter_or_digit(self) -> str:
        pool = string.ascii_lowercase + string.digits
        return random.choice(pool)

    def _rand_english_letter(self) -> str:
        return random.choice(string.ascii_lowercase)

    def _set_keyboard_mode(self, mode: str) -> None:
        if mode == "bopomofo":
            reverse: Dict[str, str] = {v: k for k, v in BOPOMOFO_KEYMAP.items()}
            for key, lb in self._kbd_labels.items():
                base = self._kbd_text_base.get(key, key.upper())
                z = reverse.get(key, "")
                lb.configure(text=f"{base}\n{z}" if z else base, justify="center")
        else:
            for key, lb in self._kbd_labels.items():
                lb.configure(text=self._kbd_text_base.get(key, key.upper()))

    def _update_keyboard_feedback(
        self, expected: str, pressed: str = "", ok: bool = False
    ) -> None:
        for lb in self._kbd_labels.values():
            lb.configure(bg="#f8f8f8", fg="#222")

        expected = expected.lower().strip()
        pressed = pressed.lower().strip()

        if expected in self._kbd_labels:
            self._kbd_labels[expected].configure(bg="#ffd75e", fg="#111")

        if pressed in self._kbd_labels:
            self._kbd_labels[pressed].configure(
                bg="#7ddc8a" if ok else "#ff8a8a", fg="#111"
            )

    def _new_round(self) -> None:
        self._difficulty = self._mode_var.get()
        self._set_keyboard_mode(self._difficulty)
        if self._difficulty == "word":
            w = random.choice(WORD_POOL)
            self._target_chars = list(w)
            self._position = 0
            self._expected = self._target_chars[0].lower()
            self.lbl_target.configure(text=w.upper())
            self.lbl_hint.configure(
                text=f"逐字打出單字，現在請按：「{self._expected.upper()}」"
            )
        elif self._difficulty == "english":
            c = self._rand_english_letter()
            self._target_chars = [c]
            self._position = 0
            self._expected = c.lower()
            self.lbl_target.configure(text=c.upper())
            self.lbl_hint.configure(text="純英文模式：請按下這個英文字母")
        elif self._difficulty == "bopomofo":
            symbol, key = random.choice(list(BOPOMOFO_KEYMAP.items()))
            self._target_chars = [symbol]
            self._position = 0
            self._expected = key.lower()
            self.lbl_target.configure(text=symbol)
            self.lbl_hint.configure(
                text=f"注音模式：請按對應鍵（目前是「{symbol}」）"
            )
        else:
            c = self._rand_letter_or_digit()
            self._target_chars = [c]
            self._position = 0
            self._expected = c.lower()
            show = c.upper() if c.isalpha() else c
            self.lbl_target.configure(text=show)
            self.lbl_hint.configure(text="請按下鍵盤上的這一個鍵")
        self._update_keyboard_feedback(self._expected)

    def _skip(self) -> None:
        self.streak = 0  # 跳過也會重置連續，但不影響等級
        self._new_round()
        # 更新顯示
        self.lbl_score.configure(text=f"分數：{self.score}　連續：{self.streak}　等級：{self.level}")

    def _calculate_level_from_streak(self) -> int:
        """根據連續正確次數計算等級"""
        if self.streak < 5:
            return 1
        elif self.streak < 10:
            return 2
        elif self.streak < 20:
            return 3
        elif self.streak < 35:
            return 4
        elif self.streak < 50:
            return 5
        else:
            return min(6 + (self.streak - 50) // 20, 10)  # 最高等級 10

    def _on_key(self, event: tk.Event) -> None:
        if not self._expected:
            return
        ch = event.char or ""
        if not ch:
            return
        got = ch.lower()
        if got == self._expected:
            # 正確輸入
            self.score += 1 + min(self.streak, 5)
            self.streak += 1
            
            # 根據連續數更新等級（只升不降）
            new_level = self._calculate_level_from_streak()
            if new_level > self.level:
                self.level = new_level
            
            # 播放正確音效
            self._play_sound_correct()
            
            self._update_keyboard_feedback(self._expected, got, ok=True)
            if self._difficulty == "word" and self._position + 1 < len(
                self._target_chars
            ):
                self._position += 1
                self._expected = self._target_chars[self._position].lower()
                rest = "".join(self._target_chars[self._position :])
                self.lbl_target.configure(text=rest.upper())
                self.lbl_hint.configure(
                    text=f"很好！下一個請按：「{self._expected.upper()}」"
                )
                self._update_keyboard_feedback(self._expected)
            else:
                self._new_round()
        else:
            # 錯誤輸入：連續中斷但等級不降級
            self.streak = 0
            
            # 播放錯誤音效
            self._play_sound_wrong()
            
            if self._difficulty == "bopomofo":
                target_symbol = self._target_chars[0] if self._target_chars else "?"
                key_text = self._expected.upper() if self._expected.isalpha() else self._expected
                self.lbl_hint.configure(
                    text=f"差一點，再試試！「{target_symbol}」要按鍵盤「{key_text}」"
                )
            else:
                self.lbl_hint.configure(
                    text=f"差一點，再試試！需要按的是「{self._expected.upper()}」"
                )
            self._update_keyboard_feedback(self._expected, got, ok=False)
        
        # 更新顯示（包含等級）
        self.lbl_score.configure(text=f"分數：{self.score}　連續：{self.streak}　等級：{self.level}")

    def _on_close(self) -> None:
        try:
            g = self.root.geometry()
            save_state(g, self._mode_var.get())
        except tk.TclError:
            pass
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    TypingGameApp().run()


if __name__ == "__main__":
    main()
