import type { Difficulty } from '@examprep/shared';
import { prisma } from '../db/prisma';
import { hashPassword } from '../modules/auth/password';

/**
 * Fixture builders for the integration suite.
 *
 * Written against Prisma rather than through the HTTP API so a test can set up
 * a precise state (an expired attempt, an archived exam) that the API would not
 * let it create, and so setup failures are not mistaken for endpoint failures.
 */

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'STUDENT' | 'ADMIN';
}

let counter = 0;
function nextId(): number {
  counter += 1;
  return counter;
}

export async function createUser(
  overrides: Partial<Omit<TestUser, 'id'>> = {},
): Promise<TestUser> {
  const index = nextId();
  const password = overrides.password ?? 'Password123!';
  const email = overrides.email ?? `user${index}@test.local`;
  const name = overrides.name ?? `Test User ${index}`;
  const role = overrides.role ?? 'STUDENT';

  const user = await prisma.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
    select: { id: true },
  });

  return { id: user.id, email, password, name, role };
}

export const createStudent = (overrides: Partial<Omit<TestUser, 'id'>> = {}) =>
  createUser({ ...overrides, role: 'STUDENT' });

export const createAdmin = (overrides: Partial<Omit<TestUser, 'id'>> = {}) =>
  createUser({ ...overrides, role: 'ADMIN' });

export async function createTopic(name?: string) {
  const index = nextId();
  const topicName = name ?? `Topic ${index}`;
  return prisma.topic.create({
    data: { name: topicName, slug: `topic-${index}`, description: 'Fixture topic' },
  });
}

export interface SeededExam {
  id: string;
  slug: string;
  topicId: string;
  questions: {
    id: string;
    points: number;
    correctOptionId: string;
    wrongOptionId: string;
    optionIds: string[];
  }[];
}

/**
 * Creates an exam with `questionCount` questions, each with 4 options and
 * exactly one correct answer. Option 1 is always the correct one, which makes
 * assertions in the scoring tests readable.
 */
export async function createExam(options: {
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  questionCount?: number;
  durationMinutes?: number;
  passPercentage?: number;
  difficulty?: Difficulty;
  title?: string;
  topicId?: string;
  pointsPerQuestion?: number;
} = {}): Promise<SeededExam> {
  const index = nextId();
  const topicId = options.topicId ?? (await createTopic()).id;
  const questionCount = options.questionCount ?? 3;
  const points = options.pointsPerQuestion ?? 1;

  const exam = await prisma.exam.create({
    data: {
      title: options.title ?? `Exam ${index}`,
      slug: `exam-${index}`,
      description: 'A fixture exam with enough description to pass validation.',
      topicId,
      difficulty: options.difficulty ?? 'EASY',
      durationMinutes: options.durationMinutes ?? 30,
      passPercentage: options.passPercentage ?? 60,
      status: options.status ?? 'PUBLISHED',
      publishedAt: (options.status ?? 'PUBLISHED') === 'PUBLISHED' ? new Date() : null,
    },
    select: { id: true, slug: true },
  });

  const questions: SeededExam['questions'] = [];
  for (let position = 1; position <= questionCount; position += 1) {
    const question = await prisma.question.create({
      data: {
        examId: exam.id,
        topicId,
        prompt: `Fixture question ${position} for exam ${index}?`,
        explanation: `Because option 1 is correct for question ${position}.`,
        points,
        position,
        options: {
          create: [1, 2, 3, 4].map((optionPosition) => ({
            text: `Option ${optionPosition}`,
            isCorrect: optionPosition === 1,
            position: optionPosition,
          })),
        },
      },
      select: {
        id: true,
        points: true,
        options: { orderBy: { position: 'asc' }, select: { id: true, isCorrect: true } },
      },
    });

    const correct = question.options.find((option) => option.isCorrect);
    const wrong = question.options.find((option) => !option.isCorrect);
    if (!correct || !wrong) {
      throw new Error('Fixture exam built without a correct/incorrect option pair.');
    }

    questions.push({
      id: question.id,
      points: question.points,
      correctOptionId: correct.id,
      wrongOptionId: wrong.id,
      optionIds: question.options.map((option) => option.id),
    });
  }

  return { id: exam.id, slug: exam.slug, topicId, questions };
}
