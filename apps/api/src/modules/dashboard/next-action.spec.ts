import type { DashboardAttempt, DashboardTopicPerformance, ExamSummary } from '@examprep/shared';
import { nextAction } from './dashboard.service';

const exam = (title: string): ExamSummary => ({
  id: `exam-${title}`,
  slug: title.toLowerCase(),
  title,
  description: 'An exam',
  difficulty: 'EASY',
  durationMinutes: 10,
  passPercentage: 60,
  questionCount: 5,
  totalPoints: 5,
  topic: { id: 't1', name: 'Topic', slug: 'topic', description: null },
});

const inProgress: DashboardAttempt = {
  attemptId: 'a1',
  examId: 'e1',
  examTitle: 'Half-finished Paper',
  status: 'IN_PROGRESS',
  startedAt: new Date().toISOString(),
  submittedAt: null,
  percentage: null,
  passed: null,
};

const weak = (accuracy: number): DashboardTopicPerformance => ({
  topicId: 'sql',
  topicName: 'Databases & SQL',
  answered: 10,
  correct: Math.round(accuracy / 10),
  accuracy,
});

describe('nextAction', () => {
  it('prioritises resuming an unfinished attempt above everything else', () => {
    const action = nextAction({
      inProgress: [inProgress],
      gradedCount: 20,
      weakest: weak(10),
      recommendedExams: [exam('Something Else')],
    });

    expect(action.kind).toBe('RESUME_ATTEMPT');
    expect(action.attemptId).toBe('a1');
    expect(action.detail).toContain('Half-finished Paper');
  });

  it('sends a brand-new learner to their first exam', () => {
    const action = nextAction({
      inProgress: [],
      gradedCount: 0,
      weakest: undefined,
      recommendedExams: [exam('JavaScript Essentials')],
    });

    expect(action.kind).toBe('START_FIRST_EXAM');
    expect(action.examId).toBe('exam-JavaScript Essentials');
  });

  it('points an experienced learner at their weakest topic', () => {
    const action = nextAction({
      inProgress: [],
      gradedCount: 6,
      weakest: weak(45),
      recommendedExams: [exam('SQL Query Fundamentals')],
    });

    expect(action.kind).toBe('PRACTISE_WEAK_TOPIC');
    expect(action.detail).toContain('Databases & SQL');
    expect(action.detail).toContain('45%');
  });

  it('does not nag when every topic is already strong', () => {
    const action = nextAction({
      inProgress: [],
      gradedCount: 6,
      weakest: weak(88),
      recommendedExams: [exam('Data Structures')],
    });

    expect(action.kind).toBe('EXPLORE_CATALOGUE');
  });

  it('degrades gracefully when there is nothing to recommend', () => {
    const action = nextAction({
      inProgress: [],
      gradedCount: 0,
      weakest: undefined,
      recommendedExams: [],
    });

    expect(action.examId).toBeNull();
    expect(action.label).toBe('Browse the catalogue');
  });
});
