/**
 * Core type definitions
 */

import type { EntityInstance } from './Entity';
import type { RelationInstance } from './Relation';
import type { PropertyInstance } from './Property';
import type { EventSourceInstance } from './EventSource';
import type { CountInstance } from './Count';
import type { SummationInstance } from './Summation';
import type { AverageInstance } from './Average';
import type { WeightedSummationInstance } from './WeightedSummation';
import type { EveryInstance } from './Every';
import type { AnyInstance } from './Any';
import type { TransformInstance } from './Transform';
import type { StateMachineInstance } from './StateMachine';
import type { RealTimeInstance } from './RealTime';
import type { DictionaryInstance } from './RealDictionary';
import { CustomInstance } from './Custom';

export type {
  EntityInstance,
  RelationInstance,
  PropertyInstance,
  EventSourceInstance,
  CountInstance,
  SummationInstance,
  AverageInstance,
  WeightedSummationInstance,
  EveryInstance,
  AnyInstance,
  TransformInstance,
  StateMachineInstance,
  RealTimeInstance,
  DictionaryInstance
};

/**
 * Union type of all computation instances
 */
export type ComputationInstance = 
  | CountInstance 
  | SummationInstance 
  | AverageInstance 
  | WeightedSummationInstance 
  | EveryInstance 
  | AnyInstance 
  | TransformInstance 
  | StateMachineInstance 
  | RealTimeInstance
  | CustomInstance;

/**
 * Record type that can be used in computations.
 * Any named record source: Entity or Relation.
 */
export type ComputationRecord = 
  | EntityInstance 
  | RelationInstance;

/**
 * Attribute query data structure
 * Compatible with storage/erstorage/AttributeQuery.ts
 */
export type AttributeQueryDataRecordItem = [string, RecordQueryData, boolean?];
export type AttributeQueryDataItem = string | AttributeQueryDataRecordItem;
export type AttributeQueryData = AttributeQueryDataItem[];

// RecordQueryData interface from storage
export interface RecordQueryData {
  attributeQuery?: AttributeQueryData;
  [key: string]: unknown;
}

/**
 * User role type
 */
export interface UserRoleType {
  roles: string[];
  [key: string]: unknown;
}

/**
 * Data dependencies type
 */
export type DataDependencies = Record<string, unknown>;