# Baud — development rules

Baud is a typing-performance instrument. Read `docs/product.md` before changing
product behaviour, `docs/architecture.md` before adding a module, and
`docs/design-system.md` before writing a style.

## Before you change anything

1. Read this file and the relevant doc in `docs/`.
2. Search for an existing component before creating one (`src/components/ui`).
3. Prefer extending working code over rewriting it.
4. Do not add a dependency without writing down, in `docs/architecture.md`, what it
   replaces and what it costs in kB.

## Hard rules

**Never put per-keystroke state into React.** The typing engine is a class in
`src/lib/typing/engine.ts`. It owns test state in instance fields and mutates the
DOM directly through cached node references. If you find yourself writing
`setState` in a keydown handler, you are on the wrong path.

**One definition of every metric.** WPM, raw WPM, accuracy and consistency are
defined once, in `src/lib/typing/metrics.ts`. No component may compute them.

**No invented data, anywhere.** Charts, cards, insights and leaderboards render only
what the user actually produced. If there is not enough data, render an empty state
that says what to do next. A placeholder chart is a bug, not a nicety.

**`src/lib/**` never imports React.** It is pure, portable, and testable.

**Every async surface handles four states.** `useAsync` returns a discriminated
union of `loading | error | empty | ready`. Handle all four or it will not compile.

**TypeScript stays strict.** No `any`, no non-null `!` on values that can genuinely
be null, no `@ts-expect-error` without a comment naming the upstream issue.

## Style rules

- Tokens only. No hex literal in a component; use the CSS variables from
  `src/styles/tokens.css`. If you need a colour that does not exist, add a token and
  justify it in the design system doc.
- Type roles are fixed: `font-display` (Martian Mono) for titles and big numerals,
  `font-sans` (IBM Plex Sans) for prose, `font-mono` (JetBrains Mono) for the typing
  surface and tabular data. Do not mix roles for effect.
- Layout is bands and hairlines, not cards. Reach for `<Band>` before a bordered box.
- Focus is always visible. Removing an outline without replacing it fails review.

## Motion rules

- Nothing animates during an active test except the caret and the signal trace.
- Charts animate on entry once. Never on data update.
- Every animation must be inert under `prefers-reduced-motion: reduce`. Test it.

## Realtime rules

- The event union in `src/lib/realtime/protocol.ts` is the contract. Adding a field
  means updating the reducer and both transports.
- The reducer is pure and order-tolerant. Never let it read the clock or the DOM.
- Progress messages are throttled to 4 Hz. Do not send on every keystroke.

## When something fails

Diagnose the cause before touching code. State the root cause in the commit or the
reply, fix that, then re-run the relevant Playwright spec. Do not patch a symptom
and move on.

## Definition of done for a feature

- Loading, empty, error and success states all exist.
- Keyboard-only path works, focus is visible, and the reduced-motion path is sane.
- Layout verified at 375 / 768 / 1440.
- No new console errors or warnings.
- `npm run build` passes with strict TypeScript.
- A Playwright spec covers the happy path.

## Commands

```
npm run dev         vite dev server on :5173
npm run build       tsc -b && vite build
npm run typecheck   strict type check
npm test            playwright suite
```
