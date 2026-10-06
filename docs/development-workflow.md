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
