import { Controller } from '@';

/**
 * 创建查询辅助函数
 */
export function createQueryHelpers(controller: Controller) {
  const { MatchExp } = controller.globals;
  
  return {
    // 查找所有记录
    findAll: (entityName: string) => {
      return controller.system.storage.find(entityName, MatchExp.atom({ key: 'id', value: ['>', 0] }));
    },
    
    // 根据ID查找单个记录
    findById: (entityName: string, id: number) => {
      return controller.system.storage.findOne(entityName, MatchExp.atom({ key: 'id', value: ['=', id] }));
    },
    
    // 根据关联ID查找记录
    findByRelation: (entityName: string, relationPath: string, id: number) => {
      return controller.system.storage.find(entityName, MatchExp.atom({ key: relationPath, value: ['=', id] }), undefined, ['*']);
    },
    
    // 根据关联ID查找单个记录
    findOneByRelation: (entityName: string, relationPath: string, id: number) => {
      return controller.system.storage.findOne(entityName, MatchExp.atom({ key: relationPath, value: ['=', id] }));
    }
  };
} 