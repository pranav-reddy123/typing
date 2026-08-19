# Analytics

## The rule

Every number rendered anywhere in Baud is computed from tests the signed-in user
actually completed. There is no seeded data, no illustrative chart, no
"representative sample". When there is nothing to show, a chart is replaced by an
empty state that names the next action.

## Data model

The dashboard reads three record types and derives everything else:

```
TestRecord[]     one per completed test  (wpm, raw, accuracy, consistency, mode, ...)
SampleSeries     per-test per-second arrays (wpm, raw, errors)
KeyEventTally[]  per-test (expected, typed, count) aggregates
```

All derivation lives in `src/lib/analytics/` and is pure:

| Module | Exports |
|---|---|
| `aggregate.ts` | `summarise()`, `seriesByDay()`, `distributionByTarget()`, `personalRecords()`, `streak()` |
| `heatmap.ts` | `keyAccuracy()`, `confusionPairs()`, `weakestKeys()` |
| `insights.ts` | `deriveInsights()` |

## Derivations

**Overview cards** - average WPM, best WPM, average accuracy, best accuracy, tests
completed, total typing time, current streak. Averages exclude tests shorter than
5 seconds (an abandoned test is not a data point).

**Performance over time** - tests bucketed by local calendar day, each day reduced
to mean and best WPM. Ranges: 7d / 30d / 3m / 1y / all. With fewer than 2 days of
data the chart is replaced by "Two days of tests will draw a trend line."

**Consistency** - the mean of per-test consistency, plus its own trend line.
Consistency is `100 x (1 - stddev/mean)` of the per-second raw WPM samples; a
perfectly even typist scores 100, someone who bursts and stalls scores low even at
the same average speed.

**Distribution by target** - performance grouped by 15/30/60/120 s and by word
counts, showing count, mean WPM and mean accuracy per bucket. This is what powers
the insight "your accuracy is strongest during 30-second tests" - it is a real
argmax over real buckets, and it is only stated when the bucket has at least 5 tests
and beats the runner-up by a margin larger than the standard error.

**Streak** - consecutive local calendar days with at least one test, counted
backwards from today; today not yet counted breaks nothing until tomorrow.

## Keyboard heatmap

Built from `KeyEventTally` aggregates across the selected range:

```
accuracy(key) = correct(key) / attempts(key)
```

A key is rendered at full surface colour when it has fewer than 20 attempts
(insufficient data - shown as neutral, never as "perfect"), and otherwise tinted
toward `--fault` in proportion to `1 - accuracy`, clamped to the observed range so
the scale adapts to the user rather than to an absolute threshold. Hovering a key
shows attempts, accuracy, and the character most often typed in its place.

`confusionPairs()` returns the top (expected, typed) pairs by count - this is the
"most common error pairs" table and it is genuinely the most useful thing on the
page: it tells you that you type `teh` for `the`, not merely that `e` is hard.

## Insights

`deriveInsights()` returns at most three statements, each with a computed value and
an explicit guard. An insight is emitted only when it is statistically defensible:

| Insight | Emitted when |
|---|---|
| "Your WPM improved by X% this month." | >= 10 tests in each of the last two 30-day windows; delta >= 2% |
| "Your accuracy is strongest during N-second tests." | winning bucket has >= 5 tests and leads by more than the pooled standard error |
| "Punctuation costs you X WPM." | >= 5 tests with and without punctuation; difference >= 3 WPM |
| "Your slowest key is X." | >= 20 attempts on that key and its accuracy is >= 5 points below your mean |
| "You are most accurate in the morning." | >= 15 tests spread across >= 2 parts of day; leading part beats the rest by >= 2 points |

When nothing qualifies, the panel says so: "Not enough data yet for reliable
insights. About 10 more tests will do it." That is more useful, and more honest,
than inventing an observation.

## Performance

- Aggregation runs once per range change, memoised on `(tests.length, range)`.
- Charts are SVG paths built from at most 400 points; longer ranges are
  bucket-averaged before rendering, so the DOM never holds 20 000 nodes.
- The dashboard route and all chart components are lazily loaded.
- Aggregation runs on the main thread. Measured at ~3 ms for 1 000 tests, which is
  well inside a frame; a worker would cost more in postMessage latency than it
  saves. If a user ever reaches a corpus where this stops holding, the pure
  functions in `aggregate.ts` can move to a worker without touching a component,
  which is the reason they take plain arrays and return plain objects.
