ALTER TABLE "refresh_sessions" ADD COLUMN "familyId" UUID;

UPDATE "refresh_sessions" SET "familyId" = gen_random_uuid();

ALTER TABLE "refresh_sessions" ALTER COLUMN "familyId" SET NOT NULL;

CREATE INDEX "refresh_sessions_familyId_revokedAt_idx"
ON "refresh_sessions"("familyId", "revokedAt");
