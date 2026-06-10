# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Add user-facing changes here as they merge, under the headings below. -->
<!-- ### Added / Changed / Fixed / Removed / Security -->

## [1.0.0] - 2026-06-10

### Added
- Live Mermaid editor with 250 ms debounced rendering; the last valid diagram
  stays on screen while you fix syntax errors.
- Export to **PNG**, **JPEG**, and **SVG** with a selectable **1×–6×** resolution
  scale (output dimensions shown live and auto-capped to browser canvas limits).
- Drag-to-pan and scroll-to-zoom preview (pointer + touch), with zoom buttons,
  **Fit**, and double-click-to-fit.
- **Resizable panels** with draggable gutters (double-click to reset, keyboard
  accessible); sizes persist.
- Background control (transparent / dark / white / custom color) applied to both
  the preview (WYSIWYG) and the export.
- Adjustable padding, copy-image-to-clipboard, 10 built-in examples, 5 themes.
- State persistence via `localStorage`.
- Dockerized deployment (nginx) on the non-conflicting port **8473**, with
  `Makefile` and `npm` convenience scripts.

### Fixed
- Clipboard copy uses a promise-valued `ClipboardItem` so user activation is
  preserved, with a download fallback when the clipboard is unavailable.
- Drag-to-pan no longer selects the SVG text in the preview.
- Canvas export is never tainted (native SVG `<text>`, not HTML labels).

### Security
- Fully client-side; diagrams are never uploaded. No secrets or backend.

[Unreleased]: https://github.com/Mordris/mermaid-generator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Mordris/mermaid-generator/releases/tag/v1.0.0
