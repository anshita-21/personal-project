import type { Exam, Topic } from '@prisma/client';
import type { ExamSummary, TopicView } from '@examprep/shared';

export function toTopicView(topic: Topic): TopicView {
  return {
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    description: topic.description,
  };
}

export interface ExamRow extends Exam {
  topic: Topic;
}

export interface ExamStatsForUser {
  questionCount: number;
  totalPoints: number;
  bestPercentage?: number | null;
  attemptCount?: number;
  activeAttemptId?: string | null;
}

export function toExamSummary(exam: ExamRow, stats: ExamStatsForUser): ExamSummary {
  return {
    id: exam.id,
    slug: exam.slug,
    title: exam.title,
    description: exam.description,
    difficulty: exam.difficulty,
    durationMinutes: exam.durationMinutes,
    passPercentage: exam.passPercentage,
    questionCount: stats.questionCount,
    totalPoints: stats.totalPoints,
    topic: toTopicView(exam.topic),
    ...(stats.bestPercentage !== undefined ? { bestPercentage: stats.bestPercentage } : {}),
    ...(stats.attemptCount !== undefined ? { attemptCount: stats.attemptCount } : {}),
    ...(stats.activeAttemptId !== undefined ? { activeAttemptId: stats.activeAttemptId } : {}),
  };
}
