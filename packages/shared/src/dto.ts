import type { AttemptStatus, Difficulty, ExamStatus, Role } from './enums';

/* -------------------------------------------------------------------------- */
/* Shared envelopes                                                            */
/* -------------------------------------------------------------------------- */

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

/** The only user shape ever sent over the wire. Never carries a password hash. */
export interface UserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface AuthResponse {
  user: UserView;
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                   */
/* -------------------------------------------------------------------------- */

export interface TopicView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface ExamSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  durationMinutes: number;
  passPercentage: number;
  questionCount: number;
  totalPoints: number;
  topic: TopicView;
  /** Present for a signed-in student: their best percentage so far, if any. */
  bestPercentage?: number | null;
  attemptCount?: number;
  /** Set when the student has an unfinished attempt they can resume. */
  activeAttemptId?: string | null;
}

/** Admin list rows additionally expose publication state. */
export interface AdminExamSummary extends ExamSummary {
  status: ExamStatus;
  updatedAt: string;
  attemptTotal: number;
}

export interface ExamDetail extends ExamSummary {
  status: ExamStatus;
  createdAt: string;
  /** Topic mix, so a learner knows what the paper covers before starting. */
  topicBreakdown: { topic: TopicView; questionCount: number }[];
}

/* -------------------------------------------------------------------------- */
/* Attempt taking                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A question as seen by a learner DURING an attempt.
 *
 * Deliberately has no `isCorrect` on options and no `explanation`: the
 * exam-taking endpoints must not be able to leak the answer key, so the leak is
 * prevented by the type, not by remembering to delete fields in a controller.
 */
export interface AttemptQuestionView {
  id: string;
  prompt: string;
  position: number;
  points: number;
  topic: { id: string; name: string };
  options: { id: string; text: string; position: number }[];
}

export interface AttemptStateView {
  attemptId: string;
  status: AttemptStatus;
  exam: {
    id: string;
    slug: string;
    title: string;
    durationMinutes: number;
    passPercentage: number;
  };
  /** ISO timestamps produced by the server clock. The browser clock is never trusted. */
  startedAt: string;
  expiresAt: string;
  /** Server-computed remaining time; the UI counts down from this, not from Date.now(). */
  remainingSeconds: number;
  serverTime: string;
  questions: AttemptQuestionView[];
  /** questionId -> selected optionId, so a refresh restores the exact draft. */
  answers: Record<string, string | null>;
}

export interface SaveAnswersResult {
  attemptId: string;
  saved: number;
  answeredCount: number;
  remainingSeconds: number;
  serverTime: string;
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export interface TopicScore {
  topic: { id: string; name: string };
  correct: number;
  total: number;
  percentage: number;
}

export interface AttemptResultSummary {
  attemptId: string;
  examId: string;
  examTitle: string;
  examSlug: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  durationMinutes: number;
  /** Wall-clock seconds the learner actually spent. */
  timeSpentSeconds: number;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  passPercentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  questionCount: number;
}

/** A graded question, including the answer key. Only ever served post-submission. */
export interface AttemptReviewQuestion {
  id: string;
  prompt: string;
  position: number;
  points: number;
  topic: { id: string; name: string };
  explanation: string | null;
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  options: { id: string; text: string; position: number; isCorrect: boolean }[];
}

export interface AttemptResultDetail extends AttemptResultSummary {
  topicScores: TopicScore[];
  questions: AttemptReviewQuestion[];
  /** The learner's other graded attempts at the same exam, oldest first. */
  history: { attemptId: string; submittedAt: string | null; percentage: number }[];
}

/* -------------------------------------------------------------------------- */
/* Dashboard (served over GraphQL)                                             */
/* -------------------------------------------------------------------------- */

export interface DashboardStats {
  attemptsCompleted: number;
  attemptsInProgress: number;
  examsAvailable: number;
  averagePercentage: number;
  bestPercentage: number;
  totalQuestionsAnswered: number;
  totalCorrect: number;
  accuracy: number;
  passRate: number;
}

export interface DashboardAttempt {
  attemptId: string;
  examId: string;
  examTitle: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  percentage: number | null;
  passed: boolean | null;
}

export interface DashboardTopicPerformance {
  topicId: string;
  topicName: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface DashboardProgressPoint {
  attemptId: string;
  submittedAt: string;
  percentage: number;
  examTitle: string;
}

/** The learner's single most useful next action, computed server-side. */
export interface DashboardNextAction {
  kind: 'RESUME_ATTEMPT' | 'PRACTISE_WEAK_TOPIC' | 'START_FIRST_EXAM' | 'EXPLORE_CATALOGUE';
  label: string;
  detail: string;
  examId: string | null;
  attemptId: string | null;
}

export interface StudentDashboard {
  stats: DashboardStats;
  recentAttempts: DashboardAttempt[];
  inProgressAttempts: DashboardAttempt[];
  recommendedExams: ExamSummary[];
  topicPerformance: DashboardTopicPerformance[];
  progress: DashboardProgressPoint[];
  nextAction: DashboardNextAction;
}

/* -------------------------------------------------------------------------- */
/* Admin reporting                                                             */
/* -------------------------------------------------------------------------- */

export interface AdminStats {
  totalUsers: number;
  totalStudents: number;
  totalExams: number;
  publishedExams: number;
  draftExams: number;
  archivedExams: number;
  totalQuestions: number;
  totalAttempts: number;
  completedAttempts: number;
  inProgressAttempts: number;
  averagePercentage: number;
  examPerformance: {
    examId: string;
    title: string;
    attempts: number;
    averagePercentage: number;
    passRate: number;
  }[];
}

/** Why an exam cannot be published yet. Shown inline in the admin editor. */
export interface ExamPublishCheck {
  publishable: boolean;
  problems: string[];
}
