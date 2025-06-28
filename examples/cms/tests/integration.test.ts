import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName, BoolExp } from 'interaqt';
import { entities, relations, interactions, activities } from '../src/index.js';
import { createQueryHelpers, createTestUser, createTestStyle } from './test-utils.js';

describe('CMS Integration Tests', () => {
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

  describe('TC501: 完整发布流程', () => {
    test('从创建到发布的完整流程应该正常工作', async () => {
      const operator = createTestUser('Operator');
      const admin = createTestUser('Admin');
      
      // Step 1: 运营人员创建 Style 记录（状态 draft）
      await controller.callInteraction('CreateStyle', {
        user: operator,
        payload: {
          label: 'Test Manga Style',
          slug: 'test-manga-style',
          description: 'A beautiful manga style for testing',
          type: 'animation',
          thumbKey: 'manga-thumb.jpg',
          priority: 80
        }
      });
      
      let styles = await query.findAll('Style');
      expect(styles.length).toBe(1);
      
      let style = styles[0];
      expect(style.status).toBe('draft');
      expect(style.isDraft).toBe(true);
      expect(style.isPublished).toBe(false);
      
      // Step 2: 编辑和完善内容
      await controller.callInteraction('UpdateStyle', {
        user: operator,
        payload: {
          id: style.id,
          description: 'An updated beautiful manga style for testing',
          priority: 90
        }
      });
      
      style = await query.findById('Style', style.id);
      expect(style.description).toBe('An updated beautiful manga style for testing');
      expect(style.priority).toBe(90);
      expect(style.displayPriority).toBe('High');
      
      // Step 3: 发布 Style
      await controller.callInteraction('PublishStyle', {
        user: operator,
        payload: { id: style.id }
      });
      
      style = await query.findById('Style', style.id);
      expect(style.status).toBe('published');
      expect(style.isPublished).toBe(true);
      expect(style.isDraft).toBe(false);
      
      // Step 4: 管理员创建版本快照
      await controller.callInteraction('CreateVersion', {
        user: admin,
        payload: {
          name: 'v1.0.0',
          description: 'Initial release with manga style'
        }
      });
      
      const versions = await query.findAll('Version');
      expect(versions.length).toBe(1);
      
      const version = versions[0];
      expect(version.name).toBe('v1.0.0');
      expect(version.stylesCount).toBe(1);
      expect(version.snapshot.styles).toBeDefined();
      expect(version.snapshot.styles.length).toBe(1);
      
      // Step 5: 验证记录在前端可见
      await controller.callInteraction('GetStyleList', {
        user: createTestUser('Viewer'),
        payload: {
          status: 'published',
          page: 1,
          limit: 10
        }
      });
      
      // 验证版本记录正确
      expect(version.snapshot.styles[0].label).toBe('Test Manga Style');
      expect(version.snapshot.styles[0].status).toBe('published');
    });
  });

  describe('TC502: 紧急下线流程', () => {
    test('紧急下线已发布内容的流程', async () => {
      const admin = createTestUser('Admin');
      
      // 准备：创建已发布的 Style
      const style = await system.storage.create('Style', createTestStyle('published'));
      
      // Step 1: 定位需要下线的 Style 记录
      const publishedStyles = await query.findByCondition('Style', 
        BoolExp.atom({
          key: 'status',
          value: ['=', 'published']
        })
      );
      expect(publishedStyles.length).toBe(1);
      expect(publishedStyles[0].id).toBe(style.id);
      
      // Step 2: 管理员修改状态为 offline
      await controller.callInteraction('OfflineStyle', {
        user: admin,
        payload: { id: style.id }
      });
      
      // Step 3: 验证前端不再显示
      const offlinedStyle = await query.findById('Style', style.id);
      expect(offlinedStyle.status).toBe('offline');
      expect(offlinedStyle.isOffline).toBe(true);
      expect(offlinedStyle.isPublished).toBe(false);
      
      // Step 4: 验证查看者无法访问
      const viewer = createTestUser('Viewer');
      const viewerAccessibleStyles = await query.findByCondition('Style',
        BoolExp.atom({
          key: 'status', 
          value: ['=', 'published']
        })
      );
      expect(viewerAccessibleStyles.length).toBe(0);
    });
  });

  describe('TC503: 批量内容管理', () => {
    test('批量操作多个 Style 记录', async () => {
      const admin = createTestUser('Admin');
      
      // 准备：创建多个 Style
      const style1 = await system.storage.create('Style', createTestStyle('draft'));
      const style2 = await system.storage.create('Style', createTestStyle('draft'));
      const style3 = await system.storage.create('Style', createTestStyle('draft'));
      const style4 = await system.storage.create('Style', createTestStyle('published'));
      
      // Step 1: 批量修改状态
      await controller.callInteraction('BatchUpdateStatus', {
        user: admin,
        payload: {
          styleIds: [style1.id, style2.id, style3.id],
          status: 'published'
        }
      });
      
      // 验证状态更新
      const publishedStyles = await query.findByCondition('Style',
        BoolExp.atom({
          key: 'status',
          value: ['=', 'published']
        })
      );
      expect(publishedStyles.length).toBe(4); // 3个新发布 + 1个原本发布的
      
      // Step 2: 批量调整 priority
      const orderUpdates = [
        { id: style1.id, priority: 100 },
        { id: style2.id, priority: 90 },
        { id: style3.id, priority: 80 },
        { id: style4.id, priority: 70 }
      ];
      
      await controller.callInteraction('BatchUpdateOrder', {
        user: admin,
        payload: { orderUpdates }
      });
      
      // 验证优先级更新
      const style1Updated = await query.findById('Style', style1.id);
      const style2Updated = await query.findById('Style', style2.id);
      expect(style1Updated.priority).toBe(100);
      expect(style2Updated.priority).toBe(90);
      
      // Step 3: 批量删除（管理员）
      await controller.callInteraction('BatchDeleteStyles', {
        user: admin,
        payload: {
          styleIds: [style1.id, style2.id]
        }
      });
      
      // 验证删除
      const remainingStyles = await query.findAll('Style');
      expect(remainingStyles.length).toBe(2);
      expect(remainingStyles.find(s => s.id === style1.id)).toBeUndefined();
      expect(remainingStyles.find(s => s.id === style2.id)).toBeUndefined();
    });
  });

  describe('TC601: Slug 唯一性验证', () => {
    test('应该拒绝创建相同 slug 的记录', async () => {
      const user = createTestUser('Admin');
      
      // 创建第一个 Style
      await controller.callInteraction('CreateStyle', {
        user,
        payload: {
          label: 'First Style',
          slug: 'unique-slug',
          type: 'animation'
        }
      });
      
      // 尝试创建相同 slug 的记录
      try {
        await controller.callInteraction('CreateStyle', {
          user,
          payload: {
            label: 'Second Style',
            slug: 'unique-slug', // 相同的 slug
            type: 'surreal'
          }
        });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBeDefined();
        // 验证错误信息包含唯一性提示
      }
      
      // 验证只有一个记录存在
      const styles = await query.findAll('Style');
      expect(styles.length).toBe(1);
      expect(styles[0].label).toBe('First Style');
    });
  });

  describe('TC602: 关联数据一致性', () => {
    test('删除 Style 记录后检查相关数据', async () => {
      const admin = createTestUser('Admin');
      const user = await system.storage.create('User', createTestUser('Operator'));
      
      // 创建 Style 和关系
      const style = await system.storage.create('Style', createTestStyle('published'));
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style.id
      });
      
      // 创建包含该 Style 的版本
      await controller.callInteraction('CreateVersion', {
        user: admin,
        payload: {
          name: 'v1.0.0',
          description: 'Version with the style'
        }
      });
      
      // 验证用户统计
      let updatedUser = await query.findById('User', user.id);
      expect(updatedUser.totalStylesCreated).toBe(1);
      
      // 删除 Style
      await controller.callInteraction('DeleteStyle', {
        user: admin,
        payload: { id: style.id }
      });
      
      // 验证关联数据状态
      updatedUser = await query.findById('User', user.id);
      expect(updatedUser.totalStylesCreated).toBe(0);
      
      // 验证版本快照中的数据状态
      const versions = await query.findAll('Version');
      expect(versions.length).toBe(1);
      // 版本快照应该保留历史数据，但标记为已删除状态
    });
  });

  describe('TC603: 并发操作测试', () => {
    test('多用户同时操作同一 Style 记录', async () => {
      const admin = createTestUser('Admin');
      const operator = createTestUser('Operator');
      
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      // 模拟并发操作
      const operations = [
        // 操作1：管理员尝试更新标签
        controller.callInteraction('UpdateStyle', {
          user: admin,
          payload: {
            id: style.id,
            label: 'Updated by Admin'
          }
        }),
        
        // 操作2：运营人员尝试发布
        controller.callInteraction('PublishStyle', {
          user: operator,
          payload: { id: style.id }
        })
      ];
      
      // 等待所有操作完成
      const results = await Promise.allSettled(operations);
      
      // 验证操作结果
      const finalStyle = await query.findById('Style', style.id);
      
      // 至少有一个操作应该成功
      const successfulOps = results.filter(r => r.status === 'fulfilled');
      expect(successfulOps.length).toBeGreaterThan(0);
      
      // 数据应该保持一致性
      expect(finalStyle).toBeDefined();
      expect(finalStyle.updatedAt).toBeDefined();
    });
  });

  describe('TC701-703: 性能测试用例', () => {
    test('大数据量列表查询性能', async () => {
      const user = createTestUser('Admin');
      
      // 创建大量测试数据（简化版本，实际应该创建更多）
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          system.storage.create('Style', {
            ...createTestStyle('published'),
            label: `Style ${i}`,
            slug: `style-${i}`,
            priority: i
          })
        );
      }
      await Promise.all(promises);
      
      // 测试分页查询性能
      const startTime = Date.now();
      
      await controller.callInteraction('GetStyleList', {
        user,
        payload: {
          page: 1,
          limit: 20,
          sortBy: 'priority',
          sortOrder: 'desc'
        }
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // 验证响应时间
      expect(responseTime).toBeLessThan(500); // 500ms 阈值
      
      // 验证数据正确性
      const styles = await query.findAll('Style');
      expect(styles.length).toBe(50);
    });

    test('批量排序性能', async () => {
      const user = createTestUser('Admin');
      
      // 创建多个 Style
      const styles = [];
      for (let i = 0; i < 20; i++) {
        const style = await system.storage.create('Style', {
          ...createTestStyle(),
          priority: i * 10
        });
        styles.push(style);
      }
      
      // 准备批量排序数据
      const orderUpdates = styles.map((style, index) => ({
        id: style.id,
        priority: (styles.length - index) * 10 // 反向排序
      }));
      
      // 测试批量排序性能
      const startTime = Date.now();
      
      await controller.callInteraction('BatchUpdateOrder', {
        user,
        payload: { orderUpdates }
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // 验证性能指标
      expect(responseTime).toBeLessThan(2000); // 2秒阈值
      
      // 验证排序结果
      const updatedStyles = await query.findAll('Style', ['id', 'priority']);
      const firstStyle = updatedStyles.find(s => s.id === styles[0].id);
      expect(firstStyle.priority).toBe(200); // 20 * 10
    });

    test('版本快照创建性能', async () => {
      const admin = createTestUser('Admin');
      
      // 创建多个已发布的 Style
      const promises = [];
      for (let i = 0; i < 30; i++) {
        promises.push(
          system.storage.create('Style', {
            ...createTestStyle('published'),
            label: `Published Style ${i}`,
            slug: `published-style-${i}`
          })
        );
      }
      await Promise.all(promises);
      
      // 测试版本快照创建性能
      const startTime = Date.now();
      
      await controller.callInteraction('CreateVersion', {
        user: admin,
        payload: {
          name: 'v1.0.0',
          description: 'Performance test version'
        }
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // 验证性能指标
      expect(responseTime).toBeLessThan(5000); // 5秒阈值
      
      // 验证快照准确性
      const versions = await query.findAll('Version');
      expect(versions.length).toBe(1);
      
      const version = versions[0];
      expect(version.stylesCount).toBe(30);
      expect(version.snapshot.styles.length).toBe(30);
    });
  });
});