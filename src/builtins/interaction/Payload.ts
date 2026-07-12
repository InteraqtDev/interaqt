import { IInstance, SerializedData, generateUUID, decodeFunctionValues, stringifyInstance } from '@core';
import { PayloadItemInstance } from './PayloadItem.js';

export interface PayloadInstance extends IInstance {
  items: PayloadItemInstance[];
}

export interface PayloadCreateArgs {
  items?: PayloadItemInstance[];
}

export class Payload implements PayloadInstance {
  public uuid: string;
  public _type = 'Payload';
  public _options?: { uuid?: string };
  public items: PayloadItemInstance[];
  
  constructor(args: PayloadCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.items = args.items || [];
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Payload';
  static instances: PayloadInstance[] = [];
  
  static public = {
    items: {
      type: 'PayloadItem' as const,
      collection: true as const,
      required: true as const,
      defaultValue: () => []
    }
  };
  
  static create(args: PayloadCreateArgs, options?: { uuid?: string }): PayloadInstance {
    // 同名 item 是矛盾声明：checkPayload 按 name 查找定义并逐定义校验同一个值，
    //  重复声明中只有一份真正生效（后写的校验以同一 payload 值重复执行），静默保留双份声明
    //  会让作者以为两份都在工作。声明期 fail-fast（与 Entity/Relation 的重复属性名守卫同族）。
    const seenNames = new Set<string>();
    for (const item of args.items || []) {
      if (seenNames.has(item.name)) {
        throw new Error(`Payload declares duplicate item name "${item.name}". Each payload item name must be unique.`);
      }
      seenNames.add(item.name);
    }
    const instance = new Payload(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Payload`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  // CAUTION 必须走统一的 stringifyInstance 管线：items 编码为 uuid:: 引用，
  //  否则 graph round-trip 后 items 变成与 PayloadItem 实例失去身份关联的裸对象。
  static stringify(instance: PayloadInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: PayloadInstance, deep: boolean): PayloadInstance {
    return this.create({
      items: instance.items
    });
  }
  
    static is(obj: unknown): obj is PayloadInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Payload';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): PayloadInstance {
    const data: SerializedData<PayloadCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 