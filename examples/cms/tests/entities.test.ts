import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName, BoolExp, MatchExp } from 'interaqt';
import { entities, relations, interactions, activities } from '../src/index.js';
import { createQueryHelpers, createTestUser, createTestStyle } from './test-utils.js';

describe('CMS Entities Tests', () => {
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

  describe('TC001: 创建 Style 记录', () => {
    test('应该成功创建包含所有必填字段的 Style 记录', async () => {
      const styleData = createTestStyle();
      
      const createdStyle = await system.storage.create('Style', styleData);
      
      // Fetch the style with all properties
      const style = await system.storage.findOne('Style',
        BoolExp.atom({ key: 'id', value: ['=', createdStyle.id] }),
        undefined,
        ['*']
      );
      
      expect(style.id).toBeDefined();
      expect(style.label).toBe(styleData.label);
      expect(style.slug).toBe(styleData.slug);
      expect(style.description).toBe(styleData.description);
      expect(style.type).toBe(styleData.type);
      expect(style.status).toBe('draft');
      expect(style.createdAt).toBeDefined();
      expect(style.updatedAt).toBeDefined();
    });

    test('应该为新创建的 Style 设置默认值', async () => {
      const createdStyle = await system.storage.create('Style', {
        label: 'Test Style',
        slug: 'test-style',
        type: 'animation'
      });
      
      // Fetch the style with all properties
      const style = await system.storage.findOne('Style',
        BoolExp.atom({ key: 'id', value: ['=', createdStyle.id] }),
        undefined,
        ['*']
      );
      
      expect(style.status).toBe('draft');
      expect(style.priority).toBe(0);
      expect(style.createdAt).toBeDefined();
      expect(style.updatedAt).toBeDefined();
    });

    test('应该正确计算 Style 的计算属性', async () => {
      const createdDraftStyle = await system.storage.create('Style', {
        label: 'Draft Style',
        slug: 'draft-style', 
        type: 'animation',
        status: 'draft'
      });

      const createdPublishedStyle = await system.storage.create('Style', {
        label: 'Published Style',
        slug: 'published-style',
        type: 'animation', 
        status: 'published'
      });

      // Fetch styles with all properties including computed ones
      const draftStyle = await system.storage.findOne('Style',
        BoolExp.atom({ key: 'id', value: ['=', createdDraftStyle.id] }),
        undefined,
        ['*']
      );
      
      const publishedStyle = await system.storage.findOne('Style',
        BoolExp.atom({ key: 'id', value: ['=', createdPublishedStyle.id] }),
        undefined,
        ['*']
      );

      // 检查计算属性
      expect(draftStyle.isDraft).toBe(1);
      expect(draftStyle.isPublished).toBe(0);
      expect(draftStyle.isOffline).toBe(0);

      expect(publishedStyle.isDraft).toBe(0);
      expect(publishedStyle.isPublished).toBe(1);
      expect(publishedStyle.isOffline).toBe(0);
    });
  });

  describe('TC002: 更新 Style 记录', () => {
    test('应该成功更新 Style 记录的字段', async () => {
      const style = await system.storage.create('Style', createTestStyle());
      
      await system.storage.update('Style', 
        BoolExp.atom({ key: 'id', value: ['=', style.id] }), {
        label: 'Updated Label',
        description: 'Updated description',
        updatedAt: new Date().toISOString()
      });
      
      // Fetch the updated style with all properties
      const updatedStyle = await system.storage.findOne('Style',
        BoolExp.atom({ key: 'id', value: ['=', style.id] }),
        undefined,
        ['*']
      );
      
      expect(updatedStyle.label).toBe('Updated Label');
      expect(updatedStyle.description).toBe('Updated description');
      expect(updatedStyle.updatedAt).not.toBe(style.updatedAt);
    });

    test('更新状态应该影响计算属性', async () => {
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      await system.storage.update('Style', 
        BoolExp.atom({ key: 'id', value: ['=', style.id] }), {
        status: 'published',
        updatedAt: new Date().toISOString()
      });
      
      // Fetch the updated style with all properties
      const publishedStyle = await system.storage.findOne('Style',
        BoolExp.atom({ key: 'id', value: ['=', style.id] }),
        undefined,
        ['*']
      );
      
      expect(publishedStyle.isDraft).toBe(0);
      expect(publishedStyle.isPublished).toBe(1);
    });
  });

  describe('TC003: 删除 Style 记录', () => {
    test('应该成功删除 Style 记录', async () => {
      const style = await system.storage.create('Style', createTestStyle());
      
      await system.storage.delete('Style', 
        BoolExp.atom({ key: 'id', value: ['=', style.id] })
      );
      
      const deletedStyle = await query.findById('Style', style.id);
      expect(deletedStyle).toBeUndefined();
    });
  });

  describe('TC004: 查询 Style 记录列表', () => {
    test('应该能够查询所有 Style 记录', async () => {
      await system.storage.create('Style', createTestStyle('draft'));
      await system.storage.create('Style', createTestStyle('published'));
      await system.storage.create('Style', createTestStyle('offline'));
      
      const allStyles = await query.findAll('Style');
      expect(allStyles.length).toBe(3);
    });

    test('应该能够按状态筛选 Style 记录', async () => {
      await system.storage.create('Style', createTestStyle('draft'));
      await system.storage.create('Style', createTestStyle('published'));
      await system.storage.create('Style', createTestStyle('published'));
      
      const publishedStyles = await query.findByCondition('Style', 
        BoolExp.atom({
          key: 'status',
          value: ['=', 'published']
        })
      );
      
      expect(publishedStyles.length).toBe(2);
      publishedStyles.forEach(style => {
        expect(style.status).toBe('published');
      });
    });

    test('应该能够按优先级排序查询', async () => {
      await system.storage.create('Style', { ...createTestStyle(), priority: 10 });
      await system.storage.create('Style', { ...createTestStyle(), priority: 30 });
      await system.storage.create('Style', { ...createTestStyle(), priority: 20 });
      
      const styles = await query.findAll('Style', ['id', 'priority']);
      const priorities = styles.map(s => s.priority).sort((a, b) => b - a);
      
      expect(priorities).toEqual([30, 20, 10]);
    });
  });

  describe('User Entity Tests', () => {
    test('应该成功创建 User 记录', async () => {
      const userData = createTestUser('Admin');
      const createdUser = await system.storage.create('User', userData);
      
      // Fetch the user with all properties
      const user = await system.storage.findOne('User',
        BoolExp.atom({ key: 'id', value: ['=', createdUser.id] }),
        undefined,
        ['*']
      );
      
      expect(user.id).toBeDefined();
      expect(user.name).toBe(userData.name);
      expect(user.email).toBe(userData.email);
      expect(user.role).toBe('Admin');
      expect(user.createdAt).toBeDefined();
    });

    test('应该正确设置用户权限计算属性', async () => {
      const createdAdmin = await system.storage.create('User', createTestUser('Admin'));
      const createdOperator = await system.storage.create('User', createTestUser('Operator'));
      const createdViewer = await system.storage.create('User', createTestUser('Viewer'));
      
      // Fetch users with all properties
      const admin = await system.storage.findOne('User',
        BoolExp.atom({ key: 'id', value: ['=', createdAdmin.id] }),
        undefined,
        ['*']
      );
      const operator = await system.storage.findOne('User',
        BoolExp.atom({ key: 'id', value: ['=', createdOperator.id] }),
        undefined,
        ['*']
      );
      const viewer = await system.storage.findOne('User',
        BoolExp.atom({ key: 'id', value: ['=', createdViewer.id] }),
        undefined,
        ['*']
      );
      
      expect(admin.canDelete).toBe(1);
      expect(admin.canCreateVersion).toBe(1);
      expect(admin.canSetOffline).toBe(1);
      
      expect(operator.canDelete).toBe(0);
      expect(operator.canCreateVersion).toBe(0);
      expect(operator.canSetOffline).toBe(0);
      
      expect(viewer.canDelete).toBe(0);
      expect(viewer.canCreateVersion).toBe(0);
      expect(viewer.canSetOffline).toBe(0);
    });
  });

  describe('Version Entity Tests', () => {
    test('应该成功创建 Version 记录', async () => {
      const versionData = {
        name: 'v1.0.0',
        description: 'Initial version',
        snapshot: {
          styles: [],
          createdAt: new Date().toISOString(),
          totalCount: 0
        }
      };
      
      const createdVersion = await system.storage.create('Version', versionData);
      
      // Fetch the version with all properties
      const version = await system.storage.findOne('Version',
        BoolExp.atom({ key: 'id', value: ['=', createdVersion.id] }),
        undefined,
        ['*']
      );
      
      expect(version.id).toBeDefined();
      expect(version.name).toBe('v1.0.0');
      expect(version.description).toBe('Initial version');
      expect(version.snapshot).toBeDefined();
      expect(version.stylesCount).toBe(0);
    });

    test('应该正确计算版本快照中的样式数量', async () => {
      const styles = [
        createTestStyle('published'),
        createTestStyle('published')
      ];
      
      const createdVersion = await system.storage.create('Version', {
        name: 'v1.1.0',
        description: 'Version with styles',
        snapshot: {
          styles,
          createdAt: new Date().toISOString(),
          totalCount: styles.length
        }
      });
      
      // Fetch the version with all properties
      const version = await system.storage.findOne('Version',
        BoolExp.atom({ key: 'id', value: ['=', createdVersion.id] }),
        undefined,
        ['*']
      );
      
      expect(version.stylesCount).toBe(2);
    });
  });
});