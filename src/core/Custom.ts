import { IInstance, SerializedData, generateUUID } from './interfaces.js';
import { stringifyInstance, decodeFunctionValues } from './utils.js';
import { DataDep } from './Computation.js';

export type CustomConcurrency = 'serializable' | 'atomic-safe';

export interface CustomInstance extends IInstance {
  name: string;
  dataDeps?: { [key: string]: DataDep };
  incrementalDataDeps?: string[];
  planIncremental?: Function;
  compute?: Function;
  incrementalCompute?: Function;
  incrementalPatchCompute?: Function;
  createState?: Function;
  getInitialValue?: Function;
  /**
   * Runs inside the retryable transaction attempt when async task results are
   * applied. Keep it deterministic and free of irreversible external IO.
   */
  asyncReturn?: Function;
  useLastValue?: boolean;
  /**
   * Defaults to 'serializable'. Use 'atomic-safe' only when the custom
   * computation's incremental path is built from framework atomic primitives or
   * otherwise remains correct under READ COMMITTED retry boundaries.
   */
  concurrency?: CustomConcurrency;
}

export interface CustomCreateArgs {
  name: string;
  dataDeps?: { [key: string]: DataDep };
  incrementalDataDeps?: string[];
  planIncremental?: Function;
  compute?: Function;
  incrementalCompute?: Function;
  incrementalPatchCompute?: Function;
  createState?: Function;
  getInitialValue?: Function;
  asyncReturn?: Function;
  useLastValue?: boolean;
  concurrency?: CustomConcurrency;
}

export class Custom implements CustomInstance {
  public uuid: string;
  public _type = 'Custom';
  public _options?: { uuid?: string };
  public name: string;
  public dataDeps?: { [key: string]: DataDep };
  public incrementalDataDeps?: string[];
  public planIncremental?: Function;
  public compute?: Function;
  public incrementalCompute?: Function;
  public incrementalPatchCompute?: Function;
  public createState?: Function;
  public getInitialValue?: Function;
  public asyncReturn?: Function;
  public useLastValue?: boolean;
  public concurrency?: CustomConcurrency;
  
  constructor(args: CustomCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
    this.name = args.name;
    this.dataDeps = args.dataDeps;
    this.incrementalDataDeps = args.incrementalDataDeps;
    this.planIncremental = args.planIncremental;
    this.compute = args.compute;
    this.incrementalCompute = args.incrementalCompute;
    this.incrementalPatchCompute = args.incrementalPatchCompute;
    this.createState = args.createState;
    this.getInitialValue = args.getInitialValue;
    this.asyncReturn = args.asyncReturn;
    this.useLastValue = args.useLastValue;
    if (args.concurrency !== undefined && args.concurrency !== 'serializable' && args.concurrency !== 'atomic-safe') {
      throw new Error(`Invalid Custom concurrency '${args.concurrency}'. Expected 'serializable' or 'atomic-safe'.`);
    }
    this.concurrency = args.concurrency ?? 'serializable';
  }
  
  // 静态属性和方法
  static isKlass = true as const;
  static displayName = 'Custom';
  static instances: CustomInstance[] = [];
  
  static public = {
    name: {
      type: 'string' as const,
      collection: false as const,
      required: true as const
    },
    dataDeps: {
      type: 'object' as const,
      collection: false as const,
      required: false as const
    },
    incrementalDataDeps: {
      type: 'object' as const,
      collection: false as const,
      required: false as const
    },
    planIncremental: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    compute: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    incrementalCompute: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    incrementalPatchCompute: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    createState: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    getInitialValue: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    asyncReturn: {
      type: 'function' as const,
      collection: false as const,
      required: false as const
    },
    useLastValue: {
      type: 'boolean' as const,
      collection: false as const,
      required: false as const
    },
    concurrency: {
      type: 'string' as const,
      collection: false as const,
      required: false as const
    }
  };
  
  static create(args: CustomCreateArgs, options?: { uuid?: string }): CustomInstance {
    const instance = new Custom(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, Custom`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: CustomInstance): string {
    return stringifyInstance(this, instance);
  }
  
  static clone(instance: CustomInstance, deep: boolean): CustomInstance {
    return this.create({
      name: instance.name,
      dataDeps: instance.dataDeps,
      incrementalDataDeps: instance.incrementalDataDeps,
      planIncremental: instance.planIncremental,
      compute: instance.compute,
      incrementalCompute: instance.incrementalCompute,
      incrementalPatchCompute: instance.incrementalPatchCompute,
      createState: instance.createState,
      getInitialValue: instance.getInitialValue,
      asyncReturn: instance.asyncReturn,
      useLastValue: instance.useLastValue,
      concurrency: instance.concurrency
    });
  }
  
  static is(obj: unknown): obj is CustomInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as IInstance)._type === 'Custom';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as IInstance).uuid === 'string';
  }
  
  static parse(json: string): CustomInstance {
    const data = JSON.parse(json) as SerializedData<CustomCreateArgs>;
    return this.create(decodeFunctionValues(data.public), { ...data.options, uuid: data.uuid });
  }
} 
