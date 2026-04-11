# 發行備註（網頁版近期彙整）

## 版本說明

- 與目前 `README.md`「操作」「設定檔」敘述一致；無單一 semver 號時可視為**靜態網頁一版**。

## 本版重點

- **模擬鍵盤**：標準 QWERTY **盲打手指分區**底色；**F／J** 定位鍵略加深；右手四指區色相拉開以利辨識；**題目指定鍵**為黃底並**加粗深色外框**。
- **音效**：**按鍵音效**可開關（偏好鍵 `sfxKeyEnabled`）；**本局結束**與**該模式破紀錄**另有 Web Audio 提示音（不受按鍵音效開關影響）。
- **視覺**：頁面背景插圖（`web/images/bg-illustration.svg`，可於 `style.css` 之 `--page-bg-illustration` 更換或設 `none`）；答對／錯、題目區、能量條之輕量動畫（遵守 `prefers-reduced-motion`）。
- **其餘**（延續既有）：能量條、難度遞減與分數倍率、五模式分區紀錄表、英文發音主開關＋時機下拉、詞彙 topic 篩選等。

## 部署／上傳提醒

- 請一併部署 **`web/`** 下 `index.html`、`style.css`、`app.js`、`data/`、`images/`。
- 勿以 `file://` 作為正式使用方式（需 HTTP 以載入 `vocabulary.json`）。

## 相容性

- 現代 Chromium／Firefox／Safari／Edge；`color-mix` 用於 F／J 加深時，極舊瀏覽器可能略退回與同區同色。
