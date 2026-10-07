# AquaFlow local stack

This document describes how to run the project locally during the capstone implementation.

## Kubernetes deployment (exploratory)

The Helm chart in `infra/helm/aquaflow` was created ahead of its planned M10 milestone and is
exploratory only. It does not configure the Customer Service PostgreSQL connection or migration
workflow, so it is not a supported deployment and must not be counted as M10 completion. It sets
resource requests and limits, HTTP liveness/readiness probes, non-root execution, a read-only
container filesystem, and a required externally managed JWT secret.

The remaining service stores are in memory, and the chart deliberately keeps one replica per
service. Do not use it for production or scale it until M10 is reached and durable service-owned
databases, migrations, backup/restore, and production identity/bootstrap flows exist.

Build the images from the project root and load them into your local cluster:

```powershell
$services = @("customer", "auth", "reading", "billing", "payment", "notification", "gateway")
foreach ($service in $services) {
  docker build -t "aquaflow/$service:0.1.0" ".\services\$service"
}
docker build -t aquaflow/web:0.1.0 .\apps\web
```

For a `kind` cluster, load each local image with `kind load docker-image
aquaflow/<service>:0.1.0 --name <cluster-name>` (repeat for `web`). For Minikube, use
`minikube image load aquaflow/<service>:0.1.0`.

Create the namespace and a random JWT secret. Keep the secret out of source control:

```powershell
kubectl create namespace aquaflow --dry-run=client -o yaml | kubectl apply -f -
$jwtSecret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
kubectl create secret generic aquaflow-secrets --namespace aquaflow --from-literal="jwt-secret=$jwtSecret"
```

Install the chart and check rollout status:

```powershell
helm lint .\infra\helm\aquaflow
helm upgrade --install aquaflow .\infra\helm\aquaflow --namespace aquaflow
kubectl get deployments,services,pods --namespace aquaflow
```

Access the web app locally:

```powershell
kubectl port-forward service/aquaflow-web 3000:3000 --namespace aquaflow
```

Open `http://localhost:3000`. The web server calls the in-cluster gateway using `API_BASE_URL`.

## Service ports

- Web app: 3000
- Customer service: 3001 (internal)
- Auth service: 3002 (internal)
- Reading service: 3003 (internal)
- Billing service: 3004 (internal)
- Payment service: 3005 (internal)
- Notification service: 3006 (internal)
- Gateway: 8080

Compose publishes only the web app and gateway to the host. Backend services are reachable only
over the Compose network.

When another AquaFlow Compose project is already using host ports 3000 or 8080, keep that project
and its volumes untouched. Use one-off M3 Gateway/Web containers with alternate host ports while
retaining the Compose network aliases used by the Web app:

```powershell
docker compose --env-file .env -p aquaflow-m3-validation -f infra/compose/docker-compose.yml run `
  -d --no-deps --use-aliases --name aquaflow-m3-validation-gateway-alt `
  -p 127.0.0.1:18080:8080 gateway
docker compose --env-file .env -p aquaflow-m3-validation -f infra/compose/docker-compose.yml run `
  -d --no-deps --use-aliases --name aquaflow-m3-validation-web-alt `
  -p 127.0.0.1:13000:3000 web
```

This lets Web reach Gateway at `http://gateway:8080` within the isolated Compose network while
exposing the M3 smoke-test instances at `http://localhost:13000` and `http://localhost:18080`.
The default Compose port mappings remain unchanged.

## Docker Compose

Run from the project root:

```powershell
Copy-Item .env.example .env
# Set both database passwords and update the matching connection URLs.
# Generate local RS256 keys; copy the three JWT_* values from .env.jwt-keys into .env.
npm run generate:jwt-keys --workspace @aquaflow/auth
# Optional: set AUTH_SEED_ADMIN_EMAIL and AUTH_SEED_ADMIN_PASSWORD to create a local Admin.
# To seed one local identity for every role, set AUTH_SEED_LOCAL_IDENTITIES=true and provide
# distinct, at-least-16-character passwords and unique emails for all four roles in .env.
# This setting is rejected outside AUTH_NODE_ENV=development or test.
docker compose -f infra/compose/docker-compose.yml up --build
```

The root workflow scripts are:

```powershell
npm run dev
npm run dev:ps
npm test
npm run health
```

`npm run dev` builds and starts the stack as the separate `aquaflow-dev` Compose project; it
publishes Web on port 3000 and Gateway on 8080. Do not start it while another project owns those
ports. `npm run dev:down` stops that project without deleting its named volumes. `npm test` runs
the root Vitest suite, including Gateway and health-check tests. `npm run health` checks the
default public endpoints (`http://localhost:8080/healthz` and `http://localhost:3000/`). Override
them when using alternate ports without changing source:

```powershell
$env:GATEWAY_HEALTH_URL = "http://localhost:18080/healthz"
$env:WEB_HEALTH_URL = "http://localhost:13000/"
npm run health
```

The health command reports each endpoint's HTTP status or connection failure and returns a
non-zero exit code if either endpoint is unavailable or non-successful.

The key generator writes `.env.jwt-keys` at the project root and refuses to overwrite it. This file
contains private key material: do not commit or share it. Use a secret manager for deployed
environments. To prepare a new key pair without replacing the current local file, run
`npm run generate:jwt-keys --workspace @aquaflow/auth -- .env.jwt-keys.next`. For rotation, first
publish the new public JWK alongside the old JWK while leaving the old key active. After all
verifiers receive both keys, switch the signer to the new key ID and private key. Keep the old
public JWK published for at least the 15-minute access-token lifetime plus deployment skew, then
remove it. Logout revokes the supplied persisted refresh token; already issued stateless access
tokens remain valid until their 15-minute expiry.

When reusing an initialized Customer database volume, keep `POSTGRES_PASSWORD` and the password in
`CUSTOMER_DATABASE_URL` equal to the credentials used when that volume was created. Changing the
environment value alone does not change the stored PostgreSQL role password.

Compose starts separate PostgreSQL 16 databases for Customer and Auth, each with a health check and
its own named data volume. Redis 7 provides the Gateway's shared rate-limit store and is health
checked before Gateway starts; Redis is not published to the host and rate-limit counters are
intentionally ephemeral. Neither database is published to the host. Customer and Auth receive
their internal connection URLs through `CUSTOMER_DATABASE_URL` and `AUTH_DATABASE_URL`. Both
service images generate their Prisma clients during build and apply versioned migrations before
starting. Set
`CUSTOMER_SEED_DEMO=false` to skip the optional deterministic development dataset (3 zones,
60 customers, 75 accounts, and 80 meters). Keep the volume to retain local database data;
`docker compose down -v` deletes it.
The Customer and Auth readiness probes check their respective PostgreSQL databases; Compose waits
for both databases before starting those services, and then waits for healthy Customer, Auth, and
Redis dependencies before starting the Gateway. Customer and Auth apply their own Prisma migrations
as part of container startup after their database health checks pass. A Gateway without
`REDIS_URL` uses an in-process limiter for isolated development/tests; Compose always configures
Redis so limits are shared between Gateway instances. Auth stores users, seeded role records, refresh-session
digests, login events, and customer-account links in its own database. No administrator is created
unless both optional seed credentials are configured. Auth integration tests require a separate
database ending in `_test`, configured through `AUTH_INTEGRATION_DATABASE_URL`; the dedicated test
command applies its migration before running tests:

```powershell
$env:AUTH_INTEGRATION_DATABASE_URL = "postgresql://<user>:<password>@localhost:5432/auth_db_test?schema=public"
npm run test:integration --workspace @aquaflow/auth
```

Customer Service receives only `JWT_ISSUER` and `JWT_PUBLIC_KEYS_JSON`; it never receives the
Auth signing private key. Its customer/account/meter API routes require a valid RS256 bearer token.
The temporary M2 permission policy grants Admin full access and Billing Officer read-only access;
Customer and Meter Reader roles are denied until ownership and reader-assignment scoping are
implemented. `/healthz`, `/readyz`, and `/openapi.json` remain public operational endpoints.

For M2 customer registration, use the Admin identity to call
`POST /api/v1/customer-invitations` through the Gateway with `{ "customerId": "<existing UUID>" }`.
Auth confirms that the customer is active and retrieves every linked service account using the
Admin bearer token. The response includes the existing contact email and one 24-hour invitation
token, shown only once. Staff must verify the person's identity through their existing process and
deliver the token out of band to that existing contact. The public
`POST /api/v1/register` endpoint accepts that token and a password of at least 12 characters.
Successful redemption atomically marks the email verified, creates a Customer-role login, links
all of the customer's accounts, and consumes all pending invitations for that email. Only the
token hash is stored. The invitation is not sent by email in M2; outbound delivery is deferred to
the plan's M7 messaging work. Auth's `/api/v1/users` listing and staff-creation routes require an
Admin bearer token, and that route cannot create Customer identities directly.

Auth refresh tokens rotate on use and are grouped into families: reuse of a revoked token revokes
the remaining active tokens in that family. Login is blocked after five consecutive failures for a
normalized email within a rolling 15-minute window; successful login resets the consecutive-failure
count. See the [validation record](./validation-record.md) for exercised unit, integration, Compose,
and Gateway checks. The complete currently verified role matrix and known unrun gates are also
recorded there.

The Auth Service owns role and login/session rows. Customer and account IDs in its link table are
references to Customer Service-owned records and intentionally have no cross-database foreign keys.
The Customer Service exposes `/healthz`, `/readyz`, and the OpenAPI document at
`/openapi.json`. Structured request logging defaults to `LOG_LEVEL=info`; authorization and cookie
headers are redacted.

This starts the service stack and exposes the web app and gateway. The gateway serves as the
integration point for the domain services. Customer Service data is persisted in PostgreSQL.
Use local, non-production seed credentials and keep `.env` out of source control; the web app uses
the same values for its optional demo login.

## Notes

These services currently represent the working capstone foundation. Both the Compose and
Kubernetes configurations are for local development; they do not make the in-memory services
durable or production-ready.
