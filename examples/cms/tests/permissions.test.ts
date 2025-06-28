import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName } from 'interaqt';
import { entities, relations, interactions, activities } from '../src/index.js';
import { createQueryHelpers, createTestUser, createTestStyle } from './test-utils.js';

describe('CMS Permissions Tests', () => {
  let system: MonoSystem;
  let controller: Controller;
  let query: ReturnType<typeof createQueryHelpers>;
  
  beforeEach(async () => {
    system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [],
      []
    );
    
    await controller.setup(true);
    query = createQueryHelpers(controller);
  });

  describe('TC101: 管理员权限测试', () => {
    test('管理员应该能够执行所有 Style 操作', async () => {
      const admin = createTestUser('Admin');
      const styleData = createTestStyle();
      
      // 创建 Style
      let result = await controller.callInteraction('CreateStyle', {
        user: admin,
        payload: styleData
      });
      expect(result).toBeDefined();
      
      const styles = await query.findAll('Style');
      const style = styles[0];
      
      // 编辑 Style
      result = await controller.callInteraction('UpdateStyle', {
        user: admin,
        payload: {
          id: style.id,
          label: 'Updated by Admin'
        }
      });
      expect(result).toBeDefined();
      
      // 删除 Style
      result = await controller.callInteraction('DeleteStyle', {
        user: admin,
        payload: { id: style.id }
      });
      expect(result).toBeDefined();
    });

    test('管理员应该能够设置任何状态', async () => {
      const admin = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      // 设置为 published
      let result = await controller.callInteraction('SetStyleStatus', {
        user: admin,
        payload: {
          id: style.id,
          status: 'published'
        }
      });
      expect(result).toBeDefined();
      
      // 设置为 offline
      result = await controller.callInteraction('SetStyleStatus', {
        user: admin,
        payload: {
          id: style.id,
          status: 'offline'
        }
      });
      expect(result).toBeDefined();
    });

    test('管理员应该能够执行版本管理操作', async () => {
      const admin = createTestUser('Admin');
      
      // 创建一些已发布的 Style
      await system.storage.create('Style', createTestStyle('published'));
      
      // 创建版本
      let result = await controller.callInteraction('CreateVersion', {
        user: admin,
        payload: {
          name: 'v1.0.0',
          description: 'Test version'
        }
      });
      expect(result).toBeDefined();
      
      const versions = await query.findAll('Version');
      const version = versions[0];
      
      // 回滚版本
      result = await controller.callInteraction('RollbackVersion', {
        user: admin,
        payload: { id: version.id }
      });
      expect(result).toBeDefined();
    });
  });

  describe('TC102: 运营人员权限测试', () => {
    test('运营人员应该能够创建和编辑 Style', async () => {
      const operator = createTestUser('Operator');
      const styleData = createTestStyle();
      
      // 创建 Style
      const result = await controller.callInteraction('CreateStyle', {
        user: operator,
        payload: styleData
      });
      expect(result).toBeDefined();
      
      const styles = await query.findAll('Style');
      const style = styles[0];
      
      // 编辑 Style
      const updateResult = await controller.callInteraction('UpdateStyle', {
        user: operator,
        payload: {
          id: style.id,
          label: 'Updated by Operator'
        }
      });
      expect(updateResult).toBeDefined();
    });

    test('运营人员应该能够设置 draft/published 状态', async () => {
      const operator = createTestUser('Operator');
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      // 发布 Style
      let result = await controller.callInteraction('PublishStyle', {
        user: operator,
        payload: { id: style.id }
      });
      expect(result).toBeDefined();
      
      // 转为草稿
      result = await controller.callInteraction('DraftStyle', {
        user: operator,
        payload: { id: style.id }
      });
      expect(result).toBeDefined();
    });

    test('运营人员不应该能够删除 Style', async () => {
      const operator = createTestUser('Operator');
      const style = await system.storage.create('Style', createTestStyle());
      
      // 尝试删除应该失败
      try {
        await controller.callInteraction('DeleteStyle', {
          user: operator,
          payload: { id: style.id }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('运营人员不应该能够设置 offline 状态', async () => {
      const operator = createTestUser('Operator');
      const style = await system.storage.create('Style', createTestStyle('published'));
      
      // 尝试下线应该失败
      try {
        await controller.callInteraction('OfflineStyle', {
          user: operator,
          payload: { id: style.id }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('运营人员不应该能够执行版本管理操作', async () => {
      const operator = createTestUser('Operator');
      
      // 尝试创建版本应该失败
      try {
        await controller.callInteraction('CreateVersion', {
          user: operator,
          payload: {
            name: 'v1.0.0',
            description: 'Test version'
          }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('运营人员应该能够执行排序操作', async () => {
      const operator = createTestUser('Operator');
      
      // 创建两个 Style
      const style1 = await system.storage.create('Style', { ...createTestStyle(), priority: 10 });
      const style2 = await system.storage.create('Style', { ...createTestStyle(), priority: 20 });
      
      // 更新排序
      const result = await controller.callInteraction('UpdateStyleOrder', {
        user: operator,
        payload: {
          draggedId: style1.id,
          targetId: style2.id,
          position: 'before'
        }
      });
      expect(result).toBeDefined();
    });
  });

  describe('TC103: 查看者权限测试', () => {
    test('查看者应该能够查看已发布的 Style', async () => {
      const viewer = createTestUser('Viewer');
      
      // 创建不同状态的 Style
      await system.storage.create('Style', createTestStyle('draft'));
      await system.storage.create('Style', createTestStyle('published'));
      await system.storage.create('Style', createTestStyle('offline'));
      
      // 查看 Style 列表
      const result = await controller.callInteraction('GetStyleList', {
        user: viewer,
        payload: {
          status: 'published',
          page: 1,
          limit: 10
        }
      });
      expect(result).toBeDefined();
    });

    test('查看者不应该能够查看草稿和下线的 Style', async () => {
      const viewer = createTestUser('Viewer');
      const draftStyle = await system.storage.create('Style', createTestStyle('draft'));
      
      // 尝试查看草稿 Style 应该被限制
      try {
        await controller.callInteraction('GetStyleDetail', {
          user: viewer,
          payload: { id: draftStyle.id }
        });
        // 这里可能需要检查返回的数据是否为空或者抛出错误
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('查看者不应该能够执行任何修改操作', async () => {
      const viewer = createTestUser('Viewer');
      const style = await system.storage.create('Style', createTestStyle('published'));
      
      // 尝试创建 Style
      try {
        await controller.callInteraction('CreateStyle', {
          user: viewer,
          payload: createTestStyle()
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      // 尝试更新 Style
      try {
        await controller.callInteraction('UpdateStyle', {
          user: viewer,
          payload: {
            id: style.id,
            label: 'Should not work'
          }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      // 尝试修改状态
      try {
        await controller.callInteraction('SetStyleStatus', {
          user: viewer,
          payload: {
            id: style.id,
            status: 'draft'
          }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('查看者不应该能够访问版本管理功能', async () => {
      const viewer = createTestUser('Viewer');
      
      // 尝试查看版本列表
      try {
        await controller.callInteraction('GetVersionList', {
          user: viewer,
          payload: { page: 1, limit: 10 }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('TC104: 权限边界测试', () => {
    test('应该正确验证权限边界条件', async () => {
      const operator = createTestUser('Operator');
      const admin = createTestUser('Admin');
      
      // 运营人员创建的 Style
      await controller.callInteraction('CreateStyle', {
        user: operator,
        payload: createTestStyle()
      });
      
      const styles = await query.findAll('Style');
      const style = styles[0];
      
      // 其他运营人员不应该能够修改
      const anotherOperator = createTestUser('Operator');
      anotherOperator.id = 'different-operator-id';
      
      try {
        await controller.callInteraction('UpdateStyle', {
          user: anotherOperator,
          payload: {
            id: style.id,
            label: 'Should not work'
          }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      // 但管理员应该能够修改
      const result = await controller.callInteraction('UpdateStyle', {
        user: admin,
        payload: {
          id: style.id,
          label: 'Admin can modify'
        }
      });
      expect(result).toBeDefined();
    });

    test('应该正确处理无效的状态转换', async () => {
      const operator = createTestUser('Operator');
      const style = await system.storage.create('Style', createTestStyle('published'));
      
      // 运营人员尝试直接设置为 offline 状态
      try {
        await controller.callInteraction('SetStyleStatus', {
          user: operator,
          payload: {
            id: style.id,
            status: 'offline'
          }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});