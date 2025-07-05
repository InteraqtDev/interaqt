export * from './UserStyleRelation';
export * from './StyleVersionRelation';
export * from './UserVersionRelation';

import { UserStyleRelation } from './UserStyleRelation';
import { StyleVersionRelation } from './StyleVersionRelation';
import { UserVersionRelation } from './UserVersionRelation';

export const relations = [
  UserStyleRelation,
  StyleVersionRelation,
  UserVersionRelation
]; 