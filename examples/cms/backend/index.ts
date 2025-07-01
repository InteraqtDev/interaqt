export * from './entities'
export * from './relations'
export * from './interactions'

import { User, Style, Version } from './entities'
import { StyleUserRelation, VersionUserRelation, StyleVersionRelation } from './relations'
import {
  CreateStyle, UpdateStyle, DeleteStyle, UpdateStyleStatus, UpdateStylePriority, BatchUpdateStyles,
  GetStyleList, GetStyleDetail, SearchStyles,
  CreateVersion, UpdateVersion, DeleteVersion, PublishVersion, ArchiveVersion, RollbackVersion,
  GetVersionList, GetVersionDetail, CompareVersions, AddStyleToVersion, RemoveStyleFromVersion,
  UpdateStyleOrderInVersion,
  CreateUser, UpdateUser, DeleteUser, GetUserList, GetCurrentUser, UpdateProfile
} from './interactions'

export const entities = [User, Style, Version]
export const relations = [StyleUserRelation, VersionUserRelation, StyleVersionRelation]
export const interactions = [
  CreateStyle, UpdateStyle, DeleteStyle, UpdateStyleStatus, UpdateStylePriority, BatchUpdateStyles,
  GetStyleList, GetStyleDetail, SearchStyles,
  CreateVersion, UpdateVersion, DeleteVersion, PublishVersion, ArchiveVersion, RollbackVersion,
  GetVersionList, GetVersionDetail, CompareVersions, AddStyleToVersion, RemoveStyleFromVersion,
  UpdateStyleOrderInVersion,
  CreateUser, UpdateUser, DeleteUser, GetUserList, GetCurrentUser, UpdateProfile
]
export const activities = []
export const dicts = []