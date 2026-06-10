# Mermaid Studio — code → downloadable image

A self-contained, dark-themed web app that turns [Mermaid](https://mermaid.js.org/) diagram
code into a downloadable **PNG**, **JPEG**, or **SVG**. Everything runs in the browser — no
backend, no uploads.

![Mermaid Studio](https://img.shields.io/badge/mermaid-11-7c9eff) ![offline](https://img.shields.io/badge/runs-in--browser-56d4c4)

## Screenshots

| Dark theme · transparent background | Sequence diagram · white background |
| :---: | :---: |
| ![Flowchart with the dark UI and transparent (checkerboard) export background](docs/screenshots/screenshot_flowchart_diagram.png) | ![Sequence diagram previewed on a white export background](docs/screenshots/screenshot_sequence_diagram.png) |

## Features

- **Live preview** with 250 ms debounced re-render; the last good diagram stays on screen while you fix syntax errors.
- **Drag to pan, scroll to zoom** (pointer + touch), plus zoom buttons, **Fit**, and double-click-to-fit.
- **Export to PNG / JPEG / SVG.** Raster export rasterizes the SVG onto a canvas at a selectable **1×–6×** resolution scale (the output pixel size is shown live, and auto-capped if it would exceed browser canvas limits).
- **Background control** — transparent, dark, white, or a custom color picker.
- **Adjustable padding** around the diagram (0–120 px).
- **Copy image to clipboard** (PNG) where the browser supports it.
- **10 built-in examples** (flowchart, sequence, class, state, ER, gantt, pie, mindmap, journey, git graph).
- **5 render themes** (dark, default, neutral, forest, base).
- **Your work is remembered** — code + settings persist in `localStorage`.
- Format/clear/copy code helpers and a tab-inserts-spaces editor.

## Run it

### Prerequisites

You only need **one** of these toolchains:

| To run with… | You need | Notes |
| --- | --- | --- |
| **Docker** (recommended) | [Docker Engine](https://docs.docker.com/engine/install/) + Docker Compose v2 (bundled with **Docker Desktop** on Windows/macOS) | `docker compose version` should print v2.x |
| **`make` shortcuts** | The above, plus `make` | Preinstalled on macOS/Linux; on Windows use `choco install make`, WSL, or just use the npm/Docker commands |
| **`npm` shortcuts** | [Node.js](https://nodejs.org/) 18+ (for `npm`) **and** Docker | Cross-platform wrappers around the Docker commands |
| **No-build static server** | Any static file server — Node, Python 3, PHP, … | No Docker needed; great for a quick look |

Also required at runtime:

- A **modern browser** (Chrome, Edge, Firefox, Safari).
- An **internet connection** — the Mermaid library is loaded from a CDN at runtime
  (jsdelivr → unpkg → esm.sh fallbacks). Your diagrams themselves are **never uploaded**;
  all rendering and export happen locally in the browser.

> Want a fully offline/air-gapped image with zero CDN dependency? See
> [Offline build](#offline-build).

### Quick start

```bash
git clone https://github.com/Mordris/mermaid-generator.git
cd mermaid-generator
docker compose up -d --build      # → http://localhost:8473
```

That's it — open **http://localhost:8473**. To stop: `docker compose down`.

### Command cheat-sheet

Every row does the same thing three ways — pick whichever you have installed:

| Action | Docker Compose | `make` | `npm` |
| --- | --- | --- | --- |
| **Start** (build + run) | `docker compose up -d --build` | `make up` | `npm start` |
| **Stop** (remove container) | `docker compose down` | `make down` | `npm stop` |
| **Restart** | `docker compose restart` | `make restart` | `npm run restart` |
| **Rebuild** (after code changes) | `docker compose up -d --build --force-recreate` | `make rebuild` | `npm run rebuild` |
| **View logs** | `docker compose logs -f` | `make logs` | `npm run logs` |
| **Status** | `docker compose ps` | `make ps` | `npm run status` |
| **Remove image too** | `docker compose down --rmi local` | `make clean` | `npm run clean` |
| **No-Docker dev server** | — | `make dev` | `npm run dev` |

Run `make` with no arguments to see the available targets.

### Choosing a port

The host port defaults to **8473** (an uncommon, unassigned port chosen to avoid clashing
with the usual `3000`/`5000`/`8000`/`8080`/`8888` dev ports). Override it without editing
any file:

```bash
MERMAID_PORT=12345 docker compose up -d --build   # → http://localhost:12345
make up PORT=12345                                # same, via make
```

### Run without Docker (static server)

It's a plain static site, so any HTTP server works (the ES-module import of Mermaid needs
`http://`, not `file://`):

```bash
# Node
npx http-server -p 4321 -c-1            # or:  make dev  /  npm run dev

# Python 3
python -m http.server 4321

# PHP
php -S localhost:4321
```

Then open **http://localhost:4321**.

### Run without Compose (plain Docker)

```bash
docker build -t mermaid-studio .
docker run -d --name mermaid-studio -p 8473:80 mermaid-studio
# stop:  docker rm -f mermaid-studio
```

### Offline build

The container needs outbound internet only because Mermaid is fetched from a CDN by the
browser. If you need a self-contained image, vendor the library locally:

1. Download `mermaid.esm.min.mjs` (v11) into the project folder.
2. Point the first entry of `MERMAID_SOURCES` in `app.js` at `./mermaid.esm.min.mjs`.
3. Add the file to the `COPY` line in the `Dockerfile`, then rebuild.

### Troubleshooting

- **Port already in use** → pick another port (see [Choosing a port](#choosing-a-port)).
- **Stale UI after a rebuild** → hard-refresh once (`Ctrl/Cmd + Shift + R`); the server
  sends `no-cache` headers, so new visitors always get fresh code.
- **"Couldn't load the Mermaid engine"** → you're offline or a corporate proxy is blocking
  the CDNs; reconnect and click **Retry**, or do an [offline build](#offline-build).
- **`make: command not found` (Windows)** → use the **Docker Compose** or **npm** column instead.

## How the PNG export works

Mermaid renders to inline `<svg>`. To rasterize it cleanly:

1. **Labels are rendered as native SVG `<text>`** (`htmlLabels: false`). Mermaid's default
   HTML-in-`<foreignObject>` labels **taint the canvas** cross-origin, which makes
   `canvas.toBlob()` throw a `SecurityError` — so they're disabled.
2. The SVG is given explicit pixel `width`/`height`, an optional background `<rect>`, and padding via the `viewBox`.
3. It's serialized, loaded into an `Image`, and drawn onto a `<canvas>` sized at `dimensions × scale`.
4. `canvas.toBlob('image/png' | 'image/jpeg')` produces the downloadable file. SVG export skips the canvas and downloads the serialized vector directly.

## Error & edge-case handling

The app is built to fail loudly but never crash:

- **CDN failure** → blocking overlay with a Retry button; three CDN sources are tried in order.
- **Invalid syntax** → error card with the parser message; the previous good diagram stays visible.
- **Render hangs** → 20 s timeout on parse/render/rasterize.
- **Oversized output** → export scale is auto-capped to stay within canvas limits (16384 px / 256 MP); if even 1× is too big, you're told to use SVG.
- **Tainted canvas** → avoided by design (native SVG `<text>`, not HTML labels); `toBlob` failures are caught and surfaced.
- **Clipboard** → feature-detected, with focus/permission errors translated to plain advice.
- **Bad filenames** → sanitized (illegal/control chars stripped, extension normalized, empty → `diagram`).
- **Storage** → `localStorage` reads/writes are wrapped; corrupt or disabled storage is ignored.
- **Global nets** → `unhandledrejection` / `error` listeners and a per-handler `guard()` wrapper.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup & layout |
| `styles.css` | Dark theme |
| `app.js` | Mermaid load/init, live render, pan/zoom, export pipeline, error handling |
| `Dockerfile` | nginx static-server image |
| `nginx.conf` | MIME types (incl. `.mjs`), gzip, caching |
| `docker-compose.yml` | Runs on host port 8473 (override via `MERMAID_PORT`) |
| `Makefile` | `make up/down/restart/rebuild/logs/ps/dev/clean` shortcuts |
| `package.json` | `npm start/stop/restart/rebuild/logs/status/clean/dev` shortcuts |
