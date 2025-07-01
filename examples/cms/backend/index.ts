export * from './entities'
export * from './relations'
export * from './interactions'

import { User, Style, Version } from './entities'
import { UserStyleRelation, UserVersionRelation } from './relations'
import {
  CreateStyle,
  UpdateStyle,
  DeleteStyle,
  PublishStyle,
  UnpublishStyle,
  ListStylesAdmin,
  GetPublishedStyles,
  BulkUpdatePriorities,
  CreateVersion,
  ListVersions,
  RollbackToVersion,
  DeleteVersion,
  AdminLogin,
  ValidateAdminToken,
  CheckPermissions
} from './interactions'

// Export arrays for convenience
export const entities = [User, Style, Version]
export const relations = [UserStyleRelation, UserVersionRelation]
export const interactions = [
  CreateStyle,
  UpdateStyle,
  DeleteStyle,
  PublishStyle,
  UnpublishStyle,
  ListStylesAdmin,
  GetPublishedStyles,
  BulkUpdatePriorities,
  CreateVersion,
  ListVersions,
  RollbackToVersion,
  DeleteVersion,
  AdminLogin,
  ValidateAdminToken,
  CheckPermissions
]
export const activities = []
export const dicts = []