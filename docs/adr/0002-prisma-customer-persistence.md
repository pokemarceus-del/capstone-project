# ADR-0002: Use Prisma for Customer Service PostgreSQL persistence

- Status: Accepted
- Date: 2026-10-06
- Source: `AquaFlow_Complete_Development_Plan.docx`, recommended technical baseline and M1.

## Context

M1 requires a PostgreSQL-backed Customer Service and migrations. The supplied plan's recommended
baseline is Prisma with PostgreSQL. The current Customer Service uses an in-memory store, so
records are lost when the process restarts.

## Decision

- Use PostgreSQL 16 for the local Customer Service database in Docker Compose.
- Use Prisma ORM and Prisma Migrate for Customer Service schema and migrations.
- Pin the Prisma CLI and generated client to the same Prisma 6 release line (currently 6.19.0).
- Keep the customer-owned Prisma schema and migrations under
  `services/customer/prisma/`; do not share this schema or database with another service.
- Use `prisma migrate dev` for local development and migration authoring, and `prisma migrate
deploy` for automated deployment. Do not use `prisma db push` as a substitute for reviewed,
  versioned migrations.
- Keep PostgreSQL on the internal Compose network with a named data volume; the Customer Service
  receives its connection string through `CUSTOMER_DATABASE_URL`.
- Model entities and add the generated Prisma client in the following M1 work items. This ADR
  records the tooling and lifecycle decision, not completion of Customer Service persistence.

## Alternatives considered

- **TypeORM or Drizzle:** viable TypeScript ORM alternatives, but they diverge from the supplied
  recommended baseline.
- **Raw SQL/driver only:** offers direct control but requires more schema/migration infrastructure
  than is needed for the capstone baseline.
- **Prisma 7:** available, but its updated configuration/client setup is not needed for this
  milestone; Prisma 6 has a conventional schema datasource URL and supports the workspace's Node
  runtime.

## Consequences

- Prisma Client generation must follow schema changes.
- Database migrations are explicit source-controlled artifacts and must be tested from a clean
  database.
- PostgreSQL data survives container recreation while the named volume is retained; deleting the
  volume deletes local database contents.
- The connection string must match the PostgreSQL user, password, database, and Docker service
  hostname. Credentials belong in `.env`, not committed files.

## Validation still required

- Add the Customer Service Prisma schema and generated client.
- Apply migrations against a clean PostgreSQL container and verify the customer service can
  persist and reload records.
- Exercise Compose health/dependency behavior with Docker Compose when Docker is available.
