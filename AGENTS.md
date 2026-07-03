# AGENTS.md

## Cursor Cloud specific instructions

interaqt is a TypeScript library (a declarative reactive backend framework), not a
runnable server/UI app. "Running it" means executing the framework via tests or a
small script; there is no dev server. Standard commands live in `package.json`
scripts and the `README.md` "Development" section — use those.

- Package manager is npm. There is **no committed lockfile** (`package-lock.json`
  is gitignored), so installs resolve fresh each time.
- `npm install` fails with `ERESOLVE` because `@release-it/conventional-changelog`
  (release-only tooling) wants `release-it@^17` while the repo pins `release-it@^19`.
  Install with `npm install --legacy-peer-deps`. This does not affect
  lint/test/build/runtime, which do not use release-it.
- Type-check (this repo's "lint"): `npm run check:all` (per-layer tsc). Build:
  `npm run build` (Vite → `dist/`, then a prod tsc check). Tests: `npm test`
  (Vitest). See `package.json` for scoped variants (`test:runtime`, `test:storage`,
  `test:core`, `test:builtins`).
- Tests use in-memory drivers (`PGLiteDB` / `SQLiteDB` from `@drivers`), so no
  external database is required. PostgreSQL-specific tests are gated behind the
  `INTERAQT_POSTGRES_DATABASE` env var and are skipped without it.
- Flaky-timeout gotcha: the full suite occasionally reports one failure —
  `tests/runtime/migration.spec.ts > ... "approved changed and unchanged decisions
  control built-in global aggregate rebuilds"`. It genuinely runs ~5.5s and can
  exceed Vitest's default 5s timeout on loaded VMs. It is not a real failure;
  re-run with a larger timeout, e.g.
  `npx vitest run tests/runtime/migration.spec.ts -t "approved changed and unchanged decisions control built-in global aggregate rebuilds" --testTimeout=60000`.
- To smoke-test the framework end-to-end without the test runner, write a short
  `tsx` script that imports from `./src/index.js` and `./src/drivers/index.js`
  (e.g. `MonoSystem` + `PGLiteDB` + a `Controller`), and polyfill
  `globalThis.crypto` from `node:crypto` at the top (mirrors
  `scripts/vitest.setup.js`) since UUID generation needs it in plain Node.
