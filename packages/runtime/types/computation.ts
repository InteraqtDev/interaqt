import { Interaction } from './interaction';

/**
 * Common computation parameters
 */
export type ComputationBase = {
  source: any; // Any collection or alias
  sourceAttributeQuery?: any;
  dependencies?: any[];
};

/**
 * Map transforms each element in a collection
 */
export type MapComputation = ComputationBase & {
  callback: (item: any, index: number) => any;
};

/**
 * WeightedSummation calculates a weighted sum across a collection
 */
export type WeightedSummationComputation = ComputationBase & {
  callback: (item: any) => { weight: number; value: number };
};

/**
 * Reduce reduces a collection to a single value
 */
export type ReduceComputation = ComputationBase & {
  callback: (accumulator: any, item: any) => any;
  initialValue?: any;
};

/**
 * Every/Any tests whether all/any elements satisfy a condition
 */
export type EveryComputation = ComputationBase & {
  callback: (item: any) => boolean;
};

export type AnyComputation = EveryComputation;

/**
 * FindOne finds the first element matching a condition
 */
export type FindOneComputation = ComputationBase & {
  callback: (item: any) => boolean;
};

/**
 * Transfer defines a state transition
 */
export type Transfer = {
  trigger: Interaction;
  from: string;
  to: string;
  target?: any; // Computed target entity
};

/**
 * State defines a possible state
 */
export type StateMachineState = {
  name: string;
  callback: (triggerInteraction: Interaction) => any;
};

/**
 * StateMachine coordinates states and transitions
 */
export type StateMachine = {
  defaultState: string;
  defaultValue: any;
  states: StateMachineState[];
  transfers: Transfer[];
};

/**
 * Custom computation logic
 */
export type CustomComputed = {
  dependencies: any[];
  compute: (...args: any[]) => any;
};

/**
 * Order specification for slices
 */
export type Order = {
  field: string;
  type: 'asc' | 'desc';
};

/**
 * Slice creates a window into a collection
 */
export type Slice = {
  orders: Order[];
  start?: number;
  end?: number;
};

/**
 * Map associates keys with values in a collection
 */
export type MapCollection = {
  key: string | ((item: any) => string);
}; 