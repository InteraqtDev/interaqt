import { Property } from './property';

export type { Property };

/**
 * Entity type representing domain objects with their own identity
 */
export type Entity = {
  name: string;
  properties: Property[];
  computed?: Record<string, (...args: any[]) => any>;
}; 