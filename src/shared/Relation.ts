import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { PropertyInstance, Property } from './Property.js';
import { EntityInstance } from './Entity.js';
import type { ComputationInstance } from './types.js';

export interface RelationInstance extends IInstance {
  name?: string;
  source: EntityInstance | RelationInstance;
  sourceProperty: string;
  target: EntityInstance | RelationInstance;
  targetProperty: string;
  isTargetReliance: boolean;
  type: string; // '1:1', '1:n', 'n:1', 'n:n'
  computation?: ComputationInstance;
  properties: PropertyInstance[];
  baseRelation?: RelationInstance; // for Filtered Relation
  matchExpression?: object; // for Filtered Relation
  inputRelations?: RelationInstance[]; // for Merged Relation
}

export interface RelationCreateArgs {
  name?: string;
  source?: EntityInstance | RelationInstance;
  sourceProperty?: string;
  target?: EntityInstance | RelationInstance;
  targetProperty?: string;
  isTargetReliance?: boolean;
  type?: string;
  computation?: ComputationInstance;
  properties?: PropertyInstance[];
  baseRelation?: RelationInstance;
  matchExpression?: object;
  inputRelations?: RelationInstance[]; // for Merged Relation
}

export class Relation implements RelationInstance {
  public uuid: string;
  public _type = 'Relation';
  public _options?: { uuid?: string };
  private _name?: string;
  public source: EntityInstance | RelationInstance;
  public sourceProperty: string;
  public target: EntityInstance | RelationInstance;
  public targetProperty: string;
  public isTargetReliance: boolean;
  public type: string;
  public computation?: ComputationInstance;
  public properties: PropertyInstance[];
  public baseRelation?: RelationInstance;
  public matchExpression?: object;
  public inputRelations?: RelationInstance[]; // for Merged Relation
  
  // Getter for name that returns computed name if _name is undefined
  get name(): string | undefined {
    if (this._name !== undefined) {
      return this._name;
    }
    // Use computed name if available
    return Relation.public.name.computed ? Relation.public.name.computed(this) : undefined;
  }
  
  // Setter for name
  set name(value: string | undefined) {
    this._name = value;
  }
  
  constructor(args: RelationCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    
    // For merged relation
    if (args.inputRelations) {
      // Validate inputRelations
      if (!args.inputRelations || args.inputRelations.length === 0) {
        throw new Error('Merged relation must have at least one inputRelation');
      }
      
      // Merged relation must have sourceProperty and targetProperty
      if (!args.sourceProperty || !args.targetProperty) {
        throw new Error('Merged relation must have sourceProperty and targetProperty');
      }
      
      // Merged relation cannot specify source/target
      if (args.source || args.target) {
        throw new Error('Merged relation cannot specify source or target, they are inherited from inputRelations');
      }
      
      // All input relations must have the same source and target
      const firstRelation = args.inputRelations[0];
      for (let i = 1; i < args.inputRelations.length; i++) {
        const relation = args.inputRelations[i];
        if (relation.source !== firstRelation.source) {
          throw new Error('All inputRelations must have the same source');
        }
        if (relation.target !== firstRelation.target) {
          throw new Error('All inputRelations must have the same target');
        }
      }
      
      this.inputRelations = args.inputRelations;
      this.source = firstRelation.source;
      this.target = firstRelation.target;
      this.sourceProperty = args.sourceProperty;
      this.targetProperty = args.targetProperty;
      this.type = firstRelation.type; // Inherit type from first input relation
      this.isTargetReliance = firstRelation.isTargetReliance;
      this._name = args.name;
    }
    // For filtered relation, inherit from baseRelation
    else if (args.baseRelation) {
      // Filtered relation must have sourceProperty and targetProperty
      if (!args.sourceProperty || !args.targetProperty) {
        throw new Error('Filtered relation must have sourceProperty and targetProperty');
      }
      
      this.baseRelation = args.baseRelation;
      this.matchExpression = args.matchExpression;
      this.source = args.baseRelation.source;
      this.sourceProperty = args.sourceProperty;
      this.target = args.baseRelation.target;
      this.targetProperty = args.targetProperty;
      this.isTargetReliance = args.baseRelation.isTargetReliance;
      this.type = args.baseRelation.type;
      this._name = args.name; // name is optional for filtered relation
    } else {
      // Normal relation, require all fields
      if (!args.source || !args.sourceProperty || !args.target || !args.targetProperty || !args.type) {
        throw new Error('Relation requires source, sourceProperty, target, targetProperty, and type');
      }
      
      this.source = args.source;
      this.sourceProperty = args.sourceProperty;
      this.target = args.target;
      this.targetProperty = args.targetProperty;
      this.type = args.type;
      // Use provided name or leave undefined (will use computed name)
      this._name = args.name;
    }
    
    // Common fields
    this.isTargetReliance = args.isTargetReliance ?? false;
    this.computation = args.computation;
    this.properties = args.properties || [];
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Relation';
  static instances: RelationInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: false as const,
      collection: false as const,
      computed: (relation: RelationInstance) => {
        if (relation.source && relation.target) {
          return `${relation.source.name}_${relation.sourceProperty}_${relation.targetProperty}_${relation.target.name}`;
        }
        return '';
      }
    },
    source: {
      type: ['Entity', 'Relation'] as const,
      required: true as const,
      collection: false as const,
    },
    sourceProperty: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    target: {
      type: ['Entity', 'Relation'] as const,
      required: true as const,
      collection: false as const,
    },
    targetProperty: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    isTargetReliance: {
      type: 'boolean' as const,
      required: true as const,
      collection: false as const,
      defaultValue: () => false
    },
    type: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    computation: {
      type: [] as const,
      collection: false as const,
      required: false as const,
    },
    properties: {
      type: 'Property' as const,
      collection: true as const,
      required: true as const,
      constraints: {
        eachNameUnique: (thisInstance: RelationInstance) => {
          const uniqueNames = new Set(thisInstance.properties.map((p: PropertyInstance) => p.name));
          return uniqueNames.size === thisInstance.properties.length;
        }
      },
      defaultValue: () => []
    },
    baseRelation: {
      type: 'Relation' as const,
      collection: false as const,
      required: false as const,
    },
    matchExpression: {
      type: 'object' as const,
      collection: false as const,
      required: false as const,
    },
    inputRelations: {
      type: 'Relation' as const,
      collection: true as const,
      required: false as const,
      constraints: {
        mergedRelationNoProperties: (thisInstance: RelationInstance) => {
          // Merged relation should not have any properties defined
          if (thisInstance.inputRelations && thisInstance.inputRelations.length > 0 && thisInstance.properties && thisInstance.properties.length > 0) {
            return false;
          }
          return true;
        },
        sameSourceTarget: (thisInstance: RelationInstance) => {
          // All input relations must have the same source and target
          if (thisInstance.inputRelations && thisInstance.inputRelations.length > 1) {
            const firstRelation = thisInstance.inputRelations[0];
            for (let i = 1; i < thisInstance.inputRelations.length; i++) {
              const relation = thisInstance.inputRelations[i];
              if (relation.source !== firstRelation.source || relation.target !== firstRelation.target) {
                return false;
              }
            }
          }
          return true;
        }
      }
    }
  };
  
  static create(args: RelationCreateArgs, options?: { uuid?: string }): RelationInstance {
    const instance = new Relation(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Relation`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: RelationInstance): string {
    const args: RelationCreateArgs = {
      sourceProperty: instance.sourceProperty,
      targetProperty: instance.targetProperty,
      isTargetReliance: instance.isTargetReliance,
      type: instance.type,
      properties: instance.properties
    };
    
    // Only include source and target if not a merged relation
    if (!instance.inputRelations) {
      args.source = instance.source;
      args.target = instance.target;
    }
    
    // Use the private _name field if the instance is a Relation class instance
    const name = (instance as any)._name ?? instance.name;
    if (name !== undefined) args.name = name;
    
    if (instance.computation !== undefined) args.computation = instance.computation;
    if (instance.baseRelation !== undefined) args.baseRelation = instance.baseRelation;
    if (instance.matchExpression !== undefined) args.matchExpression = instance.matchExpression;
    if (instance.inputRelations !== undefined) args.inputRelations = instance.inputRelations;
    
    const data: SerializedData<RelationCreateArgs> = {
      type: 'Relation',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    
    return JSON.stringify(data);
  }
  
  static clone(instance: RelationInstance, deep = false): RelationInstance {
    const args: RelationCreateArgs = {
      sourceProperty: instance.sourceProperty,
      targetProperty: instance.targetProperty,
      isTargetReliance: instance.isTargetReliance,
      type: instance.type,
      properties: instance.properties?.map(p => Property.clone(p, deep))
    };
    
    // Only include source and target if not a merged relation
    if (!instance.inputRelations) {
      args.source = instance.source;
      args.target = instance.target;
    }
    
    // Use the private _name field if the instance is a Relation class instance
    const name = (instance as any)._name ?? instance.name;
    if (name !== undefined) args.name = name;
    
    if (instance.computation !== undefined) args.computation = instance.computation; // Note: This is a reference, not a deep clone
    if (instance.baseRelation !== undefined) args.baseRelation = instance.baseRelation;
    if (instance.matchExpression !== undefined) args.matchExpression = instance.matchExpression;
    if (instance.inputRelations !== undefined) args.inputRelations = instance.inputRelations;
    
    return new Relation(args, instance._options);
  }
  
  static is(obj: unknown): obj is RelationInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Relation';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): RelationInstance {
    const data: SerializedData<RelationCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 