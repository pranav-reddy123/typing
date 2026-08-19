import { hashSeed, mulberry32 } from './rng';

/** The 200 most frequent English words — the base vocabulary for normal tests. */
const COMMON = `the be to of and a in that have it for not on with he as you do at this
but his by from they we say her she or an will my one all would there their what so up out
if about who get which go me when make can like time no just him know take people into year
your good some could them see other than then now look only come its over think also back
after use two how our work first well way even new want because any these give day most us
is are was were been has had did said made find here thing many long down still own under
last never open should keep move might great little world very much need same tell try ask
hand part place case week company system program question during number group problem fact
be able point right small large next early young important few public bad able area money
story fact month lot study book eye job word business issue side kind head house service
friend father power hour game line end member law car city name team minute idea kid body
information back parent face others level office door health person art war history party
result change morning reason research girl guide moment air teacher force education`
  .split(/\s+/)
  .filter(Boolean);

/** Longer, lower-frequency words — used by the harder difficulties. */
const EXTENDED = `abstract algorithm boundary calibrate consequence deliberate distinguish
equivalent framework hypothesis implication infrastructure interpretation maintenance
negotiate obligation parameter perspective preliminary quantitative recognition
significant substantial theoretical transmission unprecedented variability acknowledge
approximate characteristic considerable demonstrate environment fundamental illustrate
independent institution methodology observation participate philosophy proportion
requirement responsibility statistical subsequent sufficient technology understanding`
  .split(/\s+/)
  .filter(Boolean);

/** Public-domain quotes. Real text, deliberately not lorem ipsum. */
export interface Quote {
  text: string;
  source: string;
  length: 'short' | 'medium' | 'long';
}

export const QUOTES: Quote[] = [
  {
    text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    source: 'Jane Austen, Pride and Prejudice',
    length: 'medium',
  },
  {
    text: 'All happy families are alike; each unhappy family is unhappy in its own way.',
    source: 'Leo Tolstoy, Anna Karenina',
    length: 'short',
  },
  {
    text: 'The machine does not isolate man from the great problems of nature but plunges him more deeply into them.',
    source: 'Antoine de Saint-Exupery, Wind, Sand and Stars',
    length: 'medium',
  },
  {
    text: 'Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.',
    source: 'Herman Melville, Moby-Dick',
    length: 'long',
  },
  {
    text: 'We shall not cease from exploration, and the end of all our exploring will be to arrive where we started and know the place for the first time.',
    source: 'T. S. Eliot, Little Gidding',
    length: 'medium',
  },
  {
    text: 'The best way out is always through.',
    source: 'Robert Frost, A Servant to Servants',
    length: 'short',
  },
  {
    text: 'Progress lies not in enhancing what is, but in advancing toward what will be.',
    source: 'Khalil Gibran, A Handful of Sand on the Shore',
    length: 'short',
  },
  {
    text: 'It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions.',
    source: 'George Orwell, Nineteen Eighty-Four',
    length: 'long',
  },
];

export type Difficulty = 'normal' | 'expert' | 'master';

export interface GenerateOptions {
  count: number;
  seed: string;
  punctuation: boolean;
  numbers: boolean;
  difficulty: Difficulty;
}

const OPENERS = ['"', '(', "'"] as const;
const CLOSERS = { '"': '"', '(': ')', "'": "'" } as const;
const ENDERS = ['.', ',', '.', '!', '?', ';', ':', '.', ','] as const;

/**
 * Deterministic word generation. Same seed and options always yield the same
 * passage, on every client.
 */
export function generateWords(opts: GenerateOptions): string[] {
  const rand = mulberry32(hashSeed(opts.seed));
  const pool =
    opts.difficulty === 'normal' ? COMMON : COMMON.concat(EXTENDED, EXTENDED);
  const out: string[] = [];
  let sentenceStart = true;

  for (let i = 0; i < opts.count; i++) {
    if (opts.numbers && rand() < 0.06) {
      const digits = 1 + Math.floor(rand() * 4);
      let n = '';
      for (let d = 0; d < digits; d++) n += Math.floor(rand() * 10);
      out.push(n);
      continue;
    }

    let word = pool[Math.floor(rand() * pool.length)];

    if (opts.punctuation) {
      if (sentenceStart) {
        word = word[0].toUpperCase() + word.slice(1);
        sentenceStart = false;
      }
      const r = rand();
      if (r < 0.04) {
        const open = OPENERS[Math.floor(rand() * OPENERS.length)];
        word = open + word + CLOSERS[open];
      } else if (r < 0.22 && i < opts.count - 1) {
        const end = ENDERS[Math.floor(rand() * ENDERS.length)];
        word += end;
        if (end === '.' || end === '!' || end === '?') sentenceStart = true;
      }
    }

    out.push(word);
  }

  if (opts.punctuation && out.length > 0) {
    const last = out[out.length - 1].replace(/[.,;:!?]$/, '');
    out[out.length - 1] = last + '.';
  }

  return out;
}

export function pickQuote(seed: string): Quote {
  const rand = mulberry32(hashSeed(seed));
  return QUOTES[Math.floor(rand() * QUOTES.length)];
}
