import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  MonoSystem,
  Property,
  ComputationHandle,
  DataDep,
  PropertyDataContext, PGLiteDB,
  DataBasedComputation, Dictionary, BoolExp,
  DICTIONARY_RECORD
} from "interaqt";

// GlobalDependentComputed as a standard ES6 class
interface GlobalDependentComputedInstance {
  _type: string;
  _options?: { uuid?: string };
  uuid: string;
  globalKey: string;
  multiplier?: number;
}

interface GlobalDependentComputedCreateArgs {
  globalKey: string;
  multiplier?: number;
}

class GlobalDependentComputed implements GlobalDependentComputedInstance {
  public uuid: string;
  public _type = 'GlobalDependentComputed';
  public _options?: { uuid?: string };
  public globalKey: string;
  public multiplier?: number;
  
  constructor(args: GlobalDependentComputedCreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9);
    this.globalKey = args.globalKey;
    this.multiplier = args.multiplier;
  }
  
  static isKlass = true as const;
  static displayName = 'GlobalDependentComputed';
  static instances: GlobalDependentComputedInstance[] = [];
  
  static public = {
    globalKey: {
      type: 'string' as const,
      required: true as const
    },
    multiplier: {
      type: 'number' as const,
      required: false as const
    }
  };
  
  static create(args: GlobalDependentComputedCreateArgs, options?: { uuid?: string }): GlobalDependentComputedInstance {
    const instance = new GlobalDependentComputed(args, options);
    
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(`duplicate uuid in options ${instance.uuid}, GlobalDependentComputed`);
    }
    
    this.instances.push(instance);
    return instance;
  }
  
  static stringify(instance: GlobalDependentComputedInstance): string {
    return JSON.stringify({
      type: 'GlobalDependentComputed',
      options: instance._options,
      uuid: instance.uuid,
      public: { globalKey: instance.globalKey, multiplier: instance.multiplier }
    });
  }
  
  static parse(json: string): GlobalDependentComputedInstance {
    const data = JSON.parse(json);
    return this.create(data.public, data.options);
  }
  
  static clone(instance: GlobalDependentComputedInstance, deep: boolean): GlobalDependentComputedInstance {
    return this.create({ globalKey: instance.globalKey, multiplier: instance.multiplier });
  }
  
  static is(obj: unknown): obj is GlobalDependentComputedInstance {
    return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as any)._type === 'GlobalDependentComputed';
  }
  
  static check(data: unknown): boolean {
    return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string';
  }
}

// 实现依赖全局数据的计算
class GlobalDependentComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: GlobalDependentComputedInstance, 
    public dataContext: PropertyDataContext
  ) {
    // 依赖全局数据
    this.dataDeps = {
      globalData: {
        type: 'global',
        source: Dictionary.create({
          name: this.args.globalKey,
          type: 'number',
          collection: false
        })
      }
    }
  }
  
  async compute(deps: {globalData: any}) {
    const multiplier = this.args.multiplier || 1;
    const globalValue = parseFloat(deps.globalData) || 0;
    return globalValue * multiplier;
  }
}

// 注册计算处理器
ComputationHandle.Handles.set(GlobalDependentComputed as any, {
  property: GlobalDependentComputation
})

describe('Global data dependency', () => {
  test('should trigger computation when global data changes', async () => {
    // 创建实体
    const scoreEntity = Entity.create({
      name: 'Score',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({
          name: 'adjustedScore',
          type: 'number',
          computation: GlobalDependentComputed.create({
            globalKey: 'globalMultiplier',
            multiplier: 2
          }) as any
        })
      ]
    });
    
    const entities = [scoreEntity];
    
    // 创建全局数据字典项
    const dictionary = [
      Dictionary.create({
        name: 'globalMultiplier',
        type: 'number',
        collection: false
      })
    ];
    
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // 设置初始全局值
    await system.storage.set(DICTIONARY_RECORD, 'globalMultiplier', 10);
    
    // 创建一个分数记录
    const score1 = await system.storage.create('Score', {name: 'Score 1'});
    
    // 检查计算值（10 * 2 = 20）
    let scoreRecord = await system.storage.findOne('Score', BoolExp.atom({key: 'id', value: ['=', score1.id]}), undefined, ['*']);
    expect(scoreRecord.adjustedScore).toBe(20);
    
    // 更新全局值
    await system.storage.set(DICTIONARY_RECORD, 'globalMultiplier', 15);
    
    // 检查计算值是否更新（15 * 2 = 30）
    scoreRecord = await system.storage.findOne('Score', BoolExp.atom({key: 'id', value: ['=', score1.id]}), undefined, ['*']);
    expect(scoreRecord.adjustedScore).toBe(30);
    
    // 创建第二个分数记录
    const score2 = await system.storage.create('Score', {name: 'Score 2'});
    
    // 检查新记录的计算值
    let score2Record = await system.storage.findOne('Score', BoolExp.atom({key: 'id', value: ['=', score2.id]}), undefined, ['*']);
    expect(score2Record.adjustedScore).toBe(30);
    
    // 再次更新全局值
    await system.storage.set(DICTIONARY_RECORD, 'globalMultiplier', 20);
    
    // 检查两个记录的计算值是否都更新
    scoreRecord = await system.storage.findOne('Score', BoolExp.atom({key: 'id', value: ['=', score1.id]}), undefined, ['*']);
    score2Record = await system.storage.findOne('Score', BoolExp.atom({key: 'id', value: ['=', score2.id]}), undefined, ['*']);
    expect(scoreRecord.adjustedScore).toBe(40);
    expect(score2Record.adjustedScore).toBe(40);
    
    await system.destroy();
  });
  
  test('should handle multiple global dependencies', async () => {
    // MultiGlobalComputed as a standard ES6 class
    interface MultiGlobalComputedInstance {
      _type: string;
      _options?: { uuid?: string };
      uuid: string;
    }
    
    class MultiGlobalComputed implements MultiGlobalComputedInstance {
      public uuid: string;
      public _type = 'MultiGlobalComputed';
      public _options?: { uuid?: string };
      
      constructor(args: {}, options?: { uuid?: string }) {
        this._options = options;
        this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9);
      }
      
      static isKlass = true as const;
      static displayName = 'MultiGlobalComputed';
      static instances: MultiGlobalComputedInstance[] = [];
      
      static public = {};
      
      static create(args: {}, options?: { uuid?: string }): MultiGlobalComputedInstance {
        const instance = new MultiGlobalComputed(args, options);
        
        const existing = this.instances.find(i => i.uuid === instance.uuid);
        if (existing) {
          throw new Error(`duplicate uuid in options ${instance.uuid}, MultiGlobalComputed`);
        }
        
        this.instances.push(instance);
        return instance;
      }
      
      static stringify(instance: MultiGlobalComputedInstance): string {
        return JSON.stringify({
          type: 'MultiGlobalComputed',
          options: instance._options,
          uuid: instance.uuid,
          public: {}
        });
      }
      
      static parse(json: string): MultiGlobalComputedInstance {
        const data = JSON.parse(json);
        return this.create(data.public || {}, data.options);
      }
      
      static clone(instance: MultiGlobalComputedInstance, deep: boolean): MultiGlobalComputedInstance {
        return this.create({});
      }
      
      static is(obj: unknown): obj is MultiGlobalComputedInstance {
        return obj !== null && typeof obj === 'object' && '_type' in obj && (obj as any)._type === 'MultiGlobalComputed';
      }
      
      static check(data: unknown): boolean {
        return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string';
      }
    }
    
    class MultiGlobalComputation implements DataBasedComputation {
      state = {}
      dataDeps: {[key: string]: DataDep} = {}
      
      constructor(
        public controller: Controller, 
        public args: MultiGlobalComputedInstance, 
        public dataContext: PropertyDataContext
      ) {
        // 依赖多个全局数据
        this.dataDeps = {
          taxRate: {
            type: 'global',
            source: Dictionary.create({
              name: 'taxRate',
              type: 'number',
              collection: false
            })
          },
          discount: {
            type: 'global',
            source: Dictionary.create({
              name: 'discount',
              type: 'number',
              collection: false
            })
          }
        }
      }
      
      async compute(deps: {taxRate: any, discount: any}, context: any) {
        const basePrice = context.price || 0;
        const taxRate = parseFloat(deps.taxRate) || 0;
        const discount = parseFloat(deps.discount) || 0;
        
        // 计算最终价格：基础价格 * (1 - 折扣) * (1 + 税率)
        return Math.round(basePrice * (1 - discount) * (1 + taxRate));
      }
    }
    
    ComputationHandle.Handles.set(MultiGlobalComputed as any, {
      property: MultiGlobalComputation
    });
    
    // 创建产品实体
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'price', type: 'number'}),
        Property.create({
          name: 'finalPrice',
          type: 'number',
          computation: MultiGlobalComputed.create({}) as any
        })
      ]
    });
    
    const entities = [productEntity];
    
    // 创建全局数据字典项
    const dictionary = [
      Dictionary.create({
        name: 'taxRate',
        type: 'number',
        collection: false
      }),
      Dictionary.create({
        name: 'discount',
        type: 'number',
        collection: false
      })
    ];
    
    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // 设置初始全局值
    await system.storage.set(DICTIONARY_RECORD, 'taxRate', 0.1); // 10% 税率
    await system.storage.set(DICTIONARY_RECORD, 'discount', 0.2); // 20% 折扣
    
    // 创建产品
    const product = await system.storage.create('Product', {
      name: 'Product A',
      price: 100
    });
    
    // 检查计算值：100 * (1 - 0.2) * (1 + 0.1) = 100 * 0.8 * 1.1 = 88
    let productRecord = await system.storage.findOne('Product', BoolExp.atom({key: 'id', value: ['=', product.id]}), undefined, ['*']);
    expect(productRecord.finalPrice).toBe(88);
    
    // 更新税率
    await system.storage.set(DICTIONARY_RECORD, 'taxRate', 0.15); // 15% 税率
    
    // 检查计算值：100 * (1 - 0.2) * (1 + 0.15) = 100 * 0.8 * 1.15 = 92
    productRecord = await system.storage.findOne('Product', BoolExp.atom({key: 'id', value: ['=', product.id]}), undefined, ['*']);
    expect(productRecord.finalPrice).toBe(92);
    
    // 更新折扣
    await system.storage.set(DICTIONARY_RECORD, 'discount', 0.3); // 30% 折扣
    
    // 检查计算值：100 * (1 - 0.3) * (1 + 0.15) = 100 * 0.7 * 1.15 = 80.5，四舍五入为 81
    productRecord = await system.storage.findOne('Product', BoolExp.atom({key: 'id', value: ['=', product.id]}), undefined, ['*']);
    expect(productRecord.finalPrice).toBe(81);
    
    await system.destroy();
  });
}); 