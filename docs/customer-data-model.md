# Customer Service data model

The Prisma schema is `services/customer/prisma/schema.prisma`; this document describes its
ownership and database-level invariants. The model is limited to the Customer Service entities
required by M1 and the supplied data blueprint.

## Entities and ownership

- `Customer` owns customer identity/contact fields and has billable `Account` records.
- `ServiceAddress` and `Zone` represent the service location and geographic grouping.
- `Route` belongs to a zone; `RouteAssignment` records reader-to-route assignment periods.
- `Account` belongs to a customer and service address, optionally references a route, and stores
  classification and account status.
- `Meter` represents registered physical inventory with a unique serial number and register digit
  count.
- `MeterInstallation` is the historical relationship between an account and a meter. It stores
  the old meter's final register separately from the new meter's initial register.

`RouteAssignment.readerUserId` is an Auth Service identity reference, not a foreign key. The
Customer Service must not read or constrain against the Auth Service database.

## Invariants

- UUIDs identify records; timestamps use PostgreSQL `timestamptz`.
- Meter serial numbers are unique.
- A meter can have only one current installation, and an account can have only one current meter
  installation. A current installation is one with `removedAt IS NULL`.
- Historical installations remain queryable; a normal `(accountId, removedAt)` unique constraint
  is not used because it would allow only one historical row with a null removal date or otherwise
  mishandle history. PostgreSQL partial unique indexes enforce the current-installation invariant.
- Installation records retain meter-specific initial and final register values. Register values
  use exact PostgreSQL numeric storage rather than binary floating point. `registerDigits` records
  the device's digit count; meter rollover limits and fractional display precision still require
  confirmation against actual meter specifications.
- Foreign keys use `RESTRICT` where deleting a customer, address, zone, route, meter, or account
  could destroy billing history.

## M1 Customer Service API behavior

- `GET /api/v1/customers` accepts `q` (name, email, or phone), `status`, `page`, and `limit`.
- `GET /api/v1/accounts` accepts `q` (address, customer name, or email), `customerId`, `zone`,
  `status`, `classification`, `page`, and `limit`. Text searches and zone matching are
  case-insensitive.
- Paginated list responses contain `items`, `count` (items on this page), `page`, `limit`, and
  `total` (records matching the filters).
- `PATCH /api/v1/accounts/:id/status` activates or deactivates an account. Supported states are
  `active` and `inactive`; setting the current state again is idempotent.
- `GET /api/v1/accounts/:id/meters` returns all installation events for the account in
  chronological order, including each meter's initial reading and (when removed) final reading.
- `GET /healthz` is a process liveness probe; `GET /readyz` runs a database query and returns
  `503` with a controlled dependency error if PostgreSQL is unavailable.
- `GET /openapi.json` serves the Customer Service's OpenAPI 3.1 document. Fastify's structured
  request-completion logs include request ID, method, route, response status, and duration;
  authorization, cookie, and set-cookie headers are redacted. `LOG_LEVEL` controls log verbosity.

## Deterministic development seed

When `CUSTOMER_SEED_DEMO=true`, startup inserts fixed-ID development data for three zones, 60
customers, 75 accounts, and 80 physical meters. The seed is repeatable and skips existing seeded
rows. The additional five meters are retired predecessors for five accounts; those accounts still
have one current meter each, and each predecessor retains a separate initial/final installation
record. Seed accounts use the Residential classification because the plan leaves other class
tariffs unresolved. Zone labels are North, Central, and South; other names/contact values are
synthetic development data.

## Migration workflow

The initial versioned migration is
`services/customer/prisma/migrations/20261006150000_customer_initial/migration.sql`. It was
generated from the Prisma schema and includes custom partial unique indexes and database checks.
Deploy reviewed migrations with `prisma migrate deploy`. Do not use `prisma db push` for shared
environments.

## Remaining work

- Review constraints against actual meter specifications, especially register precision and
  date/state transitions; the initial migration has been applied successfully to both test and
  Compose databases.
- The PostgreSQL integration suite passed against a dedicated `customer_db_test` database on
  2026-10-06, verifying account state persistence, partial unique active-installation and
  meter-serial constraints, and separate replacement history values. Rerun it after database or
  repository changes that affect these behaviors.
- The full Docker Compose stack builds and starts from the current worktree, and the unit and
  PostgreSQL integration suites pass. Repeat the gate from a literal clean Git clone; the project
  repository has not yet received its first commit.

## PostgreSQL integration test setup

The integration suite requires a dedicated PostgreSQL database whose name ends in `_test`; test
records use unique IDs and are removed after each case. Apply the migrations and run the tests from
the project root in PowerShell:

```powershell
$env:CUSTOMER_INTEGRATION_DATABASE_URL = "postgresql://aquaflow:change-me@localhost:5432/customer_db_test?schema=public"
$env:CUSTOMER_DATABASE_URL = $env:CUSTOMER_INTEGRATION_DATABASE_URL
npm run prisma:migrate:deploy --workspace @aquaflow/customer
npm run test:integration --workspace @aquaflow/customer
```

The integration command fails if the dedicated URL is missing, and the suite rejects database
names that do not end in `_test`.
