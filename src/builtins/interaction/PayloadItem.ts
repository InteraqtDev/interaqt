import { IInstance, SerializedData, generateUUID, decodeFunctionValues, stringifyInstance, EntityInstance, RelationInstance, Entity, Relation } from '@core';

export interface PayloadItemInstance extends IInstance {
  name: string;
  type: string;
  base?: EntityInstance | RelationInstance;
  isRef?: boolean;
  required?: boolean;
  isCollection?: boolean;
}

export interface PayloadItemCreateArgs {
  name: string;
  type: string;
  base?: EntityInstance | RelationInstance;
  isRef?: boolean;
  required?: boolean;
  isCollection?: boolean;
}

export class PayloadItem implements PayloadItemInstance {
  public uuid: string;
  public _type = 'PayloadItem';
  public _options?: { uuid?: string };
  public name: string;
  public base?: EntityInstance | RelationInstance;
  public isRef: boolean;
  public required: boolean;
  public isCollection: boolean;
  public type: string;
  constructor(args: PayloadItemCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.base = args.base;
    this.type = args.type;
    this.isRef = args.isRef ?? false;
    this.required = args.required ?? false;
    this.isCollection = args.isCollection ?? false;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'PayloadItem';
  static instances: PayloadItemInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const
    },
    type: {
      type: 'string' as const,
      required: true as const
    },
    base: {
      type: ['Entity', 'Relation'] as const,
      required: false as const,
      collection: false as const
    },
    isRef: {
      type: 'boolean' as const,
      collection: false as const,
      defaultValue: () => false
    },
    required: {
      type: 'boolean' as const,
      collection: false as const,
      defaultValue: () => false
    },
    isCollection: {
      type: 'boolean' as const,
      collection: false as const,
      defaultValue: () => false
    }
  };
  
  static create(args: PayloadItemCreateArgs, options?: { uuid?: string }): PayloadItemInstance {
    // CAUTION isRef 必须携带 base：guard 的存在性校验依赖 base 确定查询哪个 entity/relation。
    //  没有 base 时校验退化成"有 .id 字段就通过"，任何伪造的 {id} 都能穿过 guard。
    if (args.isRef && !args.base) {
      throw new Error(`PayloadItem '${args.name}' has isRef: true but no base. Declare base (the referenced Entity/Relation) so the guard can verify the referenced record exists.`);
    }
    // base 只能是 Entity/Relation。Attributive 概念已废弃：payload 级校验用 Interaction 的
    //  conditions 表达（条件回调可以读取 payload 并做任意检查）。
    if (args.base !== undefined && !Entity.is(args.base) && !Relation.is(args.base)) {
      throw new Error(
        `PayloadItem '${args.name}' has an invalid base: expected an Entity or Relation instance. ` +
        `To validate payload contents, use the interaction's conditions instead.`
      );
    }
    // 显式拒绝已废弃的 Attributive 概念参数：静默丢弃会让旧代码以为校验仍然生效。
    const legacyArgs = args as unknown as Record<string, unknown>;
    for (const legacyKey of ['attributives', 'itemRef'] as const) {
      if (legacyArgs[legacyKey] !== undefined) {
        throw new Error(
          `PayloadItem '${args.name}' declares "${legacyKey}", but the Attributive concept has been removed. ` +
          `Express the check as a Condition on the interaction (conditions receives the full event args: user, payload, activityId).`
        );
      }
    }
    const instance = new PayloadItem(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, PayloadItem`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  // CAUTION 必须走统一的 stringifyInstance 管线（以 static public 为单一事实来源）：
  //  base 编码为 uuid:: 引用。
  static stringify(instance: PayloadItemInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: PayloadItemInstance, deep: boolean): PayloadItemInstance {
    const args: PayloadItemCreateArgs = {
      name: instance.name,
      type: instance.type,
    };
    if (instance.base !== undefined) args.base = instance.base;
    if (instance.isRef !== false) args.isRef = instance.isRef;
    if (instance.required !== false) args.required = instance.required;
    if (instance.isCollection !== false) args.isCollection = instance.isCollection;
    
    return this.create(args);
  }
  
    static is(obj: unknown): obj is PayloadItemInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'PayloadItem';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): PayloadItemInstance {
    const data: SerializedData<PayloadItemCreateArgs> = JSON.parse(json);
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
}
