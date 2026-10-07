# AquaFlow project timeline

This is the durable hand-off record for the AquaFlow capstone project. It summarizes the work
visible in the repository and the work completed during the Copilot sessions in this workspace.
The earlier session's full chat transcript was unavailable when this record was written, so
timestamps before the current session are approximate and inferred from project files and outputs.
Detailed pass/fail evidence for completed gates is in [validation-record.md](./validation-record.md).

## Timeline

Detailed M0–M2 test/build/runtime evidence and explicitly skipped checks are summarized in
[validation-record.md](./validation-record.md).

### 2026-10-06 — Planning and requirements

- Prepared the AquaFlow complete development plan in the workspace root as
  `AquaFlow_plan.txt` and `AquaFlow_Complete_Development_Plan.zip`.
- Turned the source roadmap into an implementation-oriented specification: a roughly 29-week
  part-time plan, service boundaries, business requirements, API conventions, testing and
  deployment milestones, and acceptance criteria.
- Established the recommended technical baseline: TypeScript/Node.js, Next.js, Fastify,
  PostgreSQL per service, RabbitMQ, Redis, Docker Compose, Helm, and GitOps.

### 2026-10-06 — Monorepo scaffold and architecture

- Created `capstone-project` as an npm-workspaces monorepo, with `apps/web`, domain services,
  shared packages, data/public directories, deployment infrastructure, and documentation.
- Added the architecture overview and domain glossary.
- Added project environment examples, TypeScript configuration, and local-stack documentation.
- Documented the major service boundaries: auth, customer, reading, billing, payment,
  notification, gateway, and web.

### 2026-10-06 — Backend service foundation

- Implemented the customer service for customers, service accounts, meter installation, and meter
  replacement.
- Implemented the auth service with password hashing, JWT access tokens, refresh-session handling,
  and role-bearing users.
- Implemented the reading service with billing periods, reading submission, and validation.
- Implemented the billing service with tariff data and tier-based bill calculations.
- Implemented payment handling with idempotency-key checks and mock confirmed payments.
- Implemented notification record creation and delivery-status responses.
- Implemented a gateway with customer/auth proxy routes, health/status endpoints, request IDs,
  CORS handling, and in-memory rate limiting.
- Added a Next.js web app with an AquaFlow overview page and customer/auth API status display.
- Added TypeScript builds and Vitest scripts to service packages.

### 2026-10-06 — Local orchestration and container packaging

- Added Docker Compose configuration for the web app, gateway, and backend services.
- Added Dockerfiles and Docker ignore files for the service applications.
- Added local-stack instructions and updated the project README with workspace structure and run
  commands.

### 2026-10-06 — Kubernetes and deployment hardening

- Added the Helm chart at `infra/helm/aquaflow`, defining one Deployment and ClusterIP Service per
  workload, with resource requests/limits, startup/readiness/liveness probes, and pod/container
  security settings.
- Configured non-root container execution, disabled service-account token mounting, dropped Linux
  capabilities, set a seccomp profile, and mounted temporary writable volumes for read-only-root
  filesystems.
- Configured the web server to reach the gateway through `API_BASE_URL`, avoiding an in-cluster
  dependency on `localhost`.
- Required a production JWT secret of at least 32 bytes and wired the auth service to an
  externally-created Kubernetes Secret.
- Updated Dockerfiles to install/build/prune dependencies and run service containers as the Node
  user.
- Restricted Compose host-published ports to the web app and gateway; backend services are exposed
  only within the Compose network.
- Documented local image building/loading, secret creation, Helm installation, and port forwarding
  in `docs/local-stack.md`.
- Added an explicit warning that the deployment is only a capstone baseline: the services still
  store state in memory and lose it on restart.

### 2026-10-06 — Supplied-plan review and M0 domain discovery

- Reviewed the supplied `AquaFlow_Complete_Development_Plan.docx` end-to-end and translated its
  M0–M12 milestone gates into `docs/implementation-roadmap.md`.
- Added 18 role-based user stories, an expanded domain glossary, service context map, ADR-0001,
  assumptions/questions, meter-replacement and duplicate-payment edge cases, a formula-based CSV
  for the three billing acceptance cases, and a development workflow/journal.
- Initialized the local project Git repository on `main`; no initial commit has been created.
- Checked the CSV structure and recomputed the plan's three billing totals. The current calculator
  agrees, but still uses floating-point numbers and has no automated named acceptance tests.
- Identified an existing auth defect: Argon2 refresh-token hashes use random salts, so comparing a
  newly generated hash string to a stored hash will not locate a valid session.
- Re-ranked work according to the supplied plan: complete the M1 Compose/database/customer-service
  gate before expanding Kubernetes beyond the exploratory chart.
- Began M1 with focused meter-lifecycle tests and corrected replacement handling so the retired
  meter's final register reading is not overwritten with the new meter's initial reading. Four
  tests and the Customer Service TypeScript build pass. This was out of sequence because
  Checkpoint A had not yet been approved; the work is retained and will be reviewed as M1 resumes.
- User reviewed the M0 artifacts and passed Checkpoint A. M1 is now the active milestone and must
  resume from its first required-work item.
- Completed M1 item 1 by adding shared ESLint/Prettier configuration and root lint, format,
  typecheck, and test commands. All four quality commands pass; the Customer Service tests report
  four passing cases. `npm install` reported 24 audit findings (including 3 critical); no automatic
  dependency update was applied.
- Completed M1 item 2 by adding PostgreSQL 16 to Compose with a health check and named volume,
  adding the Customer Service connection URL setting, selecting Prisma 6.19.0, and documenting the
  migration lifecycle in ADR-0002. Docker Compose was unavailable, so runtime startup was not
  verified. The latest dependency installation reported 11 audit findings (including 2 critical);
  no automatic fix was applied.
- Completed M1 item 3 by defining the Customer Service Prisma schema and generating its initial
  migration. Custom PostgreSQL partial unique indexes enforce one current installation per account
  and per physical meter without removing installation history. Prisma validation/client
  generation and structural migration checks passed; applying it against PostgreSQL remains
  unverified because Docker/PostgreSQL were unavailable.
- Completed M1 item 4 by replacing the Customer Service in-memory repository with asynchronous
  Prisma-backed customer, account, and meter operations; validating configuration and connecting
  Prisma at startup; configuring container startup to deploy migrations; and making demo seeding
  configurable. Register digit count is validated for installation/replacement requests.
- Completed M1 item 5 by adding customer/account search and filters, stable bounded pagination,
  active/inactive account status updates, and chronological per-account meter-installation history.
  The new status/history routes are available through both Customer Service and Gateway.
- Completed M1 item 6 by ensuring the Prisma replacement transaction writes the old meter's final
  register and replacement meter's initial register to separate numeric fields. A focused exact-
  decimal test confirms readings such as 125.25 and 3.125 remain distinct; live persistence still
  awaits the planned PostgreSQL integration tests.
- Completed M1 item 7 by adding a repeatable fixed-ID development seed for three zones, 60
  customers, 75 accounts, and 80 meters with 80 installation records. Five meters are retired
  predecessors and all 75 accounts retain one current meter. Synthetic records use fixed dates and
  Residential classification; seeding remains configurable at startup.
- Seed tests verify target counts, stable IDs, referential consistency, current-meter counts, and
  separate readings for replaced meters. No live seeding run was possible without Docker/PostgreSQL.
- Began M1 item 8 after user selection by adding a dedicated PostgreSQL integration harness for
  account status, active-installation and unique-serial constraints, and separate replacement
  readings/history. It requires a `*_test` database, applies no destructive cleanup outside its
  fixture UUIDs, and is documented alongside the migration command. The user started a PostgreSQL
  16 test container; the versioned migration applied successfully to `customer_db_test`, and all
  four integration tests passed. M1 item 8 is complete.
- Completed M1 item 9 by configuring structured Fastify request logging with request IDs and
  authorization/cookie redaction, adding configurable log levels, implementing database-aware
  `/readyz` and serving OpenAPI 3.1 at `/openapi.json`. Compose checks Customer Service readiness
  and waits for it before starting Gateway. Added integration checks for both a healthy and
  unavailable database readiness response, plus OpenAPI serving.
- Validation: all 15 unit tests and all 6 PostgreSQL integration tests pass; workspace typechecks,
  lint, formatting, and Compose configuration validation pass.
- Began the selected M1 item 10 gate: all eight images built, the full Compose stack started, the
  PostgreSQL and Customer containers became healthy, the Gateway customer-list route returned HTTP
  200 with persisted seed data, and the web app returned HTTP 200. Re-ran all 15 unit and 6
  PostgreSQL integration tests successfully.
- Resolved two build issues discovered by the gate: added a builder-only native toolchain for
  Auth's Alpine `argon2` compilation, and changed service/web build contexts to the repository
  root while copying each workspace's shared TS config. Added `.dockerignore` exclusions for local
  dependencies and generated output. `docker compose config --quiet` also passes.
- A reviewed baseline was committed as `211d419`, followed by `94d20b4` to make clean-clone
  validation reproducible. The first clean clone exposed npm 11 skipping Prisma's dependency
  lifecycle generation and Windows checkout line endings breaking Prettier. Added Prisma
  generation hooks for Customer tests, builds, typechecks, and development, plus LF text policy in
  `.gitattributes`.
- Removed the hard-coded demo administrator password; Auth now creates no default user and accepts
  optional, validated `AUTH_SEED_ADMIN_EMAIL`/`AUTH_SEED_ADMIN_PASSWORD` settings. Auth tests cover
  absent default users and password hashing for explicit local seeding.
- The literal M1 clean-clone gate passed at `94d20b4` after `npm ci`: 17 unit tests and all 6
  PostgreSQL integration tests passed; all workspaces typechecked; lint and format checks passed.
  All eight images built and the Compose stack became healthy. The Gateway customer-list endpoint
  returned HTTP 200 with 20 seeded records, and the web app returned HTTP 200. M1 is complete; no
  M2 work has started.

### 2026-10-07 — M2 item 1: durable Auth persistence

- Added an Auth-owned PostgreSQL database, Prisma schema and initial migration for users, role
  records, refresh sessions, login events, and customer-account links. Customer and account IDs
  intentionally remain external references because Customer Service owns those records in a
  separate database.
- Replaced Auth's in-memory store with Prisma persistence. Four role records are seeded idempotently
  at startup; optional administrator provisioning remains explicit and repeatable without
  resetting an existing password. Normalized email addresses and mapped duplicate user emails to
  HTTP 409.
- Auth now records successful and failed login events, stores refresh-session records, filters
  expired sessions, and reads customer-account links. Replaced the salted Argon2 refresh-token
  lookup with a stable SHA-256 digest for high-entropy UUID refresh tokens, resolving the recorded
  lookup defect; rotation/reuse policy and failed-login throttling remain later M2 work.
- Added Auth database URL validation, database-aware `/readyz`, migration-on-startup, and Compose
  health dependencies. Generated the Auth Prisma Client into an isolated workspace path to avoid
  overwriting Customer's generated client. Added root generation hooks, generated-file exclusions,
  test-database safeguards, and local-stack instructions.
- Validation: all 29 unit and PostgreSQL integration tests passed together (19 unit, 10
  integration); all workspace typechecks, lint, formatting, Prisma schema validation, and Compose
  configuration checks passed. The four Auth integration tests verify persistence of users/roles,
  refresh sessions, login events, and customer-account links in `auth_db_test`.
- Built the Auth image and ran all eight Compose services with fresh, isolated named database
  volumes. Both databases and Auth/Customer readiness checks were healthy; Gateway returned HTTP
  200 with 20 seeded customers and the web app returned HTTP 200. Auth login and `/me` succeeded,
  and a refresh session remained usable after restarting the Auth container.
- An attempt to reuse the existing default Customer database volume with a temporary local test
  password failed authentication. No existing volume was deleted or altered; the complete stack
  was validated using the separate `aquaflow-m2-validation` Compose project and fresh volumes.

### 2026-10-07 — M2 item 2: logout and asymmetric JWT/JWKS

- Implemented RS256 access-token signing with a configurable active `kid`, 15-minute expiry, issuer
  validation, strict algorithm/key-ID checks, and an RSA public-key ring that accepts overlapping
  current/retiring keys. The Auth Service publishes its public keys at `/.well-known/jwks.json`;
  Gateway proxies that endpoint.
- Added idempotent logout through Auth and Gateway. It revokes the matching persisted refresh-token
  digest and returns HTTP 204, including for unknown tokens. Stateless access tokens already issued
  remain valid until their 15-minute expiry.
- Replaced Compose's shared-secret configuration with active-key ID, PKCS#8 private-key base64, and
  public JWKS settings. Added a local RSA key generator that refuses to overwrite output and writes
  ignored `.env.jwt-keys` material; documented safe handling and staged rotation.
- Added JWT tests for RS256/kid signing, verification during key overlap, unknown-kid and
  non-RS256 rejection, and mismatched key rejection. Auth PostgreSQL integration tests also verify
  digest-based revocation.
- Validation: 23 root unit tests passed; all four Auth PostgreSQL integration tests passed
  separately. All workspace typechecks, lint, and Prettier checks passed. Auth and Gateway images
  rebuilt and became healthy in the isolated `aquaflow-m2-validation` Compose project. Gateway
  smoke checks verified published JWKS, token `kid`/RS256 alignment, logout HTTP 204, idempotent
  logout, and rejection of the revoked refresh token.
- The isolated Compose stack and named data volumes remain running and intact. Local test signing
  material is in the ignored root `.env.jwt-keys`; no repository commit was created.

### 2026-10-07 — M2 item 3: refresh rotation and login lockout

- Added refresh-token families and a versioned Auth migration. Each login creates a family; a valid
  refresh request atomically revokes its presented token and returns a replacement with a rolling
  seven-day expiry. The consumed digest remains stored for replay detection. Reuse revokes only the
  matching family's active sessions; logout also revokes the entire family.
- Made rotation transactional with conditional revocation and a bounded 10-second transaction
  acquisition/operation timeout. Concurrent attempts using the same token result in one rotation
  and detected reuse that revokes the family.
- Implemented the user-selected lockout rule: five consecutive failures for a normalized email
  within a rolling 15-minute window block further login while all five remain in that window.
  Successful login resets the consecutive-failure count; locked requests keep the generic
  invalid-credentials response.
- Added PostgreSQL integration coverage for family-wide logout, successful rotation, replay and
  family isolation, concurrent reuse, expiry rejection, the failure threshold, window filtering,
  and success reset.
- Validation: the root suite passed 23 unit tests (13 database integration tests are skipped by the
  default command). All seven Auth PostgreSQL integration tests passed; workspace typechecks, lint,
  format, and Prisma validation passed. Auth image build and startup applied the new migration and
  became healthy in `aquaflow-m2-validation`.
- Gateway smoke checks passed for login after four failures, lockout after five failures, refresh
  rotation, replay rejection/family revocation, logout, and access-token validity through logout.
  Web and Gateway health returned HTTP 200. Test-created users/events were removed after the run.
- The first concurrent integration run exceeded Prisma's default transaction acquisition wait.
  Raising the rotation transaction's `maxWait` and timeout to 10 seconds resolved the contention;
  all seven Auth integration tests passed on rerun.

### 2026-10-07 — M2 item 4: shared JWT verification and Customer permissions

- Added the dependency-free `@aquaflow/authentication` workspace package. It loads and validates
  RS256 public JWK sets, verifies signatures/key IDs/issuer/expiry/claims, and signs Auth access
  tokens through Node's crypto APIs. Auth and Customer now consume the same verification code.
- Customer Service loads its verifier from public `JWT_ISSUER` and `JWT_PUBLIC_KEYS_JSON`
  configuration only; the Auth private signing key is not passed to Customer. Compose and both
  service images include the shared package.
- Added a Customer pre-handler that requires a valid bearer token on all API routes while keeping
  liveness, readiness, and the OpenAPI document public. Invalid/missing tokens return generic 401
  errors; role denials return 403. Expected token-validation failures are caught by their dedicated
  error type, while unexpected verifier failures continue to the service error handler.
- Implemented and recorded the user-approved interim role matrix: Admin may use every Customer
  Service route; Billing Officer may read Customer, Account, Meter, and service-info routes but
  cannot write; Customer and Meter Reader are denied until their ownership/assignment scoping is
  implemented. Added the missing Gateway proxy route for Customer Service info.
- Updated the Customer OpenAPI document with a bearer security scheme and public operational
  exceptions. Added unit tests for the role/method matrix and shared verification, plus a PostgreSQL
  API integration test for missing/invalid tokens, Admin/Billing access, denied roles, and public
  probes.
- Validation: root unit suite passed 29 tests (14 database integration cases are skipped there);
  all seven Customer PostgreSQL integration tests and all seven Auth PostgreSQL integration tests
  passed separately. Workspace typechecks, lint, and Prettier passed. Auth and Customer rebuilt
  healthy with the shared module; Gateway rebuilt and restarted. A 12-case Gateway-to-Customer
  smoke check passed, as did web/Gateway HTTP 200 health checks. Temporary users and their login
  events were removed.
- M2 item 4 is complete. Do not enable Customer/Meter Reader data access until the planned
  customer-ownership and reader-assignment constraints exist. The user selected M2 item 5 next.

### 2026-10-07 — M2 item 5: verified customer registration and local role identities

- Resolved the plan's open customer/account verification question with the user's approval:
  Customer registration requires an Admin-issued single-use invitation for an active existing
  Customer Service customer. The Admin delivers the code out of band to the contact already on
  file; no account details supplied by an unauthenticated user are treated as proof. Email delivery
  remains in plan order for M7.
- Added an Auth-owned PostgreSQL invitation record with a SHA-256 token digest, registered contact,
  customer ID, all account IDs, issuing Admin, expiry, and redemption time. The one-time 256-bit
  invitation token expires after 24 hours and is returned only when issued. Auth verifies the
  active customer and retrieves all linked accounts over Customer Service's Admin-protected API
  before creating the invitation.
- Added public `POST /api/v1/register` for invitation redemption. The transaction creates the
  password-hashed Customer identity, marks its email verified, links every captured account, and
  consumes all current invitations for that email atomically. Integration coverage exercises two
  concurrent redemptions: exactly one succeeds; the other receives a conflict. The customer must
  then log in normally.
- Protected Auth user listing and staff provisioning with Admin bearer authentication. Direct
  Customer-role account creation through `/api/v1/users` is rejected; verified registration is the
  sole public Customer identity path.
- Added explicit four-role local identity seeding. It is disabled by default and requires unique
  emails, four distinct passwords of at least 16 characters, and development/test mode. The local
  Customer seed is marked verified; no default credentials were introduced.
- Validation: all 16 Auth unit tests passed; all 9 Auth PostgreSQL integration tests passed against
  `auth_db_test`, including invitation, role, concurrency, account-link, and identity-seed checks.
  Auth, Customer, and Gateway images rebuilt, and the Auth migration applied. A Gateway-to-Auth-to-
  Customer smoke flow logged in all four seeded roles, issued an invitation for a real active
  development customer, completed registration, and logged in as Customer. Temporary validation
  users, invitations, and login events were removed, then local identity seeding was disabled in
  the running stack.
- M2 item 5 is complete. Customer and Meter Reader data API access remains denied under the
  approved interim policy until account ownership and route-assignment scoping are implemented.

## 2026-10-07 — M2 item 6: Auth audit events and complete role matrix

- Added Auth-owned durable security audit events for login success/failure and lockout, refresh
  rotation/reuse/rejection, logout, denied Admin-only requests, sensitive Auth reads, staff-user
  creation, customer invitation issuance, and registration outcomes. Staff-user creation,
  invitation issuance, and successful registration write their success event in the same database
  transaction as the operation.
- Added Admin-only `GET /api/v1/audit-events`, with a bounded latest-event `limit`, and exposed it
  through Gateway. Audit rows contain action/outcome, actor and target identifiers, and time; they
  do not retain credentials, tokens, token hashes, invitation codes, email, IP, or user-agent.
  Existing login-throttling records still store normalized email in `login_events`.
- Centralized the Customer Service route/method inventory. Unknown routes and unsupported methods
  default-deny; Admin can use declared methods, Billing Officer can use reads (including HEAD),
  and Customer/Meter Reader remain denied. Customer HTTP 401/403 responses also produce structured
  warning logs without credentials.
- Validation: root suite passed 34 unit tests; its 18 PostgreSQL integration tests were skipped by
  the default runner and run separately. Auth PostgreSQL integration passed all 10 tests against
  `auth_db_test`; Customer PostgreSQL integration passed all 8 against `customer_db_test`. These
  exercise the Auth Admin endpoint matrix and safe audit response fields, refresh/logout and
  invitation audit events, and every Customer business route/method against each role. Auth,
  Customer, and Gateway builds and typechecks, root ESLint, Prettier, and `git diff --check`
  passed. Prisma validation/generation passed, and Auth migration deploy reported no pending
  migrations.
- The running isolated Compose project was left unchanged. Compose could not resolve its required
  host `.env` values, so no image rebuild or Compose-connected Gateway-to-Auth smoke test was
  performed. The built Gateway was separately smoke-tested against a local stub Auth upstream;
  `GET /api/v1/audit-events` correctly forwarded its HTTP 401. Real Auth behavior was exercised in
  PostgreSQL HTTP integration tests.
- M2 item 6 is complete. Checkpoint B is the next plan-ordered gate; Customer and Meter Reader
  permissions remain restricted pending ownership and assignment scoping.

## Current verified state

- M1's clean-clone acceptance gate passed at commit `94d20b4`.
- M2 items 1–6 are implemented but not yet committed. Item 1 passed 29 tests including all 10
  PostgreSQL integration cases; item 2 passed 23 root unit tests and four Auth integration tests;
  item 3 passed 23 root unit tests and seven Auth integration tests; item 4 passed 29 root unit
  tests, seven Customer integration tests, and seven Auth integration tests; item 5 passed 36 root
  tests, nine Auth integration tests, and the Compose registration smoke flow. Item 6 passed 34
  root unit tests, 10 Auth integration tests, and 8 Customer integration tests. All affected
  workspace typechecks, root lint, and formatting checks pass.
- The full stack is running under Compose project `aquaflow-m2-validation` with fresh
  `aquaflow-m2-validation_customer_postgres_data` and
  `aquaflow-m2-validation_auth_postgres_data` volumes. Both databases and Auth/Customer are healthy;
  Gateway and web were previously verified at HTTP 200. The running images have not been refreshed
  with the M2 item 6 changes because the required Compose `.env` values are not present.
- `aquaflow-customer-test-db` remains running with separate `customer_db_test` and `auth_db_test`
  databases. The previous `compose_customer_postgres_data` volume remains intact; the password
  mismatch with this session's temporary test value was not resolved by changing stored data.
- Helm chart, values, and Docker Compose YAML parsed successfully.
- Deployment structure checks confirmed all eight chart workloads have images, ports, environment,
  resource requests, and limits.
- Checks confirmed backend services are not published to the host in Compose, and all eight
  Dockerfiles configure a non-root user.
- RS256/JWKS smoke tests confirm key IDs match between issued tokens and published keys, old keys
  verify during overlap, and logout revokes refresh tokens through Gateway.
- Helm and kubectl are not installed. No Helm lint or cluster deployment was run. Docker image
  builds, Compose startup, health checks, PostgreSQL migrations, and application probes have been
  exercised.

## Current limitations and next steps

1. M1 and M2 items 1–6 are complete. The next plan-ordered gate is Checkpoint B.
2. Keep Customer and Meter Reader denied on Customer data routes until ownership and route-
   assignment scoping is implemented.
3. Extend gateway routes for reading, billing, payment, and notification; review gateway proxy
   error handling, forwarded headers, CORS, and rate-limit storage.
4. Build out staff, customer, and reader workflows beyond the current web overview page.
5. Add the remaining focused service, API/integration, and end-to-end tests as the corresponding
   plan milestones are implemented.
6. Add the remaining infrastructure from the plan as needed: databases, RabbitMQ, Redis,
   observability, ingress/TLS, Kubernetes packaging/GitOps, and deployment automation.
7. Install Helm and kubectl in a deployment-capable environment to validate the exploratory chart,
   run `helm lint`, install the chart only when its planned M10 stage is reached, and test rollout
   and probe behavior.

## Resume here

Checkpoint A has been passed. M1 items 1–10 and M2 items 1–6 are complete and verified. Checkpoint B
is next; obtain the user's approval before proceeding beyond it. The Helm chart
under `infra/helm/aquaflow` was created out of sequence and must remain exploratory until the plan
reaches M10. Docker is available; the isolated Compose project is running. Helm and kubectl remain
unavailable.

For the project direction, refer to the AquaFlow development plan in the workspace root. Keep this
timeline updated when meaningful milestones are completed so it remains the project hand-off record.
