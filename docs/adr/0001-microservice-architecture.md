# ADR-0001: Adopt service-owned domains for the AquaFlow target architecture

- Status: Accepted as the target architecture; runtime implementation is incomplete.
- Date: 2026-10-06
- Source: `AquaFlow_Complete_Development_Plan.docx`, architecture and business requirements.

## Context

AquaFlow has distinct identity, customer/meter, reading, billing, payment, and notification
domains. The supplied plan requires independent service ownership, forbids cross-service database
reads, and calls for independently testable/deployable services. It also identifies the
operational and distributed-systems learning goals of a capstone.

## Decision

Use separate logical services for Auth, Customer, Reading, Billing, Payment, and Notification,
with a Gateway as the public API entry point and a Next.js application as the web/BFF surface.
Each service owns its persistence and schema. Begin with synchronous HTTP where a response is
needed; introduce RabbitMQ for domain events with a transactional outbox and consumer inbox before
using events for critical financial side effects.

The repository already contains initial service packages and a gateway. This ADR describes the
intended boundaries; it does not assert that persistence, authorization, messaging, or deployment
is production-ready.

## Alternatives considered

- **Single modular monolith:** simpler local development and transactions, but does not satisfy the
  explicit service ownership and distributed-systems goals in the supplied capstone plan.
- **Shared database across independently deployed services:** reduces setup cost but couples
  schemas and permits forbidden cross-service table access.
- **Microservices with a shared database:** preserves separate processes but not independent data
  ownership, so it is not an acceptable compromise.

## Consequences

- Each service requires explicit contracts, independent tests, configuration, migrations, and
  operational ownership.
- Cross-service workflows require APIs or reliable events; distributed transactions are avoided.
- Payment-to-ledger effects and other retryable mutations must be idempotent.
- More deployment and observability complexity is accepted to match the requested architecture.
- Implementation proceeds in milestone order; a working Compose-backed application precedes
  Kubernetes/GitOps work.

## Follow-up

- Document each service's data ownership and APIs as they are implemented.
- Record separate ADRs for reading-to-customer integration, event contracts, money/rounding rules,
  and deployment decisions where the plan leaves choices open.
