import { describe, it, expect } from 'vitest';
import { Entity, Relation, Property, RefContainer } from '../../src/shared/index.js';
import type { EntityInstance, RelationInstance, PropertyInstance } from '../../src/shared/index.js';

describe('RefContainer', () => {
  // Helper function to create test entities
  function createTestEntity(name: string): EntityInstance {
    return Entity.create({
      name,
      properties: [
        Property.create({ name: 'id', type: 'string' }),
        Property.create({ name: 'value', type: 'string' })
      ]
    });
  }

  // Helper function to create test relation
  function createTestRelation(
    source: EntityInstance,
    target: EntityInstance,
    name?: string
  ): RelationInstance {
    return Relation.create({
      name,
      source,
      sourceProperty: 'relatedTo',
      target,
      targetProperty: 'relatedFrom',
      type: '1:n'
    });
  }

  describe('Basic functionality', () => {
    it('should create a container with entities and relations', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      const result = container.getAll();
      expect(result.entities).toHaveLength(2);
      expect(result.relations).toHaveLength(1);
    });

    it('should clone entities and relations without modifying originals', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      const result = container.getAll();
      
      // Check that cloned entities are different objects
      expect(result.entities[0]).not.toBe(entity1);
      expect(result.entities[1]).not.toBe(entity2);
      expect(result.relations[0]).not.toBe(relation);
      
      // But have the same properties
      expect(result.entities[0].name).toBe(entity1.name);
      expect(result.entities[1].name).toBe(entity2.name);
    });
  });

  describe('Entity replacement', () => {
    it('should replace an entity and update references in relations', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      // Create a new entity to replace entity1
      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);

      const result = container.getAll();
      
      // Check that the entity was replaced
      expect(result.entities[0].name).toBe('NewEntity1');
      
      // Check that the relation's source was updated
      expect(result.relations[0].source.name).toBe('NewEntity1');
      expect(result.relations[0].target.name).toBe('Entity2');
    });

    it('should handle multiple entity replacements', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const entity3 = createTestEntity('Entity3');
      const relation1 = createTestRelation(entity1, entity2);
      const relation2 = createTestRelation(entity2, entity3);

      const container = new RefContainer([entity1, entity2, entity3], [relation1, relation2]);

      // Replace entity2 with a new entity
      const newEntity2 = createTestEntity('NewEntity2');
      container.replaceEntity(newEntity2, entity2);

      const result = container.getAll();
      
      // Check that entity2 was replaced
      expect(result.entities[1].name).toBe('NewEntity2');
      
      // Check that both relations were updated
      expect(result.relations[0].target.name).toBe('NewEntity2');
      expect(result.relations[1].source.name).toBe('NewEntity2');
    });

    it('should throw error when replacing non-existent entity', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const nonExistentEntity = createTestEntity('NonExistent');

      const container = new RefContainer([entity1], []);

      expect(() => {
        container.replaceEntity(entity2, nonExistentEntity);
      }).toThrow('Entity to be replaced not found in container');
    });
  });

  describe('Relation replacement', () => {
    it('should replace a relation', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2, 'OldRelation');

      const container = new RefContainer([entity1, entity2], [relation]);

      // Create a new relation to replace the old one
      const newRelation = createTestRelation(entity1, entity2, 'NewRelation');
      container.replaceRelation(newRelation, relation);

      const result = container.getAll();
      
      // Check that the relation was replaced
      expect(result.relations[0].name).toBe('NewRelation');
    });

    it('should throw error when replacing non-existent relation', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);
      const nonExistentRelation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      expect(() => {
        container.replaceRelation(relation, nonExistentRelation);
      }).toThrow('Relation to be replaced not found in container');
    });
  });

  describe('Filtered Entity (baseEntity reference)', () => {
    it('should update baseEntity references when replacing entities', () => {
      const baseEntity = createTestEntity('BaseEntity');
      const filteredEntity = Entity.create({
        name: 'FilteredEntity',
        baseEntity: baseEntity,
        matchExpression: { status: 'active' },
        properties: []
      });

      const container = new RefContainer([baseEntity, filteredEntity], []);

      // Replace the base entity
      const newBaseEntity = createTestEntity('NewBaseEntity');
      container.replaceEntity(newBaseEntity, baseEntity);

      const result = container.getAll();
      
      // Check that the filtered entity's baseEntity was updated
      const updatedFilteredEntity = result.entities.find(e => e.name === 'FilteredEntity');
      expect(updatedFilteredEntity?.baseEntity?.name).toBe('NewBaseEntity');
    });

    it('should handle baseEntity that references a Relation', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const baseRelation = createTestRelation(entity1, entity2, 'BaseRelation');
      
      const filteredEntity = Entity.create({
        name: 'FilteredRelationEntity',
        baseEntity: baseRelation,
        matchExpression: { type: 'important' },
        properties: []
      });

      const container = new RefContainer([entity1, entity2, filteredEntity], [baseRelation]);

      // Replace the base relation
      const newRelation = createTestRelation(entity1, entity2, 'NewRelation');
      container.replaceRelation(newRelation, baseRelation);

      const result = container.getAll();
      
      // Check that the filtered entity's baseEntity was updated
      const updatedFilteredEntity = result.entities.find(e => e.name === 'FilteredRelationEntity');
      expect(updatedFilteredEntity?.baseEntity?.name).toBe('NewRelation');
    });
  });

  describe('Merged Entity (inputEntities reference)', () => {
    it('should update inputEntities references when replacing entities', () => {
      const input1 = createTestEntity('Input1');
      const input2 = createTestEntity('Input2');
      const mergedEntity = Entity.create({
        name: 'MergedEntity',
        inputEntities: [input1, input2],
        properties: []
      });

      const container = new RefContainer([input1, input2, mergedEntity], []);

      // Replace one of the input entities
      const newInput1 = createTestEntity('NewInput1');
      container.replaceEntity(newInput1, input1);

      const result = container.getAll();
      
      // Check that the merged entity's inputEntities was updated
      const updatedMergedEntity = result.entities.find(e => e.name === 'MergedEntity');
      expect(updatedMergedEntity?.inputEntities).toHaveLength(2);
      expect(updatedMergedEntity?.inputEntities?.[0].name).toBe('NewInput1');
      expect(updatedMergedEntity?.inputEntities?.[1].name).toBe('Input2');
    });

    it('should handle multiple replacements in inputEntities', () => {
      const input1 = createTestEntity('Input1');
      const input2 = createTestEntity('Input2');
      const input3 = createTestEntity('Input3');
      const mergedEntity = Entity.create({
        name: 'MergedEntity',
        inputEntities: [input1, input2, input3],
        properties: []
      });

      const container = new RefContainer([input1, input2, input3, mergedEntity], []);

      // Replace all input entities
      const newInput1 = createTestEntity('NewInput1');
      const newInput2 = createTestEntity('NewInput2');
      const newInput3 = createTestEntity('NewInput3');
      
      container.replaceEntity(newInput1, input1);
      container.replaceEntity(newInput2, input2);
      container.replaceEntity(newInput3, input3);

      const result = container.getAll();
      
      // Check that all inputEntities were updated
      const updatedMergedEntity = result.entities.find(e => e.name === 'MergedEntity');
      expect(updatedMergedEntity?.inputEntities).toHaveLength(3);
      expect(updatedMergedEntity?.inputEntities?.[0].name).toBe('NewInput1');
      expect(updatedMergedEntity?.inputEntities?.[1].name).toBe('NewInput2');
      expect(updatedMergedEntity?.inputEntities?.[2].name).toBe('NewInput3');
    });
  });

  describe('Filtered Relation (baseRelation reference)', () => {
    it('should update baseRelation references when replacing relations', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const baseRelation = createTestRelation(entity1, entity2, 'BaseRelation');
      
      const filteredRelation = Relation.create({
        name: 'FilteredRelation',
        sourceProperty: 'filtered',
        targetProperty: 'filtered',
        baseRelation: baseRelation,
        matchExpression: { priority: 'high' }
      });

      const container = new RefContainer([entity1, entity2], [baseRelation, filteredRelation]);

      // Replace the base relation
      const newBaseRelation = createTestRelation(entity1, entity2, 'NewBaseRelation');
      container.replaceRelation(newBaseRelation, baseRelation);

      const result = container.getAll();
      
      // Check that the filtered relation's baseRelation was updated
      const updatedFilteredRelation = result.relations.find(r => r.name === 'FilteredRelation');
      expect(updatedFilteredRelation?.baseRelation?.name).toBe('NewBaseRelation');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle chain of references', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const entity3 = createTestEntity('Entity3');
      
      const relation1 = createTestRelation(entity1, entity2, 'Relation1');
      const relation2 = createTestRelation(entity2, entity3, 'Relation2');
      
      // Create a filtered relation based on relation1
      const filteredRelation = Relation.create({
        name: 'FilteredRelation',
        sourceProperty: 'filtered',
        targetProperty: 'filtered',
        baseRelation: relation1,
        matchExpression: { active: true }
      });

      const container = new RefContainer(
        [entity1, entity2, entity3], 
        [relation1, relation2, filteredRelation]
      );

      // Replace entity2
      const newEntity2 = createTestEntity('NewEntity2');
      container.replaceEntity(newEntity2, entity2);

      const result = container.getAll();
      
      // Check that all references to entity2 were updated
      expect(result.relations[0].target.name).toBe('NewEntity2'); // relation1
      expect(result.relations[1].source.name).toBe('NewEntity2'); // relation2
      
      // The filtered relation should still reference the updated relation1
      const updatedFilteredRelation = result.relations.find(r => r.name === 'FilteredRelation');
      expect(updatedFilteredRelation?.baseRelation).toBe(result.relations[0]);
    });

    it('should handle circular references (relation with source and target as same entity)', () => {
      const entity = createTestEntity('SelfReferencingEntity');
      const selfRelation = Relation.create({
        name: 'SelfRelation',
        source: entity,
        sourceProperty: 'parent',
        target: entity,
        targetProperty: 'children',
        type: '1:n'
      });

      const container = new RefContainer([entity], [selfRelation]);

      // Replace the entity
      const newEntity = createTestEntity('NewSelfReferencingEntity');
      container.replaceEntity(newEntity, entity);

      const result = container.getAll();
      
      // Check that both source and target were updated
      expect(result.relations[0].source.name).toBe('NewSelfReferencingEntity');
      expect(result.relations[0].target.name).toBe('NewSelfReferencingEntity');
    });

    it('should maintain object identity after multiple replacements', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      // First replacement
      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);

      // Second replacement
      const newerEntity1 = createTestEntity('NewerEntity1');
      container.replaceEntity(newerEntity1, entity1);

      const result = container.getAll();
      
      // Check that the latest replacement is used
      expect(result.entities[0].name).toBe('NewerEntity1');
      expect(result.relations[0].source.name).toBe('NewerEntity1');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty container', () => {
      const container = new RefContainer([], []);
      const result = container.getAll();
      
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    it('should handle entities with no references', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');

      const container = new RefContainer([entity1, entity2], []);

      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);

      const result = container.getAll();
      
      expect(result.entities[0].name).toBe('NewEntity1');
      expect(result.entities[1].name).toBe('Entity2');
    });

    it('should preserve properties after replacement', () => {
      const entity1 = Entity.create({
        name: 'Entity1',
        properties: [
          Property.create({ name: 'id', type: 'string' }),
          Property.create({ name: 'name', type: 'string' }),
          Property.create({ name: 'value', type: 'number' })
        ]
      });

      const container = new RefContainer([entity1], []);

      const newEntity = Entity.create({
        name: 'NewEntity',
        properties: [
          Property.create({ name: 'id', type: 'string' }),
          Property.create({ name: 'title', type: 'string' })
        ]
      });

      container.replaceEntity(newEntity, entity1);

      const result = container.getAll();
      
      expect(result.entities[0].properties).toHaveLength(2);
      expect(result.entities[0].properties[0].name).toBe('id');
      expect(result.entities[0].properties[1].name).toBe('title');
    });
  });

  describe('Immediate calculation', () => {
    it('should calculate replacements immediately when replaceEntity is called', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      // Get initial state
      const initialResult = container.getAll();
      expect(initialResult.entities[0].name).toBe('Entity1');
      expect(initialResult.relations[0].source.name).toBe('Entity1');

      // Replace entity1
      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);

      // Changes should be reflected immediately
      const afterReplace = container.getAll();
      expect(afterReplace.entities[0].name).toBe('NewEntity1');
      expect(afterReplace.relations[0].source.name).toBe('NewEntity1');
    });

    it('should calculate replacements immediately when replaceRelation is called', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const baseRelation = createTestRelation(entity1, entity2, 'BaseRelation');
      
      const filteredRelation = Relation.create({
        name: 'FilteredRelation',
        sourceProperty: 'filtered',
        targetProperty: 'filtered',
        baseRelation: baseRelation,
        matchExpression: { active: true }
      });

      const container = new RefContainer([entity1, entity2], [baseRelation, filteredRelation]);

      // Replace the base relation
      const newBaseRelation = createTestRelation(entity1, entity2, 'NewBaseRelation');
      container.replaceRelation(newBaseRelation, baseRelation);

      // Changes should be reflected immediately
      const result = container.getAll();
      const updatedFilteredRelation = result.relations.find(r => r.name === 'FilteredRelation');
      expect(updatedFilteredRelation?.baseRelation?.name).toBe('NewBaseRelation');
    });

    it('should maintain consistency across multiple immediate replacements', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const entity3 = createTestEntity('Entity3');
      const relation1 = createTestRelation(entity1, entity2);
      const relation2 = createTestRelation(entity2, entity3);

      const container = new RefContainer([entity1, entity2, entity3], [relation1, relation2]);

      // First replacement
      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);
      
      // Check immediate result
      let result = container.getAll();
      expect(result.relations[0].source.name).toBe('NewEntity1');

      // Second replacement
      const newEntity2 = createTestEntity('NewEntity2');
      container.replaceEntity(newEntity2, entity2);

      // Check cumulative result
      result = container.getAll();
      expect(result.relations[0].source.name).toBe('NewEntity1');
      expect(result.relations[0].target.name).toBe('NewEntity2');
      expect(result.relations[1].source.name).toBe('NewEntity2');
    });
  });

  describe('getEntityByName functionality', () => {
    it('should get entity by name', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const entity3 = createTestEntity('Entity3');

      const container = new RefContainer([entity1, entity2, entity3], []);

      const foundEntity = container.getEntityByName('Entity2');
      expect(foundEntity).toBeDefined();
      expect(foundEntity?.name).toBe('Entity2');
    });

    it('should return undefined for non-existent entity name', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');

      const container = new RefContainer([entity1, entity2], []);

      const foundEntity = container.getEntityByName('NonExistent');
      expect(foundEntity).toBeUndefined();
    });

    it('should get replaced entity by its new name', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');

      const container = new RefContainer([entity1, entity2], []);

      // Replace entity1
      const newEntity1 = createTestEntity('ReplacedEntity');
      container.replaceEntity(newEntity1, entity1);

      // Should not find by old name
      const oldNameEntity = container.getEntityByName('Entity1');
      expect(oldNameEntity).toBeUndefined();

      // Should find by new name
      const newNameEntity = container.getEntityByName('ReplacedEntity');
      expect(newNameEntity).toBeDefined();
      expect(newNameEntity?.name).toBe('ReplacedEntity');
    });

    it('should get entity with updated references after replacements', () => {
      const baseEntity = createTestEntity('BaseEntity');
      const filteredEntity = Entity.create({
        name: 'FilteredEntity',
        baseEntity: baseEntity,
        matchExpression: { status: 'active' },
        properties: []
      });

      const container = new RefContainer([baseEntity, filteredEntity], []);

      // Replace the base entity
      const newBaseEntity = createTestEntity('NewBaseEntity');
      container.replaceEntity(newBaseEntity, baseEntity);

      // Get the filtered entity by name
      const foundFilteredEntity = container.getEntityByName('FilteredEntity');
      expect(foundFilteredEntity).toBeDefined();
      expect(foundFilteredEntity?.baseEntity?.name).toBe('NewBaseEntity');
    });

    it('should work with merged entities', () => {
      const input1 = createTestEntity('Input1');
      const input2 = createTestEntity('Input2');
      const mergedEntity = Entity.create({
        name: 'MergedEntity',
        inputEntities: [input1, input2],
        properties: []
      });

      const container = new RefContainer([input1, input2, mergedEntity], []);

      // Replace one input entity
      const newInput1 = createTestEntity('NewInput1');
      container.replaceEntity(newInput1, input1);

      // Get the merged entity and check its input entities
      const foundMergedEntity = container.getEntityByName('MergedEntity');
      expect(foundMergedEntity).toBeDefined();
      expect(foundMergedEntity?.inputEntities).toHaveLength(2);
      expect(foundMergedEntity?.inputEntities?.[0].name).toBe('NewInput1');
      expect(foundMergedEntity?.inputEntities?.[1].name).toBe('Input2');
    });
  });

  describe('Dynamic addition functionality', () => {
    it('should add new entity to container', () => {
      const entity1 = createTestEntity('Entity1');
      const container = new RefContainer([entity1], []);
      
      // Add a new entity
      const entity2 = createTestEntity('Entity2');
      const clonedEntity2 = container.addEntity(entity2);
      
      // Verify entity was added
      const result = container.getAll();
      expect(result.entities).toHaveLength(2);
      expect(result.entities[1].name).toBe('Entity2');
      
      // Verify we can get the added entity by name
      const foundEntity = container.getEntityByName('Entity2');
      expect(foundEntity).toBeDefined();
      expect(foundEntity?.name).toBe('Entity2');
      
      // Verify the returned cloned entity
      expect(clonedEntity2).not.toBe(entity2);
      expect(clonedEntity2.name).toBe('Entity2');
    });

    it('should add new relation to container', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const container = new RefContainer([entity1, entity2], []);
      
      // Add a new relation
      const relation = createTestRelation(entity1, entity2, 'NewRelation');
      const clonedRelation = container.addRelation(relation);
      
      // Verify relation was added
      const result = container.getAll();
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].name).toBe('NewRelation');
      
      // Verify the returned cloned relation
      expect(clonedRelation).not.toBe(relation);
      expect(clonedRelation.name).toBe('NewRelation');
    });

    it('should update references when adding entity with baseEntity', () => {
      const baseEntity = createTestEntity('BaseEntity');
      const container = new RefContainer([baseEntity], []);
      
      // Create and add a filtered entity
      const filteredEntity = Entity.create({
        name: 'FilteredEntity',
        baseEntity: baseEntity,
        matchExpression: { status: 'active' },
        properties: []
      });
      
      const clonedFiltered = container.addEntity(filteredEntity);
      
      // Verify references were updated
      const result = container.getAll();
      expect(result.entities).toHaveLength(2);
      
      // The filtered entity's baseEntity should reference the cloned base entity
      const addedFiltered = result.entities.find(e => e.name === 'FilteredEntity');
      const clonedBase = result.entities.find(e => e.name === 'BaseEntity');
      expect(addedFiltered?.baseEntity).toBe(clonedBase);
      expect(addedFiltered?.baseEntity).not.toBe(baseEntity);
    });

    it('should update references when adding entity with inputEntities', () => {
      const input1 = createTestEntity('Input1');
      const input2 = createTestEntity('Input2');
      const container = new RefContainer([input1, input2], []);
      
      // Create and add a merged entity
      const mergedEntity = Entity.create({
        name: 'MergedEntity',
        inputEntities: [input1, input2],
        properties: []
      });
      
      const clonedMerged = container.addEntity(mergedEntity);
      
      // Verify references were updated
      const result = container.getAll();
      expect(result.entities).toHaveLength(3);
      
      // The merged entity's inputEntities should reference the cloned input entities
      const addedMerged = result.entities.find(e => e.name === 'MergedEntity');
      const clonedInput1 = result.entities.find(e => e.name === 'Input1');
      const clonedInput2 = result.entities.find(e => e.name === 'Input2');
      
      expect(addedMerged?.inputEntities).toHaveLength(2);
      expect(addedMerged?.inputEntities?.[0]).toBe(clonedInput1);
      expect(addedMerged?.inputEntities?.[1]).toBe(clonedInput2);
      expect(addedMerged?.inputEntities?.[0]).not.toBe(input1);
      expect(addedMerged?.inputEntities?.[1]).not.toBe(input2);
    });

    it('should update references when adding relation', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const container = new RefContainer([entity1, entity2], []);
      
      // Create and add a relation
      const relation = createTestRelation(entity1, entity2, 'NewRelation');
      const clonedRelation = container.addRelation(relation);
      
      // Verify references were updated
      const result = container.getAll();
      const addedRelation = result.relations[0];
      const clonedEntity1 = result.entities.find(e => e.name === 'Entity1');
      const clonedEntity2 = result.entities.find(e => e.name === 'Entity2');
      
      expect(addedRelation.source).toBe(clonedEntity1);
      expect(addedRelation.target).toBe(clonedEntity2);
      expect(addedRelation.source).not.toBe(entity1);
      expect(addedRelation.target).not.toBe(entity2);
    });

    it('should update references when adding relation with baseRelation', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const baseRelation = createTestRelation(entity1, entity2, 'BaseRelation');
      const container = new RefContainer([entity1, entity2], [baseRelation]);
      
      // Create and add a filtered relation
      const filteredRelation = Relation.create({
        name: 'FilteredRelation',
        sourceProperty: 'filtered',
        targetProperty: 'filtered',
        baseRelation: baseRelation,
        matchExpression: { priority: 'high' }
      });
      
      const clonedFiltered = container.addRelation(filteredRelation);
      
      // Verify references were updated
      const result = container.getAll();
      expect(result.relations).toHaveLength(2);
      
      const addedFiltered = result.relations.find(r => r.name === 'FilteredRelation');
      const clonedBase = result.relations.find(r => r.name === 'BaseRelation');
      
      expect(addedFiltered?.baseRelation).toBe(clonedBase);
      expect(addedFiltered?.baseRelation).not.toBe(baseRelation);
    });

    it('should throw error when adding duplicate entity', () => {
      const entity1 = createTestEntity('Entity1');
      const container = new RefContainer([entity1], []);
      
      // Try to add the same entity again
      expect(() => {
        container.addEntity(entity1);
      }).toThrow('Entity already exists in container: Entity1');
      
      // Try to add an entity with the same uuid
      const duplicateEntity = createTestEntity('DuplicateEntity');
      duplicateEntity.uuid = entity1.uuid;
      
      expect(() => {
        container.addEntity(duplicateEntity);
      }).toThrow('Entity already exists in container: DuplicateEntity');
    });

    it('should throw error when adding duplicate relation', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2, 'Relation');
      const container = new RefContainer([entity1, entity2], [relation]);
      
      // Try to add the same relation again
      expect(() => {
        container.addRelation(relation);
      }).toThrow('Relation already exists in container: Relation');
      
      // Try to add a relation with the same uuid
      const duplicateRelation = createTestRelation(entity1, entity2, 'DuplicateRelation');
      duplicateRelation.uuid = relation.uuid;
      
      expect(() => {
        container.addRelation(duplicateRelation);
      }).toThrow('Relation already exists in container: DuplicateRelation');
    });

    it('should allow replacing dynamically added entities', () => {
      const entity1 = createTestEntity('Entity1');
      const container = new RefContainer([entity1], []);
      
      // Add an entity
      const entity2 = createTestEntity('Entity2');
      container.addEntity(entity2);
      
      // Add a relation between them
      const relation = createTestRelation(entity1, entity2, 'Relation');
      container.addRelation(relation);
      
      // Replace the dynamically added entity
      const newEntity2 = createTestEntity('NewEntity2');
      container.replaceEntity(newEntity2, entity2);
      
      // Verify replacement worked
      const result = container.getAll();
      expect(result.entities[1].name).toBe('NewEntity2');
      expect(result.relations[0].target.name).toBe('NewEntity2');
    });

    it('should allow replacing dynamically added relations', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const container = new RefContainer([entity1, entity2], []);
      
      // Add a relation
      const relation = createTestRelation(entity1, entity2, 'OldRelation');
      container.addRelation(relation);
      
      // Add a filtered relation based on it
      const filteredRelation = Relation.create({
        name: 'FilteredRelation',
        sourceProperty: 'filtered',
        targetProperty: 'filtered',
        baseRelation: relation,
        matchExpression: { active: true }
      });
      container.addRelation(filteredRelation);
      
      // Replace the dynamically added base relation
      const newRelation = createTestRelation(entity1, entity2, 'NewRelation');
      container.replaceRelation(newRelation, relation);
      
      // Verify replacement worked
      const result = container.getAll();
      const baseRel = result.relations.find(r => r.name === 'NewRelation');
      const filteredRel = result.relations.find(r => r.name === 'FilteredRelation');
      
      expect(baseRel).toBeDefined();
      expect(filteredRel?.baseRelation).toBe(baseRel);
    });

    it('should handle complex scenario with multiple dynamic additions and replacements', () => {
      // Start with empty container
      const container = new RefContainer([], []);
      
      // Add first entity
      const entity1 = createTestEntity('Entity1');
      container.addEntity(entity1);
      
      // Add second entity
      const entity2 = createTestEntity('Entity2');
      container.addEntity(entity2);
      
      // Add relation between them
      const relation1 = createTestRelation(entity1, entity2, 'Relation1');
      container.addRelation(relation1);
      
      // Add filtered entity based on entity1
      const filteredEntity = Entity.create({
        name: 'FilteredEntity',
        baseEntity: entity1,
        matchExpression: { active: true },
        properties: []
      });
      container.addEntity(filteredEntity);
      
      // Add merged entity
      const mergedEntity = Entity.create({
        name: 'MergedEntity',
        inputEntities: [entity1, entity2],
        properties: []
      });
      container.addEntity(mergedEntity);
      
      // Replace entity1
      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);
      
      // Verify all references were updated
      const result = container.getAll();
      
      // Check relation
      const rel = result.relations.find(r => r.name === 'Relation1');
      expect(rel?.source.name).toBe('NewEntity1');
      
      // Check filtered entity
      const filtered = result.entities.find(e => e.name === 'FilteredEntity');
      expect(filtered?.baseEntity?.name).toBe('NewEntity1');
      
      // Check merged entity
      const merged = result.entities.find(e => e.name === 'MergedEntity');
      expect(merged?.inputEntities?.[0].name).toBe('NewEntity1');
      expect(merged?.inputEntities?.[1].name).toBe('Entity2');
    });

    it('should work with empty initial container', () => {
      const container = new RefContainer();
      
      // Add entities
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      container.addEntity(entity1);
      container.addEntity(entity2);
      
      // Add relation
      const relation = createTestRelation(entity1, entity2, 'Relation');
      container.addRelation(relation);
      
      // Verify everything was added
      const result = container.getAll();
      expect(result.entities).toHaveLength(2);
      expect(result.relations).toHaveLength(1);
      
      // Verify references are correct
      const clonedEntity1 = result.entities[0];
      const clonedEntity2 = result.entities[1];
      const clonedRelation = result.relations[0];
      
      expect(clonedRelation.source).toBe(clonedEntity1);
      expect(clonedRelation.target).toBe(clonedEntity2);
    });

    it('should handle adding entities with complex reference chains', () => {
      const baseEntity = createTestEntity('BaseEntity');
      const container = new RefContainer([baseEntity], []);
      
      // Add first filtered entity
      const filtered1 = Entity.create({
        name: 'Filtered1',
        baseEntity: baseEntity,
        matchExpression: { level: 1 },
        properties: []
      });
      container.addEntity(filtered1);
      
      // Add second filtered entity based on the first filtered entity
      const filtered2 = Entity.create({
        name: 'Filtered2',
        baseEntity: filtered1,
        matchExpression: { level: 2 },
        properties: []
      });
      container.addEntity(filtered2);
      
      // Verify reference chain
      const result = container.getAll();
      const base = result.entities.find(e => e.name === 'BaseEntity');
      const f1 = result.entities.find(e => e.name === 'Filtered1');
      const f2 = result.entities.find(e => e.name === 'Filtered2');
      
      expect(f1?.baseEntity).toBe(base);
      expect(f2?.baseEntity).toBe(f1);
      
      // All should be cloned versions, not originals
      expect(f1?.baseEntity).not.toBe(baseEntity);
      expect(f2?.baseEntity).not.toBe(filtered1);
    });
  });

  describe('Re-replacement functionality', () => {
    it('should allow replacing an already replaced entity obtained by getEntityByName', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      // First replacement
      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);

      // Get the replaced entity by name
      const replacedEntity = container.getEntityByName('NewEntity1');
      expect(replacedEntity).toBeDefined();
      expect(replacedEntity?.name).toBe('NewEntity1');

      // Second replacement using the entity obtained by getEntityByName
      const newerEntity1 = createTestEntity('NewerEntity1');
      container.replaceEntity(newerEntity1, replacedEntity!);

      // Verify the second replacement worked
      const result = container.getAll();
      expect(result.entities[0].name).toBe('NewerEntity1');
      expect(result.relations[0].source.name).toBe('NewerEntity1');

      // Should not find by old names
      expect(container.getEntityByName('Entity1')).toBeUndefined();
      expect(container.getEntityByName('NewEntity1')).toBeUndefined();
      
      // Should find by newest name
      expect(container.getEntityByName('NewerEntity1')).toBeDefined();
    });

    it('should allow multiple re-replacements of the same entity', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const relation = createTestRelation(entity1, entity2);

      const container = new RefContainer([entity1, entity2], [relation]);

      // First replacement
      const replacement1 = createTestEntity('Replacement1');
      container.replaceEntity(replacement1, entity1);

      // Get and verify first replacement
      let currentEntity = container.getEntityByName('Replacement1');
      expect(currentEntity).toBeDefined();

      // Second replacement
      const replacement2 = createTestEntity('Replacement2');
      container.replaceEntity(replacement2, currentEntity!);

      // Get and verify second replacement
      currentEntity = container.getEntityByName('Replacement2');
      expect(currentEntity).toBeDefined();

      // Third replacement
      const replacement3 = createTestEntity('Replacement3');
      container.replaceEntity(replacement3, currentEntity!);

      // Verify all replacements worked
      const result = container.getAll();
      expect(result.entities[0].name).toBe('Replacement3');
      expect(result.relations[0].source.name).toBe('Replacement3');
    });

    it('should handle re-replacement with complex references', () => {
      const baseEntity = createTestEntity('BaseEntity');
      const filteredEntity = Entity.create({
        name: 'FilteredEntity',
        baseEntity: baseEntity,
        matchExpression: { status: 'active' },
        properties: []
      });

      const container = new RefContainer([baseEntity, filteredEntity], []);

      // First replacement of base entity
      const newBase1 = createTestEntity('NewBase1');
      container.replaceEntity(newBase1, baseEntity);

      // Verify filtered entity was updated
      let filtered = container.getEntityByName('FilteredEntity');
      expect(filtered?.baseEntity?.name).toBe('NewBase1');

      // Get the new base entity and replace it again
      const currentBase = container.getEntityByName('NewBase1');
      const newBase2 = createTestEntity('NewBase2');
      container.replaceEntity(newBase2, currentBase!);

      // Verify filtered entity was updated again
      filtered = container.getEntityByName('FilteredEntity');
      expect(filtered?.baseEntity?.name).toBe('NewBase2');
    });

    it('should allow replacing relations obtained from getAll', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const baseRelation = createTestRelation(entity1, entity2, 'BaseRelation');
      
      const filteredRelation = Relation.create({
        name: 'FilteredRelation',
        sourceProperty: 'filtered',
        targetProperty: 'filtered',
        baseRelation: baseRelation,
        matchExpression: { active: true }
      });

      const container = new RefContainer([entity1, entity2], [baseRelation, filteredRelation]);

      // First replacement
      const newRelation1 = createTestRelation(entity1, entity2, 'NewRelation1');
      container.replaceRelation(newRelation1, baseRelation);

      // Get the replaced relation from getAll
      let result = container.getAll();
      const replacedRelation = result.relations.find(r => r.name === 'NewRelation1');
      expect(replacedRelation).toBeDefined();

      // Second replacement using the relation from getAll
      const newRelation2 = createTestRelation(entity1, entity2, 'NewRelation2');
      container.replaceRelation(newRelation2, replacedRelation!);

      // Verify the second replacement worked
      result = container.getAll();
      const finalRelation = result.relations.find(r => r.name === 'NewRelation2');
      expect(finalRelation).toBeDefined();
      
      // Check that filtered relation was updated
      const updatedFilteredRelation = result.relations.find(r => r.name === 'FilteredRelation');
      expect(updatedFilteredRelation?.baseRelation?.name).toBe('NewRelation2');
    });

    it('should handle re-replacement with merged entities', () => {
      const input1 = createTestEntity('Input1');
      const input2 = createTestEntity('Input2');
      const mergedEntity = Entity.create({
        name: 'MergedEntity',
        inputEntities: [input1, input2],
        properties: []
      });

      const container = new RefContainer([input1, input2, mergedEntity], []);

      // First replacement of input1
      const newInput1 = createTestEntity('NewInput1');
      container.replaceEntity(newInput1, input1);

      // Get the replaced input entity
      const currentInput = container.getEntityByName('NewInput1');
      expect(currentInput).toBeDefined();

      // Second replacement using the entity from getEntityByName
      const newerInput1 = createTestEntity('NewerInput1');
      container.replaceEntity(newerInput1, currentInput!);

      // Verify merged entity has the latest reference
      const merged = container.getEntityByName('MergedEntity');
      expect(merged?.inputEntities).toHaveLength(2);
      expect(merged?.inputEntities?.[0].name).toBe('NewerInput1');
      expect(merged?.inputEntities?.[1].name).toBe('Input2');
    });

    it('should throw error when trying to replace non-existent cloned entity', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      
      const container = new RefContainer([entity1], []);

      // entity2 is not in the container
      expect(() => {
        container.replaceEntity(createTestEntity('New'), entity2);
      }).toThrow('Entity to be replaced not found in container');

      // Create a fake cloned entity
      const fakeCloned = createTestEntity('FakeCloned');
      expect(() => {
        container.replaceEntity(createTestEntity('New'), fakeCloned);
      }).toThrow('Entity to be replaced not found in container');
    });

    it('should maintain consistency when mixing original and cloned replacements', () => {
      const entity1 = createTestEntity('Entity1');
      const entity2 = createTestEntity('Entity2');
      const entity3 = createTestEntity('Entity3');
      
      const relation1 = createTestRelation(entity1, entity2);
      const relation2 = createTestRelation(entity2, entity3);

      const container = new RefContainer([entity1, entity2, entity3], [relation1, relation2]);

      // Replace entity1 using original
      const newEntity1 = createTestEntity('NewEntity1');
      container.replaceEntity(newEntity1, entity1);

      // Replace entity2 using original
      const newEntity2 = createTestEntity('NewEntity2');
      container.replaceEntity(newEntity2, entity2);

      // Get the replaced entity2 and replace it again
      const currentEntity2 = container.getEntityByName('NewEntity2');
      const newerEntity2 = createTestEntity('NewerEntity2');
      container.replaceEntity(newerEntity2, currentEntity2!);

      // Replace entity3 using original
      const newEntity3 = createTestEntity('NewEntity3');
      container.replaceEntity(newEntity3, entity3);

      // Verify all relations are updated correctly
      const result = container.getAll();
      expect(result.relations[0].source.name).toBe('NewEntity1');
      expect(result.relations[0].target.name).toBe('NewerEntity2');
      expect(result.relations[1].source.name).toBe('NewerEntity2');
      expect(result.relations[1].target.name).toBe('NewEntity3');
    });
  });
}); 