import { IInstance, SerializedData, generateUUID } from '../../core/interfaces.js';

// Gateway 实例接口
export interface GatewayInstance extends IInstance {
  name: string;
}

// Gateway 创建参数
export interface GatewayCreateArgs {
  name: string;
}

// Gateway 类定义
export class Gateway implements GatewayInstance {
  public uuid: string;
  public _type = 'Gateway';
  public _options?: { uuid?: string };
  public name: string;

  constructor(args: GatewayCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
  }

  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Gateway';
  static instances: GatewayInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const
    }
  };

  static create(args: GatewayCreateArgs, options?: { uuid?: string }): GatewayInstance {
    const instance = new Gateway(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Gateway`);
    }
    
    this.instances.push(instance);
    return instance;
  }

  static stringify(instance: GatewayInstance): string {
    const data: SerializedData<GatewayCreateArgs> = {
      type: 'Gateway',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        name: instance.name
      }
    };
    return JSON.stringify(data);
  }

  static clone(instance: GatewayInstance, deep: boolean): GatewayInstance {
    return this.create({
      name: instance.name
    });
  }

    static is(obj: unknown): obj is GatewayInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Gateway';
  }

    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }

  static parse(json: string): GatewayInstance {
    const data: SerializedData<GatewayCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 