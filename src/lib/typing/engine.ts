import { accuracy, consistency, netWpm, rawWpm, round } from './metrics';
import type { CharCounts, KeyTally, Sample, TestConfig, TestResult } from './types';
import { generateWords, pickQuote } from './words';
import { randomSeed } from './rng';

export type CharState = 'pending' | 'correct' | 'incorrect' | 'extra';
export type EngineStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface LiveMetrics {
  wpm: number;
  raw: number;
  accuracy: number;
  errors: number;
  elapsed: number;
  remaining: number;
  progress: number;
  wordIndex: number;
}

interface EngineEvents {
  /** Word list grew or was replaced — the surface must rebuild its spans. */
  onStructure?: () => void;
  /** ~10 Hz. Never fires per keystroke. */
  onTick?: (m: LiveMetrics) => void;
  onStatus?: (status: EngineStatus) => void;
  onFinish?: (result: TestResult) => void;
}

const TICK_MS = 100;
const TRACE_SIZE = 600;
const MAX_EXTRA_CHARS = 8;

/**
 * The typing engine.
 *
 * Owns the whole test in instance fields. Never calls setState, never touches
 * React. A keystroke is O(1): it appends one character, updates four counters,
 * and returns the word indices the surface should repaint.
 */
export class TypingEngine {
  readonly config: TestConfig;
  readonly seed: string;
  readonly words: string[];
  readonly quoteSource: string | null;

  status: EngineStatus = 'idle';
  wordIndex = 0;
  inputs: string[] = [];

  /** Ring buffer of instantaneous raw WPM, read by the Signal Strip. */
  readonly trace = new Float32Array(TRACE_SIZE);
  readonly traceFault = new Uint8Array(TRACE_SIZE);
  traceHead = 0;
  traceCount = 0;

  private startedAt = 0;
  private accumulated = 0;
  private keystrokes = 0;
  private correctKeystrokes = 0;
  private errorCount = 0;
  private tallies = new Map<string, KeyTally>();
  private samples: Sample[] = [];
  private lastSecond = 0;
  private lastSampleChars = 0;
  private lastSampleErrors = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private events: EngineEvents = {};
  private result: TestResult | null = null;

  constructor(config: TestConfig, seed = randomSeed()) {
    this.config = config;
    this.seed = seed;

    if (config.mode === 'quote') {
      const q = pickQuote(seed);
      this.words = q.text.split(' ');
      this.quoteSource = q.source;
    } else if (config.mode === 'custom') {
      const text = config.customText.trim();
      this.words = text ? text.split(/\s+/) : ['add', 'your', 'own', 'text', 'in', 'settings'];
      this.quoteSource = null;
    } else {
      const count = config.mode === 'words' ? config.target : 60;
      this.words = generateWords({
        count,
        seed,
        punctuation: config.punctuation,
        numbers: config.numbers,
        difficulty: config.difficulty,
      });
      this.quoteSource = null;
    }

    this.inputs = new Array(this.words.length).fill('');
  }

  on(events: EngineEvents): void {
    this.events = events;
  }

  // ---- derived state -------------------------------------------------

  get currentInput(): string {
    return this.inputs[this.wordIndex] ?? '';
  }

  get elapsedSeconds(): number {
    if (this.status === 'idle') return 0;
    if (this.status === 'running') {
      return this.accumulated + (performance.now() - this.startedAt) / 1000;
    }
    return this.accumulated;
  }

  charStates(index: number): CharState[] {
    const word = this.words[index] ?? '';
    const input = this.inputs[index] ?? '';
    const isPast = index < this.wordIndex;
    const len = Math.max(word.length, input.length);
    const states: CharState[] = new Array(len);

    for (let i = 0; i < len; i++) {
      if (i >= word.length) states[i] = 'extra';
      else if (i >= input.length) states[i] = isPast ? 'incorrect' : 'pending';
      else states[i] = input[i] === word[i] ? 'correct' : 'incorrect';
    }
    return states;
  }

  /**
   * Character accounting across every word the user has reached.
   * Spaces count as one correct character per completed word.
   */
  private countChars(): CharCounts {
    const counts: CharCounts = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    const upto = Math.min(this.wordIndex, this.words.length - 1);

    for (let w = 0; w <= upto; w++) {
      const word = this.words[w] ?? '';
      const input = this.inputs[w] ?? '';
      for (let i = 0; i < input.length; i++) {
        if (i >= word.length) counts.extra++;
        else if (input[i] === word[i]) counts.correct++;
        else counts.incorrect++;
      }
      if (w < this.wordIndex) counts.missed += Math.max(0, word.length - input.length);
    }
    counts.correct += this.wordIndex;
    return counts;
  }

  metrics(): LiveMetrics {
    const elapsed = this.elapsedSeconds;
    const chars = this.countChars();
    const typed = chars.correct + chars.incorrect + chars.extra;
    const progress =
      this.config.mode === 'time'
        ? Math.min(1, elapsed / this.config.target)
        : this.words.length === 0
          ? 0
          : Math.min(1, this.wordIndex / this.words.length);

    return {
      wpm: netWpm(chars.correct, elapsed),
      raw: rawWpm(typed, elapsed),
      accuracy: accuracy(this.correctKeystrokes, this.keystrokes),
      errors: this.errorCount,
      elapsed,
      remaining: this.config.mode === 'time' ? Math.max(0, this.config.target - elapsed) : 0,
      progress,
      wordIndex: this.wordIndex,
    };
  }

  // ---- input ---------------------------------------------------------

  start(): void {
    if (this.status === 'running' || this.status === 'finished') return;
    this.startedAt = performance.now();
    this.status = 'running';
    this.events.onStatus?.('running');
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.accumulated += (performance.now() - this.startedAt) / 1000;
    this.stopTimer();
    this.status = 'paused';
    this.events.onStatus?.('paused');
  }

  /** One printable character. Returns the word indices to repaint. */
  input(char: string): number[] {
    if (this.status === 'finished') return [];
    if (this.status !== 'running') this.start();

    if (char === ' ') return this.submitWord();

    const word = this.words[this.wordIndex] ?? '';
    const input = this.currentInput;
    if (input.length >= word.length + MAX_EXTRA_CHARS) return [];

    const expected = input.length < word.length ? word[input.length] : null;
    const correct = expected !== null && expected === char;

    this.keystrokes++;
    if (correct) this.correctKeystrokes++;
    else this.errorCount++;
    if (expected !== null) this.tally(expected, char);

    this.inputs[this.wordIndex] = input + char;
    this.pushTrace(!correct);

    if (this.isFiniteMode() && this.isLastWordComplete()) {
      this.finish();
    }
    return [this.wordIndex];
  }

  /** Modes that end when the passage runs out, rather than on a clock or a key. */
  private isFiniteMode(): boolean {
    return this.config.mode === 'words' || this.config.mode === 'quote' || this.config.mode === 'custom';
  }

  private isLastWordComplete(): boolean {
    if (this.wordIndex !== this.words.length - 1) return false;
    return this.currentInput === this.words[this.wordIndex];
  }

  private submitWord(): number[] {
    if (this.currentInput.length === 0) return [];

    const word = this.words[this.wordIndex] ?? '';
    const input = this.currentInput;

    this.keystrokes++;
    if (input === word) {
      this.correctKeystrokes++;
    } else {
      this.errorCount++;
      for (let i = input.length; i < word.length; i++) this.tally(word[i], null);
    }

    const touched = [this.wordIndex, this.wordIndex + 1];
    this.wordIndex++;
    this.pushTrace(input !== word);

    if (!this.isFiniteMode() && this.wordIndex > this.words.length - 20) {
      this.extendWords();
    } else if (this.isFiniteMode() && this.wordIndex >= this.words.length) {
      this.finish();
    }
    return touched;
  }

  /** Backspace. `wholeWord` clears back to the start of the current word. */
  backspace(wholeWord = false): number[] {
    if (this.status === 'finished') return [];
    const input = this.currentInput;

    if (input.length === 0) {
      const prev = this.wordIndex - 1;
      if (prev < 0) return [];
      // A word typed correctly is committed; only a wrong one can be revisited.
      if (this.inputs[prev] === this.words[prev]) return [];
      this.wordIndex = prev;
      return [prev, prev + 1];
    }

    this.inputs[this.wordIndex] = wholeWord ? '' : input.slice(0, -1);
    return [this.wordIndex];
  }

  private tally(expected: string, typed: string | null): void {
    const key = expected + ' ' + (typed ?? '');
    const found = this.tallies.get(key);
    if (found) found.count++;
    else this.tallies.set(key, { expected, typed, count: 1 });
  }

  private pushTrace(fault: boolean): void {
    const elapsed = this.elapsedSeconds;
    const chars = this.countChars();
    this.trace[this.traceHead] = rawWpm(
      chars.correct + chars.incorrect + chars.extra,
      elapsed,
    );
    this.traceFault[this.traceHead] = fault ? 1 : 0;
    this.traceHead = (this.traceHead + 1) % TRACE_SIZE;
    if (this.traceCount < TRACE_SIZE) this.traceCount++;
  }

  /** Time mode never runs out of words. */
  private extendWords(): void {
    const more = generateWords({
      count: 40,
      seed: this.seed + ':' + this.words.length,
      punctuation: this.config.punctuation,
      numbers: this.config.numbers,
      difficulty: this.config.difficulty,
    });
    this.words.push(...more);
    this.inputs.push(...new Array(more.length).fill(''));
    this.events.onStructure?.();
  }

  // ---- lifecycle -----------------------------------------------------

  private tick(): void {
    const m = this.metrics();
    const second = Math.floor(m.elapsed);

    if (second > this.lastSecond) {
      const chars = this.countChars();
      const typed = chars.correct + chars.incorrect + chars.extra;
      const elapsedSinceSample = second - this.lastSecond;
      this.samples.push({
        t: second,
        wpm: round(netWpm(chars.correct, m.elapsed), 1),
        raw: round(((typed - this.lastSampleChars) / 5 / elapsedSinceSample) * 60, 1),
        errors: this.errorCount - this.lastSampleErrors,
      });
      this.lastSecond = second;
      this.lastSampleChars = typed;
      this.lastSampleErrors = this.errorCount;
    }

    this.events.onTick?.(m);

    if (this.config.mode === 'time' && m.elapsed >= this.config.target) this.finish();
  }

  finish(): TestResult {
    if (this.result) return this.result;
    if (this.status === 'running') {
      this.accumulated += (performance.now() - this.startedAt) / 1000;
    }
    this.stopTimer();
    this.status = 'finished';

    const durationS =
      this.config.mode === 'time'
        ? Math.min(this.config.target, this.accumulated)
        : this.accumulated;

    const chars = this.countChars();
    const typed = chars.correct + chars.incorrect + chars.extra;

    if (this.samples.length === 0 && durationS > 0) {
      this.samples.push({
        t: Math.max(1, Math.round(durationS)),
        wpm: round(netWpm(chars.correct, durationS), 1),
        raw: round(rawWpm(typed, durationS), 1),
        errors: this.errorCount,
      });
    }

    this.result = {
      id: crypto.randomUUID(),
      userId: null,
      mode: this.config.mode,
      target: this.config.target,
      durationS: round(durationS, 2),
      language: this.config.language,
      punctuation: this.config.punctuation,
      numbers: this.config.numbers,
      difficulty: this.config.difficulty,
      wpm: round(netWpm(chars.correct, durationS), 2),
      rawWpm: round(rawWpm(typed, durationS), 2),
      accuracy: round(accuracy(this.correctKeystrokes, this.keystrokes), 2),
      consistency: round(consistency(this.samples), 2),
      chars,
      keystrokes: this.keystrokes,
      words: this.wordIndex,
      errors: this.errorCount,
      samples: this.samples,
      tallies: Array.from(this.tallies.values()),
      raceId: null,
      createdAt: Date.now(),
    };

    this.events.onStatus?.('finished');
    this.events.onFinish?.(this.result);
    return this.result;
  }

  destroy(): void {
    this.stopTimer();
    this.events = {};
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
