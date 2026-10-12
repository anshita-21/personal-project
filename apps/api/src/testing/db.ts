import { prisma } from '../db/prisma';

/**
 * Table order does not matter because of CASCADE, but listing every table
 * explicitly (rather than discovering them) means a new table added to the
 * schema without being added here shows up as a leaking-fixture test failure
 * rather than as silent cross-test contamination.
 */
const TABLES = [
  'AttemptAnswer',
  'Attempt',
  'QuestionOption',
  'Question',
  'Exam',
  'Topic',
  'Session',
  'User',
] as const;

/** Wipes every table. Called before each integration test. */
export async function resetDatabase(): Promise<void> {
  const list = TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
