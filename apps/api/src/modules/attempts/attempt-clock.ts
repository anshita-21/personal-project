/**
 * All attempt timing is derived from the SERVER clock.
 *
 * The browser clock is attacker-controlled (and, more often, simply wrong), so
 * the client is told "you have N seconds left" and counts down locally for
 * display only. Every write re-derives the truth from `expiresAt`.
 */
export interface AttemptWindow {
  startedAt: Date;
  expiresAt: Date;
}

export function remainingSeconds(window: AttemptWindow, now: Date = new Date()): number {
  const ms = window.expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 1000));
}

export function isPastDeadline(window: AttemptWindow, now: Date = new Date()): boolean {
  return now.getTime() >= window.expiresAt.getTime();
}

export function deadlineFor(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
}

export function timeSpentSeconds(
  window: AttemptWindow,
  submittedAt: Date | null,
  now: Date = new Date(),
): number {
  const end = submittedAt ?? (isPastDeadline(window, now) ? window.expiresAt : now);
  return Math.max(0, Math.round((end.getTime() - window.startedAt.getTime()) / 1000));
}
