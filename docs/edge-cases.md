# AquaFlow domain edge cases

These cases are discovery requirements from milestone M0. The outcomes below identify safe
invariants; unresolved tariff and meter configuration must be decided before production behavior
is finalized.

## Meter replacement

- Retain the old meter and its installation interval; replacement must not overwrite history.
- Record the old meter's final register and the new meter's initial register with timestamps,
  actor, reason, and both meter IDs.
- Enforce at most one active meter per service account, including concurrent installation attempts.
- Reject replacement when the account or old meter does not exist, the old meter is not active, or
  the new serial number is already registered.
- Do not calculate consumption by subtracting readings from different meters. Compute usage on
  each installation interval using that meter's own register.
- If an old meter rolled over, compute consumption only when its configured maximum register value
  is known and the evidence is consistent. The maximum-register rule is unresolved in
  `assumptions-and-questions.md`.
- Require review when dates overlap, readings decrease without a configured rollover/replacement,
  the replacement is backdated, or the old final register is less than its prior accepted reading.
- A retried replacement request must not create another active meter or duplicate history.

## Duplicate payments and retries

- A repeated client request with the same idempotency key and same payment intent returns the
  original payment result; it must not create a second payment or ledger credit.
- Reuse of the same key with a different account, amount, currency, or intent must return a
  conflict rather than silently returning or mutating the first result.
- Deduplicate provider webhooks by the provider's stable event ID and verify authenticity before
  applying a payment state transition.
- Concurrent webhook delivery and client retries must result in at most one confirmation and one
  ledger credit.
- A repeated notification or event delivery must not repeat irreversible financial side effects;
  use a durable inbox/processed-event record and transactionally safe ledger operation.
- Preserve pending, failed, confirmed, and (if supported) refunded states; reject invalid or
  regressive transitions and audit every accepted transition.
- Keep provider references and receipts auditable without storing sensitive payment credentials.
- Clarify partial payments, refunds, overpayments, and idempotency retention periods before
  production deployment.
