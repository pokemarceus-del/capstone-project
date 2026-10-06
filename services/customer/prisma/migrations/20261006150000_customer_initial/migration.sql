-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AccountClassification" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "MeterStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(40) NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_addresses" (
    "id" UUID NOT NULL,
    "addressLine" VARCHAR(500) NOT NULL,
    "zoneId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_assignments" (
    "id" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "readerUserId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceAddressId" UUID NOT NULL,
    "routeId" UUID,
    "classification" "AccountClassification" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meters" (
    "id" UUID NOT NULL,
    "serialNumber" VARCHAR(100) NOT NULL,
    "size" VARCHAR(40) NOT NULL,
    "registerDigits" INTEGER NOT NULL,
    "status" "MeterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_installations" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "meterId" UUID NOT NULL,
    "installedAt" TIMESTAMPTZ(6) NOT NULL,
    "initialRegisterValue" DECIMAL(65,30) NOT NULL,
    "removedAt" TIMESTAMPTZ(6),
    "finalRegisterValue" DECIMAL(65,30),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meter_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE INDEX "service_addresses_zoneId_idx" ON "service_addresses"("zoneId");

-- CreateIndex
CREATE INDEX "routes_zoneId_idx" ON "routes"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "routes_zoneId_name_key" ON "routes"("zoneId", "name");

-- CreateIndex
CREATE INDEX "route_assignments_routeId_startsAt_endsAt_idx" ON "route_assignments"("routeId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "route_assignments_readerUserId_startsAt_endsAt_idx" ON "route_assignments"("readerUserId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "accounts_customerId_idx" ON "accounts"("customerId");

-- CreateIndex
CREATE INDEX "accounts_serviceAddressId_idx" ON "accounts"("serviceAddressId");

-- CreateIndex
CREATE INDEX "accounts_routeId_idx" ON "accounts"("routeId");

-- CreateIndex
CREATE INDEX "accounts_classification_status_idx" ON "accounts"("classification", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meters_serialNumber_key" ON "meters"("serialNumber");

-- CreateIndex
CREATE INDEX "meter_installations_accountId_installedAt_idx" ON "meter_installations"("accountId", "installedAt");

-- CreateIndex
CREATE INDEX "meter_installations_meterId_installedAt_idx" ON "meter_installations"("meterId", "installedAt");

-- AddForeignKey
ALTER TABLE "service_addresses" ADD CONSTRAINT "service_addresses_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_assignments" ADD CONSTRAINT "route_assignments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_serviceAddressId_fkey" FOREIGN KEY ("serviceAddressId") REFERENCES "service_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_installations" ADD CONSTRAINT "meter_installations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_installations" ADD CONSTRAINT "meter_installations_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A current installation is represented by a NULL removedAt timestamp.
-- Partial indexes preserve unlimited installation history while preventing
-- concurrent active-meter assignments to the same account or physical meter.
CREATE UNIQUE INDEX "meter_installations_one_current_per_account_idx"
    ON "meter_installations" ("accountId")
    WHERE "removedAt" IS NULL;

CREATE UNIQUE INDEX "meter_installations_one_current_per_meter_idx"
    ON "meter_installations" ("meterId")
    WHERE "removedAt" IS NULL;

ALTER TABLE "meters"
    ADD CONSTRAINT "meters_register_digits_positive_check"
    CHECK ("registerDigits" > 0);

ALTER TABLE "route_assignments"
    ADD CONSTRAINT "route_assignments_valid_period_check"
    CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");

ALTER TABLE "meter_installations"
    ADD CONSTRAINT "meter_installations_valid_period_check"
    CHECK ("removedAt" IS NULL OR "removedAt" >= "installedAt"),
    ADD CONSTRAINT "meter_installations_nonnegative_registers_check"
    CHECK ("initialRegisterValue" >= 0 AND ("finalRegisterValue" IS NULL OR "finalRegisterValue" >= 0)),
    ADD CONSTRAINT "meter_installations_removal_final_reading_check"
    CHECK (("removedAt" IS NULL AND "finalRegisterValue" IS NULL) OR ("removedAt" IS NOT NULL AND "finalRegisterValue" IS NOT NULL));
