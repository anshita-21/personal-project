import { parseDurationMs } from './duration';

describe('parseDurationMs', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['12h', 43_200_000],
    ['7d', 604_800_000],
    ['3600', 3_600_000],
  ])('parses %s', (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it('tolerates surrounding whitespace and upper case units', () => {
    expect(parseDurationMs(' 7D ')).toBe(604_800_000);
  });

  it('rejects anything it cannot interpret, rather than guessing', () => {
    expect(() => parseDurationMs('')).toThrow(/Unsupported duration/);
    expect(() => parseDurationMs('7 weeks')).toThrow(/Unsupported duration/);
    expect(() => parseDurationMs('-5m')).toThrow(/Unsupported duration/);
    expect(() => parseDurationMs('1.5h')).toThrow(/Unsupported duration/);
  });
});
