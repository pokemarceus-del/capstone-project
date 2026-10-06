# AquaFlow Capstone Project

This repository is the initial project scaffold for the AquaFlow water meter reading and billing system described in the development plan.

## Project goal

Build a secure, multi-service capstone application that supports:

- customer and staff identity management
- meter reading and validation
- billing and ledger logic
- payment processing and notifications
- staff portal, customer portal, and reader mobile workflows
- Kubernetes-ready deployment and observability

## Current status

The repository includes the core AquaFlow capstone structure and initial service implementations for the main domains:

1. customer + meter domain service
2. auth + JWT login service
3. reading + validation service
4. billing engine with tariff logic and required totals
5. payment and notification services
6. gateway proxy and local compose orchestration
7. Helm deployment baseline and non-root container hardening

The backend stores are currently in memory; this is a development/capstone foundation, not a
production-ready deployment. See the [project timeline](docs/project-timeline.md) for completed
milestones, validation results, limitations, and the recommended resume point.
See the [implementation roadmap](docs/implementation-roadmap.md) for the supplied plan's milestone
order, current status, acceptance gates, and next work queue.

## Quick run

From the repo root:

- npm install
- npm run lint
- npm run format:check
- npm run typecheck
- npm test
- npm run build --workspace=@aquaflow/web
- npm run dev --workspace=@aquaflow/customer
- npm run dev --workspace=@aquaflow/auth
- npm run dev --workspace=@aquaflow/reading
- npm run dev --workspace=@aquaflow/billing
- npm run dev --workspace=@aquaflow/payment
- npm run dev --workspace=@aquaflow/notification
- npm run dev --workspace=@aquaflow/gateway

Or use Docker Compose:

- cd infra/compose
- docker compose up --build

## Monorepo structure

- apps/web — Next.js staff/customer portal
- services/* — independent backend services
- packages/* — shared contracts and config
- infra/* — Docker Compose and Kubernetes setup
- docs/* — project documentation and ADRs
- tests/e2e — end-to-end validation

## Recommended stack

- TypeScript on Node.js
- Next.js + React + Tailwind CSS
- Fastify for backend services
- PostgreSQL per service
- Redis for cache, rate limiting, idempotency
- RabbitMQ for asynchronous messaging
- Docker Compose for local orchestration
- Helm + Argo CD for deployment
- Vitest + Supertest + Playwright + k6

## Notes

This scaffold intentionally keeps the architecture aligned to the AquaFlow roadmap rather than locking in a single simplified app. We will refine the exact MVP after your input.
