# Security audit and authorization matrix

This document records the implemented M2 item 6 security events and endpoint permissions.
Customer and Meter Reader access remains intentionally restricted until customer ownership and
reader route-assignment scoping are implemented.

## Auth Service endpoint policy

| Method | Endpoint                                                                 | Access                                                 |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| GET    | `/healthz`, `/readyz`, `/api/v1/info`, `/.well-known/jwks.json`          | Public                                                 |
| POST   | `/api/v1/login`, `/api/v1/refresh`, `/api/v1/logout`, `/api/v1/register` | Public; request validation and token rules still apply |
| GET    | `/api/v1/me`                                                             | Any authenticated role                                 |
| GET    | `/api/v1/users`, `/api/v1/audit-events`                                  | Admin only                                             |
| POST   | `/api/v1/users`, `/api/v1/customer-invitations`                          | Admin only                                             |

Missing or invalid credentials receive HTTP 401 on Admin-only routes. A valid non-Admin receives
HTTP 403. The audit-events endpoint returns the newest 50 events by default and accepts a bounded `limit`
from 1 through 100.

## Customer Service endpoint policy

`GET /healthz`, `GET /readyz`, and `GET /openapi.json` are public. Every other route requires a
valid bearer access token.

| Method    | Endpoint                      | Admin | Billing Officer | Customer | Meter Reader |
| --------- | ----------------------------- | ----- | --------------- | -------- | ------------ |
| GET       | `/api/v1/info`                | Allow | Allow           | Deny     | Deny         |
| GET, POST | `/api/v1/customers`           | Allow | GET only        | Deny     | Deny         |
| GET       | `/api/v1/customers/:id`       | Allow | Allow           | Deny     | Deny         |
| GET, POST | `/api/v1/accounts`            | Allow | GET only        | Deny     | Deny         |
| PATCH     | `/api/v1/accounts/:id/status` | Allow | Deny            | Deny     | Deny         |
| GET       | `/api/v1/accounts/:id/meters` | Allow | Allow           | Deny     | Deny         |
| GET       | `/api/v1/meters`              | Allow | Allow           | Deny     | Deny         |
| POST      | `/api/v1/meters/install`      | Allow | Deny            | Deny     | Deny         |
| POST      | `/api/v1/meters/replace`      | Allow | Deny            | Deny     | Deny         |

HEAD requests follow GET permissions for routes that support GET. Unsupported methods and
unlisted business routes are denied by the policy helper. The unit test exercises every declared
route against all roles and common HTTP methods; the PostgreSQL HTTP integration test exercises
each implemented method and role.

## Durable Auth audit events

Events are persisted in the Auth database with an action, outcome, optional actor user ID, optional
target type/ID, and creation timestamp. Actor IDs are retained as scalar identifiers so audit
records remain attributable if a user record is later removed. Audit rows do not store passwords,
access/refresh tokens, invitation codes, token hashes, email addresses, IP addresses, or user-agent
strings.

| Action                                                                 | Outcomes captured                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `auth.login.succeeded`, `auth.login.failed`                            | Successful and failed password login attempts                                  |
| `auth.login.locked`                                                    | Login attempts rejected by the lockout threshold                               |
| `auth.refresh.rotated`, `auth.refresh.reused`, `auth.refresh.rejected` | Refresh rotation and rejected/replayed tokens                                  |
| `auth.logout.completed`                                                | Logout, including idempotent logout for an unknown token                       |
| `auth.admin_endpoint.denied`                                           | Missing/invalid credentials or non-Admin access to an Admin-only Auth endpoint |
| `auth.user_directory.read`, `auth.audit_events.read`                   | Admin reads of sensitive Auth directories                                      |
| `auth.staff_user.created`                                              | Admin staff-user provisioning                                                  |
| `customer.registration.invitation.issued`                              | Admin invitation issuance                                                      |
| `customer.registration.completed`, `customer.registration.rejected`    | Successful or rejected invitation redemption                                   |

Login throttling continues to use the existing `login_events` table, which stores normalized email
addresses alongside the attempt outcome. The new security audit rows do not duplicate that email.
Creation of a staff user, invitation, or registered customer and its corresponding success audit
event occur in the same database transaction.

Customer Service emits structured warning logs for HTTP 401/403 responses, with the route, method,
and status but no bearer token. Those service-level denials are not copied to the Auth database;
central log retention/export and audit-record retention have not yet been configured.
