export * from './entities'
export * from './relations'
export * from './interactions'

// Import computations to initialize them
import './computations'

// Export arrays for convenience
import { User, Version, Style } from './entities'
import { StyleVersionRelation, UserStylesRelation, UserVersionsRelation } from './relations'
import {
  CreateStyleInteraction,
  UpdateStyleInteraction,
  PublishStyleInteraction,
  OfflineStyleInteraction,
  DeleteStyleInteraction,
  ReorderStylesInteraction,
  BatchUpdatePriorityInteraction,
  CreateVersionInteraction,
  PublishVersionInteraction,
  RollbackVersionInteraction,
  GetStylesByStatusInteraction,
  GetStylesByTypeInteraction,
  SearchStylesInteraction,
  GetVersionStatsInteraction
} from './interactions'

export const entities = [User, Version, Style]

export const relations = [
  StyleVersionRelation,
  UserStylesRelation,
  UserVersionsRelation
]

export const interactions = [
  CreateStyleInteraction,
  UpdateStyleInteraction,
  PublishStyleInteraction,
  OfflineStyleInteraction,
  DeleteStyleInteraction,
  ReorderStylesInteraction,
  BatchUpdatePriorityInteraction,
  CreateVersionInteraction,
  PublishVersionInteraction,
  RollbackVersionInteraction,
  GetStylesByStatusInteraction,
  GetStylesByTypeInteraction,
  SearchStylesInteraction,
  GetVersionStatsInteraction
]

export const activities = []
export const dicts = []