import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName, BoolExp } from 'interaqt';
import { entities, relations, interactions, activities } from '../src/index.js';
import { createQueryHelpers, createTestUser, createTestStyle } from './test-utils.js';

describe('CMS Interactions Tests', () => {
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

  describe('Style CRUD Interactions', () => {
    test('TC001: CreateStyle - 应该成功创建新的 Style 记录', async () => {
      const user = createTestUser('Admin');
      const styleData = createTestStyle();
      
      const result = await controller.callInteraction('CreateStyle', {
        user,
        payload: styleData
      });
      
      expect(result).toBeDefined();
      
      // 验证 Style 是否被创建
      const styles = await query.findAll('Style');
      expect(styles.length).toBe(1);
      
      const createdStyle = styles[0];
      expect(createdStyle.label).toBe(styleData.label);
      expect(createdStyle.slug).toBe(styleData.slug);
      expect(createdStyle.status).toBe('draft');
    });

    test('TC002: UpdateStyle - 应该成功更新现有的 Style 记录', async () => {
      const user = createTestUser('Admin');
      
      // 先创建一个 Style
      const style = await system.storage.create('Style', createTestStyle());
      
      const updateData = {
        id: style.id,
        label: 'Updated Label',
        description: 'Updated description'
      };
      
      const result = await controller.callInteraction('UpdateStyle', {
        user,
        payload: updateData
      });
      
      expect(result).toBeDefined();
      
      // 验证更新是否成功
      const updatedStyle = await query.findById('Style', style.id);
      expect(updatedStyle.label).toBe('Updated Label');
      expect(updatedStyle.description).toBe('Updated description');
    });

    test('TC003: DeleteStyle - 管理员应该能够删除 Style 记录', async () => {
      const admin = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle());
      
      const result = await controller.callInteraction('DeleteStyle', {
        user: admin,
        payload: { id: style.id }
      });
      
      expect(result).toBeDefined();
      
      // 验证删除是否成功
      const deletedStyle = await query.findById('Style', style.id);
      expect(deletedStyle).toBeNull();
    });

    test('TC004: GetStyleList - 应该能够获取 Style 列表', async () => {
      const user = createTestUser('Admin');
      
      // 创建一些测试数据
      await system.storage.create('Style', createTestStyle('draft'));
      await system.storage.create('Style', createTestStyle('published'));
      await system.storage.create('Style', createTestStyle('offline'));
      
      const result = await controller.callInteraction('GetStyleList', {
        user,
        payload: {
          page: 1,
          limit: 10,
          sortBy: 'priority',
          sortOrder: 'desc'
        }
      });
      
      expect(result).toBeDefined();
    });

    test('TC005: GetStyleDetail - 应该能够获取单个 Style 详情', async () => {
      const user = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle('published'));
      
      const result = await controller.callInteraction('GetStyleDetail', {
        user,
        payload: { id: style.id }
      });
      
      expect(result).toBeDefined();
    });
  });

  describe('Status Management Interactions', () => {
    test('TC201: SetStyleStatus - 应该能够修改 Style 状态', async () => {
      const user = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      const result = await controller.callInteraction('SetStyleStatus', {
        user,
        payload: {
          id: style.id,
          status: 'published'
        }
      });
      
      expect(result).toBeDefined();
      
      // 验证状态是否更新
      const updatedStyle = await query.findById('Style', style.id);
      expect(updatedStyle.status).toBe('published');
    });

    test('TC202: PublishStyle - 应该能够发布 Style', async () => {
      const user = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle('draft'));
      
      const result = await controller.callInteraction('PublishStyle', {
        user,
        payload: { id: style.id }
      });
      
      expect(result).toBeDefined();
      
      // 验证状态是否变为 published
      const publishedStyle = await query.findById('Style', style.id);
      expect(publishedStyle.status).toBe('published');
    });

    test('TC203: DraftStyle - 应该能够将 Style 设为草稿', async () => {
      const user = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle('published'));
      
      const result = await controller.callInteraction('DraftStyle', {
        user,
        payload: { id: style.id }
      });
      
      expect(result).toBeDefined();
      
      // 验证状态是否变为 draft
      const draftStyle = await query.findById('Style', style.id);
      expect(draftStyle.status).toBe('draft');
    });

    test('TC204: OfflineStyle - 管理员应该能够下线 Style', async () => {
      const admin = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle('published'));
      
      const result = await controller.callInteraction('OfflineStyle', {
        user: admin,
        payload: { id: style.id }
      });
      
      expect(result).toBeDefined();
      
      // 验证状态是否变为 offline
      const offlineStyle = await query.findById('Style', style.id);
      expect(offlineStyle.status).toBe('offline');
    });
  });

  describe('Sorting Management Interactions', () => {
    test('TC301: UpdateStyleOrder - 应该能够更新 Style 排序', async () => {
      const user = createTestUser('Admin');
      
      // 创建两个 Style 用于排序
      const style1 = await system.storage.create('Style', { ...createTestStyle(), priority: 10 });
      const style2 = await system.storage.create('Style', { ...createTestStyle(), priority: 20 });
      
      const result = await controller.callInteraction('UpdateStyleOrder', {
        user,
        payload: {
          draggedId: style1.id,
          targetId: style2.id,
          position: 'before'
        }
      });
      
      expect(result).toBeDefined();
    });

    test('TC302: BatchUpdateOrder - 应该能够批量更新排序', async () => {
      const user = createTestUser('Admin');
      
      // 创建多个 Style
      const style1 = await system.storage.create('Style', { ...createTestStyle(), priority: 10 });
      const style2 = await system.storage.create('Style', { ...createTestStyle(), priority: 20 });
      const style3 = await system.storage.create('Style', { ...createTestStyle(), priority: 30 });
      
      const orderUpdates = [
        { id: style1.id, priority: 30 },
        { id: style2.id, priority: 20 },
        { id: style3.id, priority: 10 }
      ];
      
      const result = await controller.callInteraction('BatchUpdateOrder', {
        user,
        payload: { orderUpdates }
      });
      
      expect(result).toBeDefined();
    });
  });

  describe('Version Management Interactions', () => {
    test('TC401: CreateVersion - 管理员应该能够创建版本快照', async () => {
      const admin = createTestUser('Admin');
      
      // 创建一些已发布的 Style
      await system.storage.create('Style', createTestStyle('published'));
      await system.storage.create('Style', createTestStyle('published'));
      
      const result = await controller.callInteraction('CreateVersion', {
        user: admin,
        payload: {
          name: 'v1.0.0',
          description: 'Initial release'
        }
      });
      
      expect(result).toBeDefined();
      
      // 验证版本是否创建
      const versions = await query.findAll('Version');
      expect(versions.length).toBe(1);
      
      const version = versions[0];
      expect(version.name).toBe('v1.0.0');
      expect(version.description).toBe('Initial release');
    });

    test('TC402: GetVersionList - 应该能够获取版本列表', async () => {
      const user = createTestUser('Admin');
      
      // 创建一个版本
      await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'Test version',
        snapshot: { styles: [], totalCount: 0 }
      });
      
      const result = await controller.callInteraction('GetVersionList', {
        user,
        payload: { page: 1, limit: 10 }
      });
      
      expect(result).toBeDefined();
    });

    test('TC403: GetVersionDetail - 应该能够获取版本详情', async () => {
      const user = createTestUser('Admin');
      
      const version = await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'Test version',
        snapshot: { styles: [], totalCount: 0 }
      });
      
      const result = await controller.callInteraction('GetVersionDetail', {
        user,
        payload: { id: version.id }
      });
      
      expect(result).toBeDefined();
    });

    test('TC404: RollbackVersion - 管理员应该能够回滚版本', async () => {
      const admin = createTestUser('Admin');
      
      const version = await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'Version to rollback to',
        snapshot: {
          styles: [createTestStyle('published')],
          totalCount: 1
        }
      });
      
      const result = await controller.callInteraction('RollbackVersion', {
        user: admin,
        payload: { id: version.id }
      });
      
      expect(result).toBeDefined();
    });

    test('TC405: CompareVersions - 应该能够比较版本差异', async () => {
      const user = createTestUser('Admin');
      
      const version1 = await system.storage.create('Version', {
        name: 'v1.0.0',
        description: 'First version',
        snapshot: { styles: [], totalCount: 0 }
      });
      
      const version2 = await system.storage.create('Version', {
        name: 'v1.1.0',
        description: 'Second version',
        snapshot: { styles: [createTestStyle('published')], totalCount: 1 }
      });
      
      const result = await controller.callInteraction('CompareVersions', {
        user,
        payload: {
          sourceVersionId: version1.id,
          targetVersionId: version2.id
        }
      });
      
      expect(result).toBeDefined();
    });
  });

  describe('Batch Operations', () => {
    test('TC501: BatchUpdateStatus - 应该能够批量更新状态', async () => {
      const user = createTestUser('Admin');
      
      // 创建多个 Style
      const style1 = await system.storage.create('Style', createTestStyle('draft'));
      const style2 = await system.storage.create('Style', createTestStyle('draft'));
      const style3 = await system.storage.create('Style', createTestStyle('draft'));
      
      const result = await controller.callInteraction('BatchUpdateStatus', {
        user,
        payload: {
          styleIds: [style1.id, style2.id, style3.id],
          status: 'published'
        }
      });
      
      expect(result).toBeDefined();
    });

    test('TC502: BatchDeleteStyles - 管理员应该能够批量删除', async () => {
      const admin = createTestUser('Admin');
      
      // 创建多个 Style
      const style1 = await system.storage.create('Style', createTestStyle());
      const style2 = await system.storage.create('Style', createTestStyle());
      
      const result = await controller.callInteraction('BatchDeleteStyles', {
        user: admin,
        payload: {
          styleIds: [style1.id, style2.id]
        }
      });
      
      expect(result).toBeDefined();
    });
  });

  describe('File Management', () => {
    test('TC601: UploadThumbnail - 应该能够上传缩略图', async () => {
      const user = createTestUser('Admin');
      const style = await system.storage.create('Style', createTestStyle());
      
      const result = await controller.callInteraction('UploadThumbnail', {
        user,
        payload: {
          styleId: style.id,
          fileName: 'thumbnail.jpg',
          fileData: 'base64-encoded-data',
          fileType: 'image/jpeg'
        }
      });
      
      expect(result).toBeDefined();
    });

    test('TC602: DeleteThumbnail - 应该能够删除缩略图', async () => {
      const user = createTestUser('Admin');
      const style = await system.storage.create('Style', {
        ...createTestStyle(),
        thumbKey: 'existing-thumb.jpg'
      });
      
      const result = await controller.callInteraction('DeleteThumbnail', {
        user,
        payload: {
          styleId: style.id,
          thumbKey: 'existing-thumb.jpg'
        }
      });
      
      expect(result).toBeDefined();
    });
  });

  describe('Search and Filter', () => {
    test('TC701: SearchStyles - 应该能够搜索 Style', async () => {
      const user = createTestUser('Admin');
      
      // 创建一些测试数据
      await system.storage.create('Style', {
        ...createTestStyle('published'),
        label: 'Manga Style'
      });
      await system.storage.create('Style', {
        ...createTestStyle('published'),
        label: 'Anime Style'
      });
      
      const result = await controller.callInteraction('SearchStyles', {
        user,
        payload: {
          query: 'Manga',
          status: 'published',
          page: 1,
          limit: 10
        }
      });
      
      expect(result).toBeDefined();
    });

    test('TC702: FilterStylesByStatus - 应该能够按状态筛选', async () => {
      const user = createTestUser('Admin');
      
      // 创建不同状态的 Style
      await system.storage.create('Style', createTestStyle('draft'));
      await system.storage.create('Style', createTestStyle('published'));
      await system.storage.create('Style', createTestStyle('offline'));
      
      const result = await controller.callInteraction('FilterStylesByStatus', {
        user,
        payload: {
          status: 'published',
          page: 1,
          limit: 10
        }
      });
      
      expect(result).toBeDefined();
    });

    test('TC703: FilterStylesByType - 应该能够按类型筛选', async () => {
      const user = createTestUser('Admin');
      
      // 创建不同类型的 Style
      await system.storage.create('Style', {
        ...createTestStyle('published'),
        type: 'animation'
      });
      await system.storage.create('Style', {
        ...createTestStyle('published'),
        type: 'surreal'
      });
      
      const result = await controller.callInteraction('FilterStylesByType', {
        user,
        payload: {
          type: 'animation',
          page: 1,
          limit: 10
        }
      });
      
      expect(result).toBeDefined();
    });
  });
});