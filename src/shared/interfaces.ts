import { uuidv7 } from 'uuidv7';
// 基础实例接口
export interface IInstance {
  uuid: string;
  _type: string;
  _options?: { uuid?: string };
}

// 类需要实现的标准接口
export interface IKlass<TInstance extends IInstance, TCreateArgs> {
  // 静态属性
  isKlass: true;
  displayName: string;
  instances: TInstance[];
  public: Record<string, unknown>;
  
  // 静态方法
  create(args: TCreateArgs, options?: { uuid?: string }): TInstance;
  stringify(instance: TInstance): string;
  clone(instance: TInstance, deep: boolean): TInstance;
  is(obj: unknown): obj is TInstance;
  check(data: unknown): boolean;
  parse(json: string): TInstance;
}

// 序列化数据格式
export interface SerializedData<T> {
  type: string;
  options?: { uuid?: string };
  uuid: string;
  public: T;
}

// 基础类实现的抽象类
export abstract class BaseKlass<TInstance extends IInstance, TCreateArgs> {
  static isKlass = true as const;
  static instances: IInstance[] = [];
  
  // 子类需要实现的抽象属性
  static displayName: string;
  static public: Record<string, unknown>;
  
  // 通用的 create 方法实现
  static createBase<T extends IInstance>(
    instance: T,
    instances: T[]
  ): T {
    // 检查 uuid 是否重复
    const existing = instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, ${instance._type}`);
    }
    
    instances.push(instance);
    return instance;
  }
  
  // 通用的 is 方法实现
  static isBase<T extends IInstance>(obj: unknown, typeName: string): obj is T {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === typeName;
  }
  
  // 通用的 check 方法实现
  static checkBase(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
}

// 生成 UUID 的辅助函数
export function generateUUID(options?: { uuid?: string }): string {
  return options?.uuid || uuidv7();
}

// 概念相关的类型
export interface Concept {
  name: string;
  [key: string]: unknown;
}

export interface DerivedConcept extends Concept {
  base?: Concept;
  attributive?: unknown;
}

export interface ConceptAlias extends Concept {
  for: Concept[];
}

export type ConceptInstance = unknown;

// Interaction 相关类型
export type InteractionInstanceType = import('./Interaction.js').InteractionInstance;

// Activity 相关类型别名
export type ActivityInstanceType = import('./Activity.js').ActivityInstance;
export type ActivityGroupInstanceType = import('./Activity.js').ActivityGroupInstance;
export type GatewayInstanceType = import('./Gateway.js').GatewayInstance;
export type TransferInstanceType = import('./Activity.js').TransferInstance;

// 其他常用的实例类型别名
export type EntityInstanceType = import('./Entity.js').EntityInstance;
export type RelationInstanceType = import('./Relation.js').RelationInstance;
export type PropertyInstanceType = import('./Property.js').PropertyInstance;
export type AttributiveInstanceType = import('./Attributive.js').AttributiveInstance;
export type ConditionInstanceType = import('./Condition.js').ConditionInstance; 