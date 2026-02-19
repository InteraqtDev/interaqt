// 初始化文件 - 注册所有重构后的类到 KlassByName 以保持向后兼容

import { KlassByName, registerKlass } from './utils.js';
import { Entity } from './Entity.js';
import { Relation } from './Relation.js';
import { Property } from './Property.js';
// Interaction builtin classes
import { Interaction } from '../builtins/interaction/Interaction.js';
import { Activity } from '../builtins/interaction/Activity.js';
import { Attributive } from '../builtins/interaction/Attributive.js';
import { Condition } from '../builtins/interaction/Condition.js';
import { DataAttributive } from '../builtins/interaction/Data.js';
import { Action } from '../builtins/interaction/Action.js';
import { Gateway } from '../builtins/interaction/Gateway.js';
import { Event } from '../builtins/interaction/Event.js';
import { PayloadItem } from '../builtins/interaction/PayloadItem.js';
import { Payload } from '../builtins/interaction/Payload.js';
import { Conditions } from '../builtins/interaction/Conditions.js';
import { DataAttributives } from '../builtins/interaction/DataAttributives.js';
// Shared classes
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
import { SideEffect } from './SideEffect.js';
import { Dictionary } from './RealDictionary.js';
import { BoolAtomData, BoolExpressionData } from './BoolExp.js';

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