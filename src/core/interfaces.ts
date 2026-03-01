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

// 生成静态累加 ID 的辅助函数
let globalIdCounter = 0;
export function generateUUID(options?: { uuid?: string }): string {
  // 如果提供了 uuid，则使用提供的值；否则生成递增 ID
  return options?.uuid || `id_${++globalIdCounter}`;
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

// Entity/Relation/Property type aliases
export type EntityInstanceType = import('./Entity.js').EntityInstance;
export type RelationInstanceType = import('./Relation.js').RelationInstance;
export type PropertyInstanceType = import('./Property.js').PropertyInstance;
