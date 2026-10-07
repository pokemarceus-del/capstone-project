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
- Created the reviewed initial baseline commit `211d419`. A clean clone exposed two reproducibility
  gaps: npm 11 did not generate Prisma Client during `npm ci`, and Windows CRLF checkouts failed
  Prettier. Added Customer command hooks to generate Prisma Client and `.gitattributes` to enforce
  consistent LF text files. Commit `94d20b4` records these fixes.
- Removed the known hard-coded demo admin password. Auth now has no default administrator; optional
  validated seed credentials are supplied through environment variables. Two focused Auth tests
  cover the absent default user and hash verification for explicit seeding.
- M1 item 10 passed from a new clone of `94d20b4` after `npm ci`: 17 unit tests, all 6 PostgreSQL
  integration tests, all workspace typechecks, lint, and formatting passed. All eight Compose
  images built; PostgreSQL and Customer were healthy; the Gateway returned HTTP 200 with 20 seeded
  customers; the web app returned HTTP 200. M1 is complete.
- The clean-clone Compose stack remains running for inspection. The original Compose stack was
  stopped without deleting its named database volume; the dedicated PostgreSQL test container
  also remains running. At this handoff M2 had not yet started; the user later selected M2 item 1.

## 2026-10-07 — M2 item 1: durable Auth persistence

- Added a dedicated Auth PostgreSQL database and initial Prisma migration for durable users, role
  records, refresh sessions, login events, and customer-account links. External Customer and
  Account identifiers intentionally have no cross-database foreign keys.
- Replaced the in-memory AuthStore with Prisma persistence. Startup deploys migrations, idempotently
  seeds four role records, validates database configuration, and exposes database-aware readiness.
  Optional admin provisioning remains explicit and does not reset an existing password.
- Auth persists login success/failure events and customer-account links, stores only stable
  SHA-256 digests for random refresh tokens, and excludes expired or revoked sessions from lookup.
  This corrects the salted Argon2 lookup bug; refresh rotation/reuse detection and login throttling
  remain planned M2 work.
- Isolated the Auth Prisma Client output from Customer's generated client. Added install-safe client
  generation hooks, Auth integration tests with an `_test` database guard and migration runner,
  Compose database/health dependencies, generated-artifact ignores, and updated local-stack docs.
- Validation: 29 unit and PostgreSQL integration tests pass (19 unit, 10 integration); all
  workspace typechecks, lint, format, Prisma validation, and Compose config validation pass.
  Auth Docker image build, migration, readiness, login/profile, and post-container-restart refresh
  all succeeded. The full eight-service stack passed on fresh volumes in isolated Compose project
  `aquaflow-m2-validation`.
- A reuse attempt with the existing default Customer database volume failed because its stored
  password does not match this session's temporary test value. Preserved the volume unchanged and
  used an isolated fresh-volume Compose project for validation.
- M2 item 1 was complete; the user subsequently selected M2 item 2 as the next task.

## 2026-10-07 — M2 item 2: logout and asymmetric JWT/JWKS

- Implemented Auth RS256 signing with active `kid`, issuer and expiry claims, strict algorithm/key-ID
  verification, validated RSA keys, and a public JWKS endpoint. The public key ring supports old
  and new keys being published together during rotation; Gateway proxies the JWKS endpoint.
- Added idempotent Auth/Gateway logout that revokes the refresh-token SHA-256 digest and returns 204
  even when the refresh token is unknown. Existing stateless access tokens remain valid for at most
  15 minutes after logout.
- Replaced Compose's `JWT_SECRET` with separate active key ID, PKCS#8 private key, and public-JWKS
  settings. Added a no-overwrite local RSA key generator and documented ignored key-file handling,
  secret-manager use, and staged rotation.
- Added four JWT unit tests for signing/key IDs, verification across rotation overlap, unknown key
  and algorithm rejection, and private/public key mismatch. Auth PostgreSQL integration coverage
  verifies digest-based logout revocation.
- Validation: 23 root unit tests passed, all four Auth PostgreSQL integration tests passed,
  workspace typechecks/lint/format passed, and Auth/Gateway rebuilt healthy in the isolated Compose
  project. Gateway smoke tests passed for JWKS, RS256 `kid`, logout 204/idempotency, and rejection
  of the revoked refresh token.
- M2 item 2 was complete at this handoff. The user subsequently selected item 3, now documented
  below.

## 2026-10-07 — M2 item 3: refresh rotation and login lockout

- Added persisted `familyId` to refresh sessions and migrated existing rows into separate families.
  Refresh atomically consumes the presented token, creates a seven-day replacement in the same
  family, and returns both the new access and refresh tokens. A replay revokes every active token
  in that family, without revoking unrelated login families. Logout revokes a whole family.
- The selected lockout policy is five consecutive failures per normalized email in a rolling
  15-minute window. Login remains blocked while all five failures are in-window, locked requests
  receive the same generic invalid-credentials response, and successful login resets the failure
  streak.
- Added integration coverage for migration-backed family rotation/replay, concurrent token use,
  unrelated-family isolation, expiration, and lockout failure-count behavior.
- The first concurrency test run exceeded Prisma's default transaction acquisition wait. Set
  `maxWait` and transaction timeout to 10 seconds and reran the Auth PostgreSQL suite successfully.
- Validation: all seven Auth PostgreSQL integration tests passed; root unit suite passed 23 tests
  (13 database integration tests are skipped by the default root command); all workspace
  typechecks, lint, Prettier, and Auth Prisma validation passed. Auth Docker build,
  migration/startup, and Gateway smoke tests passed. Temporary smoke-test records were cleaned up.
- M2 item 3 is complete. The next plan-ordered item is M2 item 4: shared JWT validation and
  permission middleware on Customer Service; the user subsequently selected it.

## 2026-10-07 — M2 item 4: shared JWT verification and Customer permissions

- Added `@aquaflow/authentication` as a shared, dependency-free RS256 implementation for access
  token signing, public JWKS validation, and token verification. Both Auth and Customer now use
  the same algorithm, `kid`, issuer, expiration, and claim validation.
- Customer startup requires a public issuer/JWKS key ring. Compose passes only those public values
  to Customer; its private signing key remains exclusively in Auth.
- Added Customer bearer-token middleware, generic 401 and 403 responses, and public exceptions for
  health, readiness, and the OpenAPI document. A typed token-validation error distinguishes
  expected invalid credentials from unexpected verifier failures.
- Implemented the user's approved interim role policy: Admin can perform all Customer Service
  operations; Billing Officer can read Customer/Account/Meter data but cannot write; Customer and
  Meter Reader have no data-route access until tenant ownership and assignment scoping is available.
  Added the Gateway proxy route for Customer service info and documented bearer security in OpenAPI.
- Added role-policy unit coverage and a PostgreSQL API integration test for required authentication,
  invalid-token handling, role access/denial, and public probes.
- Validation: 29 root unit tests passed; all 7 Customer and 7 Auth PostgreSQL integration tests
  passed separately. Workspace typechecks, lint, and Prettier passed. Auth/Customer/Gateway images
  rebuilt; Auth and Customer became healthy, and a 12-case Gateway-to-Customer role smoke check
  plus web/Gateway health checks passed. Temporary test users/events were removed.
- M2 item 4 is complete. Customer and Meter Reader data access must stay denied until their
  ownership/assignment controls are implemented. The user selected M2 item 5 next.

## 2026-10-07 — M2 item 5: verified customer registration and local role identities

- Resolved the open verification question with the user's selection: staff issue a one-time
  invitation for an existing active Customer record and deliver it out of band to its contact.
  The invitation cannot be generated from user-supplied account data; Auth forwards the Admin
  bearer to Customer Service to verify the customer and load all associated accounts. Email
  delivery remains deferred to M7.
- Added an Auth migration for invitation digests, customer/account references, issuer, expiration,
  redemption, and `emailVerifiedAt`. Invitations contain a 256-bit random code, only its SHA-256
  digest is stored, and each code expires after 24 hours.
- Added Admin-protected invitation issuance and a public registration endpoint. Registration hashes
  the password, creates only a Customer-role account, marks the email verified, links every
  associated account, and consumes invitations in a single database transaction. The Auth user
  list and staff-user creation routes now require Admin access; direct Customer-role creation is
  rejected.
- Added an explicit local-only seeding switch requiring four unique addresses and four distinct
  passwords (16 characters minimum); it is denied in production or other non-development/test
  modes. No default credentials are provided.
- Validation: 16 Auth unit tests and 9 PostgreSQL Auth integration tests passed. The integration
  coverage verifies invitation hashing, user/role restrictions, all customer-account links,
  concurrent one-time redemption, successful login, and idempotent seeding. Auth, Customer, and
  Gateway images rebuilt; the Auth migration applied and all three services were healthy. A
  Gateway-based smoke test logged in all four role seeds and completed invitation, registration,
  and Customer login against the seeded Customer database. Temporary users, invitations, and login
  events were removed; the running stack now has local identity seeding disabled.
- M2 item 5 was complete; M2 item 6 was the selected next task.

## 2026-10-07 — M2 item 6: Auth audit events and endpoint permissions

- Added a persisted Auth security-audit table and an Admin-only, bounded audit-events endpoint,
  exposed through Gateway. Login outcomes are written atomically with login events; refresh
  rotation/reuse/rejection, logout, Admin endpoint denials, staff-user creation, Admin reads,
  invitation issuance, and registration outcomes are also recorded. Sensitive mutations and
  their success audit row share one transaction.
- Kept audit fields deliberately narrow: event/action, outcome, actor and target IDs, timestamp.
  Raw secrets and tokens are never recorded. Existing login-event email storage remains for
  lockout counting and is not duplicated in audit rows. Customer 401/403 results produce structured
  warning logs; they are not forwarded into Auth's database.
- Made the Customer route/method inventory authoritative for authorization. The complete matrix
  now denies unknown routes/methods, permits Admin operations, restricts Billing Officer to GET
  and HEAD reads, and keeps Customer and Meter Reader denied pending data scoping. Added policy and
  HTTP integration coverage for all roles and declared endpoint methods.
- Validation: root unit suite 34 passed / 18 integration skipped; Auth PostgreSQL integration 10
  passed; Customer PostgreSQL integration 8 passed. Auth, Customer, and Gateway builds/typechecks,
  ESLint, Prettier, Prisma schema validation/generation, and whitespace checks passed. Auth migration
  deployment reported no pending migrations. The required local Compose `.env` values are absent,
  so the active prior validation stack was not rebuilt. The built Gateway was smoke-tested against
  a local stub Auth upstream and forwarded the audit route's HTTP 401 as expected; a
  Compose-connected Gateway-to-Auth smoke test remains unrun.
- M2 item 6 is complete. The work was committed as `1e4763f` (`feat: complete M2 customer
authorization and audit`); `.env.jwt-keys` and other local secrets were excluded.

## 2026-10-07 — Checkpoint B approval and M3 items 1–3

- The user approved Checkpoint B after reviewing the documented M2 evidence. The known M2
  validation limitation remains: the Compose-connected Gateway/Auth stack was not rebuilt for
  audit-event changes because required local `.env` values were absent.
- Added the Gateway's explicit Customer, Auth, Reading, Billing, Payment, and Notification routes.
  Protected routes use the shared RS256/JWKS verifier; public login/refresh/registration/JWKS and
  operational health/status routes remain available without a token.
- Added safe request/correlation ID generation and forwarding, shared CORS headers, an upstream
  timeout with distinct 503/504 responses, and an `@fastify/rate-limit` limiter backed by Redis
  when configured. The gateway's error handler preserves the limiter's 429 response.
- Added Redis 7 to Compose with a health check; Compose waits for Redis, Auth, and Customer before
  starting the Gateway. Documented database migration-before-service startup order.
- Validation: Gateway tests passed 8/8, including an isolated live Redis test proving two Gateway
  instances share one rate limit. Gateway build/typecheck, workspace typechecks, ESLint, Prettier,
  root unit suite (42 passed; 18 database integration tests skipped), and Compose syntax validation
  passed. All eight fresh Docker images built. In an isolated network, Redis, Gateway, Reading,
  Billing, Payment, Notification, and Web passed runtime health/API smoke checks. The user then
  configured `.env` and started isolated Compose project `aquaflow-m3-validation`. Compose syntax
  and interpolation passed. The initial local check found two database URL password mismatches;
  the user corrected them without exposing values. Both PostgreSQL containers, Redis, Auth, and
  Customer now report healthy; Reading, Billing, Payment, and Notification are running.
- The prior M2 project continues to own host ports 3000 and 8080. The standard M3 Compose Gateway
  and Web containers therefore cannot bind those ports. Started only M3 one-off Gateway/Web
  containers with Compose service aliases on alternate host ports 18080 and 13000; Gateway and Web
  returned HTTP 200, Web reached Gateway over Compose DNS, and Gateway rejected an unauthenticated
  protected route with HTTP 401 as expected. No existing project or volume was stopped or altered.
- M3 item 3 runtime is exercised with the documented port qualification; retain clean-clone and
  controlled dependency-failure acceptance checks for the next plan-ordered M3 item. Do not stop
  the prior project or change its port ownership without user approval.

## 2026-10-07 — M3 item 4: root workflow and clean-clone acceptance (complete)

- Added root Compose development commands (`dev`, `dev:ps`, and `dev:down`); the development
  project is isolated as `aquaflow-dev`. The existing root `test` command remains the primary
  Vitest entry point, and `health` checks the public Gateway and Web endpoints.
- Added configurable Gateway/Web health URLs, non-zero failure behavior, and focused tests for
  successful responses, HTTP failures, and unreachable endpoints. The focused tests passed 3/3.
- Ran the root health command against M3's alternate ports 18080/13000; both endpoints returned
  HTTP 200.
- Verified the Gateway's controlled upstream failure behavior with its focused test: unavailable
  upstream returned HTTP 503/`UPSTREAM_UNAVAILABLE`, and timeout returned
  HTTP 504/`UPSTREAM_TIMEOUT`.
- Committed M3 at `c5af826`, cloned that revision to a separate validation directory, and passed
  `npm.cmd ci`, root tests (44 passed; 19 skipped), lint, workspace typechecks, and formatting.
- Built all eight images and started the full clean-clone Compose stack with dedicated project
  volumes. A temporary Compose copy mapped Gateway/Web to 18081/13001 because the earlier M2
  project owns 8080/3000. PostgreSQL, Auth, Customer, and Redis became healthy; Gateway, Web, and
  Web-to-Gateway over Compose DNS returned HTTP 200.
- The existing M2 and M3 validation projects remained running. No existing container or volume
  was stopped or changed; the temporary clone and its isolated Compose resources were removed
  after validation. No local `.env` or key contents were recorded.
