// 初始化文件 - 注册所有重构后的类到 KlassByName 以保持向后兼容

import { KlassByName, registerKlass } from './utils.js';
import { Entity } from './Entity.js';
import { Relation } from './Relation.js';
import { Property } from './Property.js';
import { Interaction } from './Interaction.js';
import { Activity } from './Activity.js';
import { Attributive } from './Attributive.js';
import { Condition } from './Condition.js';
import { DataAttributive } from './Data.js';
import { Action } from './Action.js';
import { Gateway } from './Gateway.js';
import { Event } from './Event.js';
import { StateNode } from './StateNode.js';
import { StateTransfer } from './StateTransfer.js';
import { StateMachine } from './StateMachine.js';
import { WeightedSummation } from './WeightedSummation.js';
import { Count } from './Count.js';
import { Summation } from './Summation.js';
import { Average } from './Average.js';
import { Every } from './Every.js';
import { Any } from './Any.js';
import { Transform } from './Transform.js';
import { RealTime } from './RealTime.js';
import { PayloadItem } from './PayloadItem.js';
import { Payload } from './Payload.js';
import { SideEffect } from './SideEffect.js';
import { Dictionary } from './RealDictionary.js';
import { BoolAtomData, BoolExpressionData } from './BoolExp.js';
import { Conditions } from './Conditions.js';
import { DataAttributives } from './DataAttributives.js';

// 注册所有类
const klassesToRegister = [
  Entity,
  Relation,
  Property,
  Interaction,
  Activity,
  Attributive,
  Condition,
  DataAttributive,
  Action,
  Gateway,
  Event,
  StateNode,
  StateTransfer,
  StateMachine,
  WeightedSummation,
  Count,
  Summation,
  Average,
  Every,
  Any,
  Transform,
  RealTime,
  PayloadItem,
  Payload,
  SideEffect,
  Dictionary,
  BoolAtomData,
  BoolExpressionData,
  Conditions,
  DataAttributives
];

// 注册每个类
klassesToRegister.forEach(klass => {
  if (klass && klass.displayName) {
    registerKlass(klass.displayName, klass);
  }
});

// 导出已填充的 KlassByName
export { KlassByName }; 