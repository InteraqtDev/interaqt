// 导出所有定义
export * from './entities'
export * from './relations'
export * from './interactions'

// 导入实体、关系、交互
import { User, Style, Version, updateStyleStateMachines } from './entities'
import { UserStyleRelation, UserStyleUpdateRelation, UserVersionRelation, StyleVersionRelation } from './relations'
import * as allInteractions from './interactions'

// 设置状态机的 transfers
updateStyleStateMachines(allInteractions)

// 为方便使用导出数组
export const entities = [User, Style, Version]
export const relations = [UserStyleRelation, UserStyleUpdateRelation, UserVersionRelation, StyleVersionRelation]
export const interactions = [
  allInteractions.CreateStyle,
  allInteractions.UpdateStyle,
  allInteractions.DeleteStyle,
  allInteractions.RestoreStyle,
  allInteractions.PublishStyle,
  allInteractions.UnpublishStyle,
  allInteractions.UpdateStylePriority,
  allInteractions.ReorderStyles,
  allInteractions.CreateVersion,
  allInteractions.RollbackToVersion,
  allInteractions.QueryStyles,
  allInteractions.QueryVersions,
  allInteractions.QueryVersionStyles
]
export const activities = [] // 本项目不使用 activities

// 注意：不要在这里实例化 Controller
// Controller 应该在测试文件或服务器入口点中实例化
