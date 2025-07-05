import { Relation } from 'interaqt';
import { User } from '../entities/User';
import { Version } from '../entities/Version';

export const UserVersionRelation = Relation.create({
  source: Version,
  sourceProperty: 'publishedBy',
  target: User,
  targetProperty: 'publishedVersions',
  type: 'n:1'
}); 