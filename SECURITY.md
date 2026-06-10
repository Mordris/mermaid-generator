# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately via GitHub's
[**Report a vulnerability**](https://github.com/Mordris/mermaid-generator/security/advisories/new)
(Security → Advisories). Include reproduction steps and impact. You'll get an
acknowledgement, and a fix will be coordinated before any public disclosure.

## Supported versions

The latest release and the `main` branch receive security fixes.

## Scope notes

Mermaid Studio is a fully client-side static site:

- It has **no backend** and stores **no credentials**; diagrams are never uploaded.
- The only network dependency is loading the Mermaid library from a public CDN
  at runtime. Diagram rendering and image export happen entirely in the browser.
- CI runs secret-scanning (gitleaks) on every push and pull request.
