# 墨記

墨記是一個只在自己電腦上運行的 Markdown 日記網站。它沒有帳號、登入或雲端同步；每篇日記都是 `entries/` 裡的一個 `.md` 檔案，可以直接備份、搬移或使用其他文字編輯器開啟。

## 功能

- Markdown 編輯與即時預覽
- 新增、修改與刪除日記
- 日期、心情和多個標籤，可搜尋並重用既有標籤
- 全文搜尋與標籤篩選
- 未完成新日記的瀏覽器草稿
- 深色與淺色模式
- 桌面與手機版面
- 無帳號、無外部資料庫

## 技術架構

| 部分 | 技術 | 用途 |
| --- | --- | --- |
| 前端 | Vue 3、Tailwind CSS、Vite | 日記閱讀、編輯與介面 |
| 後端 | Elysia.js、Bun | 提供 API 並讀寫 Markdown |
| 資料 | Markdown + YAML front matter | 儲存內容、日期、心情與標籤 |

開發模式下，Vite 在 `4173` 埠提供前端，並將 `/api` 轉送到 `3001` 埠的 Elysia.js。正式模式與容器模式則由 Elysia.js 在 `4173` 埠同時提供前端與 API。

## 使用 Docker Compose（推薦）

### 需求

- Docker Desktop，或已安裝 Docker Engine 與 Docker Compose

### 啟動

在專案目錄執行：

```bash
docker compose up -d --build
```

開啟 [http://localhost:4173](http://localhost:4173)。第一次啟動會下載 Bun 映像並建置網站，因此時間會比之後稍長。

查看容器狀態：

```bash
docker compose ps
```

查看執行記錄：

```bash
docker compose logs -f diary
```

停止網站：

```bash
docker compose down
```

`docker compose down` 不會刪除日記，因為日記實際保存在專案的 `entries/` 資料夾。

### 使用其他連接埠

例如改用 `8080`：

```bash
MOJI_PORT=8080 docker compose up -d
```

接著開啟 `http://localhost:8080`。

### 更新網站

程式修改或版本更新後，重新建置即可：

```bash
docker compose up -d --build
```

### 本機存取範圍

Compose 預設只將服務綁定在 `127.0.0.1`，因此同一網路上的其他裝置無法直接連線。這個網站沒有登入驗證，不建議直接暴露到公網。

## 日記資料與備份

所有日記都放在：

```text
entries/
```

Compose 會將主機的 `entries/` 掛載到容器中的 `/app/entries`。重建、更新或刪除容器都不會移除主機上的 Markdown 檔案。

備份時，只要複製整個 `entries/` 資料夾即可。還原時，將 Markdown 檔放回這個資料夾並重新整理頁面。

每篇日記的格式如下：

```markdown
---
title: 今天的標題
date: '2026-10-07'
mood: 平靜
tags:
  - 生活
  - 隨筆
updatedAt: '2026-10-07T12:00:00.000Z'
---

# 今天發生的事

日記內容寫在這裡。
```

請避免在網站運行時，使用其他程式同時修改同一篇日記，以免其中一方的變更被覆蓋。

## 不使用 Docker

### 開發模式

需要安裝 [Bun](https://bun.sh/)：

```bash
bun install
bun run dev
```

開啟 [http://127.0.0.1:4173](http://127.0.0.1:4173)。程式碼修改後會自動更新。

### 正式模式

```bash
bun install --frozen-lockfile
bun run build
bun run start
```

正式模式預設運行於 [http://127.0.0.1:4173](http://127.0.0.1:4173)。可使用 `HOST` 和 `PORT` 環境變數調整監聽位置：

```bash
HOST=0.0.0.0 PORT=8080 bun run start
```

## 專案結構

```text
diary-site/
├── entries/          # Markdown 日記；容器持久化目錄
├── public/           # 網站圖示等靜態檔案
├── src/              # Vue 前端
├── Dockerfile        # 容器映像建置方式
├── compose.yml       # Docker Compose 設定
├── server.ts         # Elysia.js API 與正式版靜態檔案服務
├── vite.config.js    # Vite 與開發環境 API 轉送設定
└── package.json      # 指令與相依套件
```

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `docker compose up -d --build` | 建置並啟動容器 |
| `docker compose down` | 停止並移除容器 |
| `docker compose logs -f diary` | 持續查看容器記錄 |
| `bun run dev` | 啟動本機開發模式 |
| `bun run build` | 建置正式版前端 |
| `bun run start` | 啟動正式版網站 |

## 隱私與安全

- 日記不會由應用程式自動上傳到任何服務。
- Docker 映像建置時會排除 `entries/`，避免把私人日記包進映像。
- 網站沒有登入機制，請只在可信任的電腦與網路環境中使用。
- 若要透過區域網路或網際網路存取，應先加入驗證、HTTPS 和適當的防火牆規則。
