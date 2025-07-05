import { Relation } from 'interaqt';
import { User } from '../entities/User';
import { Style } from '../entities/Style';

export const UserStyleRelation = Relation.create({
  source: Style,
  sourceProperty: 'lastModifiedBy',
  target: User,
  targetProperty: 'modifiedStyles',
  type: 'n:1'
}); 