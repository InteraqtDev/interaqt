export * from './entities'
export * from './relations'
export * from './interactions'

import { User, Style, Version } from './entities'
import { UserStyleRelation, UserVersionRelation, StyleVersionRelation } from './relations'
// Import computed properties to add Count computations after entities and relations are defined
import './computedProperties'
import {
  CreateStyle,
  UpdateStyle,
  PublishStyle,
  OfflineStyle,
  ReorderStyles,
  CreateVersion,
  AddStyleToVersion,
  RemoveStyleFromVersion,
  PublishVersion,
  RollbackVersion,
  ArchiveVersion
} from './interactions'

export const entities = [User, Style, Version]
export const relations = [UserStyleRelation, UserVersionRelation, StyleVersionRelation]
export const activities = []
export const interactions = [
  CreateStyle,
  UpdateStyle,
  PublishStyle,
  OfflineStyle,
  ReorderStyles,
  CreateVersion,
  AddStyleToVersion,
  RemoveStyleFromVersion,
  PublishVersion,
  RollbackVersion,
  ArchiveVersion
]
export const dicts = []