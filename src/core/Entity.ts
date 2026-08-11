import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import { Property, PropertyInstance } from './Property.js';
import { validatePropertyNamesOnCreate } from './propertyNameGuards.js';
import type { ComputationInstance } from './types.js';
import type { RelationInstance } from './Relation.js';
import type { ConstraintInstance } from './Constraint.js';

const validNameFormatExp = /^[a-zA-Z0-9_]+$/;

/**
 * Hard-deletion computed property name. Kept as a core-side literal so Entity.create
 * can reject retention on hosts that already own physical hard-delete semantics.
 * Must stay aligned with `HARD_DELETION_PROPERTY_NAME` in runtime/Controller.
 */
const HARD_DELETION_PROPERTY_NAME = '_isDeleted_';

/**
 * Declarative row retention for ordinary entities (not Relation / filtered / merged).
 * - forever / omitted: this mechanism never deletes
 * - cap: keep latest N per partition by explicit orderBy (DESC); optional ttl runs first
 * - ttl: delete by timestamp only; no orderBy / retainLatest
 */
export type EntityRetention =
  | { mode: 'forever' }
  | {
      mode: 'cap'
      partitionBy?: string[]
      retainLatest: number
      orderBy: string[]
      ttl?: {
        timestampProperty: string
        maxAgeMs: number
      }
    }
  | {
      mode: 'ttl'
      partitionBy?: string[]
      ttl: {
        timestampProperty: string
        maxAgeMs: number
      }
    }

export interface EntityInstance extends IInstance {
  name: string;
  properties: PropertyInstance[];
  computation?: ComputationInstance;
  baseEntity?: EntityInstance | RelationInstance; // for Filtered Entity
  matchExpression?: object; // for Filtered Entity
  inputEntities?: EntityInstance[]; // for Merged Entity
  commonProperties?: PropertyInstance[]; // for Merged Entity
  constraints?: ConstraintInstance[];
  retention?: EntityRetention;
}

export interface EntityCreateArgs {
  name: string;
  properties?: PropertyInstance[];
  computation?: ComputationInstance;
  baseEntity?: EntityInstance | RelationInstance;
  matchExpression?: object;
  inputEntities?: EntityInstance[]; // for Merged Entity
  commonProperties?: PropertyInstance[]; // for Merged Entity
  constraints?: ConstraintInstance[];
  retention?: EntityRetention;
}

function propertyByName(properties: PropertyInstance[] | undefined, name: string): PropertyInstance | undefined {
  return (properties || []).find(p => p.name === name);
}

function assertRetentionPropertyName(
  entityName: string,
  fieldLabel: string,
  propertyName: string,
  properties: PropertyInstance[] | undefined,
): PropertyInstance {
  if (typeof propertyName !== 'string' || !validNameFormatExp.test(propertyName)) {
    throw new Error(
      `Entity "${entityName}" retention.${fieldLabel} "${propertyName}" is not a valid property name.`,
    );
  }
  const property = propertyByName(properties, propertyName);
  if (!property) {
    throw new Error(
      `Entity "${entityName}" retention.${fieldLabel} references unknown property "${propertyName}". ` +
      `Declare the property on the entity, or correct the retention declaration.`,
    );
  }
  return property;
}

function assertTtlConfig(
  entityName: string,
  ttl: { timestampProperty: string; maxAgeMs: number } | undefined,
  properties: PropertyInstance[] | undefined,
  required: boolean,
): void {
  if (ttl === undefined) {
    if (required) {
      throw new Error(`Entity "${entityName}" retention.mode "ttl" requires a ttl configuration.`);
    }
    return;
  }
  if (ttl === null || typeof ttl !== 'object' || Array.isArray(ttl)) {
    throw new Error(`Entity "${entityName}" retention.ttl must be an object with timestampProperty and maxAgeMs.`);
  }
  const timestampProperty = assertRetentionPropertyName(
    entityName,
    'ttl.timestampProperty',
    ttl.timestampProperty,
    properties,
  );
  // Framework stores absolute instants as number (epoch ms) or timestamp columns.
  if (timestampProperty.type !== 'number' && timestampProperty.type !== 'timestamp') {
    throw new Error(
      `Entity "${entityName}" retention.ttl.timestampProperty "${ttl.timestampProperty}" must have type "number" or "timestamp" (got "${timestampProperty.type}").`,
    );
  }
  if (typeof ttl.maxAgeMs !== 'number' || !Number.isFinite(ttl.maxAgeMs) || ttl.maxAgeMs <= 0) {
    throw new Error(
      `Entity "${entityName}" retention.ttl.maxAgeMs must be a positive finite number (milliseconds).`,
    );
  }
}

function assertPartitionBy(
  entityName: string,
  partitionBy: string[] | undefined,
  properties: PropertyInstance[] | undefined,
): void {
  if (partitionBy === undefined) return;
  if (!Array.isArray(partitionBy)) {
    throw new Error(`Entity "${entityName}" retention.partitionBy must be an array of property names when provided.`);
  }
  for (const name of partitionBy) {
    assertRetentionPropertyName(entityName, 'partitionBy', name, properties);
  }
}

/**
 * Normalize and validate EntityRetention. Returns undefined when omitted.
 * Fail-fast on filtered/merged hosts, hard-deletion hosts, and malformed unions.
 */
export function normalizeEntityRetention(
  entityName: string,
  retention: EntityRetention | undefined,
  context: {
    properties?: PropertyInstance[]
    baseEntity?: unknown
    inputEntities?: unknown
  },
): EntityRetention | undefined {
  if (retention === undefined) return undefined;
  if (retention === null || typeof retention !== 'object' || Array.isArray(retention)) {
    throw new Error(
      `Entity "${entityName}" retention must be a discriminated object with mode "forever" | "cap" | "ttl".`,
    );
  }
  if (context.baseEntity) {
    throw new Error(
      `Filtered entity "${entityName}" cannot declare retention. Retention applies only to ordinary (physical) entities — declare it on the base entity instead.`,
    );
  }
  if (context.inputEntities) {
    throw new Error(
      `Merged entity "${entityName}" cannot declare retention. Retention applies only to ordinary (physical) entities — declare it on each input entity instead.`,
    );
  }
  const properties = context.properties || [];
  if (properties.some(p => p.name === HARD_DELETION_PROPERTY_NAME)) {
    throw new Error(
      `Entity "${entityName}" cannot declare retention together with hard-deletion property "${HARD_DELETION_PROPERTY_NAME}". ` +
      `Hard deletion already owns physical removal of host rows; choose one mechanism.`,
    );
  }

  const mode = (retention as { mode?: unknown }).mode;
  if (mode === 'forever') {
    const extra = Object.keys(retention).filter(k => k !== 'mode');
    if (extra.length) {
      throw new Error(
        `Entity "${entityName}" retention.mode "forever" does not accept fields: ${extra.join(', ')}.`,
      );
    }
    return { mode: 'forever' };
  }

  if (mode === 'cap') {
    const cap = retention as Extract<EntityRetention, { mode: 'cap' }>;
    if (typeof cap.retainLatest !== 'number' || !Number.isInteger(cap.retainLatest) || cap.retainLatest <= 0) {
      throw new Error(
        `Entity "${entityName}" retention.mode "cap" requires retainLatest to be a positive integer.`,
      );
    }
    if (!Array.isArray(cap.orderBy) || cap.orderBy.length === 0) {
      throw new Error(
        `Entity "${entityName}" retention.mode "cap" requires a non-empty orderBy array (each key sorted descending). ` +
        `Implicit createdAt is not applied — declare orderBy explicitly.`,
      );
    }
    for (const key of cap.orderBy) {
      assertRetentionPropertyName(entityName, 'orderBy', key, properties);
    }
    assertPartitionBy(entityName, cap.partitionBy, properties);
    assertTtlConfig(entityName, cap.ttl, properties, false);
    const normalized: Extract<EntityRetention, { mode: 'cap' }> = {
      mode: 'cap',
      retainLatest: cap.retainLatest,
      orderBy: [...cap.orderBy],
    };
    if (cap.partitionBy !== undefined) {
      normalized.partitionBy = [...cap.partitionBy];
    }
    if (cap.ttl !== undefined) {
      normalized.ttl = {
        timestampProperty: cap.ttl.timestampProperty,
        maxAgeMs: cap.ttl.maxAgeMs,
      };
    }
    return normalized;
  }

  if (mode === 'ttl') {
    const ttlMode = retention as Extract<EntityRetention, { mode: 'ttl' }> & {
      retainLatest?: unknown
      orderBy?: unknown
    };
    if (ttlMode.retainLatest !== undefined || ttlMode.orderBy !== undefined) {
      throw new Error(
        `Entity "${entityName}" retention.mode "ttl" must not declare retainLatest or orderBy. ` +
        `Use mode "cap" when a latest-N bound is required (optionally with ttl).`,
      );
    }
    assertTtlConfig(entityName, ttlMode.ttl, properties, true);
    assertPartitionBy(entityName, ttlMode.partitionBy, properties);
    const normalized: Extract<EntityRetention, { mode: 'ttl' }> = {
      mode: 'ttl',
      ttl: {
        timestampProperty: ttlMode.ttl.timestampProperty,
        maxAgeMs: ttlMode.ttl.maxAgeMs,
      },
    };
    if (ttlMode.partitionBy !== undefined) {
      normalized.partitionBy = [...ttlMode.partitionBy];
    }
    return normalized;
  }

  throw new Error(
    `Entity "${entityName}" retention.mode must be "forever", "cap", or "ttl" (got ${JSON.stringify(mode)}).`,
  );
}

export class Entity implements EntityInstance {
  public uuid: string;
  public _type = 'Entity';
  public _options?: { uuid?: string };
  public name: string;
  public properties: PropertyInstance[];
  public computation?: ComputationInstance;
  public baseEntity?: EntityInstance | RelationInstance;
  public matchExpression?: object;
  public inputEntities?: EntityInstance[]; // for Merged Entity
  public commonProperties?: PropertyInstance[]; // for Merged Entity
  public constraints?: ConstraintInstance[];
  public retention?: EntityRetention;
  constructor(args: EntityCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.properties = args.properties || [];
    this.computation = args.computation;
    this.baseEntity = args.baseEntity;
    this.matchExpression = args.matchExpression;
    this.inputEntities = args.inputEntities;
    this.commonProperties = args.commonProperties;
    this.constraints = args.constraints;
    this.retention = args.retention;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Entity';
  static instances: EntityInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      constraints: {
        nameFormat: ({name}: { name: string }) => {
          return validNameFormatExp.test(name);
        }
      }
    },
    properties: {
      type: 'Property' as const,
      collection: true as const,
      required: true as const,
      constraints: {
        eachNameUnique: ({properties}: {properties: PropertyInstance[]}) => {
          const uniqueNames = new Set(properties.map((p: PropertyInstance) => p.name));
          return uniqueNames.size === properties.length;
        }
      },
      defaultValue: () => []
    },
    commonProperties: {
      type: 'Property' as const,
      collection: true as const,
      required: false as const,
      constraints: {
        // CAUTION 谓词收到的是完整 create args（klassValidation 契约），本字段名是
        //  commonProperties——此前误读 properties（r27 记录的潜伏元数据缺陷，r32 修正）：
        //  接线后会拿宿主 properties 判 commonProperties 的唯一性（merged entity 的
        //  properties 恒空 ⇒ 谓词崩溃/恒真，约束形同虚设）。
        eachNameUnique: ({commonProperties}: {commonProperties: PropertyInstance[]}) => {
          const uniqueNames = new Set(commonProperties.map((p: PropertyInstance) => p.name));
          return uniqueNames.size === commonProperties.length;
        }
      },
      defaultValue: () => []
    },
    computation: {
      type: [] as const,
      collection: false as const,
      required: false as const,
    },
    baseEntity: {
      type: ['Entity', 'Relation'] as const,
      collection: false as const,
      required: false as const,
    },
    matchExpression: {
      type: 'object' as const,
      collection: false as const,
      required: false as const,
    },
    inputEntities: {
      type: 'Entity' as const,
      collection: true as const,
      required: false as const,
      constraints: {
        mergedEntityNoProperties: ({properties, inputEntities}: {properties: PropertyInstance[], inputEntities?: EntityInstance[]}) => {
          // Merged entity should not have any properties defined
          if (inputEntities && inputEntities.length > 0 && properties && properties.length > 0) {
            return false;
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
    },
    retention: {
      type: 'object' as const,
      collection: false as const,
      required: false as const,
    },
  };
  
  static create(args: EntityCreateArgs, options?: { uuid?: string }): EntityInstance {
    // 强制执行 nameFormat 约束：name 会被用作表名/字段名/别名直接进入 SQL，必须严格校验。
    if (typeof args.name !== 'string' || !validNameFormatExp.test(args.name)) {
      throw new Error(`Entity name "${args.name}" is invalid. Entity names must match ${validNameFormatExp} (letters, numbers and underscore only).`);
    }
    // filtered entity 是 base 上的谓词视图：没有 matchExpression 的"视图"没有任何语义
    // （查询重写拿不到谓词，setup/查询在深处抛裸 TypeError），必须在声明期 fail-fast。
    if (args.baseEntity && !args.matchExpression) {
      throw new Error(`Filtered entity "${args.name}" declares baseEntity but no matchExpression. A filtered entity is a predicate view over its base — declare matchExpression, or use the base entity directly.`);
    }
    // matchExpression 只在 filtered entity（有 baseEntity）上有语义。孤立的 matchExpression
    // 会被 setup 静默忽略（按普通实体建表，谓词从不生效）——零告警的声明失效，必须 fail-fast。
    if (args.matchExpression && !args.baseEntity) {
      throw new Error(`Entity "${args.name}" declares matchExpression without baseEntity. matchExpression only has meaning on a filtered entity — declare baseEntity as well, or remove matchExpression.`);
    }
    // filtered（baseEntity + matchExpression）与 merged（inputEntities）是互斥的声明模式：
    // 同时声明时 merged 编译管线会静默吞掉 filtered 语义（谓词从不生效），必须 fail-fast。
    if (args.baseEntity && args.inputEntities) {
      throw new Error(`Entity "${args.name}" declares both baseEntity (filtered entity) and inputEntities (merged entity). These are mutually exclusive declaration modes — to filter a merged entity, declare the merged entity first and create a separate filtered entity on top of it.`);
    }
    // Merged entity with an empty inputEntities array is a silently-broken declaration:
    // truthy [] still enters the merged compile path, producing a union with zero members.
    // Relation already rejects empty inputRelations — keep Entity symmetric (r23).
    if (args.inputEntities && args.inputEntities.length === 0) {
      throw new Error(`Entity "${args.name}" declares inputEntities as an empty array. A merged entity must have at least one inputEntity (same rule as Relation.inputRelations).`);
    }
    // merged entity 的属性面 = inputEntities 属性并集 + commonProperties；直接声明 properties
    // 与文档契约矛盾，且此前会被静默并进物理表（任何 input 视图都写不到的半孤儿列）——
    // static.public 的 mergedEntityNoProperties 约束此前从未接线到 create（r25）。
    if (args.inputEntities && args.properties && args.properties.length > 0) {
      throw new Error(`Merged entity "${args.name}" cannot declare properties (got: ${args.properties.map(p => p.name).join(', ')}). Its property surface is the union of its inputEntities' properties; use commonProperties to require a shared property across all inputs.`);
    }
    // commonProperties 只在 merged entity 上有语义；孤立声明会被编译静默忽略——零告警失效（r25）。
    if (args.commonProperties && args.commonProperties.length > 0 && !args.inputEntities) {
      throw new Error(`Entity "${args.name}" declares commonProperties without inputEntities. commonProperties only has meaning on a merged entity — declare inputEntities as well, or move these into properties.`);
    }
    // 保留名（id/_rowId）与重复属性名守卫：见 propertyNameGuards.ts。
    // commonProperties 与 properties 共享同一物理属性命名空间，走同一守卫（r25：此前绕过）。
    validatePropertyNamesOnCreate(args.name, args.properties, 'Entity');
    validatePropertyNamesOnCreate(args.name, args.commonProperties, 'Entity');

    const retention = normalizeEntityRetention(args.name, args.retention, {
      properties: args.properties,
      baseEntity: args.baseEntity,
      inputEntities: args.inputEntities,
    });

    const instance = new Entity({ ...args, retention }, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Entity`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: EntityInstance): string {
    return stringifyInstance(this, instance);
  }
  
  // CAUTION clone 不注册进全局 registry（Entity.instances）：clone 是运行时图手术
  //  （RefContainer / Setup）用的工作副本，注册会污染 stringifyAllInstances 输出并跨测试泄漏。
  //  Relation.clone / Property.clone 遵循同样的语义。
  //  deep=true：属性深拷贝，避免 MergedItemProcessor.rebaseAsFilteredItem 等调用方
  //  拿到的副本与声明图共享 Property 实例（r23：此前 deep 参数被忽略）。
  static clone(instance: EntityInstance, deep: boolean): EntityInstance {
    const args: EntityCreateArgs = {
      name: instance.name,
      properties: deep
        ? instance.properties.map(p => Property.clone(p, deep))
        : [...instance.properties],
      computation: instance.computation,
      baseEntity: instance.baseEntity,
      matchExpression: instance.matchExpression,
      inputEntities: instance.inputEntities,
      commonProperties: deep && instance.commonProperties
        ? instance.commonProperties.map(p => Property.clone(p, deep))
        : instance.commonProperties,
      constraints: deep && instance.constraints
        ? [...instance.constraints]
        : instance.constraints,
      retention: instance.retention
        ? (JSON.parse(JSON.stringify(instance.retention)) as EntityRetention)
        : undefined,
    };
    
    return new Entity(args);
  }
  
  static is(obj: unknown): obj is EntityInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Entity';
  }
  
  static check(data: unknown): boolean {
    if (data === null || typeof data !== 'object') return false;
    
    // 如果是完整的 Entity 实例
    if ('_type' in data && (data as IInstance)._type === 'Entity') {
      return true;
    }
    
    // 如果是实体引用（有 id 属性）
    if ('id' in data) {
      return true;
    }
    
    // 如果是新创建的实体数据（至少有一些属性）
    if (Object.keys(data).length > 0) {
      return true;
    }
    
    return false;
  }
  
  static parse(json: string): EntityInstance {
    const data: SerializedData<EntityCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 