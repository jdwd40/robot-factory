/** First-run tutorial persistence: shows once, never nags afterwards. */

const KEY = 'robot-factory-tour-v1';

/** True once the player has finished or skipped the first-run tour. */
export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist that the player has seen the tour so it does not auto-reopen. */
export function markTourSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* best-effort */
  }
}

/** Forget the tour flag (used to force the intro again in dev/tests). */
export function clearTourSeen(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}