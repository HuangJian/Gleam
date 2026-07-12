# Agents Guide

## Core Principles

1. **Ask, don't assume.** If something is unclear, ask before writing a single line. Never make silent assumptions about intent, architecture, or requirements. When running unattended, pick the most reasonable interpretation, proceed, and record the assumption rather than blocking.
2. **Match solution complexity to problem complexity.** Implement the simplest solution for simple problems; invest in better solutions for harder ones. Do not over-engineer or add flexibility that isn't needed yet.
3. **Smallest maintainable change.** Make the narrowest change that solves the actual request. Prefer existing patterns over new abstractions. Avoid broad refactors, speculative helpers, and clever architecture unless clearly justified.
4. **Don't touch unrelated code — but surface what you find.** Do not fix bad code or design smells discovered in passing. Instead, report them so they can be addressed as a separate issue.
5. **Flag uncertainty explicitly.** If unsure about something, see principle 1. If it makes sense, conduct a small, localized, low-risk experiment and bring the hypothesis and results to discuss. Confidence without certainty causes more damage than admitting a gap.
6. **Suggest better ways.** Always open to ideas on better approaches, especially ones with lasting impact over tactical changes. Don't hesitate to propose them.
7. **Assume the user is a principal engineer.** Correct the user when appropriate. Optimize for correctness, speed, judgment, and token efficiency.
8. **FAANG-level code quality.** Clear naming, strong types, simple control flow, minimal mutation, focused functions, pure functions/components where practical, no unnecessary abstraction.

## Context & Communication

### Context Discipline

Protect context aggressively.

- Answer the narrow question first. Inspect the smallest relevant file, symbol, route, component, diff, log, or test output.
- Prefer targeted searches, focused file sections, nearby call sites, capped logs, and scoped validation. Avoid running validation commands like `bun run check` unless necessary.
- Avoid dumping full files, full logs, unrelated directories, broad repo searches, large diffs, or generated output after the relevant code is found.
- Do not byte-cap instruction files, skill files, tool docs, or agent policy files. Read the whole relevant file unless it is unexpectedly huge.

### Communication

- Before editing, state the approach only for non-trivial tasks.
- During complex work, keep updates short: what was found, what changed, what risk remains.
- After work, summarize: what changed, files touched, validation run or why skipped, remaining risk. Keep summaries short; do not explain obvious edits.

## Command Output Discipline

Protect context usage. **Any command with unknown or potentially large output must be scoped and byte-capped.** Line caps alone are unsafe — a single line can be huge.

```bash
# Byte-cap with head/tail
COMMAND 2>&1 | head -c 4000
COMMAND 2>&1 | tail -c 4000

# Good scoped examples
rg -n -m 20 'functionName|ComponentName' src 2>&1 | head -c 200
bash -o pipefail -c 'bun run typecheck 2>&1 | tail -c 500'
bash -o pipefail -c 'bun test 2>&1 | tail -c 2000'
bash -o pipefail -c 'bun run build 2>&1 | tail -c 500'
rg -l "SEARCH_TERM" src 2>&1 | head -c 4000
```

Do not rely on `head -n`, `tail -n`, or `sed -n` as the only cap. If capped output is insufficient, narrow the command before increasing the cap.

Scope before printing content: list files first, search specific paths, count matches when useful. Avoid reading generated, binary, minified, database, or huge JSON/JSONL files unless required.

Preserve exit codes when needed:

```bash
tmp="$(mktemp)"
COMMAND >"$tmp" 2>&1
status=$?
tail -c 5000 "$tmp"
rm -f "$tmp"
exit "$status"
```

Avoid unbounded `cat`, broad `rg`, `find`, `ls -R`, `git diff`, tests, builds, and `select *`.

## Validation

Match validation to risk.

- Skip validation for low-risk changes and say so plainly.
- Use the cheapest useful check for risky changes.
- Do not run full builds unless risk justifies it or the user asks.

Scoped validation commands:

| Command         | Use for                                                       |
| --------------- | ------------------------------------------------------------- |
| `bun test`      | Unit tests (Bun's built-in test runner)                       |
| `bun run build` | Type errors (via `tsc`) + production build (via `vite build`) |
| `bun run dev`   | Local dev server with HMR (for manual browser testing)        |
| `bun run check` | Comprehensive: typecheck + lint + format + tests + build      |

## Task Workflows

Skills in `.agents/skills/` define focused methodologies. Key steps:

### Plan (`.agents/skills/plan`)

For non-trivial, ambiguous, or design-benefiting tasks. Engage the user to clarify requirements, constraints, edge cases. Analyze tradeoffs, propose a design. Output `<task>.plan.md` with goals, non-goals, design decisions, step-by-step plan, files to modify, open questions. Wait for approval before implementation. Do NOT use for trivial or well-understood tasks.

### Bug (`.agents/skills/bug`)

For fixing unexpected behavior.

1. **Diagnose** — Analyze the data flow: `capture → repository → timeline → render`. Add `console.debug` with `[gleam]` prefix at key points. Seek simpler logic for complex conditions.
2. **Write a regression test** — Minimal unit test that reproduces the bug. Should fail without the fix.
3. **Fix the source** — Test should pass.
4. **Build and verify** — `bun run build`. To verify in a real browser, install the built `.user.js` from `dist/`.

### Refactor (`.agents/skills/refactor`)

For restructuring code without changing behavior.

1. **Survey** the target and 1–2 nearby modules to learn the established layout. Do not invent new structure when one exists.
2. **Identify behavior invariants** — public exports, test names, observable side effects, cross-module callers.
3. **Engage on scope** — ask focused questions only where the answer changes the design.
4. **Write `<task>.plan.md`** — goals, non-goals, design rationale, file layout, implementation order, test plan, risks.
5. **Wait for approval** before any code change.
6. **Implement following plan order** — move one module at a time; keep public exports until barrel/index is in place.
7. **Reorganize tests 1:1** with new source layout. Keep every existing test passing; add focused tests for newly-extracted modules.
8. **Run `bun run check`**. Test count should be ≥ pre-refactor.
9. **Do not auto-commit.** Stage, present diff summary, let user invoke commit.

Anti-patterns: speculative abstractions, drive-by cleanup outside scope, renaming public types consumers still reference, inlining test assertions in passing.

### Commit (`.agents/skills/commit`)

See Git & Commit Rules below.

---

## Project: Gleam · 拾光

Gleam is a Tampermonkey UserScript for capturing cognitive moments — brief flashes of understanding that occur while reading or thinking. Each captured moment (a "gleam") bundles a user's thought, the source context that triggered it, and a timestamp. Gleams accumulate into a timeline of cognitive evolution.

The product model is fully specified in `doc/MANIFEST.md` and its 15 chapters under `doc/manifest/`. **Any change touching data structures, immutability rules, or module boundaries must be validated against the MANIFEST first** (see Product Model Fidelity below).

### Tooling

Use Bun for package management and tests. Vite + vite-plugin-monkey handles building. Preact is the UI framework (aliased as `react` via `preact/compat`). Styling uses @emotion/styled with Shadow DOM-scoped cache.

```sh
bun install
bun run test
bun run typecheck
bun run lint
bun run format
bun run build
bun run check         # typecheck + lint + format + tests + build
```

`bun run check` is the preferred final validation.

### Architecture & Layout

```text
src/
  main.tsx             UserScript entry: Shadow DOM mount, Emotion cache, GM menu commands.
  domain/              Product model — pure types and factory functions. Zero internal deps.
    gleam.ts           Gleam, Source, SourceType types + createGleam() factory.
    repository.ts      IRepository interface (the stability anchor).
  infra/               Replaceable adapters implementing domain interfaces.
    gm-storage.ts      GMStorageAdapter — GM_setValue/GM_getValue implementation of IRepository.
  services/            Application logic — orchestrates domain + infra.
    capture.ts         CaptureService — creates gleams from user input + page context.
    timeline.ts        TimelineService — groups gleams chronologically, tracks revisits.
  ui/                  Preact + @emotion/styled components (rendered in Shadow DOM).
    App.tsx            Root component: orchestrates capture, sidebar, search, export.
    theme.ts           Design tokens (dark theme, warm gold accents).
    components/        CapturePanel, CaptureTrigger, GleamCard, ReviewSidebar, SearchBar.
  utils/
    uuid.ts            UUID v7 generation (time-ordered, zero-dependency).

src/__tests__/         Unit tests (bun:test).
dist/                  Generated .user.js output (do not hand-edit).
doc/                   Product manifest and chapter derivations.
```

### Dependency Direction

```
domain  ←  infra  ←  services  ←  ui
 (most stable)                  (most mutable)
```

- **`domain/`** is the leaf — pure types and functions, zero internal imports. It defines the product model in code.
- **`infra/`** depends on `domain/` (implements `IRepository`). Adapters are replaceable; the interface is the contract.
- **`services/`** depends on `domain/` and `infra/` (via interface). Contains application logic.
- **`ui/`** depends on all layers. Most mutable — UI frameworks, styling, interaction patterns can all change.
- **Never reverse a dependency.** Services must not import from `ui/`. Domain must not import from anywhere. Infra must not import from services.

### Domain Model & Immutability

The Gleam data model is the product's sacred core (MANIFEST ch.3, ch.9):

```typescript
interface Gleam {
  // Core fields — IMMUTABLE after creation
  id: string // UUID v7 (time-ordered)
  thought: string // User's understanding (never empty)
  source: Source // Reconstructable context
  created_at: string // ISO 8601

  // Derived fields — mutable
  tags?: string[]
  revisit_count?: number
  last_revisited_at?: string
}
```

**Immutability rules (enforced in code):**

- `createGleam()` validates invariants (non-empty thought, source type required) and returns a frozen-shape object.
- `IRepository.save()` throws if an ID already exists — no upserts on core data.
- `IRepository.updateDerivedFields()` only accepts `tags`, `revisit_count`, `last_revisited_at`. Core fields (`thought`, `source`, `created_at`) are never editable through any code path.
- New understanding = new gleam. Never modify an existing gleam's thought to "update" it.

**When adding fields:**

- New core (immutable) fields require MANIFEST validation — they change the product model.
- New derived (mutable) fields go in `updateDerivedFields()` and are fine to add freely.

### GM API Access

Tampermonkey APIs (`GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`) are declared and used in two places only:

- `src/infra/gm-storage.ts` — storage operations (the adapter pattern).
- `src/main.tsx` — menu command registration (entry point).

When adding new GM API usage, extend these files. Do not scatter `GM_*` calls across services or UI components. This keeps the infra layer replaceable — when the project migrates to SQLite/GraphQL (per `mvp.plan.md`), only `infra/` and `main.tsx` need to change.

### Build Rules

- Source files live under `src/`. Generated output lives under `dist/`.
- Do not hand-edit files in `dist/`; rebuild with `bun run build`.
- The `// ==UserScript==` metadata block is defined in `vite.config.ts` (`monkey()` plugin config), not in source files.

### Testing Rules

- Add or update tests for behavior changes before relying on manual browser checks.
- **Every bug fix must include a regression test.** Minimal unit test that reproduces the bug, fails without the fix, passes with it.
- Put pure logic in small functions and cover with unit tests.
- Tests live in `src/__tests__/` and use `bun:test` (`describe`, `test`, `expect` from `bun:test`).
- Domain logic (`createGleam`, UUID generation, timeline grouping) should always have unit tests.
- Mock the `IRepository` interface in service tests — do not depend on GM storage.
- Avoid live network requests in tests.

### DOM Safety & Shadow DOM

The script runs inside pages owned by other sites. All UI is rendered inside a Shadow DOM to isolate styles:

- **Shadow DOM isolation.** `main.tsx` creates a shadow root and scopes the Emotion cache to it. Never inject styles into the host document.
- **Host element is invisible.** The shadow host (`#gleam-root`) is positioned at 0×0 with no border/margin. Actual UI elements (FAB, sidebar, panels) are `position: fixed` and render inside the shadow tree.
- **Preserve native site handlers.** Use `addEventListener` when augmenting native site elements (e.g., text selection detection). Within Preact trees, use Preact event props (`onClick`, `onInput`).
- **Avoid duplicating real DOM nodes with the same `id`.** The `gleam-root` host is checked for existence before mounting.
- **Keep script-owned classes prefixed** with `gleam-` to avoid collisions with site CSS.

### Code Quality

#### Preact Patterns

All UI code uses Preact components and hooks (via `preact/compat` alias). Avoid imperative DOM construction in Preact trees.

- **JSX for DOM construction.** Use JSX templates, not `createElement` chains or `innerHTML`.
- **`useState` for mutable data.** Lists, fields, open/close states live in `useState`. Mutate via `setState`, never via `.push()` / `.splice()`.
- **Preact event props.** `onClick`, `onInput`, `onKeyDown` instead of `addEventListener` within Preact trees. Use native `addEventListener` only for document-level events (keyboard shortcuts, selection detection).
- **`useEffect` cleanup.** Always return a cleanup function that removes document-level listeners (e.g., `window.removeEventListener`).
- **Service instantiation.** Services (`CaptureService`, `TimelineService`) are constructed in the `App` component with the repository injected. Keep this pattern — do not create module-level singletons.

#### Styling (Emotion)

- **`@emotion/styled` for all components.** Styled components are co-located with their components. Use `theme` from `theme.ts` for colors, shadows, animations — no hardcoded values.
- **Design tokens in `theme.ts`.** All colors, typography, shadows, and animation curves live there. Add new tokens to `theme.ts`, not inline.
- **Dark-first theme.** The UI is designed for dark backgrounds (warm gold `hsl(38, 92%, 55%)` as the brand accent). Maintain this aesthetic.
- **No CSS files.** All styling is Emotion-based. Do not introduce separate `.css` files.

#### File Organization

- When a file exceeds ~300 lines or mixes unrelated concerns, split into a folder with an `index.ts` barrel.
- No circular dependencies.
- Types used by a single module live in that module. Shared domain types live in `domain/`.
- Extract long expressions into named variables. When an inline element exceeds ~100 chars, extract the dynamic content into a variable first.

#### Logging

- **`console.debug`** for ad-hoc troubleshooting. Prefix with `[gleam]` for easy DevTools filtering.
- **`console.warn` / `console.error`** for actual user-visible problems (failed storage write, validation error).

#### Anti-patterns

- **Scattering GM API calls** outside `infra/` and `main.tsx`.
- **Modifying core gleam fields** (`thought`, `source`, `created_at`) through any code path.
- **Hardcoding colors/shadows** instead of using `theme.ts` tokens.
- **Injecting styles into the host document** instead of the Shadow DOM.
- **Module-level mutable state** for cross-function data passing — pass as parameters or use component state.
- **Unguarded `addEventListener` without cleanup** — always remove in `useEffect` cleanup.
- **Single-use abstractions** — prefer inline types and direct logic when a helper is used only once.
- **Wrapper functions that simply call another function.**
- **`as any` or `as never` type casts** — use proper types.

### Product Model Fidelity

Before making changes that touch the product model, verify against the MANIFEST:

| Change type                           | MANIFEST reference    | Action                                                        |
| ------------------------------------- | --------------------- | ------------------------------------------------------------- |
| Modify Gleam core fields              | ch.3 (微光成形)       | Requires discussion. Core fields are the product's identity.  |
| Allow editing core fields             | ch.9 (记忆居所, §三)  | **Never.** Immutability is a hard constraint.                 |
| Change dependency direction           | ch.12 (架构投影, §三) | **Never.** domain ← infra ← services ← ui is invariant.       |
| Add AI-generated content as gleam     | ch.11 (AI之界, §二)   | **Never.** AI output is derived data only.                    |
| Add new derived fields                | —                     | Fine. Add to `updateDerivedFields()`.                         |
| Change UI framework / storage / build | ch.14 (演化法则, §三) | Fine — implementation layer is mutable. Keep adapter pattern. |

---

## Git & Commit Rules

The user manages commits themselves. When asked to prepare a commit:

1. Run `bun run check` to ensure all checks pass first.
2. Stage intended files with `git add`, excluding `*.task.md` and `*.plan.md`.
3. Draft a commit message — concise, clear, ≤20 lines, describing what changed and why.
4. Show the commit message and wait for explicit user approval.
5. On hook rejection, fix the issue and create a new commit (never amend).
6. When asked for a PR, use `gh` and return the URL.

## Subagents

Use subagents only when they save context, save time, or materially improve output quality.

For research, review, and exploration tasks, avoid confirmation bias. Do not pass a preferred conclusion. Ask the subagent to investigate, compare, or verify, and require evidence, tradeoffs, uncertainty, and better alternatives.

Prefer subagents for:

- documentation/API checks
- web research
- non-trivial copywriting/content generation

Avoid subagents for trivial work the main agent can finish faster.

When using a subagent, assign a narrow task and require: findings, files inspected, files changed (if any), validation run (if any), risks or uncertainty. You own final judgment and integration.

## Handoff Checklist

Before finishing a task:

1. Run the most complete local validation command, usually `bun run check`.
2. Confirm generated userscripts were rebuilt when source changed.
3. Review `git status --short`.
4. Mention files changed and validation results.
5. Call out any behavior that was not verified in a real browser.
