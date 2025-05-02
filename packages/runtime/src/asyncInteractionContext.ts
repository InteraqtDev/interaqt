import { AsyncLocalStorage } from 'async_hooks';

export const asyncInteractionContext = new AsyncLocalStorage();
