import { describe, expect, test } from "vitest";
import { Entity, Property } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
  Controller,
  MonoSystem, StateMachine,
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
  DictionaryEntity
} from 'interaqt';

describe('Version Control Example', () => {
  test('Style entity with version control', async () => {
    
    // Define VersionedStyle entity - this is the actual entity that stores all versions
    const VersionedStyle = Entity.create({
      name: 'VersionedStyle',
      properties: [
        Property.create({ name: 'content', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'version', type: 'number' }), // Version identifier
        Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
        Property.create({ name: 'isDeleted', type: 'boolean' })
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
        // 支持 transform 的时候就设置初始状态。
        return lastValue || 'draft';
      }
    });
    const publishedState = StateNode.create({ name: 'published' });
    const offlineState = StateNode.create({ name: 'offline' });


    const statusProperty = VersionedStyle.properties!.find(p => p.name === 'status')!;
    statusProperty.computation = StateMachine.create({
      states: [draftState, publishedState, offlineState],
      initialState: draftState,
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
            type: 'publish',
            publishedStyleId: event.payload.styleId
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
      initialState: versionUpdatedState,
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
            createdAt: Math.floor(Date.now()/1000),
            isDeleted: false
          };
        }

        // Handle version updates (publish/rollback)
        if (mutationEvent.type === 'update' && event.key === 'currentVersionInfo') {
          const versionInfo = event.value.raw;

          if (versionInfo.type === 'publish') {
            
            // Copy all current version styles to new version
            const currentStyles = await this.system.storage.find('VersionedStyle',
              MatchExp.atom({ key: 'isDeleted', value: ['=', false] }),
              undefined,
              ['*']
            );

            return currentStyles.map(style => ({
              ...style,
              id: undefined,
              version: versionInfo.version,
              createdAt: versionInfo.publishedAt,
              status: versionInfo.publishedStyleId === style.id ? 'published' : 'draft'
            }));
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

    const isDeletedProperty = VersionedStyle.properties!.find(p => p.name === 'isDeleted')!;
    const notDeletedState = StateNode.create({ name: 'notDeleted', computeValue: (lastValue, mutationEvent) => lastValue || false });
    const deletedState = StateNode.create({ name: 'deleted', computeValue: (lastValue, mutationEvent) => lastValue || true });
    isDeletedProperty.computation = StateMachine.create({
      states: [notDeletedState, deletedState],
      initialState: notDeletedState,
      transfers: [
        StateTransfer.create({ 
          current: notDeletedState, 
          next: deletedState, 
          trigger: { 
            recordName: DictionaryEntity.name, 
            type: 'update', 
            record: { key: 'currentVersionInfo' } 
          },
          computeTarget: async function(this: Controller, mutationEvent: RecordMutationEvent) {
            const rollbackTo = mutationEvent.record!.value.raw.rollbackTo;
            if (rollbackTo !== undefined) {
              const fromVersion = mutationEvent.record!.value.raw.fromVersion;
              const styles = await this.system.storage.find('VersionedStyle',
                MatchExp.atom({ key: 'version', value: ['=', fromVersion] }),
                undefined,
                ['*']
              );
              return styles
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
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system: system,
      entities: [User, VersionedStyle],
      relations: [],
      eventSources: [CreateStyle, PublishStyle, RollbackVersion, OfflineStyle],
      dict: [currentVersionInfo]
    });
    await controller.setup(true);

    // Test scenario
    const user = await system.storage.create('User', { name: 'testUser' });

    // 1. Create initial styles
    await controller.dispatch(CreateStyle, {
      user,
      payload: { content: 'Style 1 content' }
    });

    await controller.dispatch(CreateStyle, {
      user,
      payload: { content: 'Style 2 content' }
    });

    // Wait for async Transform to process
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check InteractionEventEntity was created
    const events = await system.storage.find(InteractionEventEntity.name,
      undefined,
      undefined,
      ['interactionName', 'payload']
    );
    console.log('Interaction events:', events);
    
    // Check all VersionedStyle records (not just non-deleted)
    const allStyles = await system.storage.find('VersionedStyle',
      undefined,
      undefined,
      ['content', 'status', 'version', 'isDeleted']
    );
    console.log('All VersionedStyle records:', allStyles);

    // Check initial styles
    let styles = await system.storage.find('VersionedStyle',
      MatchExp.atom({ key: 'isDeleted', value: ['=', false] }),
      undefined,
      ['content', 'status', 'version']
    );
    console.log('Found styles:', styles);
    expect(styles).toHaveLength(2);
    expect(styles[0].status).toBe('draft');
    expect(styles[1].status).toBe('draft');
    expect(styles[0].version).toBe(0);

    // 2. Publish one style
    const styleToPublish = styles[0];
    const publishResult = await controller.dispatch(PublishStyle, {
      user,
      payload: { styleId: styleToPublish.id }
    });
    expect(publishResult.error).toBeUndefined();

    // Check version info
    let versionInfo1 = await system.storage.dict.get('currentVersionInfo');
    console.log('Version info after publish:', versionInfo1);
    expect(versionInfo1).toBeDefined();
    expect(versionInfo1.type).toBe('publish');
    expect(versionInfo1.version).toBe(1);

    // Check styles after publish
    styles = await system.storage.find('VersionedStyle',
      MatchExp.atom({ key: 'isDeleted', value: ['=', false] }),
      undefined,
      ['id', 'content', 'status', 'version']
    );
    
    // Should have new version copies
    const newVersionStyles = styles.filter(s => s.version === versionInfo1.version);
    expect(newVersionStyles).toHaveLength(2);
    
    // Find the style that was published (same content as the original)
    const publishedStyle = newVersionStyles.find(s => s.content === 'Style 1 content');
    const otherStyle = newVersionStyles.find(s => s.content === 'Style 2 content');
    
    expect(publishedStyle).toBeDefined();
    expect(otherStyle).toBeDefined();
    expect(publishedStyle.status).toBe('published');
    expect(otherStyle.status).toBe('draft');

    // 3. Create another style and publish again
    await controller.dispatch(CreateStyle, {
      user,
      payload: { content: 'Style 3 content' }
    });

    await controller.dispatch(PublishStyle, {
      user,
      payload: { styleId: styles[1].id }
    });

    // create another and rollback
    await controller.dispatch(CreateStyle, {
      user,
      payload: { content: 'Style 4 content' }
    });

    let versionInfo2;
    versionInfo2 = await system.storage.dict.get('currentVersionInfo');
    const version2 = versionInfo2?.version;

    // 4. Rollback to first version
    await controller.dispatch(RollbackVersion, {
      user,
      payload: { version: versionInfo1.version }
    });


    // Check rollback results
    let versionInfo3 = await system.storage.dict.get('currentVersionInfo');
    expect(versionInfo3).toBeDefined();
    expect(versionInfo3.type).toBe('rollback');
    expect(versionInfo3.rollbackTo).toBe(versionInfo1.version);

    // Check final styles
    const finalStyles = await system.storage.find('VersionedStyle',
      MatchExp.atom({ key: 'isDeleted', value: ['=', false] }),
      undefined,
      ['content', 'status', 'version']
    );

    // Should have styles from the rollback target version
    const rollbackStyles = finalStyles.filter(s => s.version === versionInfo3.version);
    expect(rollbackStyles).toHaveLength(3);
    expect(rollbackStyles.find(s => s.content === 'Style 1 content')).toBeDefined();
    expect(rollbackStyles.find(s => s.content === 'Style 2 content')).toBeDefined();
    expect(rollbackStyles.find(s => s.content === 'Style 3 content')).toBeDefined(); // Style 3 was not in version 1

    // Verify old current version is marked as deleted
    const deletedStyles = await system.storage.find('VersionedStyle',
      MatchExp.atom({ key: 'version', value: ['=', version2] })
        .and({ key: 'isDeleted', value: ['=', true] }),
      undefined,
      ['content']
    );
    expect(deletedStyles.length).toBeGreaterThan(0);
  });
});
