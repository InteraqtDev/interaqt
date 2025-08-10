import { EntityInstance, Entity } from './Entity.js';
import { RelationInstance, Relation } from './Relation.js';

/**
 * RefContainer - A utility class for managing entity and relation reference replacement
 * 
 * This class helps replace entities/relations and automatically update all references
 * throughout the object graph without modifying the original objects.
 */
export class RefContainer {
  private clonedEntities: Map<EntityInstance, EntityInstance>;
  private clonedRelations: Map<RelationInstance, RelationInstance>;
  private reverseEntityMap: Map<EntityInstance, EntityInstance>; // Map from cloned to original
  private reverseRelationMap: Map<RelationInstance, RelationInstance>; // Map from cloned to original
  private originalEntities: EntityInstance[];
  private originalRelations: RelationInstance[];

  constructor(originalEntities: EntityInstance[] = [], originalRelations: RelationInstance[] = []) {
    this.clonedEntities = new Map();
    this.clonedRelations = new Map();
    this.reverseEntityMap = new Map();
    this.reverseRelationMap = new Map();
    this.originalEntities = [...originalEntities];
    this.originalRelations = [...originalRelations];
    
    // Clone all entities and relations immediately if provided
    if (originalEntities.length > 0 || originalRelations.length > 0) {
      this.initializeClones();
    }
  }
  
  /**
   * Initialize clones for all entities and relations
   */
  private initializeClones(): void {
    // Clone all entities
    for (const entity of this.originalEntities) {
      const cloned = Entity.clone(entity, false);
      this.clonedEntities.set(entity, cloned);
      this.reverseEntityMap.set(cloned, entity);
    }
    
    // Clone all relations
    for (const relation of this.originalRelations) {
      const cloned = Relation.clone(relation, false);
      this.clonedRelations.set(relation, cloned);
      this.reverseRelationMap.set(cloned, relation);
    }
    
    // Update all references
    this.updateAllReferences();
  }
  
  /**
   * Add a new entity to the container
   */
  addEntity(entity: EntityInstance): EntityInstance {
    // Check if the entity already exists
    for (const [original] of this.clonedEntities) {
      if (original === entity || original.uuid === entity.uuid) {
        throw new Error(`Entity already exists in container: ${entity.name}`);
      }
    }
    
    // Add to originals
    this.originalEntities.push(entity);
    
    // Clone the entity
    const cloned = Entity.clone(entity, false);
    
    // Update maps
    this.clonedEntities.set(entity, cloned);
    this.reverseEntityMap.set(cloned, entity);
    
    // Update references in the new entity
    this.updateReferencesInObject(cloned);
    
    // Update references to the new entity in existing objects
    // (This is typically not needed for adding, but included for completeness)
    
    return cloned;
  }
  
  /**
   * Add a new relation to the container
   */
  addRelation(relation: RelationInstance): RelationInstance {
    // Check if the relation already exists
    for (const [original] of this.clonedRelations) {
      if (original === relation || original.uuid === relation.uuid) {
        throw new Error(`Relation already exists in container: ${relation.name}`);
      }
    }
    
    // Add to originals
    this.originalRelations.push(relation);
    
    // Clone the relation
    const cloned = Relation.clone(relation, false);
    
    // Update maps
    this.clonedRelations.set(relation, cloned);
    this.reverseRelationMap.set(cloned, relation);
    
    // Update references in the new relation
    this.updateReferencesInObject(cloned);
    
    return cloned;
  }
  
  /**
   * Update references in a single object (entity or relation)
   */
  private updateReferencesInObject(obj: EntityInstance | RelationInstance): void {
    if ('baseEntity' in obj && obj.baseEntity) {
      // It's an entity with baseEntity
      const replacement = this.findReplacement(obj.baseEntity);
      if (replacement) {
        obj.baseEntity = replacement;
      }
    }
    
    if ('inputEntities' in obj && obj.inputEntities) {
      // It's an entity with inputEntities
      obj.inputEntities = obj.inputEntities.map(inputEntity => {
        const replacement = this.findReplacement(inputEntity);
        return (replacement || inputEntity) as EntityInstance;
      });
    }
    
    if ('source' in obj && obj.source) {
      // It's a relation with source
      const replacement = this.findReplacement(obj.source);
      if (replacement) {
        obj.source = replacement;
      }
    }
    
    if ('target' in obj && obj.target) {
      // It's a relation with target
      const replacement = this.findReplacement(obj.target);
      if (replacement) {
        obj.target = replacement;
      }
    }
    
    if ('baseRelation' in obj && obj.baseRelation) {
      // It's a relation with baseRelation
      const replacement = this.findReplacement(obj.baseRelation);
      if (replacement) {
        obj.baseRelation = replacement as RelationInstance;
      }
    }

    if('inputRelations' in obj && obj.inputRelations) {
      obj.inputRelations = obj.inputRelations.map(inputRelation => {
        const replacement = this.findReplacement(inputRelation);
        return (replacement || inputRelation) as RelationInstance;
      });
    }
  }
  
  /**
   * Update all references in cloned entities and relations
   */
  private updateAllReferences(): void {
    // Update references in entities
    for (const cloned of this.clonedEntities.values()) {
      // Update baseEntity reference
      if (cloned.baseEntity) {
        const replacement = this.findReplacement(cloned.baseEntity);
        if (replacement) {
          cloned.baseEntity = replacement;
        }
      }

      // Update inputEntities references
      if (cloned.inputEntities) {
        cloned.inputEntities = cloned.inputEntities.map(inputEntity => {
          const replacement = this.findReplacement(inputEntity);
          return (replacement || inputEntity) as EntityInstance;
        });
      }
    }
    
    // Update references in relations
    for (const cloned of this.clonedRelations.values()) {
      // Update source reference
      if (cloned.source) {
        const replacement = this.findReplacement(cloned.source);
        if (replacement) {
          cloned.source = replacement;
        }
      }

      // Update target reference
      if (cloned.target) {
        const replacement = this.findReplacement(cloned.target);
        if (replacement) {
          cloned.target = replacement;
        }
      }

      // Update baseRelation reference
      if (cloned.baseRelation) {
        const replacement = this.findReplacement(cloned.baseRelation);
        if (replacement) {
          cloned.baseRelation = replacement as RelationInstance;
        }
      }

      if(cloned.inputRelations) {
        cloned.inputRelations = cloned.inputRelations.map(inputRelation => {
          const replacement = this.findReplacement(inputRelation);
          return (replacement || inputRelation) as RelationInstance;
        });
      }
    }
  }

  /**
   * Replace an entity with a new one and update all references immediately
   */
  replaceEntity(newEntity: EntityInstance, oldEntity: EntityInstance): void {
    // Find the original entity key
    let originalKey: EntityInstance | undefined;
    
    // Check if oldEntity is an original entity
    if (this.clonedEntities.has(oldEntity)) {
      originalKey = oldEntity;
    } else {
      // Check if oldEntity is a cloned entity
      originalKey = this.reverseEntityMap.get(oldEntity);
      if (!originalKey) {
        // Try to find by uuid
        for (const [original, cloned] of this.clonedEntities) {
          if (cloned === oldEntity || cloned.uuid === oldEntity.uuid) {
            originalKey = original;
            break;
          }
        }
      }
    }
    
    if (!originalKey) {
      throw new Error(`Entity to be replaced not found in container: ${oldEntity.name}`);
    }
    
    // Get the old cloned entity that we're replacing
    const oldCloned = this.clonedEntities.get(originalKey);
    
    // Clone the new entity
    const clonedNew = newEntity;
    
    // Update the maps
    this.clonedEntities.set(originalKey, clonedNew);
    if (oldCloned) {
      this.reverseEntityMap.delete(oldCloned);
    }
    this.reverseEntityMap.set(clonedNew, originalKey);
    
    // Update all references from the old cloned entity to the new one
    if (oldCloned) {
      this.updateSpecificReferences(oldCloned, clonedNew);
    }
  }

  /**
   * Replace a relation with a new one and update all references immediately
   */
  replaceRelation(newRelation: RelationInstance, oldRelation: RelationInstance): void {
    // Find the original relation key
    let originalKey: RelationInstance | undefined;
    
    // Check if oldRelation is an original relation
    if (this.clonedRelations.has(oldRelation)) {
      originalKey = oldRelation;
    } else {
      // Check if oldRelation is a cloned relation
      originalKey = this.reverseRelationMap.get(oldRelation);
    }
    
    if (!originalKey) {
      throw new Error(`Relation to be replaced not found in container: ${oldRelation.name}`);
    }
    
    // Get the old cloned relation that we're replacing
    const oldCloned = this.clonedRelations.get(originalKey);
    
    // Clone the new relation
    const clonedNew = newRelation
    
    // Update the maps
    this.clonedRelations.set(originalKey, clonedNew);
    if (oldCloned) {
      this.reverseRelationMap.delete(oldCloned);
    }
    this.reverseRelationMap.set(clonedNew, originalKey);
    
    // Update all references from the old cloned relation to the new one
    if (oldCloned) {
      this.updateSpecificReferences(oldCloned, clonedNew);
    }
  }
  
  /**
   * Update all references from an old object to a new object
   */
  private updateSpecificReferences(
    oldObj: EntityInstance | RelationInstance,
    newObj: EntityInstance | RelationInstance
  ): void {
    // Update references in all entities
    for (const entity of this.clonedEntities.values()) {
      // Update baseEntity reference
      if (entity.baseEntity === oldObj) {
        entity.baseEntity = newObj as EntityInstance | RelationInstance;
      }
      
      // Update inputEntities references
      if (entity.inputEntities) {
        entity.inputEntities = entity.inputEntities.map(inputEntity => 
          inputEntity === oldObj ? (newObj as EntityInstance) : inputEntity
        );
      }
    }
    
    // Update references in all relations
    for (const relation of this.clonedRelations.values()) {
      // Update source reference
      if (relation.source === oldObj) {
        relation.source = newObj as EntityInstance | RelationInstance;
      }
      
      // Update target reference
      if (relation.target === oldObj) {
        relation.target = newObj as EntityInstance | RelationInstance;
      }
      
      // Update baseRelation reference
      if (relation.baseRelation === oldObj) {
        relation.baseRelation = newObj as RelationInstance;
      }

      if(relation.inputRelations) {
        relation.inputRelations = relation.inputRelations.map(inputRelation => 
          inputRelation === oldObj ? (newObj as RelationInstance) : inputRelation
        );
      }
    }
  }
  
  /**
   * Get entity by name after all replacements
   */
  getEntityByName(name: string): EntityInstance | undefined {
    for (const entity of this.clonedEntities.values()) {
      if (entity.name === name) {
        return entity;
      }
    }
    return undefined;
  }

  /**
   * Get relation by name after all replacements
   */
  getRelationByName(name: string): RelationInstance | undefined {
    for (const relation of this.clonedRelations.values()) {
      const relationName = relation.name || `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`;
      if (relationName === name) {
        return relation;
      }
    }
    return undefined;
  }

  /**
   * Get all entities and relations after replacement
   */
  getAll(): { entities: EntityInstance[], relations: RelationInstance[] } {
    return {
      entities: Array.from(this.clonedEntities.values()),
      relations: Array.from(this.clonedRelations.values())
    };
  }

  /**
   * Unified replace method - automatically determines if it's an entity or relation
   */
  replace(newItem: EntityInstance | RelationInstance, oldItem: EntityInstance | RelationInstance): void {
    if (this.isEntity(newItem) && this.isEntity(oldItem)) {
      this.replaceEntity(newItem as EntityInstance, oldItem as EntityInstance);
    } else if (this.isRelation(newItem) && this.isRelation(oldItem)) {
      this.replaceRelation(newItem as RelationInstance, oldItem as RelationInstance);
    } else {
      throw new Error('Type mismatch: both items must be either entities or relations');
    }
  }

  /**
   * Unified getByName method - searches both entities and relations
   */
  getByName(name: string): EntityInstance | RelationInstance | undefined {
    const entity = this.getEntityByName(name);
    if (entity) return entity;
    return this.getRelationByName(name);
  }

  /**
   * Unified add method - automatically determines if it's an entity or relation
   */
  add(item: EntityInstance | RelationInstance): EntityInstance | RelationInstance {
    if (this.isEntity(item)) {
      return this.addEntity(item as EntityInstance);
    } else {
      return this.addRelation(item as RelationInstance);
    }
  }

  /**
   * Helper method to determine if an item is an entity
   */
  private isEntity(item: EntityInstance | RelationInstance): boolean {
    return !('sourceProperty' in item);
  }

  /**
   * Helper method to determine if an item is a relation
   */
  private isRelation(item: EntityInstance | RelationInstance): boolean {
    return 'sourceProperty' in item;
  }

  /**
   * Find replacement for an entity or relation in the cloned maps
   */
  private findReplacement(
    obj: EntityInstance | RelationInstance
  ): EntityInstance | RelationInstance | null {
    // First check if this object is already a cloned one
    for (const cloned of this.clonedEntities.values()) {
      if (cloned === obj || cloned.uuid === obj.uuid) {
        return cloned;
      }
    }
    
    for (const cloned of this.clonedRelations.values()) {
      if (cloned === obj || cloned.uuid === obj.uuid) {
        return cloned;
      }
    }
    
    // Then check if it's an original object
    for (const [original, cloned] of this.clonedEntities) {
      if (original === obj || original.uuid === obj.uuid) {
        return cloned;
      }
    }
    
    for (const [original, cloned] of this.clonedRelations) {
      if (original === obj || original.uuid === obj.uuid) {
        return cloned;
      }
    }
    
    return null;
  }
} 