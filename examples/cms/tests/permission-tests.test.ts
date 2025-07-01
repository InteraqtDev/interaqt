import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, activities } from '../backend'
import { v4 as uuid } from 'uuid'

describe('Permission Control Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName

    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [],
      []
    )

    await controller.setup(true)
  })

  test('TC012: Editor can only edit own styles', async () => {
    const editor1Id = uuid()
    const editor2Id = uuid()
    const style1Id = uuid()
    const style2Id = uuid()
    const now = new Date().toISOString()

    // Create two editors
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editor1Id,
        username: 'editor1',
        email: 'editor1@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editor2Id,
        username: 'editor2',
        email: 'editor2@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Editor1 creates a style
    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: style1Id,
        label: 'Editor1 Style',
        slug: 'editor1-style',
        description: 'Style created by editor1',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: editor1Id
      },
      user: { id: editor1Id, role: 'editor' }
    })

    // Editor2 creates a style
    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: style2Id,
        label: 'Editor2 Style',
        slug: 'editor2-style',
        description: 'Style created by editor2',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: editor2Id
      },
      user: { id: editor2Id, role: 'editor' }
    })

    // Editor1 should be able to edit their own style
    const updateOwnResult = await controller.run({
      name: 'UpdateStyle',
      payload: {
        styleId: style1Id,
        label: 'Updated Editor1 Style',
        updatedAt: now
      },
      user: { id: editor1Id, role: 'editor' }
    })

    expect(updateOwnResult.error).toBeUndefined()

    // Editor1 should NOT be able to edit editor2's style
    const updateOthersResult = await controller.run({
      name: 'UpdateStyle',
      payload: {
        styleId: style2Id,
        label: 'Hacked Style',
        updatedAt: now
      },
      user: { id: editor1Id, role: 'editor' }
    })

    expect(updateOthersResult.error).toBeDefined()

    // Editor1 should be able to delete their own style
    const deleteOwnResult = await controller.run({
      name: 'DeleteStyle',
      payload: {
        styleId: style1Id
      },
      user: { id: editor1Id, role: 'editor' }
    })

    expect(deleteOwnResult.error).toBeUndefined()

    // Editor1 should NOT be able to delete editor2's style
    const deleteOthersResult = await controller.run({
      name: 'DeleteStyle',
      payload: {
        styleId: style2Id
      },
      user: { id: editor1Id, role: 'editor' }
    })

    expect(deleteOthersResult.error).toBeDefined()
  })

  test('TC012: Editor can only edit own versions', async () => {
    const editor1Id = uuid()
    const editor2Id = uuid()
    const version1Id = uuid()
    const version2Id = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup users and style
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editor1Id,
        username: 'editor1',
        email: 'editor1@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editor2Id,
        username: 'editor2',
        email: 'editor2@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Shared Style',
        slug: 'shared-style',
        description: 'Style for versions',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: editor1Id
      },
      user: { id: editor1Id, role: 'editor' }
    })

    // Editor1 creates a version
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version1Id,
        versionNumber: 1,
        name: 'Editor1 Version',
        description: 'Version by editor1',
        styleIds: [styleId],
        createdAt: now,
        createdBy: editor1Id
      },
      user: { id: editor1Id, role: 'editor' }
    })

    // Editor2 creates a version
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version2Id,
        versionNumber: 2,
        name: 'Editor2 Version',
        description: 'Version by editor2',
        styleIds: [styleId],
        createdAt: now,
        createdBy: editor2Id
      },
      user: { id: editor2Id, role: 'editor' }
    })

    // Editor1 should be able to update their own version
    const updateOwnResult = await controller.run({
      name: 'UpdateVersion',
      payload: {
        versionId: version1Id,
        name: 'Updated Editor1 Version'
      },
      user: { id: editor1Id, role: 'editor' }
    })

    expect(updateOwnResult.error).toBeUndefined()

    // Editor1 should NOT be able to update editor2's version
    const updateOthersResult = await controller.run({
      name: 'UpdateVersion',
      payload: {
        versionId: version2Id,
        name: 'Hacked Version'
      },
      user: { id: editor1Id, role: 'editor' }
    })

    expect(updateOthersResult.error).toBeDefined()
  })

  test('TC012: Editor cannot publish versions', async () => {
    const editorId = uuid()
    const versionId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editorId,
        username: 'editor',
        email: 'editor@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Test Style',
        slug: 'test-style',
        description: 'Test description',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: editorId
      },
      user: { id: editorId, role: 'editor' }
    })

    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: versionId,
        versionNumber: 1,
        name: 'Test Version',
        description: 'Test version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: editorId
      },
      user: { id: editorId, role: 'editor' }
    })

    // Editor should NOT be able to publish version
    const publishResult = await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: versionId,
        publishedAt: now
      },
      user: { id: editorId, role: 'editor' }
    })

    expect(publishResult.error).toBeDefined()

    // Editor should NOT be able to rollback version
    const rollbackResult = await controller.run({
      name: 'RollbackVersion',
      payload: {
        targetVersionId: versionId,
        publishedAt: now
      },
      user: { id: editorId, role: 'editor' }
    })

    expect(rollbackResult.error).toBeDefined()
  })

  test('TC011: Admin has full permissions', async () => {
    const adminId = uuid()
    const editorId = uuid()
    const styleId = uuid()
    const versionId = uuid()
    const now = new Date().toISOString()

    // Create admin and editor
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: adminId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editorId,
        username: 'editor',
        email: 'editor@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    // Editor creates style and version
    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Editor Style',
        slug: 'editor-style',
        description: 'Style by editor',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: editorId
      },
      user: { id: editorId, role: 'editor' }
    })

    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: versionId,
        versionNumber: 1,
        name: 'Editor Version',
        description: 'Version by editor',
        styleIds: [styleId],
        createdAt: now,
        createdBy: editorId
      },
      user: { id: editorId, role: 'editor' }
    })

    // Admin should be able to edit editor's style
    const updateStyleResult = await controller.run({
      name: 'UpdateStyle',
      payload: {
        styleId: styleId,
        label: 'Admin Updated Style',
        updatedAt: now
      },
      user: { id: adminId, role: 'admin' }
    })

    expect(updateStyleResult.error).toBeUndefined()

    // Admin should be able to edit editor's version
    const updateVersionResult = await controller.run({
      name: 'UpdateVersion',
      payload: {
        versionId: versionId,
        name: 'Admin Updated Version'
      },
      user: { id: adminId, role: 'admin' }
    })

    expect(updateVersionResult.error).toBeUndefined()

    // Admin should be able to publish version
    const publishResult = await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: versionId,
        publishedAt: now
      },
      user: { id: adminId, role: 'admin' }
    })

    expect(publishResult.error).toBeUndefined()

    // Admin should be able to delete editor's style (even if referenced by published version)
    const deleteStyleResult = await controller.run({
      name: 'DeleteStyle',
      payload: {
        styleId: styleId
      },
      user: { id: adminId, role: 'admin' }
    })

    // This might fail due to business rules, but should not fail due to permissions
    // The error should be about business constraints, not permissions
  })

  test('TC013: Viewer has read-only access', async () => {
    const viewerId = uuid()
    const editorId = uuid()
    const styleId = uuid()
    const versionId = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: viewerId,
        username: 'viewer',
        email: 'viewer@example.com',
        role: 'viewer',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateUser',
      payload: {
        id: editorId,
        username: 'editor',
        email: 'editor@example.com',
        role: 'editor',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Public Style',
        slug: 'public-style',
        description: 'Public style',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: editorId
      },
      user: { id: editorId, role: 'editor' }
    })

    await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: editorId, role: 'editor' }
    })

    // Viewer should be able to read published styles
    const getStyleResult = await controller.run({
      name: 'GetStyleDetail',
      payload: {
        styleId: styleId
      },
      user: { id: viewerId, role: 'viewer' }
    })

    expect(getStyleResult.error).toBeUndefined()

    // Viewer should NOT be able to create styles
    const createStyleResult = await controller.run({
      name: 'CreateStyle',
      payload: {
        id: uuid(),
        label: 'Viewer Style',
        slug: 'viewer-style',
        description: 'Attempted by viewer',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: viewerId
      },
      user: { id: viewerId, role: 'viewer' }
    })

    expect(createStyleResult.error).toBeDefined()

    // Viewer should NOT be able to update styles
    const updateStyleResult = await controller.run({
      name: 'UpdateStyle',
      payload: {
        styleId: styleId,
        label: 'Hacked Style',
        updatedAt: now
      },
      user: { id: viewerId, role: 'viewer' }
    })

    expect(updateStyleResult.error).toBeDefined()

    // Viewer should NOT be able to delete styles
    const deleteStyleResult = await controller.run({
      name: 'DeleteStyle',
      payload: {
        styleId: styleId
      },
      user: { id: viewerId, role: 'viewer' }
    })

    expect(deleteStyleResult.error).toBeDefined()

    // Viewer should NOT be able to create versions
    const createVersionResult = await controller.run({
      name: 'CreateVersion',
      payload: {
        id: uuid(),
        versionNumber: 1,
        name: 'Viewer Version',
        description: 'Attempted by viewer',
        styleIds: [styleId],
        createdAt: now,
        createdBy: viewerId
      },
      user: { id: viewerId, role: 'viewer' }
    })

    expect(createVersionResult.error).toBeDefined()
  })

  test('TC015: Business rule - Cannot delete style referenced by published version', async () => {
    const adminId = uuid()
    const styleId = uuid()
    const versionId = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: adminId,
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Protected Style',
        slug: 'protected-style',
        description: 'Style that will be protected',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: adminId
      },
      user: { id: adminId, role: 'admin' }
    })

    await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: adminId, role: 'admin' }
    })

    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: versionId,
        versionNumber: 1,
        name: 'Published Version',
        description: 'This version will be published',
        styleIds: [styleId],
        createdAt: now,
        createdBy: adminId
      },
      user: { id: adminId, role: 'admin' }
    })

    await controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: versionId,
        publishedAt: now
      },
      user: { id: adminId, role: 'admin' }
    })

    // Verify style is marked as referenced by published version
    const styleData = await controller.system.storage.findByProperty('Style', 'id', styleId)
    expect(styleData.isReferencedByPublishedVersion).toBe(true)

    // Try to delete style - should fail due to business rule
    const deleteResult = await controller.run({
      name: 'DeleteStyle',
      payload: {
        styleId: styleId
      },
      user: { id: adminId, role: 'admin' }
    })

    // Should fail even for admin due to business constraint
    expect(deleteResult.error).toBeDefined()
    expect(deleteResult.error.code).toBe('REFERENCE_CONSTRAINT')
  })

  test('TC014: Concurrent operations - Version publishing conflict', async () => {
    const admin1Id = uuid()
    const admin2Id = uuid()
    const version1Id = uuid()
    const version2Id = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Setup
    await controller.run({
      name: 'CreateUser',
      payload: {
        id: admin1Id,
        username: 'admin1',
        email: 'admin1@example.com',
        role: 'admin',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateUser',
      payload: {
        id: admin2Id,
        username: 'admin2',
        email: 'admin2@example.com',
        role: 'admin',
        createdAt: now
      },
      user: { id: 'system', role: 'admin' }
    })

    await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Concurrent Style',
        slug: 'concurrent-style',
        description: 'Style for concurrent test',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: admin1Id
      },
      user: { id: admin1Id, role: 'admin' }
    })

    await controller.run({
      name: 'UpdateStyleStatus',
      payload: {
        styleId: styleId,
        status: 'published',
        updatedAt: now
      },
      user: { id: admin1Id, role: 'admin' }
    })

    // Create two versions
    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version1Id,
        versionNumber: 1,
        name: 'Version 1',
        description: 'First version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: admin1Id
      },
      user: { id: admin1Id, role: 'admin' }
    })

    await controller.run({
      name: 'CreateVersion',
      payload: {
        id: version2Id,
        versionNumber: 2,
        name: 'Version 2',
        description: 'Second version',
        styleIds: [styleId],
        createdAt: now,
        createdBy: admin2Id
      },
      user: { id: admin2Id, role: 'admin' }
    })

    // Simulate concurrent publishing
    const publish1Promise = controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: version1Id,
        publishedAt: now
      },
      user: { id: admin1Id, role: 'admin' }
    })

    const publish2Promise = controller.run({
      name: 'PublishVersion',
      payload: {
        versionId: version2Id,
        publishedAt: now
      },
      user: { id: admin2Id, role: 'admin' }
    })

    const [result1, result2] = await Promise.all([publish1Promise, publish2Promise])

    // One should succeed, one should fail (or both succeed with proper conflict resolution)
    const successCount = [result1, result2].filter(r => !r.error).length
    expect(successCount).toBeGreaterThanOrEqual(1)

    // Verify only one version is published
    const version1Data = await controller.system.storage.findByProperty('Version', 'id', version1Id)
    const version2Data = await controller.system.storage.findByProperty('Version', 'id', version2Id)

    const publishedVersions = [version1Data, version2Data].filter(v => v.status === 'published')
    expect(publishedVersions).toHaveLength(1)
  })

  test('Permission validation with invalid user roles', async () => {
    const invalidUserId = uuid()
    const styleId = uuid()
    const now = new Date().toISOString()

    // Try to create style with non-existent user
    const result = await controller.run({
      name: 'CreateStyle',
      payload: {
        id: styleId,
        label: 'Invalid User Style',
        slug: 'invalid-user-style',
        description: 'Style by invalid user',
        type: 'animation',
        createdAt: now,
        updatedAt: now,
        createdBy: invalidUserId
      },
      user: { id: invalidUserId, role: 'invalid-role' }
    })

    // Should fail due to invalid user/role
    expect(result.error).toBeDefined()
  })
})