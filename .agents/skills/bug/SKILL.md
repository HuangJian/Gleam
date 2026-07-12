---
name: bug
description: Methodology for investigating and fixing bugs with behavior preservation and test-driven validation
license: MIT
compatibility: opencode
---

## What I do

Investigate and fix bugs using a systematic approach.

## When to use me

Use when the user reports a bug or asks to fix unexpected behavior.

## Diagnosis

1. **Analyze the code** — Understand the data flow: `capture → repository → timeline → render`
   - **Capture**: text selection detection, CapturePanel input, CaptureService.capture()
   - **Repository**: GMStorageAdapter save/load/search, Gleam immutability constraints
   - **Timeline**: TimelineService grouping, date formatting, revisit counting
   - **Render**: Preact components (App, ReviewSidebar, GleamCard), Emotion styled, Shadow DOM
2. **Add console.debug** — Log intermediate state at key points, filter with `[gleam]` prefix
3. **Seek simpler logic** — If the logic is complex (timezones, multiple conditions), ask if there's a simpler way

## Fix Steps

1. **Write a unit test to reproduce** — Use the standard describe format:

   ```typescript
   import { describe, test, expect } from 'bun:test'

   describe('feature', () => {
     test('bugfix: bug description', () => {
       // Arrange
       // Act
       // Assert - should fail without fix
     })
   })
   ```

2. **Fix the source code** — Tests should pass

3. **Build and verify** — `bun run build`
   - To verify in a real browser, install the built `.user.js` from `dist/`
   - `console.debug` calls will appear in DevTools when filtering by `[gleam]`

## Principles

- Try analyzing the code first to find logic bugs, then add logging, then consider environment changes or external data format changes
- Simpler is better
- Never modify core Gleam fields (`thought`, `source`, `created_at`) to "fix" a data issue — create a new gleam instead
