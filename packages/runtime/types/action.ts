/**
 * Base Action interface
 */
export interface Action {
  type: string;
  execute: (...args: any[]) => Promise<any>;
}

/**
 * Flow definition between actions
 */
export type Flow = {
  from: Action;
  to: Action;
};

/**
 * Scheduler types
 */
export enum SchedulerType {
  Sequential = 'Sequential',
  Parallel = 'Parallel',
  Conditional = 'Conditional'
}

/**
 * Scheduler coordinates the execution of multiple actions
 */
export interface Scheduler extends Action {
  type: SchedulerType;
  actions: Array<Action | Scheduler>;
  rootAction: Action;
  flows: Flow[];
} 