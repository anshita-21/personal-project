-- ---------------------------------------------------------------------------
-- Database-level invariants that the Prisma schema language cannot express.
--
-- These are hand-written on purpose: they are the last line of defence for
-- rules the application also enforces. If a bug, a race or a future caller
-- bypasses the service layer, the database still refuses the bad row.
--
-- NOTE: `prisma migrate dev` cannot represent a partial unique index or a CHECK
-- constraint in schema.prisma, so it reports these objects as drift. This
-- project therefore uses `prisma migrate deploy` for applying migrations and
-- never uses `prisma db push`. See docs/architecture.md ("Database invariants").
-- ---------------------------------------------------------------------------

-- A learner may have at most ONE unfinished attempt per exam. Without this,
-- two concurrent "start attempt" requests (double-click, retried fetch) create
-- two live attempts and the timer/autosave state becomes ambiguous.
CREATE UNIQUE INDEX "Attempt_one_active_per_user_exam"
  ON "Attempt" ("userId", "examId")
  WHERE "status" = 'IN_PROGRESS';

-- Grading is all-or-nothing: an in-progress attempt has no score, and a
-- terminal attempt always has one. This is what makes the results endpoints
-- safe to read without re-checking the status everywhere.
ALTER TABLE "Attempt"
  ADD CONSTRAINT "Attempt_grading_consistent" CHECK (
    (
      "status" = 'IN_PROGRESS'
      AND "score" IS NULL
      AND "percentage" IS NULL
      AND "submittedAt" IS NULL
    )
    OR (
      "status" <> 'IN_PROGRESS'
      AND "score" IS NOT NULL
      AND "percentage" IS NOT NULL
      AND "correctCount" IS NOT NULL
      AND "incorrectCount" IS NOT NULL
      AND "unansweredCount" IS NOT NULL
    )
  );

ALTER TABLE "Attempt"
  ADD CONSTRAINT "Attempt_percentage_range"
  CHECK ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100));

-- The deadline is derived from the server clock at start time; a non-positive
-- window would mean an attempt that is born expired.
ALTER TABLE "Attempt"
  ADD CONSTRAINT "Attempt_deadline_after_start" CHECK ("expiresAt" > "startedAt");

ALTER TABLE "Attempt"
  ADD CONSTRAINT "Attempt_snapshots_positive"
  CHECK ("durationMinutes" > 0 AND "questionCount" >= 0 AND "maxScore" >= 0);

ALTER TABLE "Exam"
  ADD CONSTRAINT "Exam_pass_percentage_range"
  CHECK ("passPercentage" >= 1 AND "passPercentage" <= 100);

ALTER TABLE "Exam"
  ADD CONSTRAINT "Exam_duration_range"
  CHECK ("durationMinutes" >= 1 AND "durationMinutes" <= 300);

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_points_positive" CHECK ("points" >= 1);

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_position_positive" CHECK ("position" >= 1);

-- Covers the dashboard/results read path: "all graded attempts of a learner,
-- newest first". A plain (userId, startedAt) index still has to visit
-- in-progress rows; this partial index indexes only graded attempts.
CREATE INDEX "Attempt_user_graded_recent"
  ON "Attempt" ("userId", "submittedAt" DESC)
  WHERE "status" <> 'IN_PROGRESS';
