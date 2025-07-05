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

// indexBy 函数 - 将数组转换为以指定属性为键的对象
export function indexBy<T extends Record<string, any>>(array: T[], key: keyof T): Record<string, T> {
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

// 向后兼容性支持：提供一个空的 removeAllInstance 函数
// 在重构后的代码中，我们不再使用全局实例管理，所以这个函数不做任何事情
export function removeAllInstance() {
  // No-op: 在重构后的版本中，实例管理是局部的，不需要全局清理
}

// KlassByName 兼容层
// 全局的类注册表
export const KlassByName = new Map<string, any>();

// 注册一个重构后的类到 KlassByName
export function registerKlass(name: string, klassLike: any) {
  if (klassLike && klassLike.isKlass && klassLike.displayName) {
    KlassByName.set(name, klassLike);
  }
}

// 序列化所有实例
export function stringifyAllInstances(): string {
  const result: string[] = [];
  // 使用 Array.from 来避免迭代问题
  Array.from(KlassByName.entries()).forEach(([, Klass]) => {
    if (Klass.instances && Array.isArray(Klass.instances) && Klass.stringify) {
      result.push(...Klass.instances.map((instance: any) => Klass.stringify(instance)));
    }
  });
  return `[${result.join(',')}]`;
}

// 从字符串创建实例
export function createInstancesFromString(objStr: string) {
  const objects = JSON.parse(objStr);
  return createInstances(objects);
}

// 创建实例
export function createInstances(objects: any[]) {
  const uuidToInstance = new Map<string, any>();
  const unsatisfiedInstances = new Map<any, object>();
  
  objects.forEach(({ type, options = {}, uuid, public: rawProps }: any) => {
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

// 导出 createClass 作为空操作
export function createClass(meta: any): any {
  console.warn('createClass is deprecated in refactored code');
  return null;
} 