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

## Docker Compose

Run from the project root:

```bash
Copy-Item .env.example .env
# Replace POSTGRES_PASSWORD and update its password in CUSTOMER_DATABASE_URL.
# Set JWT_SECRET in .env to a random value of at least 32 bytes.
# Optionally set AUTH_SEED_ADMIN_EMAIL and AUTH_SEED_ADMIN_PASSWORD to create a local admin.
docker compose -f infra/compose/docker-compose.yml up --build
```

Compose starts PostgreSQL 16 with a health check and a named `customer_postgres_data` volume.
PostgreSQL is not published to the host; the Customer Service receives its internal connection URL
through `CUSTOMER_DATABASE_URL`. The Customer Service image generates the Prisma client during
build and applies versioned migrations with `prisma migrate deploy` before starting. Set
`CUSTOMER_SEED_DEMO=false` to skip the optional deterministic development dataset (3 zones,
60 customers, 75 accounts, and 80 meters). Keep the volume to retain local database data;
`docker compose down -v` deletes it.
The Customer Service readiness probe checks PostgreSQL; Compose waits for it before starting the
Gateway. The Customer Service exposes `/healthz`, `/readyz`, and the OpenAPI document at
`/openapi.json`. Structured request logging defaults to `LOG_LEVEL=info`; authorization and cookie
headers are redacted.

This starts the service stack and exposes the web app and gateway. The gateway serves as the
integration point for the domain services. Customer Service data is persisted in PostgreSQL.
No administrator is created unless both optional seed credentials are configured. Use local,
non-production credentials and keep `.env` out of source control; the web app uses the same values
for its optional demo login.

## Notes

These services currently represent the working capstone foundation. Both the Compose and
Kubernetes configurations are for local development; they do not make the in-memory services
durable or production-ready.
