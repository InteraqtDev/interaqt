import { Property } from './property';

/**
 * Relation types between entities
 */
export enum RelationType {
  OneToOne = 'OneToOne',
  OneToMany = 'OneToMany',
  ManyToMany = 'ManyToMany'
}

/**
 * Relation type representing associations between entities
 */
export type Relation = {
  name: string;
  type: RelationType;
  source: string;
  sourceProperty: string;
  target: string;
  targetProperty: string;
  properties?: Property[];
  computed?: Record<string, (...args: any[]) => any>;
}; 