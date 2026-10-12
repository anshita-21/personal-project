import {
  difficultyLabel,
  formatClock,
  formatDate,
  formatDateTime,
  formatDuration,
  formatRelative,
  scoreTone,
} from './format';

describe('formatClock', () => {
  it('shows mm:ss under an hour', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9)).toBe('00:09');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('shows h:mm:ss from an hour', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(5415)).toBe('1:30:15');
  });

  it('never renders a negative clock', () => {
    expect(formatClock(-30)).toBe('00:00');
  });

  it('truncates rather than rounds up, so it never overstates the time left', () => {
    expect(formatClock(59.9)).toBe('00:59');
  });
});

describe('formatDuration', () => {
  it('renders minutes and hours in prose', () => {
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(4500)).toBe('1 h 15 min');
  });

  it('never shows "0 min" for a short but non-zero duration', () => {
    expect(formatDuration(20)).toBe('1 min');
  });
});

describe('date formatting', () => {
  it('renders a dash for null and for unparseable input', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('not a date')).toBe('-');
    expect(formatDateTime(null)).toBe('-');
    expect(formatRelative(null)).toBe('-');
  });

  it('formats a valid ISO timestamp', () => {
    expect(formatDate('2026-03-12T10:00:00.000Z')).toContain('2026');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-03-12T12:00:00.000Z').getTime();

  it('calls a very recent timestamp "just now"', () => {
    expect(formatRelative('2026-03-12T11:59:40.000Z', now)).toBe('just now');
  });

  it('uses relative units within the last month', () => {
    expect(formatRelative('2026-03-12T09:00:00.000Z', now)).toMatch(/hour/);
    expect(formatRelative('2026-03-10T12:00:00.000Z', now)).toMatch(/day/);
  });

  it('falls back to an absolute date beyond a month', () => {
    expect(formatRelative('2025-11-01T12:00:00.000Z', now)).toContain('2025');
  });
});

describe('scoreTone', () => {
  it('is success at or above the pass mark', () => {
    expect(scoreTone(60, 60)).toBe('success');
    expect(scoreTone(100, 60)).toBe('success');
  });

  it('is warning when close below the pass mark', () => {
    expect(scoreTone(50, 60)).toBe('warning');
  });

  it('is danger when well below', () => {
    expect(scoreTone(20, 60)).toBe('danger');
  });
});

describe('difficultyLabel', () => {
  it('maps the enum to prose', () => {
    expect(difficultyLabel('EASY')).toBe('Easy');
    expect(difficultyLabel('MEDIUM')).toBe('Medium');
    expect(difficultyLabel('HARD')).toBe('Hard');
  });
});
