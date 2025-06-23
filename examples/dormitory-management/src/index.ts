// 导入实体定义
import { entities } from './entities.js';
import './entities-computed.js'; // 加载计算属性

// 导入关系定义
import { relations } from './relations.js';

// 导入交互定义
import { interactions } from './interactions.js';

// 导入活动定义
import { activities } from './activities.js';

// 导出所有定义
export {
  entities,
  relations,
  interactions,
  activities
};

// 导出具体的实体和交互，方便外部使用
export * from './entities.js';
export * from './relations.js';
export * from './interactions.js';
export * from './activities.js'; 