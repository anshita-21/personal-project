import type { TopicScore } from '@examprep/shared';

/**
 * Grading is a pure function of (questions, answers, pass mark).
 *
 * It touches no database, no clock and no request context, which is why the
 * scoring rules can be unit-tested exhaustively (see grading.spec.ts) instead
 * of being inferred from an end-to-end run. The service layer is responsible
 * for loading the inputs and persisting the output; this module decides what
 * the result IS.
 *
 * Scoring rules, stated explicitly:
 *   * Each question is worth `points` (>= 1). A question is either fully
 *     correct or worth nothing - there is no partial credit, because every
 *     question is single-answer multiple choice.
 *   * An unanswered question scores 0 and is counted separately from a wrong
 *     answer, so a learner can tell "I did not get to it" from "I got it wrong".
 *   * There is no negative marking.
 *   * percentage = score / maxScore * 100, rounded to 2 decimals. Rounding
 *     happens exactly once, here, so the API, the UI and the stored value can
 *     never disagree by a hundredth of a point.
 *   * passed = percentage >= passPercentage (>= and not >, so a 60% pass mark
 *     is met by exactly 60%).
 *   * Topic accuracy is counted per QUESTION, not per point: "7 of 10 algebra
 *     questions" is what a learner can act on, whereas a points ratio mixes in
 *     question weighting.
 */

export interface GradableQuestion {
  id: string;
  points: number;
  correctOptionId: string;
  topicId: string;
  topicName: string;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedOptionId: string | null;
}

export interface GradedAnswer {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  awardedPoints: number;
}

export interface GradeResult {
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  questionCount: number;
  answers: GradedAnswer[];
  topicScores: TopicScore[];
}

export function roundPercentage(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toPercentage(score: number, maxScore: number): number {
  if (maxScore <= 0) {
    return 0;
  }
  return roundPercentage((score / maxScore) * 100);
}

export function gradeAttempt(
  questions: GradableQuestion[],
  submitted: SubmittedAnswer[],
  passPercentage: number,
): GradeResult {
  const selectionByQuestion = new Map<string, string | null>();
  for (const answer of submitted) {
    // Last write wins if the client sends the same question twice in one batch.
    selectionByQuestion.set(answer.questionId, answer.selectedOptionId);
  }

  const topicBuckets = new Map<string, { name: string; correct: number; total: number }>();
  const answers: GradedAnswer[] = [];

  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  for (const question of questions) {
    maxScore += question.points;

    const bucket =
      topicBuckets.get(question.topicId) ??
      (() => {
        const created = { name: question.topicName, correct: 0, total: 0 };
        topicBuckets.set(question.topicId, created);
        return created;
      })();
    bucket.total += 1;

    // An answer row may exist with a null selection (the learner cleared it);
    // that is still "unanswered".
    const selected = selectionByQuestion.get(question.id) ?? null;

    if (selected === null) {
      unansweredCount += 1;
      answers.push({
        questionId: question.id,
        selectedOptionId: null,
        isCorrect: false,
        awardedPoints: 0,
      });
      continue;
    }

    const isCorrect = selected === question.correctOptionId;
    if (isCorrect) {
      correctCount += 1;
      bucket.correct += 1;
      score += question.points;
    } else {
      incorrectCount += 1;
    }

    answers.push({
      questionId: question.id,
      selectedOptionId: selected,
      isCorrect,
      awardedPoints: isCorrect ? question.points : 0,
    });
  }

  const percentage = toPercentage(score, maxScore);

  const topicScores: TopicScore[] = [...topicBuckets.entries()]
    .map(([topicId, bucket]) => ({
      topic: { id: topicId, name: bucket.name },
      correct: bucket.correct,
      total: bucket.total,
      percentage: toPercentage(bucket.correct, bucket.total),
    }))
    .sort((a, b) => a.topic.name.localeCompare(b.topic.name));

  return {
    score,
    maxScore,
    percentage,
    passed: percentage >= passPercentage,
    correctCount,
    incorrectCount,
    unansweredCount,
    questionCount: questions.length,
    answers,
    topicScores,
  };
}
