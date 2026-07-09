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

function isKlassInstance(obj: unknown): obj is IInstance {
  return isObject(obj) && !isPlainObject(obj)
    && typeof (obj as IInstance).uuid === 'string'
    && typeof (obj as IInstance)._type === 'string';
}

// 辅助函数：递归序列化属性值。
// 编码规则：Function -> `func::<source>`；Klass 实例 -> `uuid::<uuid>`；
// 数组/普通对象逐项递归；其余值原样返回。
export function stringifyAttribute(obj: unknown): unknown {
  if (typeof obj === 'function') {
    return `func::${obj.toString()}`;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => stringifyAttribute(item));
  }
  if (isKlassInstance(obj)) {
    return `uuid::${obj.uuid}`;
  }
  if (isPlainObject(obj)) {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, stringifyAttribute(value)]));
  }
  return obj;
}

// 通用实例序列化：以 Klass.public 声明的字段为单一事实来源，
// 保证 stringify 不因手写字段清单而与 CreateArgs 漂移。
export function stringifyInstance(
  Klass: { displayName: string, public: Record<string, unknown> },
  instance: IInstance
): string {
  const args: Record<string, unknown> = {};
  for (const key of Object.keys(Klass.public)) {
    const value = (instance as unknown as Record<string, unknown>)[key];
    if (value !== undefined) {
      args[key] = stringifyAttribute(value);
    }
  }
  const data = {
    type: Klass.displayName,
    options: instance._options,
    uuid: instance.uuid,
    public: args,
  };
  return JSON.stringify(data);
}

// 递归还原 `func::` 编码的函数。单个实例的 parse 只能还原函数；
// `uuid::` 引用需要完整的实例集合才能解析（见 createInstances）。
//
// SECURITY 信任边界：`func::` 的还原通过 `new Function` 执行序列化文本，等价于执行任意代码。
//  序列化的实例图（stringifyAllInstances 的产物、migration manifest 等）必须与应用源码同信任级：
//  只能来自你自己构建/部署的制品。绝不能把来自网络请求、用户上传、不可信存储的 JSON
//  喂给 createInstancesFromString / Klass.parse——那等于给对方远程代码执行能力。
export function decodeFunctionValues<T>(value: T): T {
  if (typeof value === 'string' && value.startsWith('func::')) {
    return new Function('return ' + value.substring(6))() as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => decodeFunctionValues(item)) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeFunctionValues(item)])) as T;
  }
  return value;
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

// 反序列化一组实例，解析 stringifyAttribute 产生的 `func::` / `uuid::` 编码。
// 依赖引用按需递归创建；循环引用（如 property.computation -> relation -> entity ->
// property）通过延迟回填解决：先以 undefined 占位创建，被引用实例创建完成后再赋值。
// 未注册的类型、无法解析的引用、重复 uuid 一律抛错（fail-closed，不静默丢数据）。
//
// SECURITY 输入必须与应用源码同信任级（`func::` 还原会执行任意代码，见 decodeFunctionValues）。
export function createInstances(objects: SerializedInstanceInput[]) {
  const dataByUUID = new Map<string, SerializedInstanceInput>();
  for (const object of objects) {
    if (!KlassByName.get(object.type)) {
      throw new Error(`Cannot create instance of unknown class "${object.type}". Make sure the class is registered via registerKlass (see core/init.ts and builtins/init.ts).`);
    }
    if (dataByUUID.has(object.uuid)) {
      throw new Error(`Duplicate uuid "${object.uuid}" in serialized instances`);
    }
    dataByUUID.set(object.uuid, object);
  }

  const uuidToInstance = new Map<string, IInstance>();
  const creating = new Set<string>();
  // 循环引用的延迟回填：目标实例创建完成后，调用 assign 写回引用方。
  const pendingAssigns = new Map<string, Array<(instance: IInstance) => void>>();

  function decodeValue(value: unknown, assign: (decoded: unknown) => void): void {
    if (typeof value === 'string') {
      if (value.startsWith('func::')) {
        return assign(new Function('return ' + value.substring(6))());
      }
      if (value.startsWith('uuid::')) {
        const refUUID = value.substring(6);
        const existing = uuidToInstance.get(refUUID);
        if (existing) return assign(existing);
        if (creating.has(refUUID)) {
          // 循环引用：先占位，等目标创建完成后回填。
          const assigns = pendingAssigns.get(refUUID) || [];
          assigns.push(assign);
          pendingAssigns.set(refUUID, assigns);
          return assign(undefined);
        }
        const refData = dataByUUID.get(refUUID);
        if (!refData) {
          throw new Error(`Cannot resolve reference "uuid::${refUUID}": no serialized instance with this uuid`);
        }
        return assign(createOne(refData));
      }
      return assign(value);
    }
    if (Array.isArray(value)) {
      const result = new Array(value.length);
      value.forEach((item, index) => decodeValue(item, decoded => { result[index] = decoded; }));
      return assign(result);
    }
    if (isPlainObject(value)) {
      const result: Record<string, unknown> = {};
      Object.entries(value).forEach(([key, item]) => decodeValue(item, decoded => { result[key] = decoded; }));
      return assign(result);
    }
    return assign(value);
  }

  // `computation` 字段是实例图中唯一的常规环入口（entity -> property -> computation ->
  //  record -> entity）。它在所有类上都是可选字段，所以统一延迟到全部实例创建完成后再
  //  解析，避免环被打断在某个必填的结构字段上（如 Relation.source）导致 create 校验失败。
  const LAZY_KEYS = new Set(['computation']);
  const lazyJobs: Array<() => void> = [];

  function createOne(data: SerializedInstanceInput): IInstance {
    const { type, options = {}, uuid, public: rawProps } = data;
    const created = uuidToInstance.get(uuid);
    if (created) return created;

    creating.add(uuid);
    const Klass = KlassByName.get(type)!;
    const args: Record<string, unknown> = {};
    let instance: IInstance | undefined;
    Object.entries(rawProps || {}).forEach(([key, rawValue]) => {
      if (LAZY_KEYS.has(key)) {
        lazyJobs.push(() => {
          decodeValue(rawValue, decoded => {
            (instance as unknown as Record<string, unknown>)[key] = decoded;
          });
        });
        return;
      }
      // assign 可能被调用两次：创建前写入 args，循环引用解析后写回实例字段。
      decodeValue(rawValue, decoded => {
        if (instance) {
          (instance as unknown as Record<string, unknown>)[key] = decoded;
        } else {
          args[key] = decoded;
        }
      });
    });

    instance = Klass.create(args, { ...options, uuid });
    creating.delete(uuid);
    uuidToInstance.set(uuid, instance);

    const assigns = pendingAssigns.get(uuid);
    if (assigns) {
      pendingAssigns.delete(uuid);
      assigns.forEach(assign => assign(instance!));
    }
    return instance;
  }

  for (const object of objects) {
    createOne(object);
  }
  lazyJobs.forEach(job => job());

  if (pendingAssigns.size > 0) {
    throw new Error(`Unresolved instance references after deserialization: ${Array.from(pendingAssigns.keys()).join(', ')}`);
  }

  return uuidToInstance;
}
