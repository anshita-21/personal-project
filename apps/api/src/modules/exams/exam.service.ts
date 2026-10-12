import type { Prisma } from '@prisma/client';
import type {
  AdminExamQuery,
  AdminExamSummary,
  ExamDetail,
  ExamQuery,
  ExamSummary,
  Paginated,
  TopicView,
} from '@examprep/shared';
import { prisma } from '../../db/prisma';
import { notFound } from '../../errors/app-error';
import { toExamSummary, toTopicView, type ExamRow } from './exam.mapper';

type ExamSort = ExamQuery['sort'];

function orderBy(sort: ExamSort, order: 'asc' | 'desc'): Prisma.ExamOrderByWithRelationInput[] {
  // `id` is appended as a tie-breaker. Without a total ordering, two rows with
  // equal sort keys can appear on page 1 AND page 2 (or on neither) because
  // Postgres makes no stability promise for OFFSET without a unique key.
  return [{ [sort]: order } as Prisma.ExamOrderByWithRelationInput, { id: 'asc' }];
}

function searchFilter(search: string | undefined): Prisma.ExamWhereInput {
  if (!search) {
    return {};
  }
  // `contains` compiles to a parameterised LIKE - the term is never
  // concatenated into SQL, so a quote or a `%` in the search box is data.
  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { topic: { name: { contains: search, mode: 'insensitive' } } },
    ],
  };
}

/**
 * Per-exam aggregates for one page of results.
 *
 * Three queries for the whole page instead of two per row: the naive version is
 * an N+1 that turns a 9-card catalogue into 19 round trips.
 */
async function collectExamStats(
  examIds: string[],
  userId: string | null,
): Promise<Map<string, ReturnType<typeof emptyStats>>> {
  const stats = new Map(examIds.map((id) => [id, emptyStats()] as const));
  if (examIds.length === 0) {
    return stats;
  }

  const questionAggregates = await prisma.question.groupBy({
    by: ['examId'],
    where: { examId: { in: examIds } },
    _count: { _all: true },
    _sum: { points: true },
  });
  for (const row of questionAggregates) {
    const entry = stats.get(row.examId);
    if (entry) {
      entry.questionCount = row._count._all;
      entry.totalPoints = row._sum.points ?? 0;
    }
  }

  if (userId) {
    const [graded, active] = await Promise.all([
      prisma.attempt.groupBy({
        by: ['examId'],
        where: { examId: { in: examIds }, userId, status: { not: 'IN_PROGRESS' } },
        _count: { _all: true },
        _max: { percentage: true },
      }),
      prisma.attempt.findMany({
        where: { examId: { in: examIds }, userId, status: 'IN_PROGRESS' },
        select: { id: true, examId: true },
      }),
    ]);

    for (const id of examIds) {
      const entry = stats.get(id);
      if (entry) {
        entry.bestPercentage = null;
        entry.attemptCount = 0;
        entry.activeAttemptId = null;
      }
    }
    for (const row of graded) {
      const entry = stats.get(row.examId);
      if (entry) {
        entry.attemptCount = row._count._all;
        entry.bestPercentage = row._max.percentage ?? null;
      }
    }
    for (const row of active) {
      const entry = stats.get(row.examId);
      if (entry) {
        entry.activeAttemptId = row.id;
      }
    }
  }

  return stats;
}

function emptyStats() {
  return {
    questionCount: 0,
    totalPoints: 0,
    bestPercentage: undefined as number | null | undefined,
    attemptCount: undefined as number | undefined,
    activeAttemptId: undefined as string | null | undefined,
  };
}

/** The student-facing catalogue. Only PUBLISHED exams are ever visible here. */
export async function listPublishedExams(
  query: ExamQuery,
  userId: string | null,
): Promise<Paginated<ExamSummary>> {
  const where: Prisma.ExamWhereInput = {
    status: 'PUBLISHED',
    ...searchFilter(query.search),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.exam.count({ where }),
    prisma.exam.findMany({
      where,
      include: { topic: true },
      orderBy: orderBy(query.sort, query.order),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const stats = await collectExamStats(
    rows.map((row) => row.id),
    userId,
  );

  return {
    items: rows.map((row) => toExamSummary(row, stats.get(row.id) ?? emptyStats())),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getPublishedExamDetail(
  idOrSlug: string,
  userId: string | null,
): Promise<ExamDetail> {
  const exam = await prisma.exam.findFirst({
    where: { status: 'PUBLISHED', OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { topic: true },
  });
  if (!exam) {
    throw notFound('Exam not found.');
  }
  return buildExamDetail(exam, userId);
}

/** Admins can open an exam in any state (that is the point of a draft). */
export async function getExamDetailForAdmin(idOrSlug: string): Promise<ExamDetail> {
  const exam = await prisma.exam.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: { topic: true },
  });
  if (!exam) {
    throw notFound('Exam not found.');
  }
  return buildExamDetail(exam, null);
}

async function buildExamDetail(exam: ExamRow, userId: string | null): Promise<ExamDetail> {
  const [stats, topicRows] = await Promise.all([
    collectExamStats([exam.id], userId),
    prisma.question.groupBy({
      by: ['topicId'],
      where: { examId: exam.id },
      _count: { _all: true },
    }),
  ]);

  const topics = await prisma.topic.findMany({
    where: { id: { in: topicRows.map((row) => row.topicId) } },
  });
  const topicsById = new Map(topics.map((topic) => [topic.id, topic] as const));

  const summary = toExamSummary(exam, stats.get(exam.id) ?? emptyStats());
  return {
    ...summary,
    status: exam.status,
    createdAt: exam.createdAt.toISOString(),
    topicBreakdown: topicRows
      .map((row) => {
        const topic = topicsById.get(row.topicId);
        return topic
          ? { topic: toTopicView(topic), questionCount: row._count._all }
          : null;
      })
      .filter((entry): entry is { topic: TopicView; questionCount: number } => entry !== null)
      .sort((a, b) => b.questionCount - a.questionCount),
  };
}

/** Admin catalogue: every status, plus authoring metadata. */
export async function listExamsForAdmin(
  query: AdminExamQuery,
): Promise<Paginated<AdminExamSummary>> {
  const where: Prisma.ExamWhereInput = {
    ...searchFilter(query.search),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.exam.count({ where }),
    prisma.exam.findMany({
      where,
      include: { topic: true, _count: { select: { attempts: true } } },
      orderBy: orderBy(query.sort, query.order),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const stats = await collectExamStats(
    rows.map((row) => row.id),
    null,
  );

  return {
    items: rows.map((row) => ({
      ...toExamSummary(row, stats.get(row.id) ?? emptyStats()),
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      attemptTotal: row._count.attempts,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listTopics(): Promise<TopicView[]> {
  const topics = await prisma.topic.findMany({ orderBy: { name: 'asc' } });
  return topics.map(toTopicView);
}
