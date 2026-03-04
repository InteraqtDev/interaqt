import type { EntityIdRef } from '../System.js';

export type AggregateDataDeps = { main: EntityIdRef[] } & Record<string, unknown>;
export type IncrementalDataDeps = { _current: EntityIdRef } & Record<string, unknown>;
export type SourceDataDeps = { _source: EntityIdRef[] } & Record<string, unknown>;
