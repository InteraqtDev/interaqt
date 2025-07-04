import { isPlainObject, isObject } from "../utils.js";
import type { IInstance } from "./interfaces";

// 辅助函数：序列化属性值
export function stringifyAttribute(obj: unknown): unknown {
  if (typeof obj === 'function') {
    return `func::${obj.toString()}`;
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
    return new Set(Array.from((obj as Set<unknown>).values()).map(v => deepClone(v, deepCloneKlass))) as T;
  }

  if ((obj as object) instanceof Map) {
    return new Map(Array.from((obj as Map<unknown, unknown>).entries()).map(([k, v]) => [k, deepClone(v, deepCloneKlass)])) as T;
  }

  // 如果是 Klass 实例
  const instance = obj as IInstance & { constructor?: { clone?: (obj: unknown, deep: boolean) => unknown } };
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