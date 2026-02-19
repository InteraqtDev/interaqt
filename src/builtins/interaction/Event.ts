import { IInstance, SerializedData, generateUUID } from '../../core/interfaces.js';

// Event 实例接口
export interface EventInstance extends IInstance {
  name: string;
}

// Event 创建参数
export interface EventCreateArgs {
  name: string;
}

// Event 类定义
export class Event implements EventInstance {
  public uuid: string;
  public _type = 'Event';
  public _options?: { uuid?: string };
  public name: string;

  constructor(args: EventCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
  }

  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Event';
  static instances: EventInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const
    }
  };

  static create(args: EventCreateArgs, options?: { uuid?: string }): EventInstance {
    const instance = new Event(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Event`);
    }
    
    this.instances.push(instance);
    return instance;
  }

  static stringify(instance: EventInstance): string {
    const data: SerializedData<EventCreateArgs> = {
      type: 'Event',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        name: instance.name
      }
    };
    return JSON.stringify(data);
  }

  static clone(instance: EventInstance, deep: boolean): EventInstance {
    return this.create({
      name: instance.name
    });
  }

    static is(obj: unknown): obj is EventInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Event';
  }

    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }

  static parse(json: string): EventInstance {
    const data: SerializedData<EventCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 