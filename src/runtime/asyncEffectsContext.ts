import { AsyncLocalStorage } from 'async_hooks';
import { RecordMutationEvent } from './System.js';

export interface EffectsContext {
  effects: RecordMutationEvent[];
}

export const asyncEffectsContext = new AsyncLocalStorage<EffectsContext>();

/**
 * Get the current effects array from the async context
 */
export function getCurrentEffects(): RecordMutationEvent[] | undefined {
  const context = asyncEffectsContext.getStore();
  return context?.effects;
}

/**
 * Add mutation events to the current effects context
 */
export function addToCurrentEffects(events: RecordMutationEvent[]): void {
  const context = asyncEffectsContext.getStore();
  if (context?.effects) {
    context.effects.push(...events);
  }
}
