# AquaFlow implementation roadmap and status

This tracker translates the supplied `AquaFlow_Complete_Development_Plan.docx` into an ordered
working backlog. The supplied plan is the strict requirements and sequencing authority. Status
reflects repository evidence as of 2026-10-07, not the presence of a directory or a successful
compile alone.

## Plan compliance and gate policy

- Work milestone-by-milestone in the supplied order M0 through M12. A later milestone must not be
  started or expanded until the prior milestone's completion gate is reviewed and passed.
- Within a milestone, follow the supplied required-work list and completion gate; do not substitute
  an easier implementation or mark an item complete because a scaffold exists.
- Keep work already created out of sequence clearly labelled as premature/exploratory. Do not
  treat it as permission to skip earlier gates.
- Some M1 edits began before the M0 checkpoint was approved. They are retained; following the
  user's Checkpoint A approval, M1 may now resume from its first required-work item.
- The Helm/Kubernetes chart was created before M10, contrary to the supplied order (M9 CI/CD comes
  first, and the plan says not to start Kubernetes before the application works in Compose). It is
  quarantined as exploratory; do not expand or count it as M10 progress until the preceding gates
  pass.
- The repository already contained partial later-milestone scaffolds before this plan review.
  These are status-audited below, not evidence that their milestones are complete or permission to
  continue them out of order.

## Status key

- **Not started** — no meaningful implementation evidence found.
- **Partial** — some foundation exists, but required scope or the completion gate is unmet.
- **In progress** — currently being worked; acceptance gate not yet passed.
- **Complete** — required scope and evidence satisfy the plan's completion gate.
- **Blocked** — cannot proceed until a named external decision or dependency is resolved.

## Current milestone dashboard

| Milestone | Plan phase                           | Status                                                    | Repository evidence and remaining gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Orientation and domain discovery     | **Complete; Checkpoint A passed by user on 2026-10-06**   | The required discovery artifacts, 18 role stories, formula-based billing CSV, and local Git repository are present. The CSV structure and sample totals were checked programmatically; Excel/LibreOffice is unavailable here. Unresolved business questions are documented for later decisions.                                                                                                                                                                                                                                        |
| M1        | Monorepo and Customer Service        | **Complete; all 10 items and the acceptance gate passed** | A fresh clone at `94d20b4` passed after `npm ci`: 17 unit tests, all 6 PostgreSQL integration tests, workspace typechecks, lint, and Prettier. All eight Compose images built; PostgreSQL and Customer were healthy; Gateway customer listing returned HTTP 200 with 20 seed records and the web app returned HTTP 200. Prisma generation is wired into the relevant Customer commands, and `.gitattributes` makes formatting consistent across Windows checkouts.                                                                     |
| M2        | Auth and RBAC                        | **Complete; Checkpoint B passed by user on 2026-10-07**   | Auth persistence, RS256/JWKS, refresh replay detection, login lockout, verified Customer registration, durable Auth security audit events, and the role-by-endpoint matrix are implemented and tested. Auth and Customer share strict JWT verification. Customer policy remains Admin all, Billing Officer read-only, and Customer/Meter Reader denied until ownership/assignment scoping exists. Four explicit, strong local role identities can be seeded only in development/test. The completed M2 work is committed at `1e4763f`. |
| M3        | Gateway and containerization         | **Complete; items 1–4 implemented and validated**         | Committed at `c5af826`. A fresh clone passed `npm ci`, root tests (44 passed; 19 skipped), lint, typechecks, and formatting. All eight images built; full Compose started with isolated volumes and temporary alternate Web/Gateway ports because M2 owns 3000/8080. PostgreSQL, Auth, Customer, and Redis were healthy; Gateway, Web, and Web-to-Gateway smoke checks returned HTTP 200. Focused tests verify controlled upstream 503/504 responses.                                                                                  |
| M4        | Meter Reading Service                | **Partial**                                               | In-memory periods/readings and basic validation exist. Missing reading DB, routes/assignments, batch/idempotency, MinIO uploads, independent complete R1–R7 rules, review flow, rollover/replacement formulas, permissions, and test evidence.                                                                                                                                                                                                                                                                                         |
| M5        | Billing Engine                       | **Partial**                                               | In-memory tariffs/bills, calculator, preview, and bill creation exist; current calculator matches the three sample totals. Missing exact-money arithmetic, named tests, durable schema, effective tariff handling, reviewed/idempotent bill runs, immutable bill/adjustment/ledger model, arrears and scheduled penalties, PDFs, and performance evidence.                                                                                                                                                                             |
| M6        | Next.js staff portal                 | **Partial**                                               | A buildable overview page calls customer/auth APIs. Missing secure cookie auth, protected role-aware app shell, customer/account and meter history screens, reading review, tariff and bill-run flows, audit/users screens, UX states, and Playwright/accessibility tests.                                                                                                                                                                                                                                                             |
| M7        | Events, payments, and notifications  | **Partial**                                               | Mock in-memory payment and notification APIs exist. Missing RabbitMQ/Mailpit, typed event contracts, transactional outbox/inbox, signed/deduplicated webhook flow, durable payment/ledger idempotency, OTC and online checkout, retries/DLQ, and end-to-end evidence.                                                                                                                                                                                                                                                                  |
| M8        | Customer portal and reader PWA       | **Not started**                                           | No customer bill/usage/payment portal or offline route-capture PWA workflow found.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| M9        | Quality gates and CI/CD              | **Not started**                                           | Local lint/format/typecheck/test commands were added as M1 foundation work. CI workflows, meaningful broader unit/integration coverage, contract/E2E tests, image scanning, and release process are not present.                                                                                                                                                                                                                                                                                                                       |
| M10       | Kubernetes and IaC                   | **Premature exploratory work only; do not continue yet**  | A Helm chart exists, but it was created out of sequence before M1–M9 gates passed. Do not expand, deploy, or count it as completed M10 work until the supplied M10 prerequisites are reached. Databases, broker, Redis, MinIO, ingress, migrations, kind automation, HPA/PDB, Argo CD, and cluster verification remain missing. Docker/Helm/kubectl were unavailable in the validation environment.                                                                                                                                    |
| M11       | Observability and resilience         | **Not started**                                           | No OpenTelemetry, Prometheus/Grafana, centralized logs/traces, SLOs/alerts, or game-day evidence found.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| M12       | Hardening, performance, and capstone | **Not started**                                           | Security/performance/backup/restore, load targets, final E2E, runbooks, retrospective, and presentation are not evidenced.                                                                                                                                                                                                                                                                                                                                                                                                             |

## Required execution order

Checkpoint A was passed by the user on 2026-10-06. Continue with M1 from its first required-work
item. The existing M10 Helm chart is premature and exploratory only. Follow the plan's M0-to-M12
gates; do not expand Kubernetes/GitOps or mark a later phase complete while earlier requirements
remain unsatisfied.

### M0 — Orientation and domain discovery — complete; Checkpoint A passed

- [x] Read supplied requirements and extract the 13-milestone development order.
- [x] Expand the glossary to at least 15 terms.
- [x] Write at least 12 role-based stories (18 are recorded).
- [x] Add the service ownership and sync/async context map.
- [x] Record the supplied meter replacement and duplicate payment edge cases in
      `edge-cases.md`.
- [x] Record architecture decision ADR-0001.
- [x] Record known assumptions and unresolved questions.
- [x] Add a spreadsheet-compatible CSV with formulas for all three supplied residential totals.
- [x] Verify the CSV column/formula structure and independently check all three calculated totals.
- [x] Initialize the project Git repository on `main`; document a branch/commit policy.
- [x] Provide the service context map, ownership boundaries, and recorded open questions for
      Checkpoint A review.
- [ ] Run the spreadsheet formulas in Excel or LibreOffice when one is available; named
      application-level billing tests remain an M5 requirement.
- [x] User reviewed the M0 artifacts and passed Checkpoint A on 2026-10-06.

**M0 evidence:** `domain-glossary.md`, `user-stories.md`, `architecture-overview.md`,
`adr/0001-microservice-architecture.md`, `assumptions-and-questions.md`, `edge-cases.md`,
`billing-acceptance-cases.csv`, `development-workflow.md`, and `development-journal.md`.

### M1 — Monorepo and Customer Service — in progress

1. [x] Add reproducible lint/format/typecheck/test scripts and shared configuration; strict
       TypeScript settings were already present.
2. [x] Add PostgreSQL to Compose; select the plan's recommended Prisma ORM and migration
       workflow; record the decision in ADR-0002.
3. [x] Model customer, address, zone, route, account, meter, and installation/history entities
       with one-active-meter constraints; add the initial migration.
4. [x] Replace the customer in-memory store behind the existing API with Prisma persistence;
       validate environment config, connect explicitly at startup, and apply migrations before
       service startup in the container.
5. [x] Implement account state transitions, search/filtering/pagination, and replacement history.
6. [x] Keep old-meter final reading separate from replacement-meter initial reading; Prisma
       installation history stores the old final and replacement initial values independently.
       Focused tests verify nondecreasing final readings, active-meter/serial conflicts, and exact
       separation of old final and new initial register values. PostgreSQL integration tests also
       verify both values persist in their distinct history fields.
7. [x] Seed the plan's 3 zones, 60 customers, 75 accounts, and 80 meters deterministically.
8. [x] Add PostgreSQL integration tests for constraints, state transitions, installation,
       replacement, and historical reads; run them against a dedicated test database.
9. [x] Add structured request logging, readiness that checks dependencies, and OpenAPI.
10. [x] Build all images, start the full Compose stack, and pass the test gate from a clean clone.
        Clone commit `94d20b4` passed unit and PostgreSQL integration tests, all workspace
        typechecks/lint/format checks, all eight image builds, healthy PostgreSQL/Customer services,
        the Gateway customer-list request, and the web HTTP check.

### M2 — Auth and RBAC — in progress

1. [x] Add durable users, roles, refresh tokens, login events, and customer-account links.
       Auth owns a dedicated PostgreSQL database and Prisma migration. Customer/account IDs in
       account links remain references to Customer Service data, without cross-database foreign
       keys. The salted-hash refresh lookup defect was fixed using stable SHA-256 digests for
       high-entropy refresh tokens; explicit rotation/reuse policy remains in item 3.
2. [x] Add logout, asymmetric JWT signing, key IDs, JWKS, and key-rotation procedure.
3. [x] Implement refresh rotation/reuse detection and failed-login throttling/lockout. Rotation
       returns a new seven-day refresh token in the same family; replay revokes the family.
       Five consecutive email-based failures within 15 minutes block login while all five remain
       in the rolling window; successful login resets the consecutive-failure count.
4. [x] Add shared JWT validation and permission middleware and enforce it on Customer Service.
       Auth and Customer import the same RS256/JWKS verifier. Customer requires bearer access
       tokens on all API routes except health, readiness, and OpenAPI. The user approved this
       interim matrix: Admin all routes; Billing Officer read-only; Customer and Meter Reader
       denied until customer-ownership and reader-assignment scoping are implemented. Never
       broaden those roles before their data scoping rules exist.
5. [x] Implement verified customer registration and provision one safe local identity per role.
       An Admin can issue a one-time, 24-hour invitation only for an active existing Customer
       Service customer. Auth confirms the record and captures all its accounts through the
       Admin-authorized Customer API. The code is stored as a hash and delivered out of band to the
       existing contact; redemption atomically creates a verified Customer-role identity and links
       its accounts. Email delivery is deferred to M7. Optional local identities require four
       distinct email/password pairs, passwords of at least 16 characters, explicit opt-in, and
       development/test mode; no default credentials are supplied. Auth user listing and staff
       provisioning now require Admin access, and direct public Customer-role creation is blocked.
6. Audit security actions and test the complete role-by-endpoint permission matrix.
7. [x] Pass Checkpoint B — approved by the user on 2026-10-07.

### M3 — Gateway and containerization

1. Complete service routes, JWT pre-check, request/correlation IDs, controlled errors, CORS,
   timeouts, and distributed rate limiting.
2. Add Redis and health-aware Compose dependencies; document migration startup order.
3. Build and exercise all containers, publishing only the gateway/web entry points.
4. Add root dev/test/health scripts and prove clean-clone Compose startup and controlled 503 behavior.

### M4 — Meter Reading Service

1. Add reading DB, billing periods/windows, routes and authoritative reader assignments.
2. Implement reading state transitions, single/batch APIs, idempotency, and MinIO presigned photos.
3. Implement independent R1–R7 validation rules, estimated reads, rollover, and replacement
   consumption.
4. Add review/approval/override/rejection history and block period close on unresolved flags.
5. Enforce route permissions; test each rule and expose billing-ready approved consumption.

### M5 — Billing Engine

1. Model tariff versions, bill runs, immutable bills/lines, ledger, adjustments, and idempotency.
2. Make the pure calculator use integer minor units or another exact-money representation and
   document line-level rounding.
3. Add named tests for $324.80, $2,567.04, and $2,037.81 plus edge/property tests.
4. Add run preview/review/issue, effective-date tariff selection, arrears, once-only penalties,
   and adjustment approval.
5. Generate reproducible PDFs; retain source reading IDs and tariff version.
6. Validate the 1,000-account bill-run target and pass Checkpoint C.

### M6 — Staff portal

1. Establish httpOnly-cookie login/logout, silent refresh, route protection, and role-aware shell.
2. Implement account/customer search/detail and meter history.
3. Implement flagged-reading queue and audited decisions.
4. Implement tariff administration, period/bill-run review/issue, dashboard, users/roles, and audit
   screens.
5. Add responsive accessible loading/empty/error/success states and Playwright tests.

### M7 — Events, payments, and notifications

1. Add RabbitMQ and Mailpit; define versioned event contracts.
2. Implement transactional outbox relay and inbox/processed-event records before critical events.
3. Feed Billing consumption from reading events; publish bills and payments reliably.
4. Implement OTC/mock checkout, signed/deduplicated webhooks, durable idempotency, receipts,
   overpayment credits, and exactly-once ledger effects.
5. Implement notification preferences/templates, retry/backoff, DLQ inspection/replay, and
   end-to-end duplicate/failure tests; pass Checkpoint D.

### M8 — Customer portal and reader PWA

1. Implement isolated customer bill, PDF, usage, payment, status, and notification-preference views.
2. Implement assigned-route capture, offline queue/photo storage, sync, and partial-conflict
   resolution.
3. Verify account/route isolation, 360px layouts, and airplane-mode route completion.

### M9 — Quality gates and CI/CD

1. Add PR checks for lint, typecheck, unit/integration tests, and relevant contract tests.
2. Add Compose business-journey E2E and at least two Pact relationships.
3. Publish SHA-tagged GHCR images; add dependency/image/secret scanning and dependency updates.
4. Document branch protection, releases, changelogs, and demonstrate a failing PR is blocked.

### M10 — Kubernetes and IaC

1. Only after Compose and CI gates pass, script kind cluster creation and local registry/ingress.
2. Deploy service databases, RabbitMQ, Redis, and MinIO; add migrations, secrets/config overlays,
   probes, resource controls, HPA/PDB, and Helm packaging.
3. Configure Argo CD and GitOps; test rollout, rollback, scaling, and node drain.
4. Keep Terraform/cloud optional; pass Checkpoint E.

### M11 — Observability and resilience

1. Add OpenTelemetry HTTP/event context propagation.
2. Collect Prometheus metrics, Loki logs, and Tempo/Jaeger traces; create Grafana dashboards.
3. Define SLI/SLOs and actionable availability/latency/error/queue/job alerts.
4. Test dependency, broker, duplicate-message, restart, and recovery scenarios; document game days.

### M12 — Hardening, performance, and capstone

1. Perform OWASP review; add IDOR/authorization tests, security headers, CSP, and size limits.
2. Document JWT/secret rotation and access recovery.
3. Run k6 targets (10,000 accounts, 50 concurrent readers, 200 customer users), fix the top three
   bottlenecks, and record evidence.
4. Automate PostgreSQL backup and restore into a fresh environment.
5. Finish onboarding/docs/runbooks/ADR index, final repeatable E2E, retrospective, and presentation;
   pass Checkpoint F.

## Immediate work queue

1. M3 items 1–4 are complete and validated from clean clone `c5af826`; the existing M2 project
   continues to own default host ports 3000/8080. Continue with M4 item 1: add the Reading database,
   billing periods/windows, routes, and authoritative reader assignments.
2. Customer and Meter Reader remain denied on
   Customer data routes until the necessary ownership and route-assignment scoping is implemented.
   The earlier salted-hash lookup and expiry filtering defects are fixed.
3. Retain but separately review the customer meter-lifecycle edits that preceded Checkpoint A.
4. Add named billing-total tests and exact-money arithmetic only when the plan sequence reaches M5.
5. Update this tracker, `project-timeline.md`, and the development journal at each meaningful gate.

The M2 item 6 endpoint matrix and event inventory are documented in
[`security-authorization-matrix.md`](./security-authorization-matrix.md).
