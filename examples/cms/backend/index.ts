import { Controller } from '@interaqt/runtime'
import { Style, Version, User } from './entities'
import { StyleVersionRelation, UserVersionRelation } from './relations'
import {
  TotalStylesCount,
  PublishedStylesCount,
  DraftStylesCount,
  OfflineStylesCount,
  StylesByTypeCount,
  MaxStylePriority,
  MinStylePriority,
  StyleStatusStateMachine,
  CurrentVersionCount
} from './computations'
import {
  CreateStyleInteraction,
  UpdateStyleInteraction,
  UpdateStyleStatusInteraction,
  DeleteStyleInteraction,
  ReorderStylesInteraction,
  BulkCreateStylesInteraction,
  CreateVersionInteraction,
  RollbackToVersionInteraction,
  PublishStyleInteraction,
  TakeStyleOfflineInteraction,
  CreateUserInteraction
} from './interactions'

export const controller = Controller.create({
  entities: [Style, Version, User],
  relations: [StyleVersionRelation, UserVersionRelation],
  computations: [
    TotalStylesCount,
    PublishedStylesCount,
    DraftStylesCount,
    OfflineStylesCount,
    StylesByTypeCount,
    MaxStylePriority,
    MinStylePriority,
    StyleStatusStateMachine,
    CurrentVersionCount
  ],
  interactions: [
    CreateStyleInteraction,
    UpdateStyleInteraction,
    UpdateStyleStatusInteraction,
    DeleteStyleInteraction,
    ReorderStylesInteraction,
    BulkCreateStylesInteraction,
    CreateVersionInteraction,
    RollbackToVersionInteraction,
    PublishStyleInteraction,
    TakeStyleOfflineInteraction,
    CreateUserInteraction
  ]
})

export * from './entities'
export * from './relations'
export * from './computations'
export * from './interactions'