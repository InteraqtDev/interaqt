import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  MonoSystem,
  Property,
  ComputationHandle,
  createClass,
  DataDep,
  PropertyDataContext,
  GlobalDataContext,
  KlassInstance,
  PGLiteDB,
  DataBasedComputation,
  ComputationResult,
  Dictionary,
  Count,
  BoolExp,
  DICTIONARY_RECORD
} from "@";

// 创建一个依赖全局数据的计算
const GlobalDependentComputed = createClass({
  name: 'GlobalDependentComputed',
  public: {
    globalKey: {
      type: 'string',
      required: true
    },
    multiplier: {
      type: 'number',
      required: false
    }
  }
})

// 实现依赖全局数据的计算
class GlobalDependentComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {}
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof GlobalDependentComputed>, 
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
ComputationHandle.Handles.set(GlobalDependentComputed, {
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
          })
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
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
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
    // 创建一个依赖多个全局数据的计算
    const MultiGlobalComputed = createClass({
      name: 'MultiGlobalComputed',
      public: {}
    });
    
    class MultiGlobalComputation implements DataBasedComputation {
      state = {}
      dataDeps: {[key: string]: DataDep} = {}
      
      constructor(
        public controller: Controller, 
        public args: KlassInstance<typeof MultiGlobalComputed>, 
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
    
    ComputationHandle.Handles.set(MultiGlobalComputed, {
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
          computation: MultiGlobalComputed.create({})
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
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
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