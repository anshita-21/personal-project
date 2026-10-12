/**
 * Formatting helpers.
 *
 * Pure functions in one place so the same number never renders two ways on two
 * screens, and so they can be unit-tested without a component.
 */

/** mm:ss, or h:mm:ss once an hour or more remains. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** "25 min", "1 h 15 min" - for durations shown as prose rather than a timer. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.round((safe % 3600) / 60);

  if (hours === 0) {
    return `${Math.max(1, minutes)} min`;
  }
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatDate(iso: string | null): string {
  if (!iso) {
    return '-';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '-';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "just now", "3 hours ago", "12 Mar" - uses Intl, no date library. */
export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) {
    return '-';
  }
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) {
    return '-';
  }

  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absolute = Math.abs(diffSeconds);

  if (absolute < 45) {
    return 'just now';
  }
  if (absolute > 30 * 24 * 3600) {
    return formatDate(iso);
  }

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (absolute >= size) {
      return formatter.format(Math.round(diffSeconds / size), unit);
    }
  }
  return formatter.format(diffSeconds, 'second');
}

/** Maps a percentage to the meter colour, so the mapping is defined once. */
export function scoreTone(percentage: number, passMark = 60): 'success' | 'warning' | 'danger' {
  if (percentage >= passMark) {
    return 'success';
  }
  return percentage >= passMark * 0.75 ? 'warning' : 'danger';
}

export function difficultyLabel(difficulty: 'EASY' | 'MEDIUM' | 'HARD'): string {
  return { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' }[difficulty];
}
