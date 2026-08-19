# Design system

## Direction

Baud is an **instrument**, not an app. The reference points are an oscilloscope
face, an amber phosphor terminal, and a lab bench panel: hairline rules, gutter
labels, monospaced numerals, and one colour that means "signal".

Deliberately avoided: the near-black-plus-acid-green look that every dark developer
tool has converged on; glass panels; purple gradients; card grids with 12 px radii
and a shadow. Baud has almost no cards. Content sits in **bands separated by
hairlines**, with a small uppercase label in the left gutter naming the band. That
single structural device carries the whole layout and is the reason the product does
not look like a dashboard template.

## Colour

Amber, not green. Amber phosphor is the other half of terminal history (Wyse, IBM
3279), it reads warmer and more precise than green at small sizes, and it is not
what the rest of the category is doing. The base is blue-shifted ink rather than
neutral black, so amber sits on a genuine complement instead of on grey.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#0A0C10` | page base |
| `--slab` | `#11141B` | raised surface, inputs, menus |
| `--rule` | `#1D222C` | hairlines, borders, chart grid |
| `--mute` | `#6C7484` | secondary text, axis labels |
| `--paper` | `#E7EAF0` | primary text |
| `--signal` | `#FFA318` | the accent: caret, primary series, focus, CTAs |
| `--trace` | `#4FC3D6` | second data series (raw WPM, comparisons) |
| `--fault` | `#E0596A` | errors, destructive actions |

Two data colours, not one. A single-accent palette forces every chart to overlay two
series in the same hue - amber for net WPM and cyan for raw is instantly readable
and is the only place cyan appears, so it never becomes decoration.

Contrast: `--paper` on `--ink` is 15.1:1; `--mute` on `--ink` is 5.4:1; `--signal`
on `--ink` is 9.8:1. All pass AA at body size, and `--signal` passes AAA for large
text.

## Type

Three faces, three jobs, no overlap.

| Role | Face | Usage |
|---|---|---|
| Display | **Martian Mono Variable** | wordmark, page titles, hero, big numerals. Tracking `-0.04em` at display sizes, `-0.01em` at 20 px. Never below 14 px, never for paragraphs. |
| UI / body | **IBM Plex Sans Variable** | everything a person reads as prose: labels, descriptions, buttons, tables |
| Typing / data | **JetBrains Mono Variable** | the typing surface, tabular numerals, codes, timestamps |

Martian Mono is a wide technical monospace - it makes "142" look like an instrument
readout rather than a marketing number, and it is uncommon enough that the product
is recognisable from a screenshot of its type alone. IBM Plex Sans ties back to the
teletype lineage the name comes from. JetBrains Mono is chosen for the typing
surface specifically for its disambiguated `l/1/I` and `0/O` - during a typing test,
glyph ambiguity is a bug.

Scale (rem, 16 px root): `0.6875 / 0.75 / 0.8125 / 0.875 / 1 / 1.25 / 1.5 / 2 /
2.75 / 4 / 5.5`. Two utility sizes below 14 px exist only for gutter labels and
axis ticks, both uppercase with `0.12em` tracking.

## Space and layout

4 px base unit. Content measure 1120 px; typing surface capped at 62ch for
readability. Radii: 4 px on controls, 2 px on tags, 0 on bands. Nothing is round;
this is an instrument.

The band grid:

```
| label |                       content                         |
| gutter|                                                        |
|-------|--------------------------------------------------------|
| 132px |                       1fr                              |
```

Below 900 px the gutter label moves above its band and the layout becomes a single
column - the mobile layout is a different arrangement of the same parts, not a
squeezed desktop.

## Motion

| Token | Value | Used for |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | entrances, panels |
| `--ease-io` | `cubic-bezier(0.65, 0, 0.35, 1)` | position changes |
| `--t-fast` | `120ms` | hover, focus, toggles |
| `--t-base` | `220ms` | panels, page transitions |
| `--t-slow` | `560ms` | chart draw-in, number count-up |

Rules: nothing animates during an active typing test except the caret and the signal
trace. Charts draw once on entry and never again. Numbers count up only on the
results screen and only once. `prefers-reduced-motion: reduce` collapses every
duration to 0 ms via a single global override and disables the signal trace's
scrolling, leaving a static waveform.

## The signature: the Signal Strip

One element the product is remembered by, and it comes straight from the name.

A canvas strip renders your typing as a live signal trace: instantaneous WPM as the
waveform's amplitude, scrolling right to left at a fixed rate. Correct keystrokes
extend the trace in `--signal`; each error punches a downward notch in `--fault`.
Consistency is legible as the smoothness of the line - a bursty typist literally
sees a ragged wave.

The same object appears in three places, and that continuity is the point:

1. **During a test** - a 44 px strip pinned below the words, ambient and peripheral.
2. **On the results screen** - the same trace, expanded to a full graph with axes.
   It does not appear; it *zooms out* from the strip you were just watching.
3. **In history and on profiles** - the same renderer at 24 px as a row sparkline.

Implementation: one `<canvas>`, one `requestAnimationFrame` loop, a fixed-size ring
buffer written by the typing engine. It never touches React state and costs about
0.3 ms per frame at DPR 2. Under reduced motion it renders the completed trace
statically with no animation loop at all.

## Components

Buttons: three variants (`primary` filled amber on ink, `ghost` hairline, `quiet`
text-only), one size scale, 40 px default height, focus ring is a 2 px `--signal`
outline offset 2 px - never `outline: none` without a replacement.

Empty, loading and error states are first-class components (`EmptyState`,
`Skeleton`, `ErrorPanel`), not ad-hoc markup, so every feature gets the same
treatment and none can ship as a blank div.
