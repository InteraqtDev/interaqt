import { Interaction, Action } from '@'

// Define basic actions
export const CreateStyleAction = Action.create({ name: 'createStyle' })
export const UpdateStyleAction = Action.create({ name: 'updateStyle' })
export const PublishStyleAction = Action.create({ name: 'publishStyle' })
export const OfflineStyleAction = Action.create({ name: 'offlineStyle' })
export const DeleteStyleAction = Action.create({ name: 'deleteStyle' })

export const ReorderStylesAction = Action.create({ name: 'reorderStyles' })
export const BatchUpdatePriorityAction = Action.create({ name: 'batchUpdatePriority' })

export const CreateVersionAction = Action.create({ name: 'createVersion' })
export const PublishVersionAction = Action.create({ name: 'publishVersion' })
export const RollbackVersionAction = Action.create({ name: 'rollbackVersion' })

export const GetStylesByStatusAction = Action.create({ name: 'getStylesByStatus' })
export const GetStylesByTypeAction = Action.create({ name: 'getStylesByType' })
export const SearchStylesAction = Action.create({ name: 'searchStyles' })
export const GetVersionStatsAction = Action.create({ name: 'getVersionStats' })

// Define basic interactions
export const CreateStyleInteraction = Interaction.create({
  name: 'CreateStyleInteraction',
  action: CreateStyleAction
})

export const UpdateStyleInteraction = Interaction.create({
  name: 'UpdateStyleInteraction',
  action: UpdateStyleAction
})

export const PublishStyleInteraction = Interaction.create({
  name: 'PublishStyleInteraction',
  action: PublishStyleAction
})

export const OfflineStyleInteraction = Interaction.create({
  name: 'OfflineStyleInteraction',
  action: OfflineStyleAction
})

export const DeleteStyleInteraction = Interaction.create({
  name: 'DeleteStyleInteraction',
  action: DeleteStyleAction
})

export const ReorderStylesInteraction = Interaction.create({
  name: 'ReorderStylesInteraction',
  action: ReorderStylesAction
})

export const BatchUpdatePriorityInteraction = Interaction.create({
  name: 'BatchUpdatePriorityInteraction',
  action: BatchUpdatePriorityAction
})

export const CreateVersionInteraction = Interaction.create({
  name: 'CreateVersionInteraction',
  action: CreateVersionAction
})

export const PublishVersionInteraction = Interaction.create({
  name: 'PublishVersionInteraction',
  action: PublishVersionAction
})

export const RollbackVersionInteraction = Interaction.create({
  name: 'RollbackVersionInteraction',
  action: RollbackVersionAction
})

export const GetStylesByStatusInteraction = Interaction.create({
  name: 'GetStylesByStatusInteraction',
  action: GetStylesByStatusAction
})

export const GetStylesByTypeInteraction = Interaction.create({
  name: 'GetStylesByTypeInteraction',
  action: GetStylesByTypeAction
})

export const SearchStylesInteraction = Interaction.create({
  name: 'SearchStylesInteraction',
  action: SearchStylesAction
})

export const GetVersionStatsInteraction = Interaction.create({
  name: 'GetVersionStatsInteraction',
  action: GetVersionStatsAction
})