import {
  adminExamQuerySchema,
  examInputSchema,
  examQuerySchema,
  questionInputSchema,
  registerSchema,
  saveAnswersSchema,
} from '@examprep/shared';

/**
 * These schemas are the trust boundary: everything that reaches a service has
 * been through them. The cases below are the ones a hostile or buggy client
 * actually sends.
 */
describe('examQuerySchema', () => {
  it('applies defaults for an empty query string', () => {
    expect(examQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 9,
      sort: 'createdAt',
      order: 'desc',
    });
  });

  it('coerces numeric strings, because query parameters are always strings', () => {
    const parsed = examQuerySchema.parse({ page: '3', pageSize: '20' });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(20);
  });

  it('rejects a page size above the maximum instead of silently clamping', () => {
    expect(examQuerySchema.safeParse({ pageSize: '5000' }).success).toBe(false);
  });

  it('rejects a non-positive page', () => {
    expect(examQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(examQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
  });

  it('rejects a sort column that is not on the allow-list', () => {
    // An arbitrary sort column reaching the ORM is an injection and an
    // information-disclosure surface, so only named columns are accepted.
    expect(examQuerySchema.safeParse({ sort: 'passPercentage' }).success).toBe(false);
    expect(examQuerySchema.safeParse({ sort: 'id; drop table users' }).success).toBe(false);
  });

  it('rejects an unknown difficulty', () => {
    expect(examQuerySchema.safeParse({ difficulty: 'IMPOSSIBLE' }).success).toBe(false);
  });

  it('keeps a search term as data, including SQL metacharacters', () => {
    const parsed = examQuerySchema.parse({ search: "100% o'clock" });
    expect(parsed.search).toBe("100% o'clock");
  });

  it('only the admin variant accepts a status filter', () => {
    expect(adminExamQuerySchema.parse({ status: 'DRAFT' }).status).toBe('DRAFT');
    expect('status' in examQuerySchema.parse({ status: 'DRAFT' })).toBe(false);
  });
});

describe('registerSchema', () => {
  it('normalises the email to lower case and trims it', () => {
    const parsed = registerSchema.parse({
      name: '  Priya Raman ',
      email: '  Priya@Example.COM ',
      password: 'Password123',
    });
    expect(parsed.email).toBe('priya@example.com');
    expect(parsed.name).toBe('Priya Raman');
  });

  it('enforces the documented password policy', () => {
    const base = { name: 'Priya', email: 'p@example.com' };
    expect(registerSchema.safeParse({ ...base, password: 'short1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'alllettersonly' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: '1234567890' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'Password123' }).success).toBe(true);
  });
});

describe('questionInputSchema', () => {
  const option = (text: string, isCorrect = false) => ({ text, isCorrect });
  const base = { prompt: 'Which one is right?', topicId: 'topic-1', points: 1 };

  it('requires exactly one correct option', () => {
    expect(
      questionInputSchema.safeParse({
        ...base,
        options: [option('a', true), option('b')],
      }).success,
    ).toBe(true);

    expect(
      questionInputSchema.safeParse({ ...base, options: [option('a'), option('b')] }).success,
    ).toBe(false);

    expect(
      questionInputSchema.safeParse({
        ...base,
        options: [option('a', true), option('b', true)],
      }).success,
    ).toBe(false);
  });

  it('requires between two and six options', () => {
    expect(
      questionInputSchema.safeParse({ ...base, options: [option('a', true)] }).success,
    ).toBe(false);

    const seven = [option('a', true), ...Array.from({ length: 6 }, (_, i) => option(`o${i}`))];
    expect(questionInputSchema.safeParse({ ...base, options: seven }).success).toBe(false);
  });
});

describe('examInputSchema', () => {
  const valid = {
    title: 'A Decent Title',
    description: 'A description long enough to be useful.',
    topicId: 'topic-1',
    difficulty: 'EASY',
    durationMinutes: 30,
  };

  it('defaults the pass mark to 60%', () => {
    expect(examInputSchema.parse(valid).passPercentage).toBe(60);
  });

  it('bounds the duration to something a learner could sit', () => {
    expect(examInputSchema.safeParse({ ...valid, durationMinutes: 0 }).success).toBe(false);
    expect(examInputSchema.safeParse({ ...valid, durationMinutes: 301 }).success).toBe(false);
    expect(examInputSchema.safeParse({ ...valid, durationMinutes: 300 }).success).toBe(true);
  });
});

describe('saveAnswersSchema', () => {
  it('accepts a null option id, which clears a selection', () => {
    const parsed = saveAnswersSchema.parse({
      answers: [{ questionId: 'q1', optionId: null }],
    });
    expect(parsed.answers[0]?.optionId).toBeNull();
  });

  it('refuses an empty batch and an oversized batch', () => {
    expect(saveAnswersSchema.safeParse({ answers: [] }).success).toBe(false);
    const huge = Array.from({ length: 201 }, (_, i) => ({ questionId: `q${i}`, optionId: null }));
    expect(saveAnswersSchema.safeParse({ answers: huge }).success).toBe(false);
  });
});
