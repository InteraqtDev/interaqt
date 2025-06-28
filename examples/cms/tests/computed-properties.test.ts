import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName } from 'interaqt';
import { entities, relations, interactions, activities } from '../src/index.js';
import { createQueryHelpers, createTestUser, createTestStyle } from './test-utils.js';

describe('CMS Computed Properties Tests', () => {
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

  describe('TC202: Style 状态计算属性', () => {
    test('Status 计算属性应该正确反映 Style 状态', async () => {
      // 创建不同状态的 Style
      const draftStyle = await system.storage.create('Style', createTestStyle('draft'));
      const publishedStyle = await system.storage.create('Style', createTestStyle('published'));
      const offlineStyle = await system.storage.create('Style', createTestStyle('offline'));
      
      // 验证 draft 状态的计算属性
      expect(draftStyle.isDraft).toBe(true);
      expect(draftStyle.isPublished).toBe(false);
      expect(draftStyle.isOffline).toBe(false);
      
      // 验证 published 状态的计算属性
      expect(publishedStyle.isDraft).toBe(false);
      expect(publishedStyle.isPublished).toBe(true);
      expect(publishedStyle.isOffline).toBe(false);
      
      // 验证 offline 状态的计算属性
      expect(offlineStyle.isDraft).toBe(false);
      expect(offlineStyle.isPublished).toBe(false);
      expect(offlineStyle.isOffline).toBe(true);
    });

    test('Priority 显示属性应该正确分类', async () => {
      const lowPriorityStyle = await system.storage.create('Style', {
        ...createTestStyle(),
        priority: 10
      });
      
      const mediumPriorityStyle = await system.storage.create('Style', {
        ...createTestStyle(),
        priority: 50
      });
      
      const highPriorityStyle = await system.storage.create('Style', {
        ...createTestStyle(),
        priority: 100
      });
      
      expect(lowPriorityStyle.displayPriority).toBe('Normal');
      expect(mediumPriorityStyle.displayPriority).toBe('Medium');
      expect(highPriorityStyle.displayPriority).toBe('High');
    });

    test('状态变更应该自动更新计算属性', async () => {
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      // 初始状态检查
      expect(style.isDraft).toBe(true);
      expect(style.isPublished).toBe(false);
      
      // 更新状态为 published
      const updatedStyle = await system.storage.update('Style', style.id, {
        status: 'published'
      });
      
      // 计算属性应该更新
      expect(updatedStyle.isDraft).toBe(false);
      expect(updatedStyle.isPublished).toBe(true);
    });
  });

  describe('User 计算属性测试', () => {
    test('用户统计属性应该正确计算 Style 数量', async () => {
      const user = await system.storage.create('User', createTestUser('Operator'));
      
      // 创建与用户关联的 Style
      const style1 = await system.storage.create('Style', createTestStyle('draft'));
      const style2 = await system.storage.create('Style', createTestStyle('published'));
      const style3 = await system.storage.create('Style', createTestStyle('published'));
      
      // 创建用户-Style 关系
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style1.id
      });
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style2.id
      });
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style3.id
      });
      
      // 重新获取用户数据以查看计算属性
      const updatedUser = await query.findById('User', user.id);
      
      expect(updatedUser.totalStylesCreated).toBe(3);
      expect(updatedUser.publishedStylesCount).toBe(2);
      expect(updatedUser.draftStylesCount).toBe(1);
    });

    test('用户权限计算属性应该基于角色正确设置', async () => {
      const admin = await system.storage.create('User', createTestUser('Admin'));
      const operator = await system.storage.create('User', createTestUser('Operator'));
      const viewer = await system.storage.create('User', createTestUser('Viewer'));
      
      // 管理员权限
      expect(admin.canDelete).toBe(true);
      expect(admin.canCreateVersion).toBe(true);
      expect(admin.canSetOffline).toBe(true);
      
      // 运营人员权限
      expect(operator.canDelete).toBe(false);
      expect(operator.canCreateVersion).toBe(false);
      expect(operator.canSetOffline).toBe(false);
      
      // 查看者权限
      expect(viewer.canDelete).toBe(false);
      expect(viewer.canCreateVersion).toBe(false);
      expect(viewer.canSetOffline).toBe(false);
    });

    test('用户统计应该随 Style 状态变化而更新', async () => {
      const user = await system.storage.create('User', createTestUser('Operator'));
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      // 创建关系
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style.id
      });
      
      let updatedUser = await query.findById('User', user.id);
      expect(updatedUser.draftStylesCount).toBe(1);
      expect(updatedUser.publishedStylesCount).toBe(0);
      
      // 更新 Style 状态
      await system.storage.update('Style', style.id, { status: 'published' });
      
      // 用户统计应该更新
      updatedUser = await query.findById('User', user.id);
      expect(updatedUser.draftStylesCount).toBe(0);
      expect(updatedUser.publishedStylesCount).toBe(1);
    });
  });

  describe('Version 计算属性测试', () => {
    test('版本样式数量应该正确计算', async () => {
      const styles = [
        createTestStyle('published'),
        createTestStyle('published'),
        createTestStyle('published')
      ];
      
      const version = await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'Test version',
        snapshot: {
          styles,
          createdAt: new Date().toISOString(),
          totalCount: styles.length
        }
      });
      
      expect(version.stylesCount).toBe(3);
    });

    test('空版本快照应该返回 0 样式数量', async () => {
      const version = await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'Empty version',
        snapshot: {
          styles: [],
          createdAt: new Date().toISOString(),
          totalCount: 0
        }
      });
      
      expect(version.stylesCount).toBe(0);
    });

    test('格式化创建时间应该正确显示', async () => {
      const now = new Date();
      const version = await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'Test version',
        snapshot: { styles: [], totalCount: 0 },
        createdAt: now.toISOString()
      });
      
      expect(version.formattedCreatedAt).toBe(now.toLocaleString());
    });

    test('无效的创建时间应该返回空字符串', async () => {
      const version = await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'Test version',
        snapshot: { styles: [], totalCount: 0 },
        createdAt: ''
      });
      
      expect(version.formattedCreatedAt).toBe('');
    });
  });

  describe('响应式计算同步测试', () => {
    test('创建 Style 应该立即更新用户统计', async () => {
      const user = await system.storage.create('User', createTestUser('Operator'));
      
      // 初始统计应该为 0
      let updatedUser = await query.findById('User', user.id);
      expect(updatedUser.totalStylesCreated).toBe(0);
      
      // 通过交互创建 Style
      await controller.callInteraction('CreateStyle', {
        user: { id: user.id, name: user.name, role: user.role },
        payload: createTestStyle('draft')
      });
      
      // 用户统计应该立即更新
      updatedUser = await query.findById('User', user.id);
      expect(updatedUser.totalStylesCreated).toBe(1);
      expect(updatedUser.draftStylesCount).toBe(1);
    });

    test('状态变更应该同步更新所有相关计算属性', async () => {
      const user = await system.storage.create('User', createTestUser('Operator'));
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      // 创建关系
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style.id
      });
      
      // 通过交互发布 Style
      await controller.callInteraction('PublishStyle', {
        user: { id: user.id, name: user.name, role: user.role },
        payload: { id: style.id }
      });
      
      // 检查 Style 计算属性
      const updatedStyle = await query.findById('Style', style.id);
      expect(updatedStyle.isPublished).toBe(true);
      expect(updatedStyle.isDraft).toBe(false);
      
      // 检查用户统计属性
      const updatedUser = await query.findById('User', user.id);
      expect(updatedUser.publishedStylesCount).toBe(1);
      expect(updatedUser.draftStylesCount).toBe(0);
    });

    test('批量操作应该正确更新计算属性', async () => {
      const user = await system.storage.create('User', createTestUser('Admin'));
      
      // 创建多个 Style
      const style1 = await system.storage.create('Style', createTestStyle('draft'));
      const style2 = await system.storage.create('Style', createTestStyle('draft'));
      const style3 = await system.storage.create('Style', createTestStyle('draft'));
      
      // 创建关系
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style1.id
      });
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style2.id
      });
      await system.storage.createRelation('UserStyleRelation', {
        source: user.id,
        target: style3.id
      });
      
      // 批量发布
      await controller.callInteraction('BatchUpdateStatus', {
        user: { id: user.id, name: user.name, role: user.role },
        payload: {
          styleIds: [style1.id, style2.id, style3.id],
          status: 'published'
        }
      });
      
      // 检查用户统计
      const updatedUser = await query.findById('User', user.id);
      expect(updatedUser.publishedStylesCount).toBe(3);
      expect(updatedUser.draftStylesCount).toBe(0);
      
      // 检查所有 Style 的状态
      const updatedStyles = await query.findAll('Style');
      updatedStyles.forEach(style => {
        expect(style.isPublished).toBe(true);
        expect(style.isDraft).toBe(false);
      });
    });
  });
});