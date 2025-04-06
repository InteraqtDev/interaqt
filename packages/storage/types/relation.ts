import { Entity } from './entity';
import { Property } from './property';

/**
 * Relation types between entities
 */
export enum RelationType {
  OneToOne = '1:1',
  OneToMany = '1:n',
  ManyToMany = 'n:n',
  ManyToOne = 'n:1',
}

/**
 * Relation type representing associations between entities
 */
export type Relation = {
  name?: string;
  type: RelationType;
  source: Relation|Entity;
  sourceProperty: string;
  target: Relation|Entity;
  targetProperty: string;
  properties: Property[];
  computed?: Record<string, (...args: any[]) => any>;
  isTargetReliance?: boolean;
}; 