# AGENTS.md — TabGroup Auto

This repo is a **vanilla Chrome Extension (Manifest V3)** with no build system, linting, tests, or package manager configs.
All files are plain HTML/CSS/JS. Keep changes small and consistent with existing style.

---

## 1) Build / Lint / Test Commands

**No build system**
- There is no `package.json`, no bundler, no transpiler.
- No lint or test tooling is configured.

**Manual verification (recommended)**
- Load the extension via `chrome://extensions` → **Load unpacked** → select repo root.
- Test behaviors in a real Chrome session (create tabs/groups, open popup/options pages).

**Single test**
- There is no test framework or test runner in this repo.

---

## 2) Code Style & Conventions

### Language & Runtime
- JavaScript only (no TypeScript).
- Chrome Extension APIs (Manifest V3): `chrome.tabs`, `chrome.tabGroups`, `chrome.storage`, `chrome.windows`.

### File Layout
- `background.js`: service worker logic for tab grouping.
- `popup.html` / `popup.js`: popup UI and logic.
- `options.html` / `options.js` / `options.css`: options page UI and logic.
- `manifest.json`: extension metadata and permissions.
- `privacy-policy.html`: static page.
- `images/`: icons and screenshots.

### Formatting / Style
- Indentation is mostly **4 spaces** in JS/HTML/CSS (some files use 2 spaces; avoid reformatting).
- Use existing spacing and line breaks in the file being edited.
- Keep inline styles where they already exist; avoid refactoring unless necessary.
- Prefer simple DOM manipulation and template strings, consistent with current code.

### Imports / Modules
- No ES modules or bundlers are used.
- Scripts are loaded via `<script src="..."></script>` in HTML.
- Avoid introducing `import`/`export` unless converting the entire file (not recommended).

### Naming Conventions
- Use `camelCase` for variables/functions.
- DOM elements are referenced via `document.getElementById(...)` and stored in `const` variables.
- Keep naming descriptive and consistent with existing patterns (`groupSelect`, `ruleGroupSelect`, `ignorePopup`).

### Error Handling
- Use `try/catch` around Chrome API operations that can fail.
- Log errors with `console.error(...)` (existing pattern).
- Avoid empty `catch` blocks.

### Storage Usage
- Settings are persisted with `chrome.storage.local`.
- Expect keys like: `defaultGroupId`, `defaultGroupTitle`, `ignorePopup`, `urlRules`.
- When adding new keys, document them in code comments only if necessary.

### UI / DOM Patterns
- UI is rendered by direct DOM updates and inline styles.
- Dynamic lists are built with `innerHTML` + `createElement` patterns.
- Use simple event listeners (no frameworks).

### Chrome Extension Constraints
- Keep permissions minimal and consistent with `manifest.json`.
- Background code runs in a service worker; avoid long-lived state.
- UI code must run inside popup/options pages only.

---

## Existing Rules & Agent Instructions

No additional agent rules are present:
- No `AGENTS.md` found (this file is new).
- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md`.

---

## Suggested Workflow for Changes

1. Make a minimal change in the appropriate file.
2. Reload extension in `chrome://extensions`.
3. Verify behavior in a real browser session.
4. Avoid broad refactors or reformatting.

---

## Notes for Agents

- This repo is small and direct—avoid over-engineering.
- Do not introduce new dependencies unless explicitly requested.
- Prefer functional fixes over stylistic cleanup.
