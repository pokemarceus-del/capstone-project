# AquaFlow development workflow

This policy is for the local project repository. Hosting-provider branch protection and CI
enforcement can be enabled in milestone M9 once a remote repository and automated checks exist.

## Branches

- `main` is the stable integration branch.
- Create short-lived branches named `feature/<scope>`, `fix/<scope>`, or `docs/<scope>`.
- Do not commit secrets, local environment files, generated build output, or real customer data.
- Merge work only after the relevant build and tests pass; M9 will automate these checks.

## Commits

- Use Conventional Commit prefixes: `feat`, `fix`, `docs`, `test`, `build`, `ci`, or `chore`.
- Keep each commit focused on one logical change and describe the user-visible or operational
  effect.
- Do not rewrite shared history; coordinate before changing branch policy.

## Current repository state

The initial project baseline is committed on `main`. M1 is not considered complete until the
committed state passes its clean-clone build and test gate. Keep `.env` files, secrets, generated
artifacts, and user data out of commits.
The M1 gate passed from a fresh clone at `94d20b4`: unit and PostgreSQL integration tests,
workspace typechecks, lint, format checks, all Compose image builds, service health, and web/API
smoke checks succeeded.

After `npm ci`, Prisma Client generation is wired into the Customer Service's test, integration
test, build, typecheck, and development commands. The root unit-test command also generates it
before running tests. `.gitattributes` keeps text files on LF line endings across platforms so
Prettier checks behave consistently on Windows and Unix.

Root scripts provide the repeatable project entry points: `npm run dev` builds and starts the
Compose stack under the isolated `aquaflow-dev` project name, `npm test` runs the root Vitest suite,
and `npm run health` checks the host Gateway and Web endpoints. Use `GATEWAY_HEALTH_URL` and
`WEB_HEALTH_URL` to target alternate host ports. `npm run dev:down` stops only `aquaflow-dev`
containers and preserves its named volumes. The Compose stack requires the local settings described
in `local-stack.md`; never commit `.env` or key material.

M2 items 1–6 are committed at `1e4763f`; Checkpoint B was approved on 2026-10-07. Auth and
Customer share the RS256/JWKS verifier; Customer route permissions follow the interim policy
recorded in `implementation-roadmap.md`. Customer registration uses the Admin-issued, single-use
invitation decision recorded in `assumptions-and-questions.md`. Durable Auth security audit events
and the complete role-by-endpoint tests are recorded in `security-authorization-matrix.md`. M3
items 1–4 are complete and committed at `c5af826`: the Gateway routes, JWT pre-check,
request/correlation IDs, controlled errors, CORS, timeouts, Redis-backed distributed rate limiting,
and health-aware Redis Compose startup are implemented. A clean clone passed `npm ci`, the root
test suite (44 passed; 19 database-dependent skips), lint, typechecks, and formatting. All eight
images built, the isolated full Compose stack started, and Gateway/Web returned HTTP 200. The
pre-existing M2 project owns 3000/8080, so the clean-clone smoke used temporary alternate ports.
Keep `.env`,
`.env.jwt-keys`, and private signing keys out of commits.
