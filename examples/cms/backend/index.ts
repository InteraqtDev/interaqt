import { User, Style, Version, ActiveStyle, PublishedStyle, DraftStyle } from './entities'
import { UserStyleRelation, UserVersionRelation } from './relations'
import { 
  CreateStyleInteraction, UpdateStyleInteraction, DeleteStyleInteraction,
  PublishStyleInteraction, UnpublishStyleInteraction, ReorderStylesInteraction,
  ListStylesInteraction, GetStyleInteraction, SearchStylesInteraction,
  CreateVersionInteraction, PublishVersionInteraction, RollbackVersionInteraction,
  ViewVersionHistoryInteraction
} from './interactions'
import { SystemStatsDict, CurrentVersionDict } from './dictionaries'

export const entities = [User, Style, Version, ActiveStyle, PublishedStyle, DraftStyle]
export const relations = [UserStyleRelation, UserVersionRelation]
export const activities = []
export const interactions = [
  CreateStyleInteraction, UpdateStyleInteraction, DeleteStyleInteraction,
  PublishStyleInteraction, UnpublishStyleInteraction, ReorderStylesInteraction,
  ListStylesInteraction, GetStyleInteraction, SearchStylesInteraction,
  CreateVersionInteraction, PublishVersionInteraction, RollbackVersionInteraction,
  ViewVersionHistoryInteraction
]
export const dicts = [SystemStatsDict, CurrentVersionDict]
