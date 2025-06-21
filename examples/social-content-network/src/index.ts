import { MonoSystem, Controller } from '@';
import { entities, allEntities, filteredEntities } from './entities.js';
import { relations } from './relations.js';
import { interactions } from './interactions.js';

// 创建系统实例 - need to pass proper Storage implementation
export const system = new MonoSystem();

// 创建活动定义 - 注释掉暂时，因为需要先正确设置基础结构
// const activities = [];

// 创建控制器 - 使用正确的 Controller 构造函数
export const controller = new Controller(
  system,
  allEntities,      // entities
  relations,        // relations  
  [],              // activities (暂时为空)
  interactions,    // interactions
  [],              // dict
  []               // recordMutationSideEffects
);

// 导出系统组件供测试使用
export {
  entities,
  allEntities,
  filteredEntities,
  relations,
  interactions
};

// 启动系统的辅助函数
export async function startSystem() {
  await controller.setup(true);
  return { system, controller };
}

// 停止系统的辅助函数
export async function stopSystem() {
  // Add cleanup logic if needed
  return Promise.resolve();
}