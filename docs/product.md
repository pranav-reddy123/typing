# Baud — Product Definition

## Name & positioning

**Baud** is the unit of signaling rate: symbols transmitted per second. That is
literally what a typing test measures. The name is short, technical, pronounceable,
and belongs to the same world as teletypes, terminals and modems — the world the
product actually lives in.

Wordmark: `baud` — lowercase, Martian Mono, tight tracking.
Mark: a three-cycle square wave — the physical shape of a signal at a fixed baud rate.
Tagline: **Type faster. Think faster.**

Positioning: a measurement instrument for typing, not a game. Every screen answers
"how fast, how accurate, how steady, and is that better than last week?"

## The three experiences

### 1. Practice — the typing surface
The product's centre of gravity. Everything else exists to explain what happens here.
Requirements: sub-frame input latency, no layout shift mid-test, restart on one key,
and metrics that are correct rather than flattering.

### 2. Analysis — the instrument panel
Every number on the dashboard is derived from tests the user actually completed.
There is no seeded, sampled or illustrative data anywhere in the product. If a user
has no tests, they see an empty state that tells them what to do, not a fake chart.

### 3. Racing — the social layer
Private races created in one click, joined with a four-character code, run over a
realtime channel with live per-player progress.

## Audience

Developers and writers who already type fast enough that improvement requires
measurement. They value density, keyboard control and honest numbers over
onboarding tours and celebration confetti.

## Non-goals

- Gamified XP, coins, levels, mascots, streak-shaming.
- Multi-theme skinning. Baud is one instrument with one look.
- A social feed. Friends exist to race and compare, not to post.

## Voice

Declarative and unhedged. Labels name what the user controls, in the user's words:
"Restart test", not "Reset session state". Errors say what happened and what to do.
Empty states are invitations: "No tests yet. Take one — it takes 15 seconds."

## Metric definitions (single source of truth)

| Metric | Definition |
|---|---|
| WPM (net) | `(correctChars / 5) / minutes` — only characters that were correct at the moment of submission count |
| Raw WPM | `(allTypedChars / 5) / minutes` — every keystroke counts, right or wrong |
| Accuracy | `correctKeystrokes / totalKeystrokes` over the whole test, including corrected mistakes |
| Consistency | `100 × (1 − coefficientOfVariation)` of per-second raw WPM samples, floored at 0 |
| Errors | Count of keystrokes that did not match the expected character |
| Characters | `correct / incorrect / extra / missed` |

These formulas live in exactly one place: `src/lib/typing/metrics.ts`. No screen
recomputes them locally.
