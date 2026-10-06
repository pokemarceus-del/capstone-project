# AquaFlow project timeline

This is the durable hand-off record for the AquaFlow capstone project. It summarizes the work
visible in the repository and the work completed during the Copilot sessions in this workspace.
The earlier session's full chat transcript was unavailable when this record was written, so
timestamps before the current session are approximate and inferred from project files and outputs.

## Timeline

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
- M1's literal clean-Git-clone acceptance check remains pending because the local repository has
  no baseline commit. The current worktree Docker build/start/test gate passes; the user must decide
  whether to establish a reviewed baseline commit before a literal clone is possible. The running
  Compose stack is intentionally left available for inspection.

## Current verified state

- All npm workspace TypeScript checks and the Customer Service build pass; the project test run
  reports 15 passing unit tests, and all 6 PostgreSQL integration tests pass against the dedicated
  test database. Root lint and formatting checks pass.
- Prisma schema validation and client generation pass. The Customer Service Docker image now copies
  its Prisma schema/migrations and applies migrations before startup.
- All eight Docker images build from the repository source tree. Full Compose startup passes;
  PostgreSQL and Customer health checks are healthy, and the Gateway API and web app respond.
- Helm chart, values, and Docker Compose YAML parsed successfully.
- Deployment structure checks confirmed all eight chart workloads have images, ports, environment,
  resource requests, and limits.
- Checks confirmed backend services are not published to the host in Compose, and all eight
  Dockerfiles configure a non-root user.
- A JWT smoke test confirmed production startup rejects a missing/weak secret and accepts a
  sufficiently long test secret for token sign/verify.
- Helm and kubectl are not installed. No Helm lint or cluster deployment was run. Docker image
  builds, Compose startup, health checks, PostgreSQL migrations, and application probes have been
  exercised.

## Current limitations and next steps

1. Review the M0 domain/context checkpoint and unresolved business questions in
   `docs/implementation-roadmap.md`.
2. M1's Docker Compose build/start/test gate passes from the current worktree. Establish a reviewed
   first Git baseline commit only with the user's approval, then verify the exact clean-clone gate.
   Do not advance to M2 before the strict M1 acceptance gate is resolved.
3. Fix the M2 refresh-token lookup before relying on refresh; then add durable sessions,
   production-safe initial admin provisioning, and authorization on user-management endpoints.
4. Extend gateway routes for reading, billing, payment, and notification; review gateway proxy
   error handling, forwarded headers, CORS, and rate-limit storage.
5. Build out staff, customer, and reader workflows beyond the current web overview page.
6. Add the remaining focused service, API/integration, and end-to-end tests as the corresponding
   plan milestones are implemented.
7. Add the remaining infrastructure from the plan as needed: databases, RabbitMQ, Redis,
   observability, ingress/TLS, Kubernetes packaging/GitOps, and deployment automation.
8. Install Helm and kubectl in a deployment-capable environment to validate the exploratory chart,
   run `helm lint`, install the chart only when its planned M10 stage is reached, and test rollout
   and probe behavior.

## Resume here

Checkpoint A has been passed. M1 items 1–9 (quality tooling; PostgreSQL/Prisma setup and schema;
Prisma-backed Customer Service; account transitions, search/filtering/pagination, replacement
history, separate replacement readings, deterministic seed data, PostgreSQL integration tests,
structured logging/readiness, and OpenAPI) are implemented. The current-worktree item 10 Compose
build/start/test gate passes, but its literal clean-clone check awaits a first Git baseline commit
decision. Do not start M2 before that strict acceptance gate is resolved. The Helm chart under
`infra/helm/aquaflow` was created out of sequence and must remain exploratory until the plan
reaches M10. Docker is available and the Compose stack is running; Helm and kubectl remain
unavailable.

For the project direction, refer to the AquaFlow development plan in the workspace root. Keep this
timeline updated when meaningful milestones are completed so it remains the project hand-off record.
