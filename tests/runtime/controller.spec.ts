import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Transform, BoolExp, Controller, MonoSystem } from 'interaqt';
import { PGLiteDB } from '@dbclients';

describe('Controller stateless deployment', () => {
  test('should preserve existing data when calling setup() multiple times', async () => {
    // 1.1 Create entities with transform computation
    const SourceEntity = Entity.create({
      name: 'Source',
      properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'value', type: 'number' })
      ]
    });

    const ComputedEntity = Entity.create({
      name: 'Computed',
      properties: [
        Property.create({ name: 'sourceName', type: 'string' }),
        Property.create({ name: 'computedValue', type: 'number' })
      ],
      computation: Transform.create({
        record: SourceEntity,
        attributeQuery: ['name', 'value'],
        callback: (source: any) => {
          return {
            sourceName: source.name,
            computedValue: source.value * 2
          };
        }
      })
    });

    // Create a relation with transform computation
    const SourceRelation = Relation.create({
      name: 'SourceRelation',
      source: SourceEntity,
      sourceProperty: 'relatedSources',
      target: SourceEntity,
      targetProperty: 'relatedBy',
      type: 'n:n',
      properties: [
        Property.create({ name: 'strength', type: 'number' })
      ]
    });

    const ComputedRelation = Relation.create({
      name: 'ComputedRelation',
      source: SourceEntity,
      sourceProperty: 'computedRelatedSources',
      target: SourceEntity,
      targetProperty: 'computedRelatedBy',
      type: 'n:n',
      properties: [
        Property.create({ name: 'doubleStrength', type: 'number' })
      ],
      computation: Transform.create({
        record: SourceRelation,
        attributeQuery: ['source', 'target', 'strength'],
        callback: (rel: any) => {
          return {
            source: { id: rel.source.id },
            target: { id: rel.target.id },
            doubleStrength: (rel.strength || 0) * 2
          };
        }
      })
    });

    const entities = [SourceEntity, ComputedEntity];
    const relations = [SourceRelation, ComputedRelation];

    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system: system,
      entities: entities,
      relations: relations,
      interactions: []
    });

    // 1.1 Initial setup with install=true to create database tables
    await controller.setup(true);

    // 1.2 Add data directly using controller.system.storage
    // Add entities
    const source1 = await controller.system.storage.create('Source', { name: 'Source1', value: 10 });
    const source2 = await controller.system.storage.create('Source', { name: 'Source2', value: 20 });
    
    // Add relation
    const relation1 = await controller.system.storage.create('SourceRelation', {
      source: { id: source1.id },
      target: { id: source2.id },
      strength: 5
    });

    // Add dictionary data
    await controller.system.storage.dict.set('testDictKey', { count: 42 });

    // Verify data exists
    const sourcesBeforeRestart = await controller.system.storage.find('Source', undefined, undefined, ['*']);
    expect(sourcesBeforeRestart).toHaveLength(2);
    
    const computedBeforeRestart = await controller.system.storage.find('Computed', undefined, undefined, ['*']);
    expect(computedBeforeRestart).toHaveLength(2);
    
    const sourceRelationsBeforeRestart = await controller.system.storage.find('SourceRelation', undefined, undefined, ['*']);
    expect(sourceRelationsBeforeRestart).toHaveLength(1);
    
    const computedRelationsBeforeRestart = await controller.system.storage.find('ComputedRelation', undefined, undefined, ['*']);
    expect(computedRelationsBeforeRestart).toHaveLength(1);
    
    const dictValueBeforeRestart = await controller.system.storage.dict.get('testDictKey');
    expect(dictValueBeforeRestart).toEqual({ count: 42 });

    // 1.3 Simulate stateless worker restart by calling setup() again
    // This should NOT delete existing data
    await controller.setup();

    // 1.4 Verify data still exists after second setup
    const sourcesAfterRestart = await controller.system.storage.find('Source', undefined, undefined, ['*']);
    expect(sourcesAfterRestart).toHaveLength(2);
    expect(sourcesAfterRestart.map((s: any) => s.name).sort()).toEqual(['Source1', 'Source2']);
    
    const computedAfterRestart = await controller.system.storage.find('Computed', undefined, undefined, ['*']);
    expect(computedAfterRestart).toHaveLength(2);
    expect(computedAfterRestart.find((c: any) => c.sourceName === 'Source1')?.computedValue).toBe(20);
    expect(computedAfterRestart.find((c: any) => c.sourceName === 'Source2')?.computedValue).toBe(40);
    
    const sourceRelationsAfterRestart = await controller.system.storage.find('SourceRelation', undefined, undefined, ['*']);
    expect(sourceRelationsAfterRestart).toHaveLength(1);
    expect(sourceRelationsAfterRestart[0].strength).toBe(5);
    
    const computedRelationsAfterRestart = await controller.system.storage.find('ComputedRelation', undefined, undefined, ['*']);
    expect(computedRelationsAfterRestart).toHaveLength(1);
    expect(computedRelationsAfterRestart[0].doubleStrength).toBe(10);
    
    const dictValueAfterRestart = await controller.system.storage.dict.get('testDictKey');
    expect(dictValueAfterRestart).toEqual({ count: 42 });
  });
});
