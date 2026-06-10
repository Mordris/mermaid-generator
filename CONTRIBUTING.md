# Contributing to Mermaid Studio

Thanks for your interest in contributing! This guide explains the commit, PR,
and release conventions so everyone follows the same template.

## Getting started

```bash
git clone https://github.com/Mordris/mermaid-generator.git
cd mermaid-generator
npm run setup           # registers the commit-message template (one time)
docker compose up -d --build   # or: npm start  /  make up
```

Open http://localhost:8473. See the [README](README.md) for all run options.

There is no build step — it's plain `index.html` + `styles.css` + `app.js`.
Match the style of the surrounding code; no new tooling or frameworks.

## Branching

Branch off `main`. Name branches by type:

```
feat/jpeg-quality-slider
fix/clipboard-activation
docs/run-commands
```

## Commits — Conventional Commits

This repo uses [Conventional Commits](https://www.conventionalcommits.org).
Run `npm run setup` once to load the template (`.gitmessage`); then `git commit`
(no `-m`) opens it pre-filled with guidance.

```
<type>(<scope>): <subject>

<body — what & why, wrapped at 72 chars>

<footer — BREAKING CHANGE / Closes #123>
```

| Type | When to use | Version bump |
| --- | --- | --- |
| `feat` | New user-facing feature | **minor** |
| `fix` | Bug fix | **patch** |
| `perf` | Performance improvement | patch |
| `docs` | Documentation only | — |
| `refactor` | No behavior change | — |
| `style` | Formatting/whitespace | — |
| `test` | Tests | — |
| `build` / `ci` | Build system / pipelines | — |
| `chore` | Maintenance | — |
| `revert` | Revert a previous commit | — |

A `BREAKING CHANGE:` footer (or `type!:`) triggers a **major** bump.

**Common scopes:** `editor`, `preview`, `export`, `ui`, `docker`, `nginx`,
`ci`, `release`, `deps`, `readme`.

Examples:

```
feat(export): add WebP output format
fix(preview): stop drag from selecting SVG text
docs(readme): document the run/stop commands
```

## Pull requests

1. Open a PR against `main`. The [PR template](.github/PULL_REQUEST_TEMPLATE.md)
   loads automatically — fill it in.
2. **The PR title must be a valid Conventional Commit** — PRs are
   **squash-merged** and the title becomes the commit message. A CI check
   enforces this.
3. Update `CHANGELOG.md` under **[Unreleased]** for any user-facing change.
4. CI must pass: the Docker image builds, nginx config validates, the app
   serves, and no secrets are detected.
5. Apply a label so the change is categorized in release notes (see below).

### Labels → release-note categories

| Label | Section |
| --- | --- |
| `enhancement` / `feature` | 🚀 Features |
| `bug` / `fix` | 🐛 Fixes |
| `performance` | ⚡ Performance |
| `documentation` | 📝 Documentation |
| `build` / `ci` / `chore` / `dependencies` | 🏗️ Build, CI & Maintenance |
| `breaking-change` | 💥 Breaking Changes |

## Releasing (maintainers)

Releases are automated. To cut version `X.Y.Z`:

1. Move the **[Unreleased]** notes in `CHANGELOG.md` into a new
   `## [X.Y.Z] - YYYY-MM-DD` section and update the compare links at the bottom.
2. Bump `version` in `package.json`.
3. Commit: `chore(release): vX.Y.Z`.
4. Tag and push:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main --follow-tags
   ```

5. The [Release workflow](.github/workflows/release.yml) publishes a GitHub
   Release with notes auto-generated from merged-PR labels
   (see [.github/release.yml](.github/release.yml)). Tags like `vX.Y.Z-rc.1`
   are marked as pre-releases automatically.

### Versioning

[SemVer](https://semver.org): **MAJOR** for breaking changes, **MINOR** for
new features, **PATCH** for fixes.

## Reporting bugs & ideas

Use the [issue templates](.github/ISSUE_TEMPLATE) for bugs and feature requests.
For questions, open a [Discussion](https://github.com/Mordris/mermaid-generator/discussions).
Security issues: see [SECURITY.md](SECURITY.md).

By contributing, you agree your work is licensed under the project's
[MIT License](LICENSE) and that you follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
