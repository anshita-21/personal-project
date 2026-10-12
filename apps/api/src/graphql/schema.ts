import { buildSchema } from 'graphql';

/**
 * GraphQL is used for exactly one job in this application: the dashboards.
 *
 * The REST API stays the primary interface because the rest of the product is
 * resource-shaped (exams, attempts, answers) with cache-friendly GETs and
 * meaningful status codes. The dashboard is the opposite: one screen that needs
 * seven unrelated aggregates at once, and whose widgets differ between desktop
 * and mobile. Over REST that is either a chatty fan-out or a fixed mega-payload;
 * over GraphQL the client selects precisely the fields it will render.
 *
 * The schema is deliberately read-only - there are no mutations. Writes stay on
 * REST, where idempotency, status codes and rate limiting are already handled.
 */
export const typeDefs = /* GraphQL */ `
  "A signed-in account."
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    createdAt: String!
  }

  type Topic {
    id: ID!
    name: String!
    slug: String!
    description: String
  }

  type ExamSummary {
    id: ID!
    slug: String!
    title: String!
    description: String!
    difficulty: String!
    durationMinutes: Int!
    passPercentage: Int!
    questionCount: Int!
    totalPoints: Int!
    topic: Topic!
    "Best percentage this learner has scored on the exam, null if never graded."
    bestPercentage: Float
    attemptCount: Int
    "Set when the learner has an unfinished attempt they can resume."
    activeAttemptId: ID
  }

  type DashboardStats {
    attemptsCompleted: Int!
    attemptsInProgress: Int!
    examsAvailable: Int!
    averagePercentage: Float!
    bestPercentage: Float!
    totalQuestionsAnswered: Int!
    totalCorrect: Int!
    accuracy: Float!
    passRate: Float!
  }

  type DashboardAttempt {
    attemptId: ID!
    examId: ID!
    examTitle: String!
    status: String!
    startedAt: String!
    submittedAt: String
    percentage: Float
    passed: Boolean
  }

  type TopicPerformance {
    topicId: ID!
    topicName: String!
    answered: Int!
    correct: Int!
    accuracy: Float!
  }

  type ProgressPoint {
    attemptId: ID!
    submittedAt: String!
    percentage: Float!
    examTitle: String!
  }

  "The single most useful thing the learner could do next, decided server-side."
  type NextAction {
    kind: String!
    label: String!
    detail: String!
    examId: ID
    attemptId: ID
  }

  type StudentDashboard {
    stats: DashboardStats!
    recentAttempts: [DashboardAttempt!]!
    inProgressAttempts: [DashboardAttempt!]!
    recommendedExams: [ExamSummary!]!
    topicPerformance: [TopicPerformance!]!
    progress: [ProgressPoint!]!
    nextAction: NextAction!
  }

  type ExamPerformance {
    examId: ID!
    title: String!
    attempts: Int!
    averagePercentage: Float!
    passRate: Float!
  }

  type AdminStats {
    totalUsers: Int!
    totalStudents: Int!
    totalExams: Int!
    publishedExams: Int!
    draftExams: Int!
    archivedExams: Int!
    totalQuestions: Int!
    totalAttempts: Int!
    completedAttempts: Int!
    inProgressAttempts: Int!
    averagePercentage: Float!
    examPerformance: [ExamPerformance!]!
  }

  type Query {
    "The caller's own account, or null when not signed in."
    me: User

    "Requires a signed-in learner. Scoped to the caller - there is no userId argument."
    studentDashboard: StudentDashboard!

    "Requires the ADMIN role."
    adminStats: AdminStats!
  }
`;

export const schema = buildSchema(typeDefs);
