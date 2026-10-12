import { Injectable, inject } from '@angular/core';
import type { AdminStats, StudentDashboard } from '@examprep/shared';
import { GraphQLClient } from '../api/graphql.client';

/**
 * The dashboard query.
 *
 * Written out in full rather than assembled, so what the screen asks for is
 * readable in one place and reviewable against the schema. This is the payoff
 * of using GraphQL here: the dashboard is one round trip for seven aggregates,
 * and adding a widget is a field in this document, not a new REST endpoint.
 */
const STUDENT_DASHBOARD_QUERY = /* GraphQL */ `
  query StudentDashboard {
    studentDashboard {
      stats {
        attemptsCompleted
        attemptsInProgress
        examsAvailable
        averagePercentage
        bestPercentage
        totalQuestionsAnswered
        totalCorrect
        accuracy
        passRate
      }
      inProgressAttempts {
        attemptId
        examId
        examTitle
        status
        startedAt
        submittedAt
        percentage
        passed
      }
      recentAttempts {
        attemptId
        examId
        examTitle
        status
        startedAt
        submittedAt
        percentage
        passed
      }
      recommendedExams {
        id
        slug
        title
        description
        difficulty
        durationMinutes
        passPercentage
        questionCount
        totalPoints
        bestPercentage
        attemptCount
        activeAttemptId
        topic {
          id
          name
          slug
          description
        }
      }
      topicPerformance {
        topicId
        topicName
        answered
        correct
        accuracy
      }
      progress {
        attemptId
        submittedAt
        percentage
        examTitle
      }
      nextAction {
        kind
        label
        detail
        examId
        attemptId
      }
    }
  }
`;

const ADMIN_STATS_QUERY = /* GraphQL */ `
  query AdminStats {
    adminStats {
      totalUsers
      totalStudents
      totalExams
      publishedExams
      draftExams
      archivedExams
      totalQuestions
      totalAttempts
      completedAttempts
      inProgressAttempts
      averagePercentage
      examPerformance {
        examId
        title
        attempts
        averagePercentage
        passRate
      }
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly graphql = inject(GraphQLClient);

  async getStudentDashboard(): Promise<StudentDashboard> {
    const data = await this.graphql.query<{ studentDashboard: StudentDashboard }>(
      STUDENT_DASHBOARD_QUERY,
      {},
      'StudentDashboard',
    );
    return data.studentDashboard;
  }

  async getAdminStats(): Promise<AdminStats> {
    const data = await this.graphql.query<{ adminStats: AdminStats }>(
      ADMIN_STATS_QUERY,
      {},
      'AdminStats',
    );
    return data.adminStats;
  }
}
