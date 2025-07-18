import { DataContext } from "./Computation.js";
import { Custom, CustomInstance } from "@shared";
import { Controller } from "../Controller.js";
import { 
  ComputationResult,
  ComputationResultPatch,
  DataBasedComputation,
  DataDep,
  RecordBoundState,
  GlobalBoundState
} from "./Computation.js";

// Base class for shared implementation
abstract class BaseCustomComputationHandle implements DataBasedComputation {
  static computationType = Custom
  
  state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>} = {}
  useLastValue: boolean
  dataDeps: {[key: string]: DataDep} = {}
  
  computeCallback?: Function
  incrementalComputeCallback?: Function
  incrementalPatchComputeCallback?: Function
  createStateCallback?: Function
  getDefaultValueCallback?: Function
  asyncReturnCallback?: Function
  
  constructor(public controller: Controller, public args: CustomInstance, public dataContext: DataContext) {
    // 设置 useLastValue
    this.useLastValue = args.useLastValue !== undefined ? args.useLastValue : true;
    
    // 设置自定义的 dataDeps
    if (args.dataDeps) {
      this.dataDeps = args.dataDeps;
    }
    
    // 保存回调函数引用
    if (args.compute) {
      this.computeCallback = args.compute;
    }
    if (args.incrementalCompute) {
      this.incrementalComputeCallback = args.incrementalCompute;
    }
    if (args.incrementalPatchCompute) {
      this.incrementalPatchComputeCallback = args.incrementalPatchCompute;
    }
    if (args.createState) {
      this.createStateCallback = args.createState;
    }
    if (args.getDefaultValue) {
      this.getDefaultValueCallback = args.getDefaultValue;
    }
    if (args.asyncReturn) {
      this.asyncReturnCallback = args.asyncReturn;
    }
    
    // 如果提供了 createState，调用它来初始化 state
    if (this.createStateCallback) {
      this.state = this.createStateCallback.call(this.controller);
      // 绑定 state 到 controller
      Object.entries(this.state).forEach(([key, state]) => {
        state.key = key;
        state.controller = this.controller;
      });
    }
  }
  
  createState() {
    if (this.createStateCallback) {
      const states = this.createStateCallback.call(this.controller);
      // 绑定 state 到 controller
      Object.entries(states).forEach(([key, state]) => {
        (state as any).key = key;
        (state as any).controller = this.controller;
      });
      return states;
    }
    return {};
  }
  
  getDefaultValue() {
    if (this.getDefaultValueCallback) {
      return this.getDefaultValueCallback.call(this.controller);
    }
    return undefined;
  }
  
  async compute(...args: any[]): Promise<ComputationResult|any> {
    if (this.computeCallback) {
      // 传递 dataDeps 和 record（对于 property computation）
      const [dataDeps, record] = args;
      // 创建一个包含 state 的上下文对象
      const context = {
        controller: this.controller,
        state: this.state,
        getState: (key: string) => this.state[key]
      };
      return await this.computeCallback.call(context, dataDeps, record);
    }
    return ComputationResult.skip();
  }
  
  async incrementalCompute(...args: any[]): Promise<ComputationResult|any> {
    if (this.incrementalComputeCallback) {
      // 传递 lastValue, mutationEvent 等参数
      const [lastValue, mutationEvent, record, dataDeps] = args;
      const context = {
        controller: this.controller,
        state: this.state,
        getState: (key: string) => this.state[key]
      };
      return await this.incrementalComputeCallback.call(context, lastValue, mutationEvent, record, dataDeps);
    }
    // 如果没有定义增量计算，回退到全量计算
    return ComputationResult.fullRecompute('No incrementalCompute defined');
  }
  
  async incrementalPatchCompute(...args: any[]): Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined> {
    if (this.incrementalPatchComputeCallback) {
      const [lastValue, mutationEvent, record, dataDeps] = args;
      const context = {
        controller: this.controller,
        state: this.state,
        getState: (key: string) => this.state[key]
      };
      return await this.incrementalPatchComputeCallback.call(context, lastValue, mutationEvent, record, dataDeps);
    }
    return undefined;
  }
  
  async asyncReturn(...args: any[]): Promise<ComputationResult|any> {
    if (this.asyncReturnCallback) {
      const [asyncResult, dataDeps, record] = args;
      const context = {
        controller: this.controller,
        state: this.state,
        getState: (key: string) => this.state[key]
      };
      return await this.asyncReturnCallback.call(context, asyncResult, dataDeps, record);
    }
    return ComputationResult.skip();
  }
}

// Create specific handle classes for each context type
export class GlobalCustomHandle extends BaseCustomComputationHandle {
  static contextType = 'global' as const
}

export class EntityCustomHandle extends BaseCustomComputationHandle {
  static contextType = 'entity' as const
}

export class RelationCustomHandle extends BaseCustomComputationHandle {
  static contextType = 'relation' as const
}

export class PropertyCustomHandle extends BaseCustomComputationHandle {
  static contextType = 'property' as const
}

// Export all handles
export const CustomHandles = [
  GlobalCustomHandle,
  EntityCustomHandle,
  RelationCustomHandle,
  PropertyCustomHandle
] 