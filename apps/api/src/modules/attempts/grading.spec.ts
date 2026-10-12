import { gradeAttempt, roundPercentage, toPercentage, type GradableQuestion } from './grading';

function question(
  id: string,
  overrides: Partial<GradableQuestion> = {},
): GradableQuestion {
  return {
    id,
    points: 1,
    correctOptionId: `${id}-correct`,
    topicId: 'topic-a',
    topicName: 'Topic A',
    ...overrides,
  };
}

describe('toPercentage', () => {
  it('rounds to two decimal places', () => {
    expect(toPercentage(1, 3)).toBe(33.33);
    expect(toPercentage(2, 3)).toBe(66.67);
    expect(toPercentage(5, 9)).toBe(55.56);
  });

  it('returns 0 instead of NaN when there is nothing to score', () => {
    expect(toPercentage(0, 0)).toBe(0);
    expect(toPercentage(5, 0)).toBe(0);
  });

  it('never exceeds 100 for a valid score', () => {
    expect(toPercentage(4, 4)).toBe(100);
  });

  it('rounds half away from zero consistently', () => {
    expect(roundPercentage(66.666)).toBe(66.67);
    expect(roundPercentage(66.664)).toBe(66.66);
  });
});

describe('gradeAttempt', () => {
  it('awards points only for the correct option', () => {
    const questions = [question('q1'), question('q2'), question('q3')];
    const result = gradeAttempt(
      questions,
      [
        { questionId: 'q1', selectedOptionId: 'q1-correct' },
        { questionId: 'q2', selectedOptionId: 'q2-wrong' },
        { questionId: 'q3', selectedOptionId: 'q3-correct' },
      ],
      60,
    );

    expect(result.score).toBe(2);
    expect(result.maxScore).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.incorrectCount).toBe(1);
    expect(result.unansweredCount).toBe(0);
    expect(result.percentage).toBe(66.67);
  });

  it('counts a missing answer row as unanswered, not as wrong', () => {
    const questions = [question('q1'), question('q2')];
    const result = gradeAttempt(questions, [{ questionId: 'q1', selectedOptionId: 'q1-correct' }], 60);

    expect(result.correctCount).toBe(1);
    expect(result.incorrectCount).toBe(0);
    expect(result.unansweredCount).toBe(1);
    expect(result.score).toBe(1);
  });

  it('counts an explicitly cleared answer as unanswered', () => {
    const result = gradeAttempt(
      [question('q1')],
      [{ questionId: 'q1', selectedOptionId: null }],
      60,
    );

    expect(result.unansweredCount).toBe(1);
    expect(result.incorrectCount).toBe(0);
    expect(result.answers[0]).toEqual({
      questionId: 'q1',
      selectedOptionId: null,
      isCorrect: false,
      awardedPoints: 0,
    });
  });

  it('respects per-question weighting', () => {
    const questions = [
      question('q1', { points: 3 }),
      question('q2', { points: 1 }),
      question('q3', { points: 1 }),
    ];
    const result = gradeAttempt(
      questions,
      [
        { questionId: 'q1', selectedOptionId: 'q1-correct' },
        { questionId: 'q2', selectedOptionId: 'q2-wrong' },
        { questionId: 'q3', selectedOptionId: 'q3-wrong' },
      ],
      60,
    );

    expect(result.maxScore).toBe(5);
    expect(result.score).toBe(3);
    expect(result.percentage).toBe(60);
  });

  it('applies no negative marking', () => {
    const result = gradeAttempt(
      [question('q1'), question('q2')],
      [
        { questionId: 'q1', selectedOptionId: 'q1-wrong' },
        { questionId: 'q2', selectedOptionId: 'q2-wrong' },
      ],
      60,
    );

    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('treats the pass mark as inclusive', () => {
    const questions = [question('q1'), question('q2'), question('q3'), question('q4'), question('q5')];
    const answers = questions.map((q, index) => ({
      questionId: q.id,
      selectedOptionId: index < 3 ? `${q.id}-correct` : `${q.id}-wrong`,
    }));

    // 3/5 = exactly 60%
    expect(gradeAttempt(questions, answers, 60).passed).toBe(true);
    expect(gradeAttempt(questions, answers, 61).passed).toBe(false);
  });

  it('ignores answers for questions that are not in the exam', () => {
    const result = gradeAttempt(
      [question('q1')],
      [
        { questionId: 'q1', selectedOptionId: 'q1-correct' },
        { questionId: 'ghost', selectedOptionId: 'ghost-correct' },
      ],
      60,
    );

    expect(result.questionCount).toBe(1);
    expect(result.score).toBe(1);
    expect(result.answers).toHaveLength(1);
  });

  it('keeps the last selection when a question is answered twice in one batch', () => {
    const result = gradeAttempt(
      [question('q1')],
      [
        { questionId: 'q1', selectedOptionId: 'q1-wrong' },
        { questionId: 'q1', selectedOptionId: 'q1-correct' },
      ],
      60,
    );

    expect(result.score).toBe(1);
    expect(result.correctCount).toBe(1);
  });

  it('breaks accuracy down per topic, counted by question', () => {
    const questions = [
      question('q1', { topicId: 'algebra', topicName: 'Algebra' }),
      question('q2', { topicId: 'algebra', topicName: 'Algebra', points: 5 }),
      question('q3', { topicId: 'geometry', topicName: 'Geometry' }),
    ];
    const result = gradeAttempt(
      questions,
      [
        { questionId: 'q1', selectedOptionId: 'q1-correct' },
        { questionId: 'q2', selectedOptionId: 'q2-wrong' },
        { questionId: 'q3', selectedOptionId: 'q3-correct' },
      ],
      60,
    );

    expect(result.topicScores).toEqual([
      { topic: { id: 'algebra', name: 'Algebra' }, correct: 1, total: 2, percentage: 50 },
      { topic: { id: 'geometry', name: 'Geometry' }, correct: 1, total: 1, percentage: 100 },
    ]);
  });

  it('grades an empty exam without dividing by zero', () => {
    const result = gradeAttempt([], [], 60);

    expect(result).toMatchObject({
      score: 0,
      maxScore: 0,
      percentage: 0,
      questionCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
    });
    expect(result.topicScores).toEqual([]);
  });

  it('is a pure function - grading twice yields identical results', () => {
    const questions = [question('q1'), question('q2')];
    const answers = [{ questionId: 'q1', selectedOptionId: 'q1-correct' }];

    expect(gradeAttempt(questions, answers, 60)).toEqual(gradeAttempt(questions, answers, 60));
  });
});
