import { IInstance, SerializedData, generateUUID, decodeFunctionValues } from '@core';

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
    // GetAction 单例的幂等重建：反序列化（createInstances）会带着固定 uuid 重新 create。
    //  注册表里已有该单例时直接返回它（而不是抛 duplicate uuid），保证 round-trip 后
    //  引用仍然指向同一个查询 action 身份。名字必须是 'get'——固定 uuid 是查询语义的
    //  唯一标识，挂其他名字属于损毁的序列化数据，fail-fast。
    if (options?.uuid === GET_ACTION_UUID) {
      if (args.name !== 'get') {
        throw new Error(`Action with the reserved GetAction uuid must be named "get", got "${args.name}". The GET_ACTION_UUID identity is reserved for the built-in query action.`);
      }
      const existingGetAction = this.instances.find(i => i.uuid === GET_ACTION_UUID);
      if (existingGetAction) return existingGetAction;
    }

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
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}

// 导出类型，保持兼容性
export type { Action as ActionKlass };

// GetAction 的固定 uuid：查询语义的唯一身份标识。
// CAUTION 查询语义必须绑定在跨序列化稳定的身份上：
//  - 不能按引用同一性（round-trip 重建的 Action 对象 `===` 判定必然失败，resolve 静默丢失）；
//  - 也不能按 name === 'get'（'get' 是常用词，用户自建同名 Action 会在不知情的情况下
//    获得/被期望获得查询语义）。
//  固定 uuid 随序列化保留，跨进程/round-trip 后仍可识别；普通 Action 的 uuid 是
//  进程内递增值，不会与之冲突。
export const GET_ACTION_UUID = 'interaqt:builtin:action:get';

// 导出 GetAction 实例——声明查询交互（data/dataPolicy）时必须使用这个常量。
export const GetAction = Action.create({ name: 'get' }, { uuid: GET_ACTION_UUID });

 