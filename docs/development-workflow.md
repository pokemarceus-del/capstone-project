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

The local Git repository has been initialized on `main`. No baseline commit has been created, so
the project files currently appear as untracked content. Review the full status and `.gitignore`
before creating the first commit; in particular, never stage `.env` files, secrets, generated
artifacts, or user data.
