import { slugify } from './slug';

describe('slugify', () => {
  it('lower-cases and hyphenates', () => {
    expect(slugify('JavaScript Essentials')).toBe('javascript-essentials');
  });

  it('strips punctuation that does not belong in a URL', () => {
    expect(slugify('HTTP, REST & Web Security')).toBe('http-rest-web-security');
    expect(slugify('What is `typeof null`?')).toBe('what-is-typeof-null');
  });

  it('collapses runs of separators and trims the edges', () => {
    expect(slugify('  --Mixed   up--  ')).toBe('mixed-up');
  });

  it('caps the length so it cannot overflow the column', () => {
    expect(slugify('a'.repeat(200))).toHaveLength(80);
  });

  it('returns an empty string for input with nothing slug-worthy', () => {
    expect(slugify('!!! ???')).toBe('');
  });
});
