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
  
  computeCallback?: (this: Controller, ...args: any[]) => Promise<ComputationResult|any>
  incrementalComputeCallback?: (this: Controller, ...args: any[]) => Promise<ComputationResult|any>
  incrementalPatchComputeCallback?: (this: Controller, ...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>
  createStateCallback?: (this: Controller, ...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
  getDefaultValueCallback?: (this: Controller, ...args: any[]) => any
  asyncReturnCallback?: (this: Controller, ...args: any[]) => Promise<ComputationResult|any>
  
  constructor(public controller: Controller, public args: CustomInstance, public dataContext: DataContext) {
    // 设置 useLastValue
    this.useLastValue = args.useLastValue !== undefined ? args.useLastValue : true;
    
    // 设置自定义的 dataDeps
    if (args.dataDeps) {
      this.dataDeps = args.dataDeps;
    }
    
    // 绑定所有回调函数到 controller 上下文
    if (args.compute) {
      this.computeCallback = args.compute.bind(this.controller);
    }
    if (args.incrementalCompute) {
      this.incrementalComputeCallback = args.incrementalCompute.bind(this.controller);
    }
    if (args.incrementalPatchCompute) {
      this.incrementalPatchComputeCallback = args.incrementalPatchCompute.bind(this.controller);
    }
    if (args.createState) {
      this.createStateCallback = args.createState.bind(this.controller);
    }
    if (args.getDefaultValue) {
      this.getDefaultValueCallback = args.getDefaultValue.bind(this.controller);
    }
    if (args.asyncReturn) {
      this.asyncReturnCallback = args.asyncReturn.bind(this.controller);
    }
    
    // 如果提供了 createState，调用它来初始化 state
    if (this.createStateCallback) {
      this.state = this.createStateCallback.call(this.controller, this.dataContext, this.args);
      // 绑定 state 到 controller
      Object.entries(this.state).forEach(([key, state]) => {
        state.key = key;
        state.controller = this.controller;
      });
    }
  }
  
  createState(...args: any[]) {
    if (this.createStateCallback) {
      const states = this.createStateCallback.call(this.controller, this.dataContext, this.args, ...args);
      // 绑定 state 到 controller
      Object.entries(states).forEach(([key, state]) => {
        state.key = key;
        state.controller = this.controller;
      });
      return states;
    }
    return {};
  }
  
  getDefaultValue(...args: any[]) {
    if (this.getDefaultValueCallback) {
      return this.getDefaultValueCallback.call(this.controller, this.dataContext, this.args, this.state, ...args);
    }
    return undefined;
  }
  
  async compute(...args: any[]): Promise<ComputationResult|any> {
    if (this.computeCallback) {
      // 传递 dataDeps 和 record（对于 property computation）
      const [dataDeps, record] = args;
      return await this.computeCallback.call(this.controller, this.dataContext, this.args, this.state, dataDeps, record);
    }
    return ComputationResult.skip();
  }
  
  async incrementalCompute(...args: any[]): Promise<ComputationResult|any> {
    if (this.incrementalComputeCallback) {
      // 传递 lastValue, mutationEvent 等参数
      const [lastValue, mutationEvent, record, dataDeps] = args;
      return await this.incrementalComputeCallback.call(this.controller, this.dataContext, this.args, this.state, lastValue, mutationEvent, record, dataDeps);
    }
    // 如果没有定义增量计算，回退到全量计算
    return ComputationResult.fullRecompute('No incrementalCompute defined');
  }
  
  async incrementalPatchCompute(...args: any[]): Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined> {
    if (this.incrementalPatchComputeCallback) {
      const [lastValue, mutationEvent, record, dataDeps] = args;
      return await this.incrementalPatchComputeCallback.call(this.controller, this.dataContext, this.args, this.state, lastValue, mutationEvent, record, dataDeps);
    }
    return undefined;
  }
  
  async asyncReturn(...args: any[]): Promise<ComputationResult|any> {
    if (this.asyncReturnCallback) {
      const [asyncResult] = args;
      return await this.asyncReturnCallback.call(this.controller, this.dataContext, this.args, this.state, asyncResult);
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