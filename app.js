/* =================================================================
   Mermaid Studio — code → downloadable image
   Hardened build: defensive error handling throughout.
==================================================================*/

"use strict";

/* ----------------------------------------------------------------
   Tiny DOM helper (null-tolerant)
-----------------------------------------------------------------*/
const $ = (id) => document.getElementById(id);

/* Run a function, swallowing + logging any throw so one broken
   handler never takes down the whole app. */
function guard(label, fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      console.error(`[${label}]`, err);
      toast(`${label} failed: ${errMessage(err)}`, "err");
    }
  };
}

function errMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.message) return String(err.message);
  try { return JSON.stringify(err); } catch { return String(err); }
}

/* ----------------------------------------------------------------
   Constants / limits
-----------------------------------------------------------------*/
const MERMAID_VERSION = "11.15.0";
const MERMAID_SOURCES = [
  `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.esm.min.mjs`,
  `https://unpkg.com/mermaid@${MERMAID_VERSION}/dist/mermaid.esm.min.mjs`,
  `https://esm.sh/mermaid@${MERMAID_VERSION}`,
];
const RENDER_DEBOUNCE_MS = 250;
const RENDER_TIMEOUT_MS = 20000;
const MAX_CODE_LENGTH = 200000;          // guard against pathological input
const CANVAS_MAX_SIDE = 16384;           // conservative cross-browser limit
const CANVAS_MAX_AREA = 268435456;       // 16384²: Chrome/Safari area cap
const STORAGE_KEY = "mermaid-studio:v1";
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 12;

/* ----------------------------------------------------------------
   Example diagrams
-----------------------------------------------------------------*/
const EXAMPLES = {
  flowchart: `flowchart TD
  A[Start] --> B{Is it working?}
  B -- Yes --> C[Ship it]
  B -- No --> D[Debug]
  D --> E[(Read logs)]
  E --> B
  C --> F[Celebrate]`,

  sequence: `sequenceDiagram
  autonumber
  participant U as User
  participant F as Frontend
  participant A as API
  U->>F: Paste Mermaid code
  F->>A: Render request
  A-->>F: SVG diagram
  F-->>U: Live preview
  Note over U,F: Download as PNG`,

  class: `classDiagram
  class Diagram {
    +String code
    +String theme
    +render() SVG
    +export(format) Blob
  }
  class Exporter {
    +int scale
    +String background
    +toPNG() Blob
  }
  Diagram --> Exporter : uses`,

  state: `stateDiagram-v2
  [*] --> Idle
  Idle --> Editing : type code
  Editing --> Rendering : debounce
  Rendering --> Preview : success
  Rendering --> Error : invalid
  Error --> Editing : fix
  Preview --> Export : download
  Export --> [*]`,

  er: `erDiagram
  USER ||--o{ DIAGRAM : creates
  DIAGRAM ||--|{ EXPORT : produces
  USER {
    int id
    string email
  }
  DIAGRAM {
    int id
    string code
    string theme
  }
  EXPORT {
    int id
    string format
    int scale
  }`,

  gantt: `gantt
  title Project Plan
  dateFormat YYYY-MM-DD
  section Design
  Wireframes      :done,    des1, 2024-01-01, 5d
  Visual design   :active,  des2, after des1, 6d
  section Build
  Frontend        :         dev1, after des2, 8d
  Export pipeline :         dev2, after dev1, 4d`,

  pie: `pie showData
  title Export formats used
  "PNG" : 62
  "SVG" : 23
  "JPEG" : 15`,

  mindmap: `mindmap
  root((Mermaid Studio))
    Editor
      Live preview
      Examples
    Themes
      Dark
      Forest
    Export
      PNG
      SVG
      JPEG`,

  journey: `journey
  title Making a diagram
  section Create
    Open studio: 5: User
    Write code: 4: User
  section Export
    Pick format: 5: User
    Download PNG: 5: User`,

  git: `gitGraph
  commit
  branch develop
  checkout develop
  commit
  commit
  checkout main
  merge develop
  commit`,
};

/* ----------------------------------------------------------------
   Element refs (resolved after DOM ready)
-----------------------------------------------------------------*/
let codeEl, diagramEl, stageEl, viewportEl, statusEl, errorOverlay,
    errorText, themeSelect, exampleSelect, panHint;

/* ----------------------------------------------------------------
   State
-----------------------------------------------------------------*/
let mermaid = null;
let renderSeq = 0;
let view = { zoom: 1, panX: 0, panY: 0 };
let userAdjustedView = false;

const settings = {
  theme: "dark",
  format: "png",
  scale: 3,
  background: "transparent",
  customBg: "#1e293b",
  padding: 16,
  filename: "diagram",
  editorW: 380,    // editor pane width in px (preview flexes to fill the rest)
  exportW: 268,    // export sidebar width in px
};
const DEFAULT_EDITOR_W = 380;
const DEFAULT_EXPORT_W = 268;

/* ----------------------------------------------------------------
   Persistence (best-effort; never throws)
-----------------------------------------------------------------*/
function saveState() {
  try {
    const payload = JSON.stringify({ code: codeEl?.value ?? "", settings });
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (_) { /* quota / disabled storage — ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_) { /* corrupt — ignore */ }
  return null;
}

const saveStateDebounced = debounce(saveState, 600);

function debounce(fn, ms) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ----------------------------------------------------------------
   Toast
-----------------------------------------------------------------*/
let toastTimer = null;
function toast(msg, kind = "ok") {
  try {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = String(msg).slice(0, 240);
    el.className = "toast toast-" + kind;
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  } catch (_) { /* never let a toast crash anything */ }
}

/* ----------------------------------------------------------------
   Status line
-----------------------------------------------------------------*/
function setStatus(text, kind = "ok") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = "status status-" + kind;
}

/* ----------------------------------------------------------------
   Library loading (with CDN fallbacks + retry UI)
-----------------------------------------------------------------*/
function showLibOverlay(title, msg, { spinner = true, retry = false } = {}) {
  const ov = $("libOverlay");
  if (!ov) return;
  ov.classList.remove("hidden");
  $("libTitle").textContent = title;
  $("libMsg").textContent = msg;
  $("libSpinner").classList.toggle("hidden", !spinner);
  $("libRetry").hidden = !retry;
}
function hideLibOverlay() {
  $("libOverlay")?.classList.add("hidden");
}

async function loadMermaid() {
  showLibOverlay("Loading Mermaid engine…", "Fetching the rendering library.", { spinner: true });
  const errors = [];
  for (const src of MERMAID_SOURCES) {
    try {
      const mod = await import(/* @vite-ignore */ src);
      const lib = mod && (mod.default || mod.mermaid || mod);
      if (lib && typeof lib.render === "function") {
        mermaid = lib;
        return true;
      }
      errors.push(`${src}: module had no render()`);
    } catch (err) {
      errors.push(`${src}: ${errMessage(err)}`);
    }
  }
  console.error("Mermaid load failed:\n" + errors.join("\n"));
  showLibOverlay(
    "Couldn't load the Mermaid engine",
    "All CDN sources failed. Check your network connection (the library loads from a CDN) and retry.",
    { spinner: false, retry: true }
  );
  return false;
}

/* ----------------------------------------------------------------
   Mermaid init
-----------------------------------------------------------------*/
function initMermaid() {
  if (!mermaid) return false;
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: settings.theme,
      securityLevel: "strict",      // we never inject untrusted HTML; strict is safest
      fontFamily: "Inter, sans-serif",
      // htmlLabels MUST be false: foreignObject/HTML labels taint the export
      // canvas (SecurityError on toBlob). Native <text> rasterizes cleanly.
      htmlLabels: false,
      flowchart: { useMaxWidth: false, htmlLabels: false },
      class: { useMaxWidth: false, htmlLabels: false },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
      er: { useMaxWidth: false },
      logLevel: "fatal",
    });
    return true;
  } catch (err) {
    console.error("mermaid.initialize failed", err);
    toast("Engine init failed: " + errMessage(err), "err");
    return false;
  }
}

/* ----------------------------------------------------------------
   Orphan cleanup — mermaid can leave temp nodes on the body if a
   render throws mid-flight.
-----------------------------------------------------------------*/
function cleanupOrphans(activeId) {
  try {
    document.querySelectorAll('body > svg[id^="mmd-"], [id^="dmmd-"], .mermaidTooltip')
      .forEach((el) => {
        if (el.id === activeId) return;
        if (diagramEl && diagramEl.contains(el)) return;
        el.remove();
      });
  } catch (_) { /* ignore */ }
}

/* ----------------------------------------------------------------
   Render (debounced + timeout-guarded)
-----------------------------------------------------------------*/
let debounceTimer = null;
function scheduleRender() {
  setStatus("Rendering…", "busy");
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { render({ fit: false }); }, RENDER_DEBOUNCE_MS);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function showError(message) {
  if (!errorOverlay) return;
  errorText.textContent = (message || "Unknown error").toString().trim();
  errorOverlay.hidden = false;
}
function hideError() {
  if (errorOverlay) errorOverlay.hidden = true;
}

async function render({ fit = false } = {}) {
  if (!mermaid) { setStatus("Engine not loaded", "err"); return; }

  const raw = codeEl?.value ?? "";
  const code = raw.trim();
  const seq = ++renderSeq;
  const renderId = "mmd-" + seq;

  // Edge: empty input
  if (!code) {
    diagramEl.innerHTML = "";
    hideError();
    setStatus("Empty — type some Mermaid code", "ok");
    setEmpty(true);
    updateDimHint();
    return;
  }

  // Edge: pathologically large input
  if (code.length > MAX_CODE_LENGTH) {
    showError(`Input is too large (${code.length.toLocaleString()} chars, max ${MAX_CODE_LENGTH.toLocaleString()}). Trim the diagram.`);
    setStatus("Input too large", "err");
    return;
  }

  try {
    // Validate first so a bad keystroke keeps the previous good diagram.
    await withTimeout(Promise.resolve(mermaid.parse(code)), RENDER_TIMEOUT_MS, "Parse");

    const result = await withTimeout(mermaid.render(renderId, code), RENDER_TIMEOUT_MS, "Render");
    if (seq !== renderSeq) return;                   // superseded by a newer render
    cleanupOrphans(renderId);

    const svgText = result && result.svg;
    if (!svgText || typeof svgText !== "string") {
      throw new Error("Renderer returned no SVG.");
    }

    diagramEl.innerHTML = svgText;
    const svg = diagramEl.querySelector("svg");
    if (!svg) throw new Error("Rendered output contained no <svg> element.");

    normalizeSvg(svg);
    hideError();
    setEmpty(false);
    setStatus("Rendered", "ok");
    updateDimHint();

    if (fit || !userAdjustedView) fitView();
  } catch (err) {
    if (seq !== renderSeq) return;
    cleanupOrphans(renderId);
    console.warn("render error", err);
    showError(errMessage(err));
    setStatus("Syntax error", "err");
  } finally {
    saveStateDebounced();
  }
}

/* Give the SVG explicit, finite pixel dimensions so it rasterizes
   crisply. Falls back through viewBox → attrs → getBBox → default. */
function normalizeSvg(svg) {
  if (!svg) return;
  let w = 0, h = 0;

  const vb = svg.getAttribute("viewBox");
  if (vb) {
    const p = vb.split(/[\s,]+/).map(Number);
    if (p.length === 4 && isFinite(p[2]) && isFinite(p[3])) { w = p[2]; h = p[3]; }
  }
  if (!(w > 0 && h > 0)) {
    const aw = parseFloat(svg.getAttribute("width"));
    const ah = parseFloat(svg.getAttribute("height"));
    if (isFinite(aw) && aw > 0) w = aw;
    if (isFinite(ah) && ah > 0) h = ah;
  }
  if (!(w > 0 && h > 0)) {
    try {
      const b = svg.getBBox();
      if (b && b.width > 0 && b.height > 0) { w = b.width; h = b.height; }
    } catch (_) { /* not measurable */ }
  }
  if (!(w > 0 && h > 0)) { w = 800; h = 600; }     // last-resort default

  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.removeAttribute("style");                    // drop mermaid's max-width
}

function svgDimensions() {
  const svg = diagramEl?.querySelector("svg");
  if (!svg) return null;
  const w = parseFloat(svg.getAttribute("width"));
  const h = parseFloat(svg.getAttribute("height"));
  if (!(w > 0 && h > 0)) return null;
  return { w: w + settings.padding * 2, h: h + settings.padding * 2 };
}

/* ----------------------------------------------------------------
   Pan / zoom controller
-----------------------------------------------------------------*/
function applyView() {
  if (!stageEl) return;
  view.zoom = clamp(view.zoom, ZOOM_MIN, ZOOM_MAX);
  stageEl.style.transform =
    `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
  const lbl = $("zoomLabel");
  if (lbl) lbl.textContent = Math.round(view.zoom * 100) + "%";
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function setEmpty(isEmpty) {
  viewportEl?.classList.toggle("is-empty", isEmpty);
  if (panHint) panHint.style.display = isEmpty ? "none" : "";
}

/* Paint the preview area with the chosen export background so it's WYSIWYG.
   "transparent" restores the CSS checkerboard. */
function applyPreviewBackground() {
  if (!viewportEl) return;
  const bg = currentBackground();
  if (bg) {
    viewportEl.style.backgroundImage = "none";
    viewportEl.style.backgroundColor = bg;
  } else {
    // Clear inline overrides → fall back to the checkerboard defined in CSS.
    viewportEl.style.backgroundImage = "";
    viewportEl.style.backgroundColor = "";
  }
}

function fitView() {
  const dim = svgDimensions();
  if (!dim || !viewportEl) return;
  const vw = viewportEl.clientWidth;
  const vh = viewportEl.clientHeight;
  if (vw <= 0 || vh <= 0) return;
  const margin = 0.9;
  const z = clamp(Math.min(vw / dim.w, vh / dim.h) * margin, ZOOM_MIN, ZOOM_MAX);
  view.zoom = z;
  view.panX = (vw - dim.w * z) / 2;
  view.panY = (vh - dim.h * z) / 2;
  userAdjustedView = false;
  applyView();
}

function zoomAt(cx, cy, factor) {
  const newZoom = clamp(view.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const ratio = newZoom / view.zoom;
  if (!isFinite(ratio) || ratio === 1) { view.zoom = newZoom; applyView(); return; }
  view.panX = cx - (cx - view.panX) * ratio;
  view.panY = cy - (cy - view.panY) * ratio;
  view.zoom = newZoom;
  userAdjustedView = true;
  applyView();
}

function initPanZoom() {
  if (!viewportEl) return;

  // Wheel zoom centered on cursor
  viewportEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = viewportEl.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(cx, cy, factor);
  }, { passive: false });

  // Pointer drag pan (mouse + touch + pen via Pointer Events)
  let dragging = false, startX = 0, startY = 0, pointerId = null;

  viewportEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (viewportEl.classList.contains("is-empty")) return;
    e.preventDefault();   // stop the drag from selecting SVG text
    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX - view.panX;
    startY = e.clientY - view.panY;
    try { viewportEl.setPointerCapture(e.pointerId); } catch (_) {}
    viewportEl.classList.add("is-grabbing");
  });

  viewportEl.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    view.panX = e.clientX - startX;
    view.panY = e.clientY - startY;
    userAdjustedView = true;
    applyView();
  });

  const endDrag = (e) => {
    if (e && pointerId !== null && e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    viewportEl.classList.remove("is-grabbing");
  };
  viewportEl.addEventListener("pointerup", endDrag);
  viewportEl.addEventListener("pointercancel", endDrag);
  viewportEl.addEventListener("pointerleave", (e) => { if (dragging) endDrag(e); });

  // Double-click to fit
  viewportEl.addEventListener("dblclick", () => fitView());

  // Re-center on container resize if the user hasn't taken control
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { if (!userAdjustedView) fitView(); });
    ro.observe(viewportEl);
  }
}

/* ----------------------------------------------------------------
   Resizable panels (draggable gutters)
-----------------------------------------------------------------*/
function applyLayout() {
  const layout = document.querySelector(".layout");
  if (!layout) return;
  // Clamp: export sidebar 220–460px; editor 240px up to whatever leaves the
  // preview at least 360px. Re-clamped on every window resize.
  const vw = window.innerWidth || 1280;
  settings.exportW = clamp(num(settings.exportW, DEFAULT_EXPORT_W), 220, 460);
  const maxEditor = Math.max(240, vw - settings.exportW - 360);
  settings.editorW = clamp(num(settings.editorW, DEFAULT_EDITOR_W), 240, maxEditor);
  layout.style.setProperty("--editor-w", settings.editorW + "px");
  layout.style.setProperty("--export-w", settings.exportW + "px");
}

function num(v, fallback) {
  const n = parseFloat(v);
  return isFinite(n) ? n : fallback;
}

function initResizers() {
  setupGutter($("gutterLeft"), "editor");
  setupGutter($("gutterRight"), "export");
  window.addEventListener("resize", () => applyLayout());
}

function setupGutter(el, which) {
  if (!el) return;
  let pid = null, startX = 0, startEditor = 0, startExport = 0;

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pid = e.pointerId;
    startX = e.clientX;
    startEditor = settings.editorW;
    startExport = settings.exportW;
    try { el.setPointerCapture(pid); } catch (_) {}
    el.classList.add("is-dragging");
    document.body.classList.add("is-resizing");
  });

  el.addEventListener("pointermove", (e) => {
    if (pid === null || e.pointerId !== pid) return;
    const dx = e.clientX - startX;
    if (which === "editor") settings.editorW = startEditor + dx;
    else settings.exportW = startExport - dx;   // drag left → wider sidebar
    applyLayout();   // ResizeObserver on the viewport refits the diagram live
  });

  const end = () => {
    if (pid === null) return;
    pid = null;
    el.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing");
    saveStateDebounced();
    if (!userAdjustedView) fitView();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  // Double-click resets this gutter to its default.
  el.addEventListener("dblclick", () => {
    if (which === "editor") settings.editorW = DEFAULT_EDITOR_W;
    else settings.exportW = DEFAULT_EXPORT_W;
    applyLayout();
    saveStateDebounced();
    if (!userAdjustedView) fitView();
  });

  // Keyboard accessibility (focus the gutter, use arrows).
  el.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 40 : 12;
    let handled = true;
    if (e.key === "ArrowLeft") {
      if (which === "editor") settings.editorW -= step; else settings.exportW += step;
    } else if (e.key === "ArrowRight") {
      if (which === "editor") settings.editorW += step; else settings.exportW -= step;
    } else { handled = false; }
    if (handled) {
      e.preventDefault();
      applyLayout();
      saveStateDebounced();
      if (!userAdjustedView) fitView();
    }
  });
}

/* ----------------------------------------------------------------
   Export pipeline
-----------------------------------------------------------------*/
function currentBackground() {
  if (settings.background === "transparent") return null;
  if (settings.background === "custom") return settings.customBg;
  return settings.background;
}

/* Build a standalone, namespaced SVG string with padding + optional bg. */
function buildSvgString(forRaster) {
  const svg = diagramEl?.querySelector("svg");
  if (!svg) return null;

  const clone = svg.cloneNode(true);
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const baseW = parseFloat(clone.getAttribute("width"));
  const baseH = parseFloat(clone.getAttribute("height"));
  if (!(baseW > 0 && baseH > 0)) return null;

  const pad = settings.padding;
  const totalW = baseW + pad * 2;
  const totalH = baseH + pad * 2;
  clone.setAttribute("width", totalW);
  clone.setAttribute("height", totalH);
  clone.setAttribute("viewBox", `${-pad} ${-pad} ${totalW} ${totalH}`);

  const bg = currentBackground();
  const fill = bg || (forRaster && settings.format === "jpeg" ? "#ffffff" : null);
  if (fill) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", -pad);
    rect.setAttribute("y", -pad);
    rect.setAttribute("width", totalW);
    rect.setAttribute("height", totalH);
    rect.setAttribute("fill", fill);
    clone.insertBefore(rect, clone.firstChild);
  }

  try {
    return new XMLSerializer().serializeToString(clone);
  } catch (err) {
    console.error("serialize failed", err);
    return null;
  }
}

/* Pick the largest integer scale ≤ desired that fits canvas limits. */
function computeSafeScale(w, h, desired) {
  let scale = desired;
  while (scale > 1) {
    const cw = w * scale, ch = h * scale;
    if (cw <= CANVAS_MAX_SIDE && ch <= CANVAS_MAX_SIDE && cw * ch <= CANVAS_MAX_AREA) break;
    scale -= 1;
  }
  const cw = w * scale, ch = h * scale;
  const fits = cw <= CANVAS_MAX_SIDE && ch <= CANVAS_MAX_SIDE && cw * ch <= CANVAS_MAX_AREA;
  return { scale, fits, clamped: scale !== desired };
}

function updateDimHint() {
  const hint = $("dimHint");
  if (!hint) return;
  const dim = svgDimensions();
  if (!dim) { hint.textContent = "—"; return; }
  if (settings.format === "svg") {
    hint.textContent = `Output: ${Math.round(dim.w)} × ${Math.round(dim.h)} (vector)`;
    return;
  }
  const { scale, clamped } = computeSafeScale(dim.w, dim.h, settings.scale);
  const ow = Math.round(dim.w * scale);
  const oh = Math.round(dim.h * scale);
  hint.textContent = `Output: ${ow} × ${oh}px` + (clamped ? ` (scale capped at ${scale}×)` : "");
}

/* Rasterize current SVG to a canvas. Resolves {canvas} or rejects. */
function rasterize() {
  return new Promise((resolve, reject) => {
    const dim = svgDimensions();
    if (!dim) return reject(new Error("Nothing to export yet — render a diagram first."));

    const { scale, fits } = computeSafeScale(dim.w, dim.h, settings.scale);
    if (!fits) {
      return reject(new Error(
        `Diagram is too large to rasterize even at 1× (${Math.round(dim.w)}×${Math.round(dim.h)}). Export as SVG instead.`
      ));
    }

    const svgStr = buildSvgString(true);
    if (!svgStr) return reject(new Error("Could not serialize the diagram."));

    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    // Timeout in case the image never fires load/error.
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Rasterization timed out."));
    }, RENDER_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }

    img.onload = () => {
      try {
        if (!img.width || !img.height) throw new Error("Rasterized image has zero size.");
        const canvas = $("exportCanvas");
        if (!canvas) throw new Error("Export canvas missing.");
        canvas.width = Math.round(dim.w * scale);
        canvas.height = Math.round(dim.h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get 2D canvas context.");

        if (settings.format === "jpeg") {
          ctx.fillStyle = currentBackground() || "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        cleanup();
        resolve(canvas);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Browser failed to load the SVG for rasterization."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (b && b.size > 0) resolve(b);
        else reject(new Error("Image encoding produced no data (the diagram may exceed canvas limits)."));
      }, mime, quality);
    } catch (err) {
      // toBlob throws SecurityError if the canvas is tainted.
      reject(new Error("Canvas export blocked: " + errMessage(err)));
    }
  });
}

async function exportBlob() {
  if (settings.format === "svg") {
    const svgStr = buildSvgString(false);
    if (!svgStr) throw new Error("Nothing to export yet — render a diagram first.");
    return new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  }
  const canvas = await rasterize();
  const mime = settings.format === "jpeg" ? "image/jpeg" : "image/png";
  const quality = settings.format === "jpeg" ? 0.95 : undefined;
  return canvasToBlob(canvas, mime, quality);
}

/* Sanitize a user filename → safe, non-empty, no extension dupes. */
function safeFilename(name, ext) {
  let base = String(name || "").trim();
  base = base.replace(/\.[a-z0-9]{1,5}$/i, "");          // strip any extension
  base = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, "");      // OS-illegal + control chars
  base = base.replace(/[. ]+$/g, "").replace(/^\.+/, ""); // trailing dot/space, leading dots
  base = base.slice(0, 120).trim();
  if (!base) base = "diagram";
  return `${base}.${ext}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

async function doDownload() {
  if (!diagramEl?.querySelector("svg")) { toast("Render a diagram first", "err"); return; }
  setStatus("Exporting…", "busy");
  try {
    const blob = await exportBlob();
    const name = safeFilename(settings.filename, settings.format);
    downloadBlob(blob, name);
    setStatus("Rendered", "ok");
    toast(`Saved ${name} · ${(blob.size / 1024).toFixed(0)} KB`, "ok");
  } catch (err) {
    setStatus("Export failed", "err");
    toast(errMessage(err), "err");
  }
}

/* IMPORTANT: must be called synchronously from the click handler (no await
   before clipboard.write), or the user-activation expires and the browser
   throws NotAllowedError. We hand ClipboardItem a *promise* of the blob so
   the async rasterization happens inside the write() call while activation
   is still valid. */
function doCopyImage() {
  if (!diagramEl?.querySelector("svg")) { toast("Render a diagram first", "err"); return; }
  if (!navigator.clipboard || typeof navigator.clipboard.write !== "function"
      || typeof window.ClipboardItem === "undefined") {
    toast("Clipboard image copy isn't supported here — use Download instead", "err");
    return;
  }

  const blobPromise = rasterize().then((canvas) => canvasToBlob(canvas, "image/png"));
  // Keep a handle so we can fall back to a download if the clipboard refuses.
  let blobForFallback = null;
  blobPromise.then((b) => { blobForFallback = b; }).catch(() => {});

  let writePromise;
  try {
    writePromise = navigator.clipboard.write([
      new ClipboardItem({ "image/png": blobPromise }),
    ]);
  } catch (err) {
    // Some engines reject promise-valued ClipboardItem synchronously.
    copyFallback(blobPromise, err);
    return;
  }

  writePromise
    .then(() => toast("PNG copied to clipboard", "ok"))
    .catch((err) => copyFallback(blobForFallback ? Promise.resolve(blobForFallback) : blobPromise, err));
}

/* If the clipboard write fails for any reason, don't dead-end the user:
   tell them why and offer the rasterized PNG as a download. */
function copyFallback(blobPromise, err) {
  const m = errMessage(err);
  console.warn("clipboard copy failed:", m);
  Promise.resolve(blobPromise).then((blob) => {
    if (!blob) { toast("Copy failed: " + m, "err"); return; }
    downloadBlob(blob, safeFilename(settings.filename, "png"));
    toast("Clipboard unavailable — downloaded the PNG instead", "err");
  }).catch(() => toast("Copy failed: " + m, "err"));
}

/* ----------------------------------------------------------------
   Color validation
-----------------------------------------------------------------*/
function isValidColor(c) {
  if (typeof c !== "string" || !c) return false;
  const s = new Option().style;
  s.color = "";
  s.color = c;
  return s.color !== "";
}

/* ----------------------------------------------------------------
   Controls wiring
-----------------------------------------------------------------*/
function wireControls() {
  themeSelect.addEventListener("change", guard("Theme change", () => {
    settings.theme = themeSelect.value;
    if (initMermaid()) render({ fit: true });
    saveStateDebounced();
  }));

  exampleSelect.addEventListener("change", guard("Load example", () => {
    const ex = EXAMPLES[exampleSelect.value];
    if (ex == null) { toast("Unknown example", "err"); return; }
    codeEl.value = ex;
    render({ fit: true });
    saveStateDebounced();
  }));

  codeEl.addEventListener("input", () => { scheduleRender(); saveStateDebounced(); });

  // Tab inserts two spaces
  codeEl.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = codeEl.selectionStart, en = codeEl.selectionEnd;
      codeEl.value = codeEl.value.slice(0, s) + "  " + codeEl.value.slice(en);
      codeEl.selectionStart = codeEl.selectionEnd = s + 2;
      scheduleRender();
    }
  });

  $("formatSelect").addEventListener("change", guard("Format change", (e) => {
    settings.format = e.target.value;
    updateDimHint();
    saveStateDebounced();
  }));

  $("scaleRange").addEventListener("input", guard("Scale change", (e) => {
    const v = parseInt(e.target.value, 10);
    settings.scale = isFinite(v) ? clamp(v, 1, 6) : 3;
    $("scaleVal").textContent = settings.scale + "×";
    updateDimHint();
    saveStateDebounced();
  }));

  $("paddingRange").addEventListener("input", guard("Padding change", (e) => {
    const v = parseInt(e.target.value, 10);
    settings.padding = isFinite(v) ? clamp(v, 0, 120) : 16;
    $("padVal").textContent = settings.padding + "px";
    updateDimHint();
    saveStateDebounced();
  }));

  $("filename").addEventListener("input", guard("Filename change", (e) => {
    settings.filename = e.target.value;
    saveStateDebounced();
  }));

  // Background chips
  const bgColorInput = $("bgColor");
  document.querySelectorAll(".bg-chip").forEach((chip) => {
    chip.addEventListener("click", guard("Background select", () => {
      const bg = chip.dataset.bg;
      if (bg === "custom") { bgColorInput.click(); return; }
      settings.background = bg;
      setActiveChip(chip);
      applyPreviewBackground();
      saveStateDebounced();
    }));
  });
  bgColorInput.addEventListener("input", guard("Custom color", () => {
    const v = bgColorInput.value;
    if (!isValidColor(v)) { toast("Invalid color", "err"); return; }
    settings.customBg = v;
    settings.background = "custom";
    $("customSwatch").style.background = v;
    setActiveChip(document.querySelector('.bg-chip[data-bg="custom"]'));
    applyPreviewBackground();
    saveStateDebounced();
  }));

  // Zoom buttons
  $("zoomIn").addEventListener("click", () => centerZoom(1.2));
  $("zoomOut").addEventListener("click", () => centerZoom(1 / 1.2));
  $("zoomFit").addEventListener("click", () => fitView());

  // Editor toolbar
  $("clearBtn").addEventListener("click", guard("Clear", () => {
    codeEl.value = ""; render({ fit: true }); codeEl.focus(); saveStateDebounced();
  }));
  $("copyBtn").addEventListener("click", guard("Copy code", async () => {
    try { await navigator.clipboard.writeText(codeEl.value); toast("Code copied", "ok"); }
    catch { toast("Copy failed — clipboard unavailable", "err"); }
  }));
  $("formatBtn").addEventListener("click", guard("Format code", () => {
    codeEl.value = codeEl.value
      .split("\n")
      .map((l) => l.replace(/\s+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    scheduleRender();
    saveStateDebounced();
  }));

  // Export buttons
  $("downloadBtn").addEventListener("click", () => { doDownload(); });
  $("copyImgBtn").addEventListener("click", () => { doCopyImage(); });

  // Library retry
  $("libRetry").addEventListener("click", guard("Retry load", () => boot()));

  // Save on unload (final flush)
  window.addEventListener("beforeunload", saveState);
}

function centerZoom(factor) {
  if (!viewportEl) return;
  zoomAt(viewportEl.clientWidth / 2, viewportEl.clientHeight / 2, factor);
}

function setActiveChip(active) {
  document.querySelectorAll(".bg-chip").forEach((c) => c.classList.remove("is-active"));
  active?.classList.add("is-active");
}

/* ----------------------------------------------------------------
   Restore persisted UI state into controls
-----------------------------------------------------------------*/
function applyRestoredSettings() {
  themeSelect.value = settings.theme;
  $("formatSelect").value = settings.format;
  $("scaleRange").value = String(settings.scale);
  $("scaleVal").textContent = settings.scale + "×";
  $("paddingRange").value = String(settings.padding);
  $("padVal").textContent = settings.padding + "px";
  $("filename").value = settings.filename;
  $("bgColor").value = isValidColor(settings.customBg) ? settings.customBg : "#1e293b";
  $("customSwatch").style.background = settings.customBg;

  const chip = settings.background === "custom"
    ? document.querySelector('.bg-chip[data-bg="custom"]')
    : document.querySelector(`.bg-chip[data-bg="${CSS.escape(settings.background)}"]`);
  if (chip) setActiveChip(chip);

  applyPreviewBackground();
}

/* ----------------------------------------------------------------
   Global safety nets
-----------------------------------------------------------------*/
function installGlobalHandlers() {
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled rejection:", e.reason);
    toast("Unexpected error: " + errMessage(e.reason), "err");
  });
  window.addEventListener("error", (e) => {
    // Ignore benign ResizeObserver noise
    if (/ResizeObserver loop/i.test(e.message || "")) return;
    console.error("Window error:", e.error || e.message);
  });
}

/* ----------------------------------------------------------------
   Boot
-----------------------------------------------------------------*/
async function boot() {
  const ok = await loadMermaid();
  if (!ok) return;            // overlay stays up with a Retry button
  if (!initMermaid()) return;
  hideLibOverlay();
  setStatus("Ready", "ok");
  render({ fit: true });
}

function init() {
  // Resolve refs
  codeEl = $("code");
  diagramEl = $("diagram");
  stageEl = $("previewStage");
  viewportEl = $("previewViewport");
  statusEl = $("status");
  errorOverlay = $("errorOverlay");
  errorText = $("errorText");
  themeSelect = $("themeSelect");
  exampleSelect = $("exampleSelect");
  panHint = $("panHint");

  if (!codeEl || !diagramEl) {
    document.body.innerHTML = "<p style='color:#fff;padding:40px'>Failed to initialize: missing DOM nodes.</p>";
    return;
  }

  installGlobalHandlers();

  // Restore persisted state (settings + code), else default example.
  const saved = loadState();
  if (saved && saved.settings && typeof saved.settings === "object") {
    Object.assign(settings, saved.settings);
    // sanitize restored values
    settings.scale = clamp(parseInt(settings.scale, 10) || 3, 1, 6);
    settings.padding = clamp(parseInt(settings.padding, 10) || 16, 0, 120);
    settings.editorW = num(settings.editorW, DEFAULT_EDITOR_W);
    settings.exportW = num(settings.exportW, DEFAULT_EXPORT_W);
    if (!isValidColor(settings.customBg)) settings.customBg = "#1e293b";
  }
  applyRestoredSettings();
  applyLayout();
  codeEl.value = (saved && typeof saved.code === "string" && saved.code.trim())
    ? saved.code
    : EXAMPLES.flowchart;

  wireControls();
  initPanZoom();
  initResizers();
  updateDimHint();
  boot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
