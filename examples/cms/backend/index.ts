export * from './entities'
export * from './relations'
export * from './interactions'

import { User, Style, Version } from './entities'
import { UserStyleCreatedByRelation, UserStyleUpdatedByRelation, UserVersionRelation, StyleVersionRelation } from './relations'
import { 
  CreateStyle, UpdateStyle, UpdateStyleStatus, DeleteStyle, ListStyles, GetStyleDetail, UpdateStylePriorities, SearchStyles,
  CreateVersion, PublishVersion, RollbackVersion, ListVersions, GetVersionDetail
} from './interactions'

export const entities = [User, Style, Version]
export const relations = [UserStyleCreatedByRelation, UserStyleUpdatedByRelation, UserVersionRelation, StyleVersionRelation]
export const interactions = [
  CreateStyle, UpdateStyle, UpdateStyleStatus, DeleteStyle, ListStyles, GetStyleDetail, UpdateStylePriorities, SearchStyles,
  CreateVersion, PublishVersion, RollbackVersion, ListVersions, GetVersionDetail
]
export const activities = []
export const dicts = []