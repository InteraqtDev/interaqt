import { IInstance, SerializedData, generateUUID } from '@core';

// Action 实例接口
export interface ActionInstance extends IInstance {
  name: string;
}

// Action 创建参数
export interface ActionCreateArgs {
  name: string;
}

// Action 类定义
export class Action implements ActionInstance {
  public uuid: string;
  public _type = 'Action';
  public _options?: { uuid?: string };
  public name: string;

  constructor(args: ActionCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
  }

  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Action';
  static instances: ActionInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const
    }
  };

  static create(args: ActionCreateArgs, options?: { uuid?: string }): ActionInstance {
    const instance = new Action(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Action`);
    }
    
    this.instances.push(instance);
    return instance;
  }

  static stringify(instance: ActionInstance): string {
    const data: SerializedData<ActionCreateArgs> = {
      type: 'Action',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        name: instance.name
      }
    };
    return JSON.stringify(data);
  }

  static clone(instance: ActionInstance, deep: boolean): ActionInstance {
    return this.create({
      name: instance.name
    });
  }

    static is(obj: unknown): obj is ActionInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Action';
  }

    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }

  static parse(json: string): ActionInstance {
    const data: SerializedData<ActionCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}

// 导出类型，保持兼容性
export type { Action as ActionKlass };

// 导出 GetAction 实例
export const GetAction = Action.create({ name: 'get' });

 