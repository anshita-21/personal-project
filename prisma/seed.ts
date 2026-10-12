/**
 * Deterministic, idempotent seed.
 *
 * Running it twice produces the same database: topics and exams are upserted by
 * their natural key (slug), question sets are replaced wholesale, and sample
 * attempt history is rebuilt from scratch for the demo accounts only.
 *
 * Scores for the sample history are computed by the REAL grading function
 * imported from the API, not written by hand. If the scoring rules change, the
 * seeded dashboard changes with them and cannot drift into fiction.
 *
 * Usage:  npm run seed
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../apps/api/src/modules/auth/password';
import { gradeAttempt, type GradableQuestion } from '../apps/api/src/modules/attempts/grading';
import { EXAMS, TOPICS, type SeedExam } from './seed-data';

const prisma = new PrismaClient();

const DEMO = {
  admin: {
    email: process.env['SEED_ADMIN_EMAIL'] ?? 'admin@examprep.dev',
    password: process.env['SEED_ADMIN_PASSWORD'] ?? 'Admin123!',
    name: 'Alex Morgan (Admin)',
  },
  student: {
    email: process.env['SEED_STUDENT_EMAIL'] ?? 'student@examprep.dev',
    password: process.env['SEED_STUDENT_PASSWORD'] ?? 'Student123!',
    name: 'Priya Raman',
  },
  peers: [
    { email: 'sam@examprep.dev', name: 'Sam Okafor' },
    { email: 'lee@examprep.dev', name: 'Lee Zhang' },
  ],
};

async function seedTopics(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (const topic of TOPICS) {
    const row = await prisma.topic.upsert({
      where: { slug: topic.slug },
      create: { name: topic.name, slug: topic.slug, description: topic.description },
      update: { name: topic.name, description: topic.description },
      select: { id: true, name: true },
    });
    byName.set(row.name, row.id);
  }
  console.log(`  topics:    ${byName.size}`);
  return byName;
}

async function seedExam(
  exam: SeedExam,
  topicIds: Map<string, string>,
  adminId: string,
): Promise<string> {
  const topicId = topicIds.get(exam.topic);
  if (!topicId) {
    throw new Error(`Seed error: exam "${exam.title}" references unknown topic "${exam.topic}".`);
  }

  const examRow = await prisma.exam.upsert({
    where: { slug: exam.slug },
    create: {
      slug: exam.slug,
      title: exam.title,
      description: exam.description,
      topicId,
      difficulty: exam.difficulty,
      durationMinutes: exam.durationMinutes,
      passPercentage: exam.passPercentage,
      status: exam.status,
      publishedAt: exam.status === 'PUBLISHED' ? new Date() : null,
      createdById: adminId,
    },
    update: {
      title: exam.title,
      description: exam.description,
      topicId,
      difficulty: exam.difficulty,
      durationMinutes: exam.durationMinutes,
      passPercentage: exam.passPercentage,
      status: exam.status,
    },
    select: { id: true },
  });

  // Replace the question set so editing seed-data.ts is enough to update content.
  // Done in a transaction because the unique (examId, position) index means the
  // delete must land before the insert.
  await prisma.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { examId: examRow.id } });
    for (const [index, question] of exam.questions.entries()) {
      const questionTopicId = topicIds.get(question.topic);
      if (!questionTopicId) {
        throw new Error(`Seed error: unknown topic "${question.topic}" on a question.`);
      }
      const correctCount = question.options.filter((option) => option.correct).length;
      if (correctCount !== 1) {
        throw new Error(
          `Seed error: question "${question.prompt.slice(0, 40)}..." has ${correctCount} correct options.`,
        );
      }
      await tx.question.create({
        data: {
          examId: examRow.id,
          topicId: questionTopicId,
          prompt: question.prompt,
          explanation: question.explanation,
          points: question.points ?? 1,
          position: index + 1,
          options: {
            create: question.options.map((option, optionIndex) => ({
              text: option.text,
              isCorrect: option.correct === true,
              position: optionIndex + 1,
            })),
          },
        },
      });
    }
  });

  return examRow.id;
}

async function upsertUser(input: {
  email: string;
  name: string;
  password: string;
  role: 'STUDENT' | 'ADMIN';
}): Promise<string> {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: input.role,
    },
    // Reset the demo password on every seed so the documented credentials in
    // the README are always the credentials that work.
    update: { name: input.name, role: input.role, passwordHash },
    select: { id: true },
  });
  return user.id;
}

/**
 * Builds one graded attempt.
 *
 * `correctEvery` controls the deterministic answer pattern, and `skip` leaves
 * some questions unanswered so the results screen demonstrates the
 * correct / incorrect / unanswered split rather than a clean sweep.
 */
async function seedAttempt(input: {
  userId: string;
  examId: string;
  daysAgo: number;
  wrongEvery: number;
  skipEvery: number;
}): Promise<void> {
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: input.examId },
    select: { durationMinutes: true, passPercentage: true },
  });

  const questions = await prisma.question.findMany({
    where: { examId: input.examId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      points: true,
      topicId: true,
      topic: { select: { name: true } },
      options: { orderBy: { position: 'asc' }, select: { id: true, isCorrect: true } },
    },
  });
  if (questions.length === 0) {
    return;
  }

  const gradable: GradableQuestion[] = questions.map((question) => {
    const correct = question.options.find((option) => option.isCorrect);
    if (!correct) {
      throw new Error(`Seed error: question ${question.id} has no correct option.`);
    }
    return {
      id: question.id,
      points: question.points,
      correctOptionId: correct.id,
      topicId: question.topicId,
      topicName: question.topic.name,
    };
  });

  const submitted = questions.map((question, index) => {
    if (input.skipEvery > 0 && index > 0 && index % input.skipEvery === 0) {
      return { questionId: question.id, selectedOptionId: null };
    }
    const correct = question.options.find((option) => option.isCorrect);
    const wrong = question.options.find((option) => !option.isCorrect);
    const pickWrong = input.wrongEvery > 0 && index % input.wrongEvery === 0;
    return {
      questionId: question.id,
      selectedOptionId: (pickWrong ? wrong?.id : correct?.id) ?? correct?.id ?? null,
    };
  });

  const graded = gradeAttempt(gradable, submitted, exam.passPercentage);

  const startedAt = new Date(Date.now() - input.daysAgo * 24 * 60 * 60 * 1000);
  const expiresAt = new Date(startedAt.getTime() + exam.durationMinutes * 60 * 1000);
  // Finish a little before the deadline, so timeSpent is realistic.
  const submittedAt = new Date(
    startedAt.getTime() + Math.round(exam.durationMinutes * 0.7) * 60 * 1000,
  );

  const attempt = await prisma.attempt.create({
    data: {
      userId: input.userId,
      examId: input.examId,
      status: 'SUBMITTED',
      startedAt,
      expiresAt,
      submittedAt,
      durationMinutes: exam.durationMinutes,
      passPercentage: exam.passPercentage,
      questionCount: graded.questionCount,
      maxScore: graded.maxScore,
      score: graded.score,
      percentage: graded.percentage,
      correctCount: graded.correctCount,
      incorrectCount: graded.incorrectCount,
      unansweredCount: graded.unansweredCount,
    },
    select: { id: true },
  });

  const answers: Prisma.AttemptAnswerCreateManyInput[] = graded.answers.map((answer) => ({
    attemptId: attempt.id,
    questionId: answer.questionId,
    selectedOptionId: answer.selectedOptionId,
    isCorrect: answer.isCorrect,
    awardedPoints: answer.awardedPoints,
  }));
  await prisma.attemptAnswer.createMany({ data: answers });
}

async function main(): Promise<void> {
  console.log('Seeding Exam Prep database...');

  const adminId = await upsertUser({ ...DEMO.admin, role: 'ADMIN' });
  const studentId = await upsertUser({ ...DEMO.student, role: 'STUDENT' });
  const peerIds: string[] = [];
  for (const peer of DEMO.peers) {
    peerIds.push(
      await upsertUser({ ...peer, password: 'Student123!', role: 'STUDENT' }),
    );
  }
  console.log(`  users:     ${2 + peerIds.length}`);

  const topicIds = await seedTopics();

  const examIdsBySlug = new Map<string, string>();
  for (const exam of EXAMS) {
    examIdsBySlug.set(exam.slug, await seedExam(exam, topicIds, adminId));
  }
  console.log(
    `  exams:     ${EXAMS.length} (${EXAMS.filter((e) => e.status === 'PUBLISHED').length} published, ${EXAMS.filter((e) => e.status === 'DRAFT').length} draft)`,
  );
  console.log(`  questions: ${EXAMS.reduce((sum, exam) => sum + exam.questions.length, 0)}`);

  // Rebuild sample history for the demo accounts only, so the seed stays
  // idempotent without touching attempts made by real sign-ups.
  const demoUserIds = [studentId, ...peerIds];
  await prisma.attempt.deleteMany({ where: { userId: { in: demoUserIds } } });

  const id = (slug: string): string => {
    const value = examIdsBySlug.get(slug);
    if (!value) {
      throw new Error(`Seed error: no exam with slug "${slug}".`);
    }
    return value;
  };

  // The demo student's history: improving over five weeks, with a weak topic
  // (Databases & SQL) so the dashboard has something real to recommend.
  await seedAttempt({ userId: studentId, examId: id('javascript-essentials'), daysAgo: 34, wrongEvery: 3, skipEvery: 7 });
  await seedAttempt({ userId: studentId, examId: id('sql-query-fundamentals'), daysAgo: 27, wrongEvery: 2, skipEvery: 0 });
  await seedAttempt({ userId: studentId, examId: id('javascript-essentials'), daysAgo: 20, wrongEvery: 5, skipEvery: 0 });
  await seedAttempt({ userId: studentId, examId: id('typescript-type-system'), daysAgo: 13, wrongEvery: 4, skipEvery: 8 });
  await seedAttempt({ userId: studentId, examId: id('http-rest-and-web-security'), daysAgo: 6, wrongEvery: 6, skipEvery: 0 });
  await seedAttempt({ userId: studentId, examId: id('sql-query-fundamentals'), daysAgo: 2, wrongEvery: 3, skipEvery: 0 });

  // Peers, so the admin statistics page is not a single-user sample.
  const [samId, leeId] = peerIds;
  if (samId) {
    await seedAttempt({ userId: samId, examId: id('javascript-essentials'), daysAgo: 18, wrongEvery: 2, skipEvery: 0 });
    await seedAttempt({ userId: samId, examId: id('data-structures-and-complexity'), daysAgo: 9, wrongEvery: 3, skipEvery: 5 });
  }
  if (leeId) {
    await seedAttempt({ userId: leeId, examId: id('asynchronous-javascript-in-depth'), daysAgo: 11, wrongEvery: 4, skipEvery: 0 });
    await seedAttempt({ userId: leeId, examId: id('http-rest-and-web-security'), daysAgo: 4, wrongEvery: 7, skipEvery: 0 });
  }

  const attemptCount = await prisma.attempt.count();
  console.log(`  attempts:  ${attemptCount}`);
  console.log('');
  console.log('Demo accounts:');
  console.log(`  admin   ${DEMO.admin.email} / ${DEMO.admin.password}`);
  console.log(`  student ${DEMO.student.email} / ${DEMO.student.password}`);
  console.log('Done.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
