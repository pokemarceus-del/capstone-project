# AquaFlow assumptions and unresolved questions

This document separates decisions explicitly made by the supplied development plan from details
that remain unresolved. Do not silently turn an open question into a production business rule.

## Working assumptions from the plan

- The initial target has four roles: Admin, Billing Officer, Meter Reader, and Customer.
- Residential tariff examples are denominated in dollars and use the supplied tier rates, fees,
  VAT, and stated acceptance totals.
- The 37 m3 example includes $500 arrears and the supplied 10% overdue penalty in its expected
  total; penalty timing and eligibility still need a precise domain rule.
- A bill is immutable after issue. Corrections are new, authorized adjustments.
- Each backend service owns its data store; services must not read another service's tables.
- HTTP is the initial synchronous request/response integration mechanism; RabbitMQ with an
  outbox/inbox pattern is the intended asynchronous mechanism.
- Auth and Customer now use service-owned PostgreSQL databases; remaining in-memory stores are
  scaffolding only. Production-like behavior requires durable persistence and safe migrations
  before relying on restart, concurrency, or multiple replicas.

## Resolved decisions

- **2026-10-07 — customer self-registration verification (user decision):** An Admin issues a
  24-hour, single-use invitation for an active, existing Customer Service customer. Auth verifies
  the customer record and loads all associated accounts through the Admin-authorized Customer API.
  Staff must verify the person's identity through their existing process and deliver the
  invitation out of band to the contact already on file; redeeming it proves access to that
  contact, creates a verified Customer identity, and links the accounts atomically. Only the
  invitation-token hash is persisted. Email delivery remains deferred to the planned M7 messaging
  work; this decision does not authorize signup using user-supplied account details alone.

## Questions to resolve before the affected feature is treated as complete

1. What currency and locale should production bills use? The examples use `$` but do not name a
   currency or jurisdiction.
2. What exact rounding mode and rounding point apply to each bill line and final total?
3. How is a late penalty assessed: on overdue principal, all unpaid charges, or another balance;
   is it compounded; and how are partial payments handled?
4. What is the maximum register value for each meter, and what evidence distinguishes a rollover
   from a meter replacement or bad reading?
5. What fractional precision should meter registers accept, and how should displays round it?
6. What is the approved consumption formula across meter replacement, including replacement
   readings captured on different dates?
7. What is the route assignment source of truth, and how are reassignment and overlapping route
   periods handled?
8. What tariff values apply to Commercial, Industrial, and Government classifications? The plan
   says these values must be configurable rather than invented in code.
9. Which event delivery guarantees and retry/DLQ limits should be configured per event type?
10. Which development environment and cluster tooling will be used for Docker, kind, Helm, and
    kubectl validation?

## Decisions policy

Resolve a question in the relevant ADR or business-rule specification before implementing behavior
that depends on it. Record the selected answer, owner, date, and any impact on existing data or APIs.
