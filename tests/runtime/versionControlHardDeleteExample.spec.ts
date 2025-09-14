import { describe, expect, test } from "vitest";
import {
  Controller,
  MonoSystem,
  Entity,
  Property,
  StateMachine,
  StateNode,
  StateTransfer,
  Interaction,
  InteractionEventEntity,
  Action,
  Payload,
  PayloadItem,
  Transform,
  Dictionary,
  DICTIONARY_RECORD,
  MatchExp,
  RecordMutationEvent,
  DictionaryEntity,
  HardDeletionProperty,
  DELETED_STATE,
  NON_DELETED_STATE,
  HARD_DELETION_PROPERTY_NAME,
  PropertyStateMachineHandle
} from 'interaqt';

describe('Version Control Example with Hard Delete', () => {
  test('Style entity with version control using hard deletion', async () => {
    
    // Define VersionedStyle entity - this is the actual entity that stores all versions
    const VersionedStyle = Entity.create({
      name: 'VersionedStyle',
      properties: [
        Property.create({ name: 'content', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'version', type: 'number' }), // Version identifier
        Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
        // Use HardDeletionProperty instead of custom isDeleted
        HardDeletionProperty.create()
      ]
    });

    // Create style interaction
    const CreateStyle = Interaction.create({
      name: 'CreateStyle',
      action: Action.create({ name: 'createStyle' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'content', type: 'string', required: true })
        ]
      })
    });

    // Publish style interaction
    const PublishStyle = Interaction.create({
      name: 'PublishStyle',
      action: Action.create({ name: 'publishStyle' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'styleId', type: 'string', required: true })
        ]
      })
    });

    // Rollback interaction
    const RollbackVersion = Interaction.create({
      name: 'RollbackVersion',
      action: Action.create({ name: 'rollbackVersion' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'version', type: 'number', required: true })
        ]
      })
    });

    const OfflineStyle = Interaction.create({
      name: 'OfflineStyle',
      action: Action.create({ name: 'offlineStyle' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'styleId', type: 'string', required: true })
        ]
      })
    });
    
    // Define states for status
    const draftState = StateNode.create({ 
      name: 'draft',
      computeValue: (lastValue, mutationEvent) => {
        // Support transform to set initial state
        return lastValue || 'draft';
      }
    });
    const publishedState = StateNode.create({ name: 'published' });
    const offlineState = StateNode.create({ name: 'offline' });

    const statusProperty = VersionedStyle.properties!.find(p => p.name === 'status')!;
    statusProperty.computation = StateMachine.create({
      states: [draftState, publishedState, offlineState],
      defaultState: draftState,
      transfers: [
        StateTransfer.create({ 
          trigger: { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: OfflineStyle.name } }, 
          current: publishedState, 
          next: offlineState,
          computeTarget: (mutationEvent: RecordMutationEvent) => ({ id: mutationEvent.record!.payload.styleId })
        })
      ]
    });

    // Define dictionary for currentVersionInfo
    const currentVersionInfo = Dictionary.create({
      name: 'currentVersionInfo',
      type: 'object',
      defaultValue: () => ({ version: 0 })
    });

    // Define state for version info changes
    const versionUpdatedState = StateNode.create({
      name: 'versionUpdated',
      computeValue: (lastValue, mutationEvent) => {
        const event = mutationEvent?.record;
        if (!event) return lastValue || { version: 0 };

        const timestamp = Math.floor(Date.now()/1000);
        const newVersion = lastValue.version + 1;

        if (event.interactionName === 'PublishStyle') {
          return {
            version: newVersion,
            publishedAt: timestamp,
            publishedStyleId: event.payload.styleId,
            type: 'publish'
          };
        } else if (event.interactionName === 'RollbackVersion') {
          return {
            version: newVersion,
            fromVersion: lastValue.version,
            rollbackTo: event.payload.version,
            rollbackAt: timestamp,
            type: 'rollback'
          };
        }
        return lastValue || { version: 0 };
      }
    });

    // StateMachine for currentVersionInfo
    currentVersionInfo.computation = StateMachine.create({
      states: [versionUpdatedState],
      defaultState: versionUpdatedState,
      transfers: [
        StateTransfer.create({
          current: versionUpdatedState,
          next: versionUpdatedState,
          trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
              interactionName: 'PublishStyle'
            }
          },
        }),
        StateTransfer.create({
          current: versionUpdatedState,
          next: versionUpdatedState,
          trigger: {
            recordName: InteractionEventEntity.name,
            type: 'create',
            record: {
              interactionName: 'RollbackVersion'
            }
          }
        })
      ]
    });

    // Transform for VersionedStyle - handles creation and version copying
    VersionedStyle.computation = Transform.create({
      eventDeps: {
        // Monitor style creation
        StyleCreate: {
          recordName: InteractionEventEntity.name,
          type: 'create'
        },
        // Monitor version info updates for publish/rollback
        VersionUpdate: {
          recordName: DICTIONARY_RECORD,
          type: 'update'
        }
      },
      callback: async function(this: Controller, mutationEvent: RecordMutationEvent) {
        const event = mutationEvent.record!;

        // Handle style creation
        if (mutationEvent.type === 'create' && event.interactionName === 'CreateStyle') {
          // Get current version info
          let versionInfo = await this.system.storage.dict.get('currentVersionInfo');
          
          return {
            content: event.payload.content,
            status: 'draft',
            version: versionInfo.version,
            createdAt: Math.floor(Date.now()/1000)
          };
        }

        // Handle version updates (publish/rollback)
        if (mutationEvent.type === 'update' && event.key === 'currentVersionInfo') {
          const versionInfo = event.value.raw;

          if (versionInfo.type === 'publish') {
            // Copy all current version styles to new version
            const currentStyles = await this.system.storage.find('VersionedStyle',
              MatchExp.atom({ key: 'version', value: ['=', versionInfo.version - 1] }),
              undefined,
              ['*']
            );

            return currentStyles.map(style => {
              return {
                ...style,
                id: undefined,
                version: versionInfo.version,
                createdAt: versionInfo.publishedAt,
                status: style.id === versionInfo.publishedStyleId ? 'published' : style.status
              }
            });
          } else if (versionInfo.type === 'rollback') {
            // Copy styles from rollback target version
            const targetStyles = await this.system.storage.find('VersionedStyle',
              MatchExp.atom({ key: 'version', value: ['=', versionInfo.rollbackTo] }),
              undefined,
              ['*']
            );

            return targetStyles.map(style => ({
              ...style,
              id: undefined,
              version: versionInfo.version,
              createdAt: versionInfo.rollbackAt,
            }));
          }
        }

        return null;
      }
    });

    // Configure deletion for the HardDeletionProperty
    const hardDeletionProperty = VersionedStyle.properties!.find(p => p.name === HARD_DELETION_PROPERTY_NAME)!;
    hardDeletionProperty.computation = StateMachine.create({
      states: [NON_DELETED_STATE, DELETED_STATE],
      defaultState: NON_DELETED_STATE,
      transfers: [
        StateTransfer.create({ 
          current: NON_DELETED_STATE, 
          next: DELETED_STATE, 
          trigger: { 
            recordName: DictionaryEntity.name, 
            type: 'update', 
            record: { key: 'currentVersionInfo' } 
          },
          computeTarget: async function(this: Controller, mutationEvent: RecordMutationEvent) {
            const rollbackTo = mutationEvent.record!.value.raw.rollbackTo;
            if (rollbackTo !== undefined) {
              const fromVersion = mutationEvent.record!.value.raw.fromVersion;
              // Return all styles from the old version to be deleted
              const styles = await this.system.storage.find('VersionedStyle',
                MatchExp.atom({ key: 'version', value: ['=', fromVersion] }),
                undefined,
                ['id']
              );
              return styles.map(s => ({ id: s.id }));
            }
          }
        })
      ]
    });
    
    // Define User entity (needed for interaction calls)
    const User = Entity.create({
      name: 'User',
      properties: [
        Property.create({ name: 'name', type: 'string' })
      ]
    });

    // Setup system and controller
    const system = new MonoSystem();
    const controller = new Controller({
      system: system,
      entities: [User, VersionedStyle],
      relations: [],
      interactions: [CreateStyle, PublishStyle, RollbackVersion, OfflineStyle],
      dict: [currentVersionInfo]
    });
    await controller.setup(true);

    // Test scenario
    const user = await system.storage.create('User', { name: 'testUser' });

    // 1. Create initial styles
    await controller.callInteraction('CreateStyle', {
      user,
      payload: { content: 'Style 1 content' }
    });

    await controller.callInteraction('CreateStyle', {
      user,
      payload: { content: 'Style 2 content' }
    });

    // Wait for async Transform to process
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check initial styles
    let styles = await system.storage.find('VersionedStyle',
      undefined,
      undefined,
      ['id', 'content', 'status', 'version']
    );
    console.log('Initial styles:', styles);
    expect(styles).toHaveLength(2);
    expect(styles[0].status).toBe('draft');
    expect(styles[1].status).toBe('draft');
    expect(styles[0].version).toBe(0);

    // 2. Publish one style
    const styleToPublish = styles.find(s => s.content === 'Style 1 content')!;
    const publishResult = await controller.callInteraction('PublishStyle', {
      user,
      payload: { styleId: styleToPublish.id }
    });
    expect(publishResult.error).toBeUndefined();

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check version info
    let versionInfo1 = await system.storage.dict.get('currentVersionInfo');
    console.log('Version info after publish:', versionInfo1);
    expect(versionInfo1).toBeDefined();
    expect(versionInfo1.type).toBe('publish');
    expect(versionInfo1.version).toBe(1);

    // Check styles after publish
    styles = await system.storage.find('VersionedStyle',
      undefined,
      undefined,
      ['id', 'content', 'status', 'version']
    );
    console.log('Styles after publish:', styles);
    
    // Should have both old and new version
    const version0Styles = styles.filter(s => s.version === 0);
    const version1Styles = styles.filter(s => s.version === versionInfo1.version);
    expect(version0Styles).toHaveLength(2); // Original version still exists
    expect(version1Styles).toHaveLength(2); // New version created
    
    const styleBeforePublished = version0Styles.find(s => s.content === 'Style 1 content');
    expect(styleBeforePublished).toBeDefined();
    expect(styleBeforePublished.status).toBe('draft');

    // Check the published style in new version
    const publishedStyle = version1Styles.find(s => s.content === 'Style 1 content');
    const otherStyle = version1Styles.find(s => s.content === 'Style 2 content');
    
    expect(publishedStyle).toBeDefined();
    expect(otherStyle).toBeDefined();
    expect(publishedStyle.status).toBe('published');
    expect(otherStyle.status).toBe('draft');

    // 3. Create another style and publish again
    await controller.callInteraction('CreateStyle', {
      user,
      payload: { content: 'Style 3 content' }
    });

    await controller.callInteraction('PublishStyle', {
      user,
      payload: { styleId: version1Styles[1].id }
    });

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 200));

    // Create another style
    await controller.callInteraction('CreateStyle', {
      user,
      payload: { content: 'Style 4 content' }
    });

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 200));

    let versionInfo2 = await system.storage.dict.get('currentVersionInfo');
    const version2 = versionInfo2?.version;
    console.log('Version 2:', version2);

    // Check styles before rollback
    const stylesBeforeRollback = await system.storage.find('VersionedStyle',
      undefined,
      undefined,
      ['id', 'content', 'version']
    );
    console.log('Styles before rollback:', stylesBeforeRollback);

    // 4. Rollback to first version
    await controller.callInteraction('RollbackVersion', {
      user,
      payload: { version: versionInfo1.version }
    });

    // Wait for hard deletion to occur
    await new Promise(resolve => setTimeout(resolve, 300));

    // Check rollback results
    let versionInfo3 = await system.storage.dict.get('currentVersionInfo');
    expect(versionInfo3).toBeDefined();
    expect(versionInfo3.type).toBe('rollback');
    expect(versionInfo3.rollbackTo).toBe(versionInfo1.version);

    // Check final styles - old current version should be hard deleted
    const finalStyles = await system.storage.find('VersionedStyle',
      undefined,
      undefined,
      ['id', 'content', 'status', 'version']
    );
    console.log('Final styles after rollback:', finalStyles);

    // Version 2 styles should be hard deleted
    const version2StylesAfterRollback = finalStyles.filter(s => s.version === version2);
    expect(version2StylesAfterRollback).toHaveLength(0); // Hard deleted!

    // Should have styles from the rollback version (version 3)
    const rollbackStyles = finalStyles.filter(s => s.version === versionInfo3.version);
    expect(rollbackStyles).toHaveLength(3); // 3 styles from version 1
    expect(rollbackStyles.find(s => s.content === 'Style 1 content')).toBeDefined();
    expect(rollbackStyles.find(s => s.content === 'Style 2 content')).toBeDefined();
    expect(rollbackStyles.find(s => s.content === 'Style 3 content')).toBeDefined();
    
    // Style 4 should not exist as it was created in version 2 which was deleted
    expect(rollbackStyles.find(s => s.content === 'Style 4 content')).toBeUndefined();

    // Verify total count - should only have version 0, 1, and 3 (rollback version)
    const version0Count = finalStyles.filter(s => s.version === 0).length;
    const version1Count = finalStyles.filter(s => s.version === 1).length;
    const version3Count = finalStyles.filter(s => s.version === versionInfo3.version).length;
    
    console.log(`Version 0: ${version0Count}, Version 1: ${version1Count}, Version 3: ${version3Count}`);
    expect(finalStyles.length).toBe(version0Count + version1Count + version3Count);

    
  });
});
