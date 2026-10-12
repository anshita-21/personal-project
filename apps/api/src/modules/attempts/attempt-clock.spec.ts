import {
  deadlineFor,
  isPastDeadline,
  remainingSeconds,
  timeSpentSeconds,
} from './attempt-clock';

const startedAt = new Date('2026-01-01T10:00:00.000Z');

describe('deadlineFor', () => {
  it('adds the duration to the start time', () => {
    expect(deadlineFor(startedAt, 30).toISOString()).toBe('2026-01-01T10:30:00.000Z');
  });
});

describe('remainingSeconds', () => {
  const window = { startedAt, expiresAt: deadlineFor(startedAt, 30) };

  it('counts down from the deadline, not from the duration', () => {
    expect(remainingSeconds(window, new Date('2026-01-01T10:00:00.000Z'))).toBe(1800);
    expect(remainingSeconds(window, new Date('2026-01-01T10:29:30.000Z'))).toBe(30);
  });

  it('floors partial seconds so the UI never shows more time than remains', () => {
    expect(remainingSeconds(window, new Date('2026-01-01T10:29:59.500Z'))).toBe(0);
  });

  it('clamps at zero instead of going negative', () => {
    expect(remainingSeconds(window, new Date('2026-01-01T11:00:00.000Z'))).toBe(0);
  });
});

describe('isPastDeadline', () => {
  const window = { startedAt, expiresAt: deadlineFor(startedAt, 10) };

  it('is false before the deadline', () => {
    expect(isPastDeadline(window, new Date('2026-01-01T10:09:59.999Z'))).toBe(false);
  });

  it('is true exactly at the deadline - the window is half-open', () => {
    expect(isPastDeadline(window, new Date('2026-01-01T10:10:00.000Z'))).toBe(true);
  });

  it('is true after the deadline', () => {
    expect(isPastDeadline(window, new Date('2026-01-01T10:10:00.001Z'))).toBe(true);
  });
});

describe('timeSpentSeconds', () => {
  const window = { startedAt, expiresAt: deadlineFor(startedAt, 30) };

  it('measures start to submission when the attempt was submitted', () => {
    expect(timeSpentSeconds(window, new Date('2026-01-01T10:12:30.000Z'))).toBe(750);
  });

  it('caps at the deadline for an attempt that ran out of time', () => {
    expect(timeSpentSeconds(window, null, new Date('2026-01-01T12:00:00.000Z'))).toBe(1800);
  });

  it('measures start to now for an attempt still running', () => {
    expect(timeSpentSeconds(window, null, new Date('2026-01-01T10:05:00.000Z'))).toBe(300);
  });
});
