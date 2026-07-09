import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import { PropertyInstance, Property } from './Property.js';
import { EntityInstance } from './Entity.js';
import type { ComputationInstance } from './types.js';
import type { ConstraintInstance } from './Constraint.js';

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

export const RELATION_TYPES = ['1:1', '1:n', 'n:1', 'n:n'] as const;

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
  commonProperties?: PropertyInstance[]; // for Merged Relation
  constraints?: ConstraintInstance[];
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
  commonProperties?: PropertyInstance[]; // for Merged Relation
  constraints?: ConstraintInstance[];
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
  public commonProperties?: PropertyInstance[]; // for Merged Relation
  public constraints?: ConstraintInstance[];
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
      
      // Inheriting isTargetReliance from inputRelations that disagree would be
      // ambiguous: deletion semantics apply to the merged relation as a whole.
      if (args.isTargetReliance === undefined && args.inputRelations.some(r => r.isTargetReliance !== firstRelation.isTargetReliance)) {
        throw new Error('All inputRelations must have the same isTargetReliance, or the merged relation must declare isTargetReliance explicitly');
      }

      this.inputRelations = args.inputRelations;
      this.source = firstRelation.source;
      this.target = firstRelation.target;
      this.sourceProperty = args.sourceProperty;
      this.targetProperty = args.targetProperty;
      this.type = firstRelation.type; // Inherit type from first input relation
      this.isTargetReliance = args.isTargetReliance ?? firstRelation.isTargetReliance;
      this._name = args.name;
      this.commonProperties = args.commonProperties;
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
      this.isTargetReliance = args.isTargetReliance ?? args.baseRelation.isTargetReliance;
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
      this.isTargetReliance = args.isTargetReliance ?? false;
    }
    
    // Common fields
    // CAUTION isTargetReliance is assigned per branch above: merged/filtered relations
    //  inherit it from inputRelations/baseRelation unless explicitly overridden, so it
    //  must not be unconditionally reset here.
    this.computation = args.computation;
    this.properties = args.properties || [];
    this.constraints = args.constraints;
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
    commonProperties: {
      type: 'Property' as const,
      collection: true as const,
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
    },
    constraints: {
      type: 'UniqueConstraint' as const,
      collection: true as const,
      required: false as const,
      defaultValue: () => []
    }
  };
  
  static create(args: RelationCreateArgs, options?: { uuid?: string }): RelationInstance {
    // 强制执行 nameFormat 约束：显式提供的 name 会被用作表名/字段名/别名直接进入 SQL，必须严格校验。
    // 未显式提供 name 时使用 computed name（由 source/target 名和 property 名拼接，各部分单独校验）。
    if (args.name !== undefined && (typeof args.name !== 'string' || !validNameFormatExp.test(args.name))) {
      throw new Error(`Relation name "${args.name}" is invalid. Relation names must match ${validNameFormatExp} (letters, numbers and underscore only).`);
    }
    if (args.sourceProperty !== undefined && !validNameFormatExp.test(args.sourceProperty)) {
      throw new Error(`Relation sourceProperty "${args.sourceProperty}" is invalid. Property names must match ${validNameFormatExp} (letters, numbers and underscore only).`);
    }
    if (args.targetProperty !== undefined && !validNameFormatExp.test(args.targetProperty)) {
      throw new Error(`Relation targetProperty "${args.targetProperty}" is invalid. Property names must match ${validNameFormatExp} (letters, numbers and underscore only).`);
    }
    // 强制执行 type 白名单：基数字符串直接决定表结构与合并策略，
    // 非法值（如 '2:3'）不会报错但查询会静默返回空关联数据。
    if (args.type !== undefined && !RELATION_TYPES.includes(args.type as typeof RELATION_TYPES[number])) {
      throw new Error(`Relation type "${args.type}" is invalid. Relation type must be one of ${RELATION_TYPES.map(t => `'${t}'`).join(', ')}.`);
    }

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
    const json = stringifyInstance(this, instance);
    // Merged relation 的 source/target 继承自 inputRelations，create 禁止显式传入。
    if (instance.inputRelations) {
      const data = JSON.parse(json) as SerializedData<Record<string, unknown>>;
      delete data.public.source;
      delete data.public.target;
      return JSON.stringify(data);
    }
    return json;
  }
  
  // CAUTION clone 不注册进全局 registry，也不复用原实例的显式 uuid（否则两个实例共享身份）。
  //  与 Entity.clone / Property.clone 语义一致。
  static clone(instance: RelationInstance, deep = false): RelationInstance {
    const args: RelationCreateArgs = {
      sourceProperty: instance.sourceProperty,
      targetProperty: instance.targetProperty,
      isTargetReliance: instance.isTargetReliance,
      type: instance.type,
      // 浅 clone 与 Entity.clone 一致：共享 property 实例；深 clone 时才复制。
      properties: deep ? instance.properties?.map(p => Property.clone(p, deep)) : [...(instance.properties || [])],
      constraints: instance.constraints
    };
    
    // Only include source and target if not a merged relation
    if (!instance.inputRelations) {
      args.source = instance.source;
      args.target = instance.target;
    }
    
    const name = instance.name;
    if (name !== undefined) args.name = name;
    
    if (instance.computation !== undefined) args.computation = instance.computation; // Note: This is a reference, not a deep clone
    if (instance.baseRelation !== undefined) args.baseRelation = instance.baseRelation;
    if (instance.matchExpression !== undefined) args.matchExpression = instance.matchExpression;
    if (instance.inputRelations !== undefined) args.inputRelations = instance.inputRelations;
    
    return new Relation(args);
  }
  
  static is(obj: unknown): obj is RelationInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Relation';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): RelationInstance {
    const data: SerializedData<RelationCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 