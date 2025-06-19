import { entities } from './entities.js'
import { relations } from './relations.js'
import { interactions } from './interactions.js'

// 导出所有定义，供测试和应用使用
export { entities, relations, interactions }

// 导出具体的实体、关系和交互
export * from './entities.js'
export * from './relations.js'
export * from './interactions.js'

// 创建系统配置
export function createSocialNetworkSystem() {
  return {
    entities,
    relations,
    interactions,
    dicts: [], // 全局字典（暂时为空）
    activities: [] // 活动（暂时为空）
  }
}

// 默认导出
export default createSocialNetworkSystem