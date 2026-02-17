```md
# Third Year Project — Collaborative Code Editor (Tauri + React/Vite + Django + Yjs)

This project is a **desktop collaborative code editor** built with:
- **Tauri** (desktop shell)
- **React + Vite** (frontend UI)
- **Django** (backend API + auth)
- **Yjs** + **websocket server** (real-time collaboration)

---

## Folder structure

```

Third Year Project/
backend/    # Django backend
desktop/    # Tauri + React/Vite frontend

````

---

## Prerequisites (install these first)

- **Git**
- **Node.js + npm** (Node 20+ recommended)
- **Python 3.10+**
- **Rust (rustup)** for Tauri: https://rustup.rs
- **Tauri OS prerequisites**: https://tauri.app/start/prerequisites/

> Windows: you typically need Visual Studio Build Tools (C++), and WebView2 (usually already installed).

---

## Download the project

```bash
git clone <REPO_URL>
cd "Third Year Project"
````

Or download the ZIP, extract it, then open a terminal in the extracted folder.

---

## Run locally (3 terminals)

You must run **three** processes:

1. Django backend (port 8000)
2. Yjs websocket server (port 1234)
3. Tauri dev app (Vite on port 1420)

---

## Terminal 1 — Backend (Django)

### Windows (PowerShell)

```powershell
cd "backend"

# Create venv (only first time)
python -m venv .venv

# Activate venv
.\.venv\Scripts\Activate.ps1

# Install deps (preferred if requirements.txt exists)
python -m pip install -U pip
if (Test-Path .\requirements.txt) { python -m pip install -r .\requirements.txt }

# Migrations
python manage.py makemigrations
python manage.py migrate

# Run backend (IPv4)
python manage.py runserver 127.0.0.1:8000
```

### macOS/Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate

python -m pip install -U pip
[ -f requirements.txt ] && python -m pip install -r requirements.txt

python manage.py makemigrations
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

Backend URL:

* `http://127.0.0.1:8000`

---

## Terminal 2 — Collaboration websocket (Yjs)

### Windows (PowerShell)

```powershell
cd "desktop"

npm install

# install websocket server (only first time)
npm i -D @y/websocket-server

# run websocket server
$env:HOST="127.0.0.1"
$env:PORT="1234"
npx y-websocket
```

### macOS/Linux

```bash
cd desktop
npm install
npm i -D @y/websocket-server
HOST=127.0.0.1 PORT=1234 npx y-websocket
```

Websocket URL:

* `ws://127.0.0.1:1234`

---

## Terminal 3 — Frontend (Tauri dev)

### 1) Set env vars

Create / edit: `desktop/.env.local`

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_YJS_WS_URL=ws://127.0.0.1:1234
```

### 2) Ensure Vite binds to the Tauri dev port (1420)

Edit: `desktop/vite.config.ts` and ensure:

```ts
server: {
  host: "127.0.0.1",
  port: 1420,
  strictPort: true,
}
```

### 3) Run Tauri dev

```powershell
cd "desktop"
npm run tauri dev
```

---

## Common issues

### 1) “localhost refused to connect”

* Your dev server is not on port 1420 or is bound to IPv6 only.
* Use `127.0.0.1` and enforce port 1420 via `vite.config.ts` as above.

### 2) Collaboration not syncing

* Confirm websocket is listening:

  ```powershell
  Test-NetConnection 127.0.0.1 -Port 1234
  ```
* Confirm frontend env var:

  * `VITE_YJS_WS_URL=ws://127.0.0.1:1234`
* Restart Vite/Tauri after changing `.env.local`.

### 3) API “Failed to fetch”

* Confirm backend is listening:

  ```powershell
  Test-NetConnection 127.0.0.1 -Port 8000
  ```
* Ensure `.env.local` uses `127.0.0.1` not `localhost`.

---

```
::contentReference[oaicite:0]{index=0}
```
