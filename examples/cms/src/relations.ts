import { Relation } from 'interaqt';
import { User, Style, Version } from './entities.js';

// User-Style relationship for tracking who created what
export const UserStyleRelation = Relation.create({
  source: Style,
  sourceProperty: 'createdBy',
  target: User,
  targetProperty: 'styles',
  type: 'n:1'
});

// User-Version relationship for tracking who created versions
export const UserVersionRelation = Relation.create({
  source: Version,
  sourceProperty: 'createdBy',
  target: User,
  targetProperty: 'versions',
  type: 'n:1'
});

export const relations = [UserStyleRelation, UserVersionRelation];