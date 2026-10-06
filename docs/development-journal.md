# AquaFlow development journal

## 2026-10-06 — Plan review and domain-discovery foundation

- Reviewed the supplied `AquaFlow_Complete_Development_Plan.docx` and mapped its M0–M12
  milestones and acceptance gates against the repository.
- Recorded the milestone status and recommended execution order in `implementation-roadmap.md`.
- Added the M0 domain artifacts: expanded glossary, 18 role-based user stories, service context
  map, architecture ADR, assumptions/open questions, meter-replacement and duplicate-payment edge
  cases, and a formula-based billing acceptance CSV.
- Initialized the local Git repository on `main` and documented a local branch/commit policy; no
  files have been committed yet.
- Checked the CSV structure and independently recomputed all three supplied residential billing
  totals. Excel/LibreOffice is unavailable for opening the formula cells directly.
- Verified the outputs also match the current calculator, but it still uses JavaScript
  floating-point arithmetic and has no named automated acceptance tests; that is an M5 gap, not
  proof that M5 is complete.
- Recorded a concrete M2 defect: refresh-token lookup hashes the token with a new Argon2 salt and
  compares hash strings, so valid refresh tokens will not be found.
- Began M1 with four focused CustomerStore tests and corrected meter replacement so the old meter
  retains its final reading while the new meter retains its own initial reading. The replacement
  API now names both readings distinctly and rejects a decreasing old-meter final register (until
  rollover configuration is defined). This work began before the user passed Checkpoint A, which
  was out of the plan's gated sequence. It is retained, but no further M1 work should proceed yet.
- Validation: all four customer meter-lifecycle tests pass; the customer service TypeScript build
  passes.
- Plan compliance correction: the Helm chart was also created before M10 and is premature
  exploratory work. Do not expand it or count it toward M10 before preceding milestones pass.
- The user reviewed the M0 artifacts and passed Checkpoint A on 2026-10-06.
- Implemented M1 item 1: added shared ESLint and Prettier configuration, root lint/format/test/
  typecheck scripts, and workspace typecheck scripts. Existing strict TypeScript settings were
  retained. Removed unused imports and replaced two service-store `any` types with domain types to
  satisfy the initial lint baseline without changing API behavior.
- Validation: root lint, format check, typecheck across all workspaces, and root unit tests pass;
  4 customer tests pass.
- `npm install` reported 24 dependency audit findings (5 moderate, 16 high, 3 critical). No
  automatic audit fix was run because it could apply unrelated or breaking dependency changes;
  investigate dependency findings as a separately scoped task before release.
- Implemented M1 item 2: added PostgreSQL 16 to Compose with an internal-only port, health check,
  required password configuration, and named data volume; added the Customer Service connection
  URL setting; selected Prisma 6.19.0 and documented `migrate dev`/`migrate deploy` in ADR-0002.
- Validation: Prisma CLI reports version 6.19.0 and the Customer Service package declares matching
  Prisma CLI/client versions. The dependency install reported 11 audit findings (3 moderate,
  6 high, 2 critical); no automatic audit fix was run. Docker Compose is not installed, so a real
  Compose parse/start or PostgreSQL health check could not be run.
- Implemented M1 item 3: modeled customers, addresses, zones, routes, reader assignments,
  accounts, meters, and meter installations in Prisma. Generated the initial migration and added
  partial unique indexes to enforce one current meter per account and one current account per
  physical meter while retaining history.
- Validation: Prisma schema validation and client generation pass with a local connection URL;
  migration structure checks confirm all required tables and current-installation indexes. A real
  PostgreSQL migration test remains blocked because Docker/PostgreSQL are unavailable.
- Implemented M1 item 4: replaced the Customer Service's in-memory store with asynchronous Prisma
  reads and writes for customers, accounts, meter installation, and replacement history; connected
  Prisma explicitly after validating service configuration; made the demo customer/account seed
  configurable; and wired the container start command to apply versioned migrations before
  launching the API. Meter installation and replacement now require a validated register digit
  count. Expected not-found/conflict errors are mapped to explicit HTTP responses, while unexpected
  errors are logged and returned as server errors.
- Updated the Customer Service image to include its schema/migrations and generate the Prisma
  client during build. Updated the local-stack instructions to describe database-backed Customer
  Service behavior.
- Validation after item 4: Prisma schema validation and client generation pass; all workspace
  typechecks, lint, formatting check, and 7 focused configuration/meter-lifecycle unit tests pass.
  No PostgreSQL/Docker runtime is available, so migration execution, database constraints, and
  repository integration behavior remain unverified and are still explicit M1 gates.
- `npm install` reported 28 dependency audit findings (5 moderate, 20 high, 3 critical). No
  automatic audit fix was run.
- Implemented M1 item 5: added case-insensitive customer and account search, account filters by
  customer/zone/status/classification, validated bounded pagination, active/inactive account status
  updates, and a chronological account-meter installation history endpoint with separate initial
  and final readings. Exposed the status and history operations through the Gateway and documented
  the Customer Service query/response behavior.
- Validation after item 5: all workspace typechecks and lint pass; all 10 focused configuration,
  filter/pagination validation, account-status validation, and meter-lifecycle tests pass. Formatting
  check passes. No live PostgreSQL integration test was run because Docker/PostgreSQL is unavailable.
- Implemented M1 item 6: extracted and tested exact decimal conversion for the retired meter's final
  register value and the replacement meter's initial register value, with separate fields passed to
  their respective installation records. This preserves the no-rollover-decrease guard and avoids
  conflating the two readings.
- Validation after item 6: all workspace typechecks, Customer Service build, lint, formatting, and
  11 focused configuration/query/lifecycle tests pass. The live database persistence of these
  values remains unverified until the PostgreSQL integration tests in item 8.
- Implemented M1 item 7: added repeatable fixed-ID seed rows for exactly 3 zones, 60 customers, 75
  accounts, 80 physical meters, and 80 installation-history records. Five of the meters are
  retired predecessors; every account has one active meter. The data uses synthetic development
  values, Residential classification, and fixed timestamps; startup seeding remains configurable.
- Added tests for the exact counts, stable IDs, customer/address/zone/meter relationships, 75
  current installations, and separate readings across the five replacement histories.
- Validation after item 7: all workspace typechecks, Customer Service build, lint, formatting, and
  14 focused configuration/query/lifecycle/seed tests pass. A clean database seed run could not be
  exercised because Docker/PostgreSQL is unavailable.
- Began M1 item 8 after user selection: added a PostgreSQL integration suite for account status
  persistence, the active-installation and unique-serial constraints, and replacement history with
  distinct exact initial/final readings. Added an explicit integration command that requires a
  dedicated `*_test` database and documented migration/test setup. The suite cleans up only its own
  UUID-scoped fixtures.
- The user started PostgreSQL 16 in the named `aquaflow-customer-test-db` container, and
  `pg_isready` confirmed the test database was accepting connections. Applied the versioned
  migration to the dedicated `customer_db_test` database with `prisma migrate deploy`.
- Validation of M1 item 8: all 4 PostgreSQL integration tests passed against the dedicated test
  database, covering account status persistence, active-installation uniqueness, meter serial
  uniqueness, and separate old-final/new-initial replacement readings/history. No production or
  non-test database was used. Item 8 is complete.
- Implemented M1 item 9 after user selection: configured structured Fastify request-completion
  logging with request IDs and redaction for authorization/cookie headers, made LOG_LEVEL
  configurable, added `/readyz` with a live PostgreSQL query and controlled 503 response, and
  served the OpenAPI 3.1 document at `/openapi.json`. Added the customer container health check
  against `/readyz` and made Gateway startup wait until Customer Service is healthy. Included
  OpenAPI in the Customer Service image.
- Validation after item 9: all 15 unit tests pass; all 6 PostgreSQL integration tests pass against
  `customer_db_test`, including healthy/unhealthy readiness responses and OpenAPI serving. All
  workspace typechecks, lint, format check, and Compose configuration validation pass.
- Implemented and exercised M1 item 10 from the current worktree: rebuilt all eight service images,
  started the full Compose stack, confirmed PostgreSQL and Customer health, and verified the
  Gateway's customer-list route and the web app return HTTP 200. The root unit suite passes all 15
  tests, and all 6 PostgreSQL integration tests pass against the dedicated test database.
- The first Docker build exposed missing Alpine build tools for Auth's native `argon2` dependency;
  converted Auth to a builder/runtime multi-stage image with the native compile toolchain only in
  the builder. The next build exposed missing root `tsconfig.base.json` in service-scoped Docker
  contexts; moved Compose builds to the repository root, copied shared TypeScript config into each
  image, and added a root `.dockerignore` to keep local dependencies/build output out of contexts.
  All eight images then built successfully and the stack became healthy.
- Literal clean-Git-clone verification remains unverified because the repository has no baseline
  commit (all project files are untracked). Current-worktree Compose and test validation is
  complete, but M1's exact clean-clone acceptance gate should not be marked complete until the
  user decides how to establish a cloneable baseline. Keep the stack running for inspection.
- Next decision: recommend authorizing a reviewed first baseline commit, then running the same
  Compose/test gate from that clean clone. Do not begin M2 or later milestones before the M1 gate.
