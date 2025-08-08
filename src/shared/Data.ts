import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyAttribute } from './utils.js';

// DataAttributive
export interface DataAttributiveInstance extends IInstance {
  content: Function;
  name?: string;
}

export interface DataAttributiveCreateArgs {
  content: Function;
  name?: string;
}

export class DataAttributive implements DataAttributiveInstance {
  public uuid: string;
  public _type = 'DataAttributive';
  public _options?: { uuid?: string };
  public content: Function;
  public name?: string;
  
  constructor(args: DataAttributiveCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.content = args.content;
    this.name = args.name;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'DataAttributive';
  static instances: DataAttributiveInstance[] = [];
  
  static public = {
    content: {
      type: 'function' as const,
      required: true as const,
      collection: false as const
    },
    name: {
      type: 'string' as const
    }
  };
  
  static create(args: DataAttributiveCreateArgs, options?: { uuid?: string }): DataAttributiveInstance {
    const instance = new DataAttributive(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, DataAttributive`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: DataAttributiveInstance): string {
    const args: DataAttributiveCreateArgs = {
      content: stringifyAttribute(instance.content) as Function,
      name: instance.name
    };
    
    const data: SerializedData<DataAttributiveCreateArgs> = {
      type: 'DataAttributive',
      options: instance._options,
      uuid: instance.uuid,
      public: args
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: DataAttributiveInstance, deep: boolean): DataAttributiveInstance {
    const args: DataAttributiveCreateArgs = {
      content: instance.content
    };
    if (instance.name !== undefined) args.name = instance.name;
    
    return this.create(args);
  }
  
  static is(obj: unknown): obj is DataAttributiveInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'DataAttributive';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): DataAttributiveInstance {
    const data: SerializedData<DataAttributiveCreateArgs> = JSON.parse(json);
    const args = data.public;
    
    // 反序列化函数
    if (args.content && typeof args.content === 'string' && (args.content as any).startsWith('func::')) {
      args.content = new Function('return ' + (args.content as any).substring(6))();
    }
    
    return this.create(args, data.options);
  }
}

// QueryItem
export interface QueryItemInstance extends IInstance {
  name: string;
  value: string;
}

export interface QueryItemCreateArgs {
  name: string;
  value: string;
}

export class QueryItem implements QueryItemInstance {
  public uuid: string;
  public _type = 'QueryItem';
  public _options?: { uuid?: string };
  public name: string;
  public value: string;
  
  constructor(args: QueryItemCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.value = args.value;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'QueryItem';
  static instances: QueryItemInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    },
    value: {
      type: 'string' as const,
      required: true as const,
      collection: false as const,
    }
  };
  
  static create(args: QueryItemCreateArgs, options?: { uuid?: string }): QueryItemInstance {
    const instance = new QueryItem(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, QueryItem`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: QueryItemInstance): string {
    const data: SerializedData<QueryItemCreateArgs> = {
      type: 'QueryItem',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        name: instance.name,
        value: instance.value
      }
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: QueryItemInstance, deep: boolean): QueryItemInstance {
    return this.create({
      name: instance.name,
      value: instance.value
    });
  }
  
  static is(obj: unknown): obj is QueryItemInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'QueryItem';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): QueryItemInstance {
    const data: SerializedData<QueryItemCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}

// Query
export interface QueryInstance extends IInstance {
  items: QueryItemInstance[];
}

export interface QueryCreateArgs {
  items: QueryItemInstance[];
}

export class Query implements QueryInstance {
  public uuid: string;
  public _type = 'Query';
  public _options?: { uuid?: string };
  public items: QueryItemInstance[];
  
  constructor(args: QueryCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.items = args.items;
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Query';
  static instances: QueryInstance[] = [];
  
  static public = {
    items: {
      type: 'QueryItem' as const,
      required: true as const,
      collection: true as const,
    }
  };
  
  static create(args: QueryCreateArgs, options?: { uuid?: string }): QueryInstance {
    const instance = new Query(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Query`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: QueryInstance): string {
    const data: SerializedData<QueryCreateArgs> = {
      type: 'Query',
      options: instance._options,
      uuid: instance.uuid,
      public: {
        items: instance.items
      }
    };
    return JSON.stringify(data);
  }
  
  static clone(instance: QueryInstance, deep: boolean): QueryInstance {
    return this.create({
      items: instance.items
    });
  }
  
  static is(obj: unknown): obj is QueryInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Query';
  }
  
    static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): QueryInstance {
    const data: SerializedData<QueryCreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
} 