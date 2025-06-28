import { Controller, MatchExp, BoolExp } from 'interaqt';

export function createQueryHelpers(controller: Controller) {
  return {
    async findAll(entityName: string, attributeQuery: string[] = ['*']) {
      return await controller.system.storage.find(
        entityName,
        BoolExp.atom({
          key: 'id',
          value: ['>', 0]
        }),
        undefined,
        attributeQuery
      );
    },

    async findById(entityName: string, id: string, attributeQuery: string[] = ['*']) {
      return await controller.system.storage.findOne(
        entityName,
        BoolExp.atom({
          key: 'id',
          value: ['=', id]
        }),
        undefined,
        attributeQuery
      );
    },

    async findByCondition(entityName: string, condition: any, attributeQuery: string[] = ['*']) {
      return await controller.system.storage.find(
        entityName,
        condition,
        undefined,
        attributeQuery
      );
    },

    async count(entityName: string, condition?: any) {
      const items = await controller.system.storage.find(
        entityName,
        condition || BoolExp.atom({
          key: 'id',
          value: ['>', 0]
        }),
        undefined,
        ['id']
      );
      return items.length;
    }
  };
}

export function createTestUser(role: 'Admin' | 'Operator' | 'Viewer' = 'Admin') {
  return {
    id: `test-user-${Date.now()}`,
    name: `Test ${role}`,
    email: `test-${role.toLowerCase()}@test.com`,
    role
  };
}

export function createTestStyle(status: 'draft' | 'published' | 'offline' = 'draft') {
  return {
    label: `Test Style ${Date.now()}`,
    slug: `test-style-${Date.now()}`,
    description: 'Test style description',
    type: 'animation',
    thumbKey: 'test-thumb.jpg',
    priority: Math.floor(Math.random() * 100),
    status
  };
}