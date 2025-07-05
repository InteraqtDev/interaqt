// Export all entities
export * from './entities'

// Export all relations  
export * from './relations'

// Export all interactions
export * from './interactions'

// Import for arrays
import { User, Style, Version, StyleVersion } from './entities'
import { 
  UserCreatedStyleRelation, 
  UserUpdatedStyleRelation, 
  UserVersionRelation,
  StyleStyleVersionRelation,
  VersionStyleVersionRelation 
} from './relations'
import { 
  CreateStyle, 
  UpdateStyle, 
  PublishStyle, 
  UnpublishStyle, 
  DeleteStyle, 
  ReorderStyles,
  CreateVersion, 
  PublishVersion, 
  AddStyleToVersion, 
  RemoveStyleFromVersion, 
  ReorderStylesInVersion 
} from './interactions'

// Export arrays for convenience
export const entities = [User, Style, Version, StyleVersion]
export const relations = [
  UserCreatedStyleRelation,
  UserUpdatedStyleRelation,
  UserVersionRelation,
  StyleStyleVersionRelation,
  VersionStyleVersionRelation
]
export const interactions = [
  CreateStyle,
  UpdateStyle,
  PublishStyle,
  UnpublishStyle,
  DeleteStyle,
  ReorderStyles,
  CreateVersion,
  PublishVersion,
  AddStyleToVersion,
  RemoveStyleFromVersion,
  ReorderStylesInVersion
]
export const activities = []
export const dicts = []
