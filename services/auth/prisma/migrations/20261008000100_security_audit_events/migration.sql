CREATE TYPE "SecurityAuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

CREATE TABLE "security_audit_events" (
    "id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "outcome" "SecurityAuditOutcome" NOT NULL,
    "actorUserId" UUID,
    "targetType" VARCHAR(60),
    "targetId" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_audit_events_createdAt_idx" ON "security_audit_events"("createdAt");
CREATE INDEX "security_audit_events_actorUserId_createdAt_idx" ON "security_audit_events"("actorUserId", "createdAt");
CREATE INDEX "security_audit_events_action_createdAt_idx" ON "security_audit_events"("action", "createdAt");
