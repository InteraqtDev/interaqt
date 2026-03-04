import type { IInstance } from "./interfaces";

// 工具函数
export function isObject(obj: unknown): obj is object {
  return obj !== null && typeof obj === 'object';
}

export function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  if (!isObject(obj)) return false;
  
  // 检查原型链
  const proto = Object.getPrototypeOf(obj);
  if (proto === null) return true;
  
  // 检查是否是通过 Object 构造函数创建的
  return proto === Object.prototype || proto === null;
}

export function indexBy<T extends Record<string, unknown>>(array: T[], key: keyof T): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of array) {
    if (item && item[key] !== undefined) {
      result[String(item[key])] = item;
    }
  }
  return result;
}

// 辅助函数：序列化属性值
export function stringifyAttribute(obj: unknown): unknown {
  if (typeof obj === 'function') {
    return `func::${obj.toString()}`;
  } else if (Array.isArray(obj)) {
    // 数组应该原样返回，不进行特殊处理
    return obj;
  } else if (isObject(obj) && !isPlainObject(obj)) {
    return `uuid::${(obj as IInstance).uuid}`;
  } else {
    return obj;
  }
}

// 辅助函数：深度克隆
export function deepClone<T>(obj: T, deepCloneKlass?: boolean): T {
  if (obj === undefined || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return (obj as unknown[]).map(v => deepClone(v, deepCloneKlass)) as T;
  if (isPlainObject(obj)) {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, deepClone(value, deepCloneKlass)])) as T;
  }

  if ((obj as object) instanceof Set) {
    return new Set(Array.from((obj as unknown as Set<unknown>).values()).map(v => deepClone(v, deepCloneKlass))) as T;
  }

  if ((obj as object) instanceof Map) {
    return new Map(Array.from((obj as unknown as Map<unknown, unknown>).entries()).map(([k, v]) => [k, deepClone(v, deepCloneKlass)])) as T;
  }

  // 如果是类实例
  const instance = obj as unknown as IInstance & { constructor?: { clone?: (obj: unknown, deep: boolean) => unknown } };
  if (deepCloneKlass && instance._type && instance.constructor?.clone) {
    return instance.constructor.clone(obj, deepCloneKlass) as T;
  }

  return obj;
}

// 清理所有实例（用于测试）
export function clearAllInstances(...klasses: Array<{ instances: IInstance[] }>) {
  for (const klass of klasses) {
    klass.instances.length = 0;
  }
}

export interface KlassLike {
  isKlass: true;
  displayName: string;
  instances: IInstance[];
  stringify?: (instance: IInstance) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (args: any, options?: { uuid?: string }) => IInstance;
}

export const KlassByName = new Map<string, KlassLike>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any klass-like object with isKlass and displayName
export function registerKlass(name: string, klassLike: any) {
  if (klassLike && klassLike.isKlass && klassLike.displayName) {
    KlassByName.set(name, klassLike as KlassLike);
  }
}

export function stringifyAllInstances(): string {
  const result: string[] = [];
  Array.from(KlassByName.entries()).forEach(([, Klass]) => {
    if (Klass.instances && Array.isArray(Klass.instances) && Klass.stringify) {
      result.push(...Klass.instances.map((instance: IInstance) => Klass.stringify!(instance)));
    }
  });
  return `[${result.join(',')}]`;
}

type SerializedInstanceInput = {
  type: string;
  options?: { uuid?: string };
  uuid: string;
  public?: Record<string, unknown>;
}

export function createInstancesFromString(objStr: string) {
  const objects = JSON.parse(objStr) as SerializedInstanceInput[];
  return createInstances(objects);
}

export function createInstances(objects: SerializedInstanceInput[]) {
  const uuidToInstance = new Map<string, IInstance>();
  
  objects.forEach(({ type, options = {}, uuid, public: rawProps }) => {
    const Klass = KlassByName.get(type);
    if (!Klass) {
      console.warn(`Class ${type} not found in KlassByName`);
      return;
    }
    
    const instance = Klass.create(rawProps || {}, { ...options, uuid });
    uuidToInstance.set(uuid, instance);
  });
  
  return uuidToInstance;
}
