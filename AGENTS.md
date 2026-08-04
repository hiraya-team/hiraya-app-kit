# Hiraya App Kit Agent Guide

Use Bun for installation, scripts, tests, builds, and packaging. Keep all three package versions synchronized and keep internal dependencies exact.

Published exports must point only to compiled ESM JavaScript and declarations in `dist`. Never publish raw TypeScript or add imports into the Hiraya frontend. Keep `@hiraya/app-cli`'s root archive API browser-importable; filesystem and path modules belong only to executable implementation files.

The archive validator is a security boundary. Preserve path normalization, ZIP limits, symlink rejection, local-only asset validation, deterministic timestamps, manifest validation, and existing security tests.

Theme contracts in `@hiraya/apps-contracts/theme` must remain environment-neutral. Keep frontend rendering, persistence, and other host policy out of this repository.

Before release, run `bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, `bun run lint`, `bun run build`, and `bun run pack:check`. Do not add Changesets or semantic-release unless release requirements materially change.
