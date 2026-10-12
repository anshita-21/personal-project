import type { PrismaTransaction } from '../../db/prisma';
import { prisma } from '../../db/prisma';

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Produces a slug that is unique among exams.
 *
 * The uniqueness check is advisory: the `Exam.slug` unique constraint is the
 * actual guarantee, and a concurrent create still surfaces as a 409 rather than
 * a silently duplicated URL.
 */
export async function uniqueExamSlug(
  title: string,
  db: PrismaTransaction | typeof prisma = prisma,
  excludeExamId?: string,
): Promise<string> {
  const base = slugify(title) || 'exam';
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const clash = await db.exam.findFirst({
      where: { slug: candidate, ...(excludeExamId ? { id: { not: excludeExamId } } : {}) },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}
