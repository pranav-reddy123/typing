# Baud

A typing-performance instrument. Take a test, see what your keystrokes actually
did, and race a friend over a four-character code.

**Type faster. Think faster.**

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. No credentials, no backend, no setup — the app runs
fully against IndexedDB and `BroadcastChannel`. Open a second tab, sign in as a
second account, and you can race yourself for real.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | `tsc -b && vite build`, strict |
| `npm run typecheck` | Type check only |
| `npm test` | Playwright suite (builds and previews first) |

Regenerate the design-review screenshots into `screens/`:

```bash
CAPTURE=1 npx playwright test visual
```

## Backend

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`) and the
app swaps to Postgres with row-level security and Supabase Realtime. Provider
selection happens in one file, `src/lib/data/index.ts`; nothing else in the app
knows which is active. The schema and RLS policies are in
[docs/database.md](docs/database.md).

## Docs

- [docs/product.md](docs/product.md) — what it is, and every metric definition
- [docs/architecture.md](docs/architecture.md) — stack, providers, performance strategy
- [docs/database.md](docs/database.md) — schema, indexes, RLS, result integrity
- [docs/multiplayer.md](docs/multiplayer.md) — transports, event union, edge cases
- [docs/analytics.md](docs/analytics.md) — how every derived number is computed
- [docs/design-system.md](docs/design-system.md) — palette, type, motion, the Signal Strip
- [CLAUDE.md](CLAUDE.md) — development rules
