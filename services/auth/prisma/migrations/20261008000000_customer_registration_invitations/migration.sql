ALTER TABLE "users"
ADD COLUMN "emailVerifiedAt" TIMESTAMPTZ(6);

CREATE TABLE "customer_registration_invitations" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customerId" UUID NOT NULL,
    "accountIds" UUID[] NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "redeemedAt" TIMESTAMPTZ(6),

    CONSTRAINT "customer_registration_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_registration_invitations_tokenHash_key"
ON "customer_registration_invitations"("tokenHash");
CREATE INDEX "customer_registration_invitations_email_expiresAt_idx"
ON "customer_registration_invitations"("email", "expiresAt");
CREATE INDEX "customer_registration_invitations_customerId_idx"
ON "customer_registration_invitations"("customerId");

ALTER TABLE "customer_registration_invitations"
ADD CONSTRAINT "customer_registration_invitations_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
