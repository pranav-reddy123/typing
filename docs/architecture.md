# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 7 | Fast HMR, native ESM, easy manual chunking |
| UI | React 19 + TypeScript (strict) | — |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) | Tokens live in CSS, not a JS config |
| Routing | React Router 7 (data router) | Nested layouts + lazy route modules |
| State | Zustand | Small stores, selector subscriptions, no context re-render cascades |
| Motion | CSS animations + Web Animations | The whole motion budget is four transitions; a runtime would be pure weight |
| Scroll | Lenis | Marketing route only, lazily imported |
| Backend | Supabase (auth, Postgres, Realtime) — optional | Swappable behind a provider interface |

### Dependencies deliberately NOT used

- **GSAP, Framer Motion** — the product's entire motion budget is a toast fade, a
  results entrance, a caret blink and a countdown pulse. Framer Motion was used
  first and measured at **124 kB on every route** to render those four things;
  it was removed and replaced with ~20 lines of CSS keyframes. GSAP would have
  been the same trade with a different name.
- **React Three Fiber / Three.js** — the signature interaction is a 2D signal trace.
  A WebGL scene would cost ~600 kB and a compositor thread to render something a
  120-line canvas routine does at 60 fps on integrated graphics. 3D here would be
  decoration, and the brief explicitly ranks performance above spectacle.
- **A charting library** — every chart in Baud is a line, an area, a bar row or a
  keyboard grid. These are ~40 lines of SVG each and render exactly to our type
  scale and palette. Recharts/visx would be 100 kB+ to look less like ours.
- **shadcn/ui as a whole** — we vendored only the two primitives with real a11y
  complexity (dialog, dropdown) as local components. The rest are one-file buttons.

## Provider architecture (the key structural decision)

The product must run and be testable with **no credentials**, while being ready for
a real backend. Everything that touches persistence or the network goes through two
interfaces:

```
src/lib/data/types.ts      -> DataProvider   (users, tests, friends, races, leaderboards)
src/lib/realtime/types.ts  -> RealtimeChannel (race transport)
```

Two implementations of each:

| Interface | Local implementation | Remote implementation |
|---|---|---|
| `DataProvider` | `LocalProvider` — IndexedDB (`baud/v1`), password hashed with WebCrypto PBKDF2 | `SupabaseProvider` — Postgres + RLS |
| `RealtimeChannel` | `BroadcastChannelTransport` — real cross-tab/window realtime via `BroadcastChannel` | `SupabaseTransport` — Supabase Realtime broadcast + presence |

Selection happens once, in `src/lib/data/index.ts`, from
`import.meta.env.VITE_SUPABASE_URL`. Nothing else in the app knows which is active.

This is not a mock. `BroadcastChannelTransport` is genuine realtime message passing
between independent browser contexts — two windows race each other with no shared
React state, over the same event protocol Supabase uses. The transport swaps; the
race logic, reducers and UI do not change by one line.

## Route structure

```
/                     Landing (marketing)          public,  eager
/practice             Typing surface               public,  eager
/login  /signup       Auth                         public,  lazy
/race                 Race lobby / create / join   auth,    lazy
/race/:code           Live race room               auth,    lazy
/dashboard            Analytics                    auth,    lazy
/history              Test history + detail        auth,    lazy
/friends              Social                       auth,    lazy
/leaderboard          Leaderboards                 public,  lazy
/profile/:username    Public profile               public,  lazy
/settings             Preferences + account        auth,    lazy
*                     Not found                    public
```

`/` and `/practice` are in the eager bundle because they are the product's front
door and must be interactive immediately. Everything else is `React.lazy`.

## Component architecture

```
src/
  app/            router, Layout, RequireAuth guard, ErrorBoundary
  components/
    brand/        Logo, Wordmark
    ui/           Button, LinkButton, Band, Stat, Segmented, Toggle, Field,
                  Dialog, Tag, Avatar, EmptyState, ErrorPanel, Skeleton, Toaster
    chart/        LineChart, BarRow, KeyboardHeatmap, SignalStrip
    typing/       TypingSurface, HeroTyper, ConfigBar, Results
    race/         RaceTrack
  lib/
    typing/       engine.ts, metrics.ts, words.ts, quotes.ts
    data/         types.ts, local.ts, supabase.ts, index.ts
    realtime/     types.ts, broadcast.ts, supabase.ts, protocol.ts
    analytics/    aggregate.ts, insights.ts, heatmap.ts
    achievements/ catalog.ts, evaluate.ts
  stores/         session.ts, config.ts, toast.ts
  hooks/          useAsync, useRace, useMediaQuery, useReducedMotion,
                  useCountUp, useCopy, useDocumentTitle
  styles/         tokens.css, base.css
```

Rule: `lib/` is pure TypeScript with no React import. It is unit-testable and is
where all correctness-critical logic lives.

## State management

Three Zustand stores, each small and each with a clear owner:

- `session` — current user, auth status. Persisted via the DataProvider.
- `config` — test configuration and preferences. Persisted to `localStorage`
  synchronously so a reload never loses a mode selection.
- `toast` — transient notifications.

**Typing state is deliberately not in any store.** See below.

## Performance strategy

The typing surface is the hard constraint: 60 fps with a keystroke arriving every
~120 ms at 100 WPM, on integrated graphics.

1. **The engine is a plain class, not React state.** `TypingEngine` (`lib/typing/engine.ts`)
   holds the full test state in instance fields. `TypingSurface` mounts it once in a
   ref. A keystroke calls `engine.input(char)` — zero `setState`, zero re-render.
2. **Characters are pre-rendered spans; input mutates `className` only.** On mount we
   build one `<span>` per character and cache the node list in a ref. A keystroke
   flips at most two class names and moves the caret with a `transform`. No
   reconciliation, no layout thrash.
3. **Meters update on a 100 ms interval, not per keystroke**, writing through
   `ref.textContent`. WPM changing at 60 Hz is noise; at 10 Hz it is readable and
   costs nothing.
4. **The Signal Strip is one canvas with one rAF loop**, reading from the engine's
   ring buffer. It never touches React.
5. **Route-level code splitting** for dashboard, race, social and charts.
6. **Fonts are self-hosted variable WOFF2** (`@fontsource-variable`) with
   `font-display: swap`; no third-party font request on the critical path.
7. `content-visibility: auto` on below-fold marketing sections.

Result: a keystroke's work is O(1) DOM writes, and React renders during a test
happen only when the user changes configuration or the test ends.

## Auth flow

```
signup ──> DataProvider.signUp(email, username, password)
             LocalProvider: PBKDF2-SHA256 (210k iters) + random salt -> IndexedDB
             Supabase:      supabase.auth.signUp + profiles row via trigger
           └─> session store hydrated -> redirect to intended route or /practice

boot   ──> DataProvider.getSession() -> hydrate -> render router
guard  ──> <RequireAuth> renders <Navigate to="/login?next=..."> when anonymous
```

Anonymous users can take tests. Results are held in an anonymous local bucket and
migrated into the account on first sign-in, so nobody loses work by signing up late.

**Sessions are tab-scoped with a browser-scoped fallback.** `LocalProvider` writes
the session pointer to both `sessionStorage` and `localStorage`, and reads
`sessionStorage` first. A new tab therefore inherits your session (the behaviour
people expect), but a tab that signs in as somebody else keeps that account to
itself. That is also what makes a local two-player race possible in one browser —
`BroadcastChannel` is origin-scoped, so both players must share a profile, and
without per-tab sessions they would share an account too.

## Error handling

- A route-level `ErrorBoundary` renders a recoverable panel, never a white screen.
- Every async surface has explicit `loading` / `empty` / `error` / `ready` states
  driven by the `useAsync` hook's discriminated union — the type system makes it
  impossible to render a list without handling the other three.
