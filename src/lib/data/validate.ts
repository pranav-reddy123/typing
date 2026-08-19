/**
 * Input validation. Runs on every write path in both providers — the Supabase
 * schema repeats these rules as check constraints, because a client-side check
 * is a courtesy to the user, not a security control.
 */

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateUsername(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (v.length < 3) return 'Username needs at least 3 characters.';
  if (v.length > 20) return 'Username can be at most 20 characters.';
  if (!USERNAME_RE.test(v)) return 'Use lowercase letters, numbers and underscores only.';
  return null;
}

export function validateEmail(value: string): string | null {
  if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) return 'Password needs at least 8 characters.';
  if (value.length > 200) return 'Password is too long.';
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Include at least one letter and one number.';
  }
  return null;
}

export function validateBio(value: string): string | null {
  if (value.length > 160) return 'Bio can be at most 160 characters.';
  return null;
}

/** Rejects results that could not have come from a real test. */
export function isPlausibleResult(r: {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  durationS: number;
  keystrokes: number;
}): boolean {
  if (!Number.isFinite(r.wpm) || r.wpm < 0 || r.wpm > 400) return false;
  if (!Number.isFinite(r.rawWpm) || r.rawWpm < 0 || r.rawWpm > 400) return false;
  if (r.accuracy < 0 || r.accuracy > 100) return false;
  if (r.durationS < 0 || r.durationS > 3600) return false;
  if (r.wpm > r.rawWpm + 0.5) return false;
  if (r.keystrokes < 0) return false;
  return true;
}
