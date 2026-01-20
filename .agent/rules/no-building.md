---
trigger: always_on
---

## NO-BUILD FRONTEND VIBE RULES (2026 EDITION v 1.1)

Role: You are an expert in Modern Native Web Standards and "No-Build" architecture.
Goal: Generate code that runs directly in modern browsers without bundling/transpiling.

### 1. 核心架构 (Architecture & ESM)

* **Module System:** STRICTLY use Native ES Modules (`type="module"`).
    * Files must be isolated modules using absolute paths or `./`, `../`.
    * All local imports must end with `.js` extensions.
* **Dependency Resolution (Crucial):**
    * **ALWAYS use Import Maps** (`<script type="importmap">`) in `index.html`.
    * NEVER use bare import specifiers (e.g., `import x from 'pkg'`) in JS files unless defined in the Import Map.
    * **CDN Strategy:** Use `esm.sh` or `unpkg.com` as the primary module source. Prefer `esm.sh` for its auto-polyfilling and tree-shaking capabilities.

### 2. 编码风格 (Vanilla-First & Modern)

* **Logic:**
    * Use native Web APIs (`fetch`, `CustomElements`, `Proxy`) where possible.
    * **No-Build UI Patterns:**
        * If a framework is needed, PREFER **Preact + htm** (Tagged Templates) or **Lit** (Web Components).
        * AVOID runtime JSX compilers (like Babel standalone) due to performance costs.
        * Use Tagged Templates (e.g., `html\`<div>...</div>\ ` `) for declarative UI without compilation.
* **State Management:**
    * Use `EventTarget`, `CustomEvent`, or `Signals` (via a micro-library) instead of Redux/MobX.

### 3. 第三方库策略 (External Libraries Strategy)

* **Selection Criteria:**
    * **ESM Only:** Libraries must be consumed as ES Modules.
    * **Micro-Libs:** Prefer small, focused libraries (e.g., `ky` over `axios`, `date-fns` over `moment`).
* **Integration Pattern:**
    * Add the library URL to the Import Map.
    * Import it by name in the JS file.
    * Example: `"imports": { "confetti": "https://esm.sh/canvas-confetti" }` -> `import confetti from 'confetti'`.

### 4. 样式与视觉 (Modern CSS)

* **No Preprocessors:** DO NOT generate SCSS/Less.
* **Features:**
    * Use **Native CSS Nesting**, **CSS Variables**, and **CSS Layers** (`@layer`).
    * Use **Container Queries** for component responsiveness.

### 5. 类型检查 (Type Safety)

* **JSDoc:** Use JSDoc for type definitions (`@type`, `@param`).
* **External Types:** Import types directly from the library's declaration files within JSDoc if needed, or rely on IDE inference.

### Constraints

* NEVER suggest `npm install` for runtime code (only for local dev servers/tools).
* NEVER generate build scripts (Webpack/Vite/Rollup).
* NEVER use `require()`.