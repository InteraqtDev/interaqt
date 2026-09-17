# Migration must rebuild requested bound state alongside output

A StateMachine migration that renamed its internal state converted its public output successfully, but the next Interaction returned success without changing that output. The persisted currentState still named the old state, so TransitionFinder found no outgoing transition.

MigrationScheduler called rebuildStateDefaults only when rebuildState was true and rebuildOutput was false. Plans requesting both therefore omitted state rebuilding. The fix independently honors rebuildState, then skips output work only for state-only plans. It uses the existing property/global bound-state implementation and remains inside the existing migration transaction and simulation rollback boundaries.

The class has two storage readers: RecordBoundState and GlobalBoundState. The new test matrix covers both, with state rename and unchanged-state controls and a fresh-schema control. It runs actual migrate and dispatch against PGLite; no state-machine double or output-only oracle is used. The old implementation fails both rename rows (2 failed, 3 passed); the fix passes all five. These tests do not establish real PostgreSQL concurrency or crash behavior.

Existing migration tests verified rebuilt outputs but did not combine a state-name change with a subsequent interaction. The testing dimension registry now requires that post-migration observation. Scope stays at the migration scheduler; no application mode names, compatibility states, or repair heuristics enter production code.

Validation: migrationStateRebuild, migration, migrationGenerativeFuzz and migrationDestructiveFuzz: 146 passed. npm run check and npm run build passed. Downstream Mesh's migration regression and durable request-context contracts: 14 passed using a validation-only alias to the built candidate. The released dependency was not modified. Real PostgreSQL migration validation and maintainer release remain required before downstream rollout.
