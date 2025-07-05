import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt';
import { entities, relations, interactions } from '../backend';
import { setupStyleStateMachines } from '../backend/entities/Style';

describe('Style Management Tests', () => {
  let system: MonoSystem;
  let controller: Controller;
  let operatorUser: any;
  let adminUser: any;
  let viewerUser: any;

  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB());
    
    controller = new Controller(
      system,
      entities,
      relations,
      [],  // activities
      interactions,
      [],  // dicts
      []   // side effects
    );

    await controller.setup(true);
    
    // Set up state machine transfers after interactions are defined
    setupStyleStateMachines(interactions);
    
    // Create test users
    operatorUser = await system.storage.create('User', {
      name: 'Test Operator',
      email: 'operator@test.com',
      role: 'operator'
    });
    
    adminUser = await system.storage.create('User', {
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'admin'
    });
    
    viewerUser = await system.storage.create('User', {
      name: 'Test Viewer',
      email: 'viewer@test.com',
      role: 'viewer'
    });
  });

  // TC001: 创建样式 - 成功案例
  test('TC001: should create a style successfully', async () => {
    // Act
    const result = await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'Manga',
        slug: 'manga',
        description: 'Japanese comic style',
        type: 'animation',
        thumbKey: 's3://bucket/manga-thumb.jpg',
        priority: 10
      }
    });

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined();

    // Verify style was created
    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'manga'] }),
      undefined,
      ['id', 'label', 'slug', 'description', 'type', 'thumbKey', 'priority', 'status', 'createdAt', 'updatedAt', 'lastModifiedBy']
    );
    
    expect(style).toBeTruthy();
    expect(style.label).toBe('Manga');
    expect(style.slug).toBe('manga');
    expect(style.description).toBe('Japanese comic style');
    expect(style.type).toBe('animation');
    expect(style.thumbKey).toBe('s3://bucket/manga-thumb.jpg');
    expect(style.priority).toBe(10);
    expect(style.status).toBe('draft');
    expect(style.createdAt).toBeTruthy();
    expect(style.updatedAt).toBeTruthy();
    expect(style.lastModifiedBy.id).toBe(operatorUser.id);
  });

  // TC002: 创建样式 - slug 重复失败
  test('TC002: should fail to create style with duplicate slug', async () => {
    // Setup: Create first style
    await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'Manga',
        slug: 'manga',
        description: 'Japanese comic style',
        type: 'animation',
        thumbKey: 's3://bucket/manga-thumb.jpg',
        priority: 10
      }
    });

    // Act: Try to create another style with same slug
    const result = await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'Another Manga',
        slug: 'manga', // Duplicate slug
        description: 'Another manga style',
        type: 'animation',
        thumbKey: 's3://bucket/another-manga.jpg',
        priority: 5
      }
    });

    // Assert
    expect(result.error).toBeDefined();
    expect((result.error as any).message).toContain('slug already exists');
    
    // Verify only one style exists
    const styles = await system.storage.find('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'manga'] }),
      undefined,
      ['id']
    );
    expect(styles.length).toBe(1);
  });

  // TC003: 创建样式 - 权限不足失败
  test('TC003: should fail to create style without permission', async () => {
    // Act: Viewer tries to create style
    const result = await controller.callInteraction('CreateStyle', {
      user: viewerUser,
      payload: {
        label: 'Test Style',
        slug: 'test-style',
        description: 'Test',
        type: 'animation',
        thumbKey: 's3://bucket/test.jpg',
        priority: 1
      }
    });

    // Assert
    expect(result.error).toBeDefined();
    expect((result.error as any).type).toBe('permission denied');
    
    // Verify no style was created
    const styles = await system.storage.find('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'test-style'] }),
      undefined,
      ['id']
    );
    expect(styles.length).toBe(0);
  });

  // TC004: 更新样式 - 成功案例
  test('TC004: should update style successfully', async () => {
    // Setup: Create a style
    await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'Original',
        slug: 'original',
        description: 'Original description',
        type: 'animation',
        thumbKey: 's3://bucket/original.jpg',
        priority: 5
      }
    });

    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'original'] }),
      undefined,
      ['id', 'updatedAt']
    );
    const originalUpdatedAt = style.updatedAt;

    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    // Act: Update the style
    const result = await controller.callInteraction('UpdateStyle', {
      user: operatorUser,
      payload: {
        styleId: { id: style.id },
        label: 'Updated Manga',
        description: 'Updated description',
        priority: 20
      }
    });

    // Assert
    expect(result.error).toBeUndefined();

    // Verify updates
    const updatedStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['id', 'label', 'description', 'priority', 'slug', 'type', 'thumbKey', 'updatedAt', 'lastModifiedBy']
    );
    
    expect(updatedStyle.label).toBe('Updated Manga');
    expect(updatedStyle.description).toBe('Updated description');
    expect(updatedStyle.priority).toBe(20);
    // Unchanged fields
    expect(updatedStyle.slug).toBe('original');
    expect(updatedStyle.type).toBe('animation');
    expect(updatedStyle.thumbKey).toBe('s3://bucket/original.jpg');
    // Updated metadata
    expect(updatedStyle.updatedAt).not.toBe(originalUpdatedAt);
    expect(updatedStyle.lastModifiedBy.id).toBe(operatorUser.id);
  });

  // TC005: 更新样式 - 更新 offline 状态失败
  test('TC005: should fail to update offline style', async () => {
    // Setup: Create and delete a style
    await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'To Delete',
        slug: 'to-delete',
        description: 'Will be deleted',
        type: 'animation',
        thumbKey: 's3://bucket/delete.jpg',
        priority: 1
      }
    });

    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'to-delete'] }),
      undefined,
      ['id']
    );

    // Delete the style (admin only)
    await controller.callInteraction('DeleteStyle', {
      user: adminUser,
      payload: {
        styleId: { id: style.id }
      }
    });

    // Act: Try to update offline style
    const result = await controller.callInteraction('UpdateStyle', {
      user: operatorUser,
      payload: {
        styleId: { id: style.id },
        label: 'Try to update'
      }
    });

    // Assert
    expect(result.error).toBeDefined();
    expect((result.error as any).message).toContain('cannot update offline');
    
    // Verify style remains unchanged
    const currentStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['label', 'status']
    );
    expect(currentStyle.label).toBe('To Delete');
    expect(currentStyle.status).toBe('offline');
  });

  // TC006: 发布样式 - 成功案例
  test('TC006: should publish style successfully', async () => {
    // Setup: Create a draft style
    await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'To Publish',
        slug: 'to-publish',
        description: 'Will be published',
        type: 'animation',
        thumbKey: 's3://bucket/publish.jpg',
        priority: 10
      }
    });

    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'to-publish'] }),
      undefined,
      ['id', 'status', 'versionCount']
    );
    
    expect(style.status).toBe('draft');
    const originalVersionCount = style.versionCount;

    // Act: Publish the style
    const result = await controller.callInteraction('PublishStyle', {
      user: operatorUser,
      payload: {
        styleId: { id: style.id }
      }
    });

    // Assert
    expect(result.error).toBeUndefined();

    // Verify style status changed
    const publishedStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['id', 'status', 'versionCount']
    );
    
    expect(publishedStyle.status).toBe('published');
    expect(publishedStyle.versionCount).toBe(originalVersionCount + 1);

    // Verify version was created
    const versions = await system.storage.find('Version',
      undefined,
      undefined,
      ['id', 'versionNumber', 'isActive', 'publishedAt', 'publishedBy']
    );
    
    expect(versions.length).toBeGreaterThan(0);
    const latestVersion = versions[versions.length - 1];
    expect(latestVersion.isActive).toBe(true);
    expect(latestVersion.publishedBy.id).toBe(operatorUser.id);
  });

  // TC007: 删除样式（软删除）- 成功案例
  test('TC007: should soft delete style successfully', async () => {
    // Setup: Create and publish a style
    await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'To Delete',
        slug: 'delete-me',
        description: 'Will be deleted',
        type: 'animation',
        thumbKey: 's3://bucket/delete.jpg',
        priority: 5
      }
    });

    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'delete-me'] }),
      undefined,
      ['id']
    );

    await controller.callInteraction('PublishStyle', {
      user: operatorUser,
      payload: { styleId: { id: style.id } }
    });

    // Act: Delete the style (admin only)
    const result = await controller.callInteraction('DeleteStyle', {
      user: adminUser,
      payload: {
        styleId: { id: style.id }
      }
    });

    // Assert
    expect(result.error).toBeUndefined();

    // Verify style status changed to offline
    const deletedStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['id', 'status', 'label']
    );
    
    expect(deletedStyle).toBeTruthy();
    expect(deletedStyle.status).toBe('offline');
    expect(deletedStyle.label).toBe('To Delete'); // Data preserved

    // Verify it's not returned in default queries
    const activeStyles = await system.storage.find('Style',
      MatchExp.atom({ key: 'status', value: ['!=', 'offline'] }),
      undefined,
      ['id']
    );
    
    expect(activeStyles.find(s => s.id === style.id)).toBeFalsy();
  });

  // TC008: 删除样式 - 权限不足失败
  test('TC008: should fail to delete style without admin permission', async () => {
    // Setup: Create a style
    await controller.callInteraction('CreateStyle', {
      user: operatorUser,
      payload: {
        label: 'Cannot Delete',
        slug: 'no-delete',
        description: 'Operator cannot delete',
        type: 'animation',
        thumbKey: 's3://bucket/no-delete.jpg',
        priority: 1
      }
    });

    const style = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', 'no-delete'] }),
      undefined,
      ['id']
    );

    // Act: Operator tries to delete
    const result = await controller.callInteraction('DeleteStyle', {
      user: operatorUser,
      payload: {
        styleId: { id: style.id }
      }
    });

    // Assert
    expect(result.error).toBeDefined();
    expect((result.error as any).type).toBe('permission denied');

    // Verify style remains active
    const currentStyle = await system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['status']
    );
    expect(currentStyle.status).toBe('draft');
  });
}); 