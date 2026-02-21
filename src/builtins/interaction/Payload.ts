import { IInstance, SerializedData, generateUUID } from '@core';
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
    const instance = new Payload(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Payload`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: PayloadInstance): string {
    const data: SerializedData<PayloadCreateArgs> = {
      type: 'Payload',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        items: instance.items
      }
    };
    return JSON.stringify(data);
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
    return this.create(data.public, data.options);
  }
} 